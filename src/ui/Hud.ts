import Phaser from 'phaser';
import type { Player } from '../entities/Player';

const FONT = { fontFamily: 'Georgia, serif', color: '#d8d2c4' };
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
      fixed(scene.add.text(0, 0, '', { ...FONT, fontSize: `${size}px`, color }));

    this.g = fixed(scene.add.graphics());
    this.hint = text(13, '#8f897c').setText(
      'Frecce muovi · Q attacca · Tab bersaglio · Spazio rotola · 1–4 abilità · E interagisci · T talenti · I inventario · Esc pausa',
    );
    this.prompt = text(18).setOrigin(0.5);
    this.info = text(15).setOrigin(1, 0);
    this.level = text(14);
    this.align = text(13, '#b8b2a4');
    for (let i = 0; i < 4; i++) {
      this.slotKey.push(text(12, '#b8b2a4'));
      this.slotName.push(text(10).setOrigin(0.5, 1).setAlign('center').setWordWrapWidth(SLOT - 4));
      this.slotCd.push(text(20, '#ffffff').setOrigin(0.5));
    }
    this.bossName = text(15, '#e8d8a8').setOrigin(0.5, 1);
    this.death = text(64, '#a01818').setText('SEI MORTO').setOrigin(0.5).setAlpha(0).setDepth(100001);
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
    this.bar(20, 20, 280, 16, player.hp / player.maxHp, 0xa32222);
    this.bar(20, 42, 230, 10, player.stamina.current / player.stamina.max, player.noStaminaFlash > 0 ? 0xe0c040 : 0x3f9a4a);
    this.bar(20, 58, 180, 8, player.rage / player.maxRage, player.noRageFlash > 0 ? 0xffffff : 0xd0702a);
    this.bar(20, 72, 180, 4, player.xp / player.xpToNext, 0x8fe0c0);
    this.level
      .setPosition(210, 60)
      .setText(`${player.cls.name} · Liv. ${player.level}   ${Math.floor(player.xp)}/${player.xpToNext} XP`);
    const al = player.alignment;
    this.align.setPosition(20, 84).setText(`Luce ${al.balance('light')}  ·  Oscurità ${al.balance('dark')}`);

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

      g.fillStyle(0x000000, 0.75);
      g.fillRect(x - 2, y0 - 2, SLOT + 4, SLOT + 4);
      g.fillStyle(s.color, cd > 0 || !affordable ? 0.18 : 0.55);
      g.fillRect(x, y0, SLOT, SLOT);
      if (cd > 0) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(x, y0, SLOT, SLOT * (cd / s.cooldown));
      }
      g.lineStyle(2, casting ? 0xffffff : 0x6a665c, 1);
      g.strokeRect(x, y0, SLOT, SLOT);
      // Tacca del costo: arancione = rabbia, verde = stamina
      g.fillStyle(s.cost.rage ? 0xd0702a : 0x3f9a4a, 1);
      g.fillRect(x + SLOT - 10, y0 + 4, 6, 6);

      this.slotKey[i].setPosition(x + 4, y0 + 2).setText(`${i + 1}`);
      this.slotName[i].setPosition(x + SLOT / 2, y0 + SLOT - 3).setText(s.name).setAlpha(cd > 0 ? 0.4 : 1);
      this.slotCd[i].setPosition(x + SLOT / 2, y0 + SLOT / 2 - 6).setText(cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : '');
    });

    this.hint.setPosition(20, height - 28);
    // Barra del boss sopra la barra abilità
    this.bossName.setVisible(!!boss);
    if (boss) {
      const bw = Math.min(520, width - 60);
      this.bar((width - bw) / 2, y0 - 30, bw, 12, boss.frac, 0x9a1c1c);
      this.bossName.setPosition(width / 2, y0 - 36).setText(boss.name);
    }
    this.prompt.setPosition(width / 2, y0 - (boss ? 74 : 36)).setText(prompt);
    this.info.setPosition(width - 20, 20).setText(info);

    if (deathAlpha > 0) {
      g.fillStyle(0x000000, 0.6 * deathAlpha);
      g.fillRect(0, 0, width, height);
    }
    this.death.setPosition(width / 2, height / 2).setAlpha(deathAlpha);
  }

  private bar(x: number, y: number, w: number, h: number, frac: number, color: number): void {
    const g = this.g;
    g.fillStyle(0x000000, 0.7);
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle(0x2a2a30, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(color, 1);
    g.fillRect(x, y, w * Phaser.Math.Clamp(frac, 0, 1), h);
  }
}
