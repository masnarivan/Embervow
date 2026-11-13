import Phaser from 'phaser';
import type { MoralChoice } from '../data/choices';
import { FONT, INK, PAINT, backdrop, divider, frame } from '../ui/theme';

const W = 680;

export interface DialogData {
  choice: MoralChoice;
  /** Chiamata con l'indice dell'opzione scelta; ritorna il testo del risultato. */
  onChoose: (index: number) => string;
}

/** Dialogo di una scelta morale: 1/2 (o frecce + Invio) per scegliere, Esc per andarsene. */
export class DialogScene extends Phaser.Scene {
  private data_!: DialogData;
  private index = 0;
  private resolved = false;
  private body!: Phaser.GameObjects.Text;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private footer!: Phaser.GameObjects.Text;

  constructor() {
    super('dialog');
  }

  init(data: DialogData): void {
    this.data_ = data;
    this.index = 0;
    this.resolved = false;
    this.optionTexts = [];
  }

  create(): void {
    const { width, height } = this.scale;
    const scale = Math.min(1, (width - 32) / W);
    const boxH = 300;
    backdrop(this, 0.5);
    const root = this.add.container((width - W * scale) / 2, height - (boxH + 30) * scale).setScale(scale);
    const g = this.add.graphics();
    frame(g, 0, 0, W, boxH);
    divider(g, W / 2, 48, W - 80, PAINT.gold);
    root.add(g);
    const text = (x: number, y: number, s: string, size: number, color = INK.text) => {
      const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color });
      root.add(t);
      return t;
    };

    const c = this.data_.choice;
    text(W / 2, 16, c.title, 20, INK.title).setOrigin(0.5, 0);
    this.body = text(24, 62, c.text, 15).setWordWrapWidth(W - 48).setLineSpacing(5);
    c.options.forEach((o, i) => {
      const side = o.side === 'light' ? 'Luce' : 'Oscurità';
      this.optionTexts.push(text(24, 204 + i * 28, `${i + 1}.  ${o.label}   (via della ${side})`, 15));
    });
    this.footer = text(24, boxH - 30, '1 / 2 oppure frecce + Invio per scegliere · Esc per andartene', 12, INK.dim);

    this.input.keyboard!.on('keydown', this.onKey, this);
    this.redraw();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.resolved) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape' || e.code === 'KeyE') this.close();
      return;
    }
    switch (e.code) {
      case 'Digit1':
      case 'Numpad1':
        return this.choose(0);
      case 'Digit2':
      case 'Numpad2':
        return this.choose(1);
      case 'ArrowUp':
      case 'ArrowDown':
        this.index = 1 - this.index;
        return this.redraw();
      case 'Enter':
      case 'NumpadEnter':
        return this.choose(this.index);
      case 'Escape':
        return this.close();
    }
  }

  private choose(i: number): void {
    this.resolved = true;
    const result = this.data_.onChoose(i);
    this.body.setText(result);
    this.optionTexts.forEach((t) => t.setVisible(false));
    this.footer.setText('Invio per continuare');
  }

  private redraw(): void {
    this.optionTexts.forEach((t, i) => {
      const o = this.data_.choice.options[i];
      const side = o.side === 'light' ? 'Luce' : 'Oscurità';
      const sel = i === this.index;
      t.setText(`${sel ? '◆' : '◇'}  ${i + 1}.  ${o.label}   (via della ${side})`).setColor(sel ? INK.gold : INK.dim);
    });
  }

  private close(): void {
    this.input.keyboard!.off('keydown', this.onKey, this);
    this.scene.stop();
    this.scene.resume('game');
  }
}
