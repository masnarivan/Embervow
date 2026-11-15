/** Un colpo ad arco emesso da un attaccante (coordinate e angoli di mondo). */
export interface AttackEvent {
  x: number;
  y: number;
  angle: number;
  range: number;
  halfArc: number;
  damage: number;
  /** Stordisce anche i nemici che non si lasciano interrompere. */
  breakPoise?: boolean;
  /** Frazione del danno inflitto restituita come vita all'attaccante. */
  lifesteal?: number;
  /** Moltiplicatore del danno se il colpo arriva alle spalle del bersaglio. */
  backstab?: number;
  /** Veleno applicato a chi viene colpito: danno totale distribuito sulla durata. */
  poison?: { damage: number; duration: number };
  /** Se presente, il colpo è un proiettile (o un anello di `count` proiettili) invece di un arco. */
  projectile?: {
    speed: number;
    count?: number;
    /** Con `count`: i proiettili si aprono a ventaglio su quest'angolo invece che ad anello. */
    spread?: number;
    radius?: number;
    /** Attraversa i nemici invece di fermarsi al primo. */
    pierce?: boolean;
    /** Raggio dell'esplosione all'impatto (o a fine corsa). */
    explode?: number;
    color?: number;
  };
}

/** Area di un colpo in preparazione o in corso, per disegnarla a terra. */
export interface Telegraph {
  shape: 'arc' | 'circle' | 'line';
  x: number;
  y: number;
  angle: number;
  range: number;
  halfArc: number;
  /** Avanzamento del wind-up, da 0 a 1. */
  progress: number;
  /** true mentre il colpo è attivo. */
  active: boolean;
}

/** Metà dell'angolo, dietro al bersaglio, da cui un colpo conta come "alle spalle". */
export const BACKSTAB_HALF_ARC = (65 * Math.PI) / 180;

/** Differenza angolare con segno in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Il bersaglio (cerchio di raggio tr) è dentro il settore del colpo? */
export function hitsArc(atk: AttackEvent, tx: number, ty: number, tr: number): boolean {
  const dx = tx - atk.x;
  const dy = ty - atk.y;
  const d = Math.hypot(dx, dy);
  if (d > atk.range + tr) return false;
  if (d <= tr) return true;
  const slack = Math.asin(Math.min(1, tr / d));
  return Math.abs(angleDiff(Math.atan2(dy, dx), atk.angle)) <= atk.halfArc + slack;
}

/** Un colpo che viaggia in direzione `hitAngle` prende alle spalle chi guarda verso `facing`? */
export function isBackstab(hitAngle: number, facing: number): boolean {
  return Math.abs(angleDiff(hitAngle, facing)) <= BACKSTAB_HALF_ARC;
}

/** Danno finale dopo la difesa: riduzione piatta, minimo 1. */
export function computeDamage(base: number, defense = 0): number {
  return Math.max(1, Math.round(base - defense));
}
