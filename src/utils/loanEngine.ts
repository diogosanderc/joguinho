// Bank loan system: fixed-installment (Price/French amortization) loans the user's club can
// take out against a credit limit derived from their Score Financeiro (0-100) and last
// season's revenue. Each "period" here is one league round -- the game has no separate
// month concept, so interest rates quoted "ao mês" in the design are applied per round.

export interface Loan {
  id: string;
  principal: number;
  balance: number; // remaining principal
  ratePerRound: number; // decimal, e.g. 0.0085
  installment: number;
  totalRounds: number;
  roundsPaid: number;
  lateStreak: number; // consecutive missed installments on this loan
  purpose: string;
  startedYear: number;
}

export const LOAN_AMOUNTS = [5_000_000, 10_000_000, 20_000_000, 40_000_000, 60_000_000, 100_000_000, 200_000_000];
export const LOAN_TERMS = [12, 24, 36, 48, 60];

export const LOAN_PURPOSES = [
  'Compra de jogadores',
  'Pagamento de salários',
  'Reforma do estádio',
  'Centro de treinamento',
  'Categorias de base',
  'Equilíbrio de caixa'
] as const;

export const getScoreLabel = (score: number): string => {
  if (score >= 90) return 'Excelente';
  if (score >= 80) return 'Bom';
  if (score >= 70) return 'Estável';
  if (score >= 60) return 'Endividado';
  if (score >= 50) return 'Em Crise';
  return 'Quase Falindo';
};

// Base monthly/round rate by score tier, before any random bank-event modifier. The bank
// never fully closes the door on a loan -- a club in real trouble needs a way to dig itself
// out, so even a terrible score just means a brutal rate instead of an outright refusal.
export const getBaseInterestRate = (score: number): number => {
  if (score >= 90) return 0.0065;
  if (score >= 80) return 0.0085;
  if (score >= 70) return 0.0105;
  if (score >= 60) return 0.0140;
  if (score >= 50) return 0.0180;
  if (score >= 35) return 0.0230;
  if (score >= 20) return 0.0300;
  return 0.0380;
};

export const getCreditMultiplier = (score: number): number => {
  if (score >= 90) return 2.0;
  if (score >= 80) return 1.5;
  if (score >= 70) return 1.0;
  if (score >= 60) return 0.75;
  if (score >= 50) return 0.5;
  return 0.3;
};

// Credit actually available to borrow right now. Guarantees at least the smallest loan
// denomination is always within reach, no matter how small the revenue or how bad the score --
// a club in real trouble needs a way to try to dig itself out, not a door slammed shut.
export const getAvailableCredit = (financialScore: number, lastSeasonRevenue: number, outstandingDebt: number): number => {
  const creditLimit = lastSeasonRevenue * getCreditMultiplier(financialScore);
  return Math.max(LOAN_AMOUNTS[0], creditLimit - outstandingDebt);
};

// Fixed installment for a Price-system loan.
export const calculateInstallment = (principal: number, ratePerRound: number, totalRounds: number): number => {
  if (ratePerRound <= 0) return principal / totalRounds;
  const factor = Math.pow(1 + ratePerRound, totalRounds);
  return principal * (ratePerRound * factor) / (factor - 1);
};

// Advances a loan by one round. When `paid` is false the missed installment's interest
// still accrues onto the balance (mora) instead of amortizing principal.
export const advanceLoan = (loan: Loan, paid: boolean): Loan => {
  if (!paid) {
    return { ...loan, balance: Math.round(loan.balance * (1 + loan.ratePerRound + 0.005)), lateStreak: loan.lateStreak + 1 };
  }
  const interestPortion = loan.balance * loan.ratePerRound;
  const principalPortion = loan.installment - interestPortion;
  const balance = Math.max(0, Math.round(loan.balance - principalPortion));
  return { ...loan, balance, roundsPaid: loan.roundsPaid + 1, lateStreak: 0 };
};

// Early payoff: remaining balance plus 60% of the interest that would still have been paid
// over the rest of the term (i.e. a 40% discount on that future interest).
export const calculatePayoffAmount = (loan: Loan): number => {
  const remainingRounds = Math.max(0, loan.totalRounds - loan.roundsPaid);
  const totalIfContinued = loan.installment * remainingRounds;
  const futureInterest = Math.max(0, totalIfContinued - loan.balance);
  return Math.round(loan.balance + futureInterest * 0.6);
};

// Renegotiation: stretches the remaining term by 50% and adds 0.3% to the rate in exchange
// for a lower installment -- offered after 2 consecutive missed payments on a loan.
export const renegotiateLoan = (loan: Loan): Loan => {
  const remainingRounds = Math.max(1, loan.totalRounds - loan.roundsPaid);
  const extendedRounds = Math.round(remainingRounds * 1.5);
  const newRate = loan.ratePerRound + 0.003;
  const installment = calculateInstallment(loan.balance, newRate, extendedRounds);
  return {
    ...loan,
    totalRounds: loan.roundsPaid + extendedRounds,
    ratePerRound: newRate,
    installment,
    lateStreak: 0
  };
};

export interface BankEvent {
  rateModifier: number;
  specialLine: boolean; // clubs with score 90+ get an extra rate discount this season
  label: string | null;
}

// A season-long bank event, deterministically derived from the year so it doesn't need its
// own save-file slot -- the same year always rolls the same event within a playthrough.
export const getBankEventForYear = (year: number): BankEvent => {
  const x = Math.sin(year * 12.9898) * 43758.5453;
  const roll = x - Math.floor(x);
  if (roll < 0.15) {
    return { rateModifier: -0.003, specialLine: false, label: 'Banco Nacional reduziu os juros! Novos empréstimos ficam 0,3% mais baratos ao mês nesta temporada.' };
  }
  if (roll < 0.30) {
    return { rateModifier: 0.005, specialLine: false, label: 'Crise econômica! Os juros de novos empréstimos subiram 0,5% ao mês nesta temporada.' };
  }
  if (roll < 0.40) {
    return { rateModifier: 0, specialLine: true, label: 'O banco abriu uma linha especial: clubes com Score Financeiro acima de 90 têm juros ainda menores nesta temporada.' };
  }
  return { rateModifier: 0, specialLine: false, label: null };
};
