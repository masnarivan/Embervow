import type { EnemyDef } from './enemies';

export interface BossMove {
  id: string;
  /** Forma dell'area colpita: settore, cerchio intorno al boss, o linea (scatto). */
  shape: 'arc' | 'circle' | 'line';
  windup: number;
  active: number;
  recover: number;
  range: number;
  halfArc: number;
  damage: number;
  /** Il boss la sceglie solo se il giocatore è entro questa distanza... */
  maxDist: number;
  /** ...e oltre questa. */
  minDist?: number;
  /** Probabilità relativa di sceglierla (0 = solo come seguito di una combo). */
  weight: number;
  /** Velocità di avanzamento durante il colpo. */
  lunge?: number;
  /** Scatto durante la fase attiva; il colpo arriva alla fine. */
  dash?: { speed: number; hitRange: number; halfArc: number };
  /** Anello di proiettili invece di un colpo in mischia. */
  projectiles?: { count: number; speed: number };
  /** Mossa che segue subito dopo (combo). */
  followUp?: string;
}

export interface BossPhase {
  /** La fase inizia quando la vita scende a questa frazione. */
  hpFrac: number;
  speedMult: number;
  windupMult: number;
  color: number;
  moves: string[];
}

export interface BossDef extends EnemyDef {
  title: string;
  moves: Record<string, BossMove>;
  phases: BossPhase[];
  /** Ruggito tra le fasi: invulnerabile, poi un'onda d'urto intorno a sé. */
  transition: { duration: number; range: number; damage: number };
  drop: string;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const CUSTODE: BossDef = {
  id: 'custode',
  name: 'Custode della Soglia',
  title: 'Il Custode della Soglia',
  color: 0x8c93a3,
  scale: 1.9,
  maxHp: 750,
  speed: 2.4,
  radius: 0.6,
  aggroRange: 0,
  leashRange: 999,
  attackRange: 2.4,
  reach: 2.6,
  halfArc: deg(60),
  damage: 32,
  windup: 0.8,
  active: 0.15,
  recover: 0.85,
  lungeSpeed: 2.5,
  staggerTime: 0,
  poise: true,
  xp: 500,
  drop: 'cuore_del_custode',
  transition: { duration: 1.8, range: 3.6, damage: 30 },
  phases: [
    { hpFrac: 1, speedMult: 1, windupMult: 1, color: 0x8c93a3, moves: ['fendente', 'doppio', 'schianto', 'carica'] },
    { hpFrac: 0.5, speedMult: 1.25, windupMult: 0.8, color: 0xa34848, moves: ['fendente', 'doppio', 'schianto', 'carica', 'onda'] },
  ],
  moves: {
    fendente: {
      id: 'fendente', shape: 'arc', windup: 0.8, active: 0.15, recover: 0.85,
      range: 2.6, halfArc: deg(60), damage: 32, maxDist: 2.4, weight: 3, lunge: 2.5,
    },
    doppio: {
      id: 'doppio', shape: 'arc', windup: 0.6, active: 0.12, recover: 0.25,
      range: 2.5, halfArc: deg(75), damage: 24, maxDist: 2.3, weight: 2, lunge: 3, followUp: 'doppio2',
    },
    doppio2: {
      id: 'doppio2', shape: 'arc', windup: 0.42, active: 0.12, recover: 1.0,
      range: 2.5, halfArc: deg(75), damage: 28, maxDist: 0, weight: 0, lunge: 3,
    },
    schianto: {
      id: 'schianto', shape: 'circle', windup: 1.15, active: 0.2, recover: 1.2,
      range: 3, halfArc: Math.PI, damage: 40, maxDist: 2.6, weight: 2,
    },
    carica: {
      id: 'carica', shape: 'line', windup: 0.85, active: 0.55, recover: 1.0,
      range: 6.5, halfArc: deg(70), damage: 34, minDist: 3.5, maxDist: 9, weight: 3,
      dash: { speed: 12, hitRange: 2, halfArc: deg(70) },
    },
    onda: {
      id: 'onda', shape: 'circle', windup: 0.9, active: 0.1, recover: 0.9,
      range: 1.6, halfArc: Math.PI, damage: 18, maxDist: 9, weight: 2,
      projectiles: { count: 12, speed: 6 },
    },
  },
};
