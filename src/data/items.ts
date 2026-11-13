import type { Side } from '../alignment/alignment';
import type { Stats } from './classes';
import type { Modifiers } from '../skills/tree';

export type Slot = 'arma' | 'armatura' | 'amuleto';
export const SLOTS: Slot[] = ['arma', 'armatura', 'amuleto'];
export const SLOT_NAMES: Record<Slot, string> = { arma: 'Arma', armatura: 'Armatura', amuleto: 'Amuleto' };

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  description: string;
  bonus: Partial<Stats>;
  mods?: Partial<Modifiers>;
  /** Soglia di allineamento GUADAGNATO per poterlo equipaggiare. */
  requires?: { side: Side; earned: number };
}

/** Oggetti chiave: non si equipaggiano, sbloccano qualcosa per sempre una volta raccolti. */
export interface KeyItemDef {
  id: string;
  name: string;
  description: string;
}

/** L'unico modo di rifare i talenti: si trova solo verso la fine della discesa. */
export const RESPEC_ITEM = 'acqua_del_lete';

export const KEY_ITEMS: Record<string, KeyItemDef> = {
  acqua_del_lete: {
    id: 'acqua_del_lete', name: 'Acqua del Lete',
    description:
      'Un’ampolla riempita al fiume dell’oblio. Chi ne beve davanti a un falò dimentica la via che ha scelto, ' +
      'e può sceglierne un’altra.',
  },
};

// Prima area: solo la Spada Lunga (forziere) e il Cuore del Custode (boss).
// Gli altri oggetti sono pronti per le aree successive.
export const ITEMS: Record<string, ItemDef> = {
  spada_lunga: {
    id: 'spada_lunga', name: 'Spada Lunga', slot: 'arma',
    description: 'Una lama d’acciaio ben bilanciata, scheggiata ma affilata.',
    bonus: { damage: 5 },
  },
  cotta_di_maglia: {
    id: 'cotta_di_maglia', name: 'Cotta di Maglia', slot: 'armatura',
    description: 'Anelli arrugginiti che fermano ancora una lama.',
    bonus: { defense: 3, maxHp: 10 },
  },
  armatura_lucente: {
    id: 'armatura_lucente', name: 'Armatura Lucente', slot: 'armatura',
    description: 'Splende di una luce tiepida. Solo chi ha scelto la Luce riesce a indossarla.',
    bonus: { defense: 5, maxHp: 25 },
    mods: { hpRegen: 0.5 },
    requires: { side: 'light', earned: 12 },
  },
  lama_del_sangue: {
    id: 'lama_del_sangue', name: 'Lama del Sangue', slot: 'arma',
    description: 'Il filo è sempre umido. Beve da chi colpisce, e rifiuta chi non ha conosciuto l’Oscurità.',
    bonus: { damage: 10 },
    mods: { lifesteal: 0.05 },
    requires: { side: 'dark', earned: 12 },
  },
  rosario_del_pellegrino: {
    id: 'rosario_del_pellegrino', name: 'Rosario del Pellegrino', slot: 'amuleto',
    description: 'Grani di legno consumati dalle preghiere di chi è sceso quaggiù prima di te.',
    bonus: { maxHp: 20 },
  },
  amuleto_strappato: {
    id: 'amuleto_strappato', name: 'Amuleto Strappato', slot: 'amuleto',
    description: 'Il cordino è spezzato. Pesa più di quanto dovrebbe.',
    bonus: { damage: 4 },
  },
  cuore_del_custode: {
    id: 'cuore_del_custode', name: 'Cuore del Custode', slot: 'amuleto',
    description: 'Batte ancora, piano. Il Custode ha vegliato sulla soglia degli Inferi per secoli.',
    bonus: { maxHp: 10, damage: 2, stamina: 10 },
  },
};
