import { type Club, type Player } from '../data/database';
import { simulateMatch, getAutoStarters, resolvePenaltyOutcome, type MatchResult } from './matchEngine';

// Copa Mata-Mata: a 60-team knockout run alongside the league season (one per club in the
// game -- Série A + B + C = 20 + 20 + 20 = 60). Rules from the supplied regulation, extended
// with a seeding scheme requested later: the 8 best-placed Série A clubs from the PREVIOUS
// season skip straight to the Oitavas draw, never playing Fase 0/1/2 at all.
//  - Fase 0 (new): the 40 "weakest" of the 52 non-seeded clubs (by reputation) play 20
//    single-match ties -> 20 winners, who join the other 12 non-seeded clubs (exempt from
//    Fase 0, also by reputation) to form the 32 clubs entering Fase 1. This pre-trim exists
//    purely so Fase 1 + Fase 2 funnel down to exactly 8 clubs, since 8 seeds + 8 = a clean 16
//    for Oitavas -- without it the numbers don't divide evenly.
//  - Fase 1: 32 clubs, 16 single-match ties -> 16 winners.
//  - Fase 2: 16 clubs, 8 single-match ties -> 8 winners, joining the 8 seeded Série A clubs to
//    form the 16 clubs in Oitavas.
//  - Oitavas (16->8) and Quartas (8->4): single match.
//  - Semifinal (4->2) and Final (2->1): two legs, home venue alternates.
//  - A drawn single match, or a tied aggregate, is decided by penalty shootout.
export type CupPhase = 'FASE0' | 'FASE1' | 'FASE2' | 'OITAVAS' | 'QUARTAS' | 'SEMI' | 'FINAL';

export const CUP_PHASE_LABEL: Record<CupPhase, string> = {
  FASE0: 'Fase Preliminar',
  FASE1: '1ª Fase',
  FASE2: '2ª Fase',
  OITAVAS: 'Oitavas de Final',
  QUARTAS: 'Quartas de Final',
  SEMI: 'Semifinal',
  FINAL: 'Final'
};

// Two-legged phases; every other phase is a single match.
export const TWO_LEGGED_PHASES: CupPhase[] = ['SEMI', 'FINAL'];

// How many of the previous season's top Série A clubs get a bye straight to Oitavas, and how
// many of the remaining non-seeded clubs get a bye past Fase 0 straight to Fase 1. Both numbers
// are load-bearing for the bracket math (see the comment above PHASES) -- changing them requires
// re-deriving the Fase 0/1/2 pool sizes too.
export const CUP_OITAVAS_SEED_COUNT = 8;
export const CUP_FASE0_BYE_COUNT = 12;

// R$ awarded the instant a club reaches (survives into) each stage -- cumulative, matches the
// regulation's "Premiação Acumulada" table exactly (e.g. eliminated in the Semis = 4+8+16+20 = 48M).
export const CUP_PRIZE_FOR_REACHING: Record<CupPhase, number> = {
  FASE0: 0,
  FASE1: 0,
  FASE2: 4_000_000,   // survived Fase 1
  OITAVAS: 8_000_000, // reached Oitavas (Fase 2 winners + the 8 seeded Série A clubs)
  QUARTAS: 16_000_000,
  SEMI: 20_000_000,
  FINAL: 0 // the Final itself carries no "reached" bonus -- only the champion bonus below
};
export const CUP_CHAMPION_PRIZE = 70_000_000;
export const CUP_TOP_SCORER_BONUS = 10_000_000;

export interface CupTieLeg extends MatchResult {
  homeId: string; // the actual home side for THIS leg (flips between leg1/leg2)
  awayId: string;
}

export interface CupTie {
  id: string;
  phase: CupPhase;
  homeId: string; // tie's "home" side (hosts leg1; in two-legged phases also the away side of leg2)
  awayId: string;
  legs: CupTieLeg[];
  winnerId: string;
  aggregateHomeGoals: number;
  aggregateAwayGoals: number;
  wentToPenalties: boolean;
  penaltyHomeGoals?: number;
  penaltyAwayGoals?: number;
}

export interface CupTopScorerEntry {
  playerName: string;
  clubId: string;
  goals: number;
}

// Order the state machine advances through; phaseIndex 7 means the cup is done for the season.
export const PHASES: CupPhase[] = ['FASE0', 'FASE1', 'FASE2', 'OITAVAS', 'QUARTAS', 'SEMI', 'FINAL'];

// Real football schedules a league match almost every week; this is where a cup run squeezes in
// an extra midweek fixture. Spread across the 38-round season so the pinch (two matches close
// together, less recovery) happens periodically rather than all at once. Two-legged phases
// (SEMI, FINAL) consume two of these milestones each -- one per leg.
export const CUP_MILESTONE_ROUNDS = [2, 6, 10, 14, 18, 22, 26, 30, 34];

export interface CupUserTie {
  homeId: string;
  awayId: string;
  legs: CupTieLeg[];
}

