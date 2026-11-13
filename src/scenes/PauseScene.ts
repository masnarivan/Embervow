import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { CONTROLS } from '../ui/controls';
import { FONT, INK, backdrop, divider, emblazon, frame, menuLabel } from '../ui/theme';

export interface PauseData {
  /** Salva e torna al menu iniziale. */
  onQuit: () => void;
}

/** Menu di pausa: riprendi, audio, comandi, torna al titolo. */
export class PauseScene extends Phaser.Scene {
  private onQuit!: () => void;
  private index = 0;
  private texts: Phaser.GameObjects.Text[] = [];
  private controls!: Phaser.GameObjects.Container;

  constructor() {
    super('pause');
  }

  init(data: PauseData): void {
    this.onQuit = data.onQuit;
    this.index = 0;
    this.texts = [];
  }

  private labels(): string[] {
    return [
      'Riprendi',
      `Musica: ${audio.settings.music ? 'sì' : 'no'}`,
      `Effetti sonori: ${audio.settings.sfx ? 'sì' : 'no'}`,
      'Comandi',
      'Salva e torna al titolo',
    ];
  }

  create(): void {
    const { width, height } = this.scale;
    backdrop(this, 0.72);
    const g = this.add.graphics();
    const pw = Math.min(440, width - 32);
    const top = height * 0.25 - 50;
    frame(g, (width - pw) / 2, top, pw, height * 0.38 + 4 * 40 + 40 - top);
    divider(g, width / 2, height * 0.25 + 30, pw - 80);
    emblazon(this.add.text(width / 2, height * 0.25, 'PAUSA', { fontFamily: FONT, fontSize: '34px' }).setOrigin(0.5).setLetterSpacing(6));
    this.labels().forEach((_, i) => {
      this.texts.push(
        this.add.text(width / 2, height * 0.38 + i * 40, '', { fontFamily: FONT, fontSize: '20px' }).setOrigin(0.5),
      );
    });
    this.controls = this.add.container(width / 2, height * 0.36).setVisible(false);
    CONTROLS.forEach(([k, what], i) => {
      this.controls.add(this.add.text(-20, i * 24, k, { fontFamily: FONT, fontSize: '15px', color: INK.gold }).setOrigin(1, 0));
      this.controls.add(this.add.text(0, i * 24, what, { fontFamily: FONT, fontSize: '15px', color: INK.text }));
    });
    this.input.keyboard!.on('keydown', this.onKey, this);
    this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.controls.visible) {
      this.controls.setVisible(false);
      this.texts.forEach((t) => t.setVisible(true));
      return;
    }
    const n = this.texts.length;
    switch (e.code) {
      case 'Escape':
        if (!e.repeat) this.close();
        return;
      case 'ArrowUp':
        this.index = (this.index - 1 + n) % n;
        audio.play('ui');
        break;
      case 'ArrowDown':
        this.index = (this.index + 1) % n;
        audio.play('ui');
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.activate();
        break;
    }
    this.refresh();
  }

  private activate(): void {
    switch (this.index) {
      case 0:
        return this.close();
      case 1:
        audio.toggle('music');
        break;
      case 2:
        audio.toggle('sfx');
        audio.play('ui');
        break;
      case 3:
        this.controls.setVisible(true);
        this.texts.forEach((t) => t.setVisible(false));
        break;
      case 4:
        this.input.keyboard!.off('keydown', this.onKey, this);
        this.scene.stop();
        this.onQuit();
        break;
    }
  }

  private refresh(): void {
    const labels = this.labels();
    this.texts.forEach((t, i) => t.setText(menuLabel(labels[i], i === this.index)).setColor(i === this.index ? INK.gold : INK.text));
  }

  private close(): void {
    this.input.keyboard!.off('keydown', this.onKey, this);
    this.scene.stop();
    this.scene.resume('game');
  }
}
