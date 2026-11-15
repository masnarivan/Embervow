import type Phaser from 'phaser';

// Sprite dei personaggi, dipinti una volta su canvas e poi riusati come texture.
//
// Ogni personaggio è un piccolo scheletro 3D (lato, avanti, alto) proiettato in
// isometria: così le 12 direzioni e le pose (camminata, carica, colpo, schivata)
// escono tutte dallo stesso modello, con le parti ordinate per profondità.
// Lo stile punta al dark fantasy "massiccio": spallacci e mani grandi, armi
// fuori misura, contorno scuro, luce calda dal basso.

export type ActorKind = 'hero' | 'mage' | 'rogue' | 'spettro' | 'predone' | 'bruto' | 'arciere' | 'boss' | 'pilgrim';
export type Pose = 'idle' | 'walk' | 'windup' | 'strike' | 'dodge' | 'kneel' | 'dead';

const DIRS = 12;
const WALK_FRAMES = 8;
/** Riquadro di uno sprite in unità logiche a scala 1: metà larghezza, sopra e sotto i piedi. */
const HALF_W = 50;
const UP = 74;
const DOWN = 20;
const OUTLINE = '#130a0a';
const OW = 1.1;
const BONE = 0xd8cfb8;
const STEEL = 0x8e97aa;
const IRON = 0x34323c;

/** Schiarisce (f > 1) o scurisce (f < 1) un colore. */
export function shade(c: number, f: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

export const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

type Weapon = 'none' | 'sword' | 'cleaver' | 'maul' | 'greatsword' | 'bow' | 'staff' | 'dagger';

interface Rig {
  /** Carne o corazza del busto e delle braccia. */
  body: number;
  legs: number;
  head: number;
  hands: number;
  trim: number;
  legLen: number;
  legR: number;
  hipW: number;
  torsoLen: number;
  torsoR: number;
  shW: number;
  armR: number;
  armLen: number;
  headR: number;
  lean: number;
  /** Raggio degli spallacci (0 = spalla nuda). */
  pauldron: number;
  horns: 0 | 1 | 2;
  eyes: number | null;
  tail: boolean;
  wings: boolean;
  cape: number | null;
  weapon: Weapon;
  weaponLen: number;
  shield: boolean;
}

function rigFor(kind: ActorKind, color: number): Rig {
  const demon = {
    legs: shade(color, 0.6), head: shade(color, 0.95), hands: shade(color, 0.85), trim: 0x2a1a14,
    pauldron: 0, cape: null, shield: false,
  };
  switch (kind) {
    case 'hero':
      return {
        body: STEEL, legs: shade(STEEL, 0.7), head: shade(STEEL, 1.08), hands: shade(STEEL, 0.75), trim: color,
        legLen: 12, legR: 3.1, hipW: 3.6, torsoLen: 14, torsoR: 6.4, shW: 8.2, armR: 2.7, armLen: 12, headR: 6.2,
        lean: 0, pauldron: 5.4, horns: 0, eyes: null, tail: false, wings: false, cape: shade(color, 0.7),
        weapon: 'sword', weaponLen: 25, shield: true,
      };
    case 'mage':
      return {
        body: color, legs: shade(color, 0.8), head: shade(color, 0.8), hands: 0xd8b890, trim: 0xd8a848,
        legLen: 12, legR: 3.4, hipW: 3.1, torsoLen: 14, torsoR: 5.8, shW: 6.8, armR: 2.3, armLen: 12, headR: 6,
        lean: 0.5, pauldron: 0, horns: 0, eyes: null, tail: false, wings: false, cape: null,
        weapon: 'staff', weaponLen: 27, shield: false,
      };
    case 'rogue':
      return {
        body: 0x4a3f38, legs: 0x2e2a2c, head: shade(color, 0.7), hands: 0x2a2428, trim: 0x2a2226,
        legLen: 12, legR: 2.7, hipW: 3.3, torsoLen: 13, torsoR: 5.6, shW: 7, armR: 2.3, armLen: 12, headR: 5.8,
        lean: 2.2, pauldron: 0, horns: 0, eyes: null, tail: false, wings: false, cape: shade(color, 0.75),
        weapon: 'dagger', weaponLen: 12, shield: false,
      };
    case 'spettro':
      return {
        body: color, legs: shade(color, 0.7), head: shade(color, 0.6), hands: shade(color, 1.5), trim: shade(color, 1.4),
        legLen: 11, legR: 3, hipW: 2.6, torsoLen: 13, torsoR: 5.4, shW: 6.2, armR: 1.9, armLen: 13, headR: 5.6,
        lean: 3, pauldron: 0, horns: 0, eyes: 0xc8ffe8, tail: false, wings: false, cape: null,
        weapon: 'none', weaponLen: 0, shield: false,
      };
    case 'pilgrim':
      return {
        body: color, legs: shade(color, 0.8), head: shade(color, 0.7), hands: 0xd8b890, trim: 0xcfc4a8,
        legLen: 11, legR: 3.4, hipW: 3, torsoLen: 14, torsoR: 6, shW: 6.5, armR: 2.3, armLen: 11, headR: 6,
        lean: 1, pauldron: 0, horns: 0, eyes: null, tail: false, wings: false, cape: null,
        weapon: 'none', weaponLen: 0, shield: false,
      };
    case 'bruto':
      return {
        ...demon, body: color,
        legLen: 9, legR: 4, hipW: 5, torsoLen: 15, torsoR: 9.4, shW: 12, armR: 4.2, armLen: 15, headR: 6.4,
        lean: 3, pauldron: 0, horns: 2, eyes: 0xff7a30, tail: true, wings: false,
        weapon: 'maul', weaponLen: 22,
      };
    case 'arciere':
      return {
        ...demon, body: color,
        legLen: 12, legR: 2.4, hipW: 3, torsoLen: 13, torsoR: 5, shW: 6.4, armR: 2, armLen: 12, headR: 5.6,
        lean: 1, horns: 1, eyes: 0xc8ff70, tail: false, wings: true,
        weapon: 'bow', weaponLen: 12,
      };
    case 'boss':
      return {
        body: IRON, legs: shade(IRON, 0.75), head: shade(IRON, 1.1), hands: shade(IRON, 0.8), trim: color,
        legLen: 12, legR: 3.6, hipW: 4.2, torsoLen: 15, torsoR: 7.6, shW: 10, armR: 3.2, armLen: 13, headR: 6.4,
        lean: 1, pauldron: 6.4, horns: 2, eyes: 0xffb040, tail: false, wings: false, cape: 0x4a0e0e,
        weapon: 'greatsword', weaponLen: 30, shield: false,
      };
    default:
      return {
        ...demon, body: color,
        legLen: 11, legR: 2.9, hipW: 3.6, torsoLen: 13, torsoR: 6, shW: 7.6, armR: 2.6, armLen: 12, headR: 6,
        lean: 2.5, horns: 1, eyes: 0xffd040, tail: true, wings: false,
        weapon: 'cleaver', weaponLen: 19,
      };
  }
}

interface P3 {
  s: number;
  f: number;
  z: number;
}
interface P2 {
  x: number;
  y: number;
  d: number;
}

type Ctx = CanvasRenderingContext2D;
type XY = { x: number; y: number };

// ---------- Pennelli ----------

/** Sfera a tre toni con contorno. */
export function ball(ctx: Ctx, p: P2, r: number, color: number): void {
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + OW, 0, Math.PI * 2);
  ctx.fill();
  tone(ctx, p.x, p.y, r, color);
}

