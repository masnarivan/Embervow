import type { Alignment, Side } from '../alignment/alignment';

/** Modificatori permanenti dati dai talenti passivi. */
export interface Modifiers {
  maxHpMult: number;
  damageMult: number;
  damageTakenMult: number;
  rageGainMult: number;
  /** Vita rigenerata al secondo. */
  hpRegen: number;
  /** Frazione del danno inflitto restituita come vita. */
  lifesteal: number;
  /** Danno extra massimo (a vita quasi zero), cresce con la vita persa. */
  berserk: number;
  /** Una volta per riposo, un colpo mortale lascia in vita. */
  cheatDeath: boolean;
  /** Soglia di rabbia oltre cui l'attacco base non costa stamina (0 = disattivo). */
  freeAttackRage: number;
  /** Frazione della vita massima recuperata a ogni nemico ucciso. */
  killHeal: number;
  /** Bonus al moltiplicatore dei colpi alle spalle (si somma a quello della classe). */
  backstab: number;
  /** Frazione del danno di ogni colpo inflitta di nuovo come veleno, in 4 secondi. */
  poison: number;
}

export const NO_MODS: Readonly<Modifiers> = {
  maxHpMult: 1,
  damageMult: 1,
  damageTakenMult: 1,
  rageGainMult: 1,
  hpRegen: 0,
  lifesteal: 0,
  berserk: 0,
  cheatDeath: false,
  freeAttackRage: 0,
  killHeal: 0,
  backstab: 0,
  poison: 0,
};

export type Tier = 1 | 2 | 3;

export interface TalentNode {
  id: string;
  name: string;
  description: string;
  branch: Side;
  tier: Tier;
  /** Colonna (0–2) nella griglia del ramo, solo per la UI. */
  col: 0 | 1 | 2;
  cost: number;
  requires: string[];
  /** Talento attivo: sostituisce la skill base nello slot indicato. */
  replaces?: { slot: number; skill: string };
  /** Talento passivo: modificatori permanenti. */
  mods?: Partial<Modifiers>;
}

export interface TreeConfig {
  branchNames: Record<Side, string>;
  sideNames: Record<Side, string>;
  /** Punti GUADAGNATI (non il saldo) necessari per accedere a ogni livello del ramo. */
  tierThreshold: Record<Tier, number>;
  /** Se true, il primo talento imparato blocca per sempre l'altro ramo: nessun percorso neutro o ibrido. */
  exclusive: boolean;
}

export type LearnCheck = { ok: true } | { ok: false; reason: string };

export class SkillTree {
  private learned = new Set<string>();
  private byId: Map<string, TalentNode>;

  constructor(
    readonly nodes: readonly TalentNode[],
    readonly alignment: Alignment,
    readonly config: TreeConfig,
  ) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
  }

  node(id: string): TalentNode | undefined {
    return this.byId.get(id);
  }

  isLearned(id: string): boolean {
    return this.learned.has(id);
  }

  /** Ramo su cui il giocatore si è impegnato (il primo talento imparato), o null. */
  committedBranch(): Side | null {
    for (const id of this.learned) return this.byId.get(id)!.branch;
    return null;
  }

  check(id: string): LearnCheck {
    const n = this.byId.get(id);
    if (!n) return { ok: false, reason: 'Talento sconosciuto' };
    if (this.learned.has(id)) return { ok: false, reason: 'Già appreso' };
    const side = this.config.sideNames[n.branch];
    const committed = this.committedBranch();
    if (this.config.exclusive && committed && committed !== n.branch) {
      return { ok: false, reason: `Hai scelto la via del ${this.config.branchNames[committed]}: l’altra ti è preclusa` };
    }
    const threshold = this.config.tierThreshold[n.tier];
    if (!this.alignment.meetsThreshold(n.branch, threshold)) {
      return { ok: false, reason: `Serve ${side} guadagnata ≥ ${threshold} (hai ${this.alignment.totalEarned(n.branch)})` };
    }
    const missing = n.requires.filter((r) => !this.learned.has(r));
    if (missing.length > 0) {
      return { ok: false, reason: `Prima impara: ${missing.map((r) => this.byId.get(r)?.name ?? r).join(', ')}` };
    }
    const balance = this.alignment.balance(n.branch);
    if (balance < n.cost) return { ok: false, reason: `Servono ${n.cost} punti ${side} (ne hai ${balance})` };
    return { ok: true };
  }

  learn(id: string): boolean {
    if (!this.check(id).ok) return false;
    const n = this.byId.get(id)!;
    if (!this.alignment.trySpend(n.branch, n.cost)) return false;
    this.learned.add(id);
    return true;
  }

  /** Dimentica tutti i talenti e restituisce i punti spesi. */
  respec(): void {
    this.learned.clear();
    this.alignment.refund('light');
    this.alignment.refund('dark');
  }

  /** Skill per ciascuno slot dopo le sostituzioni dei talenti attivi. */
  slots(base: readonly string[]): string[] {
    const out = [...base];
    for (const id of this.learned) {
      const r = this.byId.get(id)!.replaces;
      if (r && r.slot < out.length) out[r.slot] = r.skill;
    }
    return out;
  }

  modifiers(): Modifiers {
    return combineMods([...this.learned].map((id) => this.byId.get(id)!.mods ?? {}));
  }

  toJSON(): string[] {
    return [...this.learned];
  }

  /** Per il caricamento: ripristina i talenti senza ricontrollare né spendere. */
  restore(ids: readonly string[]): void {
    this.learned = new Set(ids.filter((id) => this.byId.has(id)));
  }
}

/** Combina più fonti di modificatori (talenti, oggetti): moltiplicatori moltiplicati, il resto sommato. */
export function combineMods(list: readonly Partial<Modifiers>[]): Modifiers {
  const m: Modifiers = { ...NO_MODS };
  for (const x of list) {
    m.maxHpMult *= x.maxHpMult ?? 1;
    m.damageMult *= x.damageMult ?? 1;
    m.damageTakenMult *= x.damageTakenMult ?? 1;
    m.rageGainMult *= x.rageGainMult ?? 1;
    m.hpRegen += x.hpRegen ?? 0;
    m.lifesteal += x.lifesteal ?? 0;
    m.berserk += x.berserk ?? 0;
    m.killHeal += x.killHeal ?? 0;
    m.backstab += x.backstab ?? 0;
    m.poison += x.poison ?? 0;
    m.cheatDeath ||= !!x.cheatDeath;
    if (x.freeAttackRage) {
      m.freeAttackRage = m.freeAttackRage ? Math.min(m.freeAttackRage, x.freeAttackRage) : x.freeAttackRage;
    }
  }
  return m;
}
