import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { CLASSES, classById } from '../data/classes';
import { loadGame, saveStore, type SaveData } from '../save/save';
import { actorFrame } from '../render/sprites';
import { BACKGROUND, drawFlame } from '../render/terrain';
import { CONTROLS } from '../ui/controls';
import { Embers, FONT, INK, PAINT, box, divider, emblazon, menuLabel } from '../ui/theme';

const CARD_W = 250;
const CARD_H = 228;
const CARD_GAP = 28;

/** Dove i beta tester segnalano bug e impressioni. */
const FEEDBACK_URL = 'https://github.com/masnarivan/Embervow/issues/new';

interface Entry {
  label: string;
  enabled: boolean;
  action: () => void;
}

/** Menu iniziale: continua, nuova partita (con scelta del personaggio), comandi, segnalazione bug. */
export class TitleScene extends Phaser.Scene {
  private save: SaveData | null = null;
  private entries: Entry[] = [];
  private index = 0;
  private texts: Phaser.GameObjects.Text[] = [];
  private info!: Phaser.GameObjects.Text;
  private controls!: Phaser.GameObjects.Container;
  private confirmNew = false;
  /** Scelta del personaggio per una nuova partita. */
  private picker!: Phaser.GameObjects.Container;
  private pickerG!: Phaser.GameObjects.Graphics;
  private pickIndex = 0;
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
    this.pickIndex = 0;
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
      .setWordWrapWidth(width - 40)
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

    this.buildPicker();

    this.input.keyboard!.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard!.off('keydown', this.onKey, this));

    void loadGame().then((save) => {
      this.save = save;
      this.buildMenu();
      this.ready = true;
    });
  }

  /** Una scheda per classe: figura, nome, due righe e le due vie dei talenti. */
  private buildPicker(): void {
    const { width, height } = this.scale;
    const total = CLASSES.length * CARD_W + (CLASSES.length - 1) * CARD_GAP;
    const scale = Math.min(1, (width - 24) / total);
    this.picker = this.add.container(width / 2, height * 0.5).setScale(scale).setVisible(false);
    this.pickerG = this.add.graphics();
    this.picker.add(this.pickerG);
    this.picker.add(
      this.add.text(0, -34, 'Scegli chi scende negli Inferi', { fontFamily: FONT, fontSize: '20px', color: INK.title }).setOrigin(0.5),
    );
    CLASSES.forEach((c, i) => {
      const cx = -total / 2 + i * (CARD_W + CARD_GAP) + CARD_W / 2;
      const f = actorFrame(this, { kind: c.look.kind, color: c.look.color, scale: 1, facing: Math.PI / 4, pose: 'idle' });
      this.picker.add(this.add.image(cx, 84, f.key).setOrigin(0.5, f.originY).setScale(f.displayScale * 1.5));
      const line = (y: number, s: string, size: number, color: string) =>
        this.picker.add(
          this.add
            .text(cx, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' })
            .setOrigin(0.5, 0)
            .setWordWrapWidth(CARD_W - 28),
        );
      line(102, c.name, 22, INK.gold);
      line(132, c.blurb, 13, INK.text);
      const b = c.talentConfig.branchNames;
      line(186, `Luce: ${b.light}\nOscurità: ${b.dark}`, 12, INK.dim);
    });
  }

  private drawPicker(): void {
    const g = this.pickerG.clear();
    const total = CLASSES.length * CARD_W + (CLASSES.length - 1) * CARD_GAP;
    CLASSES.forEach((_, i) => {
      const x = -total / 2 + i * (CARD_W + CARD_GAP);
      const sel = i === this.pickIndex;
      g.fillStyle(0x000000, 0.5);
      g.fillRect(x - 4, -4, CARD_W + 8, CARD_H + 8);
      box(g, x, 0, CARD_W, CARD_H, PAINT.night, sel ? PAINT.goldLit : PAINT.iron, 0.92);
      if (sel) {
        g.lineStyle(2, PAINT.goldLit, 1);
        g.strokeRect(x - 5, -5, CARD_W + 10, CARD_H + 10);
      }
    });
  }

  private showPicker(show: boolean): void {
    this.picker.setVisible(show);
    this.texts.forEach((t) => t.setVisible(!show));
    if (show) this.drawPicker();
  }

  private onPickerKey(e: KeyboardEvent): void {
    const n = CLASSES.length;
    switch (e.code) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this.pickIndex = (this.pickIndex - 1 + n) % n;
        audio.play('ui');
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this.pickIndex = (this.pickIndex + 1) % n;
        audio.play('ui');
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space': {
        const cls = CLASSES[this.pickIndex].id;
        this.ready = false;
        void saveStore()
          .clear()
          .catch(() => undefined)
          .then(() => this.startGame(null, cls));
        return;
      }
      case 'Escape':
        this.confirmNew = false;
        this.showPicker(false);
        break;
    }
    if (this.picker.visible) this.drawPicker();
    this.refresh();
  }

  private buildMenu(): void {
    const { width, height } = this.scale;
    const s = this.save;
    this.entries = [
      {
        label: s ? `Continua  ·  ${classById(s.player.cls).name} Liv. ${s.player.level}` : 'Continua',
        enabled: !!s,
        action: () => this.startGame(this.save),
      },
      { label: 'Nuova partita', enabled: true, action: () => this.newGame() },
      { label: 'Comandi', enabled: true, action: () => this.showControls(true) },
      { label: 'Segnala un bug', enabled: true, action: () => this.openFeedback() },
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
    if (this.picker.visible) return this.onPickerKey(e);
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
    // Il salvataggio si cancella solo a personaggio scelto: fin lì si può tornare indietro.
    audio.play('ui');
    this.showPicker(true);
  }

  private startGame(save: SaveData | null, cls?: string): void {
    audio.play('rest');
    this.scene.start('game', { save, cls });
  }

  private openFeedback(): void {
    audio.play('ui');
    window.open(FEEDBACK_URL, '_blank', 'noopener');
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
    else if (this.picker.visible) {
      const warn = this.save ? ' · Confermando, il salvataggio attuale viene cancellato' : '';
      this.info.setText(`Sinistra e Destra per scegliere · Invio conferma · Esc torna indietro${warn}`).setColor(INK.dim);
    }
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
