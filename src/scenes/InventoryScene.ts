import Phaser from 'phaser';
import { ITEMS, SLOTS, SLOT_NAMES, type ItemDef } from '../data/items';
import type { Player } from '../entities/Player';
import { FONT, INK, PAINT, backdrop, box, divider, emblazon, frame } from '../ui/theme';

const W = 640;
const H = 560;
const PAD = 28;
const LIST_TOP = 196;
const ROW_H = 30;

function bonusText(item: ItemDef): string {
  const parts: string[] = [];
  const b = item.bonus;
  if (b.damage) parts.push(`+${b.damage} danno`);
  if (b.defense) parts.push(`+${b.defense} difesa`);
  if (b.maxHp) parts.push(`+${b.maxHp} vita`);
  if (b.stamina) parts.push(`+${b.stamina} stamina`);
  if (item.mods?.hpRegen) parts.push(`rigenera ${item.mods.hpRegen} vita/s`);
  if (item.mods?.lifesteal) parts.push(`cura del ${Math.round(item.mods.lifesteal * 100)}% del danno`);
  return parts.join(' · ');
}

/** Inventario ed equipaggiamento: si apre sopra il gioco, che resta in pausa. */
export class InventoryScene extends Phaser.Scene {
  private player!: Player;
  private index = 0;
  private root!: Phaser.GameObjects.Container;
  private g!: Phaser.GameObjects.Graphics;
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private rows: Phaser.GameObjects.Text[] = [];
  private stats!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private empty!: Phaser.GameObjects.Text;

  constructor() {
    super('inventory');
  }

  init(data: { player: Player }): void {
    this.player = data.player;
    this.index = 0;
    this.slotTexts = [];
    this.rows = [];
  }

  create(): void {
    const { width, height } = this.scale;
    backdrop(this, 0.8);
    const scale = Math.min(1, (width - 32) / (W + 2 * PAD), (height - 24) / (H + 2 * PAD));
    this.root = this.add.container((width - W * scale) / 2, (height - H * scale) / 2).setScale(scale);
    const bg = this.add.graphics();
    frame(bg, -PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
    divider(bg, W / 2, 38, W - 120);
    this.g = this.add.graphics();
    this.root.add([bg, this.g]);
    const text = (x: number, y: number, s: string, size: number, color = INK.text) => {
      const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color });
      this.root.add(t);
      return t;
    };

    emblazon(text(W / 2, -4, 'EQUIPAGGIAMENTO', 24).setOrigin(0.5, 0).setLetterSpacing(4));
    SLOTS.forEach((_, i) => this.slotTexts.push(text(20 + i * 210 + 95, 78, '', 13).setOrigin(0.5).setAlign('center')));
    this.stats = text(W / 2, 128, '', 14, INK.dim).setOrigin(0.5, 0);
    text(0, 166, 'Oggetti', 16, INK.dim);
    for (let i = 0; i < 8; i++) this.rows.push(text(14, LIST_TOP + i * ROW_H + 6, '', 15));
    this.empty = text(14, LIST_TOP + 6, 'Nessun oggetto: cerca i forzieri e ascolta chi incontri.', 15, INK.faint);
    this.detail = text(0, 452, '', 14).setWordWrapWidth(W).setLineSpacing(4);
    this.status = text(0, 510, '', 14);
    text(W / 2, 540, 'Frecce scegli · Invio equipaggia / togli · I chiudi', 12, INK.dim).setOrigin(0.5, 0);

    this.input.keyboard!.on('keydown', this.onKey, this);
    this.redraw();
  }

  private onKey(e: KeyboardEvent): void {
    const n = this.player.inventory.length;
    switch (e.code) {
      case 'ArrowUp':
        if (n) this.index = (this.index - 1 + n) % n;
        break;
      case 'ArrowDown':
        if (n) this.index = (this.index + 1) % n;
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.toggle();
        break;
      case 'KeyI':
      case 'Escape':
        if (!e.repeat) this.close();
        return;
      default:
        return;
    }
    this.redraw();
  }

  private toggle(): void {
    const id = this.player.inventory[this.index];
    if (!id) return;
    const p = this.player;
    if (p.isEquipped(id)) p.unequip(ITEMS[id].slot);
    else p.equip(id);
  }

  private close(): void {
    this.input.keyboard!.off('keydown', this.onKey, this);
    this.scene.stop();
    this.scene.resume('game');
  }

  private redraw(): void {
    const g = this.g;
    const p = this.player;
    g.clear();

    SLOTS.forEach((slot, i) => {
      const x = 20 + i * 210;
      const id = p.equipped[slot];
      box(g, x, 50, 190, 56, id ? PAINT.slotLit : PAINT.slot, id ? PAINT.goldLit : PAINT.iron);
      this.slotTexts[i].setText(`${SLOT_NAMES[slot]}\n${id ? ITEMS[id].name : '—'}`).setColor(id ? INK.text : INK.faint);
    });
    this.stats.setText(
      `Vita ${p.maxHp}   ·   Danno ${p.attackDamage}   ·   Difesa ${p.defense}   ·   Stamina ${p.stamina.max}`,
    );

    const inv = p.inventory;
    this.empty.setVisible(inv.length === 0);
    this.rows.forEach((row, i) => {
      const id = inv[i];
      if (!id) {
        row.setText('');
        return;
      }
      const item = ITEMS[id];
      const ok = p.canEquip(id).ok;
      const y = LIST_TOP + i * ROW_H;
      if (i === this.index) {
        box(g, 0, y, W, ROW_H - 2, PAINT.slotLit, PAINT.goldLit);
      }
      const mark = p.isEquipped(id) ? '◆ ' : '   ';
      const lock = item.requires && !ok ? `   (serve ${item.requires.side === 'light' ? 'Luce' : 'Oscurità'} ${item.requires.earned})` : '';
      row
        .setText(`${mark}${item.name}  —  ${SLOT_NAMES[item.slot]}${lock}`)
        .setColor(ok ? (p.isEquipped(id) ? INK.gold : INK.text) : '#7a5a5a');
    });

    const id = inv[this.index];
    if (!id) {
      this.detail.setText('');
      this.status.setText('');
      return;
    }
    const item = ITEMS[id];
    this.detail.setText(`${item.name}: ${item.description}\n${bonusText(item)}`);
    const check = p.canEquip(id);
    if (p.isEquipped(id)) this.status.setText('Equipaggiato · Invio per toglierlo').setColor(INK.gold);
    else if (check.ok) this.status.setText('Invio per equipaggiarlo').setColor(INK.ok);
    else this.status.setText(check.reason).setColor(INK.danger);
  }
}
