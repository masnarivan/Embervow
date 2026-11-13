import type Phaser from 'phaser';
import { worldAngleToScreenDir } from '../core/iso';

// Personaggi disegnati a mano con forme vettoriali: nessuno sprite da caricare.
// Le proporzioni (testa a -bodyH - 8k) restano quelle di prima, perché barre
// della vita, sagoma dietro ai muri e anelli di mira ci fanno affidamento.

type Gfx = Phaser.GameObjects.Graphics;

export type ActorKind = 'hero' | 'predone' | 'bruto' | 'arciere' | 'boss' | 'pilgrim';

export interface ActorOpts {
  kind: ActorKind;
  /** Colore identificativo: tabarro dell'eroe, pelle dei demoni, nucleo del boss. */
  color: number;
  facing: number;
  scale: number;
  alpha: number;
  flash: boolean;
  squash: number;
  /** Lunghezza dell'arma (0 = riposta). */
  weapon: number;
  hpFrac?: number;
  /** Fase della camminata in radianti; undefined = fermo. */
  walk?: number;
  dead?: boolean;
}

interface Look {
  width: number;
  horns: 'none' | 'small' | 'big';
  eyes: number | null;
  tail: boolean;
  wings: boolean;
}

const LOOKS: Record<ActorKind, Look> = {
  hero: { width: 18, horns: 'none', eyes: null, tail: false, wings: false },
  pilgrim: { width: 17, horns: 'none', eyes: null, tail: false, wings: false },
  predone: { width: 18, horns: 'small', eyes: 0xffd040, tail: true, wings: false },
  bruto: { width: 24, horns: 'big', eyes: 0xff6a30, tail: true, wings: false },
  arciere: { width: 15, horns: 'small', eyes: 0xb8ff60, tail: false, wings: true },
  boss: { width: 22, horns: 'big', eyes: 0xffb040, tail: false, wings: false },
};

const STEEL = 0x9aa3b2;
const BONE = 0xd8cfb8;
const SKIN = 0xe2c9a6;

