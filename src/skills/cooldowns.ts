/** Tiene traccia dei cooldown residui per id di skill. */
export class Cooldowns {
  private left = new Map<string, number>();

  start(id: string, seconds: number): void {
    this.left.set(id, seconds);
  }

  remaining(id: string): number {
    return this.left.get(id) ?? 0;
  }

  ready(id: string): boolean {
    return this.remaining(id) <= 0;
  }

  update(dt: number): void {
    for (const [id, t] of this.left) {
      if (t - dt <= 0) this.left.delete(id);
      else this.left.set(id, t - dt);
    }
  }

  clear(): void {
    this.left.clear();
  }
}