export function tone(ctx: Ctx, x: number, y: number, r: number, color: number): void {
  const dot = (dx: number, dy: number, rr: number, c: string) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(0, 0, r, css(shade(color, 0.62)));
  dot(-r * 0.16, -r * 0.2, r * 0.8, css(color));
  dot(-r * 0.36, -r * 0.42, r * 0.36, css(shade(color, 1.4), 0.85));
}

/** Arto: catena di sfere tra due punti, con raggio che può assottigliarsi. */
export function limb(ctx: Ctx, a: XY, b: XY, r1: number, r2: number, color: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.1));
  const at = (i: number) => {
    const t = i / n;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: r1 + (r2 - r1) * t };
  };
  const pass = (fn: (x: number, y: number, r: number) => void) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const q = at(i);
      fn(q.x, q.y, q.r);
    }
    ctx.fill();
  };
  const circle = (x: number, y: number, r: number) => {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  };
  ctx.fillStyle = OUTLINE;
  pass((x, y, r) => circle(x, y, r + OW));
  ctx.fillStyle = css(shade(color, 0.62));
  pass((x, y, r) => circle(x, y, r));
  ctx.fillStyle = css(color);
  pass((x, y, r) => circle(x - r * 0.16, y - r * 0.2, r * 0.8));
  ctx.fillStyle = css(shade(color, 1.4), 0.8);
  pass((x, y, r) => circle(x - r * 0.36, y - r * 0.42, r * 0.3));
}

