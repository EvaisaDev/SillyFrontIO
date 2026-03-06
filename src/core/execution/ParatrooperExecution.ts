import { renderTroops } from "../../client/Utils";
import {
  Execution,
  Game,
  MessageType,
  Player,
  TerraNullius,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { BezenhamLine } from "../utilities/Line";
import { AttackExecution } from "./AttackExecution";

export class ParatrooperExecution implements Execution {
  private active = true;
  private mg: Game;
  private plane: Unit | null = null;
  private path: TileRef[] = [];
  private pathIndex = 0;
  private src: TileRef | null = null;
  private target: Player | TerraNullius;

  constructor(
    private player: Player,
    private dst: TileRef,
    private troops: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;

    if (!mg.isValidRef(this.dst)) {
      this.active = false;
      return;
    }

    if (!mg.isLand(this.dst)) {
      this.active = false;
      return;
    }

    this.target = mg.owner(this.dst);
    if (this.target.isPlayer() && this.target === this.player) {
      this.active = false;
      return;
    }

    if (this.target.isPlayer() && !this.player.canAttackPlayer(this.target)) {
      this.active = false;
      return;
    }

    const spawn = this.player.canBuild(UnitType.Paratrooper, this.dst);
    if (spawn === false) {
      this.active = false;
      return;
    }
    this.src = spawn;

    this.troops = Math.min(this.troops, this.player.troops());
    if (this.troops <= 0) {
      this.active = false;
      return;
    }

    this.player.removeTroops(this.troops);

    this.plane = this.player.buildUnit(UnitType.Paratrooper, this.src, {
      targetTile: this.dst,
      troops: this.troops,
    });

    const airport = this.player
      .units(UnitType.Airport)
      .find((a) => a.tile() === this.src);
    if (airport) {
      airport.launch();
    }

    const srcX = mg.x(this.src);
    const srcY = mg.y(this.src);
    const dstX = mg.x(this.dst);
    const dstY = mg.y(this.dst);

    const line = new BezenhamLine({ x: srcX, y: srcY }, { x: dstX, y: dstY });

    this.path = [];
    let point = line.increment();
    while (point !== true) {
      if (
        point.x >= 0 &&
        point.x < mg.width() &&
        point.y >= 0 &&
        point.y < mg.height()
      ) {
        const ref = mg.ref(point.x, point.y);
        if (mg.isValidRef(ref)) {
          this.path.push(ref);
        }
      }
      point = line.increment();
    }
    this.path.push(this.dst);

    if (this.path.length === 0) {
      this.player.addTroops(this.troops);
      this.plane.delete(false);
      this.active = false;
      return;
    }

    if (this.target.isPlayer()) {
      mg.displayIncomingUnit(
        this.plane.id(),
        `Paratroopers incoming from ${this.player.displayName()} (${renderTroops(this.troops)})`,
        MessageType.NAVAL_INVASION_INBOUND,
        this.target.id(),
      );
    }
  }

  tick(ticks: number): void {
    if (!this.active) return;

    if (this.plane === null || !this.plane.isActive()) {
      this.active = false;
      return;
    }

    const speed = this.mg.config().airplaneSpeed();

    for (let i = 0; i < speed; i++) {
      if (this.pathIndex >= this.path.length) {
        this.dropTroops();
        return;
      }

      const tile = this.path[this.pathIndex];
      this.plane.move(tile);
      this.pathIndex++;
    }
  }

  private dropTroops(): void {
    if (this.plane === null) return;

    this.player.conquer(this.dst);

    if (this.target.isPlayer() && this.player.isFriendly(this.target)) {
      this.player.addTroops(this.troops);
    } else {
      this.mg.addExecution(
        new AttackExecution(
          this.troops,
          this.player,
          this.target.id(),
          this.dst,
          false,
        ),
      );
    }

    this.plane.delete(false);
    this.active = false;
  }

  owner(): Player {
    return this.player;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
