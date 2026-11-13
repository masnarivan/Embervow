import type { Vec2 } from './iso';
import { FLOOR, WALL, type GameMap } from './map';

export interface Spawn {
  type: string;
  x: number;
  y: number;
}

export interface Level {
  map: GameMap;
  start: Vec2;
  bonfires: Vec2[];
  enemies: Spawn[];
  boss: Vec2 | null;
  chests: { id: string; item: string; x: number; y: number }[];
  /** Scelte morali: id = cifra nella mappa ('1', '2', '3'). */
  choices: { id: string; x: number; y: number }[];
  /** Tile del cancello che si chiude durante lo scontro col boss. */
  gate: { tx: number; ty: number }[];
  /** Tile dell'arena: entrarci risveglia il boss. */
  arena: Set<number>;
}

const ENEMY_CHARS: Record<string, string> = { p: 'predone', b: 'bruto', a: 'arciere' };

/** Converte una mappa ASCII in un livello. Le entità stanno al centro del tile. */
export function parseLevel(rows: readonly string[], chests: Record<string, string>): Level {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  const level: Level = {
    map: { w, h, tiles },
    start: { x: 1.5, y: 1.5 },
    bonfires: [],
    enemies: [],
    boss: null,
    chests: [],
    choices: [],
    gate: [],
    arena: new Set(),
  };
  rows.forEach((row, ty) => {
    if (row.length !== w) throw new Error(`Riga ${ty} lunga ${row.length}, attesa ${w}`);
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx];
      const c = { x: tx + 0.5, y: ty + 0.5 };
      tiles[ty * w + tx] = ch === '#' ? WALL : FLOOR;
      if (ch === 'P') level.start = c;
      else if (ch === 'B') level.bonfires.push(c);
      else if (ch === 'X') level.boss = c;
      else if (ch === 'F') level.gate.push({ tx, ty });
      else if (ENEMY_CHARS[ch]) level.enemies.push({ type: ENEMY_CHARS[ch], ...c });
      else if (chests[ch]) level.chests.push({ id: `${ch}@${tx},${ty}`, item: chests[ch], ...c });
      else if (ch >= '1' && ch <= '9') level.choices.push({ id: ch, ...c });
      if (ch === ':' || ch === 'X') level.arena.add(ty * w + tx);
    }
  });
  return level;
}

export function tileIndex(level: Level, x: number, y: number): number {
  return Math.floor(y) * level.map.w + Math.floor(x);
}

/** Apre o chiude il cancello dell'arena. */
export function setGate(level: Level, closed: boolean): void {
  for (const g of level.gate) level.map.tiles[g.ty * level.map.w + g.tx] = closed ? WALL : FLOOR;
}

/**
 * Il corpo (cerchio di raggio r) è interamente dentro l'arena? Il cancello va
 * chiuso solo allora: chiuderlo mentre il corpo sporge sulla nebbia lo
 * incastrerebbe nel muro appena creato.
 */
export function insideArena(level: Level, x: number, y: number, r: number): boolean {
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    if (!level.arena.has(tileIndex(level, x + dx, y + dy))) return false;
  }
  return true;
}
