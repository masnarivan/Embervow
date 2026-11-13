export type Side = 'light' | 'dark';

export interface AlignmentState {
  earned: Record<Side, number>;
  spent: Record<Side, number>;
}

/**
 * Due contatori indipendenti. I punti sono valuta (saldo = guadagnati − spesi)
 * e soglia di accesso: la soglia usa il totale GUADAGNATO, così spendere
 * nell'albero skill non fa perdere l'accesso a equipaggiamento e contenuti.
 */
export class Alignment {
  private earned: Record<Side, number> = { light: 0, dark: 0 };
  private spent: Record<Side, number> = { light: 0, dark: 0 };

  gain(side: Side, amount: number): void {
    if (amount < 0) throw new Error('amount negativo');
    this.earned[side] += amount;
  }

  totalEarned(side: Side): number {
    return this.earned[side];
  }

  balance(side: Side): number {
    return this.earned[side] - this.spent[side];
  }

  trySpend(side: Side, amount: number): boolean {
    if (amount < 0 || this.balance(side) < amount) return false;
    this.spent[side] += amount;
    return true;
  }

  /** Respec: restituisce tutti i punti spesi di quel lato. */
  refund(side: Side): void {
    this.spent[side] = 0;
  }

  meetsThreshold(side: Side, threshold: number): boolean {
    return this.earned[side] >= threshold;
  }

  toJSON(): AlignmentState {
    return { earned: { ...this.earned }, spent: { ...this.spent } };
  }

  /** Sostituisce lo stato (per il caricamento), mantenendo lo stesso oggetto. */
  load(s: AlignmentState): void {
    this.earned = { light: Math.max(0, s.earned.light), dark: Math.max(0, s.earned.dark) };
    this.spent = { light: Math.max(0, s.spent.light), dark: Math.max(0, s.spent.dark) };
  }

  static fromJSON(s: AlignmentState): Alignment {
    const a = new Alignment();
    a.earned = { ...s.earned };
    a.spent = { ...s.spent };
    return a;
  }
}
