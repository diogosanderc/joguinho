import { type Club } from '../data/database';
import { simulateMatch, getAutoStarters, resolvePenaltyOutcome } from './matchEngine';
import type { MatchResult } from './matchEngine';
import { pickShootoutTakers } from './cupEngine';

// Copa Libertadores. 32 clubes: os 4 primeiros do Brasileirão Série A da temporada anterior
// (vaga automática) + o campeão defensor (se não estiver já entre os 4, bônus de vaga) + os
// slots restantes sorteados da base de clubes sul-americanos (libertadoresClubs em
// GameContext), com cota fixa de 60%/40% Argentina/Colômbia pedida pelo usuário -- garante
// variedade de temporada a temporada sem deixar um país dominar o sorteio por puro acaso.
//
// Fase de grupos: sorteados em 8 grupos de 4 (A-H), turno e returno (6 jogos por clube, 12
// partidas por grupo). Classificação: pontos, saldo de gols, gols marcados, vitórias, sorteio
// -- nessa ordem exata, com o "sorteio" fixado uma vez no sorteio dos grupos (não re-sorteado
// a cada cálculo, pra não flicar visualmente). Os 2 primeiros de cada grupo avançam: líderes
// formam o Pote 1, vices o Pote 2.
//
// Mata-mata: sorteio das oitavas pareia Pote 1 x Pote 2 (sem restrição de país), Pote 1 manda o
// jogo de volta. Diferente da Copa do Brasil (que resorteia a cada fase), aqui "o chaveamento
// permanece fixo após o sorteio das oitavas" -- por isso o bracket é rastreado como um array
// plano (bracketOrder) que vai reduzindo pela metade a cada fase, preservando quem joga com quem.
// Oitavas/quartas/semis: ida e volta, agregado, sem gol fora, empate agregado vai direto pros
// pênaltis (sem prorrogação). Final: jogo único, empate após 90min vai pra prorrogação (2x15),
// pênaltis se persistir o empate.
export const LIBERTADORES_TEAM_COUNT = 32;
export const LIBERTADORES_AUTO_QUALIFIER_COUNT = 4;
export const LIBERTADORES_WILDCARD_ARG_SHARE = 0.6;
export const LIBERTADORES_GROUP_SIZE = 4;
export const LIBERTADORES_GROUP_ROUNDS = 6;

export const LIBERTADORES_GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type LibertadoresGroupLabel = typeof LIBERTADORES_GROUP_LABELS[number];

export type LibertadoresPhase = 'GROUPS' | 'OITAVAS' | 'QUARTAS' | 'SEMI' | 'FINAL';
export const LIBERTADORES_PHASES: LibertadoresPhase[] = ['GROUPS', 'OITAVAS', 'QUARTAS', 'SEMI', 'FINAL'];
export const LIBERTADORES_PHASE_LABEL: Record<LibertadoresPhase, string> = {
  GROUPS: 'Fase de Grupos',
  OITAVAS: 'Oitavas de Final',
  QUARTAS: 'Quartas de Final',
  SEMI: 'Semifinal',
  FINAL: 'Final'
};
// Two-legged knockout phases; FINAL is a single match at a neutral venue.
export const LIBERTADORES_TWO_LEGGED_PHASES: LibertadoresPhase[] = ['OITAVAS', 'QUARTAS', 'SEMI'];

// Group-stage milestones (rounds 3,7,11,15,19,23) then 7 knockout milestones (oitavas ida/volta,
// quartas ida/volta, semi ida/volta, final) spread through the rest of the season. Deliberately
// overlaps some of Copa do Brasil's own milestones (26, 30, 34) -- per the user's explicit
// choice, a week where both competitions are due just means two extra matches that week instead
// of one, resolved in sequence (Copa do Brasil first).
export const LIBERTADORES_GROUP_MILESTONE_ROUNDS = [3, 7, 11, 15, 19, 23];
export const LIBERTADORES_KNOCKOUT_MILESTONE_ROUNDS = [26, 28, 30, 32, 34, 36, 38];
export const LIBERTADORES_MILESTONE_ROUNDS = [...LIBERTADORES_GROUP_MILESTONE_ROUNDS, ...LIBERTADORES_KNOCKOUT_MILESTONE_ROUNDS];

