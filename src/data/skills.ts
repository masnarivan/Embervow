// Skill attive definite come dati: tempi, costi e una lista di effetti
// interpretati dal giocatore (vedi entities/Player.ts).

/** `stealth`: furtività; il suo `mult` moltiplica il primo colpo sferrato da nascosti, che la interrompe. */
export type BuffStat = 'damage' | 'defense' | 'damageTaken' | 'stealth';

/** Veleno: `mult` × il danno d'attacco, distribuito su `duration` secondi. */
export interface PoisonSpec {
  mult: number;
  duration: number;
}

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
      poison?: PoisonSpec;
    }
  /** Proiettile lanciato nella direzione della mira. */
  | {
      type: 'bolt';
      at: 'start' | 'end';
      speed: number;
      range: number;
      damageMult: number;
      radius?: number;
      breakPoise?: boolean;
      lifesteal?: number;
      pierce?: boolean;
      /** Raggio dell'esplosione all'impatto. */
      explode?: number;
      /** Più proiettili aperti a ventaglio sull'angolo `spread`. */
      count?: number;
      spread?: number;
      poison?: PoisonSpec;
    }
  /** Scatto in avanti per tutta la fase attiva. `phase`: intoccabile durante lo scatto. */
  | { type: 'dash'; speed: number; phase?: boolean }
  /** Evoca alleati a tempo che combattono da soli. */
  | { type: 'summon'; count: number; duration: number; damageMult: number }
  /** Moltiplicatore temporaneo a una statistica. */
  | { type: 'buff'; stat: BuffStat; mult: number; duration: number }
  /** Cura istantanea, in frazione della vita massima. */
  | { type: 'heal'; percent: number };

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  /** `rage` è la risorsa di classe: rabbia per il Guerriero, mana per il Mago. */
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

  // ---------- Base del Mago ----------
  globo_arcano: {
    id: 'globo_arcano',
    name: 'Globo Arcano',
    description: 'Sfera lenta e pesante che spezza la guardia.',
    cooldown: 4,
    cost: { rage: 20 },
    windup: 0.4,
    active: 0.1,
    recovery: 0.3,
    color: 0xa98cff,
    effects: [{ type: 'bolt', at: 'start', speed: 9, range: 8, damageMult: 2.2, radius: 0.24, breakPoise: true }],
  },
  nova_arcana: {
    id: 'nova_arcana',
    name: 'Nova Arcana',
    description: 'Onda che colpisce tutti i nemici intorno.',
    cooldown: 7,
    cost: { rage: 25 },
    windup: 0.2,
    active: 0.15,
    recovery: 0.3,
    color: 0x8f7cff,
    effects: [{ type: 'arc', at: 'start', range: 2.2, halfArc: Math.PI, damageMult: 1.3 }],
  },
  traslazione: {
    id: 'traslazione',
    name: 'Traslazione',
    description: 'Ti sposti in un lampo: durante il passaggio sei intoccabile.',
    cooldown: 7,
    cost: { stamina: 20 },
    windup: 0.06,
    active: 0.16,
    recovery: 0.14,
    color: 0x9fd0ff,
    effects: [{ type: 'dash', speed: 24, phase: true }],
  },
  focus_arcano: {
    id: 'focus_arcano',
    name: 'Focus Arcano',
    description: '+35% danni per 8 secondi.',
    cooldown: 20,
    cost: { rage: 20 },
    windup: 0.1,
    active: 0,
    recovery: 0.2,
    color: 0xc0a0ff,
    effects: [{ type: 'buff', stat: 'damage', mult: 1.35, duration: 8 }],
  },

  // ---------- Elementalista (Luce) ----------
  palla_di_fuoco: {
    id: 'palla_di_fuoco',
    name: 'Palla di Fuoco',
    description: 'Esplode all’impatto e brucia tutto ciò che ha intorno.',
    cooldown: 4,
    cost: { rage: 20 },
    windup: 0.4,
    active: 0.1,
    recovery: 0.3,
    color: 0xff8a30,
    effects: [
      { type: 'bolt', at: 'start', speed: 10, range: 8, damageMult: 2.2, radius: 0.26, breakPoise: true, explode: 1.7 },
    ],
  },
  forma_elementale: {
    id: 'forma_elementale',
    name: 'Forma Elementale',
    description: '+45% danni e −20% danni subiti per 8 secondi.',
    cooldown: 20,
    cost: { rage: 20 },
    windup: 0.1,
    active: 0,
    recovery: 0.2,
    color: 0xffc860,
    effects: [
      { type: 'buff', stat: 'damage', mult: 1.45, duration: 8 },
      { type: 'buff', stat: 'damageTaken', mult: 0.8, duration: 8 },
    ],
  },
  nova_di_gelo: {
    id: 'nova_di_gelo',
    name: 'Nova di Gelo',
    description: 'Onda di ghiaccio più ampia che spezza la guardia e blocca i nemici.',
    cooldown: 8,
    cost: { rage: 25 },
    windup: 0.2,
    active: 0.15,
    recovery: 0.3,
    color: 0x9fe4ff,
    effects: [{ type: 'arc', at: 'start', range: 2.8, halfArc: Math.PI, damageMult: 1.5, breakPoise: true }],
  },
  passo_del_fulmine: {
    id: 'passo_del_fulmine',
    name: 'Passo del Fulmine',
    description: 'Traslazione che scarica un fulmine all’arrivo.',
    cooldown: 8,
    cost: { stamina: 20 },
    windup: 0.06,
    active: 0.16,
    recovery: 0.2,
    color: 0xfff28a,
    effects: [
      { type: 'dash', speed: 24, phase: true },
      { type: 'arc', at: 'end', range: 2, halfArc: Math.PI, damageMult: 2, breakPoise: true },
    ],
  },

  // ---------- Negromante (Oscurità) ----------
  lancia_ossa: {
    id: 'lancia_ossa',
    name: 'Lancia d’Ossa',
    description: 'Trapassa tutti i nemici in fila.',
    cooldown: 4,
    cost: { rage: 20 },
    windup: 0.32,
    active: 0.1,
    recovery: 0.3,
    color: 0xd8e8c0,
    effects: [
      { type: 'bolt', at: 'start', speed: 15, range: 9, damageMult: 2.4, radius: 0.22, breakPoise: true, pierce: true },
    ],
  },
  evoca_spettri: {
    id: 'evoca_spettri',
    name: 'Evoca Spettri',
    description: 'Due spettri combattono al tuo fianco per 15 secondi.',
    cooldown: 24,
    cost: { rage: 35 },
    windup: 0.35,
    active: 0,
    recovery: 0.25,
    color: 0x7fe0b0,
    effects: [{ type: 'summon', count: 2, duration: 15, damageMult: 0.55 }],
  },
  nova_di_morte: {
    id: 'nova_di_morte',
    name: 'Nova di Morte',
    description: 'Onda che risucchia la vita di chi colpisce.',
    cooldown: 7,
    cost: { rage: 25 },
    windup: 0.2,
    active: 0.15,
    recovery: 0.3,
    color: 0x6fd08a,
    effects: [{ type: 'arc', at: 'start', range: 2.3, halfArc: Math.PI, damageMult: 1.4, lifesteal: 0.5 }],
  },
  passo_ombra: {
    id: 'passo_ombra',
    name: 'Passo d’Ombra',
    description: 'Traslazione che squarcia l’ombra alla partenza e all’arrivo.',
    cooldown: 8,
    cost: { stamina: 20 },
    windup: 0.06,
    active: 0.16,
    recovery: 0.2,
    color: 0x8a5ad0,
    effects: [
      { type: 'arc', at: 'start', range: 1.8, halfArc: Math.PI, damageMult: 1.2, lifesteal: 0.2 },
      { type: 'dash', speed: 24, phase: true },
      { type: 'arc', at: 'end', range: 1.8, halfArc: Math.PI, damageMult: 1.2, lifesteal: 0.2 },
    ],
  },

  // ---------- Base dell'Assassino ----------
  stoccata: {
    id: 'stoccata',
    name: 'Stoccata',
    description: 'Pugnalata secca e precisa che spezza la guardia.',
    cooldown: 4,
    cost: { stamina: 25 },
    windup: 0.2,
    active: 0.1,
    recovery: 0.26,
    color: 0xe8e8f0,
    effects: [{ type: 'arc', at: 'start', range: 1.6, halfArc: deg(35), damageMult: 2.2, breakPoise: true }],
  },
  ventaglio_di_lame: {
    id: 'ventaglio_di_lame',
    name: 'Ventaglio di Lame',
    description: 'Cinque coltelli lanciati a ventaglio.',
    cooldown: 6,
    cost: { rage: 25 },
    windup: 0.16,
    active: 0.08,
    recovery: 0.24,
    color: 0xcfd6e6,
    effects: [
      { type: 'bolt', at: 'start', speed: 15, range: 6, damageMult: 0.65, radius: 0.12, count: 5, spread: deg(50) },
    ],
  },
  passo_furtivo: {
    id: 'passo_furtivo',
    name: 'Passo Furtivo',
    description: 'Scatto intoccabile che attraversa i nemici: finisci alle loro spalle.',
    cooldown: 6,
    cost: { stamina: 20 },
    windup: 0.05,
    active: 0.15,
    recovery: 0.1,
    color: 0x7a8aa8,
    effects: [{ type: 'dash', speed: 22, phase: true }],
  },
  velo_ombra: {
    id: 'velo_ombra',
    name: 'Velo d’Ombra',
    description: 'Sparisci per 4 secondi: i nemici ti perdono. Il primo colpo da nascosto fa +50% danni.',
    cooldown: 18,
    cost: { stamina: 30 },
    windup: 0.1,
    active: 0,
    recovery: 0.15,
    color: 0x5a5a7a,
    effects: [{ type: 'buff', stat: 'stealth', mult: 1.5, duration: 4 }],
  },

  // ---------- Duellante (Luce) ----------
  affondo: {
    id: 'affondo',
    name: 'Affondo',
    description: 'Balzo in avanti e stoccata lunga.',
    cooldown: 4,
    cost: { stamina: 25 },
    windup: 0.14,
    active: 0.12,
    recovery: 0.26,
    color: 0xfff1c8,
    effects: [
      { type: 'dash', speed: 13 },
      { type: 'arc', at: 'end', range: 2, halfArc: deg(35), damageMult: 2.5, breakPoise: true },
    ],
  },
  guardia_del_duellante: {
    id: 'guardia_del_duellante',
    name: 'Guardia del Duellante',
    description: '−50% danni subiti e +25% danni per 6 secondi.',
    cooldown: 18,
    cost: { stamina: 30 },
    windup: 0.1,
    active: 0,
    recovery: 0.15,
    color: 0xf0e0a0,
    effects: [
      { type: 'buff', stat: 'damageTaken', mult: 0.5, duration: 6 },
      { type: 'buff', stat: 'damage', mult: 1.25, duration: 6 },
    ],
  },
  tempesta_di_lame: {
    id: 'tempesta_di_lame',
    name: 'Tempesta di Lame',
    description: 'Sette coltelli che trapassano i nemici.',
    cooldown: 6,
    cost: { rage: 25 },
    windup: 0.16,
    active: 0.08,
    recovery: 0.24,
    color: 0xfff6d8,
    effects: [
      {
        type: 'bolt', at: 'start', speed: 16, range: 7, damageMult: 0.75, radius: 0.12, count: 7, spread: deg(70),
        pierce: true,
      },
    ],
  },
  passo_del_vento: {
    id: 'passo_del_vento',
    name: 'Passo del Vento',
    description: 'Scatto intoccabile che taglia tutto intorno all’arrivo.',
    cooldown: 7,
    cost: { stamina: 20 },
    windup: 0.05,
    active: 0.15,
    recovery: 0.16,
    color: 0xe8f0ff,
    effects: [
      { type: 'dash', speed: 22, phase: true },
      { type: 'arc', at: 'end', range: 1.8, halfArc: Math.PI, damageMult: 1.8 },
    ],
  },

  // ---------- Sicario (Oscurità) ----------
  morso_della_vipera: {
    id: 'morso_della_vipera',
    name: 'Morso della Vipera',
    description: 'Pugnalata che avvelena a fondo.',
    cooldown: 4,
    cost: { stamina: 25 },
    windup: 0.2,
    active: 0.1,
    recovery: 0.26,
    color: 0x8fd060,
    effects: [
      {
        type: 'arc', at: 'start', range: 1.6, halfArc: deg(35), damageMult: 2.2, breakPoise: true,
        poison: { mult: 2, duration: 5 },
      },
    ],
  },
  agguato: {
    id: 'agguato',
    name: 'Agguato',
    description: 'Sparisci per 6 secondi. Il primo colpo da nascosto fa +150% danni.',
    cooldown: 18,
    cost: { stamina: 30 },
    windup: 0.1,
    active: 0,
    recovery: 0.15,
    color: 0x6a3a8a,
    effects: [{ type: 'buff', stat: 'stealth', mult: 2.5, duration: 6 }],
  },
  lame_tossiche: {
    id: 'lame_tossiche',
    name: 'Lame Tossiche',
    description: 'Cinque coltelli avvelenati a ventaglio.',
    cooldown: 6,
    cost: { rage: 25 },
    windup: 0.16,
    active: 0.08,
    recovery: 0.24,
    color: 0x9fe070,
    effects: [
      {
        type: 'bolt', at: 'start', speed: 15, range: 6, damageMult: 0.65, radius: 0.12, count: 5, spread: deg(50),
        poison: { mult: 0.6, duration: 4 },
      },
    ],
  },
  ombra_letale: {
    id: 'ombra_letale',
    name: 'Ombra Letale',
    description: 'Scatto intoccabile che finisce con una pugnalata che ruba vita.',
    cooldown: 7,
    cost: { stamina: 20 },
    windup: 0.05,
    active: 0.15,
    recovery: 0.16,
    color: 0xb04a6a,
    effects: [
      { type: 'dash', speed: 22, phase: true },
      { type: 'arc', at: 'end', range: 1.7, halfArc: Math.PI, damageMult: 1.6, lifesteal: 0.35 },
    ],
  },
};
