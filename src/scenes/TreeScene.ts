import Phaser from 'phaser';
import type { Side } from '../alignment/alignment';
import { SKILLS, type SkillDef } from '../data/skills';
import { TALENTS, TALENT_CONFIG } from '../data/talents';
import type { Player } from '../entities/Player';
import type { TalentNode } from '../skills/tree';
import { navigate } from '../ui/treeNav';

const NODE_W = 104;
const NODE_H = 58;
const COL_GAP = 16;
const ROW_GAP = 40;
const BRANCH_GAP = 72;
const BRANCH_W = 3 * NODE_W + 2 * COL_GAP;
const TOTAL_W = 2 * BRANCH_W + BRANCH_GAP;
const TOTAL_H = 640;
const TREE_TOP = 200;
const SLOT_W = 150;
const SLOT_GAP = 12;
const SLOT_X0 = (TOTAL_W - (4 * SLOT_W + 3 * SLOT_GAP)) / 2;
const FONT = 'Georgia, serif';
const SIDES: Side[] = ['light', 'dark'];
const ROMAN = ['I', 'II', 'III'];

const COLORS: Record<Side, { main: number; dim: number; text: string }> = {
  light: { main: 0xe8c860, dim: 0x4a3f1c, text: '#f0d878' },
  dark: { main: 0xc83a3a, dim: 0x4a1c1c, text: '#ee7070' },
};

interface GridItem {
  node: TalentNode;
  gx: number;
  gy: number;
}

export interface TreeSceneData {
  player: Player;
  atBonfire: boolean;
}

function nodePos(n: TalentNode): { x: number; y: number } {
  const b = n.branch === 'light' ? 0 : 1;
  return {
    x: b * (BRANCH_W + BRANCH_GAP) + n.col * (NODE_W + COL_GAP),
    y: TREE_TOP + (n.tier - 1) * (NODE_H + ROW_GAP),
  };
}

function costText(s: SkillDef): string {
  return s.cost.rage ? `${s.cost.rage} rabbia` : `${s.cost.stamina ?? 0} stamina`;
}