export interface CupState {
  year: number;
  phaseIndex: number; // index into PHASES; 7 = cup finished for the season
  aliveClubIds: string[]; // clubs alive heading into PHASES[phaseIndex]
  fase1ByeClubIds: string[]; // non-seeded clubs sitting out Fase 0 (best of the rest by reputation); merged into aliveClubIds once Fase 0 finishes
  oitavasSeeds: string[]; // the season's top Série A clubs, sitting out Fase 0/1/2 entirely; merged into aliveClubIds once Fase 2 finishes
  userTie: CupUserTie | null; // the user's tie for the CURRENT milestone round only -- non-null exactly when there's a cup match due to be played right now
  pendingSecondLeg: CupUserTie | null; // leg 1 already played, waiting for leg 2's own later milestone round -- kept separate from userTie so the fixture card doesn't show (and let the user skip straight to leg 2) before that round actually arrives
  milestonesConsumed: number; // how many of CUP_MILESTONE_ROUNDS have been used so far
  history: CupTie[]; // every tie resolved this cup run, across all phases
  eliminatedClubIds: string[];
  scorers: Record<string, CupTopScorerEntry>; // key: `${clubId}|${playerName}`
  championId?: string;
}

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Splits the full club pool into the three seeding tiers described above the PHASES export:
// - oitavasSeeds: the previous season's top Série A clubs (passed in by the caller, since only
//   GameContext has last season's standings) -- falls back to the CUP_OITAVAS_SEED_COUNT best
//   clubs by reputation when there's no previous season yet (a brand new career's first cup).
// - fase1ByeClubIds: of the clubs left over, the CUP_FASE0_BYE_COUNT best by reputation.
// - the remaining clubs form the Fase 0 pool.
export const computeCupSeeding = (
  clubs: Club[],
  previousSeasonTopSerieA: string[] = []
): { fase0Pool: string[]; fase1ByeClubIds: string[]; oitavasSeeds: string[] } => {
  const byReputationDesc = [...clubs].sort((a, b) => b.reputation - a.reputation);

  const oitavasSeeds = previousSeasonTopSerieA.length >= CUP_OITAVAS_SEED_COUNT
    ? previousSeasonTopSerieA.slice(0, CUP_OITAVAS_SEED_COUNT)
    : byReputationDesc.slice(0, CUP_OITAVAS_SEED_COUNT).map(c => c.id);

  const remaining = byReputationDesc.filter(c => !oitavasSeeds.includes(c.id));
  const fase1ByeClubIds = remaining.slice(0, CUP_FASE0_BYE_COUNT).map(c => c.id);
  const fase0Pool = remaining.slice(CUP_FASE0_BYE_COUNT).map(c => c.id);

  return { fase0Pool, fase1ByeClubIds, oitavasSeeds };
};

export const startCup = (
  clubs: Club[],
  year: number,
  previousSeasonTopSerieA: string[] = []
): CupState => {
  const { fase0Pool, fase1ByeClubIds, oitavasSeeds } = computeCupSeeding(clubs, previousSeasonTopSerieA);
  return {
    year,
    phaseIndex: 0,
    aliveClubIds: shuffle(fase0Pool),
    fase1ByeClubIds,
    oitavasSeeds,
    userTie: null,
    pendingSecondLeg: null,
    milestonesConsumed: 0,
    history: [],
    eliminatedClubIds: [],
    scorers: {}
  };
};

// Pairs up all currently-alive clubs into ties (random draw -- the regulation only specifies
// seeding for the Fase 1 -> Oitavas direct qualifiers, nothing for the later rounds).
export const drawPhaseTies = (aliveClubIds: string[]): { homeId: string; awayId: string }[] => {
  const shuffled = shuffle(aliveClubIds);
  const pairs: { homeId: string; awayId: string }[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    // Coin flip for which side hosts leg 1 / the single match.
    const [a, b] = Math.random() < 0.5 ? [shuffled[i], shuffled[i + 1]] : [shuffled[i + 1], shuffled[i]];
    pairs.push({ homeId: a, awayId: b });
  }
  return pairs;
};

const recordScorers = (state: CupState, result: MatchResult, homeId: string, awayId: string) => {
  result.events.forEach(e => {
    if (e.type !== 'GOAL' || !e.player) return;
    // Penalty-shootout goals never reach this path (the shootout isn't simulated through
    // simulateMatch's event feed), so every GOAL event here is a regulation-time goal and
    // counts toward the artilheiro bonus, per the rules.
    const clubId = e.clubId === homeId ? homeId : awayId;
    const key = `${clubId}|${e.player}`;
    if (!state.scorers[key]) state.scorers[key] = { playerName: e.player, clubId, goals: 0 };
    state.scorers[key].goals++;
  });
};

// Shared by both the instant bot-vs-bot shootout below and the live, kick-by-kick shootout the
// user watches for their own tie (see GameContext's penaltyShootout state machine).
export const pickShootoutTakers = (club: Club): Player[] => {
  const starters = getAutoStarters(club);
  const outfield = starters.filter(p => p.position !== 'GOL');
  return outfield.length > 0 ? outfield : starters;
};

