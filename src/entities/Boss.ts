import { computeDamage, type AttackEvent, type Telegraph } from '../combat/damage';
import type { GameMap } from '../core/map';
import type { BossDef, BossMove, BossPhase } from '../data/boss';
import { Enemy, type Target } from './Enemy';

/**
 * Boss a più fasi. Dorme finché la scena non lo sveglia (ingresso nell'arena),
 * sceglie le mosse in base alla distanza, concatena le combo, e a metà vita
 * ruggisce (invulnerabile) e passa alla fase successiva: più rapido, mosse nuove.
 * Non viene mai stordito dai colpi.
 */
export class Boss extends Enemy {
  readonly bossDef: BossDef;
  phaseIndex = 0;
  /** Mossa in corso (wind-up, colpo o recupero). */
  current: BossMove | null = null;
  private hitDone = false;

  constructor(def: BossDef, x: number, y: number, private rng: () => number = Math.random) {
    super(def, x, y);
    this.bossDef = def;
  }

  get phase(): BossPhase {
    return this.bossDef.phases[this.phaseIndex];
  }

  get awake(): boolean {
    return this.state !== 'idle';
  }

  get color(): number {
    return this.phase.color;
  }

  wake(): void {
    if (this.state === 'idle') this.setState('chase');
  }

  /** Torna come all'inizio: dopo la morte del giocatore o un riposo. */
  reset(): void {
    this.x = this.homeX;
    this.y = this.homeY;
    this.hp = this.def.maxHp;
    this.phaseIndex = 0;
    this.current = null;
    this.facing = Math.PI / 2;
    this.setState('idle');
  }

  private windupTime(m: BossMove): number {
    return m.windup * this.phase.windupMult;
  }

  /** Il boss non viene mai stordito: `breakPoise` è ignorato. */
  override takeDamage(amount: number, _fromAngle: number, _breakPoise = false): void {
    if (this.dead || this.state === 'transition' || this.state === 'idle') return;
    this.hp = Math.max(0, this.hp - computeDamage(amount));
    this.hurtFlash = 0.1;
    if (this.hp <= 0) {
      this.current = null;
      this.setState('dead');
      return;
    }
    const next = this.bossDef.phases[this.phaseIndex + 1];
    if (next && this.hp <= this.def.maxHp * next.hpFrac) {
      this.phaseIndex++;
      this.current = null;
      this.setState('transition');
    }
  }

  override telegraph(): Telegraph | null {
    const base = { x: this.x, y: this.y, angle: this.facing };
    if (this.state === 'transition') {
      const t = this.bossDef.transition;
      return { ...base, shape: 'circle', range: t.range, halfArc: Math.PI, progress: this.stateTime / t.duration, active: false };
    }
    const m = this.current;
    if (!m) return null;
    if (this.state === 'windup') {
      return {
        ...base, shape: m.shape, range: m.range, halfArc: m.halfArc,
        progress: Math.min(1, this.stateTime / this.windupTime(m)), active: false,
      };
    }
    if (this.state === 'strike' && !m.projectiles) {
      if (m.dash) return { ...base, shape: 'arc', range: m.dash.hitRange, halfArc: m.dash.halfArc, progress: 1, active: true };
      return { ...base, shape: m.shape, range: m.range, halfArc: m.halfArc, progress: 1, active: true };
    }
    return null;
  }

  /** Mossa scelta a caso (pesata) tra quelle adatte alla distanza, o null. */
  pickMove(dist: number): BossMove | null {
    const options = this.phase.moves
      .map((id) => this.bossDef.moves[id])
      .filter((m) => m.weight > 0 && dist <= m.maxDist && dist >= (m.minDist ?? 0));
    const total = options.reduce((s, m) => s + m.weight, 0);
    if (total <= 0) return null;
    let r = this.rng() * total;
    for (const m of options) {
      r -= m.weight;
      if (r <= 0) return m;
    }
    return options[options.length - 1];
  }

  private startMove(m: BossMove): void {
    this.current = m;
    this.hitDone = false;
    this.setState('windup');
  }

  private eventFor(m: BossMove, range: number, halfArc: number): AttackEvent {
    return {
      x: this.x,
      y: this.y,
      angle: this.facing,
      range,
      halfArc,
      damage: m.damage,
      projectile: m.projectiles ? { speed: m.projectiles.speed, count: m.projectiles.count } : undefined,
    };
  }

  override update(dt: number, target: Target, map: GameMap): AttackEvent | null {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.stateTime += dt;
    if (this.dead || this.state === 'idle') return null;

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const reach = dist - target.radius;
    const speed = this.def.speed * this.phase.speedMult;

    switch (this.state) {
      case 'transition': {
        const t = this.bossDef.transition;
        if (this.stateTime >= t.duration) {
          this.setState('recover');
          this.stateTime = -0.4; // breve pausa extra dopo il ruggito
          return { x: this.x, y: this.y, angle: 0, range: t.range, halfArc: Math.PI, damage: t.damage };
        }
        break;
      }
      case 'chase': {
        if (target.state === 'dead') break;
        this.facing = Math.atan2(dy, dx);
        const m = this.pickMove(reach);
        if (m) this.startMove(m);
        else if (dist > 0.01) this.move(map, (dx / dist) * speed * dt, (dy / dist) * speed * dt);
        break;
      }
      case 'windup': {
        const m = this.current!;
        // Segue il giocatore per gran parte del wind-up, poi si blocca: schiva all'ultimo.
        const track = m.dash ? 0.75 : 0.6;
        if (this.stateTime < this.windupTime(m) * track) this.facing = Math.atan2(dy, dx);
        if (this.stateTime >= this.windupTime(m)) {
          this.setState('strike');
          if (!m.dash) {
            this.hitDone = true;
            return this.eventFor(m, m.range, m.halfArc);
          }
        }
        break;
      }
      case 'strike': {
        const m = this.current!;
        if (m.dash) {
          const v = m.dash.speed * dt;
          this.move(map, Math.cos(this.facing) * v, Math.sin(this.facing) * v);
          // Si ferma appena arriva addosso al giocatore, o a fine scatto.
          const close = Math.hypot(target.x - this.x, target.y - this.y) < m.dash.hitRange * 0.6;
          if (!this.hitDone && (close || this.stateTime >= m.active)) {
            this.hitDone = true;
            this.stateTime = m.active;
            return this.eventFor(m, m.dash.hitRange, m.dash.halfArc);
          }
        } else if (m.lunge) {
          const v = m.lunge * dt;
          this.move(map, Math.cos(this.facing) * v, Math.sin(this.facing) * v);
        }
        if (this.stateTime >= m.active) {
          const next = m.followUp ? this.bossDef.moves[m.followUp] : null;
          if (next) this.startMove(next);
          else this.setState('recover');
        }
        break;
      }
      case 'recover': {
        if (this.stateTime >= (this.current?.recover ?? 0.6)) {
          this.current = null;
          this.setState('chase');
        }
        break;
      }
    }
    return null;
  }
}
