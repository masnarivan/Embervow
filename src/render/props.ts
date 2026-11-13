import type Phaser from 'phaser';
import { ball, css, glowDot, limb, poly, shade, tone } from './sprites';

// Sprite degli oggetti di scena (falò, forziere, altare, palla di fuoco),
// dipinti su canvas con lo stesso stile dei personaggi e poi riusati.

type Ctx = CanvasRenderingContext2D;

export type PropName =
  | 'bonfire' | 'chest_closed' | 'chest_open'
  | 'altar' | 'altar_light' | 'altar_dark'
  | 'fireball' | 'shackles' | 'dropped_blade';

const HALF_W = 44;
const UP = 70;
const DOWN = 22;
const RES = 2;
const OUT = '#130a0a';
const GOLD = 0xd8a848;

/** Fotogrammi di animazione per oggetto (1 = fermo). */
export const PROP_FRAMES: Record<PropName, number> = {
  bonfire: 8, chest_closed: 1, chest_open: 1, altar: 1, altar_light: 1, altar_dark: 1,
  fireball: 4, shackles: 1, dropped_blade: 1,
};

function shadow(ctx: Ctx, rx: number, y = 1): void {
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(0, y);
  ctx.scale(1, 0.5);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Parallelepipedo isometrico appoggiato in (x, y): `a` e `b` sono le mezze
 * lunghezze lungo i due assi a terra, `h` l'altezza. Faccia sinistra in luce.
 */
function isoBox(ctx: Ctx, x: number, y: number, a: number, b: number, h: number, color: number): {
  left: (u: number, t: number) => { x: number; y: number };
  right: (u: number, t: number) => { x: number; y: number };
} {
  const c = (su: number, sv: number, z: number) => ({ x: x + su * a - sv * b, y: y + (su * a + sv * b) / 2 - z });
  poly(ctx, [c(-1, 1, 0), c(1, 1, 0), c(1, 1, h), c(-1, 1, h)], css(color));
  poly(ctx, [c(1, 1, 0), c(1, -1, 0), c(1, -1, h), c(1, 1, h)], css(shade(color, 0.6)));
  poly(ctx, [c(-1, 1, h), c(1, 1, h), c(1, -1, h), c(-1, -1, h)], css(shade(color, 1.3)));
  return {
    // Punto sulla faccia sinistra / destra: u da -1 a 1 lungo la faccia, t da 0 (base) a 1 (cima).
    left: (u, t) => c(u, 1, h * t),
    right: (u, t) => c(1, -u, h * t),
  };
}

function line(ctx: Ctx, a: { x: number; y: number }, b: { x: number; y: number }, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Lingua di fuoco a goccia con sfumatura dal rosso al bianco. */
function flame(ctx: Ctx, x: number, y: number, w: number, h: number, sway: number): void {
  const g = ctx.createLinearGradient(0, y, 0, y - h);
  g.addColorStop(0, 'rgba(255,244,200,1)');
  g.addColorStop(0.25, 'rgba(255,196,64,1)');
  g.addColorStop(0.6, 'rgba(240,96,24,0.95)');
  g.addColorStop(1, 'rgba(160,24,8,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + sway, y - h);
  ctx.bezierCurveTo(x + w * 1.3, y - h * 0.45, x + w, y + 1, x, y + 1);
  ctx.bezierCurveTo(x - w, y + 1, x - w * 1.3, y - h * 0.45, x + sway, y - h);
  ctx.fill();
}

function paintBonfire(ctx: Ctx, frame: number): void {
  const t = (frame / PROP_FRAMES.bonfire) * Math.PI * 2;
  shadow(ctx, 26);
  const stones: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    stones.push({ x: Math.cos(a) * 17, y: Math.sin(a) * 8.5, r: 4 + ((i * 7) % 3) * 0.7 });
  }
  const stone = (s: { x: number; y: number; r: number }) => ball(ctx, { x: s.x, y: s.y - s.r * 0.5, d: 0 }, s.r, 0x57504e);
  stones.filter((s) => s.y < 0).forEach(stone);

  // Letto di braci e ceppi carbonizzati.
  const em = ctx.createRadialGradient(0, 0, 1, 0, 0, 13);
  em.addColorStop(0, 'rgba(255,170,60,1)');
  em.addColorStop(0.6, 'rgba(190,50,14,0.95)');
  em.addColorStop(1, 'rgba(60,10,6,0.9)');
  ctx.save();
  ctx.scale(1, 0.5);
  ctx.fillStyle = em;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  limb(ctx, { x: -11, y: 1 }, { x: 9, y: -6 }, 2.3, 2, 0x2c1c16);
  limb(ctx, { x: 11, y: 2 }, { x: -8, y: -5 }, 2.3, 2, 0x33211a);

  // La spada conficcata tra le braci.
  const tip = { x: 1, y: -2 };
  const hilt = { x: 5, y: -40 };
  const n = { x: 1.7, y: 0.2 };
  const grad = ctx.createLinearGradient(tip.x - 2, 0, tip.x + 4, 0);
  grad.addColorStop(0, css(0x6c7280));
  grad.addColorStop(0.5, css(0xdfe3ee));
  grad.addColorStop(1, css(0x8e97aa));
  poly(ctx, [
    { x: tip.x, y: tip.y }, { x: hilt.x - n.x - 0.6, y: hilt.y + 9 }, { x: hilt.x - n.x, y: hilt.y + 6 },
    { x: hilt.x + n.x, y: hilt.y + 6 }, { x: hilt.x + n.x - 0.4, y: hilt.y + 9 },
  ], grad);
  limb(ctx, { x: hilt.x - 5.5, y: hilt.y + 5.4 }, { x: hilt.x + 5.5, y: hilt.y + 6.6 }, 1.3, 1.3, GOLD);
  limb(ctx, { x: hilt.x, y: hilt.y + 5 }, hilt, 1.1, 1.1, 0x4a3324);
  tone(ctx, hilt.x, hilt.y - 0.5, 1.7, GOLD);

  // Fiamme: tre lingue che ondeggiano, con alone.
  ctx.save();
  ctx.shadowColor = 'rgba(255,120,30,0.9)';
  ctx.shadowBlur = 14;
  flame(ctx, -6, -1, 5, 20 + 3 * Math.sin(t * 2 + 1), 2 * Math.sin(t + 2));
  flame(ctx, 7, 0, 4.5, 17 + 3 * Math.sin(t * 2 + 3), 2 * Math.sin(t + 4));
  flame(ctx, 0, 1, 7.5, 31 + 4 * Math.sin(t * 2), 3 * Math.sin(t));
  ctx.restore();
  // Scintille.
  for (let i = 0; i < 4; i++) {
    const k = (frame / PROP_FRAMES.bonfire + i / 4) % 1;
    glowDot(ctx, { x: Math.sin(i * 2.4 + k * 3) * 8, y: -18 - k * 34, d: 0 }, 0.9 * (1 - k) + 0.2, 0xffa040);
  }

  stones.filter((s) => s.y >= 0).forEach(stone);
}

function paintChest(ctx: Ctx, open: boolean): void {
  shadow(ctx, 24, 3);
  const wood = 0x6e4426;
  const iron = '#2b2a32';
  if (open) {
    // Coperchio ribaltato all'indietro.
    poly(ctx, [{ x: -6, y: -22 }, { x: 20, y: -9 }, { x: 22, y: -24 }, { x: -4, y: -37 }], css(shade(wood, 0.7)));
    line(ctx, { x: 1, y: -33 }, { x: -1, y: -19 }, iron, 2.2);
    line(ctx, { x: 15, y: -26.5 }, { x: 13, y: -12 }, iron, 2.2);
  }
  const body = isoBox(ctx, 0, 3, 11, 7.5, 11, wood);
  for (const u of [-0.6, 0.6]) {
    line(ctx, body.left(u, 0), body.left(u, 1), iron, 2.4);
    line(ctx, body.right(u * 0.6, 0), body.right(u * 0.6, 1), iron, 2.2);
  }
  line(ctx, body.left(-1, 0.5), body.left(1, 0.5), 'rgba(30,16,8,0.6)', 0.8);
  if (open) {
    // L'interno buio, con il luccichio di ciò che resta.
    poly(ctx, [{ x: -15, y: -8.5 }, { x: 2, y: 0 }, { x: 15, y: -6.5 }, { x: -2, y: -15 }], '#0c0606', 1.4);
    glowDot(ctx, { x: -3, y: -8, d: 0 }, 1, 0xffd060);
    glowDot(ctx, { x: 4, y: -7, d: 0 }, 0.7, 0xffd060);
    return;
  }
  const lid = isoBox(ctx, 0, -8, 12, 8.5, 5.5, shade(wood, 1.15));
  for (const u of [-0.6, 0.6]) line(ctx, lid.left(u, 0), lid.left(u, 1), iron, 2.4);
  line(ctx, lid.left(-1, 0), lid.left(1, 0), css(GOLD), 1.2);
  line(ctx, lid.right(-1, 0), lid.right(1, 0), css(shade(GOLD, 0.7)), 1.2);
  // Serratura.
  const lock = body.left(0, 0.95);
  ball(ctx, { ...lock, d: 0 }, 2.6, GOLD);
  ctx.fillStyle = '#1a1008';
  ctx.fillRect(lock.x - 0.5, lock.y - 0.6, 1, 2.2);
}

function paintAltar(ctx: Ctx, state: 'idle' | 'light' | 'dark'): void {
  shadow(ctx, 32, 4);
  const stone = 0x5c5660;
  isoBox(ctx, 0, 6, 16, 11, 5, shade(stone, 0.85));
  const pillar = isoBox(ctx, 0, 1, 11, 7.5, 13, stone);
  const slab = isoBox(ctx, 0, -12, 16.5, 11.5, 4.5, shade(stone, 1.1));
  // Crepe e rune incise sulla faccia in luce.
  line(ctx, pillar.left(-0.7, 0.9), pillar.left(-0.45, 0.35), 'rgba(20,12,14,0.8)', 0.8);
  const rune = state === 'light' ? 0xffe090 : state === 'dark' ? 0x5a1010 : 0xd0301c;
  ctx.save();
  ctx.shadowColor = css(rune);
  ctx.shadowBlur = state === 'dark' ? 0 : 5;
  const r = (u: number, t: number) => pillar.left(u, t);
  line(ctx, r(-0.25, 0.8), r(0.25, 0.8), css(rune), 1.1);
  line(ctx, r(0, 0.8), r(0, 0.25), css(rune), 1.1);
  line(ctx, r(-0.3, 0.45), r(0, 0.25), css(rune), 1.1);
  line(ctx, r(0.3, 0.45), r(0, 0.25), css(rune), 1.1);
  ctx.restore();
  void slab;

  // Candele agli angoli del piano.
  const candle = (x: number, y: number, lit: boolean) => {
    limb(ctx, { x, y }, { x, y: y - 6 }, 1.3, 1.2, 0xd8cdb0);
    if (lit) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = 'rgba(255,150,40,0.9)';
      ctx.shadowBlur = 6;
      flame(ctx, x, y - 7, 1.5, 6, 0.4);
      ctx.restore();
    }
  };
  candle(11, -20, state !== 'dark');
  candle(-13, -15, state !== 'dark');

  // La coppa.
  const cx = 0;
  const cy = -18;
  if (state === 'dark') {
    // Rovesciata e vuota, con l'ultima goccia sul piano.
    limb(ctx, { x: cx - 4, y: cy }, { x: cx + 3, y: cy + 1.5 }, 2.6, 2, shade(GOLD, 0.7));
    ctx.fillStyle = 'rgba(90,8,8,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx + 7, cy + 3, 4, 1.6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  limb(ctx, { x: cx, y: cy + 1 }, { x: cx, y: cy - 4 }, 1.6, 1, GOLD);
  limb(ctx, { x: cx - 2, y: cy + 1.4 }, { x: cx + 2, y: cy + 1.4 }, 1.3, 1.3, shade(GOLD, 0.8));
  ball(ctx, { x: cx, y: cy - 7, d: 0 }, 4.2, GOLD);
  ctx.fillStyle = state === 'light' ? '#fff3c8' : '#7a0c0c';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 9.6, 3.4, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  if (state === 'light') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy - 12, 1, cx, cy - 12, 26);
    g.addColorStop(0, 'rgba(255,236,170,0.75)');
    g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 28, cy - 40, 56, 56);
    ctx.restore();
  }
}