// R$ awarded the instant a club reaches (survives into) each knockout stage -- cumulative, same
// "prêmio acumulado" pattern as Copa do Brasil's CUP_PRIZE_FOR_REACHING, scaled up since the
// Libertadores is the continent's most prestigious (and lucrative) club competition.
export const LIBERTADORES_PRIZE_FOR_REACHING: Record<LibertadoresPhase, number> = {
  GROUPS: 10_000_000, // just for qualifying/participating in the group stage
  OITAVAS: 0, // group stage winners/runners-up already covered by GROUPS prize; oitavas itself carries no extra "reached" bonus
  QUARTAS: 25_000_000,
  SEMI: 40_000_000,
  FINAL: 0 // the final carries no "reached" bonus -- only the champion bonus below
};
export const LIBERTADORES_CHAMPION_PRIZE = 150_000_000;
export const LIBERTADORES_TOP_SCORER_BONUS = 15_000_000;

export interface LibertadoresMatch {
  group: LibertadoresGroupLabel;
  round: number; // 1-6
  homeId: string;
  awayId: string;
  result?: MatchResult;
  simulated: boolean;
}

export interface LibertadoresStandingRow {
  clubId: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
}

export interface LibertadoresTieLeg extends MatchResult {
  homeId: string; // the actual home side for THIS leg (flips between leg1/leg2)
  awayId: string;
}

export interface LibertadoresTie {
  id: string;
  phase: LibertadoresPhase;
  homeId: string; // hosts leg1 (and leg2's away side); Pote 2 club for OITAVAS
  awayId: string; // hosts leg2 (Pote 1 advantage); Pote 1 club for OITAVAS
  legs: LibertadoresTieLeg[];
  winnerId: string;
  aggregateHomeGoals: number;
  aggregateAwayGoals: number;
  wentToExtraTime: boolean;
  extraTimeHomeGoals?: number;
  extraTimeAwayGoals?: number;
  wentToPenalties: boolean;
  penaltyHomeGoals?: number;
  penaltyAwayGoals?: number;
}

export interface LibertadoresTopScorerEntry {
  playerName: string;
  clubId: string;
  goals: number;
}

export interface LibertadoresUserTie {
  homeId: string;
  awayId: string;
  legs: LibertadoresTieLeg[];
  group?: LibertadoresGroupLabel; // only set during the GROUPS phase (single match, no legs concept)
}

export interface LibertadoresState {
  year: number;
  phase: LibertadoresPhase;
  phaseIndex: number; // index into LIBERTADORES_PHASES; 5 = tournament finished for the season
  participantIds: string[]; // all 32
  brazilianClubIds: string[]; // top-4 Série A auto-qualifiers, plus a defending Brazilian champion outside the top 4 (rare)
  defendingChampionBonusId: string | null; // last season's champion, if it's a foreign club given the bonus slot
  wildcardClubIds: string[]; // the drawn South American clubs (includes the defending champion if foreign)
  groups: Record<LibertadoresGroupLabel, string[]>;
  schedule: LibertadoresMatch[]; // the 96 group-stage matches
  tiebreakSeeds: Record<string, number>;
  groupRoundsPlayed: number; // 0-6
  potOne: string[]; // the 8 group winners, filled once groupRoundsPlayed reaches 6
  potTwo: string[]; // the 8 runners-up
  bracketOrder: string[]; // flat knockout bracket: adjacent pairs (0v1, 2v3, ...) are this phase's ties; halves every phase as winners advance
  userTie: LibertadoresUserTie | null; // non-null exactly when the user has a fixture due right now (group match or knockout leg)
  pendingSecondLeg: LibertadoresUserTie | null;
  milestonesConsumed: number; // how many of LIBERTADORES_MILESTONE_ROUNDS have been used so far
  history: LibertadoresTie[]; // knockout ties resolved this run (group matches are tracked in `schedule` instead)
  eliminatedClubIds: string[];
  scorers: Record<string, LibertadoresTopScorerEntry>;
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

// Splits participants into: the 4 automatic Brazilian qualifiers (+ a possible 5th "defending
// champion" bonus slot if it's a Brazilian club outside the top 4) and the South American
// wildcards (drawn 60/40 Argentina/Colômbia of whatever slots remain -- proportional so the
// split stays sensible even when the champion bonus eats into the wildcard pool).
// previousSeasonTopSerieA is the actual previous season's top 4 (tracked by GameContext, same
// data source Copa do Brasil's seeding already uses); if there's no previous season yet (a
// brand new career), falls back to the 4 best-reputation Brazilian clubs.
export const computeLibertadoresParticipants = (
  libertadoresClubs: Club[],
  previousSeasonTopSerieA: string[],
  fallbackBrazilianClubs: Club[],
  defendingChampionId?: string | null
): { brazilianClubIds: string[]; defendingChampionBonusId: string | null; wildcardClubIds: string[] } => {
  const top4 = previousSeasonTopSerieA.length >= LIBERTADORES_AUTO_QUALIFIER_COUNT
    ? previousSeasonTopSerieA.slice(0, LIBERTADORES_AUTO_QUALIFIER_COUNT)
    : [...fallbackBrazilianClubs]
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, LIBERTADORES_AUTO_QUALIFIER_COUNT)
        .map(c => c.id);