/** Schiarisce (f > 1) o scurisce (f < 1) un colore. */
export function shade(c: number, f: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

export function drawActor(g: Gfx, sx: number, sy: number, o: ActorOpts): void {
  const L = LOOKS[o.kind];
  const k = o.scale;
  const demon = o.kind === 'predone' || o.kind === 'bruto' || o.kind === 'arciere';
  g.clear().setVisible(true).setPosition(sx, sy).setDepth(sy).setAlpha(o.alpha);

  g.fillStyle(0x000000, 0.4);
  g.fillEllipse(0, 0, L.width * 1.7 * k, L.width * 0.75 * k);

  if (o.dead) {
    g.fillStyle(0x4a0d0d, 0.55);
    g.fillEllipse(2 * k, 1 * k, L.width * 1.9 * k, L.width * 0.7 * k);
    g.fillStyle(o.kind === 'hero' ? 0x4a4f58 : shade(o.color, 0.4), 1);
    g.fillEllipse(0, -4 * k, L.width * 1.5 * k, 10 * k);
    g.fillCircle(-L.width * 0.7 * k, -4 * k, 5 * k);
    return;
  }

  const col = (c: number) => (o.flash ? 0xffffff : c);
  const d = worldAngleToScreenDir(o.facing);
  const front = d.y > -0.25;
  const step = o.walk === undefined ? 0 : Math.sin(o.walk);
  const bob = o.walk === undefined ? 0 : Math.abs(step) * 1.5 * k;

  const bodyH = 30 * k * o.squash;
  const legH = (o.kind === 'pilgrim' ? 0 : 9) * k * o.squash;
  const top = -bodyH - 2 - bob;
  const hw = (L.width / 2) * k;
  const torsoH = -legH * 0.7 - top;
  const headY = top - 6 * k;
  const headR = 7 * k;

  const body =
    o.kind === 'hero' ? STEEL : o.kind === 'boss' ? 0x2c2a33 : o.color;

  // ---- Dietro al corpo: mantello, ali, coda ----
  if (o.kind === 'hero' || o.kind === 'boss') {
    g.fillStyle(col(o.kind === 'hero' ? shade(o.color, 0.55) : 0x3a0c0c), 1);
    const dx = -d.x * 7 * k + step * k;
    g.fillPoints(
      [
        { x: -hw * 0.9, y: top + 2 * k }, { x: hw * 0.9, y: top + 2 * k },
        { x: hw * 1.15 + dx, y: -3 * k * o.squash }, { x: dx, y: -1 * k * o.squash },
        { x: -hw * 1.15 + dx, y: -3 * k * o.squash },
      ],
      true,
    );
  }
  if (L.wings) {
    g.fillStyle(col(shade(o.color, 0.5)), 1);
    for (const s of [-1, 1]) {
      g.fillTriangle(
        s * hw * 0.4, top + 5 * k,
        s * (hw + 15 * k), top - 9 * k + step * 2 * k,
        s * (hw + 9 * k), top + 15 * k * o.squash,
      );
    }
  }
  if (L.tail) {
    const tx = -d.x * (hw + 9 * k) - (Math.abs(d.x) < 0.3 ? hw + 6 * k : 0);
    g.lineStyle(2.5 * k, col(shade(o.color, 0.7)), 1);
    g.beginPath();
    g.moveTo(-d.x * hw * 0.5, -legH);
    g.lineTo(tx * 0.7, -legH + 2 * k);
    g.lineTo(tx, -legH - 6 * k + step * k);
    g.strokePath();
    g.fillStyle(col(shade(o.color, 0.7)), 1);
    g.fillTriangle(tx - 3 * k, -legH - 6 * k, tx + 3 * k, -legH - 6 * k, tx, -legH - 12 * k + step * k);
  }

  if (!front) drawWeapon(g, o, d, top, torsoH, col);

  // ---- Gambe ----
  if (legH > 0) {
    g.fillStyle(col(shade(body, 0.55)), 1);
    const lw = hw * 0.55;
    const liftA = Math.max(0, step) * 2.5 * k;
    const liftB = Math.max(0, -step) * 2.5 * k;
    g.fillRect(-hw * 0.75, -legH - 2 * k, lw, legH + 2 * k - liftA);
    g.fillRect(hw * 0.2, -legH - 2 * k, lw, legH + 2 * k - liftB);
  }

  // ---- Busto ----
  g.fillStyle(col(body), 1);
  g.fillRoundedRect(-hw, top, hw * 2, torsoH, Math.min(5 * k, torsoH / 2));
  if (!o.flash) {
    if (o.kind === 'hero') {
      g.fillStyle(o.color, 1);
      g.fillRect(-hw * 0.45, top + 4 * k, hw * 0.9, Math.max(0, torsoH - 4 * k));
      g.fillStyle(0x3a2c1c, 1);
      g.fillRect(-hw, top + torsoH * 0.62, hw * 2, 2.5 * k);
      g.fillStyle(shade(STEEL, 1.2), 1);
      g.fillCircle(-hw, top + 3 * k, 4 * k);
      g.fillCircle(hw, top + 3 * k, 4 * k);
    } else if (demon) {
      g.fillStyle(shade(o.color, 1.2), 0.6);
      g.fillEllipse(d.x * 2 * k, top + torsoH * 0.35, hw * 1.2, torsoH * 0.45);
      g.fillStyle(0x24160f, 1);
      g.fillRect(-hw, top + torsoH * 0.72, hw * 2, torsoH * 0.28);
    } else if (o.kind === 'boss') {
      // Armatura di ferro nero con il nucleo che cambia colore con la fase.
      g.lineStyle(1.5 * k, shade(o.color, 0.9), 1);
      g.strokeRoundedRect(-hw, top, hw * 2, torsoH, 5 * k);
      g.fillStyle(o.color, 0.3);
      g.fillCircle(0, top + torsoH * 0.4, 8 * k);
      g.fillStyle(shade(o.color, 1.5), 1);
      g.fillCircle(0, top + torsoH * 0.4, 3.5 * k);
      g.fillStyle(0x3a3842, 1);
      for (const s of [-1, 1]) {
        g.fillTriangle(s * hw * 0.6, top + 5 * k, s * (hw + 3 * k), top + 6 * k, s * (hw + 6 * k), top - 7 * k);
      }
    } else {
      // Pellegrino: saio lungo fino a terra con la corda in vita.
      g.fillStyle(0xcfc4a8, 1);
      g.fillRect(-hw, top + torsoH * 0.5, hw * 2, 1.5 * k);
    }
  }

  // ---- Scudo dell'eroe ----
  if (o.kind === 'hero') {
    const shx = -d.x * hw * 0.9 - (Math.abs(d.x) < 0.3 ? hw * 0.9 : 0);
    g.fillStyle(col(0x5c6472), 1);
    g.fillEllipse(shx, top + torsoH * 0.55, 9 * k, 13 * k * o.squash);
    g.fillStyle(col(o.color), 1);
    g.fillEllipse(shx, top + torsoH * 0.55, 4 * k, 6 * k * o.squash);
  }

  // ---- Testa ----
  if (L.horns !== 'none' && !o.flash) {
    g.fillStyle(BONE, 1);
    const big = L.horns === 'big';
    for (const s of [-1, 1]) {
      if (big) {
        g.fillTriangle(s * 3 * k, headY - 4 * k, s * 7 * k, headY, s * 13 * k, headY - 6 * k);
        g.fillTriangle(s * 9 * k, headY - 2 * k, s * 13 * k, headY - 6 * k, s * 10 * k, headY - 16 * k);
      } else {
        g.fillTriangle(s * 2.5 * k, headY - 5 * k, s * 6.5 * k, headY - 2 * k, s * 7.5 * k, headY - 13 * k);
      }
    }
  }
  if (o.kind === 'hero') {
    g.fillStyle(col(o.color), 1);
    g.fillTriangle(-2 * k, headY - 6 * k, 2 * k, headY - 6 * k, -d.x * 5 * k, headY - 14 * k);
    g.fillStyle(col(shade(STEEL, 1.1)), 1);
    g.fillCircle(0, headY, headR);
    if (front && !o.flash) {
      g.fillStyle(0x15171c, 1);
      g.fillRect(-4 * k + d.x * 2.5 * k, headY - 1.5 * k, 8 * k, 2.2 * k);
    }
  } else if (o.kind === 'pilgrim') {
    g.fillStyle(col(shade(o.color, 0.75)), 1);
    g.fillCircle(0, headY, headR);
    if (front) {
      g.fillStyle(col(SKIN), 1);
      g.fillCircle(d.x * 1.5 * k, headY + 1 * k, 4.2 * k);
    }
  } else {
    g.fillStyle(col(o.kind === 'boss' ? 0x35333d : shade(o.color, 0.88)), 1);
    g.fillCircle(0, headY, headR);
    if (front && L.eyes !== null && !o.flash) {
      const ex = d.x * 2.2 * k;
      const ey = headY - 0.5 * k + d.y * k;
      g.fillStyle(L.eyes, 0.35);
      g.fillCircle(ex - 2.7 * k, ey, 2.6 * k);
      g.fillCircle(ex + 2.7 * k, ey, 2.6 * k);
      g.fillStyle(L.eyes, 1);
      g.fillCircle(ex - 2.7 * k, ey, 1.3 * k);
      g.fillCircle(ex + 2.7 * k, ey, 1.3 * k);
      if (o.kind === 'bruto') {
        g.fillStyle(BONE, 1);
        g.fillTriangle(ex - 3.5 * k, headY + 5 * k, ex - 1.5 * k, headY + 5 * k, ex - 2.5 * k, headY + 1.5 * k);
        g.fillTriangle(ex + 3.5 * k, headY + 5 * k, ex + 1.5 * k, headY + 5 * k, ex + 2.5 * k, headY + 1.5 * k);
      }
    }
  }

  if (front) drawWeapon(g, o, d, top, torsoH, col);

  if (o.hpFrac !== undefined) {
    const w = 36 * k;
    const y = top - 24 * k;
    g.fillStyle(0x000000, 0.8);
    g.fillRect(-w / 2 - 1, y - 1, w + 2, 6);
    g.fillStyle(0xc0301c, 1);
    g.fillRect(-w / 2, y, w * o.hpFrac, 4);
  }
}

function drawWeapon(
  g: Gfx,
  o: ActorOpts,
  d: { x: number; y: number },
  top: number,
  torsoH: number,
  col: (c: number) => number,
): void {
  const k = o.scale;
  const oy = top + torsoH * 0.55;
  const at = (r: number) => ({ x: d.x * r * k, y: oy + d.y * r * k });

  if (o.kind === 'arciere') {
    const a = Math.atan2(d.y, d.x);
    const c = at(10);
    g.lineStyle(2.5 * k, col(0x5a3a24), 1);
    g.beginPath();
    g.arc(c.x, c.y, 11 * k, a - 1.2, a + 1.2);
    g.strokePath();
    g.lineStyle(1, col(0xd8cfb8), 0.8);
    g.lineBetween(
      c.x + Math.cos(a - 1.2) * 11 * k, c.y + Math.sin(a - 1.2) * 11 * k,
      c.x + Math.cos(a + 1.2) * 11 * k, c.y + Math.sin(a + 1.2) * 11 * k,
    );
    // Punta della freccia incandescente.
    const tip = at(22);
    g.fillStyle(0xff8a30, 0.35);
    g.fillCircle(tip.x, tip.y, 4.5 * k);
    g.fillStyle(0xffd890, 1);
    g.fillCircle(tip.x, tip.y, 1.8 * k);
    return;
  }
  if (o.weapon <= 0) return;

  const a = at(7);
  const b = at(7 + o.weapon);
  const striking = o.weapon >= 30;
  const px = -d.y * 4 * k;
  const py = d.x * 4 * k;

  switch (o.kind) {
    case 'hero':
      if (striking) {
        g.lineStyle(8 * k, 0xfff0c0, 0.25);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      g.lineStyle(3 * k, col(0xe6e8f2), 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(2.5 * k, col(0xc8a050), 1);
      g.lineBetween(a.x - px, a.y - py, a.x + px, a.y + py);
      break;
    case 'bruto': {
      g.lineStyle(5 * k, col(0x4a3526), 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(col(0x3c3a42), 1);
      g.fillCircle(b.x, b.y, 6 * k);
      g.fillStyle(col(BONE), 1);
      g.fillTriangle(b.x - px, b.y - py, b.x + px, b.y + py, b.x + d.x * 10 * k, b.y + d.y * 10 * k);
      break;
    }
    case 'boss':
      g.lineStyle(11 * k, o.color, striking ? 0.35 : 0.15);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(6 * k, col(0x4c4a56), 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(1.8 * k, col(shade(o.color, 1.4)), 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(4 * k, col(0x2c2a33), 1);
      g.lineBetween(a.x - px * 1.6, a.y - py * 1.6, a.x + px * 1.6, a.y + py * 1.6);
      break;
    default:
      // Lama seghettata di ferro nero, arrossata in punta.
      g.lineStyle(3.5 * k, col(0x6e6670), 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(3.5 * k, col(0xc0401c), 1);
      g.lineBetween(at(7 + o.weapon * 0.7).x, at(7 + o.weapon * 0.7).y, b.x, b.y);
  }
}
