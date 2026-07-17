import React, { createContext, useContext, useState, useEffect } from 'react';
import { initializeClubs, formatCurrency } from '../data/database';
import type { Player, Club } from '../data/database';
import { simulateMatch, generateLeagueSchedule, getAutoStarters } from '../utils/matchEngine';
import type { MatchResult } from '../utils/matchEngine';

export type GameState = 'START' | 'PLAYING' | 'MATCH_DAY' | 'SEASON_END' | 'GAME_OVER';

export interface LeagueMatch {
  round: number;
  homeId: string;
  awayId: string;
  division: 'A' | 'B' | 'C' | 'D';
  simulated: boolean;
  result?: MatchResult;
}

export interface Sponsor {
  id: string;
  name: string;
  type: 'MASTER' | 'COSTAS' | 'MANGAS';
  signingBonus: number;
  weeklyPayment: number;
  contractWeeks: number;
}

export interface StadiumUpgrade {
  capacityAdded: number;
  cost: number;
  weeksLeft: number;
}

export interface JobOffer {
  clubId: string;
  clubName: string;
  division: 'A' | 'B' | 'C' | 'D';
  salaryBonus: number;
}

export interface NewsItem {
  id: string;
  week: number;
  text: string;
  type: 'INFO' | 'TRANSFER' | 'MATCH' | 'BOARD' | 'OFFER';
}

export interface HistoryRecord {
  year: number;
  champions: Record<'A' | 'B' | 'C' | 'D', string>;
  userClub: string;
  userDivision: 'A' | 'B' | 'C' | 'D';
  userFinish: number;
}