/** Schermata dell'albero dei talenti: si apre sopra il gioco, che resta in pausa. */
export class TreeScene extends Phaser.Scene {
  private player!: Player;
  private atBonfire = false;
  private grid: GridItem[] = [];
  private selected!: GridItem;
  private root!: Phaser.GameObjects.Container;
  private g!: Phaser.GameObjects.Graphics;
  private nodeTexts = new Map<string, Phaser.GameObjects.Text>();
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private alignTexts = {} as Record<Side, Phaser.GameObjects.Text>;
  private detailTitle!: Phaser.GameObjects.Text;
  private detailBody!: Phaser.GameObjects.Text;
  private detailStatus!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('tree');
  }

  init(data: TreeSceneData): void {
    this.player = data.player;
    this.atBonfire = data.atBonfire;
    this.nodeTexts.clear();
    this.slotTexts = [];
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x06070a, 0.92).setOrigin(0);
    this.root = this.add.container(0, 0);
    const scale = Math.min(1, (width - 32) / TOTAL_W, (height - 24) / TOTAL_H);
    this.root.setScale(scale).setPosition((width - TOTAL_W * scale) / 2, (height - TOTAL_H * scale) / 2);
    this.g = this.add.graphics();
    this.root.add(this.g);

    const text = (x: number, y: number, s: string, size: number, color = '#d8d2c4') => {
      const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color });
      this.root.add(t);
      return t;
    };

    text(TOTAL_W / 2, 0, `Talenti del ${this.player.cls.name}`, 26).setOrigin(0.5, 0);
    text(TOTAL_W / 2, 40, 'Abilità sui tasti 1–4', 12, '#8f897c').setOrigin(0.5, 0);
    for (let i = 0; i < 4; i++) {
      const x = SLOT_X0 + i * (SLOT_W + SLOT_GAP);
      this.slotTexts.push(text(x + SLOT_W / 2, 82, '', 13).setOrigin(0.5));
    }

    SIDES.forEach((side, b) => {
      const cx = b * (BRANCH_W + BRANCH_GAP) + BRANCH_W / 2;
      text(cx, 120, `${TALENT_CONFIG.branchNames[side]} · via della ${TALENT_CONFIG.sideNames[side]}`, 19, COLORS[side].text)
        .setOrigin(0.5, 0);
      this.alignTexts[side] = text(cx, 148, '', 13, '#b8b2a4').setOrigin(0.5, 0);
    });

    // Etichette dei livelli tra i due rami, con la soglia di punti guadagnati.
    for (let t = 0; t < 3; t++) {
      const thr = TALENT_CONFIG.tierThreshold[(t + 1) as 1 | 2 | 3];
      text(BRANCH_W + BRANCH_GAP / 2, TREE_TOP + t * (NODE_H + ROW_GAP) + NODE_H / 2, `${ROMAN[t]}\n≥ ${thr}`, 13, '#8f897c')
        .setOrigin(0.5)
        .setAlign('center');
    }

    for (const node of TALENTS) {
      const { x, y } = nodePos(node);
      const t = text(x + NODE_W / 2, y + NODE_H / 2, '', 12)
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(NODE_W - 8);
      this.nodeTexts.set(node.id, t);
      const item: GridItem = { node, gx: (node.branch === 'light' ? 0 : 3) + node.col, gy: node.tier - 1 };
      this.grid.push(item);
      const zone = this.add.zone(x, y, NODE_W, NODE_H).setOrigin(0).setInteractive({ useHandCursor: true });
      this.root.add(zone);
      zone.on('pointerdown', () => {
        if (this.selected === item) this.learnSelected();
        else this.select(item);
      });
    }
    this.selected = this.grid[0];

    this.toast = text(TOTAL_W / 2, 174, '', 14).setOrigin(0.5, 0);
    this.detailTitle = text(0, 478, '', 18);
    this.detailBody = text(0, 504, '', 14).setWordWrapWidth(TOTAL_W).setLineSpacing(4);
    this.detailStatus = text(0, 586, '', 14);
    const keys = `Frecce scegli · Invio impara · R respec${this.atBonfire ? '' : ' (solo al falò)'} · T chiudi`;
    const debug = import.meta.env.DEV ? '   ·   debug: L +3 Luce, O +3 Oscurità' : '';
    text(TOTAL_W / 2, 618, keys + debug, 12, '#8f897c').setOrigin(0.5, 0);

    this.input.keyboard!.on('keydown', this.onKey, this);
    this.redraw();
  }

  private onKey(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft': return this.move(-1, 0);
      case 'ArrowRight': return this.move(1, 0);
      case 'ArrowUp': return this.move(0, -1);
      case 'ArrowDown': return this.move(0, 1);
      case 'Enter':
      case 'NumpadEnter':
        return this.learnSelected();
      case 'KeyR':
        return this.respec();
      case 'KeyT':
      case 'Escape':
        if (!e.repeat) this.close();
        return;
      case 'KeyL':
      case 'KeyO':
        if (import.meta.env.DEV) {
          const side: Side = e.code === 'KeyL' ? 'light' : 'dark';
          this.player.alignment.gain(side, 3);
          this.say(`+3 ${TALENT_CONFIG.sideNames[side]} (debug)`, '#b8b2a4');
          this.redraw();
        }
        return;
    }
  }

  private move(dx: number, dy: number): void {
    this.select(navigate(this.grid, this.selected, dx, dy));
  }

  private select(item: GridItem): void {
    this.selected = item;
    this.redraw();
  }

  private learnSelected(): void {
    const n = this.selected.node;
    const check = this.player.tree.check(n.id);
    if (!check.ok) {
      this.say(check.reason, '#e07a6a');
      return;
    }
    this.player.learnTalent(n.id);
    this.say(`Appreso: ${n.name}`, COLORS[n.branch].text);
    this.redraw();
  }

  private respec(): void {
    if (!this.atBonfire) {
      this.say('Il respec si fa solo riposando al falò', '#e07a6a');
      return;
    }
    if (this.player.tree.toJSON().length === 0) {
      this.say('Non hai talenti da dimenticare', '#b8b2a4');
      return;
    }
    this.player.respec();
    this.say('Talenti dimenticati: punti restituiti', '#b8b2a4');
    this.redraw();
  }

  private close(): void {
    this.input.keyboard!.off('keydown', this.onKey, this);
    this.scene.stop();
    this.scene.resume('game');
  }

  private say(msg: string, color: string): void {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(msg).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1800, duration: 500 });
  }

  private redraw(): void {
    const g = this.g;
    const p = this.player;
    const tree = p.tree;
    const cfg = TALENT_CONFIG;
    g.clear();

    // Slot abilità attuali
    const committed = tree.committedBranch();
    p.skills.forEach((s, i) => {
      const x = SLOT_X0 + i * (SLOT_W + SLOT_GAP);
      const upgraded = s.id !== p.cls.skills[i] && committed;
      g.fillStyle(upgraded ? COLORS[committed].dim : 0x1a1c22, 1);
      g.fillRect(x, 60, SLOT_W, 44);
      g.lineStyle(2, upgraded ? COLORS[committed].main : 0x45423b, 1);
      g.strokeRect(x, 60, SLOT_W, 44);
      this.slotTexts[i].setText(`${i + 1} · ${s.name}`);
    });

    for (const side of SIDES) {
      const name = cfg.sideNames[side];
      this.alignTexts[side].setText(
        `${name}: ${p.alignment.balance(side)} da spendere · ${p.alignment.totalEarned(side)} guadagnata in totale`,
      );
    }

    // Collegamenti ai prerequisiti
    for (const n of TALENTS) {
      const to = nodePos(n);
      for (const r of n.requires) {
        const req = tree.node(r);
        if (!req) continue;
        const from = nodePos(req);
        const lit = tree.isLearned(r);
        g.lineStyle(3, lit ? COLORS[n.branch].main : 0x34343a, lit ? 0.9 : 1);
        g.lineBetween(from.x + NODE_W / 2, from.y + NODE_H, to.x + NODE_W / 2, to.y);
      }
    }

    // Nodi
    for (const n of TALENTS) {
      const { x, y } = nodePos(n);
      const c = COLORS[n.branch];
      const learned = tree.isLearned(n.id);
      const available = !learned && tree.check(n.id).ok;
      g.fillStyle(learned ? c.main : available ? c.dim : 0x16171c, 1);
      g.fillRect(x, y, NODE_W, NODE_H);
      g.lineStyle(2, learned || available ? c.main : 0x34343a, 1);
      g.strokeRect(x, y, NODE_W, NODE_H);
      if (this.selected.node === n) {
        g.lineStyle(3, 0xffffff, 1);
        g.strokeRect(x - 5, y - 5, NODE_W + 10, NODE_H + 10);
      }
      const kind = n.replaces ? 'Attiva' : 'Passiva';
      this.nodeTexts
        .get(n.id)!
        .setText(`${n.name}\n${learned ? 'Appreso' : `${n.cost} pt`} · ${kind}`)
        .setColor(learned ? '#1a1408' : available ? '#ece6d6' : '#6a665c');
    }

    // Dettaglio del nodo selezionato
    const n = this.selected.node;
    const side = cfg.sideNames[n.branch];
    const lines: string[] = [];
    if (n.replaces) {
      const s = SKILLS[n.replaces.skill];
      const base = SKILLS[p.cls.skills[n.replaces.slot]];
      lines.push(`Attiva · sostituisce ${base.name} sul tasto ${n.replaces.slot + 1} · ${costText(s)} · ricarica ${s.cooldown} s`);
    } else {
      lines.push('Passiva · sempre attiva');
    }
    lines.push(n.description);
    const reqs = n.requires.map((r) => tree.node(r)?.name ?? r);
    lines.push(
      `Costo ${n.cost} ${side} · serve ${side} guadagnata ≥ ${cfg.tierThreshold[n.tier]}` +
        (reqs.length ? ` · dopo ${reqs.join(', ')}` : ''),
    );
    this.detailTitle.setText(n.name).setColor(COLORS[n.branch].text);
    this.detailBody.setText(lines.join('\n'));

    const check = tree.check(n.id);
    if (tree.isLearned(n.id)) this.detailStatus.setText('Appreso').setColor('#7fe08a');
    else if (check.ok) this.detailStatus.setText('Premi Invio (o clicca di nuovo) per imparare').setColor('#f0d878');
    else this.detailStatus.setText(check.reason).setColor('#e07a6a');
  }
}