// Best-of-5 penalty shootout, then sudden death -- resolved instantly (not shown kick by kick)
// using the same per-kick odds as an in-match penalty.
const runShootout = (homeClub: Club, awayClub: Club): { homeGoals: number; awayGoals: number; homeWins: boolean } => {
  const homeTakers = pickShootoutTakers(homeClub);
  const awayTakers = pickShootoutTakers(awayClub);

  let homeGoals = 0;
  let awayGoals = 0;
  let round = 0;
  while (round < 30) { // safety cap; a real shootout essentially never runs this long
    const homeTaker = homeTakers[round % homeTakers.length];
    const awayTaker = awayTakers[round % awayTakers.length];
    if (resolvePenaltyOutcome(homeTaker.rating, homeTaker.energy, true).scored) homeGoals++;
    if (resolvePenaltyOutcome(awayTaker.rating, awayTaker.energy, false).scored) awayGoals++;
    round++;
    if (round >= 5 && homeGoals !== awayGoals) break;
  }
  return { homeGoals, awayGoals, homeWins: homeGoals > awayGoals };
};

// Resolves one full tie (single match, or two legs for Semi/Final) given already-simulated
// results for each leg (so the caller -- GameContext -- controls exactly when/how each leg is
// simulated, letting the user's own tie be played live through the normal match engine while
// every other tie in the phase is simulated instantly).
export const resolveTie = (
  state: CupState,
  phase: CupPhase,
  homeId: string,
  awayId: string,
  homeClub: Club,
  awayClub: Club,
  legResults: CupTieLeg[],
  // When the tie is the user's own, GameContext runs the shootout live (kick by kick, through
  // the penaltyShootout modal) instead of letting this function decide it instantly -- passing
  // the already-decided result here skips the internal runShootout call.
  forcedShootout?: { homeGoals: number; awayGoals: number; homeWins: boolean }
): CupTie => {
  legResults.forEach(leg => recordScorers(state, leg, leg.homeId, leg.awayId));

  let aggHome = 0;
  let aggAway = 0;
  legResults.forEach(leg => {
    if (leg.homeId === homeId) {
      aggHome += leg.homeScore;
      aggAway += leg.awayScore;
    } else {
      aggHome += leg.awayScore;
      aggAway += leg.homeScore;
    }
  });

  let winnerId: string;
  let wentToPenalties = false;
  let penaltyHomeGoals: number | undefined;
  let penaltyAwayGoals: number | undefined;

  if (aggHome !== aggAway) {
    winnerId = aggHome > aggAway ? homeId : awayId;
  } else {
    wentToPenalties = true;
    const { homeGoals, awayGoals, homeWins } = forcedShootout ?? runShootout(homeClub, awayClub);
    penaltyHomeGoals = homeGoals;
    penaltyAwayGoals = awayGoals;
    winnerId = homeWins ? homeId : awayId;
  }

  const tie: CupTie = {
    id: `${state.year}_${phase}_${homeId}_${awayId}`,
    phase,
    homeId,
    awayId,
    legs: legResults,
    winnerId,
    aggregateHomeGoals: aggHome,
    aggregateAwayGoals: aggAway,
    wentToPenalties,
    penaltyHomeGoals,
    penaltyAwayGoals
  };

  state.history.push(tie);
  const loserId = winnerId === homeId ? awayId : homeId;
  state.eliminatedClubIds.push(loserId);
  return tie;
};

// Simulates a single-match tie entirely (used for every tie the user isn't personally involved
// in -- their own tie is simulated leg by leg by GameContext so the live-match UI can take over).
export const simulateFullTie = (
  state: CupState,
  phase: CupPhase,
  homeId: string,
  awayId: string,
  clubs: Club[]
): CupTie => {
  const homeClub = clubs.find(c => c.id === homeId)!;
  const awayClub = clubs.find(c => c.id === awayId)!;
  const legs: CupTieLeg[] = [];

  if (TWO_LEGGED_PHASES.includes(phase)) {
    const leg1 = simulateMatch(homeClub, awayClub);
    legs.push({ ...leg1, homeId, awayId });
    const leg2 = simulateMatch(awayClub, homeClub);
    legs.push({ ...leg2, homeId: awayId, awayId: homeId });
  } else {
    const leg1 = simulateMatch(homeClub, awayClub);
    legs.push({ ...leg1, homeId, awayId });
  }

  return resolveTie(state, phase, homeId, awayId, homeClub, awayClub, legs);
};

// The whole cup's top scorer(s) (excluding shootout goals, per the regulation). Ties split the
// bonus evenly between clubs.
export const getCupTopScorers = (state: CupState): CupTopScorerEntry[] => {
  const entries = Object.values(state.scorers);
  if (entries.length === 0) return [];
  const maxGoals = Math.max(...entries.map(e => e.goals));
  return entries.filter(e => e.goals === maxGoals);
};
