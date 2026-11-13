import type { TalentNode, TreeConfig } from '../skills/tree';

export const TALENT_CONFIG: TreeConfig = {
  branchNames: { light: 'Paladino', dark: 'Berserker' },
  sideNames: { light: 'Luce', dark: 'Oscurità' },
  // Pensate per ~4 aree: la prima dà circa 7 punti per via (solo il livello I).
  tierThreshold: { 1: 3, 2: 10, 3: 20 },
  exclusive: true,
};

// Ramo Luce — Paladino: protezione e cure.
// Ramo Oscurità — Berserker: danno alto, rischio, rabbia.
// I talenti attivi potenziano una skill base sullo stesso tasto: i tasti restano 1–4.
export const TALENTS: TalentNode[] = [
  // ---------- Paladino ----------
  {
    id: 'pal_fede', name: 'Fede Incrollabile', branch: 'light', tier: 1, col: 0, cost: 1, requires: [],
    description: '+15% vita massima.',
    mods: { maxHpMult: 1.15 },
  },
  {
    id: 'pal_martello', name: 'Martello Sacro', branch: 'light', tier: 1, col: 2, cost: 1, requires: [],
    description: 'Colpo Poderoso diventa Martello Sacro: stesso colpo pesante, ma ti cura del 30% del danno inflitto.',
    replaces: { slot: 0, skill: 'martello_sacro' },
  },
  {
    id: 'pal_aura', name: 'Aura Benedetta', branch: 'light', tier: 2, col: 0, cost: 2, requires: ['pal_fede'],
    description: 'Rigeneri 1,5 punti vita al secondo.',
    mods: { hpRegen: 1.5 },
  },
  {
    id: 'pal_baluardo', name: 'Baluardo', branch: 'light', tier: 2, col: 1, cost: 2, requires: ['pal_fede'],
    description: '−15% danni subiti.',
    mods: { damageTakenMult: 0.85 },
  },
  {
    id: 'pal_scudo', name: 'Scudo di Luce', branch: 'light', tier: 2, col: 2, cost: 2, requires: ['pal_martello'],
    description: 'Grido di Guerra diventa Scudo di Luce: −40% danni subiti per 6 secondi e cura del 15% della vita.',
    replaces: { slot: 3, skill: 'scudo_di_luce' },
  },
  {
    id: 'pal_martire', name: 'Ultima Luce', branch: 'light', tier: 3, col: 0, cost: 3, requires: ['pal_aura'],
    description: 'Una volta per riposo al falò, un colpo mortale ti lascia invece al 30% della vita.',
    mods: { cheatDeath: true },
  },
  {
    id: 'pal_consacrazione', name: 'Consacrazione', branch: 'light', tier: 3, col: 1, cost: 3, requires: ['pal_baluardo'],
    description: 'Turbine diventa Consacrazione: colpo circolare più ampio che ti cura del 10% della vita.',
    replaces: { slot: 1, skill: 'consacrazione' },
  },
  {
    id: 'pal_giudizio', name: 'Giudizio', branch: 'light', tier: 3, col: 2, cost: 3, requires: ['pal_scudo'],
    description: 'Carica diventa Giudizio: all’arrivo un colpo da 2× danni che spezza la guardia e ti cura del 25% del danno.',
    replaces: { slot: 2, skill: 'giudizio' },
  },

  // ---------- Berserker ----------
  {
    id: 'ber_sete', name: 'Sete di Battaglia', branch: 'dark', tier: 1, col: 0, cost: 1, requires: [],
    description: '+50% rabbia generata.',
    mods: { rageGainMult: 1.5 },
  },
  {
    id: 'ber_squarcio', name: 'Squarcio', branch: 'dark', tier: 1, col: 2, cost: 1, requires: [],
    description: 'Colpo Poderoso diventa Squarcio: più rapido e da 2,6× danni.',
    replaces: { slot: 0, skill: 'squarcio' },
  },
  {
    id: 'ber_furia', name: 'Furia Cieca', branch: 'dark', tier: 2, col: 0, cost: 2, requires: ['ber_sete'],
    description: 'Più vita perdi, più colpisci forte: fino a +50% danni quasi a terra.',
    mods: { berserk: 0.5 },
  },
  {
    id: 'ber_vampiro', name: 'Sangue per Sangue', branch: 'dark', tier: 2, col: 1, cost: 2, requires: ['ber_sete'],
    description: 'Ti curi del 10% di tutto il danno che infliggi.',
    mods: { lifesteal: 0.1 },
  },
  {
    id: 'ber_frenesia', name: 'Frenesia', branch: 'dark', tier: 2, col: 2, cost: 2, requires: ['ber_squarcio'],
    description: 'Grido di Guerra diventa Frenesia: +60% danni ma +30% danni subiti per 8 secondi.',
    replaces: { slot: 3, skill: 'frenesia' },
  },
  {
    id: 'ber_indomito', name: 'Indomito', branch: 'dark', tier: 3, col: 0, cost: 3, requires: ['ber_furia'],
    description: 'Con la rabbia a 75 o più, l’attacco base non consuma stamina.',
    mods: { freeAttackRage: 75 },
  },
  {
    id: 'ber_vortice', name: 'Vortice d’Acciaio', branch: 'dark', tier: 3, col: 1, cost: 3, requires: ['ber_vampiro'],
    description: 'Turbine diventa Vortice d’Acciaio: colpisce due volte tutto intorno a te.',
    replaces: { slot: 1, skill: 'vortice_acciaio' },
  },
  {
    id: 'ber_balzo', name: 'Balzo Devastante', branch: 'dark', tier: 3, col: 2, cost: 3, requires: ['ber_frenesia'],
    description: 'Carica diventa Balzo Devastante: atterri colpendo tutto intorno per 2,4× danni.',
    replaces: { slot: 2, skill: 'balzo_devastante' },
  },
];
