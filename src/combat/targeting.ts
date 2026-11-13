export interface Targetable {
  x: number;
  y: number;
  dead: boolean;
}

export const LOCK_RANGE = 6.5;
/** Il bersaglio corrente si perde solo oltre questa distanza (isteresi). */
const KEEP_RANGE = LOCK_RANGE * 1.25;
/** Si cambia bersaglio solo se un altro è nettamente più vicino. */
const SWITCH_RATIO = 0.6;

/**
 * Mira automatica: aggancia il nemico vivo più vicino entro LOCK_RANGE.
 * Il bersaglio è "appiccicoso": non salta da un nemico all'altro per piccole
 * differenze di distanza, così la mira resta stabile in mischia.
 */
export function pickTarget<T extends Targetable>(x: number, y: number, candidates: readonly T[], current: T | null): T | null {
  const dist = (t: T) => Math.hypot(t.x - x, t.y - y);

  let nearest: T | null = null;
  let nearestD = LOCK_RANGE;
  for (const c of candidates) {
    if (c.dead) continue;
    const d = dist(c);
    if (d <= nearestD) {
      nearest = c;
      nearestD = d;
    }
  }

  if (current && !current.dead && candidates.includes(current)) {
    const cd = dist(current);
    if (cd <= KEEP_RANGE && (!nearest || nearest === current || nearestD > cd * SWITCH_RATIO)) return current;
  }
  return nearest;
}

/** Il bersaglio è ancora agganciabile (vivo, presente e non troppo lontano)? */
export function canKeep<T extends Targetable>(x: number, y: number, candidates: readonly T[], current: T | null): current is T {
  return (
    !!current && !current.dead && candidates.includes(current) && Math.hypot(current.x - x, current.y - y) <= KEEP_RANGE
  );
}

/**
 * Cambio manuale: passa al prossimo nemico vivo entro LOCK_RANGE, in ordine
 * di distanza, ricominciando dal più vicino dopo l'ultimo.
 */
export function cycleTarget<T extends Targetable>(x: number, y: number, candidates: readonly T[], current: T | null): T | null {
  const dist = (t: T) => Math.hypot(t.x - x, t.y - y);
  const inRange = candidates.filter((c) => !c.dead && dist(c) <= LOCK_RANGE).sort((a, b) => dist(a) - dist(b));
  if (inRange.length === 0) return canKeep(x, y, candidates, current) ? current : null;
  const i = current ? inRange.indexOf(current) : -1;
  return inRange[(i + 1) % inRange.length];
}
