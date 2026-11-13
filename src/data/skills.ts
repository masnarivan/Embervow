// Skill attive definite come dati: tempi, costi e una lista di effetti
// interpretati dal giocatore (vedi entities/Player.ts).

export type BuffStat = 'damage' | 'defense' | 'damageTaken';

export type SkillEffect =
  /** Colpo ad arco. `at`: all'inizio o alla fine della fase attiva. */
  | {
      type: 'arc';
      at: 'start' | 'end';
      range: number;
      halfArc: number;
      damageMult: number;
      breakPoise?: boolean;
      /** Frazione del danno inflitto restituita come vita. */
      lifesteal?: number;
    }
  /** Scatto in avanti per tutta la fase attiva. */
  | { type: 'dash'; speed: number }
  /** Moltiplicatore temporaneo a una statistica. */
  | { type: 'buff'; stat: BuffStat; mult: number; duration: number }
  /** Cura istantanea, in frazione della vita massima. */
  | { type: 'heal'; percent: number };

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  cost: { stamina?: number; rage?: number };
  windup: number;
  active: number;
  recovery: number;
  color: number;
  effects: SkillEffect[];
}

const deg = (d: number) => (d * Math.PI) / 180;

export const SKILLS: Record<string, SkillDef> = {
  // ---------- Base del Guerriero ----------
  colpo_poderoso: {
    id: 'colpo_poderoso',
    name: 'Colpo Poderoso',
    description: 'Fendente lento e pesante che spezza la guardia.',
    cooldown: 4,
    cost: { stamina: 30 },
    windup: 0.38,
    active: 0.12,
    recovery: 0.35,
    color: 0xffd27a,
    effects: [{ type: 'arc', at: 'start', range: 1.9, halfArc: deg(50), damageMult: 2.2, breakPoise: true }],
  },
  turbine: {
    id: 'turbine',
    name: 'Turbine',
    description: 'Rotazione che colpisce tutti i nemici intorno.',
    cooldown: 6,
    cost: { rage: 25 },
    windup: 0.18,
    active: 0.15,
    recovery: 0.3,
    color: 0xff9a5a,
    effects: [{ type: 'arc', at: 'start', range: 1.9, halfArc: Math.PI, damageMult: 1.3 }],
  },
  carica: {
    id: 'carica',
    name: 'Carica',
    description: 'Scatto in avanti che travolge chi trova all’arrivo.',
    cooldown: 8,
    cost: { stamina: 20 },
    windup: 0.12,
    active: 0.28,
    recovery: 0.25,
    color: 0x9fd0ff,
    effects: [
      { type: 'dash', speed: 13 },
      { type: 'arc', at: 'end', range: 1.7, halfArc: deg(70), damageMult: 1.2, breakPoise: true },
    ],
  },
  grido_di_guerra: {
    id: 'grido_di_guerra',
    name: 'Grido di Guerra',
    description: '+35% danni per 8 secondi.',
    cooldown: 20,
    cost: { rage: 20 },
    windup: 0.1,
    active: 0,
    recovery: 0.2,
    color: 0xff5a4a,
    effects: [{ type: 'buff', stat: 'damage', mult: 1.35, duration: 8 }],
  },

  // ---------- Paladino (Luce) ----------
  martello_sacro: {
    id: 'martello_sacro',
    name: 'Martello Sacro',
    description: 'Colpo pesante che spezza la guardia e cura.',
    cooldown: 4,
    cost: { stamina: 30 },
    windup: 0.38,
    active: 0.12,
    recovery: 0.35,
    color: 0xfff1a8,
    effects: [
      { type: 'arc', at: 'start', range: 1.9, halfArc: deg(50), damageMult: 2.2, breakPoise: true, lifesteal: 0.3 },
    ],
  },
  scudo_di_luce: {
    id: 'scudo_di_luce',
    name: 'Scudo di Luce',
    description: '−40% danni subiti per 6 secondi e cura.',
    cooldown: 18,
    cost: { rage: 20 },
    windup: 0.1,
    active: 0,
    recovery: 0.2,
    color: 0xf0e0a0,
    effects: [
      { type: 'buff', stat: 'damageTaken', mult: 0.6, duration: 6 },
      { type: 'heal', percent: 0.15 },
    ],
  },
  consacrazione: {
    id: 'consacrazione',
    name: 'Consacrazione',
    description: 'Colpo circolare ampio che cura.',
    cooldown: 7,
    cost: { rage: 25 },
    windup: 0.2,
    active: 0.15,
    recovery: 0.3,
    color: 0xffe68a,
    effects: [
      { type: 'arc', at: 'start', range: 2.2, halfArc: Math.PI, damageMult: 1.3 },
      { type: 'heal', percent: 0.1 },
    ],
  },
  giudizio: {
    id: 'giudizio',
    name: 'Giudizio',
    description: 'Scatto e colpo sacro all’arrivo.',
    cooldown: 9,
    cost: { stamina: 20 },
    windup: 0.12,
    active: 0.28,
    recovery: 0.25,
    color: 0xfff6c8,
    effects: [
      { type: 'dash', speed: 13 },
      { type: 'arc', at: 'end', range: 1.9, halfArc: deg(70), damageMult: 2, breakPoise: true, lifesteal: 0.25 },
    ],
  },

  // ---------- Berserker (Oscurità) ----------
  squarcio: {
    id: 'squarcio',
    name: 'Squarcio',
    description: 'Fendente rapido e devastante.',
    cooldown: 4,
    cost: { stamina: 25 },
    windup: 0.28,
    active: 0.1,
    recovery: 0.3,
    color: 0xd83a3a,
    effects: [{ type: 'arc', at: 'start', range: 1.8, halfArc: deg(45), damageMult: 2.6, breakPoise: true }],
  },
  frenesia: {
    id: 'frenesia',
    name: 'Frenesia',
    description: '+60% danni, +30% danni subiti per 8 secondi.',
    cooldown: 20,
    cost: { rage: 20 },
    windup: 0.1,
    active: 0,
    recovery: 0.2,
    color: 0xff3030,
    effects: [
      { type: 'buff', stat: 'damage', mult: 1.6, duration: 8 },
      { type: 'buff', stat: 'damageTaken', mult: 1.3, duration: 8 },
    ],
  },
  vortice_acciaio: {
    id: 'vortice_acciaio',
    name: 'Vortice d’Acciaio',
    description: 'Due rotazioni che colpiscono tutto intorno.',
    cooldown: 6,
    cost: { rage: 25 },
    windup: 0.15,
    active: 0.3,
    recovery: 0.3,
    color: 0xe0604a,
    effects: [
      { type: 'arc', at: 'start', range: 1.9, halfArc: Math.PI, damageMult: 1.1 },
      { type: 'arc', at: 'end', range: 1.9, halfArc: Math.PI, damageMult: 1.1 },
    ],
  },
  balzo_devastante: {
    id: 'balzo_devastante',
    name: 'Balzo Devastante',
    description: 'Balzo in avanti con atterraggio ad area.',
    cooldown: 9,
    cost: { stamina: 20 },
    windup: 0.12,
    active: 0.3,
    recovery: 0.3,
    color: 0xb02828,
    effects: [
      { type: 'dash', speed: 12 },
      { type: 'arc', at: 'end', range: 2, halfArc: Math.PI, damageMult: 2.4, breakPoise: true },
    ],
  },
};
