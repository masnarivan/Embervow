import type { AttackEvent } from '../combat/damage';
import { moveWithCollision, type GameMap } from '../core/map';

/** Tempi e misure degli spettri evocati (secondi, tile). */
export const MINION = {
  radius: 0.24,
  speed: 4.6,
  /** Entro questa distanza dal padrone cerca un nemico da attaccare. */
  seekRange: 7,
  attackRange: 1.15,
  reach: 1.5,
  halfArc: (60 * Math.PI) / 180,
  windup: 0.3,
  active: 0.12,
  recover: 0.7,
  /** Distanza a cui segue il padrone quando non c'è nessuno da colpire. */
  followDistance: 1.6,
};

export interface MinionTarget {
  x: number;
  y: number;
  radius: number;
  dead: boolean;
}

export type MinionState = 'follow' | 'windup' | 'strike' | 'recover';

/**
 * Spettro evocato dal Negromante: dura pochi secondi, insegue il nemico più
 * vicino e lo colpisce. È incorporeo: i nemici non lo vedono e non lo feriscono.
 */
export class Minion {
  readonly radius = MINION.radius;
  facing = 0;
  state: MinionState = 'follow';
  stateTime = 0;

  constructor(
    public x: number,
    public y: number,
    public timeLeft: number,
    /** Danno di ogni colpo, già calcolato all'evocazione. */
    readonly damage: number,
  ) {}

  get expired(): boolean {
    return this.timeLeft <= 0;
  }

  private setState(s: MinionState): void {
    this.state = s;
    this.stateTime = 0;
  }

  update(dt: number, owner: { x: number; y: number }, enemies: readonly MinionTarget[], map: GameMap): AttackEvent | null {
    this.timeLeft -= dt;
    this.stateTime += dt;

    switch (this.state) {
      case 'follow': {
        let target: MinionTarget | null = null;
        let best = Infinity;
        for (const e of enemies) {
          if (e.dead || Math.hypot(e.x - owner.x, e.y - owner.y) > MINION.seekRange) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d < best) {
            best = d;
            target = e;
          }
        }
        if (target) {
          this.facing = Math.atan2(target.y - this.y, target.x - this.x);
          if (best <= MINION.attackRange + target.radius) this.setState('windup');
          else this.step(map, target.x, target.y, MINION.speed * dt);
        } else {
          const d = Math.hypot(owner.x - this.x, owner.y - this.y);
          if (d > MINION.followDistance) {
            this.facing = Math.atan2(owner.y - this.y, owner.x - this.x);
            this.step(map, owner.x, owner.y, Math.min(MINION.speed * dt, d - MINION.followDistance));
          }
        }
        break;
      }
      case 'windup':
        if (this.stateTime >= MINION.windup) {
          this.setState('strike');
          return {
            x: this.x, y: this.y, angle: this.facing, range: MINION.reach, halfArc: MINION.halfArc, damage: this.damage,
          };
        }
        break;
      case 'strike':
        if (this.stateTime >= MINION.active) this.setState('recover');
        break;
      case 'recover':
        if (this.stateTime >= MINION.recover) this.setState('follow');
        break;
    }
    return null;
  }

  private step(map: GameMap, tx: number, ty: number, dist: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    moveWithCollision(map, this, (dx / d) * dist, (dy / d) * dist, this.radius);
  }
}
