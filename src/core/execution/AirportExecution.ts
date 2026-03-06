import { Execution, Game, Unit } from "../game/Game";

export class AirportExecution implements Execution {
  private active = true;
  private mg: Game;

  constructor(private airport: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.airport.isActive()) {
      this.active = false;
      return;
    }

    if (this.airport.isUnderConstruction()) {
      return;
    }

    const frontTime = this.airport.missileTimerQueue()[0];
    if (frontTime === undefined) {
      return;
    }

    const cooldown =
      this.mg.config().AirportCooldown() - (this.mg.ticks() - frontTime);

    if (cooldown <= 0) {
      this.airport.reloadMissile();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
