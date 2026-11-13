import type { Vec2 } from './iso';

export const FLOOR = 0;
export const WALL = 1;

export interface GameMap {
  w: number;
  h: number;
  tiles: Uint8Array;
}

export function isWall(map: GameMap, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  return map.tiles[ty * map.w + tx] === WALL;
}

/** Un cerchio di raggio r (< 0.5) in (x, y) tocca un muro? */
export function collides(map: GameMap, x: number, y: number, r: number): boolean {
  return (
    isWall(map, x - r, y - r) ||
    isWall(map, x + r, y - r) ||
    isWall(map, x - r, y + r) ||
    isWall(map, x + r, y + r)
  );
}

/** Sposta pos di (dx, dy) scivolando lungo i muri (assi separati). */
export function moveWithCollision(map: GameMap, pos: Vec2, dx: number, dy: number, r: number): void {
  // Sotto-passi per non attraversare i muri a velocità alte (schivata, knockback).
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!collides(map, pos.x + sx, pos.y, r)) pos.x += sx;
    if (!collides(map, pos.x, pos.y + sy, r)) pos.y += sy;
  }
}

/** Mappa di test della Fase 1: arena con muro perimetrale, pilastri e un divisorio. */
export function createTestMap(): GameMap {
  const w = 26;
  const h = 26;
  const tiles = new Uint8Array(w * h);
  const set = (x: number, y: number) => (tiles[y * w + x] = WALL);
  for (let i = 0; i < w; i++) {
    set(i, 0);
    set(i, h - 1);
  }
  for (let j = 0; j < h; j++) {
    set(0, j);
    set(w - 1, j);
  }
  // Pilastri
  for (const [x, y] of [
    [8, 8], [8, 17], [17, 8], [17, 17], [12, 12], [13, 12], [12, 13], [13, 13],
  ]) {
    set(x, y);
  }
  // Divisorio con varco
  for (let x = 4; x < 22; x++) {
    if (x >= 11 && x <= 14) continue;
    set(x, 21);
  }
  return { w, h, tiles };
}

export const BONFIRE_POS: Vec2 = { x: 13, y: 23.5 };
export const PLAYER_SPAWN: Vec2 = { x: 13, y: 22.7 };

export const ENEMY_SPAWNS: { type: string; x: number; y: number }[] = [
  { type: 'predone', x: 10.5, y: 16.5 },
  { type: 'predone', x: 15.5, y: 15.5 },
  { type: 'bruto', x: 13, y: 9.5 },
  { type: 'predone', x: 5.5, y: 6.5 },
  { type: 'predone', x: 20.5, y: 5.5 },
  { type: 'bruto', x: 20.5, y: 13.5 },
];

/** Nessun muro sul segmento tra i due punti (campionato ogni 0,2 tile). */
export function hasLineOfSight(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}