function paintFireball(ctx: Ctx, frame: number): void {
  const t = (frame / PROP_FRAMES.fireball) * Math.PI * 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 9 + Math.sin(t) * 1.2;
  const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, r * 1.7);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.22, 'rgba(255,200,80,1)');
  g.addColorStop(0.5, 'rgba(240,90,20,0.7)');
  g.addColorStop(1, 'rgba(160,20,8,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = t + i * 1.26;
    flame(ctx, Math.cos(a) * 3, Math.sin(a) * 3 + 3, 2.6, 9 + 2 * Math.sin(a * 2), Math.cos(a) * 3);
  }
  ctx.restore();
}

function paintShackles(ctx: Ctx): void {
  // Due catene che scendono dal muro ai polsi del prigioniero.
  for (const side of [-1, 1]) {
    const from = { x: side * 19, y: -52 };
    const to = { x: side * 8, y: -17 };
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 3;
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.6, 2.6, i % 2 ? 0.9 : -0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#8a8a96';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ball(ctx, { ...from, d: 0 }, 2.2, 0x4a4852);
  }
}

function paintDroppedBlade(ctx: Ctx): void {
  // La mannaia lasciata cadere a terra.
  const a = { x: 10, y: -1 };
  const b = { x: 30, y: 7 };
  limb(ctx, a, { x: 15, y: 1 }, 1.2, 1.2, 0x4a3324);
  poly(ctx, [{ x: 15, y: 0 }, { x: 22, y: -0.5 }, { x: b.x, y: b.y }, { x: 23, y: 6.5 }, { x: 15, y: 2 }], css(0x77707a));
  line(ctx, { x: 24, y: 4 }, b, 'rgba(190,50,20,0.85)', 1);
}

