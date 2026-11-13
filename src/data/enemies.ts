export interface EnemyDef {
  id: string;
  name: string;
  color: number;
  scale: number;
  maxHp: number;
  speed: number;
  radius: number;
  aggroRange: number;
  leashRange: number;
  /** Distanza a cui inizia il wind-up. */
  attackRange: number;
  /** Portata effettiva del colpo. */
  reach: number;
  halfArc: number;
  damage: number;
  windup: number;
  active: number;
  recover: number;
  lungeSpeed: number;
  /** Durata dello stordimento quando viene colpito. */
  staggerTime: number;
  /** Se true, il wind-up non viene interrotto dai colpi. */
  poise: boolean;
  /** Esperienza data alla morte. */
  xp: number;
  /** Nemico a distanza: tira proiettili e mantiene le distanze. */
  ranged?: { speed: number; keepDistance: number };
}

const deg = (d: number) => (d * Math.PI) / 180;

export const ENEMIES: Record<string, EnemyDef> = {
  predone: {
    id: 'predone',
    name: 'Diavolo Predone',
    color: 0xb86b4b,
    scale: 1,
    maxHp: 60,
    speed: 3.1,
    radius: 0.3,
    aggroRange: 6,
    leashRange: 11,
    attackRange: 1.25,
    reach: 1.6,
    halfArc: deg(50),
    damage: 18,
    windup: 0.5,
    active: 0.12,
    recover: 0.6,
    lungeSpeed: 3,
    staggerTime: 0.3,
    poise: false,
    xp: 25,
  },
  bruto: {
    id: 'bruto',
    name: 'Demone Bruto',
    color: 0x7a5aa6,
    scale: 1.35,
    maxHp: 150,
    speed: 2.1,
    radius: 0.4,
    aggroRange: 6.5,
    leashRange: 11,
    attackRange: 1.7,
    reach: 2.3,
    halfArc: deg(75),
    damage: 38,
    windup: 0.85,
    active: 0.15,
    recover: 1.0,
    lungeSpeed: 2,
    staggerTime: 0.18,
    poise: true,
    xp: 70,
  },
  arciere: {
    id: 'arciere',
    name: 'Demone Arciere',
    color: 0x5f8a4a,
    scale: 0.95,
    maxHp: 40,
    speed: 2.6,
    radius: 0.28,
    aggroRange: 7.5,
    leashRange: 10,
    attackRange: 6.5,
    reach: 10,
    halfArc: deg(4),
    damage: 16,
    windup: 0.75,
    active: 0.05,
    recover: 0.9,
    lungeSpeed: 0,
    staggerTime: 0.35,
    poise: false,
    xp: 30,
    ranged: { speed: 9, keepDistance: 4 },
  },
};
