import { type Club } from '../data/database';
import { simulateMatch, getAutoStarters } from './matchEngine';
import type { MatchResult } from './matchEngine';

// Copa Libertadores -- fase de grupos. 32 clubes: os 4 primeiros do Brasileirão Série A da
// temporada anterior (vaga automática) + 28 sorteados da base de clubes sul-americanos
// (libertadoresClubs em GameContext), com cota fixa de 60%/40% Argentina/Colômbia (17 + 11 = 28)
// pedida pelo usuário -- garante variedade de temporada a temporada sem deixar um país
// dominar o sorteio por puro acaso. Sorteados em 8 grupos de 4 (A-H), turno e returno (6 jogos
// por clube). Classificação: pontos, saldo de gols, gols marcados, vitórias, sorteio -- nessa
// ordem exata. Os 2 primeiros de cada grupo avançam às oitavas (Fase 3 cuida do sorteio e do
// mata-mata em si); o restante é eliminado.
export const LIBERTADORES_TEAM_COUNT = 32;
export const LIBERTADORES_AUTO_QUALIFIER_COUNT = 4;
export const LIBERTADORES_WILDCARD_ARG_COUNT = 17;
export const LIBERTADORES_WILDCARD_COL_COUNT = 11;
export const LIBERTADORES_GROUP_SIZE = 4;
export const LIBERTADORES_GROUP_ROUNDS = 6;

export const LIBERTADORES_GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type LibertadoresGroupLabel = typeof LIBERTADORES_GROUP_LABELS[number];

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

export interface LibertadoresState {
  year: number;
  participantIds: string[]; // all 32, in no particular order
  brazilianClubIds: string[]; // the 4 auto-qualifiers (previous season's top 4 Série A)
  wildcardClubIds: string[]; // the 28 drawn South American clubs (17 ARG + 11 COL)
  groups: Record<LibertadoresGroupLabel, string[]>; // 4 clubIds per group
  schedule: LibertadoresMatch[]; // 8 groups x 6 matches = 48 matches total
  tiebreakSeeds: Record<string, number>; // fixed per-season "sorteio" value, assigned once at the draw
  currentRound: number; // 1-6, which group-stage round is next
  completed: boolean;
  potOne: string[]; // filled in once the group stage ends: the 8 group winners
  potTwo: string[]; // the 8 runners-up
}

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Splits participants into the 4 automatic Brazilian qualifiers + 28 South American wildcards.
// previousSeasonTopSerieA is the actual previous season's top 4 (tracked by GameContext, same
// data source the Copa do Brasil seeding already uses); if there's no previous season yet (a
// brand new career), falls back to the 4 best-reputation Brazilian clubs so the very first
// Libertadores run still has 4 real qualifiers instead of crashing on an empty list.
export const computeLibertadoresParticipants = (
  libertadoresClubs: Club[],
  previousSeasonTopSerieA: string[],
  fallbackBrazilianClubs: Club[]
): { brazilianClubIds: string[]; wildcardClubIds: string[] } => {
  const brazilianClubIds = previousSeasonTopSerieA.length >= LIBERTADORES_AUTO_QUALIFIER_COUNT
    ? previousSeasonTopSerieA.slice(0, LIBERTADORES_AUTO_QUALIFIER_COUNT)
    : [...fallbackBrazilianClubs]
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, LIBERTADORES_AUTO_QUALIFIER_COUNT)
        .map(c => c.id);

  const argentine = shuffle(libertadoresClubs.filter(c => c.country === 'Argentina'));
  const colombian = shuffle(libertadoresClubs.filter(c => c.country === 'Colômbia'));

  const wildcardClubIds = [
    ...argentine.slice(0, LIBERTADORES_WILDCARD_ARG_COUNT).map(c => c.id),
    ...colombian.slice(0, LIBERTADORES_WILDCARD_COL_COUNT).map(c => c.id)
  ];

  return { brazilianClubIds, wildcardClubIds };
};

// Plain random draw into 8 groups of 4 -- the regulation only specifies seeding pots for the
// round-of-16 draw (Fase 3), nothing for this initial group draw.
export const drawLibertadoresGroups = (participantIds: string[]): Record<LibertadoresGroupLabel, string[]> => {
  const shuffled = shuffle(participantIds);
  const groups = {} as Record<LibertadoresGroupLabel, string[]>;
  LIBERTADORES_GROUP_LABELS.forEach((label, i) => {
    groups[label] = shuffled.slice(i * LIBERTADORES_GROUP_SIZE, (i + 1) * LIBERTADORES_GROUP_SIZE);
  });
  return groups;
};

// Fixed once per group draw so a genuine 4-way tie on points/GD/goals/wins resolves the same
// way every time standings are recalculated during the season, instead of re-rolling (and
// visually flickering) on every render.
export const generateTiebreakSeeds = (participantIds: string[]): Record<string, number> => {
  const seeds: Record<string, number> = {};
  participantIds.forEach(id => { seeds[id] = Math.random(); });
  return seeds;
};

// Classic circle method for 4 clubs: 3 rounds cover every pairing once (single round-robin);
// rounds 4-6 repeat the same pairings with home/away flipped (the "returno"), giving exactly
// 6 matches per club as the regulation specifies.
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

// Orchestrator: draw the 32 participants, split into 8 groups, generate the full 48-match
// schedule and fixed tiebreak seeds. Mirrors cupEngine's startCup.
export const startLibertadores = (
  year: number,
  libertadoresClubs: Club[],
  previousSeasonTopSerieA: string[],
  fallbackBrazilianClubs: Club[]
): LibertadoresState => {
  const { brazilianClubIds, wildcardClubIds } = computeLibertadoresParticipants(
    libertadoresClubs, previousSeasonTopSerieA, fallbackBrazilianClubs
  );
  const participantIds = [...brazilianClubIds, ...wildcardClubIds];
  const groups = drawLibertadoresGroups(participantIds);
  const tiebreakSeeds = generateTiebreakSeeds(participantIds);
  const schedule = LIBERTADORES_GROUP_LABELS.flatMap(label => generateGroupSchedule(label, groups[label]));

  return {
    year,
    participantIds,
    brazilianClubIds,
    wildcardClubIds,
    groups,
    schedule,
    tiebreakSeeds,
    currentRound: 1,
    completed: false,
    potOne: [],
    potTwo: []
  };
};

// Simulates a single match instantly (AI vs AI -- the user's own match, once Fase 3 wires the
// calendar, will be played live and its result passed in some other way instead of through here).
export const simulateGroupMatch = (homeClub: Club, awayClub: Club): MatchResult =>
  simulateMatch(homeClub, awayClub, getAutoStarters(homeClub), getAutoStarters(awayClub));

// Simulates every not-yet-simulated match in the given round across all 8 groups.
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

// Top 2 of every group advance: group winners form Pote 1, runners-up form Pote 2 (Fase 3's
// round-of-16 draw pairs one club from each pot, Pote 1 hosting the second leg).
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
