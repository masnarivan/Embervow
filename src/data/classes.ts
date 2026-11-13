export interface Stats {
  maxHp: number;
  stamina: number;
  damage: number;
  defense: number;
}

export interface ClassDef {
  id: string;
  name: string;
  base: Stats;
  perLevel: Stats;
  /** Risorsa di classe: si accumula combattendo e cala fuori dal combattimento. */
  rage: { max: number; onHit: number; onHurt: number; decayDelay: number; decayPerSec: number };
  /** Skill attive di base, nell'ordine dei tasti 1–4. */
  skills: string[];
}

export const WARRIOR: ClassDef = {
  id: 'guerriero',
  name: 'Guerriero',
  base: { maxHp: 100, stamina: 100, damage: 22, defense: 0 },
  perLevel: { maxHp: 12, stamina: 4, damage: 2, defense: 0.5 },
  rage: { max: 100, onHit: 9, onHurt: 6, decayDelay: 5, decayPerSec: 4 },
  skills: ['colpo_poderoso', 'turbine', 'carica', 'grido_di_guerra'],
};