  const brazilianClubIds = [...top4];
  let defendingChampionBonusId: string | null = null;

  if (defendingChampionId && !brazilianClubIds.includes(defendingChampionId)) {
    const isForeignClub = libertadoresClubs.some(c => c.id === defendingChampionId);
    if (isForeignClub) {
      defendingChampionBonusId = defendingChampionId;
    } else {
      // A Brazilian club defending a title won last season despite missing the top 4 this year.
      brazilianClubIds.push(defendingChampionId);
    }
  }

  const guaranteedForeignCount = defendingChampionBonusId ? 1 : 0;
  const remainingSlots = LIBERTADORES_TEAM_COUNT - brazilianClubIds.length - guaranteedForeignCount;
  const argCount = Math.round(remainingSlots * LIBERTADORES_WILDCARD_ARG_SHARE);
  const colCount = remainingSlots - argCount;

  const pool = libertadoresClubs.filter(c => c.id !== defendingChampionBonusId);
  const argentine = shuffle(pool.filter(c => c.country === 'Argentina'));
  const colombian = shuffle(pool.filter(c => c.country === 'Colômbia'));

  const wildcardClubIds = [
    ...(defendingChampionBonusId ? [defendingChampionBonusId] : []),
    ...argentine.slice(0, argCount).map(c => c.id),
    ...colombian.slice(0, colCount).map(c => c.id)
  ];

  return { brazilianClubIds, defendingChampionBonusId, wildcardClubIds };
};

// Plain random draw into 8 groups of 4 -- the regulation only specifies seeding pots for the
// round-of-16 draw, nothing for this initial group draw.
export const drawLibertadoresGroups = (participantIds: string[]): Record<LibertadoresGroupLabel, string[]> => {
  const shuffled = shuffle(participantIds);
  const groups = {} as Record<LibertadoresGroupLabel, string[]>;
  LIBERTADORES_GROUP_LABELS.forEach((label, i) => {
    groups[label] = shuffled.slice(i * LIBERTADORES_GROUP_SIZE, (i + 1) * LIBERTADORES_GROUP_SIZE);
  });
  return groups;
};

// Fixed once per group draw so a genuine tie on points/GD/goals/wins resolves the same way every
// time standings are recalculated during the season, instead of re-rolling (and visually
// flickering) on every render.
export const generateTiebreakSeeds = (participantIds: string[]): Record<string, number> => {
  const seeds: Record<string, number> = {};
  participantIds.forEach(id => { seeds[id] = Math.random(); });
  return seeds;
};

// Classic circle method for 4 clubs: 3 rounds cover every pairing once (single round-robin);
// rounds 4-6 repeat the same pairings with home/away flipped (the "returno"), giving exactly
// 6 matches per club (12 total per group) as the regulation specifies.
const ROUND_ROBIN_PAIRS_4: [number, number][][] = [
  [[0, 3], [1, 2]],
  [[0, 2], [3, 1]],
  [[0, 1], [2, 3]],
];

export const generateGroupSchedule = (groupLabel: LibertadoresGroupLabel, clubIds: string[]): LibertadoresMatch[] => {
  const matches: LibertadoresMatch[] = [];
  ROUND_ROBIN_PAIRS_4.forEach((roundPairs, i) => {
    roundPairs.forEach(([a, b]) => {
      matches.push({ group: groupLabel, round: i + 1, homeId: clubIds[a], awayId: clubIds[b], simulated: false });
    });
  });
  ROUND_ROBIN_PAIRS_4.forEach((roundPairs, i) => {
    roundPairs.forEach(([a, b]) => {
      matches.push({ group: groupLabel, round: i + 4, homeId: clubIds[b], awayId: clubIds[a], simulated: false });
    });
  });
  return matches;
};

