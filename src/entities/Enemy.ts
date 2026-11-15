import { computeDamage, type AttackEvent, type Telegraph } from '../combat/damage';
import { hasLineOfSight, moveWithCollision, type GameMap } from '../core/map';
import { findPath, hasClearPath } from '../core/path';
import type { Vec2 } from '../core/iso';
import type { EnemyDef } from '../data/enemies';

/** Ogni quanto un nemico ricalcola il percorso (secondi). */
const REPATH_EVERY = 0.3;

export type EnemyState = 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'stagger' | 'transition' | 'dead';

export interface Target {
  x: number;
  y: number;
  radius: number;
  state: string;
  /** Furtivo: i nemici non lo vedono e smettono di inseguirlo. */
  hidden?: boolean;
}

/** Nemico con macchina a stati: idle → chase → windup → strike → recover. */
export class Enemy {
  x: number;
  y: number;
  readonly radius: number;
  facing = Math.PI / 2;
  hp: number;
  state: EnemyState = 'idle';
  stateTime = 0;
  hurtFlash = 0;
  protected staggerFor = 0;
  protected kx = 0;
  protected ky = 0;
  private path: Vec2[] | null = null;
  private pathIdx = 0;
  private pathAge = 0;

  constructor(
    readonly def: EnemyDef,
    readonly homeX: number,
    readonly homeY: number,
  ) {
    this.x = homeX;
    this.y = homeY;
    this.radius = def.radius;
    this.hp = def.maxHp;
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  get maxHp(): number {
    return this.def.maxHp;
  }

  protected setState(s: EnemyState): void {
    this.state = s;
    this.stateTime = 0;
  }

  takeDamage(amount: number, fromAngle: number, breakPoise = false): void {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - computeDamage(amount));
    this.hurtFlash = 0.12;
    this.kx = Math.cos(fromAngle);
    this.ky = Math.sin(fromAngle);
    if (this.hp <= 0) {
      this.setState('dead');
      return;
    }
    const committed = this.state === 'windup' || this.state === 'strike';
    if (this.def.poise && committed && !breakPoise) return;
    // Un colpo che spezza la guardia stordisce più a lungo.
    this.staggerFor = this.def.staggerTime * (breakPoise ? 2.5 : 1);
    this.setState('stagger');
  }

  /** Danno nel tempo (veleno): toglie vita senza stordire né interrompere. */
  erode(amount: number): void {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.setState('dead');
  }

  /** Area del colpo in arrivo, o null se non sta attaccando. */
  telegraph(): Telegraph | null {
    const def = this.def;
    const shape = def.ranged ? 'line' : 'arc';
    const base = { shape, x: this.x, y: this.y, angle: this.facing, range: def.reach, halfArc: def.halfArc } as const;
    if (this.state === 'windup') return { ...base, progress: Math.min(1, this.stateTime / def.windup), active: false };
    if (this.state === 'strike' && !def.ranged) return { ...base, progress: 1, active: true };
    return null;
  }

  update(dt: number, target: Target, map: GameMap): AttackEvent | null {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.dead) {
      this.stateTime += dt;
      return null;
    }
    this.stateTime += dt;
    const def = this.def;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const targetAlive = target.state !== 'dead' && !target.hidden;

