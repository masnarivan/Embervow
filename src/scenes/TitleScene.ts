import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { loadGame, saveStore, type SaveData } from '../save/save';
import { CONTROLS } from '../ui/controls';

const FONT = 'Georgia, serif';

interface Entry {
  label: string;
  enabled: boolean;
  action: () => void;
}

/** Menu iniziale: continua, nuova partita, comandi. */
export class TitleScene extends Phaser.Scene {
  private save: SaveData | null = null;
  private entries: Entry[] = [];
  private index = 0;
  private texts: Phaser.GameObjects.Text[] = [];
  private info!: Phaser.GameObjects.Text;
  private controls!: Phaser.GameObjects.Container;
  private confirmNew = false;
  private fire!: Phaser.GameObjects.Graphics;
  private ready = false;

  constructor() {
    super('title');
  }

  init(): void {
    this.texts = [];
    this.index = 0;
    this.confirmNew = false;
    this.ready = false;
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.add.rectangle(0, 0, width, height, 0x07080b).setOrigin(0);
    this.fire = this.add.graphics();

    this.add.text(cx, height * 0.2, 'Luce & Ombra', { fontFamily: FONT, fontSize: '56px', color: '#e8d8a8' }).setOrigin(0.5);
    this.add
      .text(cx, height * 0.2 + 48, 'Ogni scelta lascia un segno', { fontFamily: FONT, fontSize: '16px', color: '#8f897c' })
      .setOrigin(0.5);
    this.info = this.add
      .text(cx, height - 40, '', { fontFamily: FONT, fontSize: '13px', color: '#8f897c', align: 'center' })
      .setOrigin(0.5);

    this.controls = this.add.container(cx, height * 0.62).setVisible(false);
    CONTROLS.forEach(([k, what], i) => {
      this.controls.add(this.add.text(-20, i * 24, k, { fontFamily: FONT, fontSize: '15px', color: '#f0d878' }).setOrigin(1, 0));
      this.controls.add(this.add.text(0, i * 24, what, { fontFamily: FONT, fontSize: '15px', color: '#d8d2c4' }));
    });
    this.controls.y = height * 0.5 - (CONTROLS.length * 24) / 2;

    this.input.keyboard!.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard!.off('keydown', this.onKey, this));

    void loadGame().then((save) => {
      this.save = save;
      this.buildMenu();
      this.ready = true;
    });
  }

  private buildMenu(): void {
    const { width, height } = this.scale;
    const s = this.save;
    this.entries = [
      {
        label: s ? `Continua  ·  Liv. ${s.player.level}` : 'Continua',
        enabled: !!s,
        action: () => this.startGame(this.save),
      },
      { label: 'Nuova partita', enabled: true, action: () => this.newGame() },
      { label: 'Comandi', enabled: true, action: () => this.showControls(true) },
    ];
    this.index = s ? 0 : 1;
    this.entries.forEach((e, i) => {
      this.texts.push(
        this.add.text(width / 2, height * 0.5 + i * 44, e.label, { fontFamily: FONT, fontSize: '22px' }).setOrigin(0.5),
      );
    });
    this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    audio.music('explore');
    if (!this.ready) return;
    if (this.controls.visible) {
      this.showControls(false);
      return;
    }
    const n = this.entries.length;
    switch (e.code) {
      case 'ArrowUp':
        this.index = (this.index - 1 + n) % n;
        this.confirmNew = false;
        audio.play('ui');
        break;
      case 'ArrowDown':
        this.index = (this.index + 1) % n;
        this.confirmNew = false;
        audio.play('ui');
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space': {
        const entry = this.entries[this.index];
        if (entry.enabled) entry.action();
        else audio.play('denied');
        break;
      }
    }
    this.refresh();
  }

  private newGame(): void {
    // Con un salvataggio esistente serve una conferma: si perderebbe tutto.
    if (this.save && !this.confirmNew) {
      this.confirmNew = true;
      audio.play('denied');
      return;
    }
    void saveStore()
      .clear()
      .catch(() => undefined)
      .then(() => this.startGame(null));
  }

  private startGame(save: SaveData | null): void {
    audio.play('rest');
    this.scene.start('game', { save });
  }

  private showControls(show: boolean): void {
    this.controls.setVisible(show);
    this.texts.forEach((t) => t.setVisible(!show));
  }

  private refresh(): void {
    this.texts.forEach((t, i) => {
      const e = this.entries[i];
      const sel = i === this.index;
      t.setText(sel ? `—  ${e.label}  —` : e.label).setColor(!e.enabled ? '#4a4740' : sel ? '#f0d878' : '#b8b2a4');
    });
    if (this.controls.visible) this.info.setText('Premi un tasto per tornare');
    else if (this.confirmNew) this.info.setText('Una nuova partita cancella il salvataggio. Premi di nuovo Invio per confermare.').setColor('#e07a6a');
    else {
      this.info
        .setText('Frecce e Invio per scegliere · Il gioco salva da solo: falò, scelte, forzieri e ogni pochi secondi')
        .setColor('#8f897c');
    }
  }

  update(time: number): void {
    const { width, height } = this.scale;
    const g = this.fire.clear();
    const x = width / 2;
    const y = height * 0.38;
    const flick = Math.sin(time / 90) * 2;
    g.fillStyle(0xff8a20, 0.08);
    g.fillEllipse(x, y, 260, 90);
    g.fillStyle(0x3a2a1c, 1);
    g.fillEllipse(x, y, 40, 14);
    g.fillStyle(0xe8632a, 1);
    g.fillTriangle(x - 12, y, x + 12, y, x + flick, y - 36 - flick);
    g.fillStyle(0xffc23a, 1);
    g.fillTriangle(x - 6, y, x + 6, y, x - flick * 0.5, y - 18);
  }
}