export interface PropFrame {
  key: string;
  displayScale: number;
  originY: number;
}

/** Texture dell'oggetto richiesto: dipinta al primo uso, poi riusata. */
export function propFrame(scene: Phaser.Scene, name: PropName, frame = 0): PropFrame {
  const f = ((frame % PROP_FRAMES[name]) + PROP_FRAMES[name]) % PROP_FRAMES[name];
  const key = `prop:${name}:${f}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, HALF_W * 2 * RES, (UP + DOWN) * RES)!;
    const ctx = tex.getContext();
    ctx.setTransform(RES, 0, 0, RES, HALF_W * RES, UP * RES);
    switch (name) {
      case 'bonfire': paintBonfire(ctx, f); break;
      case 'chest_closed': paintChest(ctx, false); break;
      case 'chest_open': paintChest(ctx, true); break;
      case 'altar': paintAltar(ctx, 'idle'); break;
      case 'altar_light': paintAltar(ctx, 'light'); break;
      case 'altar_dark': paintAltar(ctx, 'dark'); break;
      case 'fireball': paintFireball(ctx, f); break;
      case 'shackles': paintShackles(ctx); break;
      case 'dropped_blade': paintDroppedBlade(ctx); break;
    }
    tex.refresh();
  }
  return { key, displayScale: 1 / RES, originY: UP / (UP + DOWN) };
}