interface GameContextType {
  gameState: GameState;
  managerName: string;
  currentYear: number;
  currentRound: number;
  clubs: Club[];
  userClubId: string;
  userClub: Club | null;
  schedule: LeagueMatch[];
  marketPlayers: Player[];
  offers: JobOffer[];
  news: NewsItem[];
  history: HistoryRecord[];
  stadiumUpgrade: StadiumUpgrade | null;
  activeSponsors: Record<'MASTER' | 'COSTAS' | 'MANGAS', Sponsor | null>;
  currentMatch: LeagueMatch | null;
  currentMatchResult: MatchResult | null;
  startGame: (name: string, chosenClubId: string) => void;
  nextRound: (starters: Player[]) => void;
  buyPlayer: (player: Player) => void;
  sellPlayer: (player: Player) => void;
  upgradeStadium: (capacity: number) => void;
  signSponsor: (sponsor: Sponsor) => void;
  acceptJobOffer: (clubId: string) => void;
  stayAtClub: () => void;
  resetGame: () => void;
  setGameState: (state: GameState) => void;
  clearCurrentMatch: () => void;
  makeBidForPlayer: (player: Player, _sellerClubId: string, bidAmount: number) => { status: 'ACCEPTED' | 'REJECTED' | 'COUNTER'; counterAmount?: number };
  buyPlayerFromClub: (player: Player, sellerClubId: string, pricePaid: number) => void;
  manualSave: () => void;
  updateTicketPrice: (delta: number) => void;
  renewContract: (playerId: string, duration: '6M' | '1Y') => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState>('START');
  const [managerName, setManagerName] = useState('');
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentRound, setCurrentRound] = useState(1);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [userClubId, setUserClubId] = useState('');
  const [schedule, setSchedule] = useState<LeagueMatch[]>([]);
  const [marketPlayers, setMarketPlayers] = useState<Player[]>([]);
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [stadiumUpgrade, setStadiumUpgrade] = useState<StadiumUpgrade | null>(null);
  const [activeSponsors, setActiveSponsors] = useState<Record<'MASTER' | 'COSTAS' | 'MANGAS', Sponsor | null>>({
    MASTER: null,
    COSTAS: null,
    MANGAS: null
  });
  const [currentMatch, setCurrentMatch] = useState<LeagueMatch | null>(null);
  const [currentMatchResult, setCurrentMatchResult] = useState<MatchResult | null>(null);

  // Auto-load state on start
  useEffect(() => {
    const saved = localStorage.getItem('elifoot_2026_save');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Se for um save antigo ou sem versão 2 atualizada dos elencos, ignora e limpa
        if (!data.dbVersion || data.dbVersion < 2) {
          localStorage.removeItem('elifoot_2026_save');
          return;
        }
        setGameState(data.gameState);
        setManagerName(data.managerName);
        setCurrentYear(data.currentYear);
        setCurrentRound(data.currentRound);
        setClubs(data.clubs);
        setUserClubId(data.userClubId);
        setSchedule(data.schedule);
        setMarketPlayers(data.marketPlayers);
        setOffers(data.offers);
        setNews(data.news);
        setHistory(data.history);
        setStadiumUpgrade(data.stadiumUpgrade);
        setActiveSponsors(data.activeSponsors);
      } catch (e) {
        console.error('Error loading save', e);
      }
    }
  }, []);

  // Auto-save state on changes
  const saveGame = (
    state: GameState,
    name: string,
    year: number,
    round: number,
    currentClubs: Club[],
    clubId: string,
    currentSchedule: LeagueMatch[],
    market: Player[],
    jobOffers: JobOffer[],
    feed: NewsItem[],
    past: HistoryRecord[],
    upgrade: StadiumUpgrade | null,
    sponsorsList: Record<'MASTER' | 'COSTAS' | 'MANGAS', Sponsor | null>
  ) => {
    const data = {
      dbVersion: 2, // Identificador da versão atualizada dos elencos de 2026
      gameState: state,
      managerName: name,
      currentYear: year,
      currentRound: round,
      clubs: currentClubs,
      userClubId: clubId,
      schedule: currentSchedule,
      marketPlayers: market,
      offers: jobOffers,
      news: feed,
      history: past,
      stadiumUpgrade: upgrade,
      activeSponsors: sponsorsList
    };
    localStorage.setItem('elifoot_2026_save', JSON.stringify(data));
  };

  const userClub = clubs.find(c => c.id === userClubId) || null;

  // Initialize a new game
  const startGame = (name: string, chosenClubId: string) => {
    const initializedClubs = initializeClubs();
    
    // Set player club
    const updatedClubs = initializedClubs.map(c => {
      if (c.id === chosenClubId) {
        return { ...c, isPlayerClub: true, confidence: 80 };
      }
      return c;
    });

    setManagerName(name);
    setUserClubId(chosenClubId);
    setClubs(updatedClubs);

    // Generate schedules for all divisions
    const newSchedule: LeagueMatch[] = [];
    const divisions: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    
    divisions.forEach(div => {
      const divClubIds = updatedClubs.filter(c => c.division === div).map(c => c.id);
      const pairings = generateLeagueSchedule(divClubIds);
      pairings.forEach(match => {
        newSchedule.push({
          round: match.round,
          homeId: match.home,
          awayId: match.away,
          division: div,
          simulated: false
        });
      });
    });

    setSchedule(newSchedule);
    setCurrentRound(1);
    setCurrentYear(2026);
    setHistory([]);
    setStadiumUpgrade(null);
    setActiveSponsors({ MASTER: null, COSTAS: null, MANGAS: null });
    
    const initialNews: NewsItem[] = [
      { id: '1', week: 0, text: `Bem-vindo ao futebol brasileiro, ${name}! Você assumiu o ${updatedClubs.find(c => c.id === chosenClubId)?.name}. Boa sorte na Série D!`, type: 'BOARD' }
    ];
    setNews(initialNews);
    
    // Generate initial market
    const market = generateMarketPlayers('D');
    setMarketPlayers(market);
    setGameState('PLAYING');

    saveGame('PLAYING', name, 2026, 1, updatedClubs, chosenClubId, newSchedule, market, [], initialNews, [], null, { MASTER: null, COSTAS: null, MANGAS: null });
  };

  // Generate random players for transfer market
  const generateMarketPlayers = (div: 'A' | 'B' | 'C' | 'D'): Player[] => {
    // Generate 10-15 random free agents or transfer listed players
    const list: Player[] = [];
    const positions: ('GK' | 'DF' | 'MF' | 'FW')[] = ['GK', 'DF', 'MF', 'FW'];
    
    let baseMin = 40, baseMax = 50;
    if (div === 'C') { baseMin = 50; baseMax = 62; }
    if (div === 'B') { baseMin = 62; baseMax = 72; }
    if (div === 'A') { baseMin = 72; baseMax = 84; }

    const firstNames = ['Kaio', 'Pedro', 'Neymar', 'Vini', 'Endrick', 'Bento', 'Murilo', 'Allan', 'Everton', 'Ruan', 'Higor', 'Darlisson', 'Talisca', 'Vitinho'];
    const lastNames = ['Teixeira', 'Junior', 'Barreto', 'Cardoso', 'Borges', 'Coelho', 'Guedes', 'Marinho', 'Assis', 'Duarte', 'Sampaio', 'Sales'];

    for (let i = 0; i < 15; i++) {
      const pos = positions[Math.floor(Math.random() * positions.length)];
      const age = Math.floor(Math.random() * 15) + 18; // 18-32
      const rating = Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;
      
      const valBase = Math.pow(rating - 30, 2.5) * 800;
      const ageFactor = age < 24 ? 1.3 : age > 30 ? 0.7 : 1.0;
      const value = Math.max(10000, Math.round(valBase * ageFactor));
      const salary = Math.round(value * 0.005);

      const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;

      list.push({
        id: `market_${Date.now()}_${i}`,
        name,
        age,
        position: pos,
        rating,
        energy: 100,
        value,
        salary,
        goals: 0,
        yellowCards: 0,
        redCards: 0,
        isInjured: false,
        isStar: false,
        contractLocked: false
      });
    }
    return list;
  };

  // Play the current round (simulates all matches including player's)
  const nextRound = (playerStarters: Player[]) => {
    if (!userClub) return;

    // Find the player's match in this round
    const roundMatches = schedule.filter(m => m.round === currentRound);
    const playerMatchIndex = roundMatches.findIndex(m => m.homeId === userClubId || m.awayId === userClubId);
    
    if (playerMatchIndex === -1) return;
    const playerMatch = roundMatches[playerMatchIndex];

    const isHome = playerMatch.homeId === userClubId;
    const opponentId = isHome ? playerMatch.awayId : playerMatch.homeId;
    const opponent = clubs.find(c => c.id === opponentId)!;

    // Simulate player's match
    let playerMatchResult: MatchResult;
    if (isHome) {
      playerMatchResult = simulateMatch(userClub, opponent, playerStarters, getAutoStarters(opponent));
    } else {
      playerMatchResult = simulateMatch(opponent, userClub, getAutoStarters(opponent), playerStarters);
    }

    // Set for overlay animation/view
    setCurrentMatch(playerMatch);
    setCurrentMatchResult(playerMatchResult);

    // Simulate all other matches of the round
    const updatedMatches = schedule.map(match => {
      if (match.round === currentRound) {
        if (match.homeId === userClubId || match.awayId === userClubId) {
          return { ...match, simulated: true, result: playerMatchResult };
        } else {
          const home = clubs.find(c => c.id === match.homeId)!;
          const away = clubs.find(c => c.id === match.awayId)!;
          const result = simulateMatch(home, away);
          return { ...match, simulated: true, result };
        }
      }
      return match;
    });

    // Update club attributes and player stats
    const updatedClubs = clubs.map(club => {
      let finances = club.finances;
      let confidence = club.confidence;

      // Handle user's stadium progress
      if (club.id === userClubId) {
        // Player wages expense
        const wages = club.squad.reduce((sum, p) => sum + p.salary, 0);
        finances -= wages;

        // Sponsors income
        let sponsorIncome = 0;
        Object.values(activeSponsors).forEach(sp => {
          if (sp) sponsorIncome += sp.weeklyPayment;
        });
        finances += sponsorIncome;

        // Apply player match results
        const userScore = isHome ? playerMatchResult.homeScore : playerMatchResult.awayScore;
        const oppScore = isHome ? playerMatchResult.awayScore : playerMatchResult.homeScore;

        if (userScore > oppScore) {
          confidence = Math.min(100, confidence + 8);
        } else if (userScore === oppScore) {
          confidence = Math.min(100, Math.max(0, confidence + 2));
        } else {
          confidence = Math.max(0, confidence - 10);
        }
      }

      // Handle match day revenue for home club
      const matchInRound = roundMatches.find(m => m.homeId === club.id);
      if (matchInRound) {
        const matchResult = updatedMatches.find(m => m.round === currentRound && m.homeId === club.id)?.result;
        if (matchResult) {
          // Occupancy base is affected by reputation and performance
          const performanceRep = club.confidence / 100;
          const baseOccupancy = 0.4 + (club.reputation / 100) * 0.4 + performanceRep * 0.2;

          // Ticket price factor: base price per division (D=30, C=50, B=80, A=120)
          const baseTicketByDiv: Record<string, number> = { A: 120, B: 80, C: 50, D: 30 };
          const baseTicket = baseTicketByDiv[club.division] ?? 50;
          // If confidence >= 95 fans ignore price (ultra-loyal); otherwise penalise for overpricing
          let priceFactor = 1.0;
          if (club.confidence < 95) {
            // priceFactor: 1.0 at base price, falls to 0 at 3x base price
            const ratio = club.ticketPrice / baseTicket;
            priceFactor = Math.max(0, Math.min(1, 1 - (ratio - 1) / 2));
          }

          const occupancyRate = Math.min(1, baseOccupancy * priceFactor);
          const fansAttending = Math.min(club.stadiumCapacity, Math.round(club.stadiumCapacity * occupancyRate));
          const ticketIncome = fansAttending * club.ticketPrice;
          finances += ticketIncome;
        }
      }

      // Update player physical energy & injuries
      const clubMatch = roundMatches.find(m => m.homeId === club.id || m.awayId === club.id);
      let squad = club.squad.map(player => {
        let energy = player.energy;
        let isInjured = player.isInjured;
        let injuryWeeks = player.injuryWeeks || 0;
        let yellowCards = player.yellowCards;
        let redCards = player.redCards;
        let goals = player.goals;

        // If player has cards/goals in the simulated match, update them
        if (clubMatch && clubMatch.result) {
          const matchRes = clubMatch.result;
          const playerEvents = matchRes.events.filter(e => e.player === player.name);
          
          playerEvents.forEach(ev => {
            if (ev.type === 'GOAL') goals++;
            if (ev.type === 'YELLOW') yellowCards++;
            if (ev.type === 'RED') {
              redCards++;
            }
            if (ev.type === 'INJURY') {
              isInjured = true;
              injuryWeeks = Math.floor(Math.random() * 4) + 1; // 1 to 4 weeks
            }
          });
        }

        // Energy management
        const wasStarter = club.id === userClubId 
          ? playerStarters.some(p => p.id === player.id)
          : getAutoStarters(club).some(p => p.id === player.id);

        if (isInjured) {
          energy = Math.min(100, energy + 12);
          if (injuryWeeks > 1) {
            injuryWeeks--;
          } else {
            isInjured = false;
            injuryWeeks = 0;
          }
        } else {
          if (wasStarter) {
            energy = Math.max(30, energy - Math.floor(Math.random() * 8) - 8); // lose 8-16 energy
          } else {
            energy = Math.min(100, energy + 15); // recover energy on bench/rest
          }
        }

        // --- Rating Progression (Age-dependent Training vs wear/tear) ---
        let rating = player.rating;
        const isYoung = player.age <= 23;
        const isOld = player.age >= 31;

        if (wasStarter) {
          if (isYoung) {
            if (Math.random() < 0.01) rating = Math.max(40, rating - 1);
          } else if (isOld) {
            if (Math.random() < 0.08) rating = Math.max(40, rating - 1);
          } else {
            if (Math.random() < 0.02) rating = Math.max(40, rating - 1);
          }
        } else {
          // Reserve - training!
          if (isYoung) {
            if (Math.random() < 0.15) rating = Math.min(99, rating + 1);
          } else if (isOld) {
            const roll = Math.random();
            if (roll < 0.04) rating = Math.max(40, rating - 1);
            else if (roll < 0.06) rating = Math.min(99, rating + 1);
          } else {
            if (Math.random() < 0.08) rating = Math.min(99, rating + 1);
          }
        }

        let value = player.value;
        let salary = player.salary;
        if (rating !== player.rating) {
          const ageFactor = player.age < 24 ? 1.3 : player.age > 30 ? 0.7 : 1.0;
          const posFactor = player.position === 'FW' ? 1.2 : player.position === 'GK' ? 0.9 : 1.0;
          const valBase = Math.pow(rating - 30, 2.5) * 800;
          value = Math.max(10000, Math.round(valBase * ageFactor * posFactor));
          salary = Math.round(value * 0.005);
        }

        // --- Contract weeks management ---
        let contractWeeks = player.contractWeeks ?? 38;
        if (club.id === userClubId) {
          contractWeeks = Math.max(0, contractWeeks - 1);
        }

        // --- Dissatisfaction (bench rounds tracking - randomized) ---
        let benchRounds = player.benchRounds ?? 0;
        if (club.id === userClubId) {
          if (wasStarter) {
            benchRounds = 0; // reset if played
          } else if (!isInjured) {
            benchRounds += 1;
            // Now it is rare: only 1.5% chance per round to request a transfer, and only if they've been on the bench for at least 2 rounds
            if (benchRounds >= 2 && Math.random() < 0.015) {
              benchRounds = 999;
            }
          }
        }

        return { ...player, rating, value, salary, energy, isInjured, injuryWeeks, yellowCards, redCards, goals, contractWeeks, benchRounds };
      });

      return { ...club, finances, confidence, squad };
    });

    // Handle stadium upgrades for player
    let nextUpgrade = stadiumUpgrade;
    let finalClubs = updatedClubs;
    if (stadiumUpgrade) {
      if (stadiumUpgrade.weeksLeft > 1) {
        nextUpgrade = { ...stadiumUpgrade, weeksLeft: stadiumUpgrade.weeksLeft - 1 };
      } else {
        // Complete stadium construction
        finalClubs = updatedClubs.map(c => {
          if (c.id === userClubId) {
            return {
              ...c,
              stadiumCapacity: c.stadiumCapacity + stadiumUpgrade.capacityAdded
            };
          }
          return c;
        });
        nextUpgrade = null;
        setNews(prev => [...prev, {
          id: `stad_${Date.now()}`,
          week: currentRound,
          text: `Obras concluídas! A capacidade do seu estádio aumentou em ${stadiumUpgrade.capacityAdded.toLocaleString()} lugares!`,
          type: 'INFO'
        }]);
      }
    }

    // Decrement sponsors contract weeks
    const updatedSponsors = { ...activeSponsors };
    Object.keys(updatedSponsors).forEach(key => {
      const type = key as 'MASTER' | 'COSTAS' | 'MANGAS';
      const sp = updatedSponsors[type];
      if (sp) {
        if (sp.contractWeeks > 1) {
          updatedSponsors[type] = { ...sp, contractWeeks: sp.contractWeeks - 1 };
        } else {
          updatedSponsors[type] = null;
          setNews(prev => [...prev, {
            id: `spon_end_${Date.now()}`,
            week: currentRound,
            text: `Contrato de patrocínio com a ${sp.name} expirou.`,
            type: 'INFO'
          }]);
        }
      }
    });

    // Check Board Confidence / Sacking (Immediate or Warning)
    let nextOffers = offers;
    let nextGameState = gameState;
    const userConfidence = finalClubs.find(c => c.id === userClubId)!.confidence;
    
    if (userConfidence <= 0) {
      // SACKED!
      setNews(prev => [...prev, {
        id: `sack_${Date.now()}`,
        week: currentRound,
        text: `Você foi DEMITIDO! A diretoria perdeu totalmente a confiança no seu trabalho após os últimos resultados.`,
        type: 'BOARD'
      }]);
      
      // Generate immediate job offers from Série D clubs (lower tier)
      const dClubs = finalClubs.filter(c => c.division === 'D' && c.id !== userClubId);
      const generatedOffers: JobOffer[] = [];
      for (let i = 0; i < 3; i++) {
        const target = dClubs[Math.floor(Math.random() * dClubs.length)];
        if (!generatedOffers.some(o => o.clubId === target.id)) {
          generatedOffers.push({
            clubId: target.id,
            clubName: target.name,
            division: 'D',
            salaryBonus: 0
          });
        }
      }
      nextOffers = generatedOffers;
      nextGameState = 'SEASON_END'; // Go to decision screen
    } else if (userConfidence < 20) {
      setNews(prev => [...prev, {
        id: `warn_${Date.now()}`,
        week: currentRound,
        text: `AVISO: A diretoria está extremamente descontente. Melhore seus resultados ou será demitido!`,
        type: 'BOARD'
      }]);
    }

    // Refresh transfer market occasionally
    let nextMarket = marketPlayers;
    if (Math.random() < 0.25) {
      nextMarket = generateMarketPlayers(userClub.division);
    }

    // Set states
    setClubs(finalClubs);
    setSchedule(updatedMatches);
    setStadiumUpgrade(nextUpgrade);
    setActiveSponsors(updatedSponsors);
    setMarketPlayers(nextMarket);
    setOffers(nextOffers);
    
    if (nextGameState !== gameState) {
      setGameState(nextGameState);
    }

    // Advance round or end season
    if (currentRound < 38) {
      setCurrentRound(prev => prev + 1);
      saveGame(nextGameState === 'SEASON_END' ? 'SEASON_END' : 'PLAYING', managerName, currentYear, currentRound + 1, finalClubs, userClubId, updatedMatches, nextMarket, nextOffers, news, history, nextUpgrade, updatedSponsors);
    } else {
      // Trigger season end
      endSeason(finalClubs, updatedMatches, updatedSponsors, nextUpgrade);
    }

    // Launch Match Simulation Overlay screen
    setGameState('MATCH_DAY');
  };

  // Logic to process the end of the season
  const endSeason = (
    currentClubs: Club[],
    currentSchedule: LeagueMatch[],
    sponsorsList: Record<'MASTER' | 'COSTAS' | 'MANGAS', Sponsor | null>,
    upgrade: StadiumUpgrade | null
  ) => {
    // 1. Calculate League Standings for each division
    const standings = calculateStandings(currentClubs, currentSchedule);

    // 2. Identify Promoted and Relegated teams
    const promotions: Record<'B' | 'C' | 'D', string[]> = { B: [], C: [], D: [] };
    const relegations: Record<'A' | 'B' | 'C', string[]> = { A: [], B: [], C: [] };

    const divisions: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const divisionChampions: Record<'A' | 'B' | 'C' | 'D', string> = { A: '', B: '', C: '', D: '' };

    divisions.forEach(div => {
      const divStandings = standings[div];
      divisionChampions[div] = divStandings[0].clubName;

      if (div === 'A') {
        // Relegate bottom 4 of A
        relegations.A = divStandings.slice(16, 20).map(s => s.clubId);
      } else if (div === 'B') {
        // Promote top 4 of B
        promotions.B = divStandings.slice(0, 4).map(s => s.clubId);
        // Relegate bottom 4 of B
        relegations.B = divStandings.slice(16, 20).map(s => s.clubId);
      } else if (div === 'C') {
        // Promote top 4 of C
        promotions.C = divStandings.slice(0, 4).map(s => s.clubId);
        // Relegate bottom 4 of C
        relegations.C = divStandings.slice(16, 20).map(s => s.clubId);
      } else if (div === 'D') {
        // Promote top 4 of D
        promotions.D = divStandings.slice(0, 4).map(s => s.clubId);
      }
    });

    const getPrizeMoney = (division: 'A' | 'B' | 'C' | 'D', rankIndex: number): number => {
      if (division === 'A') {
        const prizesA = [
          70000000, 50000000, 40000000, 30000000, 25000000, 
          20000000, 18000000, 16000000, 14000000, 12000000, 
          10000000, 9000000, 8000000, 7000000, 6000000, 
          5000000, 4000000, 3000000, 2000000, 1000000
        ];
        return prizesA[rankIndex] || 1000000;
      }
      if (division === 'B') {
        const prizesB = [
          30000000, 20000000, 15000000, 10000000, 5000000,
          5000000, 5000000, 5000000, 5000000, 5000000,
          3000000, 3000000, 3000000, 3000000, 3000000,
          3000000, 1000000, 1000000, 1000000, 1000000
        ];
        return prizesB[rankIndex] || 1000000;
      }
      if (division === 'C') {
        const prizesC = [
          20000000, 12000000, 8000000, 4000000, 2000000,
          2000000, 2000000, 2000000, 2000000, 2000000,
          1000000, 1000000, 1000000, 1000000, 1000000,
          1000000, 500000, 500000, 500000, 500000
        ];
        return prizesC[rankIndex] || 500000;
      }
      if (division === 'D') {
        const prizesD = [
          15000000, 9000000, 5000000, 2000000, 1000000,
          1000000, 1000000, 1000000, 1000000, 1000000,
          500000, 500000, 500000, 500000, 500000,
          500000, 500000, 500000, 500000, 500000
        ];
        return prizesD[rankIndex] || 500000;
      }
      return 0;
    };

    // 2.5 Find top scorers per division to award/keep Star status
    const divisionTopScorers: Record<string, { playerName: string; goals: number }[]> = { A: [], B: [], C: [], D: [] };
    currentClubs.forEach(c => {
      c.squad.forEach(p => {
        if (p.goals > 0) {
          const divList = divisionTopScorers[c.division];
          if (divList.length === 0 || p.goals > divList[0].goals) {
            divisionTopScorers[c.division] = [{ playerName: p.name, goals: p.goals }];
          } else if (p.goals === divList[0].goals) {
            divList.push({ playerName: p.name, goals: p.goals });
          }
        }
      });
    });

    // 3. Move clubs to their new divisions & pay prizes
    const finalClubs = currentClubs.map(club => {
      let div = club.division;
      const divStandings = standings[club.division];
      const rankIndex = divStandings.findIndex(s => s.clubId === club.id);
      const prizeMoney = getPrizeMoney(club.division, rankIndex);
      const finances = club.finances + prizeMoney;

      if (div === 'A' && relegations.A.includes(club.id)) div = 'B';
      else if (div === 'B') {
        if (promotions.B.includes(club.id)) div = 'A';
        else if (relegations.B.includes(club.id)) div = 'C';
      } else if (div === 'C') {
        if (promotions.C.includes(club.id)) div = 'B';
        else if (relegations.C.includes(club.id)) div = 'D';
      } else if (div === 'D') {
        if (promotions.D.includes(club.id)) div = 'C';
      }

      // Reset squad card stats (clean slate for goals/cards) & evaluate Stars
      const isRelegated = (club.division === 'A' && relegations.A.includes(club.id)) ||
                          (club.division === 'B' && relegations.B.includes(club.id)) ||
                          (club.division === 'C' && relegations.C.includes(club.id));
      
      const squad = club.squad.map(p => {
        const isMF_FW = p.position === 'MF' || p.position === 'FW';
        let isStar = p.isStar;

        // Check if player was a top scorer in their division this season
        const wasTopScorer = (divisionTopScorers[club.division] || []).some(ts => ts.playerName === p.name);

        if (wasTopScorer) {
          isStar = true; // Artilheiro ganha estrela garantida
        } else if (p.isStar) {
          // Maintenance check
          if (isMF_FW) {
            // Must score at least 5 goals to keep star
            if (p.goals < 5) isStar = false;
          } else {
            // GK/DF: lose star if relegated and rating < 80, or if rating is too low (< 68)
            if (isRelegated && p.rating < 80) isStar = false;
            else if (p.rating < 68) isStar = false;
          }
        } else {
          // Gain star check
          if (isMF_FW && p.goals >= 10) isStar = true;
          else if (!isMF_FW && p.rating >= 78 && !isRelegated) isStar = true;
        }

        return {
          ...p,
          isStar,
          contractLocked: false, // Unlock for next season
          goals: 0,
          yellowCards: 0,
          redCards: 0,
          energy: 100
        };
      });

      // Board confidence resets to 70 for next year
      return { ...club, division: div, confidence: 70, finances, squad };
    });

    // Find player performance
    const playerClubFinal = currentClubs.find(c => c.id === userClubId)!;
    const playerDiv = playerClubFinal.division;
    const playerStandingIndex = standings[playerDiv].findIndex(s => s.clubId === userClubId) + 1;

    // Record history
    const record: HistoryRecord = {
      year: currentYear,
      champions: divisionChampions,
      userClub: playerClubFinal.name,
      userDivision: playerDiv,
      userFinish: playerStandingIndex
    };
    const nextHistory = [...history, record];
    setHistory(nextHistory);

    // Generate Career Job Offers based on player performance
    const isPlayerPromoted = (playerDiv === 'B' && promotions.B.includes(userClubId)) ||
                             (playerDiv === 'C' && promotions.C.includes(userClubId)) ||
                             (playerDiv === 'D' && promotions.D.includes(userClubId));
    const isPlayerChampion = divisionChampions[playerDiv] === playerClubFinal.name;
    const isPlayerRelegated = (playerDiv === 'A' && relegations.A.includes(userClubId)) ||
                              (playerDiv === 'B' && relegations.B.includes(userClubId)) ||
                              (playerDiv === 'C' && relegations.C.includes(userClubId));

    const careerOffers: JobOffer[] = [];
    const allAvailableClubs = finalClubs.filter(c => c.id !== userClubId);

    if (isPlayerChampion) {
      // Elite offers from higher divisions
      const nextDiv = playerDiv === 'D' ? 'C' : playerDiv === 'C' ? 'B' : playerDiv === 'B' ? 'A' : 'A';
      const potentialClubs = allAvailableClubs.filter(c => c.division === nextDiv);
      for (let i = 0; i < 3; i++) {
        const c = potentialClubs[Math.floor(Math.random() * potentialClubs.length)];
        if (c && !careerOffers.some(o => o.clubId === c.id)) {
          careerOffers.push({ clubId: c.id, clubName: c.name, division: c.division, salaryBonus: 20 });
        }
      }
    } else if (isPlayerPromoted) {
      // Good offers
      const nextDiv = playerDiv === 'D' ? 'C' : playerDiv === 'C' ? 'B' : 'A';
      const potentialClubs = allAvailableClubs.filter(c => c.division === nextDiv || c.division === playerDiv);
      for (let i = 0; i < 2; i++) {
        const c = potentialClubs[Math.floor(Math.random() * potentialClubs.length)];
        if (c && !careerOffers.some(o => o.clubId === c.id)) {
          careerOffers.push({ clubId: c.id, clubName: c.name, division: c.division, salaryBonus: 10 });
        }
      }
    } else if (isPlayerRelegated) {
      // Only offers from lower divisions or same low tier
      const lowerDiv = playerDiv === 'A' ? 'B' : playerDiv === 'B' ? 'C' : 'D';
      const potentialClubs = allAvailableClubs.filter(c => c.division === lowerDiv);
      for (let i = 0; i < 2; i++) {
        const c = potentialClubs[Math.floor(Math.random() * potentialClubs.length)];
        if (c && !careerOffers.some(o => o.clubId === c.id)) {
          careerOffers.push({ clubId: c.id, clubName: c.name, division: c.division, salaryBonus: -10 });
        }
      }
    } else {
      // Solid mid table finish - standard offers in same division
      const potentialClubs = allAvailableClubs.filter(c => c.division === playerDiv);
      for (let i = 0; i < 2; i++) {
        const c = potentialClubs[Math.floor(Math.random() * potentialClubs.length)];
        if (c && !careerOffers.some(o => o.clubId === c.id)) {
          careerOffers.push({ clubId: c.id, clubName: c.name, division: c.division, salaryBonus: 0 });
        }
      }
    }

    setClubs(finalClubs);
    setOffers(careerOffers);
    setGameState('SEASON_END');

    // Create annual summary news
    const userRankIndex = standings[playerDiv].findIndex(s => s.clubId === userClubId);
    const userPrize = getPrizeMoney(playerDiv, userRankIndex);
    const summaryNews: NewsItem[] = [
      {
        id: `summary_${Date.now()}`,
        week: 38,
        text: `Fim da Temporada ${currentYear}! Campeão Série A: ${divisionChampions.A}. Promoções: Série B (${promotions.B.map(id => currentClubs.find(c=>c.id===id)?.name).join(', ')}), Série C (${promotions.C.map(id => currentClubs.find(c=>c.id===id)?.name).join(', ')}).`,
        type: 'BOARD'
      },
      {
        id: `prize_${Date.now()}`,
        week: 38,
        text: `Premiação da Liga! O ${playerClubFinal.name} terminou em ${userRankIndex + 1}º lugar na Série ${playerDiv} e recebeu R$ ${userPrize.toLocaleString()} em premiações.`,
        type: 'BOARD'
      }
    ];
    setNews(prev => [...prev, ...summaryNews]);

    saveGame('SEASON_END', managerName, currentYear, 38, finalClubs, userClubId, currentSchedule, marketPlayers, careerOffers, [...news, ...summaryNews], nextHistory, upgrade, sponsorsList);
  };

  // Helper to calculate standings table
  const calculateStandings = (allClubs: Club[], allSchedule: LeagueMatch[]) => {
    const list: Record<'A' | 'B' | 'C' | 'D', { clubId: string; clubName: string; points: number; played: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number }[]> = {
      A: [], B: [], C: [], D: []
    };

    const initStandings = (club: Club) => ({
      clubId: club.id,
      clubName: club.name,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0
    });

    // Populate initial
    allClubs.forEach(c => {
      list[c.division].push(initStandings(c));
    });

    // Calculate from matches results
    allSchedule.forEach(match => {
      if (match.simulated && match.result) {
        const homeEntry = list[match.division].find(e => e.clubId === match.homeId);
        const awayEntry = list[match.division].find(e => e.clubId === match.awayId);

        if (homeEntry && awayEntry) {
          const hgf = match.result.homeScore;
          const agf = match.result.awayScore;

          homeEntry.played++;
          awayEntry.played++;
          homeEntry.gf += hgf;
          homeEntry.ga += agf;
          awayEntry.gf += agf;
          awayEntry.ga += hgf;
          homeEntry.gd = homeEntry.gf - homeEntry.ga;
          awayEntry.gd = awayEntry.gf - awayEntry.ga;

          if (hgf > agf) {
            homeEntry.points += 3;
            homeEntry.wins++;
            awayEntry.losses++;
          } else if (hgf === agf) {
            homeEntry.points += 1;
            awayEntry.points += 1;
            homeEntry.draws++;
            awayEntry.draws++;
          } else {
            awayEntry.points += 3;
            awayEntry.wins++;
            homeEntry.losses++;
          }
        }
      }
    });

    // Sort divisions (Points -> Wins -> Goal Difference -> Goals For)
    const sortStandings = (a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    };

    list.A.sort(sortStandings);
    list.B.sort(sortStandings);
    list.C.sort(sortStandings);
    list.D.sort(sortStandings);

    return list;
  };

  // Buy player from transfer market
  const buyPlayer = (player: Player) => {
    if (!userClub) return;

    if (userClub.finances < player.value) {
      alert('Finanças insuficientes para contratar este jogador.');
      return;
    }

    if (userClub.squad.length >= 22) {
      alert('Limite máximo de elenco atingido (22 jogadores). Venda alguns antes.');
      return;
    }

    // Deduct cost and add player
    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return {
          ...club,
          finances: club.finances - player.value,
          squad: [...club.squad, player]
        };
      }
      return club;
    });

    // Remove from market
    const nextMarket = marketPlayers.filter(p => p.id !== player.id);

    setClubs(updatedClubs);
    setMarketPlayers(nextMarket);

    setNews(prev => [...prev, {
      id: `buy_${Date.now()}`,
      week: currentRound,
      text: `Contratação! O ${userClub.name} fechou a contratação do ${player.position} ${player.name} por ${formatCurrency(player.value)}.`,
      type: 'TRANSFER'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, nextMarket, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Sell player to market (returns 90% of value instantly)
  const sellPlayer = (player: Player) => {
    if (!userClub) return;

    if (userClub.squad.length <= 14) {
      alert('Elenco muito reduzido! Você precisa de pelo menos 14 jogadores no elenco.');
      return;
    }

    if (player.position === 'GK' && userClub.squad.filter(p => p.position === 'GK').length <= 1) {
      alert('Impossível vender! Você precisa manter pelo menos 1 goleiro no elenco.');
      return;
    }

    const saleRevenue = Math.round(player.value * 0.9);

    // Add finances and remove player
    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return {
          ...club,
          finances: club.finances + saleRevenue,
          squad: club.squad.filter(p => p.id !== player.id)
        };
      }
      return club;
    });

    setClubs(updatedClubs);

    const otherClubs = clubs.filter(c => c.id !== userClubId);
    const buyerClub = otherClubs[Math.floor(Math.random() * otherClubs.length)] || { name: 'Outro Clube' };

    setNews(prev => [...prev, {
      id: `sell_${Date.now()}`,
      week: currentRound,
      text: `Transferência! O ${buyerClub.name} comprou o jogador ${player.name} do ${userClub.name} por ${formatCurrency(saleRevenue)}.`,
      type: 'TRANSFER'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Negotiate purchase of a player from another team
  const makeBidForPlayer = (player: Player, _sellerClubId: string, bidAmount: number) => {
    if (bidAmount < player.value) {
      const accepted = Math.random() < 0.05;
      return { status: accepted ? ('ACCEPTED' as const) : ('REJECTED' as const) };
    }
    
    if (bidAmount >= player.value * 1.20) {
      return { status: 'ACCEPTED' as const };
    }
    
    if (Math.random() < 0.40) {
      return { status: 'ACCEPTED' as const };
    } else {
      const counterAmount = Math.round(player.value * 1.15);
      return {
        status: 'COUNTER' as const,
        counterAmount
      };
    }
  };

  const buyPlayerFromClub = (player: Player, sellerClubId: string, pricePaid: number) => {
    if (!userClub) return;

    if (userClub.finances < pricePaid) {
      alert('Finanças insuficientes para fechar este negócio.');
      return;
    }

    if (userClub.squad.length >= 22) {
      alert('Limite de elenco atingido (máximo de 22 jogadores). Venda alguns antes.');
      return;
    }

    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        const newPlayer = { ...player, contractLocked: true };
        return {
          ...club,
          finances: club.finances - pricePaid,
          squad: [...club.squad, newPlayer]
        };
      }
      if (club.id === sellerClubId) {
        return {
          ...club,
          finances: club.finances + pricePaid,
          squad: club.squad.filter(p => p.id !== player.id)
        };
      }
      return club;
    });

    setClubs(updatedClubs);

    const sellerName = clubs.find(c => c.id === sellerClubId)?.name || 'Outro Clube';

    setNews(prev => [...prev, {
      id: `buy_club_${Date.now()}`,
      week: currentRound,
      text: `Contratação! O ${userClub.name} comprou o jogador ${player.name} do ${sellerName} por ${formatCurrency(pricePaid)}.`,
      type: 'TRANSFER'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Sign sponsor contract
  const signSponsor = (sponsor: Sponsor) => {
    if (!userClub) return;

    const nextSponsors = { ...activeSponsors };
    nextSponsors[sponsor.type] = sponsor;

    // Apply signing bonus
    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return { ...club, finances: club.finances + sponsor.signingBonus };
      }
      return club;
    });

    setClubs(updatedClubs);
    setActiveSponsors(nextSponsors);

    setNews(prev => [...prev, {
      id: `spon_${Date.now()}`,
      week: currentRound,
      text: `Novo Patrocinador! O ${userClub.name} assinou contrato de ${sponsor.type === 'MASTER' ? 'Patrocínio Master' : sponsor.type === 'COSTAS' ? 'Patrocínio Costas' : 'Patrocínio Mangas'} com a ${sponsor.name}!`,
      type: 'INFO'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, nextSponsors);
  };

  // Stadium seating upgrade
  const upgradeStadium = (capacityAdded: number) => {
    if (!userClub) return;

    // Cost: R$ 350 per seat added
    const cost = capacityAdded * 350;
    if (userClub.finances < cost) {
      alert('Finanças insuficientes para ampliar o estádio.');
      return;
    }

    const weeksLeft = Math.ceil(capacityAdded / 1000); // 1 week per 1000 seats

    const nextUpgrade: StadiumUpgrade = { capacityAdded, cost, weeksLeft };

    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return { ...club, finances: club.finances - cost };
      }
      return club;
    });

    setClubs(updatedClubs);
    setStadiumUpgrade(nextUpgrade);

    setNews(prev => [...prev, {
      id: `stad_start_${Date.now()}`,
      week: currentRound,
      text: `Obras iniciadas! Ampliação do estádio para mais ${capacityAdded.toLocaleString()} assentos começou (Duração: ${weeksLeft} rodadas).`,
      type: 'INFO'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, nextUpgrade, activeSponsors);
  };

  // Accept job offer from another club at season end
  const acceptJobOffer = (clubId: string) => {
    // Reset player flag on current club
    let updatedClubs = clubs.map(c => {
      const isPlayer = c.id === clubId;
      const tvMoney = c.division === 'A' ? 8000000 : c.division === 'B' ? 2000000 : c.division === 'C' ? 500000 : 100000;
      return { 
        ...c, 
        isPlayerClub: isPlayer, 
        confidence: isPlayer ? 80 : 70, 
        finances: c.finances + tvMoney 
      };
    });

    const newClub = updatedClubs.find(c => c.id === clubId)!;

    // Regenerate schedule for new season
    const newSchedule: LeagueMatch[] = [];
    const divisions: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    
    divisions.forEach(div => {
      const divClubIds = updatedClubs.filter(c => c.division === div).map(c => c.id);
      const pairings = generateLeagueSchedule(divClubIds);
      pairings.forEach(match => {
        newSchedule.push({
          round: match.round,
          homeId: match.home,
          awayId: match.away,
          division: div,
          simulated: false
        });
      });
    });

    setUserClubId(clubId);
    setClubs(updatedClubs);
    setSchedule(newSchedule);
    setCurrentRound(1);
    setCurrentYear(prev => prev + 1);
    setOffers([]);
    setStadiumUpgrade(null);
    setActiveSponsors({ MASTER: null, COSTAS: null, MANGAS: null }); // Clear sponsorships for new club

    const nextNews: NewsItem[] = [
      { id: `job_accept_${Date.now()}`, week: 0, text: `Nova Era! ${managerName} assumiu oficialmente o comando técnico do ${newClub.name}! Boa sorte na Série ${newClub.division}!`, type: 'BOARD' }
    ];
    setNews(nextNews);
    setGameState('PLAYING');

    saveGame('PLAYING', managerName, currentYear + 1, 1, updatedClubs, clubId, newSchedule, marketPlayers, [], nextNews, history, null, { MASTER: null, COSTAS: null, MANGAS: null });
  };

  // Stay at the current club for another year
  const stayAtClub = () => {
    // Regenerate schedule for next year
    let updatedClubs = clubs.map(c => {
      const tvMoney = c.division === 'A' ? 8000000 : c.division === 'B' ? 2000000 : c.division === 'C' ? 500000 : 100000;
      return {
        ...c,
        finances: c.finances + tvMoney
      };
    });
    setClubs(updatedClubs);
    const newSchedule: LeagueMatch[] = [];
    const divisions: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    
    divisions.forEach(div => {
      const divClubIds = updatedClubs.filter(c => c.division === div).map(c => c.id);
      const pairings = generateLeagueSchedule(divClubIds);
      pairings.forEach(match => {
        newSchedule.push({
          round: match.round,
          homeId: match.home,
          awayId: match.away,
          division: div,
          simulated: false
        });
      });
    });

    setSchedule(newSchedule);
    setCurrentRound(1);
    setCurrentYear(prev => prev + 1);
    setOffers([]);

    const userClubInstance = clubs.find(c => c.id === userClubId)!;
    const tvPay = userClubInstance.division === 'A' ? 8000000 : userClubInstance.division === 'B' ? 2000000 : userClubInstance.division === 'C' ? 500000 : 100000;
    const nextNews: NewsItem[] = [
      { id: `renew_${Date.now()}`, week: 0, text: `Contrato renovado! ${managerName} confirmou que permanece no ${userClubInstance.name} por mais uma temporada!`, type: 'BOARD' },
      { id: `tv_pay_${Date.now()}`, week: 0, text: `Cotas de TV pagas! O ${userClubInstance.name} recebeu R$ ${tvPay.toLocaleString()} pelos direitos de transmissão da Série ${userClubInstance.division}.`, type: 'INFO' }
    ];
    setNews(nextNews);
    setGameState('PLAYING');

    saveGame('PLAYING', managerName, currentYear + 1, 1, updatedClubs, userClubId, newSchedule, marketPlayers, [], nextNews, history, stadiumUpgrade, activeSponsors);
  };

  // Reset/delete save game
  const resetGame = () => {
    localStorage.removeItem('elifoot_2026_save');
    setGameState('START');
    setManagerName('');
    setCurrentYear(2026);
    setCurrentRound(1);
    setClubs([]);
    setUserClubId('');
    setSchedule([]);
    setMarketPlayers([]);
    setOffers([]);
    setNews([]);
    setHistory([]);
    setStadiumUpgrade(null);
    setActiveSponsors({ MASTER: null, COSTAS: null, MANGAS: null });
    setCurrentMatch(null);
    setCurrentMatchResult(null);
  };

  const clearCurrentMatch = () => {
    setCurrentMatch(null);
    setCurrentMatchResult(null);
    if (gameState === 'MATCH_DAY') {
      setGameState('PLAYING');
    }
  };

  // Renew player contract
  const renewContract = (playerId: string, duration: '6M' | '1Y') => {
    if (!userClubId) return;
    const addedWeeks = duration === '6M' ? 19 : 38;
    setClubs(prev => prev.map(c => {
      if (c.id !== userClubId) return c;
      const updatedSquad = c.squad.map(p => {
        if (p.id !== playerId) return p;
        const currentW = p.contractWeeks ?? 38;
        return {
          ...p,
          contractWeeks: currentW + addedWeeks
        };
      });
      return { ...c, squad: updatedSquad };
    }));
  };

  const manualSave = () => {
    saveGame(gameState, managerName, currentYear, currentRound, clubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
    alert('Jogo salvo com sucesso!');
  };

  // Update the user club's ticket price by delta (min R$5, max R$500)
  const updateTicketPrice = (delta: number) => {
    if (!userClubId) return;
    setClubs(prev => prev.map(c => {
      if (c.id !== userClubId) return c;
      const newPrice = Math.max(5, Math.min(500, c.ticketPrice + delta));
      return { ...c, ticketPrice: newPrice };
    }));
  };

  return (
    <GameContext.Provider value={{
      gameState,
      managerName,
      currentYear,
      currentRound,
      clubs,
      userClubId,
      userClub,
      schedule,
      marketPlayers,
      offers,
      news,
      history,
      stadiumUpgrade,
      activeSponsors,
      currentMatch,
      currentMatchResult,
      startGame,
      nextRound,
      buyPlayer,
      sellPlayer,
      upgradeStadium,
      signSponsor,
      acceptJobOffer,
      stayAtClub,
      resetGame,
      setGameState,
      clearCurrentMatch,
      makeBidForPlayer,
      buyPlayerFromClub,
      manualSave,
      updateTicketPrice,
      renewContract
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