    switch (this.state) {
      case 'idle': {
        // Si accorge del giocatore solo se lo vede: niente aggro attraverso i muri.
        if (targetAlive && dist < def.aggroRange && hasLineOfSight(map, this.x, this.y, target.x, target.y)) {
          this.setState('chase');
          break;
        }
        const hx = this.homeX - this.x;
        const hy = this.homeY - this.y;
        const hd = Math.hypot(hx, hy);
        if (hd > 0.15) this.moveToward(map, this.homeX, this.homeY, def.speed * 0.7 * dt, dt);
        break;
      }
      case 'chase': {
        const fromHome = Math.hypot(this.x - this.homeX, this.y - this.homeY);
        if (!targetAlive || fromHome > def.leashRange) {
          this.setState('idle');
          break;
        }
        this.facing = Math.atan2(dy, dx);
        if (def.ranged && dist < def.ranged.keepDistance) {
          // Troppo vicino: indietreggia, poi tira.
          this.move(map, (-dx / dist) * def.speed * 0.8 * dt, (-dy / dist) * def.speed * 0.8 * dt);
          if (this.stateTime > 1.2 && hasLineOfSight(map, this.x, this.y, target.x, target.y)) this.setState('windup');
        } else if (dist <= def.attackRange + target.radius && hasLineOfSight(map, this.x, this.y, target.x, target.y)) {
          // Niente colpi attraverso i muri: se non lo vede, continua ad aggirare.
          this.setState('windup');
        } else {
          this.moveToward(map, target.x, target.y, def.speed * dt, dt);
        }
        break;
      }
      case 'windup': {
        // Insegue la mira per una parte del wind-up, poi si blocca: il colpo è schivabile.
        const track = def.ranged ? 0.7 : 0.5;
        if (this.stateTime < def.windup * track) this.facing = Math.atan2(dy, dx);
        if (this.stateTime >= def.windup) {
          this.setState('strike');
          return {
            x: this.x,
            y: this.y,
            angle: this.facing,
            range: def.reach,
            halfArc: def.halfArc,
            damage: def.damage,
            projectile: def.ranged ? { speed: def.ranged.speed } : undefined,
          };
        }
        break;
      }
      case 'strike': {
        const v = def.lungeSpeed * dt;
        this.move(map, Math.cos(this.facing) * v, Math.sin(this.facing) * v);
        if (this.stateTime >= def.active) this.setState('recover');
        break;
      }
      case 'recover': {
        if (this.stateTime >= def.recover) this.setState('chase');
        break;
      }
      case 'stagger': {
        const k = 5 * Math.max(0, 1 - this.stateTime / def.staggerTime) * dt;
        this.move(map, this.kx * k, this.ky * k);
        if (this.stateTime >= this.staggerFor) this.setState('chase');
        break;
      }
    }
    return null;
  }

  /**
   * Avanza di `step` verso (tx, ty): dritto se la via è libera, altrimenti
   * lungo un percorso che aggira i muri (ricalcolato ogni REPATH_EVERY).
   */
  protected moveToward(map: GameMap, tx: number, ty: number, step: number, dt: number): void {
    // Un po' di margine: una linea che sfiora uno spigolo non conta come libera.
    const r = Math.min(this.radius + 0.04, 0.49);
    let wx = tx;
    let wy = ty;
    if (hasClearPath(map, this.x, this.y, tx, ty, r)) {
      this.path = null;
    } else {
      this.pathAge -= dt;
      if (!this.path || this.pathAge <= 0) {
        this.path = findPath(map, this.x, this.y, tx, ty);
        this.pathIdx = 0;
        this.pathAge = REPATH_EVERY;
      }
      const path = this.path;
      if (path) {
        // Punta al tratto più lontano raggiungibile in linea retta: taglia gli zig-zag della griglia.
        while (this.pathIdx + 1 < path.length) {
          const next = path[this.pathIdx + 1];
          const cur = path[this.pathIdx];
          const reached = Math.hypot(cur.x - this.x, cur.y - this.y) < 0.1;
          if (!reached && !hasClearPath(map, this.x, this.y, next.x, next.y, r)) break;
          this.pathIdx++;
        }
        wx = path[this.pathIdx].x;
        wy = path[this.pathIdx].y;
      }
      // Senza percorso (bersaglio irraggiungibile) va dritto come può.
    }
    const dx = wx - this.x;
    const dy = wy - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    this.facing = Math.atan2(dy, dx);
    const s = Math.min(step, d);
    this.move(map, (dx / d) * s, (dy / d) * s);
  }

  move(map: GameMap, dx: number, dy: number): void {
    moveWithCollision(map, this, dx, dy, this.radius);
  }
}
