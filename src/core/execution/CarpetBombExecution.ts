import {
  Execution,
  Game,
  MessageType,
  Player,
  Structures,
  TerraNullius,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { BezenhamLine } from "../utilities/Line";

export class CarpetBombExecution implements Execution {
  private active = true;
  private mg: Game;
  private plane: Unit | null = null;
  private path: TileRef[] = [];
  private pathIndex = 0;
  private src: TileRef | null = null;
  private bombStartIndex = 0;
  private lastBombIndex = -Infinity;
  private target: Player | TerraNullius;

  constructor(
    private player: Player,
    private dst: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;

    if (!mg.isValidRef(this.dst)) {
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

    const spawn = this.player.canBuild(UnitType.CarpetBomber, this.dst);
    if (spawn === false) {
      this.active = false;
      return;
    }
    this.src = spawn;

    this.plane = this.player.buildUnit(UnitType.CarpetBomber, this.src, {
      targetTile: this.dst,
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

    const dx = dstX - srcX;
    const dy = dstY - srcY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const overshoot = mg.config().carpetBombLineLength() / 2;
    const endX = Math.round(dstX + (dx / (dist || 1)) * overshoot);
    const endY = Math.round(dstY + (dy / (dist || 1)) * overshoot);

    const clampedEndX = Math.max(0, Math.min(mg.width() - 1, endX));
    const clampedEndY = Math.max(0, Math.min(mg.height() - 1, endY));

    const line = new BezenhamLine(
      { x: srcX, y: srcY },
      { x: clampedEndX, y: clampedEndY },
    );

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
    if (
      clampedEndX >= 0 &&
      clampedEndX < mg.width() &&
      clampedEndY >= 0 &&
      clampedEndY < mg.height()
    ) {
      const endRef = mg.ref(clampedEndX, clampedEndY);
      if (mg.isValidRef(endRef)) {
        this.path.push(endRef);
      }
    }

    if (this.path.length === 0) {
      this.plane.delete(false);
      this.active = false;
      return;
    }

    const bombLineLength = mg.config().carpetBombLineLength();
    this.bombStartIndex = Math.max(0, this.path.length - bombLineLength);

    if (this.target.isPlayer()) {
      mg.displayIncomingUnit(
        this.plane.id(),
        `Carpet bomb incoming from ${this.player.displayName()}`,
        MessageType.NUKE_INBOUND,
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
        this.plane.delete(false);
        this.active = false;
        return;
      }

      const tile = this.path[this.pathIndex];
      this.plane.move(tile);
      this.pathIndex++;

      if (this.pathIndex >= this.bombStartIndex) {
        const spacing = this.mg.config().carpetBombSpacing();
        if (this.pathIndex - this.lastBombIndex >= spacing) {
          this.dropBomb(tile);
          this.lastBombIndex = this.pathIndex;
        }
      }
    }
  }

  private dropBomb(center: TileRef): void {
    const radius = this.mg.config().carpetBombRadius();
    const radiusSquared = radius * radius;
    const rand = new PseudoRandom(this.mg.ticks() + center);

    const tiles = this.mg.circleSearch(center, radius, (tile, d2) => {
      if (d2 > radiusSquared) return false;
      if (!this.mg.isLand(tile)) return false;
      const owner = this.mg.owner(tile);
      if (owner === this.player) return false;
      if (owner.isPlayer() && this.player.isFriendly(owner)) return false;
      return d2 <= radiusSquared / 4 || rand.chance(2);
    });

    for (const tile of tiles) {
      this.player.conquer(tile);
    }

    for (const unit of this.mg.nearbyUnits(center, radius, Structures.types)) {
      if (
        unit.distSquared <= radiusSquared &&
        unit.unit.owner() !== this.player &&
        !(
          unit.unit.owner().isPlayer() &&
          this.player.isFriendly(unit.unit.owner())
        )
      ) {
        unit.unit.delete(true, this.player);
      }
    }
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
