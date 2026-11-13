import type Phaser from 'phaser';
import { TILE_H, TILE_W, toScreen } from '../core/iso';
import { shade } from './actors';

// Ambiente degli Inferi: basalto crepato, vene di lava, muri di roccia vulcanica.
// Tutto deterministico (hash sulla posizione del tile), così la mappa è uguale a ogni avvio.

type Gfx = Phaser.GameObjects.Graphics;

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export const BACKGROUND = 0x080405;
const LAVA = 0xff7a1c;
const LAVA_DEEP = 0xb01c08;

/** Pseudo-casuale stabile in [0, 1) per un tile; `n` sceglie un flusso diverso. */
export function hash(x: number, y: number, n = 0): number {
  let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function diamond(g: Gfx, cx: number, cy: number): void {
  g.beginPath();
  g.moveTo(cx, cy - HH);
  g.lineTo(cx + HW, cy);
  g.lineTo(cx, cy + HH);
  g.lineTo(cx - HW, cy);
  g.closePath();
}

/** Un tile di pavimento; ritorna true se contiene una crepa di lava (per farla brillare). */
export function drawFloorTile(g: Gfx, cx: number, cy: number, x: number, y: number, arena: boolean): boolean {
  const r = hash(x, y);
  const base = arena ? 0x3a2220 : 0x2b2526;
  g.fillStyle(shade(base, 0.85 + r * 0.3), 1);
  g.lineStyle(1, 0x140d0d, 1);
  diamond(g, cx, cy);
  g.fillPath();
  g.strokePath();

  const r2 = hash(x, y, 1);
  const lava = !arena && r2 > 0.9;
  if (lava || r2 < 0.22) {
    // Crepa spezzata in due segmenti, dentro il rombo.
    const ax = cx + (hash(x, y, 2) - 0.5) * HW;
    const ay = cy + (hash(x, y, 3) - 0.5) * HH * 0.6;
    const pts = [
      { x: ax - HW * 0.38, y: ay - HH * 0.15 },
      { x: ax, y: ay + (r - 0.5) * HH * 0.5 },
      { x: ax + HW * 0.34, y: ay + HH * 0.2 },
    ];
    if (lava) {
      g.lineStyle(5, LAVA_DEEP, 0.55);
      g.strokePoints(pts);
      g.lineStyle(1.8, LAVA, 1);
      g.strokePoints(pts);
    } else {
      g.lineStyle(1, 0x120b0b, 0.9);
      g.strokePoints(pts);
    }
  } else if (r2 < 0.34) {
    g.fillStyle(0x191213, 1);
    g.fillEllipse(cx + (r - 0.5) * HW * 0.8, cy + (hash(x, y, 4) - 0.5) * HH * 0.6, 5, 2.5);
  }
  return lava;
}

/** Cerchio rituale inciso nel pavimento dell'arena, attorno al punto dato (coordinate di mondo). */
export function drawRitualCircle(g: Gfx, wx: number, wy: number, radius: number): void {
  const ring = (r: number) => {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(toScreen(wx + Math.cos(a) * r, wy + Math.sin(a) * r));
    }
    g.strokePoints(pts);
  };
  g.lineStyle(2, 0x8a1c14, 0.45);
  ring(radius);
  g.lineStyle(1, 0x8a1c14, 0.35);
  ring(radius * 0.86);
  // Stella a cinque punte.
  const star = [];
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 4 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
    star.push(toScreen(wx + Math.cos(a) * radius * 0.86, wy + Math.sin(a) * radius * 0.86));
  }
  g.lineStyle(1.5, 0x8a1c14, 0.35);
  g.strokePoints(star);
}

/** Un blocco di muro: tre facce di roccia vulcanica, giunti tra le pietre, a volte una vena di lava. */
export function drawWallTile(g: Gfx, cx: number, cy: number, x: number, y: number, height: number): void {
  const top = cy - height;
  const r = hash(x, y, 5);
  const tone = 0.88 + r * 0.24;
  const quad = (color: number, alpha: number, pts: number[]) => {
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillPath();
  };
  // Sinistra (in luce), destra (in ombra), sopra.
  quad(shade(0x3d2e2d, tone), 1, [cx - HW, top, cx, top + HH, cx, cy + HH, cx - HW, cy]);
  quad(shade(0x261b1c, tone), 1, [cx + HW, top, cx, top + HH, cx, cy + HH, cx + HW, cy]);
  quad(shade(0x54403c, tone), 1, [cx, top - HH, cx + HW, top, cx, top + HH, cx - HW, top]);

  // Giunti orizzontali e verticali sfalsati, su entrambe le facce.
  g.lineStyle(1, 0x150e0f, 0.8);
  for (let i = 1; i <= 2; i++) {
    const off = (height * i) / 3;
    g.lineBetween(cx - HW, top + off, cx, top + HH + off);
    g.lineBetween(cx + HW, top + off, cx, top + HH + off);
  }
  for (let i = 0; i < 3; i++) {
    const t = i % 2 === 0 ? 0.5 : 0.25 + r * 0.5;
    const y0 = top + (height * i) / 3;
    const y1 = y0 + height / 3;
    g.lineBetween(cx - HW * t, y0 + HH * (1 - t), cx - HW * t, y1 + HH * (1 - t));
    g.lineBetween(cx + HW * t, y0 + HH * (1 - t), cx + HW * t, y1 + HH * (1 - t));
  }

  // Ombra alla base e bordo superiore schiarito dal bagliore.
  quad(0x000000, 0.28, [cx - HW, cy - height * 0.3, cx, cy + HH - height * 0.3, cx, cy + HH, cx - HW, cy]);
  quad(0x000000, 0.28, [cx + HW, cy - height * 0.3, cx, cy + HH - height * 0.3, cx, cy + HH, cx + HW, cy]);
  g.lineStyle(1, 0x8a5a44, 0.55);
  g.lineBetween(cx - HW, top, cx, top + HH);
  g.lineBetween(cx, top + HH, cx + HW, top);

  if (r > 0.86) {
    // Vena di lava che scende sulla faccia in luce.
    const vx = cx - HW * (0.25 + hash(x, y, 6) * 0.5);
    const vy = top + HH * 0.6 + height * 0.15;
    const pts = [
      { x: vx, y: vy },
      { x: vx + 4, y: vy + height * 0.22 },
      { x: vx - 3, y: vy + height * 0.42 },
      { x: vx + 2, y: vy + height * 0.6 },
    ];
    g.lineStyle(4, LAVA_DEEP, 0.5);
    g.strokePoints(pts);
    g.lineStyle(1.5, LAVA, 0.95);
    g.strokePoints(pts);
  }
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
