/** Stamina stile Souls: si spende per agire, si rigenera dopo una pausa. */
export class Stamina {
  current: number;
  private delayLeft = 0;

  constructor(
    public max: number,
    public regenPerSec: number,
    public regenDelay: number,
  ) {
    this.current = max;
  }

  canSpend(cost: number): boolean {
    return this.current >= cost;
  }

  /** Spende la stamina se basta; ritorna false (senza spendere) altrimenti. */
  trySpend(cost: number): boolean {
    if (!this.canSpend(cost)) return false;
    this.current -= cost;
    this.delayLeft = this.regenDelay;
    return true;
  }

  update(dt: number): void {
    if (this.delayLeft > 0) {
      const used = Math.min(this.delayLeft, dt);
      this.delayLeft -= used;
      dt -= used;
    }
    if (dt > 0) this.current = Math.min(this.max, this.current + this.regenPerSec * dt);
  }

  refill(): void {
    this.current = this.max;
    this.delayLeft = 0;
  }
}