export function poly(ctx: Ctx, pts: { x: number; y: number }[], fill: string | CanvasGradient, lineW = OW * 2): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lineW;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function glowDot(ctx: Ctx, p: P2, r: number, color: number): void {
  ctx.save();
  ctx.shadowColor = css(color);
  ctx.shadowBlur = r * 5;
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- Il modello ----------

function paintFigure(ctx: Ctx, kind: ActorKind, color: number, dir: number, pose: Pose, frame: number): void {
  const R = rigFor(kind, color);
  const w = (dir / DIRS) * Math.PI * 2;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  // Proiezione isometrica esatta del vettore "avanti" e del suo perpendicolare.
  const F = { x: (cw - sw) * 0.7071, y: (cw + sw) * 0.35355 };
  const S = { x: (-sw - cw) * 0.7071, y: (-sw + cw) * 0.35355 };
  const pr = (p: P3): P2 => {
    const gx = p.s * S.x + p.f * F.x;
    const gy = p.s * S.y + p.f * F.y;
    return { x: gx, y: gy - p.z, d: gy + p.z * 0.001 };
  };
  const v = (s: number, f: number, z: number): P3 => ({ s, f, z });

  const parts: { d: number; draw: () => void }[] = [];
  const add = (d: number, draw: () => void) => parts.push({ d, draw });
  const addLimb = (a: P3, b: P3, r1: number, r2: number, c: number) => {
    const pa = pr(a);
    const pb = pr(b);
    add((pa.d + pb.d) / 2, () => limb(ctx, pa, pb, r1, r2, c));
  };
  const addBall = (p: P3, r: number, c: number, bias = 0) => {
    const q = pr(p);
    add(q.d + bias, () => ball(ctx, q, r, c));
  };

  const walking = pose === 'walk';
  const ph = (frame / WALK_FRAMES) * Math.PI * 2;
  const swing = walking ? Math.sin(ph) : 0;
  const bob = walking ? Math.abs(Math.cos(ph)) * 1.1 : 0;
  const kneel = pose === 'kneel';
  const zs = pose === 'dodge' ? 0.6 : 1;
  const lean = R.lean + (pose === 'strike' ? 4.5 : pose === 'windup' ? -2.5 : pose === 'dodge' ? 6 : kneel ? 3 : 0);
  const legLen = R.legLen * (kneel ? 0.5 : 1) * zs;
  const hipZ = legLen + bob;
  const shZ = hipZ + R.torsoLen * zs;
  const headZ = shZ + R.headR * 0.9 - (kneel ? 2 : 0);
  const headF = lean * 1.15 + 1 + (kneel ? 2 : 0);
  const robe = kind === 'pilgrim' || kind === 'mage' || kind === 'spettro';

  // Gambe e piedi
  for (const side of [-1, 1]) {
    const sg = side * swing;
    const foot = kneel
      ? v(side * R.hipW, side > 0 ? 4 : -5, 0.5)
      : v(side * R.hipW, sg * 5.5, Math.max(0, sg) * 2.6);
    if (robe) {
      addLimb(v(side * R.hipW * 0.6, 0, hipZ), v(side * R.hipW, foot.f * 0.4, 1.5), R.torsoR * 0.8, R.torsoR * 0.95, R.body);
    } else {
      addLimb(v(side * R.hipW, 0, hipZ), foot.z > 0 || kneel ? { ...foot, z: foot.z + R.legR } : { ...foot, z: R.legR }, R.legR, R.legR * 0.85, R.legs);
      addBall(v(foot.s, foot.f + 1.6, foot.z + R.legR * 0.7), R.legR * 1.05, shade(R.legs, 0.7));
    }
  }

  // Coda
  if (R.tail) {
    const back = -R.torsoR * 0.7;
    const pts = [v(0, back, hipZ + 1), v(0, back - 6, hipZ - 3), v(swing * 2.5, back - 11, hipZ + 1), v(swing * 3.5, back - 13, hipZ + 7)];
    for (let i = 0; i < 3; i++) addLimb(pts[i], pts[i + 1], 2.3 - i * 0.55, 1.8 - i * 0.55, shade(color, 0.75));
    addBall(pts[3], 1.9, shade(color, 0.5));
  }

  // Mantello
  if (R.cape !== null) {
    const back = -R.torsoR * 0.75;
    const sway = Math.abs(swing) * 1.5 + (pose === 'strike' ? 3 : 0);
    const pts3 = [
      v(-R.shW * 0.95, back, shZ + 1.5), v(R.shW * 0.95, back, shZ + 1.5),
      v(R.shW * 1.3, back - 4 - sway, 5), v(R.shW * 0.55, back - 6 - sway, 2),
      v(0, back - 5 - sway, 4.5), v(-R.shW * 0.55, back - 6 - sway, 2), v(-R.shW * 1.3, back - 4 - sway, 5),
    ];
    const pts = pts3.map(pr);
    const top = Math.min(...pts.map((p) => p.y));
    const bot = Math.max(...pts.map((p) => p.y));
    add(pr(v(0, back - 4, hipZ)).d, () => {
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, css(shade(R.cape!, 1.25)));
      g.addColorStop(1, css(shade(R.cape!, 0.5)));
      poly(ctx, pts, g);
    });
  }

  // Ali
  if (R.wings) {
    const back = -R.torsoR * 0.8;
    const flap = walking ? swing * 2.5 : pose === 'windup' ? 4 : 0;
    for (const side of [-1, 1]) {
      const pts3 = [
        v(side * 1.5, back, shZ - 1), v(side * (R.shW + 13), back - 5, shZ + 14 + flap),
        v(side * (R.shW + 17), back - 6, shZ + 3 + flap * 0.5), v(side * (R.shW + 11), back - 5, shZ - 5),
        v(side * (R.shW + 12), back - 5, hipZ + 3), v(side * (R.shW + 5), back - 3, hipZ + 6), v(side * 2, back, hipZ + 5),
      ];
      const pts = pts3.map(pr);
      add(pr(v(side * (R.shW + 8), back - 4, shZ)).d, () => {
        poly(ctx, pts, css(shade(color, 0.48)));
        ctx.strokeStyle = css(shade(color, 0.85));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[4].x, pts[4].y);
        ctx.stroke();
      });
    }
  }

  // Busto
  const chest = v(0, lean, shZ - R.torsoR * 0.55);
  addLimb(v(0, 0, hipZ + 1), chest, R.torsoR * 0.82, R.torsoR, R.body);
  if (kind === 'hero') {
    // Tabarro con bordo dorato sul petto.
    const f = R.torsoR * 0.98;
    const pts = [
      v(-R.torsoR * 0.55, lean + f, shZ - 2), v(R.torsoR * 0.55, lean + f, shZ - 2),
      v(R.torsoR * 0.62, f * 0.95, hipZ - 3.5), v(0, f, hipZ - 6), v(-R.torsoR * 0.62, f * 0.95, hipZ - 3.5),
    ].map(pr);
    add(pr(v(0, lean + f, shZ - 6)).d, () => {
      poly(ctx, pts, css(R.trim), OW * 1.6);
      ctx.strokeStyle = css(0xd8a848);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(pts[4].x, pts[4].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.stroke();
    });
    addBall(v(0, R.torsoR * 0.9, hipZ + 2), 1.7, 0xd8a848, 0.05);
  } else if (kind === 'boss') {
    // Nucleo incandescente nel petto: il colore segue la fase dello scontro.
    const core = pr(v(0, lean + R.torsoR * 0.95, shZ - R.torsoR * 0.8));
    add(core.d, () => {
      ball(ctx, core, 3.2, shade(color, 0.6));
      glowDot(ctx, core, 2.2, shade(color, 1.35));
    });
  } else if (!robe) {
    // Perizoma di cuoio e cinghia.
    const f = R.torsoR * 0.8;
    for (const sgn of [-1, 1]) {
      const pts = [
        v(-R.torsoR * 0.7, sgn * f, hipZ + 2.5), v(R.torsoR * 0.7, sgn * f, hipZ + 2.5),
        v(R.torsoR * 0.45, sgn * f * 1.05, hipZ - 5), v(-R.torsoR * 0.45, sgn * f * 1.05, hipZ - 5),
      ].map(pr);
      add(pr(v(0, sgn * f, hipZ)).d, () => poly(ctx, pts, css(R.trim), OW * 1.6));
    }
  } else {
    addBall(v(0, lean * 0.5 + R.torsoR * 0.85, hipZ + R.torsoLen * 0.45), 1.3, R.trim, 0.05);
  }

  // Spalle, braccia, mani
  const wHand =
    pose === 'windup' ? v(R.shW + 2, lean - 3.5, shZ + 5)
      : pose === 'strike' ? v(R.shW * 0.55, lean + R.armLen * 0.95, shZ - 3)
        : pose === 'dodge' ? v(R.shW, lean + 6, shZ - 6)
          : v(R.shW + 1.6, lean + 4.5 - swing * 3, shZ - R.armLen * 0.78);
  let oHand = R.shield
    ? v(-(R.shW + 1.5), lean + 5.5, shZ - R.armLen * 0.55)
    : v(-(R.shW + 1.6), lean + 3 + swing * 3, shZ - R.armLen * 0.8);
  if (kneel) oHand = v(-(R.shW * 0.6), lean + 5, hipZ + 3);
  let bowDraw = 0;
  let hand = wHand;
  if (R.weapon === 'bow') {
    // L'arco sta nella mano avanzata; l'altra tende la corda.
    oHand = v(-R.shW * 0.35, lean + R.armLen * 0.95, shZ - 2);
    bowDraw = pose === 'windup' ? 7 : pose === 'strike' ? 0.5 : 2;
    hand = v(R.shW * 0.6, lean + R.armLen * 0.95 - bowDraw - 2.5, shZ - 2);
  }
  if (kneel && R.weapon !== 'bow') hand = v(R.shW * 0.6, lean + 5, hipZ + 3);
  for (const side of [-1, 1]) {
    const sh = v(side * R.shW, lean, shZ);
    const h = side > 0 ? hand : oHand;
    addLimb(sh, h, R.armR, R.armR * 0.92, R.body);
    addBall(h, R.armR * 1.2, R.hands, 0.01);
    if (R.pauldron > 0) {
      addBall({ ...sh, z: sh.z + 1.2 }, R.pauldron, shade(R.body, 1.12), 0.02);
      if (kind === 'boss') {
        addLimb(v(side * (R.shW + 2), lean, shZ + 4), v(side * (R.shW + 6.5), lean, shZ + 13), 2.4, 0.4, shade(IRON, 1.3));
        addBall({ ...sh, s: side * (R.shW + 0.5), z: sh.z + 1.2 }, 1.6, color, 0.5 * Math.sign(S.y * side || 1));
      } else {
        // Bordo dorato dello spallaccio.
        const q = pr({ ...sh, z: sh.z + 1.2 });
        add(q.d + 0.03, () => {
          ctx.strokeStyle = css(0xd8a848);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(q.x, q.y, R.pauldron - 0.4, Math.PI * 0.1, Math.PI * 0.9);
          ctx.stroke();
        });
      }
    }
  }

  // Scudo a mandorla
  if (R.shield && !kneel) {
    const c = pr(v(oHand.s - 2.2, oHand.f + 1.5, oHand.z + 0.5));
    add(c.d + 0.02, () => {
      const shape = (k: number) => [
        { x: c.x - 6.2 * k, y: c.y - 7 * k }, { x: c.x, y: c.y - 8.6 * k }, { x: c.x + 6.2 * k, y: c.y - 7 * k },
        { x: c.x + 5.6 * k, y: c.y + 1.5 * k }, { x: c.x, y: c.y + 9.5 * k }, { x: c.x - 5.6 * k, y: c.y + 1.5 * k },
      ];
      poly(ctx, shape(1), css(0xd8a848));
      const g = ctx.createLinearGradient(c.x - 6, c.y - 8, c.x + 6, c.y + 9);
      g.addColorStop(0, css(shade(R.trim, 1.3)));
      g.addColorStop(1, css(shade(R.trim, 0.6)));
      poly(ctx, shape(0.78), g, 0.6);
      tone(ctx, c.x, c.y - 1, 1.9, 0xe8c060);
    });
  }

  // Testa
  const head = v(0, headF, headZ);
  const face = (s: number, f: number, z: number) => v(head.s + s * R.headR, head.f + f * R.headR, head.z + z * R.headR);
  if (kind === 'hero') {
    addBall(head, R.headR, R.head);
    // Pennacchio, fessura della visiera e nasale dorato.
    addLimb(face(0, -0.1, 0.9), face(0, -1.5, 1.6), 2.3, 0.9, R.trim);
    const a = pr(face(-0.62, 0.8, 0.12));
    const b = pr(face(0.62, 0.8, 0.12));
    const n0 = pr(face(0, 0.98, 0.45));
    const n1 = pr(face(0, 0.98, -0.5));
    add(pr(face(0, 0.9, 0)).d, () => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0c0d12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.6, b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = css(0xd8a848);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(n0.x, n0.y);
      ctx.lineTo(n1.x, n1.y);
      ctx.stroke();
    });
  } else if (kind === 'rogue') {
    // Cappuccio calato sul viso, con una maschera scura su bocca e naso.
    addBall(head, R.headR, R.head);
    addBall(face(0, 0.52, -0.08), R.headR * 0.6, 0xd8b890, 0.02);
    addBall(face(0, 0.66, -0.42), R.headR * 0.5, 0x1e1a20, 0.03);
    addBall(face(0, 0.18, 0.46), R.headR * 0.8, shade(R.head, 0.9), 0.04);
    addLimb(face(0, -0.5, 0.5), face(0, -1.25, 0.1), R.headR * 0.5, 0.6, shade(R.head, 0.85));
  } else if (kind === 'spettro') {
    // Cappuccio vuoto: dentro solo buio e due occhi.
    addBall(head, R.headR, R.head);
    addBall(face(0, 0.5, -0.1), R.headR * 0.62, 0x0a1210, 0.02);
    for (const side of [-1, 1]) {
      const e = pr(face(side * 0.36, 0.95, -0.05));
      add(e.d + 0.04, () => glowDot(ctx, e, 1, R.eyes!));
    }
  } else if (robe) {
    addBall(head, R.headR, R.head);
    addBall(face(0, 0.5, -0.12), R.headR * 0.62, 0xd8b890, 0.02);
    addBall(face(0, 0.2, 0.42), R.headR * 0.78, shade(R.head, 0.9), 0.03);
    if (kind === 'mage') {
      // Cappello a punta piegato all'indietro, con la fascia dorata.
      addLimb(face(0, 0.1, 0.7), face(0, -0.5, 1.75), R.headR * 0.7, R.headR * 0.32, R.body);
      addLimb(face(0, -0.5, 1.75), face(0, -1.35, 2.3), R.headR * 0.32, 0.5, shade(R.body, 0.85));
      addBall(face(0, 0.72, 0.72), 1.3, R.trim, 0.04);
    }
  } else {
    addBall(head, R.headR, R.head);
    if (kind !== 'boss') addBall(face(0, 0.72, -0.38), R.headR * 0.56, shade(R.head, 0.82), 0.01);
    if (R.eyes !== null) {
      for (const side of [-1, 1]) {
        const e = pr(face(side * 0.42, 0.86, 0.14));
        add(e.d + 0.02, () => glowDot(ctx, e, kind === 'boss' ? 1.25 : 1.1, R.eyes!));
      }
    }
    if (kind === 'bruto') {
      for (const side of [-1, 1]) addLimb(face(side * 0.4, 1.05, -0.55), face(side * 0.52, 1.1, 0.05), 1.1, 0.3, BONE);
    }
    if (kind === 'boss') {
      // Cresta dell'elmo.
      addLimb(face(0, 0.5, 0.85), face(0, -0.7, 0.95), 1.6, 1.1, shade(IRON, 1.5));
    }
  }
  if (R.horns > 0) {
    const big = R.horns === 2;
    const hr = big ? 2.5 : 1.8;
    for (const side of [-1, 1]) {
      const base = face(side * 0.72, 0, 0.5);
      const mid = face(side * (big ? 1.75 : 1.2), 0.1, big ? 1.0 : 1.25);
      const tip = face(side * (big ? 1.55 : 1.05), 0.5, big ? 2.25 : 1.95);
      addLimb(base, mid, hr, hr * 0.7, BONE);
      addLimb(mid, tip, hr * 0.7, 0.3, shade(BONE, 0.9));
    }
  }

  // Arma
  if (R.weapon !== 'none' && R.weapon !== 'bow' && !kneel) {
    const dirv =
      pose === 'windup' ? v(0.25, -0.5, 0.83)
        : pose === 'strike' ? v(-0.18, 0.98, -0.06)
          : pose === 'dodge' ? v(0, 0.95, 0.3)
            : v(0.16, 0.5, 0.85);
    const along = (t: number) => pr(v(hand.s + dirv.s * t, hand.f + dirv.f * t, hand.z + dirv.z * t));
    const L = R.weaponLen;
    const p0 = along(-3.5);
    const g0 = along(1.8);
    const tip = along(L);
    const mid = along(L * 0.5);
    const nx = -(tip.y - g0.y);
    const ny = tip.x - g0.x;
    const nl = Math.hypot(nx, ny) || 1;
    const n = { x: nx / nl, y: ny / nl };
    const off = (p: XY, k: number) => ({ x: p.x + n.x * k, y: p.y + n.y * k });
    add(mid.d + 0.015, () => {
      if (R.weapon === 'staff') {
        // Bastone nodoso con una gemma accesa in cima: più viva mentre lancia.
        limb(ctx, along(-9), along(L), 1.25, 1, 0x5a4030);
        const orb = along(L + 2);
        limb(ctx, off(along(L - 1), -2.4), off(along(L + 1.5), -1.4), 0.9, 0.5, 0x5a4030);
        limb(ctx, off(along(L - 1), 2.4), off(along(L + 1.5), 1.4), 0.9, 0.5, 0x5a4030);
        const lit = pose === 'windup' ? 3 : pose === 'strike' ? 2.6 : 2;
        glowDot(ctx, { ...orb, d: 0 }, lit, shade(color, 1.75));
        return;
      }
      if (R.weapon === 'maul') {
        limb(ctx, p0, along(L * 0.9), 1.5, 1.5, 0x5a4030);
        const h = along(L * 0.92);
        limb(ctx, off(h, -5.2), off(h, 5.2), 4.4, 4.4, 0x4a4852);
        limb(ctx, off(h, -5.2), off(h, -8.5), 2, 0.3, BONE);
        limb(ctx, off(h, 5.2), off(h, 8.5), 2, 0.3, BONE);
        limb(ctx, h, along(L + 5), 2, 0.3, BONE);
        return;
      }
      const wide = R.weapon === 'greatsword' ? 3.6 : R.weapon === 'cleaver' ? 3.2 : R.weapon === 'dagger' ? 1.6 : 2.1;
      const steel = R.weapon === 'sword' || R.weapon === 'dagger' ? 0xdfe3ee : R.weapon === 'greatsword' ? 0x5a5866 : 0x77707a;
      limb(ctx, p0, g0, 1.2, 1.2, 0x4a3324);
      const sh = along(L * 0.82);
      const blade =
        R.weapon === 'cleaver'
          ? [off(g0, -0.8), off(along(L * 0.3), -wide), off(along(L * 0.55), -wide * 0.45), off(along(L * 0.78), -wide * 1.15), tip, off(g0, 1)]
          : [off(g0, -wide), off(sh, -wide * 0.8), tip, off(sh, wide * 0.8), off(g0, wide)];
      const grad = ctx.createLinearGradient(g0.x - n.x * wide, g0.y - n.y * wide, g0.x + n.x * wide, g0.y + n.y * wide);
      grad.addColorStop(0, css(shade(steel, 0.6)));
      grad.addColorStop(0.5, css(shade(steel, 1.2)));
      grad.addColorStop(1, css(shade(steel, 0.8)));
      poly(ctx, blade, grad);
      if (R.weapon === 'greatsword') {
        // Rune incandescenti lungo la scanalatura.
        ctx.save();
        ctx.shadowColor = css(color);
        ctx.shadowBlur = 6;
        ctx.strokeStyle = css(shade(color, 1.4));
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(along(3.5).x, along(3.5).y);
        ctx.lineTo(sh.x, sh.y);
        ctx.stroke();
        ctx.restore();
      } else if (R.weapon === 'cleaver') {
        ctx.strokeStyle = 'rgba(190,50,20,0.85)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(along(L * 0.7).x, along(L * 0.7).y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
      const gw = R.weapon === 'greatsword' ? 6.5 : R.weapon === 'dagger' ? 2.6 : 4.2;
      const gold = R.weapon === 'sword' ? 0xd8a848 : 0x3a3842;
      limb(ctx, off(g0, -gw), off(g0, gw), 1.3, 1.3, gold);
      tone(ctx, p0.x, p0.y, 1.5, gold);
    });
  }
  if (R.weapon === 'dagger' && !kneel) {
    // Secondo pugnale nell'altra mano, impugnato a rovescio: scatta in avanti quando colpisce.
    const d2 = pose === 'strike' ? v(0.2, 0.95, 0.1) : pose === 'windup' ? v(-0.3, -0.3, 0.9) : v(-0.1, 0.75, -0.55);
    const at = (t: number) => pr(v(oHand.s + d2.s * t, oHand.f + d2.f * t, oHand.z + d2.z * t));
    const a = at(1.5);
    const b = at(R.weaponLen * 0.9);
    add((a.d + b.d) / 2 + 0.015, () => {
      limb(ctx, at(-2.5), a, 1.1, 1.1, 0x3a3842);
      limb(ctx, a, b, 1.5, 0.3, 0xdfe3ee);
    });
  }
  if (R.weapon === 'bow') {
    const c = oHand;
    const topP = pr(v(c.s, c.f - 2.5, c.z + R.weaponLen));
    const botP = pr(v(c.s, c.f - 2.5, c.z - R.weaponLen));
    const belly = pr(v(c.s, c.f + 2.5, c.z));
    const nock = pr(v(c.s, c.f - 2.5 - bowDraw, c.z));
    const head2 = pr(v(c.s, c.f + 9 - bowDraw, c.z));
    add(belly.d + 0.02, () => {
      ctx.lineCap = 'round';
      for (const [wd, col] of [[3.6, OUTLINE], [1.9, css(0x6a4428)]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = wd;
        ctx.beginPath();
        ctx.moveTo(topP.x, topP.y);
        ctx.quadraticCurveTo(belly.x * 2 - (topP.x + botP.x) / 2, belly.y * 2 - (topP.y + botP.y) / 2, botP.x, botP.y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(220,210,190,0.9)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(topP.x, topP.y);
      ctx.lineTo(nock.x, nock.y);
      ctx.lineTo(botP.x, botP.y);
      ctx.stroke();
      if (pose !== 'strike') {
        ctx.strokeStyle = css(0x3a2a20);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nock.x, nock.y);
        ctx.lineTo(head2.x, head2.y);
        ctx.stroke();
        glowDot(ctx, head2, pose === 'windup' ? 1.7 : 1.1, 0xff8a30);
      }
    });
  }

  parts.sort((a, b) => a.d - b.d);
  for (const p of parts) p.draw();
}

/** Dipinge un fotogramma completo: figura, luce d'ambiente, ombra a terra. */
function paintFrame(ctx: Ctx, kind: ActorKind, color: number, dir: number, pose: Pose, frame: number): void {
  if (pose === 'dead') {
    // Il corpo a terra: la figura in piedi coricata e schiacciata, in una pozza scura.
    ctx.save();
    ctx.translate(-22, 2);
    ctx.scale(1, 0.55);
    ctx.rotate(Math.PI / 2);
    paintFigure(ctx, kind, color, 3, 'idle', 0);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(8,2,2,0.5)';
    ctx.fillRect(-HALF_W, -UP, HALF_W * 2, UP + DOWN);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'rgba(70,8,8,0.7)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  paintFigure(ctx, kind, color, dir, pose, frame);

  // Luce d'ambiente: tiepida dall'alto, brace dal basso, lato destro in ombra.
  ctx.globalCompositeOperation = 'source-atop';
  const up = ctx.createLinearGradient(0, -52, 0, 4);
  up.addColorStop(0, 'rgba(255,232,196,0.10)');
  up.addColorStop(0.55, 'rgba(0,0,0,0)');
  up.addColorStop(1, 'rgba(255,84,20,0.30)');
  ctx.fillStyle = up;
  ctx.fillRect(-HALF_W, -UP, HALF_W * 2, UP + DOWN);
  const side = ctx.createLinearGradient(-14, 0, 16, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(10,0,6,0.26)');
  ctx.fillStyle = side;
  ctx.fillRect(-HALF_W, -UP, HALF_W * 2, UP + DOWN);

  // Ombra a terra, sotto a tutto.
  ctx.globalCompositeOperation = 'destination-over';
  const R = rigFor(kind, color);
  const sh = ctx.createRadialGradient(0, 0, 1, 0, 0, R.shW + 9);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.scale(1, 0.5);
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, R.shW + 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

export interface FrameRequest {
  kind: ActorKind;
  color: number;
  scale: number;
  /** Angolo di mondo verso cui guarda. */
  facing: number;
  pose: Pose;
  /** Fase della camminata in radianti (solo per `walk`). */
  walk?: number;
}

export interface FrameInfo {
  key: string;
  /** Scala da dare all'immagine per riportarla alle dimensioni logiche. */
  displayScale: number;
  originY: number;
}

const TAU = Math.PI * 2;

/** Texture del fotogramma richiesto: dipinta al primo uso, poi riusata. */
export function actorFrame(scene: Phaser.Scene, o: FrameRequest): FrameInfo {
  const dead = o.pose === 'dead';
  const dir = dead ? 0 : ((Math.round((o.facing / TAU) * DIRS) % DIRS) + DIRS) % DIRS;
  const frame =
    o.pose === 'walk' ? ((Math.floor(((o.walk ?? 0) / TAU) * WALK_FRAMES) % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES : 0;
  // I personaggi grandi hanno già molti pixel: meno sovracampionamento, meno memoria.
  const res = o.scale > 1.6 ? 1.5 : 2;
  const key = `actor:${o.kind}:${o.color.toString(16)}:${o.scale}:${o.pose}:${dir}:${frame}`;
  if (!scene.textures.exists(key)) {
    const k = o.scale * res;
    const tex = scene.textures.createCanvas(key, Math.ceil(HALF_W * 2 * k), Math.ceil((UP + DOWN) * k))!;
    const ctx = tex.getContext();
    ctx.setTransform(k, 0, 0, k, HALF_W * k, UP * k);
    paintFrame(ctx, o.kind, o.color, dir, o.pose, frame);
    tex.refresh();
  }
  return { key, displayScale: 1 / res, originY: UP / (UP + DOWN) };
}
