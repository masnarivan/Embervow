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

// ---------- Mago ----------

export const MAGE_TALENT_CONFIG: TreeConfig = {
  ...TALENT_CONFIG,
  branchNames: { light: 'Elementalista', dark: 'Negromante' },
};

// Ramo Luce — Elementalista: fuoco, gelo e fulmine; danno ad area e controllo.
// Ramo Oscurità — Negromante: ossa, spettri e vita rubata.
export const MAGE_TALENTS: TalentNode[] = [
  // ---------- Elementalista ----------
  {
    id: 'ele_affinita', name: 'Affinità Elementale', branch: 'light', tier: 1, col: 0, cost: 1, requires: [],
    description: '+12% danni.',
    mods: { damageMult: 1.12 },
  },
  {
    id: 'ele_fuoco', name: 'Palla di Fuoco', branch: 'light', tier: 1, col: 2, cost: 1, requires: [],
    description: 'Globo Arcano diventa Palla di Fuoco: all’impatto esplode e colpisce tutti i nemici vicini.',
    replaces: { slot: 0, skill: 'palla_di_fuoco' },
  },
  {
    id: 'ele_mente', name: 'Mente Limpida', branch: 'light', tier: 2, col: 0, cost: 2, requires: ['ele_affinita'],
    description: '+50% mana rigenerato.',
    mods: { rageGainMult: 1.5 },
  },
  {
    id: 'ele_pietra', name: 'Pelle di Pietra', branch: 'light', tier: 2, col: 1, cost: 2, requires: ['ele_affinita'],
    description: '−15% danni subiti.',
    mods: { damageTakenMult: 0.85 },
  },
  {
    id: 'ele_forma', name: 'Forma Elementale', branch: 'light', tier: 2, col: 2, cost: 2, requires: ['ele_fuoco'],
    description: 'Focus Arcano diventa Forma Elementale: +45% danni e −20% danni subiti per 8 secondi.',
    replaces: { slot: 3, skill: 'forma_elementale' },
  },
  {
    id: 'ele_tempesta', name: 'Tempesta Interiore', branch: 'light', tier: 3, col: 0, cost: 3, requires: ['ele_mente'],
    description: 'Con il mana a 75 o più, il dardo base non consuma stamina.',
    mods: { freeAttackRage: 75 },
  },
  {
    id: 'ele_gelo', name: 'Nova di Gelo', branch: 'light', tier: 3, col: 1, cost: 3, requires: ['ele_pietra'],
    description: 'Nova Arcana diventa Nova di Gelo: più ampia, spezza la guardia e blocca i nemici più a lungo.',
    replaces: { slot: 1, skill: 'nova_di_gelo' },
  },
  {
    id: 'ele_fulmine', name: 'Passo del Fulmine', branch: 'light', tier: 3, col: 2, cost: 3, requires: ['ele_forma'],
    description: 'Traslazione diventa Passo del Fulmine: all’arrivo un fulmine da 2× danni tutto intorno.',
    replaces: { slot: 2, skill: 'passo_del_fulmine' },
  },

  // ---------- Negromante ----------
  {
    id: 'neg_tocco', name: 'Tocco Vampirico', branch: 'dark', tier: 1, col: 0, cost: 1, requires: [],
    description: 'Ti curi dell’8% di tutto il danno che infliggi.',
    mods: { lifesteal: 0.08 },
  },
  {
    id: 'neg_lancia', name: 'Lancia d’Ossa', branch: 'dark', tier: 1, col: 2, cost: 1, requires: [],
    description: 'Globo Arcano diventa Lancia d’Ossa: più rapida, da 2,4× danni, trapassa tutti i nemici in fila.',
    replaces: { slot: 0, skill: 'lancia_ossa' },
  },
  {
    id: 'neg_mietitore', name: 'Mietitore d’Anime', branch: 'dark', tier: 2, col: 0, cost: 2, requires: ['neg_tocco'],
    description: 'Ogni nemico ucciso ti restituisce il 6% della vita massima.',
    mods: { killHeal: 0.06 },
  },
  {
    id: 'neg_carne', name: 'Carne Morta', branch: 'dark', tier: 2, col: 1, cost: 2, requires: ['neg_tocco'],
    description: '+20% vita massima.',
    mods: { maxHpMult: 1.2 },
  },
  {
    id: 'neg_spettri', name: 'Evoca Spettri', branch: 'dark', tier: 2, col: 2, cost: 2, requires: ['neg_lancia'],
    description: 'Focus Arcano diventa Evoca Spettri: due spettri combattono al tuo fianco per 15 secondi.',
    replaces: { slot: 3, skill: 'evoca_spettri' },
  },
  {
    id: 'neg_filatterio', name: 'Filatterio', branch: 'dark', tier: 3, col: 0, cost: 3, requires: ['neg_mietitore'],
    description: 'Una volta per riposo al falò, un colpo mortale ti lascia invece al 30% della vita.',
    mods: { cheatDeath: true },
  },
  {
    id: 'neg_morte', name: 'Nova di Morte', branch: 'dark', tier: 3, col: 1, cost: 3, requires: ['neg_carne'],
    description: 'Nova Arcana diventa Nova di Morte: ti cura del 50% del danno inflitto.',
    replaces: { slot: 1, skill: 'nova_di_morte' },
  },
  {
    id: 'neg_ombra', name: 'Passo d’Ombra', branch: 'dark', tier: 3, col: 2, cost: 3, requires: ['neg_spettri'],
    description: 'Traslazione diventa Passo d’Ombra: colpisce tutto intorno alla partenza e all’arrivo, rubando vita.',
    replaces: { slot: 2, skill: 'passo_ombra' },
  },
];

