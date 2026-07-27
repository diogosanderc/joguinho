import type { CareerStats } from './database';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (stats: CareerStats) => boolean;
}

// Achievements are derived, not separately "unlocked and stored" -- each one's `check` is just
// evaluated against the manager's lifetime CareerStats every time the Conquistas screen opens,
// so there's no separate persisted "unlocked" list to keep in sync.
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_win',
    title: 'Primeira Vitória',
    description: 'Vença sua primeira partida como técnico.',
    icon: '⚽',
    check: (s) => s.totalWins >= 1
  },
  {
    id: 'wins_50',
    title: 'Veterano',
    description: 'Vença 50 partidas na carreira.',
    icon: '🥉',
    check: (s) => s.totalWins >= 50
  },
  {
    id: 'wins_100',
    title: 'Centenário',
    description: 'Vença 100 partidas na carreira.',
    icon: '🥈',
    check: (s) => s.totalWins >= 100
  },
  {
    id: 'wins_250',
    title: 'Lenda dos Gramados',
    description: 'Vença 250 partidas na carreira.',
    icon: '🥇',
    check: (s) => s.totalWins >= 250
  },
  {
    id: 'unbeaten_10',
    title: 'Invencível',
    description: 'Fique 10 partidas seguidas sem perder.',
    icon: '🛡️',
    check: (s) => s.longestUnbeatenStreak >= 10
  },
  {
    id: 'unbeaten_20',
    title: 'Muralha',
    description: 'Fique 20 partidas seguidas sem perder.',
    icon: '🧱',
    check: (s) => s.longestUnbeatenStreak >= 20
  },
  {
    id: 'first_title',
    title: 'Campeão Nacional',
    description: 'Seja campeão de uma divisão (Série A, B ou C).',
    icon: '🏆',
    check: (s) => s.titlesWon >= 1
  },
  {
    id: 'dynasty',
    title: 'Dinastia',
    description: 'Seja campeão de uma divisão 3 vezes na carreira.',
    icon: '👑',
    check: (s) => s.titlesWon >= 3
  },
  {
    id: 'cup_king',
    title: 'Rei do Brasil',
    description: 'Seja campeão da Copa do Brasil.',
    icon: '🇧🇷',
    check: (s) => s.cupsWon >= 1
  },
  {
    id: 'libertadores_king',
    title: 'Rei da América',
    description: 'Seja campeão da Copa Libertadores.',
    icon: '🌎',
    check: (s) => s.libertadoresWon >= 1
  },
  {
    id: 'libertadores_dynasty',
    title: 'Tri-Campeão Continental',
    description: 'Seja campeão da Libertadores 3 vezes na carreira.',
    icon: '🌟',
    check: (s) => s.libertadoresWon >= 3
  }
];
