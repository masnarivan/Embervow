import { isWall, type GameMap } from '../core/map';
import type { AttackEvent } from './damage';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  /** Secondi di volo rimasti. */
  life: number;
  /** Già passato attraverso il giocatore durante una schivata. */
  dodged: boolean;
  // Solo per i proiettili del giocatore:
  pierce?: boolean;
  explode?: number;
  breakPoise?: boolean;
  lifesteal?: number;
  color?: number;
  backstab?: number;
  poison?: { damage: number; duration: number };
  /** Bersagli già colpiti da un proiettile perforante. */
  hit?: Set<object>;
}

/** Crea i proiettili di un colpo: uno nella direzione del colpo, o un anello di `count`. */
export function spawnProjectiles(ev: AttackEvent): Projectile[] {
  const spec = ev.projectile;
  if (!spec) return [];
  const count = spec.count ?? 1;
  const out: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    const a =
      ev.angle +
      (count <= 1 ? 0 : spec.spread ? (i / (count - 1) - 0.5) * spec.spread : (i * Math.PI * 2) / count);
    out.push({
      x: ev.x + Math.cos(a) * 0.4,
      y: ev.y + Math.sin(a) * 0.4,
      vx: Math.cos(a) * spec.speed,
      vy: Math.sin(a) * spec.speed,
      damage: ev.damage,
      radius: spec.radius ?? 0.15,
      life: ev.range / spec.speed,
      dodged: false,
      pierce: spec.pierce,
      explode: spec.explode,
      breakPoise: ev.breakPoise,
      lifesteal: ev.lifesteal,
      color: spec.color,
      backstab: ev.backstab,
      poison: ev.poison,
    });
  }
  return out;
}

/** Avanza un proiettile; ritorna false se va rimosso (muro o fine gittata). */
export function stepProjectile(p: Projectile, dt: number, map: GameMap): boolean {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  return p.life > 0 && !isWall(map, p.x, p.y);
}

export function projectileHits(p: Projectile, x: number, y: number, r: number): boolean {
  return Math.hypot(p.x - x, p.y - y) <= p.radius + r;
}
