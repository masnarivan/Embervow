import type { Side } from '../alignment/alignment';

/** Stato persistente del mondo: sopravvive a morti e riposi. */
export interface WorldState {
  /** Scelta fatta per ogni scelta morale. */
  choices: Record<string, Side>;
  openedChests: string[];
  bossDefeated: boolean;
  /** Indice dell'ultimo falò a cui si è riposato (punto di respawn). */
  lastBonfire: number;
}

export function newWorld(): WorldState {
  return { choices: {}, openedChests: [], bossDefeated: false, lastBonfire: 0 };
}
