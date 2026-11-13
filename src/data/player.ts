// Tempi e movimento del giocatore (secondi, distanze in tile).
// Le statistiche (vita, stamina, danno, difesa) stanno in data/classes.ts.
export const PLAYER = {
  radius: 0.3,
  speed: 4.2,

  stamina: { regenPerSec: 38, regenDelay: 0.7 },

  attack: {
    cost: 18,
    windup: 0.13,
    active: 0.1,
    recovery: 0.24,
    range: 1.55,
    halfArc: (55 * Math.PI) / 180,
    lungeSpeed: 2.2,
  },

  dodge: {
    cost: 25,
    duration: 0.36,
    speed: 9.5,
    iFrameStart: 0.04,
    iFrameEnd: 0.28,
  },

  staggerTime: 0.28,
  knockback: 6,
  inputBuffer: 0.22,
  /** Cura a ogni livello guadagnato, in frazione della vita massima. */
  levelUpHeal: 0.3,
};
