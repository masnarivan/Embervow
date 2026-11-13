import Phaser from 'phaser';

// Stile condiviso di HUD e menu: ferro annerito, oro consumato, brace.

type Gfx = Phaser.GameObjects.Graphics;

export const FONT = 'Georgia, serif';

/** Colori del testo. */
export const INK = {
  text: '#e6d8bc',
  dim: '#9a8670',
  faint: '#7d6c5e',
  gold: '#f2c868',
  title: '#f0dcae',
  danger: '#e8765c',
  ok: '#8fd88a',
};

/** Colori delle superfici. */
export const PAINT = {
  night: 0x080405,
  panel: 0x150b0b,
  slot: 0x1e1210,
  slotLit: 0x33201a,
  iron: 0x3a2a26,
  gold: 0xb88a44,
  goldLit: 0xf2c868,
  ember: 0xd8581e,
  blood: 0x8a1410,
};

export function diamond(g: Gfx, x: number, y: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillPoints([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], true);
}

/** Pannello grande: fondo scuro, cornice di ferro, filetto d'oro e borchie agli angoli. */
export function frame(g: Gfx, x: number, y: number, w: number, h: number, alpha = 0.96): void {
  g.fillStyle(0x000000, 0.5);
  g.fillRect(x - 6, y - 6, w + 12, h + 12);
  g.fillStyle(PAINT.panel, alpha);
  g.fillRect(x, y, w, h);
  g.fillStyle(PAINT.blood, 0.1);
  g.fillRect(x, y, w, Math.min(60, h / 3));
  g.lineStyle(4, PAINT.iron, 1);
  g.strokeRect(x - 2, y - 2, w + 4, h + 4);
  g.lineStyle(1, PAINT.gold, 0.85);
  g.strokeRect(x + 4, y + 4, w - 8, h - 8);
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    diamond(g, cx, cy, 7, PAINT.iron);
    diamond(g, cx, cy, 4, PAINT.gold);
  }
}

/** Riquadro piccolo (slot, nodo, riga): fondo, bordo di ferro e filetto colorato. */
export function box(g: Gfx, x: number, y: number, w: number, h: number, fill: number, border: number, fillAlpha = 1): void {
  g.fillStyle(fill, fillAlpha);
  g.fillRect(x, y, w, h);
  g.lineStyle(3, PAINT.iron, 1);
  g.strokeRect(x - 1, y - 1, w + 2, h + 2);
  g.lineStyle(1, border, 1);
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

/** Filetto ornamentale centrato: due linee che sfumano e un rombo in mezzo. */
export function divider(g: Gfx, cx: number, y: number, w: number, color = PAINT.gold): void {
  const half = w / 2;
  for (let i = 0; i < 4; i++) {
    const a = 0.9 - i * 0.22;
    const x0 = 12 + (half - 12) * (i / 4);
    const x1 = 12 + (half - 12) * ((i + 1) / 4);
    g.lineStyle(1, color, a);
    g.lineBetween(cx - x1, y, cx - x0, y);
    g.lineBetween(cx + x0, y, cx + x1, y);
  }
  diamond(g, cx, y, 5, color);
  diamond(g, cx - 14, y, 2, color, 0.7);
  diamond(g, cx + 14, y, 2, color, 0.7);
}

/** Velo scuro dietro ai menu aperti sopra il gioco. */
export function backdrop(scene: Phaser.Scene, alpha: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0a0303, alpha).setOrigin(0);
}

/** Titolo: oro in alto che scende nella brace, con ombra. Il testo deve essere bianco. */
export function emblazon<T extends Phaser.GameObjects.Text>(t: T): T {
  t.setColor('#ffffff').setShadow(0, 3, '#000000', 8, true, true);
  t.setTint(0xffe9b4, 0xffe9b4, 0xd0682c, 0xd0682c);
  return t;
}

/** Voce di menu selezionata o no. */
export function menuLabel(label: string, selected: boolean): string {
  return selected ? `◆   ${label}   ◆` : label;
}

/** Braci che salgono sullo schermo (titolo). */
export class Embers {
  private g: Gfx;
  private list: { x: number; y: number; v: number; seed: number }[] = [];

  constructor(private scene: Phaser.Scene, count: number) {
    this.g = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < count; i++) {
      this.list.push({ x: Math.random(), y: Math.random(), v: 0.03 + Math.random() * 0.07, seed: Math.random() * 6.28 });
    }
  }

  update(now: number, dt: number): void {
    const { width, height } = this.scene.scale;
    const g = this.g.clear();
    for (const e of this.list) {
      e.y -= e.v * dt;
      if (e.y < -0.05) {
        e.y = 1.05;
        e.x = Math.random();
      }
      const x = (e.x + 0.02 * Math.sin(now / 900 + e.seed)) * width;
      const a = 0.35 + 0.35 * Math.sin(now / 260 + e.seed * 3);
      g.fillStyle(0xff6a20, a * 0.35);
      g.fillCircle(x, e.y * height, 3.5);
      g.fillStyle(0xffc060, a);
      g.fillCircle(x, e.y * height, 1.2);
    }
  }
}
