export interface GridNode {
  gx: number;
  gy: number;
}

/**
 * Navigazione da tastiera in una griglia con buchi: sceglie il nodo più vicino
 * nella direzione (dx, dy), preferendo quelli sulla stessa riga/colonna.
 * Se non c'è nulla in quella direzione resta sul nodo corrente.
 */
export function navigate<T extends GridNode>(nodes: readonly T[], cur: T, dx: number, dy: number): T {
  let best = cur;
  let bestScore = Infinity;
  for (const n of nodes) {
    if (n === cur) continue;
    const ddx = n.gx - cur.gx;
    const ddy = n.gy - cur.gy;
    const along = dx !== 0 ? ddx * dx : ddy * dy;
    if (along <= 0) continue;
    const perp = dx !== 0 ? Math.abs(ddy) : Math.abs(ddx);
    const score = along + perp * 2.5;
    if (score < bestScore) {
      best = n;
      bestScore = score;
    }
  }
  return best;
}