// Orchestrator: draw the 32 participants, split into 8 groups, generate the full 96-match
// schedule and fixed tiebreak seeds. Mirrors cupEngine's startCup.
export const startLibertadores = (
  year: number,
  libertadoresClubs: Club[],
  previousSeasonTopSerieA: string[],
  fallbackBrazilianClubs: Club[],
  defendingChampionId?: string | null
): LibertadoresState => {
  const { brazilianClubIds, defendingChampionBonusId, wildcardClubIds } = computeLibertadoresParticipants(
    libertadoresClubs, previousSeasonTopSerieA, fallbackBrazilianClubs, defendingChampionId
  );
  const participantIds = [...brazilianClubIds, ...wildcardClubIds];
  const groups = drawLibertadoresGroups(participantIds);
  const tiebreakSeeds = generateTiebreakSeeds(participantIds);
  const schedule = LIBERTADORES_GROUP_LABELS.flatMap(label => generateGroupSchedule(label, groups[label]));

  return {
    year,
    phase: 'GROUPS',
    phaseIndex: 0,
    participantIds,
    brazilianClubIds,
    defendingChampionBonusId,
    wildcardClubIds,
    groups,
    schedule,
    tiebreakSeeds,
    groupRoundsPlayed: 0,
    potOne: [],
    potTwo: [],
    bracketOrder: [],
    userTie: null,
    pendingSecondLeg: null,
    milestonesConsumed: 0,
    history: [],
    eliminatedClubIds: [],
    scorers: {}
  };
};

const recordLibertadoresScorers = (state: LibertadoresState, result: MatchResult, homeId: string, awayId: string) => {
  result.events.forEach(e => {
    if (e.type !== 'GOAL' || !e.player) return;
    const clubId = e.clubId === homeId ? homeId : awayId;
    const key = `${clubId}|${e.player}`;
    if (!state.scorers[key]) state.scorers[key] = { playerName: e.player, clubId, goals: 0 };
    state.scorers[key].goals++;
  });
};

// Simulates a single group-stage match instantly (AI vs AI -- the user's own match is played
// live through the normal match engine by GameContext).
export const simulateGroupMatch = (homeClub: Club, awayClub: Club): MatchResult =>
  simulateMatch(homeClub, awayClub, getAutoStarters(homeClub), getAutoStarters(awayClub));

// Simulates every not-yet-simulated match in the given group-stage round, recording scorers as
// it goes. Returns the updated schedule; the caller (GameContext) is responsible for excluding
// the user's own match from this (or calling it after the user's match is already marked
// simulated) so their live result isn't silently overwritten.
export const simulateGroupRound = (
  state: LibertadoresState,
  round: number,
  clubsById: Record<string, Club>
): LibertadoresMatch[] => {
  return state.schedule.map(m => {
    if (m.round !== round || m.simulated) return m;
    const homeClub = clubsById[m.homeId];
    const awayClub = clubsById[m.awayId];
    if (!homeClub || !awayClub) return m;
    const result = simulateGroupMatch(homeClub, awayClub);
    recordLibertadoresScorers(state, result, m.homeId, m.awayId);
    return { ...m, result, simulated: true };
  });
};

// Points, saldo de gols, gols marcados, vitórias, sorteio -- exactly the regulation's order.
export const calculateGroupStandings = (
  clubIds: string[],
  matches: LibertadoresMatch[],
  tiebreakSeeds: Record<string, number>
): LibertadoresStandingRow[] => {
  const rows: Record<string, LibertadoresStandingRow> = {};
  clubIds.forEach(id => {
    rows[id] = { clubId: id, points: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0 };
  });

  matches.forEach(m => {
    if (!m.result) return;
    const home = rows[m.homeId];
    const away = rows[m.awayId];
    if (!home || !away) return;
    home.played++; away.played++;
    home.gf += m.result.homeScore; home.ga += m.result.awayScore;
    away.gf += m.result.awayScore; away.ga += m.result.homeScore;
    if (m.result.homeScore > m.result.awayScore) {
      home.wins++; home.points += 3; away.losses++;
    } else if (m.result.homeScore < m.result.awayScore) {
      away.wins++; away.points += 3; home.losses++;
    } else {
      home.draws++; away.draws++; home.points += 1; away.points += 1;
    }
  });

  Object.values(rows).forEach(r => { r.gd = r.gf - r.ga; });

  return Object.values(rows).sort((a, b) =>
    b.points - a.points ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    b.wins - a.wins ||
    (tiebreakSeeds[b.clubId] ?? 0) - (tiebreakSeeds[a.clubId] ?? 0)
  );
};

