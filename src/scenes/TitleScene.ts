import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { loadGame, saveStore, type SaveData } from '../save/save';
import { BACKGROUND, drawFlame } from '../render/terrain';
import { CONTROLS } from '../ui/controls';
import { Embers, FONT, INK, PAINT, divider, emblazon, menuLabel } from '../ui/theme';

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
  private embers!: Embers;

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
    this.add.rectangle(0, 0, width, height, BACKGROUND).setOrigin(0);
    this.fire = this.add.graphics();
    this.embers = new Embers(this, 60);

    emblazon(
      this.add.text(cx, height * 0.15, 'EMBERVOW', { fontFamily: FONT, fontSize: '60px' }).setOrigin(0.5).setLetterSpacing(10),
    );
    divider(this.add.graphics(), cx, height * 0.15 + 44, Math.min(420, width - 60));
    this.add
      .text(cx, height * 0.15 + 68, 'Satana ha rubato il vaso di Pandora. Dentro c’è ancora la speranza.', {
        fontFamily: FONT, fontSize: '16px', color: INK.dim, fontStyle: 'italic', align: 'center',
      })
      .setOrigin(0.5)
      .setWordWrapWidth(width - 40);
    this.info = this.add
      .text(cx, height - 96, '', { fontFamily: FONT, fontSize: '13px', color: INK.dim, align: 'center' })
      .setOrigin(0.5)
      .setShadow(0, 1, '#000000', 4, false, true);

    this.controls = this.add.container(cx, height * 0.62).setVisible(false);
    const cg = this.add.graphics();
    cg.fillStyle(PAINT.night, 0.85);
    cg.fillRect(-250, -20, 500, CONTROLS.length * 24 + 40);
    this.controls.add(cg);
    CONTROLS.forEach(([k, what], i) => {
      this.controls.add(this.add.text(-20, i * 24, k, { fontFamily: FONT, fontSize: '15px', color: INK.gold }).setOrigin(1, 0));
      this.controls.add(this.add.text(0, i * 24, what, { fontFamily: FONT, fontSize: '15px', color: INK.text }));
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
        this.add
          .text(width / 2, height * 0.56 + i * 42, e.label, { fontFamily: FONT, fontSize: '22px' })
          .setOrigin(0.5)
          .setShadow(0, 2, '#000000', 4, false, true),
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
      t.setText(menuLabel(e.label, sel)).setColor(!e.enabled ? INK.faint : sel ? INK.gold : INK.text);
    });
    if (this.controls.visible) this.info.setText('Premi un tasto per tornare');
    else if (this.confirmNew) this.info.setText('Una nuova partita cancella il salvataggio. Premi di nuovo Invio per confermare.').setColor(INK.danger);
    else {
      this.info
        .setText('Frecce e Invio per scegliere · Il gioco salva da solo: falò, scelte, forzieri e ogni pochi secondi')
        .setColor(INK.dim);
    }
  }

  update(time: number, delta: number): void {
    const { width, height } = this.scale;
    const g = this.fire.clear();
    const x = width / 2;
    const y = height * 0.4;

    // Fiamme lungo il fondo dello schermo: la bocca degli Inferi.
    g.fillStyle(0x7a1408, 0.35);
    g.fillRect(0, height - 26, width, 26);
    const n = Math.ceil(width / 46);
    for (let i = 0; i <= n; i++) {
      const size = 44 + 34 * Math.abs(Math.sin(i * 1.7));
      drawFlame(g, i * 46 + 8 * Math.sin(i * 3.1), height + 6, size, time, i * 1.3);
    }

    // Il vaso di Pandora: dentro c'è ancora la speranza.
    const pulse = 0.5 + 0.5 * Math.sin(time / 700);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0xffe6a0, 0.035 + 0.02 * pulse);
      g.fillEllipse(x, y - 22, 70 + i * 46, 60 + i * 34);
    }
    g.fillStyle(0x000000, 0.5);
    g.fillEllipse(x, y + 4, 56, 14);
    g.fillStyle(0x6a3a22, 1);
    g.fillEllipse(x, y - 18, 40, 46); // pancia
    g.fillRect(x - 8, y - 50, 16, 14); // collo
    g.fillEllipse(x, y + 2, 20, 7); // piede
    g.fillStyle(0x8a5230, 1);
    g.fillEllipse(x - 6, y - 22, 16, 30);
    g.fillStyle(0x3e2012, 1);
    g.fillRect(x - 12, y - 54, 24, 5); // orlo
    g.fillRect(x - 19, y - 26, 38, 3); // fascia
    g.lineStyle(3, 0x6a3a22, 1);
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.arc(x + sgn * 15, y - 36, 9, sgn > 0 ? -1.5 : Math.PI - 1.0, sgn > 0 ? 1.0 : Math.PI + 1.5);
      g.strokePath();
    }
    // La luce che filtra dall'orlo.
    g.fillStyle(0xfff0c0, 0.5 + 0.3 * pulse);
    g.fillEllipse(x, y - 54, 18, 4);
    g.fillStyle(0xfff0c0, 0.12 + 0.08 * pulse);
    g.fillTriangle(x - 9, y - 54, x + 9, y - 54, x, y - 96 - 10 * pulse);

    this.embers.update(time, delta / 1000);
  }
}
