import type { Vec2 } from './iso';
import { collides, type GameMap } from './map';

/** Un corpo di raggio r può andare dritto da a a b senza toccare muri? */
export function hasClearPath(map: GameMap, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (collides(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r)) return false;
  }
  return true;
}

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
] as const;

/**
 * A* sulla griglia (8 direzioni, niente tagli sugli spigoli dei muri).
 * Restituisce i centri dei tile dal primo passo fino alla destinazione,
 * oppure null se la destinazione non è raggiungibile entro maxNodes espansioni.
 */
export function findPath(
  map: GameMap,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  maxNodes = 1500,
): Vec2[] | null {
  const { w, h, tiles } = map;
  const sx = Math.floor(fromX);
  const sy = Math.floor(fromY);
  const gx = Math.floor(toX);
  const gy = Math.floor(toY);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] === 0;
  if (!free(sx, sy) || !free(gx, gy)) return null;
  const start = sy * w + sx;
  const goal = gy * w + gx;
  if (start === goal) return [{ x: gx + 0.5, y: gy + 0.5 }];

  const g = new Float32Array(w * h).fill(Infinity);
  const from = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  // Euristica "ottile": distanza esatta su griglia a 8 direzioni senza ostacoli.
  const heur = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };

  // Heap binario minimo su f; i doppioni vengono scartati all'estrazione.
  const heapN: number[] = [];
  const heapF: number[] = [];
  const push = (n: number, f: number) => {
    let i = heapN.length;
    heapN.push(n);
    heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapN[i] = heapN[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heapN[i] = n;
    heapF[i] = f;
  };
  const pop = (): number => {
    const top = heapN[0];
    const n = heapN.pop()!;
    const f = heapF.pop()!;
    const len = heapN.length;
    if (len > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= len) break;
        if (c + 1 < len && heapF[c + 1] < heapF[c]) c++;
        if (heapF[c] >= f) break;
        heapN[i] = heapN[c];
        heapF[i] = heapF[c];
        i = c;
      }
      heapN[i] = n;
      heapF[i] = f;
    }
    return top;
  };

  g[start] = 0;
  push(start, heur(sx, sy));
  let expanded = 0;
  while (heapN.length > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === goal) {
      const path: Vec2[] = [];
      for (let n = cur; n !== start; n = from[n]) path.push({ x: (n % w) + 0.5, y: Math.floor(n / w) + 0.5 });
      return path.reverse();
    }
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!free(nx, ny)) continue;
      // In diagonale solo se entrambi i tile adiacenti sono liberi.
      if (dx !== 0 && dy !== 0 && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;
      const n = ny * w + nx;
      if (closed[n]) continue;
      const ng = g[cur] + cost;
      if (ng >= g[n]) continue;
      g[n] = ng;
      from[n] = cur;
      push(n, ng + heur(nx, ny));
    }
  }
  return null;
}