// ---------- Assassino ----------

export const ROGUE_TALENT_CONFIG: TreeConfig = {
  ...TALENT_CONFIG,
  branchNames: { light: 'Duellante', dark: 'Sicario' },
};

// Ramo Luce — Duellante: scontro a viso aperto, precisione e guardia.
// Ramo Oscurità — Sicario: veleno, agguati e colpi alle spalle.
export const ROGUE_TALENTS: TalentNode[] = [
  // ---------- Duellante ----------
  {
    id: 'due_riflessi', name: 'Riflessi Pronti', branch: 'light', tier: 1, col: 0, cost: 1, requires: [],
    description: '−12% danni subiti.',
    mods: { damageTakenMult: 0.88 },
  },
  {
    id: 'due_affondo', name: 'Affondo', branch: 'light', tier: 1, col: 2, cost: 1, requires: [],
    description: 'Stoccata diventa Affondo: un balzo in avanti e una stoccata più lunga da 2,5× danni.',
    replaces: { slot: 0, skill: 'affondo' },
  },
  {
    id: 'due_sangue', name: 'Sangue Freddo', branch: 'light', tier: 2, col: 0, cost: 2, requires: ['due_riflessi'],
    description: 'Rigeneri 1,2 punti vita al secondo.',
    mods: { hpRegen: 1.2 },
  },
  {
    id: 'due_precisione', name: 'Precisione', branch: 'light', tier: 2, col: 1, cost: 2, requires: ['due_riflessi'],
    description: '+12% danni.',
    mods: { damageMult: 1.12 },
  },
  {
    id: 'due_guardia', name: 'Guardia del Duellante', branch: 'light', tier: 2, col: 2, cost: 2, requires: ['due_affondo'],
    description: 'Velo d’Ombra diventa Guardia del Duellante: niente furtività, ma −50% danni subiti e +25% danni per 6 secondi.',
    replaces: { slot: 3, skill: 'guardia_del_duellante' },
  },
  {
    id: 'due_flusso', name: 'Flusso', branch: 'light', tier: 3, col: 0, cost: 3, requires: ['due_sangue'],
    description: 'Con lo slancio a 60 o più, l’attacco base non consuma stamina.',
    mods: { freeAttackRage: 60 },
  },
  {
    id: 'due_tempesta', name: 'Tempesta di Lame', branch: 'light', tier: 3, col: 1, cost: 3, requires: ['due_precisione'],
    description: 'Ventaglio di Lame diventa Tempesta di Lame: sette coltelli più forti che trapassano i nemici.',
    replaces: { slot: 1, skill: 'tempesta_di_lame' },
  },
  {
    id: 'due_vento', name: 'Passo del Vento', branch: 'light', tier: 3, col: 2, cost: 3, requires: ['due_guardia'],
    description: 'Passo Furtivo diventa Passo del Vento: all’arrivo un taglio da 1,8× danni tutto intorno.',
    replaces: { slot: 2, skill: 'passo_del_vento' },
  },

  // ---------- Sicario ----------
  {
    id: 'sic_veleno', name: 'Lame Avvelenate', branch: 'dark', tier: 1, col: 0, cost: 1, requires: [],
    description: 'Ogni colpo avvelena: il 30% del danno inflitto di nuovo in 4 secondi.',
    mods: { poison: 0.3 },
  },
  {
    id: 'sic_vipera', name: 'Morso della Vipera', branch: 'dark', tier: 1, col: 2, cost: 1, requires: [],
    description: 'Stoccata diventa Morso della Vipera: in più avvelena per 2× danni in 5 secondi.',
    replaces: { slot: 0, skill: 'morso_della_vipera' },
  },
  {
    id: 'sic_spalle', name: 'Lama nella Schiena', branch: 'dark', tier: 2, col: 0, cost: 2, requires: ['sic_veleno'],
    description: 'I colpi alle spalle passano da +50% a +100% danni.',
    mods: { backstab: 0.5 },
  },
  {
    id: 'sic_sanguisuga', name: 'Sanguisuga', branch: 'dark', tier: 2, col: 1, cost: 2, requires: ['sic_veleno'],
    description: 'Ti curi dell’8% di tutto il danno che infliggi.',
    mods: { lifesteal: 0.08 },
  },
  {
    id: 'sic_agguato', name: 'Agguato', branch: 'dark', tier: 2, col: 2, cost: 2, requires: ['sic_vipera'],
    description: 'Velo d’Ombra diventa Agguato: nascosto per 6 secondi, e il primo colpo fa +150% danni.',
    replaces: { slot: 3, skill: 'agguato' },
  },
  {
    id: 'sic_trofeo', name: 'Trofeo di Caccia', branch: 'dark', tier: 3, col: 0, cost: 3, requires: ['sic_spalle'],
    description: 'Ogni nemico ucciso ti restituisce l’8% della vita massima.',
    mods: { killHeal: 0.08 },
  },
  {
    id: 'sic_tossiche', name: 'Lame Tossiche', branch: 'dark', tier: 3, col: 1, cost: 3, requires: ['sic_sanguisuga'],
    description: 'Ventaglio di Lame diventa Lame Tossiche: ogni coltello avvelena chi colpisce.',
    replaces: { slot: 1, skill: 'lame_tossiche' },
  },
  {
    id: 'sic_ombra', name: 'Ombra Letale', branch: 'dark', tier: 3, col: 2, cost: 3, requires: ['sic_agguato'],
    description: 'Passo Furtivo diventa Ombra Letale: all’arrivo una pugnalata tutto intorno che ti cura del 35% del danno.',
    replaces: { slot: 2, skill: 'ombra_letale' },
  },
];
