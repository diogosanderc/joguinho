import type { Club } from '../data/database';
import { simulateMatch, getAutoStarters, resolvePenaltyOutcome } from './matchEngine';
import type { MatchResult } from './matchEngine';
import { pickShootoutTakers } from './cupEngine';

// Mundial de Clubes: the ultimate payoff for winning the Libertadores with your own club. The
// season right after that title, before a single round of the new Brasileirão is played, the
// champion faces two single matches at a neutral venue -- first a semifinal against a drawn Saudi
// Pro League club, then (only if that's won) a final against a drawn European giant. Modeled
// loosely on the real Intercontinental Cup, simplified to a 2-game ladder since it's a rare,
// once-per-title showcase rather than a full second competition. Clubs for both pools live in
// mundialClubs (GameContext, fetched from public/data/mundial_clubs.json) -- distinguished by
// `country`, same convention libertadoresClubs already uses.
export const MUNDIAL_SAUDI_COUNTRY = 'Arábia Saudita';
export const MUNDIAL_EUROPEAN_COUNTRIES = ['Inglaterra', 'Espanha', 'Itália', 'Alemanha', 'França'];

// Reaching the final (i.e. winning the semifinal) already pays out -- the champion prize is the
// real target, matching what the user asked for: R$250M / ~US$50M for winning it all.
export const MUNDIAL_FINALIST_PRIZE = 20_000_000;
export const MUNDIAL_CHAMPION_PRIZE = 250_000_000;

export type MundialPhase = 'SEMIFINAL' | 'FINAL';

export interface MundialTieResult extends MatchResult {
  winnerId: string;
  wentToExtraTime: boolean;
  extraTimeHomeGoals?: number;
  extraTimeAwayGoals?: number;
  wentToPenalties: boolean;
  penaltyHomeGoals?: number;
  penaltyAwayGoals?: number;
}

export interface MundialState {
  year: number;
  phase: MundialPhase;
  semifinalOpponentId: string;
  finalOpponentId: string | null;
  semifinalTie: MundialTieResult | null;
  finalTie: MundialTieResult | null;
  championId: string | null; // set only once the final is won
  eliminated: boolean; // lost the semifinal -- Mundial over for the season
}

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const drawMundialSemifinalOpponent = (mundialClubs: Club[]): string => {
  const pool = mundialClubs.filter(c => c.country === MUNDIAL_SAUDI_COUNTRY);
  return shuffle(pool)[0].id;
};

export const drawMundialFinalOpponent = (mundialClubs: Club[]): string => {
  const pool = mundialClubs.filter(c => MUNDIAL_EUROPEAN_COUNTRIES.includes(c.country ?? ''));
  return shuffle(pool)[0].id;
};

export const startMundial = (year: number, mundialClubs: Club[]): MundialState => ({
  year,
  phase: 'SEMIFINAL',
  semifinalOpponentId: drawMundialSemifinalOpponent(mundialClubs),
  finalOpponentId: null,
  semifinalTie: null,
  finalTie: null,
  championId: null,
  eliminated: false
});

const simulateExtraTime = (homeClub: Club, awayClub: Club): { homeGoals: number; awayGoals: number } => {
  const result = simulateMatch(homeClub, awayClub, getAutoStarters(homeClub), getAutoStarters(awayClub), {
    startMinute: 91,
    endMinute: 120
  });
  return { homeGoals: result.homeScore, awayGoals: result.awayScore };
};

// Best-of-5 then sudden death, resolved instantly (not shown kick by kick) -- unlike the user's
// own Cup/Libertadores ties, reaching a shootout here is a rare edge case within an already rare
// event (once per Libertadores title), so it isn't worth the extra live-shootout UI plumbing.
const runShootout = (homeClub: Club, awayClub: Club): { homeGoals: number; awayGoals: number; homeWins: boolean } => {
  const homeTakers = pickShootoutTakers(homeClub);
  const awayTakers = pickShootoutTakers(awayClub);
  let homeGoals = 0;
  let awayGoals = 0;
  let round = 0;
  while (round < 30) {
    const homeTaker = homeTakers[round % homeTakers.length];
    const awayTaker = awayTakers[round % awayTakers.length];
    if (resolvePenaltyOutcome(homeTaker.rating, homeTaker.energy, true).scored) homeGoals++;
    if (resolvePenaltyOutcome(awayTaker.rating, awayTaker.energy, false).scored) awayGoals++;
    round++;
    if (round >= 5 && homeGoals !== awayGoals) break;
  }
  return { homeGoals, awayGoals, homeWins: homeGoals > awayGoals };
};

// Resolves an already-simulated (90-minute) match into a final tie result. Semifinal: a tie goes
// straight to penalties, no extra time -- matching every other non-final knockout tie in the game.
// Final: instant extra time (2x15) first, penalties only if still level after that.
export const resolveMundialTie = (
  phase: MundialPhase,
  homeId: string,
  awayId: string,
  homeClub: Club,
  awayClub: Club,
  result: MatchResult
): MundialTieResult => {
  if (result.homeScore !== result.awayScore) {
    return {
      ...result,
      winnerId: result.homeScore > result.awayScore ? homeId : awayId,
      wentToExtraTime: false,
      wentToPenalties: false
    };
  }

  if (phase === 'FINAL') {
    const et = simulateExtraTime(homeClub, awayClub);
    const homeTotal = result.homeScore + et.homeGoals;
    const awayTotal = result.awayScore + et.awayGoals;
    if (homeTotal !== awayTotal) {
      return {
        ...result,
        winnerId: homeTotal > awayTotal ? homeId : awayId,
        wentToExtraTime: true,
        extraTimeHomeGoals: et.homeGoals,
        extraTimeAwayGoals: et.awayGoals,
        wentToPenalties: false
      };
    }
    const { homeGoals, awayGoals, homeWins } = runShootout(homeClub, awayClub);
    return {
      ...result,
      winnerId: homeWins ? homeId : awayId,
      wentToExtraTime: true,
      extraTimeHomeGoals: et.homeGoals,
      extraTimeAwayGoals: et.awayGoals,
      wentToPenalties: true,
      penaltyHomeGoals: homeGoals,
      penaltyAwayGoals: awayGoals
    };
  }

  const { homeGoals, awayGoals, homeWins } = runShootout(homeClub, awayClub);
  return {
    ...result,
    winnerId: homeWins ? homeId : awayId,
    wentToExtraTime: false,
    wentToPenalties: true,
    penaltyHomeGoals: homeGoals,
    penaltyAwayGoals: awayGoals
  };
};
