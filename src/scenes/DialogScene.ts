import Phaser from 'phaser';
import type { MoralChoice } from '../data/choices';

const FONT = 'Georgia, serif';
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
    this.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0);
    const root = this.add.container((width - W * scale) / 2, height - (boxH + 30) * scale).setScale(scale);
    const g = this.add.graphics();
    g.fillStyle(0x0d0e12, 0.96);
    g.fillRect(0, 0, W, boxH);
    g.lineStyle(2, 0x6a604a, 1);
    g.strokeRect(0, 0, W, boxH);
    root.add(g);
    const text = (x: number, y: number, s: string, size: number, color = '#d8d2c4') => {
      const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color });
      root.add(t);
      return t;
    };

    const c = this.data_.choice;
    text(24, 18, c.title, 20, '#e8d8a8');
    this.body = text(24, 54, c.text, 15).setWordWrapWidth(W - 48).setLineSpacing(5);
    c.options.forEach((o, i) => {
      const side = o.side === 'light' ? 'Luce' : 'Oscurità';
      this.optionTexts.push(text(24, 196 + i * 30, `${i + 1}.  ${o.label}   (via della ${side})`, 15));
    });
    this.footer = text(24, boxH - 30, '1 / 2 oppure frecce + Invio per scegliere · Esc per andartene', 12, '#8f897c');

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
    this.optionTexts.forEach((t, i) => t.setColor(i === this.index ? '#f0d878' : '#b8b2a4'));
  }

  private close(): void {
    this.input.keyboard!.off('keydown', this.onKey, this);
    this.scene.stop();
    this.scene.resume('game');
  }
}
