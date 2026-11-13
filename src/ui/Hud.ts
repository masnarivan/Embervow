import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { FONT as FACE, INK, PAINT, box, diamond, divider } from './theme';

const FONT = { fontFamily: FACE, color: INK.text };
const SLOT = 58;
const GAP = 8;

/** HUD fisso a schermo: vita, stamina, rabbia, livello, barra abilità, schermata di morte. */
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private hint: Phaser.GameObjects.Text;
  private prompt: Phaser.GameObjects.Text;
  private info: Phaser.GameObjects.Text;
  private level: Phaser.GameObjects.Text;
  private align: Phaser.GameObjects.Text;
  private death: Phaser.GameObjects.Text;
  private bossName: Phaser.GameObjects.Text;
  private slotKey: Phaser.GameObjects.Text[] = [];
  private slotName: Phaser.GameObjects.Text[] = [];
  private slotCd: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene) {
    const fixed = <T extends Phaser.GameObjects.Graphics | Phaser.GameObjects.Text>(o: T): T =>
      o.setScrollFactor(0).setDepth(100000) as T;
    const text = (size: number, color = FONT.color) =>
      fixed(scene.add.text(0, 0, '', { ...FONT, fontSize: `${size}px`, color })).setShadow(0, 1, '#000000', 3, false, true);

    this.g = fixed(scene.add.graphics());
    this.hint = text(13, INK.dim).setText(
      'Frecce muovi · Q attacca · Tab bersaglio · Spazio rotola · 1–4 abilità · E interagisci · T talenti · I inventario · Esc pausa',
    );
    this.prompt = text(18).setOrigin(0.5);
    this.info = text(15).setOrigin(1, 0);
    this.level = text(14);
    this.align = text(13, INK.dim);
    for (let i = 0; i < 4; i++) {
      this.slotKey.push(text(12, INK.gold));
      this.slotName.push(text(10).setOrigin(0.5, 1).setAlign('center').setWordWrapWidth(SLOT - 4));
      this.slotCd.push(text(20, '#ffffff').setOrigin(0.5));
    }
    this.bossName = text(18, INK.title).setOrigin(0.5, 1).setLetterSpacing(2);
    this.death = text(64, '#b01c14').setText('SEI MORTO').setOrigin(0.5).setAlpha(0).setDepth(100001).setLetterSpacing(8);
    this.death.setShadow(0, 0, '#ff3a1c', 18, false, true);
  }

  draw(
    player: Player,
    info: string,
    prompt: string,
    deathAlpha: number,
    boss: { name: string; frac: number } | null = null,
  ): void {
    const { width, height } = this.scene.scale;
    const g = this.g;
    g.clear();

    // Bordo rosso pulsante quando la vita è bassa
    if (player.state !== 'dead' && player.hp / player.maxHp < 0.3) {
      const t = 14;
      g.fillStyle(0x8a0000, 0.25 + 0.12 * Math.sin(Date.now() / 180));
      g.fillRect(0, 0, width, t);
      g.fillRect(0, height - t, width, t);
      g.fillRect(0, t, t, height - 2 * t);
      g.fillRect(width - t, t, t, height - 2 * t);
    }

    // Barre in alto a sinistra
    this.bar(20, 20, 280, 16, player.hp / player.maxHp, 0xb82418);
    this.bar(20, 43, 230, 10, player.stamina.current / player.stamina.max, player.noStaminaFlash > 0 ? 0xe0c040 : 0x3f9a4a);
    this.bar(20, 60, 180, 8, player.rage / player.maxRage, player.noRageFlash > 0 ? 0xffffff : 0xd0702a);
    this.bar(20, 76, 180, 4, player.xp / player.xpToNext, 0x8fe0c0);
    this.level
      .setPosition(214, 62)
      .setText(`${player.cls.name} · Liv. ${player.level}   ${Math.floor(player.xp)}/${player.xpToNext} XP`);
    const al = player.alignment;
    this.align.setPosition(20, 88).setText(`Luce ${al.balance('light')}  ·  Oscurità ${al.balance('dark')}`);

    // Barra abilità in basso al centro
    const total = player.skills.length * SLOT + (player.skills.length - 1) * GAP;
    const x0 = (width - total) / 2;
    const y0 = height - 50 - SLOT;
    player.skills.forEach((s, i) => {
      const x = x0 + i * (SLOT + GAP);
      const cd = player.cooldowns.remaining(s.id);
      const affordable =
        player.rage >= (s.cost.rage ?? 0) && player.stamina.current >= (s.cost.stamina ?? 0);
      const casting = player.activeSkill === s;

      const usable = cd <= 0 && affordable;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(x - 4, y0 - 4, SLOT + 8, SLOT + 8);
      box(g, x, y0, SLOT, SLOT, PAINT.slot, casting ? 0xffffff : usable ? PAINT.goldLit : PAINT.gold);
      g.fillStyle(s.color, usable ? 0.5 : 0.14);
      g.fillRect(x + 3, y0 + 3, SLOT - 6, SLOT - 6);
      if (cd > 0) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(x + 3, y0 + 3, SLOT - 6, (SLOT - 6) * (cd / s.cooldown));
      }
      // Rombo del costo: arancione = rabbia, verde = stamina
      diamond(g, x + SLOT - 9, y0 + 10, 5, 0x000000, 0.7);
      diamond(g, x + SLOT - 9, y0 + 10, 3.5, s.cost.rage ? 0xe07a2a : 0x4fae5a);

      this.slotKey[i].setPosition(x + 6, y0 + 4).setText(`${i + 1}`);
      this.slotName[i].setPosition(x + SLOT / 2, y0 + SLOT - 5).setText(s.name).setAlpha(cd > 0 ? 0.4 : 1);
      this.slotCd[i].setPosition(x + SLOT / 2, y0 + SLOT / 2 - 6).setText(cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : '');
    });

    this.hint.setPosition(20, height - 28);
    // Barra del boss sopra la barra abilità
    this.bossName.setVisible(!!boss);
    if (boss) {
      const bw = Math.min(520, width - 60);
      const bx = (width - bw) / 2;
      this.bar(bx, y0 - 30, bw, 12, boss.frac, 0xb01c14);
      diamond(g, bx - 3, y0 - 24, 9, PAINT.iron);
      diamond(g, bx - 3, y0 - 24, 5, PAINT.gold);
      diamond(g, bx + bw + 3, y0 - 24, 9, PAINT.iron);
      diamond(g, bx + bw + 3, y0 - 24, 5, PAINT.gold);
      divider(g, width / 2, y0 - 64, Math.min(300, bw));
      this.bossName.setPosition(width / 2, y0 - 38).setText(boss.name);
    }
    this.prompt.setPosition(width / 2, y0 - (boss ? 88 : 36)).setText(prompt);
    this.info.setPosition(width - 20, 20).setText(info);

    if (deathAlpha > 0) {
      g.fillStyle(0x000000, 0.6 * deathAlpha);
      g.fillRect(0, 0, width, height);
    }
    this.death.setPosition(width / 2, height / 2).setAlpha(deathAlpha);
  }

  private bar(x: number, y: number, w: number, h: number, frac: number, color: number): void {
    const g = this.g;
    const f = Phaser.Math.Clamp(frac, 0, 1);
    g.fillStyle(0x000000, 0.75);
    g.fillRect(x - 3, y - 3, w + 6, h + 6);
    g.lineStyle(1, PAINT.gold, 0.6);
    g.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    g.fillStyle(0x1c1112, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(color, 1);
    g.fillRect(x, y, w * f, h);
    // Riflesso in alto e ombra in basso: la barra sembra piena di liquido.
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(x, y, w * f, Math.max(1, h * 0.3));
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x, y + h * 0.7, w * f, h * 0.3);
  }
}
