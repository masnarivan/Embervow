import type { ActorKind } from '../render/sprites';
import type { TalentNode, TreeConfig } from '../skills/tree';
import { PLAYER } from './player';
import {
  MAGE_TALENTS, MAGE_TALENT_CONFIG, ROGUE_TALENTS, ROGUE_TALENT_CONFIG, TALENTS, TALENT_CONFIG,
} from './talents';

export interface Stats {
  maxHp: number;
  stamina: number;
  damage: number;
  defense: number;
}

/** Attacco base (tasto Q): un fendente ad arco o, con `projectile`, un dardo a distanza. */
export interface BasicAttack {
  cost: number;
  windup: number;
  active: number;
  recovery: number;
  /** Portata del fendente, o gittata del dardo. */
  range: number;
  halfArc: number;
  lungeSpeed: number;
  color: number;
  projectile?: { speed: number; color: number };
}

export interface ClassDef {
  id: string;
  name: string;
  /** Una riga per la scelta del personaggio. */
  blurb: string;
  base: Stats;
  perLevel: Stats;
  /**
   * Risorsa di classe. Rabbia (Guerriero): si accumula combattendo e cala fuori dal combattimento.
   * Mana (Mago): parte piena e si rigenera da sola.
   */
  rage: {
    name: string;
    color: number;
    max: number;
    onHit: number;
    onHurt: number;
    decayDelay: number;
    decayPerSec: number;
    regenPerSec?: number;
    startFull?: boolean;
  };
  attack: BasicAttack;
  /** Danno extra dei colpi alle spalle (0.5 = +50%). Assente: nessun bonus. */
  backstab?: number;
  /** Skill attive di base, nell'ordine dei tasti 1–4. */
  skills: string[];
  talents: TalentNode[];
  talentConfig: TreeConfig;
  look: { kind: ActorKind; color: number };
}

export const WARRIOR: ClassDef = {
  id: 'guerriero',
  name: 'Guerriero',
  blurb: 'Spada e scudo, corpo a corpo. Robusto: la rabbia cresce combattendo.',
  base: { maxHp: 100, stamina: 100, damage: 22, defense: 0 },
  perLevel: { maxHp: 12, stamina: 4, damage: 2, defense: 0.5 },
  rage: { name: 'Rabbia', color: 0xd0702a, max: 100, onHit: 9, onHurt: 6, decayDelay: 5, decayPerSec: 4 },
  attack: { ...PLAYER.attack, color: 0xf4ecd0 },
  skills: ['colpo_poderoso', 'turbine', 'carica', 'grido_di_guerra'],
  talents: TALENTS,
  talentConfig: TALENT_CONFIG,
  look: { kind: 'hero', color: 0x2f6fc8 },
};

export const MAGE: ClassDef = {
  id: 'mago',
  name: 'Mago',
  blurb: 'Dardi e incantesimi a distanza. Fragile: tieni lontani i nemici e dosa il mana.',
  base: { maxHp: 75, stamina: 90, damage: 17, defense: 0 },
  perLevel: { maxHp: 9, stamina: 4, damage: 2, defense: 0.25 },
  rage: {
    name: 'Mana', color: 0x4a7ae0, max: 100, onHit: 2, onHurt: 0, decayDelay: 0, decayPerSec: 0,
    regenPerSec: 6, startFull: true,
  },
  attack: {
    cost: 13, windup: 0.16, active: 0.08, recovery: 0.24, range: 7.5, halfArc: 0, lungeSpeed: 0,
    color: 0xa98cff, projectile: { speed: 14, color: 0xa98cff },
  },
  skills: ['globo_arcano', 'nova_arcana', 'traslazione', 'focus_arcano'],
  talents: MAGE_TALENTS,
  talentConfig: MAGE_TALENT_CONFIG,
  look: { kind: 'mage', color: 0x6a3fb8 },
};

export const ROGUE: ClassDef = {
  id: 'assassino',
  name: 'Assassino',
  blurb: 'Due pugnali, colpi rapidi. Alle spalle fa +50% danni: aggira, colpisci, sparisci.',
  base: { maxHp: 85, stamina: 110, damage: 15, defense: 0 },
  perLevel: { maxHp: 10, stamina: 5, damage: 1.6, defense: 0.35 },
  rage: { name: 'Slancio', color: 0xc8b040, max: 100, onHit: 10, onHurt: 0, decayDelay: 4, decayPerSec: 8 },
  attack: {
    cost: 10, windup: 0.08, active: 0.08, recovery: 0.14, range: 1.35, halfArc: (50 * Math.PI) / 180, lungeSpeed: 3,
    color: 0xe8e8f0,
  },
  backstab: 0.5,
  skills: ['stoccata', 'ventaglio_di_lame', 'passo_furtivo', 'velo_ombra'],
  talents: ROGUE_TALENTS,
  talentConfig: ROGUE_TALENT_CONFIG,
  look: { kind: 'rogue', color: 0x2f7a6a },
};

export const CLASSES: ClassDef[] = [WARRIOR, MAGE, ROGUE];

/** Classe con l'id dato; il Guerriero se manca o non esiste (salvataggi più vecchi). */
export function classById(id: string | undefined): ClassDef {
  return CLASSES.find((c) => c.id === id) ?? WARRIOR;
}
