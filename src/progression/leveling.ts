import type { ClassDef, Stats } from '../data/classes';

export const MAX_LEVEL = 20;

/** XP necessari per passare dal livello dato al successivo. */
export function xpToNext(level: number): number {
  // Prima area completa ≈ livello 2; il boss porta al 3.
  return Math.round(150 * level ** 1.5);
}

/** Aggiunge XP e risolve gli eventuali passaggi di livello. */
export function applyXp(level: number, xp: number, amount: number): { level: number; xp: number; gained: number } {
  let gained = 0;
  xp += amount;
  while (level < MAX_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    gained++;
  }
  if (level >= MAX_LEVEL) xp = 0;
  return { level, xp, gained };
}

export function statsForLevel(cls: ClassDef, level: number): Stats {
  const n = level - 1;
  return {
    maxHp: cls.base.maxHp + cls.perLevel.maxHp * n,
    stamina: cls.base.stamina + cls.perLevel.stamina * n,
    damage: cls.base.damage + cls.perLevel.damage * n,
    defense: cls.base.defense + cls.perLevel.defense * n,
  };
}
