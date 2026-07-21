import { type Club, type Player } from '../data/database';
import { simulateMatch, getAutoStarters, resolvePenaltyOutcome, type MatchResult } from './matchEngine';

// Copa Mata-Mata: a 60-team knockout run alongside the league season (one per club in the
// game -- Série A + B + C = 20 + 20 + 20 = 60). Rules from the supplied regulation:
//  - Fase 1: 60 clubs, 30 single-match ties -> 30 winners.
//  - The top 2 Fase 1 winners (ranked by: won away, then most goals scored away) skip Fase 2
//    and go straight to Oitavas.
//  - Fase 2: the other 28 winners, 14 single-match ties -> 14 winners join the 2 direct
//    qualifiers, forming the 16 clubs in Oitavas.
//  - Oitavas (16->8) and Quartas (8->4): single match.
//  - Semifinal (4->2) and Final (2->1): two legs, home venue alternates.
//  - A drawn single match, or a tied aggregate, is decided by penalty shootout.
export type CupPhase = 'FASE1' | 'FASE2' | 'OITAVAS' | 'QUARTAS' | 'SEMI' | 'FINAL';

export const CUP_PHASE_LABEL: Record<CupPhase, string> = {
  FASE1: '1ª Fase',
  FASE2: '2ª Fase',
  OITAVAS: 'Oitavas de Final',
  QUARTAS: 'Quartas de Final',
  SEMI: 'Semifinal',
  FINAL: 'Final'
};

// Two-legged phases; every other phase is a single match.
export const TWO_LEGGED_PHASES: CupPhase[] = ['SEMI', 'FINAL'];

// R$ awarded the instant a club reaches (survives into) each stage -- cumulative, matches the
// regulation's "Premiação Acumulada" table exactly (e.g. eliminated in the Semis = 4+8+16+20 = 48M).
export const CUP_PRIZE_FOR_REACHING: Record<CupPhase, number> = {
  FASE1: 0,
  FASE2: 4_000_000,   // survived Fase 1
  OITAVAS: 8_000_000, // reached Oitavas (Fase 2 winners + the 2 direct qualifiers)
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

// Order the state machine advances through; phaseIndex 6 means the cup is done for the season.
export const PHASES: CupPhase[] = ['FASE1', 'FASE2', 'OITAVAS', 'QUARTAS', 'SEMI', 'FINAL'];

// Real football schedules a league match almost every week; this is where a cup run squeezes in
// an extra midweek fixture. Spread across the 38-round season so the pinch (two matches close
// together, less recovery) happens periodically rather than all at once. Two-legged phases
// (SEMI, FINAL) consume two of these milestones each -- one per leg.
export const CUP_MILESTONE_ROUNDS = [3, 7, 11, 15, 19, 23, 27, 31];

export interface CupUserTie {
  homeId: string;
  awayId: string;
  legs: CupTieLeg[];
}

export interface CupState {
  year: number;
  phaseIndex: number; // index into PHASES; 6 = cup finished for the season
  aliveClubIds: string[]; // clubs alive heading into PHASES[phaseIndex]
  directQualifiers: string[]; // set once Fase 1 fully resolves (incl. the user's own tie); merged into the Oitavas field once Fase 2 finishes
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

export const startCup = (clubIds: string[], year: number): CupState => ({
  year,
  phaseIndex: 0,
  aliveClubIds: shuffle(clubIds),
  directQualifiers: [],
  userTie: null,
  pendingSecondLeg: null,
  milestonesConsumed: 0,
  history: [],
  eliminatedClubIds: [],
  scorers: {}
});

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
    if (resolvePenaltyOutcome(homeTaker.rating, true).scored) homeGoals++;
    if (resolvePenaltyOutcome(awayTaker.rating, false).scored) awayGoals++;
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

// After Fase 1, ranks the 30 winners by (1) won playing away, (2) most goals scored away --
// the top 2 skip Fase 2 and go straight to Oitavas. Ties broken by goal difference in that
// match, then goals scored in that match, then a coin flip (red/yellow-card tiebreakers from
// the regulation aren't tracked at the granularity needed here).
export const rankFase1WinnersForDirectQualification = (fase1Ties: CupTie[]): string[] => {
  const scored = fase1Ties.map(tie => {
    const winnerWasAway = tie.winnerId === tie.awayId;
    const leg = tie.legs[0];
    const winnerGoalsAsAway = winnerWasAway ? leg.awayScore : -1;
    const winnerGoalDiff = winnerWasAway ? leg.awayScore - leg.homeScore : leg.homeScore - leg.awayScore;
    const winnerGoalsScored = winnerWasAway ? leg.awayScore : leg.homeScore;
    return { clubId: tie.winnerId, wonAway: winnerWasAway, awayGoals: winnerGoalsAsAway, goalDiff: winnerGoalDiff, goalsScored: winnerGoalsScored, tiebreak: Math.random() };
  });

  scored.sort((a, b) => {
    if (a.wonAway !== b.wonAway) return a.wonAway ? -1 : 1;
    if (b.awayGoals !== a.awayGoals) return b.awayGoals - a.awayGoals;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsScored !== a.goalsScored) return b.goalsScored - a.goalsScored;
    return a.tiebreak - b.tiebreak;
  });

  return scored.slice(0, 2).map(s => s.clubId);
};

// The whole cup's top scorer(s) (excluding shootout goals, per the regulation). Ties split the
// bonus evenly between clubs.
export const getCupTopScorers = (state: CupState): CupTopScorerEntry[] => {
  const entries = Object.values(state.scorers);
  if (entries.length === 0) return [];
  const maxGoals = Math.max(...entries.map(e => e.goals));
  return entries.filter(e => e.goals === maxGoals);
};