// Top 2 of every group advance: group winners form Pote 1, runners-up form Pote 2.
export const getLibertadoresAdvancement = (
  state: LibertadoresState
): { potOne: string[]; potTwo: string[]; standingsByGroup: Record<LibertadoresGroupLabel, LibertadoresStandingRow[]> } => {
  const potOne: string[] = [];
  const potTwo: string[] = [];
  const standingsByGroup = {} as Record<LibertadoresGroupLabel, LibertadoresStandingRow[]>;

  LIBERTADORES_GROUP_LABELS.forEach(label => {
    const groupMatches = state.schedule.filter(m => m.group === label);
    const standings = calculateGroupStandings(state.groups[label], groupMatches, state.tiebreakSeeds);
    standingsByGroup[label] = standings;
    potOne.push(standings[0].clubId);
    potTwo.push(standings[1].clubId);
  });

  return { potOne, potTwo, standingsByGroup };
};

// Round-of-16 draw: pairs every Pote 1 club with a Pote 2 club, no restrictions. Returns a flat
// 16-length array where adjacent pairs (0v1, 2v3, ...) are the 8 ties -- this IS the bracket,
// and stays fixed from here on (each later phase's pairing is just this array halved to winners,
// see resolveLibertadoresBracketRound below), per "o chaveamento permanecerá fixo após o sorteio
// das oitavas". Slot 0 of each pair hosts leg 1; slot 1 hosts leg 2 -- Pote 1 clubs go in slot 1
// so they get the "manda a volta em casa" advantage the regulation specifies.
export const drawLibertadoresKnockout = (potOne: string[], potTwo: string[]): string[] => {
  const shuffledPotOne = shuffle(potOne);
  const shuffledPotTwo = shuffle(potTwo);
  const bracketOrder: string[] = [];
  for (let i = 0; i < shuffledPotOne.length; i++) {
    bracketOrder.push(shuffledPotTwo[i]);
    bracketOrder.push(shuffledPotOne[i]);
  }
  return bracketOrder;
};

// Reads the current phase's ties directly off bracketOrder's adjacent pairs.
export const getBracketPairs = (bracketOrder: string[]): { homeId: string; awayId: string }[] => {
  const pairs: { homeId: string; awayId: string }[] = [];
  for (let i = 0; i < bracketOrder.length; i += 2) {
    pairs.push({ homeId: bracketOrder[i], awayId: bracketOrder[i + 1] });
  }
  return pairs;
};

// Extra time (2x15) for the Final only, simulated as a standalone 91-120' continuation.
const simulateLibertadoresExtraTime = (homeClub: Club, awayClub: Club): { homeGoals: number; awayGoals: number } => {
  const result = simulateMatch(homeClub, awayClub, getAutoStarters(homeClub), getAutoStarters(awayClub), {
    startMinute: 91,
    endMinute: 120
  });
  return { homeGoals: result.homeScore, awayGoals: result.awayScore };
};

