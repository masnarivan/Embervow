import type { Side } from '../alignment/alignment';

export interface ChoiceOption {
  label: string;
  side: Side;
  points: number;
  /** Testo mostrato dopo la scelta. */
  result: string;
  item?: string;
  xp?: number;
  /** Variazione di vita in frazione della massima (negativa = danno, mai letale). */
  hpChange?: number;
}

export interface MoralChoice {
  id: string;
  /** Cosa compare a schermo avvicinandosi. */
  prompt: string;
  title: string;
  text: string;
  options: [ChoiceOption, ChoiceOption];
  /** Testo che compare avvicinandosi dopo aver scelto. */
  after: Record<Side, string>;
}

/** Le scelte morali della prima area; l'id è la cifra nella mappa. */
export const CHOICES: Record<string, MoralChoice> = {
  '1': {
    id: '1',
    prompt: '[E] Parla al prigioniero',
    title: 'Il pellegrino incatenato',
    text:
      'Un pellegrino è incatenato al muro, le labbra spaccate dalla sete. «Ti prego… liberami. ' +
      'Non ho nulla, solo quest’amuleto che porto per mia madre.»',
    options: [
      {
        label: 'Spezza le catene e lascialo andare',
        side: 'light', points: 3,
        result: 'Il pellegrino ti stringe le mani. «Non ho nulla da darti… ma non dimenticherò il tuo volto.» Poi zoppica verso l’uscita.',
      },
      {
        label: 'Strappagli l’amuleto e lascialo alle catene',
        side: 'dark', points: 3, xp: 40,
        result: 'Il cordino si spezza con un colpo secco. L’amuleto è vuoto dentro, ma stringendolo senti qualcosa scorrerti nelle vene. Il pellegrino non grida: ti guarda soltanto, finché non volti le spalle.',
      },
    ],
    after: {
      light: 'Le catene spezzate pendono dal muro.',
      dark: 'Il pellegrino non alza più lo sguardo.',
    },
  },
  '2': {
    id: '2',
    prompt: '[E] Esamina l’altare',
    title: 'L’altare consunto',
    text:
      'Un altare di pietra, consumato da secoli di mani. Sopra, una coppa colma di sangue scuro, ' +
      'ancora caldo. Nell’aria c’è odore di incenso e di ferro.',
    options: [
      {
        label: 'Inginocchiati e prega in silenzio',
        side: 'light', points: 2, hpChange: 1,
        result: 'Il silenzio si fa più profondo. Un calore tiepido ti scioglie le ferite.',
      },
      {
        label: 'Bevi dalla coppa',
        side: 'dark', points: 2, xp: 50, hpChange: -0.3,
        result: 'Il sangue brucia scendendo. Per un attimo vedi tutte le battaglie che ha visto chi l’ha versato.',
      },
    ],
    after: {
      light: 'L’altare emana un tepore quieto.',
      dark: 'La coppa è vuota. Il fondo è ancora rosso.',
    },
  },
  '3': {
    id: '3',
    prompt: '[E] Avvicinati al predone ferito',
    title: 'Il disertore',
    text:
      'Un predone è in ginocchio, la spada a terra, una mano premuta sul fianco. «Basta… me ne vado. ' +
      'Il Custode oltre la nebbia ha già preso i miei fratelli. Lasciami andare e non mi rivedrai mai più.»',
    options: [
      {
        label: 'Lascialo andare',
        side: 'light', points: 2,
        result: '«Quando il Custode alza le braccia al cielo… allontanati. E quando ruggisce, stai lontano.» Si rialza a fatica e sparisce tra le colonne.',
      },
      {
        label: 'Finiscilo',
        side: 'dark', points: 2, xp: 30,
        result: 'Non oppone resistenza. Tra le sue cose non c’è nulla di valore, solo la stanchezza di chi ha già perso.',
      },
    ],
    after: {
      light: 'Rimangono solo le impronte di chi se n’è andato.',
      dark: 'Il corpo del disertore giace dove l’hai lasciato.',
    },
  },
};
