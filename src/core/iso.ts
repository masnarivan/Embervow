// Conversione tra coordinate di mondo (griglia, in unità-tile) e schermo (pixel).
// Tutta la simulazione gira in coordinate di mondo; solo il rendering usa lo schermo.

export const TILE_W = 64;
export const TILE_H = 32;

export interface Vec2 {
  x: number;
  y: number;
}

export function toScreen(x: number, y: number): Vec2 {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

export function toWorld(sx: number, sy: number): Vec2 {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Direzione sullo schermo (es. WASD) → direzione normalizzata nel mondo. */
export function screenDirToWorld(dx: number, dy: number): Vec2 {
  const x = dx + dy;
  const y = dy - dx;
  const len = Math.hypot(x, y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

/** Angolo di mondo → direzione normalizzata sullo schermo (per disegnare l'arma). */
export function worldAngleToScreenDir(angle: number): Vec2 {
  const s = toScreen(Math.cos(angle), Math.sin(angle));
  const len = Math.hypot(s.x, s.y) || 1;
  return { x: s.x / len, y: s.y / len };
}