const runLibertadoresShootout = (homeClub: Club, awayClub: Club): { homeGoals: number; awayGoals: number; homeWins: boolean } => {
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

// Resolves one full tie given already-simulated leg results (so the caller -- GameContext --
// controls exactly when/how each leg is simulated, letting the user's own tie be played live
// while every other tie in the phase is simulated instantly). Oitavas/Quartas/Semi: aggregate
// score with no away-goals rule; a tie goes straight to penalties, no extra time. Final: single
// match: a 90-minute tie goes to extra time (2x15), penalties only if still level after that.
export const resolveLibertadoresTie = (
  state: LibertadoresState,
  phase: LibertadoresPhase,
  homeId: string,
  awayId: string,
  homeClub: Club,
  awayClub: Club,
  legResults: LibertadoresTieLeg[],
  forcedExtraTime?: { homeGoals: number; awayGoals: number },
  forcedShootout?: { homeGoals: number; awayGoals: number; homeWins: boolean }
): LibertadoresTie => {
  legResults.forEach(leg => recordLibertadoresScorers(state, leg, leg.homeId, leg.awayId));

  let aggHome = 0;
  let aggAway = 0;
  legResults.forEach(leg => {
    if (leg.homeId === homeId) { aggHome += leg.homeScore; aggAway += leg.awayScore; }
    else { aggHome += leg.awayScore; aggAway += leg.homeScore; }
  });

  let winnerId: string;
  let wentToExtraTime = false;
  let extraTimeHomeGoals: number | undefined;
  let extraTimeAwayGoals: number | undefined;
  let wentToPenalties = false;
  let penaltyHomeGoals: number | undefined;
  let penaltyAwayGoals: number | undefined;

  if (aggHome !== aggAway) {
    winnerId = aggHome > aggAway ? homeId : awayId;
  } else if (phase === 'FINAL') {
    wentToExtraTime = true;
    const et = forcedExtraTime ?? simulateLibertadoresExtraTime(homeClub, awayClub);
    extraTimeHomeGoals = et.homeGoals;
    extraTimeAwayGoals = et.awayGoals;
    aggHome += et.homeGoals;
    aggAway += et.awayGoals;
    if (aggHome !== aggAway) {
      winnerId = aggHome > aggAway ? homeId : awayId;
    } else {
      wentToPenalties = true;
      const { homeGoals, awayGoals, homeWins } = forcedShootout ?? runLibertadoresShootout(homeClub, awayClub);
      penaltyHomeGoals = homeGoals; penaltyAwayGoals = awayGoals;
      winnerId = homeWins ? homeId : awayId;
    }
  } else {
    wentToPenalties = true;
    const { homeGoals, awayGoals, homeWins } = forcedShootout ?? runLibertadoresShootout(homeClub, awayClub);
    penaltyHomeGoals = homeGoals; penaltyAwayGoals = awayGoals;
    winnerId = homeWins ? homeId : awayId;
  }

  const tie: LibertadoresTie = {
    id: `${state.year}_${phase}_${homeId}_${awayId}`,
    phase, homeId, awayId, legs: legResults, winnerId,
    aggregateHomeGoals: aggHome, aggregateAwayGoals: aggAway,
    wentToExtraTime, extraTimeHomeGoals, extraTimeAwayGoals,
    wentToPenalties, penaltyHomeGoals, penaltyAwayGoals
  };

  state.history.push(tie);
  const loserId = winnerId === homeId ? awayId : homeId;
  state.eliminatedClubIds.push(loserId);
  return tie;
};

// Simulates a full tie entirely (used for every tie the user isn't personally involved in).
export const simulateFullLibertadoresTie = (
  state: LibertadoresState,
  phase: LibertadoresPhase,
  homeId: string,
  awayId: string,
  clubsById: Record<string, Club>
): LibertadoresTie => {
  const homeClub = clubsById[homeId];
  const awayClub = clubsById[awayId];
  const legs: LibertadoresTieLeg[] = [];

  if (LIBERTADORES_TWO_LEGGED_PHASES.includes(phase)) {
    const leg1 = simulateMatch(homeClub, awayClub);
    legs.push({ ...leg1, homeId, awayId });
    const leg2 = simulateMatch(awayClub, homeClub);
    legs.push({ ...leg2, homeId: awayId, awayId: homeId });
  } else {
    const leg1 = simulateMatch(homeClub, awayClub);
    legs.push({ ...leg1, homeId, awayId });
  }

  return resolveLibertadoresTie(state, phase, homeId, awayId, homeClub, awayClub, legs);
};

// The whole competition's top scorer(s) (shootout/extra-time-via-penalties goals excluded, same
// as Copa do Brasil). Ties split the bonus evenly between clubs.
export const getLibertadoresTopScorers = (state: LibertadoresState): LibertadoresTopScorerEntry[] => {
  const entries = Object.values(state.scorers);
  if (entries.length === 0) return [];
  const maxGoals = Math.max(...entries.map(e => e.goals));
  return entries.filter(e => e.goals === maxGoals);
};
