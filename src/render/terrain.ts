import type Phaser from 'phaser';
import { TILE_H, TILE_W, toScreen } from '../core/iso';
import type { Level } from '../core/level';
import { WALL } from '../core/map';
import { css, shade } from './sprites';

// Ambiente degli Inferi: basalto crepato, vene di lava, muri di roccia vulcanica,
// dipinti su canvas come personaggi e oggetti di scena.
// Tutto deterministico (hash sulla posizione del tile), così la mappa è uguale a ogni avvio.

type Gfx = Phaser.GameObjects.Graphics;

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export const BACKGROUND = 0x080405;

/** Pseudo-casuale stabile in [0, 1) per un tile; `n` sceglie un flusso diverso. */
export function hash(x: number, y: number, n = 0): number {
  let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Ctx = CanvasRenderingContext2D;
type XY = { x: number; y: number };

/** Generatore pseudo-casuale stabile per un tile e un flusso. */
function rng(x: number, y: number, stream: number): () => number {
  let a = (hash(x, y, stream) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rumore morbido in [0, 1): macchie larghe di tono, continue tra un tile e l'altro. */
function noise(x: number, y: number, n: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(xi, yi, n) + (hash(xi + 1, yi, n) - hash(xi, yi, n)) * sx;
  const bot = hash(xi, yi + 1, n) + (hash(xi + 1, yi + 1, n) - hash(xi, yi + 1, n)) * sx;
  return top + (bot - top) * sy;
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Punto dentro un tile: u e v vanno da -1 a 1 lungo i due assi di mondo. */
const tp = (cx: number, cy: number, u: number, v: number): XY => ({
  x: cx + ((u - v) * HW) / 2,
  y: cy + ((u + v) * HH) / 2,
});

function trace(ctx: Ctx, pts: XY[], close = true): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

function strokeLine(ctx: Ctx, pts: XY[], style: string, width: number): void {
  trace(ctx, pts, false);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Spezzata irregolare che attraversa il tile in una direzione a caso. */
function jagged(R: () => number, cx: number, cy: number, steps: number, reach: number): XY[] {
  const a = R() * Math.PI;
  const du = Math.cos(a);
  const dv = Math.sin(a);
  const off = (R() - 0.5) * 0.7;
  const clamp = (n: number) => Math.max(-0.9, Math.min(0.9, n));
  const pts: XY[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = -reach + (2 * reach * i) / steps;
    const j = off + (R() - 0.5) * 0.34;
    pts.push(tp(cx, cy, clamp(du * s - dv * j), clamp(dv * s + du * j)));
  }
  return pts;
}

/** Vena di lava: crosta scura, alone, rosso profondo, arancio e cuore giallo. */
function lavaVein(ctx: Ctx, pts: XY[], width: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  strokeLine(ctx, pts, 'rgba(8,4,4,0.9)', width * 2.6);
  ctx.shadowColor = 'rgba(255,90,20,0.95)';
  ctx.shadowBlur = width * 4;
  strokeLine(ctx, pts, '#7a1408', width * 1.8);
  ctx.shadowBlur = width * 1.5;
  strokeLine(ctx, pts, '#ee5a1a', width);
  ctx.shadowBlur = 0;
  strokeLine(ctx, pts, '#ffd070', width * 0.4);
  ctx.restore();
}

const isLavaTile = (x: number, y: number, arena: boolean) => !arena && hash(x, y, 1) > 0.9;

/** Primo strato di un tile: fuga scura e lastre di basalto smussate, macchiate e picchiettate. */
function paintSlabs(ctx: Ctx, cx: number, cy: number, x: number, y: number, arena: boolean): void {
  const R = rng(x, y, 21);
  const warm = noise(x / 7 + 40, y / 7, 12);
  const base = arena ? mix(0x3b2321, 0x4c2a22, warm) : mix(0x2a2629, 0x3a2a21, warm);
  const tone = 0.74 + noise(x / 5, y / 5, 11) * 0.42;

  ctx.fillStyle = '#0c0708';
  trace(ctx, [tp(cx, cy, -1.04, -1.04), tp(cx, cy, 1.04, -1.04), tp(cx, cy, 1.04, 1.04), tp(cx, cy, -1.04, 1.04)]);
  ctx.fill();

  // Una lastra grande, due affiancate o quattro piccole.
  const k = R();
  const su = (R() - 0.5) * 0.5;
  const sv = (R() - 0.5) * 0.5;
  let rects: [number, number, number, number][];
  if (arena || k < 0.4) rects = [[-1, -1, 1, 1]];
  else if (k < 0.62) rects = [[-1, -1, su, 1], [su, -1, 1, 1]];
  else if (k < 0.84) rects = [[-1, -1, 1, sv], [-1, sv, 1, 1]];
  else rects = [[-1, -1, su, sv], [su, -1, 1, sv], [-1, sv, su, 1], [su, sv, 1, 1]];

  for (const [u0, v0, u1, v1] of rects) {
    const g = 0.05;
    const j = () => (R() - 0.5) * 0.06;
    const c = [
      tp(cx, cy, u0 + g + j(), v0 + g + j()), tp(cx, cy, u1 - g + j(), v0 + g + j()),
      tp(cx, cy, u1 - g + j(), v1 - g + j()), tp(cx, cy, u0 + g + j(), v1 - g + j()),
    ];
    ctx.fillStyle = css(shade(base, tone * (0.86 + R() * 0.28)));
    trace(ctx, c);
    ctx.fill();

    ctx.save();
    ctx.clip();
    const area = ((u1 - u0) * (v1 - v0)) / 4;
    const inside = () => tp(cx, cy, u0 + R() * (u1 - u0), v0 + R() * (v1 - v0));
    for (let i = 0; i < 3; i++) {
      const p = inside();
      const r = 5 + R() * 11;
      ctx.fillStyle = R() < 0.6 ? 'rgba(0,0,0,0.13)' : 'rgba(255,200,170,0.045)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 4 + area * 16; i++) {
      const p = inside();
      ctx.fillStyle = R() < 0.65 ? `rgba(0,0,0,${0.12 + R() * 0.2})` : `rgba(255,214,190,${0.05 + R() * 0.09})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), R() < 0.3 ? 2 : 1, 1);
    }
    ctx.restore();

    // Smusso: luce sui bordi alti, ombra su quelli bassi.
    ctx.lineCap = 'round';
    strokeLine(ctx, [c[3], c[0], c[1]], 'rgba(255,214,190,0.11)', 1);
    strokeLine(ctx, [c[1], c[2], c[3]], 'rgba(0,0,0,0.5)', 1);
  }

  if (arena && R() < 0.3) {
    // Cornice incisa sulle lastre levigate dell'arena.
    trace(ctx, [tp(cx, cy, -0.7, -0.7), tp(cx, cy, 0.7, -0.7), tp(cx, cy, 0.7, 0.7), tp(cx, cy, -0.7, 0.7)]);
    ctx.strokeStyle = 'rgba(10,4,4,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Secondo strato: ombra ai piedi dei muri, crepe, sassi, ossa, sangue e vene di lava. */
function paintDetails(
  ctx: Ctx, cx: number, cy: number, x: number, y: number, arena: boolean, wallNorth: boolean, wallWest: boolean,
): void {
  const R = rng(x, y, 22);
  const diamondPts = [tp(cx, cy, -1, -1), tp(cx, cy, 1, -1), tp(cx, cy, 1, 1), tp(cx, cy, -1, 1)];
  const occlude = (mx: number, my: number, nx: number, ny: number) => {
    const g = ctx.createLinearGradient(mx, my, mx + nx * 10, my + ny * 10);
    g.addColorStop(0, 'rgba(0,0,0,0.62)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    trace(ctx, diamondPts);
    ctx.fill();
  };
  if (wallNorth) occlude(cx + HW / 2, cy - HH / 2, -1, 2);
  if (wallWest) occlude(cx - HW / 2, cy - HH / 2, 1, 2);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const d = R();
  if (isLavaTile(x, y, arena)) {
    const main = jagged(R, cx, cy, 5, 0.85);
    lavaVein(ctx, main, 2);
    const from = main[2];
    lavaVein(ctx, [from, { x: from.x + (R() - 0.5) * 14, y: from.y + (R() - 0.5) * 7 }, tp(cx, cy, (R() - 0.5) * 1.2, (R() - 0.5) * 1.2)], 1.2);
    return;
  }
  if (d < 0.2) {
    const pts = jagged(R, cx, cy, 4, 0.8);
    strokeLine(ctx, pts.map((p) => ({ x: p.x, y: p.y + 1 })), 'rgba(255,200,170,0.07)', 1);
    strokeLine(ctx, pts, 'rgba(6,3,4,0.9)', 1.3);
    if (R() < 0.5) strokeLine(ctx, [pts[2], tp(cx, cy, (R() - 0.5) * 1.4, (R() - 0.5) * 1.4)], 'rgba(6,3,4,0.8)', 1);
  } else if (arena && d < 0.27) {
    // Sangue vecchio.
    const p = tp(cx, cy, (R() - 0.5) * 0.8, (R() - 0.5) * 0.8);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(${70 + R() * 30},6,6,${0.28 + R() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(p.x + (R() - 0.5) * 16, p.y + (R() - 0.5) * 8, 2 + R() * 7, 1 + R() * 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (!arena && d < 0.3) {
    // Sassi sparsi, ognuno con la sua ombra.
    for (let i = 0; i < 2 + R() * 3; i++) {
      const p = tp(cx, cy, (R() - 0.5) * 1.3, (R() - 0.5) * 1.3);
      const r = 1.2 + R() * 1.8;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(p.x + 1, p.y + 0.8, r * 1.2, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(shade(0x4a4244, 0.8 + R() * 0.5));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,200,0.22)';
      ctx.fillRect(p.x - r * 0.5, p.y - r * 0.5, 1, 1);
    }
  } else if (!arena && d < 0.335) {
    // Un osso abbandonato.
    const p = tp(cx, cy, (R() - 0.5) * 0.9, (R() - 0.5) * 0.9);
    const a = R() * Math.PI;
    const q = { x: p.x + Math.cos(a) * 8, y: p.y + Math.sin(a) * 4 };
    strokeLine(ctx, [{ x: p.x + 1, y: p.y + 1.2 }, { x: q.x + 1, y: q.y + 1.2 }], 'rgba(0,0,0,0.5)', 2.4);
    strokeLine(ctx, [p, q], '#9c917c', 1.8);
    ctx.fillStyle = '#b4a890';
    for (const e of [p, q]) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Cerchio rituale inciso nell'arena: solchi scuri con il fondo che arde, pentacolo e rune. */
function paintRitualCircle(ctx: Ctx, wx: number, wy: number, radius: number): void {
  const c = toScreen(wx, wy);
  const r = radius * HW * Math.SQRT2;
  const R = rng(7, 7, 23);
  ctx.save();
  // Spazio schiacciato: qui dentro un cerchio di mondo è un cerchio vero.
  ctx.translate(c.x, c.y);
  ctx.scale(1, 0.5);
  const tint = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.1);
  tint.addColorStop(0, 'rgba(170,24,14,0.2)');
  tint.addColorStop(1, 'rgba(170,24,14,0)');
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
  ctx.fill();

  const inner = r * 0.86;
  const path = new Path2D();
  const ring = (rr: number) => {
    path.moveTo(rr, 0);
    path.arc(0, 0, rr, 0, Math.PI * 2);
  };
  ring(r);
  ring(inner);
  ring(r * 0.3);
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
    const p = { x: Math.cos(a) * inner, y: Math.sin(a) * inner };
    if (i === 0) path.moveTo(p.x, p.y);
    else path.lineTo(p.x, p.y);
  }
  // Rune nella fascia tra i due anelli.
  const mid = (r + inner) / 2;
  const half = (r - inner) / 2 - 5;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 0.16;
    const ax = { x: Math.cos(a), y: Math.sin(a) };
    const at = (along: number, across: number) => ({
      x: ax.x * (mid + across * half) - ax.y * along * 7,
      y: ax.y * (mid + across * half) + ax.x * along * 7,
    });
    let p = at((R() - 0.5) * 2, -1);
    path.moveTo(p.x, p.y);
    for (let k = 0; k < 3; k++) {
      p = at((R() - 0.5) * 2, k === 2 ? 1 : (R() - 0.5) * 2);
      path.lineTo(p.x, p.y);
    }
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(6,2,2,0.85)';
  ctx.lineWidth = 5;
  ctx.stroke(path);
  ctx.shadowColor = 'rgba(255,60,24,0.9)';
  ctx.shadowBlur = 7;
  ctx.strokeStyle = 'rgba(200,44,26,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,150,80,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke(path);
  ctx.restore();
}

/** Lato in pixel di ogni pezzo in cui è diviso il pavimento (un'unica texture sarebbe troppo grande). */
const FLOOR_CHUNK = 1024;

/**
 * Dipinge il pavimento del livello su canvas e lo aggiunge alla scena, a pezzi.
 * Ritorna i tile con una vena di lava, per farli brillare.
 */
export function buildFloor(scene: Phaser.Scene, level: Level): { x: number; y: number; seed: number }[] {
  const { w, h, tiles } = level.map;
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === WALL;
  const floor: { x: number; y: number; cx: number; cy: number; arena: boolean }[] = [];
  const lava: { x: number; y: number; seed: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isWall(x, y)) continue;
      const c = toScreen(x + 0.5, y + 0.5);
      const arena = level.arena.has(y * w + x);
      floor.push({ x, y, cx: c.x, cy: c.y, arena });
      if (isLavaTile(x, y, arena)) lava.push({ x: c.x, y: c.y, seed: hash(x, y, 7) * 6.28 });
    }
  }

  const left = -h * HW;
  const cols = Math.ceil(((w + h) * HW) / FLOOR_CHUNK);
  const rows = Math.ceil(((w + h) * HH) / FLOOR_CHUNK);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const ox = left + i * FLOOR_CHUNK;
      const oy = j * FLOOR_CHUNK;
      // Un margine, così aloni e bordi dei tile a cavallo non vengono tagliati.
      const mine = floor.filter(
        (t) => t.cx > ox - HW - 16 && t.cx < ox + FLOOR_CHUNK + HW + 16 && t.cy > oy - HH - 16 && t.cy < oy + FLOOR_CHUNK + HH + 16,
      );
      if (mine.length === 0) continue;
      const key = `floor:${i}:${j}`;
      if (!scene.textures.exists(key)) {
        const tex = scene.textures.createCanvas(key, FLOOR_CHUNK, FLOOR_CHUNK)!;
        const ctx = tex.getContext();
        ctx.translate(-ox, -oy);
        for (const t of mine) paintSlabs(ctx, t.cx, t.cy, t.x, t.y, t.arena);
        for (const t of mine) paintDetails(ctx, t.cx, t.cy, t.x, t.y, t.arena, isWall(t.x, t.y - 1), isWall(t.x - 1, t.y));
        if (level.boss) paintRitualCircle(ctx, level.boss.x, level.boss.y, 4.2);
        tex.refresh();
      }
      scene.add.image(ox, oy, key).setOrigin(0).setDepth(-1);
    }
  }
  return lava;
}

// ---------- Muri ----------

export const WALL_VARIANTS = 24;
const WALL_RES = 2;
const WALL_PAD = 8;

/** Un blocco di muro: corsi di pietra vulcanica sulle due facce, lastra di copertura in cima. */
function paintWall(ctx: Ctx, variant: number, height: number): void {
  const R = rng(variant, 91, 24);
  const top = -height;
  const rows = 4;

  const face = (lit: boolean) => {
    ctx.save();
    // Spazio della faccia: u da 0 (spigolo esterno) a 1 (spigolo centrale), t da 0 (cima) a 1 (base).
    if (lit) ctx.transform(HW, HH, 0, height, -HW, top);
    else ctx.transform(-HW, HH, 0, height, HW, top);
    const px = 1 / HW;
    const py = 1 / height;
    const base = lit ? 0x4b3936 : 0x2a1e20;
    // Un filo oltre lo spigolo esterno, per non lasciare fessure tra blocchi vicini.
    ctx.fillStyle = '#0e0809';
    ctx.fillRect(-px * 0.7, 0, 1 + px * 0.7, 1);
    for (let i = 0; i < rows; i++) {
      const t0 = i / rows;
      const th = 1 / rows;
      // Corsi sfalsati: i mezzi blocchi ai bordi si uniscono a quelli del muro accanto.
      const cuts = i % 2 === 0 ? [0, 0.5 + (R() - 0.5) * 0.12, 1] : [0, 0.25 + (R() - 0.5) * 0.08, 0.75 + (R() - 0.5) * 0.08, 1];
      for (let b = 0; b + 1 < cuts.length; b++) {
        const shared = i % 2 === 1 && (b === 0 || b === cuts.length - 2);
        const u0 = cuts[b] + (b === 0 && i % 2 === 1 ? -px * 0.7 : px * 0.5);
        const u1 = cuts[b + 1] - (b === cuts.length - 2 && i % 2 === 1 ? 0 : px * 0.5);
        const bw = u1 - u0;
        ctx.fillStyle = css(shade(base, shared ? 0.97 : 0.84 + R() * 0.3));
        ctx.fillRect(u0, t0 + py * 0.5, bw, th - py);
        ctx.fillStyle = lit ? 'rgba(255,206,170,0.17)' : 'rgba(255,190,160,0.07)';
        ctx.fillRect(u0, t0 + py * 0.5, bw, py);
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(u0, t0 + th - py * 1.5, bw, py);
        if (shared) continue;
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = R() < 0.6 ? `rgba(0,0,0,${0.12 + R() * 0.18})` : `rgba(255,214,190,${0.05 + R() * 0.08})`;
          ctx.fillRect(u0 + R() * (bw - px), t0 + py * 1.5 + R() * (th - py * 4), px * (0.6 + R()), py * 0.6);
        }
        if (R() < 0.3) {
          // Spigolo scheggiato.
          ctx.fillStyle = 'rgba(8,4,5,0.75)';
          ctx.fillRect(R() < 0.5 ? u0 : u1 - px * 2.5, t0 + py * 0.5, px * 2.5, py * 2);
        }
      }
    }
    // Calore che lambisce la cima, buio che si raccoglie alla base.
    const g = ctx.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, lit ? 'rgba(255,150,90,0.12)' : 'rgba(255,120,70,0.05)');
    g.addColorStop(0.35, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(-px * 0.7, 0, 1 + px * 0.7, 1);
    ctx.restore();
  };
  face(true);
  face(false);

  // Lastra di copertura.
  ctx.save();
  ctx.transform(HW, HH, -HW, HH, 0, top - HH);
  const px = 1 / HW;
  ctx.fillStyle = '#1c1314';
  ctx.fillRect(-px * 0.7, -px * 0.7, 1 + px * 1.4, 1 + px * 1.4);
  ctx.fillStyle = css(shade(0x55413d, 0.94 + R() * 0.1));
  ctx.fillRect(px, px, 1 - px * 2, 1 - px * 2);
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = R() < 0.6 ? 'rgba(0,0,0,0.12)' : 'rgba(255,200,170,0.05)';
    ctx.beginPath();
    ctx.arc(0.15 + R() * 0.7, 0.15 + R() * 0.7, 0.08 + R() * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let k = 0; k < 26; k++) {
    ctx.fillStyle = R() < 0.6 ? `rgba(0,0,0,${0.12 + R() * 0.2})` : `rgba(255,214,190,${0.06 + R() * 0.1})`;
    ctx.fillRect(px * 2 + R() * (1 - px * 5), px * 2 + R() * (1 - px * 5), px * (0.7 + R()), px * 0.7);
  }
  // Bordi davanti schiariti dal bagliore, bordi dietro in ombra.
  ctx.fillStyle = 'rgba(255,170,120,0.3)';
  ctx.fillRect(px, 1 - px * 2.2, 1 - px * 2, px * 1.2);
  ctx.fillRect(1 - px * 2.2, px, px * 1.2, 1 - px * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(px, px, 1 - px * 2, px);
  ctx.fillRect(px, px, px, 1 - px * 2);
  ctx.restore();

  const L = (u: number, t: number): XY => ({ x: -HW + u * HW, y: top + u * HH + t * height });
  const Rf = (u: number, t: number): XY => ({ x: HW - u * HW, y: top + u * HH + t * height });
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (variant === 7 || variant === 15) {
    // Vena di lava che scende sulla faccia in luce e gocciola.
    const u = 0.3 + R() * 0.4;
    const pts = [L(u, 0.1), L(u + 0.08, 0.3), L(u - 0.06, 0.52), L(u + 0.05, 0.74), L(u, 0.9)];
    lavaVein(ctx, pts, 1.5);
    lavaVein(ctx, [pts[2], L(u - 0.2, 0.66)], 0.9);
  } else if (variant % 6 === 1) {
    // Crepa che attraversa i corsi.
    const f = variant % 12 === 1 ? L : Rf;
    const u = 0.3 + R() * 0.4;
    const pts = [f(u, 0.04), f(u + 0.07, 0.24), f(u - 0.05, 0.46), f(u + 0.03, 0.7)];
    strokeLine(ctx, pts.map((p) => ({ x: p.x + 0.7, y: p.y })), 'rgba(255,200,170,0.1)', 0.6);
    strokeLine(ctx, pts, 'rgba(5,2,3,0.9)', 1.1);
  } else if (variant === 3) {
    // Un teschio murato in una nicchia.
    const p = L(0.5, 0.42);
    ctx.fillStyle = '#070405';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 6.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(p.x - 1.5, p.y - 3, 0.5, p.x, p.y - 1, 6);
    g.addColorStop(0, '#cfc4a6');
    g.addColorStop(1, '#5e5546');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 1.2, 4.3, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(p.x - 2.4, p.y + 2, 4.8, 2.6);
    ctx.fillStyle = '#0a0506';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(p.x + s * 1.8, p.y - 0.8, 1.2, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(p.x - 0.4, p.y + 1, 0.8, 1.2);
    for (let i = -1; i <= 1; i++) ctx.fillRect(p.x + i * 1.5 - 0.2, p.y + 3, 0.4, 1.6);
  }
}

export interface WallFrame {
  key: string;
  displayScale: number;
  originY: number;
}

/** Texture di una variante di muro: dipinta al primo uso, poi riusata. Il punto d'origine è il centro del tile. */
export function wallFrame(scene: Phaser.Scene, variant: number, height: number): WallFrame {
  const key = `wall:${variant}:${height}`;
  const total = height + TILE_H + WALL_PAD * 2;
  const originY = (WALL_PAD + HH + height) / total;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, (TILE_W + WALL_PAD * 2) * WALL_RES, total * WALL_RES)!;
    const ctx = tex.getContext();
    ctx.setTransform(WALL_RES, 0, 0, WALL_RES, (HW + WALL_PAD) * WALL_RES, (WALL_PAD + HH + height) * WALL_RES);
    paintWall(ctx, variant, height);
    tex.refresh();
  }
  return { key, displayScale: 1 / WALL_RES, originY };
}

/** Fiamma a goccia, a strati: rosso scuro, arancio, giallo. `t` in millisecondi per il tremolio. */
export function drawFlame(g: Gfx, x: number, y: number, size: number, t: number, seed = 0): void {
  const layers: [number, number, number][] = [
    [0xb8240c, 1, 0.9],
    [0xf06a1c, 0.72, 1],
    [0xffd24a, 0.42, 1],
  ];
  layers.forEach(([color, s, alpha], i) => {
    const w = size * 0.42 * s;
    const h = size * s * (1 + 0.12 * Math.sin(t / (70 + i * 23) + seed + i));
    const sway = Math.sin(t / (110 + i * 31) + seed * 2) * size * 0.1;
    g.fillStyle(color, alpha);
    g.fillEllipse(x, y - w * 0.5, w * 2, w * 1.3);
    g.fillTriangle(x - w, y - w * 0.6, x + w, y - w * 0.6, x + sway, y - h);
  });
}
