import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { initializeClubs, formatCurrency, getPositionGroup, isClassico, VIP_BASE_PRICE_BY_DIV, VIP_BASE_INCOME_BY_DIV } from '../data/database';
import type { Player, Club, PlayerPosition, ForeignPlayer } from '../data/database';
import { simulateMatch, generateLeagueSchedule, getAutoStarters, resolvePenaltyOutcome } from '../utils/matchEngine';
import type { MatchResult, MatchEvent } from '../utils/matchEngine';
import { getBaseInterestRate, getCreditMultiplier, getAvailableCredit, calculateInstallment, advanceLoan, calculatePayoffAmount, renegotiateLoan as renegotiateLoanCalc, getBankEventForYear } from '../utils/loanEngine';
import type { Loan } from '../utils/loanEngine';
import {
  startCup, drawPhaseTies, simulateFullTie, resolveTie,
  getCupTopScorers, PHASES, TWO_LEGGED_PHASES, CUP_MILESTONE_ROUNDS, CUP_PHASE_LABEL,
  CUP_PRIZE_FOR_REACHING, CUP_CHAMPION_PRIZE, CUP_TOP_SCORER_BONUS, CUP_OITAVAS_SEED_COUNT, pickShootoutTakers
} from '../utils/cupEngine';
import type { CupState, CupPhase, CupTieLeg } from '../utils/cupEngine';

// Live, kick-by-kick penalty shootout for the user's own Copa do Brasil tie (every other tie in
// the phase is still resolved instantly). Real shootout rules: alternating single kicks, home
// first, best of 5 then sudden death, ending the instant the outcome is mathematically decided
// (e.g. 4-1 after 8 kicks) rather than always playing out all 10.
export interface PenaltyShootoutState {
  phase: CupPhase;
  homeId: string;
  awayId: string;
  homeClubName: string;
  awayClubName: string;
  homeTakers: Player[];
  awayTakers: Player[];
  kicks: { side: 'home' | 'away'; playerName: string; scored: boolean }[];
  homeGoals: number;
  awayGoals: number;
  homeKicksTaken: number;
  awayKicksTaken: number;
  decided: boolean;
  legs: CupTieLeg[]; // stashed so the tie can be finalized once the shootout ends
}

export type GameState = 'MENU' | 'START' | 'PLAYING' | 'MATCH_DAY' | 'SEASON_END' | 'GAME_OVER' | 'UNEMPLOYED';

export interface LeagueMatch {
  round: number;
  homeId: string;
  awayId: string;
  division: 'A' | 'B' | 'C' | 'CUP';
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
  signedDivision?: 'A' | 'B' | 'C'; // division the club was in when this deal was signed -- used to rescale weeklyPayment up on promotion
}

// Division multiplier sponsors use when pricing a deal -- exported so the same scale can bump
// an already-signed contract's payment when the club gets promoted mid-contract.
export const SPONSOR_DIVISION_MULTIPLIER: Record<'A' | 'B' | 'C', number> = { A: 5.0, B: 2.0, C: 0.8 };

export interface StadiumUpgrade {
  capacityAdded: number;
  cost: number;
  weeksLeft: number;
}

export interface JobOffer {
  clubId: string;
  clubName: string;
  division: 'A' | 'B' | 'C';
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
  champions: Record<'A' | 'B' | 'C', string>;
  userClub: string;
  userDivision: 'A' | 'B' | 'C';
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
  cupState: CupState | null;
  startCupMatch: (starters: Player[]) => void;
  cupDrawReveal: { phase: CupPhase; opponentId: string; isHome: boolean } | null;
  dismissCupDrawReveal: () => void;
  sponsorAlert: { kind: 'EXPIRED' | 'SIGNED'; sponsorName: string; sponsorType: 'MASTER' | 'COSTAS' | 'MANGAS' } | null;
  dismissSponsorAlert: () => void;
  penaltyShootout: PenaltyShootoutState | null;
  takePenaltyShootoutKick: () => void;
  finalizePenaltyShootout: () => void;
  foreignMarketPlayers: ForeignPlayer[];
  foreignPlayerPool: ForeignPlayer[];
  boughtForeignIds: string[];
  buyForeignPlayer: (player: ForeignPlayer) => void;
  currentSlot: number | null;
  getFreeSlot: () => number | null;
  startGame: (name: string, chosenClubId: string, slot?: number) => void;
  nextRound: (starters: Player[]) => void;
  buyPlayer: (player: Player) => void;
  sellPlayer: (player: Player) => void;
  attemptSellPlayer: (player: Player, askingPrice: number) => { success: boolean; message?: string };
  retirePlayer: (player: Player) => void;
  upgradeStadium: (capacity: number) => void;
  buildVipBoxes: () => void;
  requestLoan: (amount: number, totalRounds: number, purpose: string) => void;
  payOffLoanEarly: (loanId: string) => void;
  renegotiateLoanAction: (loanId: string) => void;
  signSponsor: (sponsor: Sponsor) => void;
  acceptJobOffer: (clubId: string) => void;
  stayAtClub: () => void;
  resetGame: () => void;
  divisionExperience: Record<'A' | 'B' | 'C', number>;
  formerClubName: string;
  requestResignation: () => void;
  simulateUnemployedRound: () => void;
  acceptMidSeasonJobOffer: (clubId: string) => void;
  setGameState: (state: GameState) => void;
  clearCurrentMatch: () => void;
  resimulateMidMatch: (updatedUserStarters: Player[], fromMinute: number) => void;
  resolveMidMatchPenalty: (takerId: string, minute: number, currentUserStarters: Player[]) => MatchEvent | null;
  makeBidForPlayer: (player: Player, _sellerClubId: string, bidAmount: number) => { status: 'ACCEPTED' | 'REJECTED' | 'COUNTER'; counterAmount?: number };
  buyPlayerFromClub: (player: Player, sellerClubId: string, pricePaid: number) => void;
  manualSave: () => void;
  renewContract: (playerId: string, duration: '6M' | '1Y' | '2Y') => void;
  acceptIncomingProposal: (player: Player, buyerClubId: string, amount: number, buyerClubName: string) => void;
  updateTicketPrice: (delta: number) => void;
  updateVipPrice: (delta: number) => void;
  setPenaltyTaker: (playerId: string) => void;
  resolvePlayerDissatisfaction: (playerId: string) => void;
  loadGame: (saveData: any, slot: number) => void;
  cancelSponsor: (type: 'MASTER' | 'COSTAS' | 'MANGAS') => void;
  cheatFinances: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [managerName, setManagerName] = useState('');
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentRound, setCurrentRound] = useState(1);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [userClubId, setUserClubId] = useState('');
  const [schedule, setSchedule] = useState<LeagueMatch[]>([]);
  const [marketPlayers, setMarketPlayers] = useState<Player[]>([]);
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [divisionExperience, setDivisionExperience] = useState<Record<'A' | 'B' | 'C', number>>({ A: 0, B: 0, C: 0 });
  const divisionExperienceRef = useRef(divisionExperience);
  divisionExperienceRef.current = divisionExperience;
  const [formerClubName, setFormerClubName] = useState('');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [stadiumUpgrade, setStadiumUpgrade] = useState<StadiumUpgrade | null>(null);
  // Copa Mata-Mata state. Kept in a ref too so saveGame() (which reads it synchronously outside
  // of any state-setter callback) always sees the latest value, the same pattern as currentSlotRef.
  const [cupState, setCupStateRaw] = useState<CupState | null>(null);
  const cupStateRef = useRef<CupState | null>(null);
  const setCupState = (next: CupState | null) => {
    cupStateRef.current = next;
    setCupStateRaw(next);
  };
  // Transient (not persisted) info for the "sorteio" draw-reveal modal, shown once when a
  // fresh Copa do Brasil phase is drawn and the user gets a new opponent.
  const [cupDrawReveal, setCupDrawReveal] = useState<{ phase: CupPhase; opponentId: string; isHome: boolean } | null>(null);
  const dismissCupDrawReveal = () => setCupDrawReveal(null);

  // Top Série A finishers from the season that just ended, captured in endSeason -- consumed by
  // the next startCup() call (stayAtClub/acceptJobOffer) to seed them straight to the Oitavas.
  const [lastSeasonTopSerieA, setLastSeasonTopSerieA] = useState<string[]>([]);

  // Transient (not persisted) alert for the sponsor-contract modal -- fires when a deal expires
  // (a passive event during round processing, easy to miss in the news feed alone) or when the
  // user signs/renews one (an explicit confirmation on top of the news item).
  const [sponsorAlert, setSponsorAlert] = useState<{ kind: 'EXPIRED' | 'SIGNED'; sponsorName: string; sponsorType: 'MASTER' | 'COSTAS' | 'MANGAS' } | null>(null);
  const dismissSponsorAlert = () => setSponsorAlert(null);

  // Live penalty shootout for the user's own Copa do Brasil tie. Kept in a ref too (same
  // pattern as cupStateRef) since takePenaltyShootoutKick() is called repeatedly on a timer from
  // the UI and needs the latest value synchronously, not a stale render closure.
  const [penaltyShootout, setPenaltyShootoutRaw] = useState<PenaltyShootoutState | null>(null);
  const penaltyShootoutRef = useRef<PenaltyShootoutState | null>(null);
  const setPenaltyShootout = (next: PenaltyShootoutState | null) => {
    penaltyShootoutRef.current = next;
    setPenaltyShootoutRaw(next);
  };

  // International transfer market (Premier League, Serie A, Bundesliga, La Liga, Ligue 1,
  // Libertadores). foreignPlayerPool is the full static dataset, fetched once and never
  // persisted (it's a fixed reference list, not user state); foreignMarketPlayers is the current
  // random sample actually shown for sale, refreshed the same way the domestic market is.
  // boughtForeignIds is the only piece that's actually persisted -- it's what keeps a player you
  // already signed from ever reappearing in the pool. Kept in a ref too, same reasoning as
  // cupStateRef: saveGame() needs the value it was just set to within the same synchronous call.
  const [foreignPlayerPool, setForeignPlayerPool] = useState<ForeignPlayer[]>([]);
  const [foreignMarketPlayers, setForeignMarketPlayersRaw] = useState<ForeignPlayer[]>([]);
  const foreignMarketRef = useRef<ForeignPlayer[]>([]);
  const setForeignMarketPlayers = (next: ForeignPlayer[]) => {
    foreignMarketRef.current = next;
    setForeignMarketPlayersRaw(next);
  };
  const [boughtForeignIds, setBoughtForeignIdsRaw] = useState<string[]>([]);
  const boughtForeignIdsRef = useRef<string[]>([]);
  const setBoughtForeignIds = (next: string[]) => {
    boughtForeignIdsRef.current = next;
    setBoughtForeignIdsRaw(next);
  };

  useEffect(() => {
    fetch('/data/foreign_players.json')
      .then(r => r.json())
      .then((data: ForeignPlayer[]) => setForeignPlayerPool(data))
      .catch(() => {});
  }, []);

  const sampleForeignPlayers = (pool: ForeignPlayer[], excludeIds: string[], count: number): ForeignPlayer[] => {
    const available = pool.filter(p => !excludeIds.includes(p.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  };

  // Populate the initial sample as soon as the pool finishes loading (covers both a fresh
  // career and a just-loaded save, since boughtForeignIds is restored by loadGame first).
  useEffect(() => {
    if (foreignPlayerPool.length > 0 && foreignMarketRef.current.length === 0) {
      setForeignMarketPlayers(sampleForeignPlayers(foreignPlayerPool, boughtForeignIdsRef.current, 18));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreignPlayerPool]);
  const [activeSponsors, setActiveSponsors] = useState<Record<'MASTER' | 'COSTAS' | 'MANGAS', Sponsor | null>>({
    MASTER: null,
    COSTAS: null,
    MANGAS: null
  });
  const [currentMatch, setCurrentMatch] = useState<LeagueMatch | null>(null);
  const [currentMatchResult, setCurrentMatchResult] = useState<MatchResult | null>(null);

  // Each campaign lives in exactly one of 4 save slots. currentSlotRef gives a
  // synchronous read (avoids stale-closure issues right after starting/loading
  // a game), currentSlot mirrors it in state for anything that needs to render it.
  const SAVE_SLOT_COUNT = 4;
  const currentSlotRef = useRef<number | null>(null);
  const [currentSlot, setCurrentSlotState] = useState<number | null>(null);

  // MATCH_DAY is always a temporary detour to show the live match animation. This remembers
  // where to actually land once the user dismisses it (back to normal play, the season-end
  // screen, or the sacked/job-offer screen) -- without it, the unconditional setGameState
  // ('MATCH_DAY') at the end of nextRound clobbers whatever real transition (SEASON_END from
  // a completed season, or from getting sacked mid-season) was supposed to happen.
  const pendingGameStateRef = useRef<GameState>('PLAYING');
  // Guards against nextRound() running twice for the same tap -- a fast double-tap (common on
  // mobile) fires the click handler twice within the same synchronous event, before React has
  // re-rendered to hide/disable the "Iniciar Partida" button, so a state-based guard wouldn't
  // see the change in time. The second call would silently simulate and advance an extra round
  // (using the same stale currentRound) while its own live match view got overwritten before
  // ever being seen -- exactly the "round advanced but no live match showed" symptom.
  const isProcessingRoundRef = useRef(false);
  const setActiveSlot = (slot: number | null) => {
    currentSlotRef.current = slot;
    setCurrentSlotState(slot);
  };
  const getFreeSlot = (): number | null => {
    for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
      if (!localStorage.getItem(`elifoot_2026_save_slot_${i}`)) return i;
    }
    return null;
  };

  // Auto-save state on changes — always writes to the campaign's own slot
  // Old rounds' full event feeds (goal-by-goal, cards, stats) are never read by anything once
  // that round is over -- the "other matches" board only shows the round that just finished,
  // and the season history tab only needs the final score. Keeping every match's full event
  // list forever was the single biggest driver of save-size growth (the save was already ~0.8MB
  // at round 1 and heading past 3MB by round 38), which is how a save can quietly cross a
  // browser's localStorage quota deep into a season. Stripping events/stats from anything older
  // than the last 2 rounds keeps the save flat for the rest of the season instead of growing
  // every single round.
  const slimOldMatchEvents = (schedule: LeagueMatch[], currentRoundNum: number): LeagueMatch[] =>
    schedule.map(m => {
      if (!m.result || !m.simulated || m.round >= currentRoundNum - 1) return m;
      if (m.result.events.length === 0 && m.result.homeStats.shots === 0 && m.result.attendance === undefined) return m;
      return {
        ...m,
        result: {
          homeScore: m.result.homeScore,
          awayScore: m.result.awayScore,
          events: [],
          homeStats: { shots: 0, possession: 0, fouls: 0, corners: 0 },
          awayStats: { shots: 0, possession: 0, fouls: 0, corners: 0 }
        }
      };
    });

  const saveFailureWarnedRef = useRef(false);

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
    if (!currentSlotRef.current) return;
    const slot = currentSlotRef.current;

    const buildData = (schedule: LeagueMatch[], newsFeed: NewsItem[]) => ({
      dbVersion: 3, // Identificador da versão atualizada dos elencos de 2026
      gameState: state,
      managerName: name,
      currentYear: year,
      currentRound: round,
      clubs: currentClubs,
      userClubId: clubId,
      schedule,
      marketPlayers: market,
      offers: jobOffers,
      news: newsFeed,
      history: past,
      stadiumUpgrade: upgrade,
      activeSponsors: sponsorsList,
      cupState: cupStateRef.current,
      foreignMarketPlayers: foreignMarketRef.current,
      boughtForeignIds: boughtForeignIdsRef.current,
      divisionExperience: divisionExperienceRef.current,
      formerClubName,
      lastSeasonTopSerieA
    });

    const slimSchedule = slimOldMatchEvents(currentSchedule, round);

    // Never let a failed write here take down the caller -- nextRoundImpl (and everything else
    // that calls saveGame) has essential state transitions (like opening the live match view)
    // AFTER this call, and those must still happen even if persisting to disk didn't work out.
    try {
      localStorage.setItem(`elifoot_2026_save_slot_${slot}`, JSON.stringify(buildData(slimSchedule, feed)));
    } catch (e) {
      // Quota exceeded (or similar) even after slimming match events -- try once more with only
      // the most recent news items kept, since that list only ever grows.
      try {
        const trimmedNews = feed.length > 150 ? feed.slice(feed.length - 150) : feed;
        localStorage.setItem(`elifoot_2026_save_slot_${slot}`, JSON.stringify(buildData(slimSchedule, trimmedNews)));
      } catch (e2) {
        // Still failing -- surface it once per session instead of silently losing progress
        // every round from here on with no way for the player to know.
        if (!saveFailureWarnedRef.current) {
          saveFailureWarnedRef.current = true;
          console.error('saveGame failed even after trimming:', e2);
          alert('Não foi possível salvar o jogo -- o armazenamento do navegador está cheio. Exporte seu save (Slots > Exportar) e libere espaço (limpando outras campanhas antigas) o quanto antes para não perder seu progresso.');
        }
      }
    }
  };

  const userClub = clubs.find(c => c.id === userClubId) || null;

  // Initialize a new game
  const startGame = (name: string, chosenClubId: string, slot?: number) => {
    const targetSlot = slot ?? getFreeSlot();
    if (!targetSlot) return; // no free slot and none explicitly chosen — caller must resolve this first
    setActiveSlot(targetSlot);

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
    const divisions: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    
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
    setCupState(startCup(updatedClubs, 2026));
    setBoughtForeignIds([]);
    setForeignMarketPlayers(foreignPlayerPool.length > 0 ? sampleForeignPlayers(foreignPlayerPool, [], 18) : []);

    const initialNews: NewsItem[] = [
      { id: '1', week: 0, text: `Bem-vindo ao futebol brasileiro, ${name}! Você assumiu o ${updatedClubs.find(c => c.id === chosenClubId)?.name}. Boa sorte na Série C!`, type: 'BOARD' }
    ];
    setNews(initialNews);
    
    // Generate initial market
    const market = generateMarketPlayers('C');
    setMarketPlayers(market);
    setGameState('PLAYING');

    saveGame('PLAYING', name, 2026, 1, updatedClubs, chosenClubId, newSchedule, market, [], initialNews, [], null, { MASTER: null, COSTAS: null, MANGAS: null });
  };

  // Generate random players for transfer market
  const generateMarketPlayers = (div: 'A' | 'B' | 'C'): Player[] => {
    // Generate 10-15 random free agents or transfer listed players
    const list: Player[] = [];
    const positions: PlayerPosition[] = ['GOL', 'ZAG', 'LD', 'LE', 'VOL', 'MEI', 'PON', 'CA'];

    let baseMin = 50, baseMax = 62;
    if (div === 'C') { baseMin = 50; baseMax = 62; }
    if (div === 'B') { baseMin = 62; baseMax = 72; }
    if (div === 'A') { baseMin = 72; baseMax = 84; }

    const firstNames = ['Kaio', 'Pedro', 'Neymar', 'Vini', 'Endrick', 'Bento', 'Murilo', 'Allan', 'Everton', 'Ruan', 'Higor', 'Darlisson', 'Talisca', 'Vitinho'];
    const lastNames = ['Teixeira', 'Junior', 'Barreto', 'Cardoso', 'Borges', 'Coelho', 'Guedes', 'Marinho', 'Assis', 'Duarte', 'Sampaio', 'Sales'];

    for (let i = 0; i < 15; i++) {
      const pos = positions[Math.floor(Math.random() * positions.length)];
      const age = Math.floor(Math.random() * 13) + 22; // 22-34, never field anyone under 22
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
    if (!userClub || isProcessingRoundRef.current) return;
    isProcessingRoundRef.current = true;
    try {
      nextRoundImpl(playerStarters);
    } finally {
      isProcessingRoundRef.current = false;
    }
  };

  const nextRoundImpl = (playerStarters: Player[]) => {
    if (!userClub) return;

    // Tracks how many rounds this manager has coached in each division, used to weight which
    // clubs come calling once he's on the free-agent market (see requestResignation).
    setDivisionExperience(prev => ({ ...prev, [userClub.division]: prev[userClub.division] + 1 }));

    // Accumulates every news item pushed during this round so saveGame() below
    // (which runs synchronously in this same call) sees them, avoiding the stale
    // `news` closure that setNews's functional updates don't resolve until re-render.
    const roundNews: NewsItem[] = [];
    const pushNews = (item: NewsItem) => {
      roundNews.push(item);
      setNews(prev => [...prev, item]);
    };

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
      let roundRevenue = 0; // accumulates this round's gross income (excludes wages/loans) for the bank's "receita anual" basis

      // Handle user's stadium progress
      let hasVipBoxes = club.hasVipBoxes;
      let vipBoxesWeeksLeft = club.vipBoxesWeeksLeft;
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
        roundRevenue += sponsorIncome;

        // Merchandising / shirt sales -- scales with the club's fame, how happy the fans
        // are right now, and how many star players are currently on the roster.
        const starCount = club.squad.filter(p => p.isStar).length;
        const merchBase = club.reputation * 60;
        const confidenceFactor = 0.6 + (club.confidence / 100) * 0.6; // 0.6x to 1.2x
        const starMultiplier = 1 + Math.min(starCount, 5) * 0.08; // up to +40% with 5+ stars
        const merchIncome = Math.round(merchBase * confidenceFactor * starMultiplier);
        finances += merchIncome;
        roundRevenue += merchIncome;

        // VIP boxes under construction
        if (vipBoxesWeeksLeft && vipBoxesWeeksLeft > 0) {
          if (vipBoxesWeeksLeft > 1) {
            vipBoxesWeeksLeft -= 1;
          } else {
            vipBoxesWeeksLeft = 0;
            hasVipBoxes = true;
            pushNews({
              id: `vip_done_${Date.now()}`,
              week: currentRound,
              text: `Camarotes VIP concluídos! O ${club.name} agora tem uma nova fonte de receita em cada jogo em casa.`,
              type: 'INFO'
            });
          }
        }

        // Apply player match results
        const userScore = isHome ? playerMatchResult.homeScore : playerMatchResult.awayScore;
        const oppScore = isHome ? playerMatchResult.awayScore : playerMatchResult.homeScore;

        if (userScore > oppScore) {
          confidence = Math.min(100, confidence + 8);
          // Sponsors pay an extra victory bonus on top of the fixed weekly payment
          if (sponsorIncome > 0) {
            const victoryBonus = Math.round(sponsorIncome * 0.3);
            finances += victoryBonus;
            roundRevenue += victoryBonus;
            pushNews({
              id: `spbonus_${Date.now()}`,
              week: currentRound,
              text: `Bônus de patrocínio! Seus patrocinadores pagaram ${formatCurrency(victoryBonus)} extra pela vitória.`,
              type: 'INFO'
            });
          }
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
          // Occupancy base is affected by reputation and performance. A real derby ("clássico")
          // packs the stadium regardless of either club's reputation/form -- fans show up for
          // the rivalry, not the table position.
          const performanceRep = club.confidence / 100;
          const derbyBoost = isClassico(club.id, matchInRound.awayId) ? 0.35 : 0;
          const baseOccupancy = 0.4 + (club.reputation / 100) * 0.4 + performanceRep * 0.2 + derbyBoost;

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
          roundRevenue += ticketIncome;

          // VIP boxes: premium revenue per home match, price-adjustable like the regular ticket
          // (too far above the baseline price and occupancy falls off, same formula as tickets).
          const effectiveHasVip = club.id === userClubId ? hasVipBoxes : club.hasVipBoxes;
          if (effectiveHasVip) {
            const baseVipPrice = VIP_BASE_PRICE_BY_DIV[club.division] ?? 200;
            const vipPrice = club.vipTicketPrice ?? baseVipPrice;
            const baseVipIncome = VIP_BASE_INCOME_BY_DIV[club.division] ?? 20000;
            let vipPriceFactor = 1.0;
            if (club.confidence < 95) {
              const ratio = vipPrice / baseVipPrice;
              vipPriceFactor = Math.max(0, Math.min(1, 1 - (ratio - 1) / 2));
            }
            const vipIncome = Math.round(baseVipIncome * (vipPrice / baseVipPrice) * vipPriceFactor);
            finances += vipIncome;
            roundRevenue += vipIncome;
          }
        }
      }

      // --- Bank loans: collect this round's installment on every active loan ---
      let financialScore = club.financialScore ?? 70;
      let lateStrikes = club.lateStrikes ?? 0;
      let seasonRevenueAccum = (club.seasonRevenueAccum ?? 0) + roundRevenue;
      let loans: Loan[] = [];
      (club.loans ?? []).forEach(loan => {
        if (loan.balance <= 0) return;
        const canPay = finances >= loan.installment;
        if (canPay) {
          finances -= loan.installment;
          const updated = advanceLoan(loan, true);
          if (updated.balance <= 0) {
            financialScore = Math.min(100, financialScore + 3);
            if (club.id === userClubId) {
              pushNews({
                id: `loan_paid_${loan.id}`,
                week: currentRound,
                text: `Empréstimo quitado! "${loan.purpose}" foi pago integralmente e seu Score Financeiro melhorou.`,
                type: 'INFO'
              });
            }
          } else {
            loans.push(updated);
          }
        } else {
          lateStrikes += 1;
          financialScore = Math.max(0, financialScore - 5);
          loans.push(advanceLoan(loan, false));
          if (club.id === userClubId) {
            pushNews({
              id: `loan_late_${loan.id}_${currentRound}`,
              week: currentRound,
              text: `Parcela do empréstimo "${loan.purpose}" atrasou por falta de caixa! Score Financeiro caiu e juros de mora foram cobrados.`,
              type: 'INFO'
            });
          }
        }
      });

      // AI clubs take a defensive loan if they somehow end up in the red (they don't pay
      // wages in this simulation, so this mostly guards against edge cases, but keeps the
      // "IA também usa empréstimos, e pode quebrar" rule honest if that ever changes).
      if (club.id !== userClubId && finances < 0) {
        const aiRate = getBaseInterestRate(financialScore);
        const aiMultiplier = getCreditMultiplier(financialScore);
        const aiLimit = (club.lastSeasonRevenue ?? 1000000) * aiMultiplier;
        const aiOutstanding = loans.reduce((sum, l) => sum + l.balance, 0);
        const aiAvailable = Math.max(0, aiLimit - aiOutstanding);
        const needed = Math.min(aiAvailable, Math.round(Math.abs(finances) * 1.5));
        if (needed > 100000) {
          const aiTerm = 36;
          const aiInstallment = calculateInstallment(needed, aiRate, aiTerm);
          loans.push({
            id: `loan_ai_${club.id}_${Date.now()}`,
            principal: needed,
            balance: needed,
            ratePerRound: aiRate,
            installment: aiInstallment,
            totalRounds: aiTerm,
            roundsPaid: 0,
            lateStreak: 0,
            purpose: 'Equilíbrio de caixa',
            startedYear: currentYear
          });
          finances += needed;
        }
      }

      // Update player physical energy & injuries
      const clubMatch = updatedMatches.find(m => m.round === currentRound && (m.homeId === club.id || m.awayId === club.id));
      let squad = club.squad.map(player => {
        let energy = player.energy;
        let isInjured = player.isInjured;
        let injuryWeeks = player.injuryWeeks || 0;
        let yellowCards = player.yellowCards;
        let redCards = player.redCards;
        let goals = player.goals;
        let justInjured = false;
        let suspendedMatches = player.suspendedMatches || 0;
        let justSuspended = false;

        // If player has cards/goals in the simulated match, update them
        if (clubMatch && clubMatch.result) {
          const matchRes = clubMatch.result;
          const playerEvents = matchRes.events.filter(e => e.player === player.name);

          playerEvents.forEach(ev => {
            if (ev.type === 'GOAL') goals++;
            if (ev.type === 'YELLOW') {
              yellowCards++;
              if (yellowCards % 3 === 0) {
                suspendedMatches = Math.max(suspendedMatches, 1);
                justSuspended = true;
                if (club.id === userClubId) {
                  pushNews({
                    id: `susp_yellow_${player.id}_${Date.now()}`,
                    week: currentRound,
                    text: `${player.name} (${player.position}) chegou ao ${yellowCards}º cartão amarelo no campeonato e está suspenso para a próxima rodada.`,
                    type: 'MATCH'
                  });
                }
              }
            }
            if (ev.type === 'RED') {
              redCards++;
              suspendedMatches = Math.max(suspendedMatches, 1);
              justSuspended = true;
              if (club.id === userClubId) {
                pushNews({
                  id: `red_${player.id}_${Date.now()}`,
                  week: currentRound,
                  text: `${player.name} (${player.position}) foi expulso de campo e vai desfalcar o time na próxima rodada.`,
                  type: 'MATCH'
                });
              }
            }
            if (ev.type === 'INJURY') {
              isInjured = true;
              justInjured = true;
              // 70% chance of a light 1-week injury, otherwise 2-4 weeks
              injuryWeeks = Math.random() < 0.70 ? 1 : Math.floor(Math.random() * 3) + 2;
              energy = 100; // recovers fatigue on injury!
              if (club.id === userClubId) {
                pushNews({
                  id: `inj_match_${player.id}_${Date.now()}`,
                  week: currentRound,
                  text: `${player.name} (${player.position}) se lesionou durante o jogo e ficará afastado por ${injuryWeeks} semana(s).`,
                  type: 'MATCH'
                });
              }
            }
          });
        }

        // Random injury chance per round even without match events. A normally-rested player
        // barely ever gets hurt here -- this mostly matters for older players, and especially
        // for anyone who's been playing heavy minutes without a rest (low current energy).
        if (!isInjured && club.id === userClubId) {
          const ageFactor = player.age > 30 ? (player.age - 30) * 0.003 : 0.0008;
          const fatigue = 100 - energy;
          const fatigueFactor = fatigue > 40 ? (fatigue - 40) * 0.0015 : 0;
          const injuryChance = ageFactor + fatigueFactor;
          if (Math.random() < injuryChance) {
            isInjured = true;
            justInjured = true;
            injuryWeeks = Math.random() < 0.70 ? 1 : Math.floor(Math.random() * 3) + 2;
            energy = 100; // recovers fatigue on injury!
            pushNews({
              id: `inj_rand_${player.id}_${Date.now()}`,
              week: currentRound,
              text: `${player.name} (${player.position}) sofreu uma lesão no departamento médico e desfalcará o time por ${injuryWeeks} semana(s).`,
              type: 'INFO'
            });
          }
        }

        // Energy management
        const wasStarter = club.id === userClubId 
          ? playerStarters.some(p => p.id === player.id)
          : getAutoStarters(club).some(p => p.id === player.id);

        if (isInjured) {
          energy = 100; // fully recovered when injured
          // A player hurt THIS round keeps their full recovery time — they've already
          // missed this match's minutes, the countdown for missing future rounds
          // starts next round, not now.
          if (!justInjured) {
            if (injuryWeeks > 1) {
              injuryWeeks--;
            } else {
              isInjured = false;
              injuryWeeks = 0;
            }
          }
        } else {
          // Veterans (33+) tire out faster on the pitch and recover a bit slower at rest --
          // the older legs don't bounce back like a young player's.
          const isVeteran = player.age >= 33;
          if (wasStarter) {
            const veteranPenalty = isVeteran ? Math.floor(Math.random() * 4) + 3 : 0; // extra 3-6 energy lost
            energy = Math.max(30, energy - Math.floor(Math.random() * 6) - 4 - veteranPenalty);
          } else {
            energy = Math.min(100, energy + (isVeteran ? 14 : 20)); // recover energy faster on bench/rest (was 15)
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
          // Reserve - training! (rates halved from the original 0.15/0.06/0.08 -- ratings were
          // compounding too fast season over season when combined with the end-of-season bumps)
          if (isYoung) {
            if (Math.random() < 0.08) rating = Math.min(99, rating + 1);
          } else if (isOld) {
            const roll = Math.random();
            if (roll < 0.04) rating = Math.max(40, rating - 1);
            else if (roll < 0.05) rating = Math.min(99, rating + 1);
          } else {
            if (Math.random() < 0.04) rating = Math.min(99, rating + 1);
          }
        }

        let performanceTrend: 'UP' | 'DOWN' | 'NEUTRAL' = player.performanceTrend || 'NEUTRAL';
        if (rating > player.rating) {
          performanceTrend = 'UP';
        } else if (rating < player.rating) {
          performanceTrend = 'DOWN';
        } else if (Math.random() < 0.08) {
          // Occasional random shift to neutral
          performanceTrend = 'NEUTRAL';
        }

        // Tracks rounds spent in good form ("Bom"/"Otimo" condition badge, i.e. not "Ruim")
        // while actually starting -- feeds the end-of-season form bonus (see endSeason).
        let seasonStartedRounds = player.seasonStartedRounds ?? 0;
        let seasonGoodRounds = player.seasonGoodRounds ?? 0;
        if (wasStarter) {
          seasonStartedRounds++;
          if (performanceTrend !== 'DOWN') seasonGoodRounds++;
        }

        if (club.id === userClubId && performanceTrend !== player.performanceTrend && (player.isStar || player.rating >= 75)) {
          if (performanceTrend === 'UP') {
            pushNews({
              id: `form_up_${player.id}_${Date.now()}`,
              week: currentRound,
              text: `${player.name} (${player.position}) está em ótima fase e vem crescendo de rendimento nos treinos.`,
              type: 'INFO'
            });
          } else if (performanceTrend === 'DOWN') {
            pushNews({
              id: `form_down_${player.id}_${Date.now()}`,
              week: currentRound,
              text: `${player.name} (${player.position}) vive fase ruim e vem caindo de rendimento.`,
              type: 'INFO'
            });
          }
        }

        let value = player.value;
        let salary = player.salary;
        if (rating !== player.rating) {
          const ageFactor = player.age < 24 ? 1.3 : player.age > 30 ? 0.7 : 1.0;
          const group = getPositionGroup(player.position);
          const posFactor = group === 'FW' ? 1.2 : group === 'GK' ? 0.9 : 1.0;
          const valBase = Math.pow(rating - 30, 2.5) * 800;
          value = Math.max(10000, Math.round(valBase * ageFactor * posFactor));
          salary = Math.round(value * 0.005);
        }

        // --- Contract weeks management ---
        let contractWeeks = player.contractWeeks ?? 38;
        let contractLocked = player.contractLocked;
        let contractLockYears = player.contractLockYears;

        if (club.id === userClubId) {
          contractWeeks = Math.max(0, contractWeeks - 1);
          // If contract weeks expires or is low, contractLocked might automatically release, or decrement years
          if (contractWeeks % 38 === 0 && contractLockYears && contractLockYears > 0) {
            contractLockYears--;
            if (contractLockYears === 0) {
              contractLocked = false;
            }
          }
        }

        // --- Dissatisfaction (bench rounds tracking - randomized) ---
        let benchRounds = player.benchRounds ?? 0;
        if (club.id === userClubId) {
          if (wasStarter) {
            benchRounds = 0; // reset if played
          } else if (!isInjured) {
            benchRounds += 1;
            // A contractLocked player CANNOT request to leave (cannot get dissatisfied).
            // Only kicks in once a player has sat out more than half of the 38-round season.
            if (!contractLocked && benchRounds > 19 && Math.random() < 0.015) {
              benchRounds = 999;
              pushNews({
                id: `unhappy_${player.id}_${Date.now()}`,
                week: currentRound,
                text: `${player.name} (${player.position}) está insatisfeito no banco de reservas e pede uma oportunidade ou transferência.`,
                type: 'INFO'
              });
            }
          }

          // The deeper the club sinks into the red, the more nervous every player gets about
          // getting paid -- this fires independently of playing time, for starters too.
          if (benchRounds !== 999 && !contractLocked && finances < 0) {
            const debtSeverity = Math.min(5, Math.floor(Math.abs(finances) / 500000)); // 0-5 steps of -500k
            if (debtSeverity > 0 && Math.random() < debtSeverity * 0.003) {
              benchRounds = 999;
              pushNews({
                id: `unhappy_debt_${player.id}_${Date.now()}`,
                week: currentRound,
                text: `${player.name} (${player.position}) está preocupado com a crise financeira do ${club.name} e pede transferência.`,
                type: 'INFO'
              });
            }
          }
        }

        // --- Suspension (red card / 3rd accumulated yellow) countdown ---
        if (suspendedMatches > 0 && !justSuspended) {
          suspendedMatches -= 1;
        }

        // --- Post-renewal morale boost countdown -- only ticks down on matches he actually started ---
        let renewalBoostMatchesLeft = player.renewalBoostMatchesLeft ?? 0;
        const renewalBoostPercent = player.renewalBoostPercent;
        if (wasStarter && renewalBoostMatchesLeft > 0) {
          renewalBoostMatchesLeft -= 1;
        }

        return { ...player, rating, value, salary, energy, isInjured, injuryWeeks, yellowCards, redCards, goals, contractWeeks, benchRounds, contractLocked, contractLockYears, performanceTrend, suspendedMatches, seasonStartedRounds, seasonGoodRounds, renewalBoostMatchesLeft, renewalBoostPercent };
      });

      return { ...club, finances, confidence, squad, hasVipBoxes, vipBoxesWeeksLeft, financialScore, lateStrikes, loans, seasonRevenueAccum };
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
        pushNews({
          id: `stad_${Date.now()}`,
          week: currentRound,
          text: `Obras concluídas! A capacidade do seu estádio aumentou em ${stadiumUpgrade.capacityAdded.toLocaleString()} lugares!`,
          type: 'INFO'
        });
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
          pushNews({
            id: `spon_end_${Date.now()}`,
            week: currentRound,
            text: `Contrato de patrocínio com a ${sp.name} expirou.`,
            type: 'INFO'
          });
          setSponsorAlert({ kind: 'EXPIRED', sponsorName: sp.name, sponsorType: type });
        }
      }
    });

    // Check Board Confidence / Sacking (Immediate or Warning)
    let nextOffers = offers;
    let nextGameState = gameState;
    const userConfidence = finalClubs.find(c => c.id === userClubId)!.confidence;
    
    if (userConfidence <= 0) {
      // SACKED!
      pushNews({
        id: `sack_${Date.now()}`,
        week: currentRound,
        text: `Você foi DEMITIDO! A diretoria perdeu totalmente a confiança no seu trabalho após os últimos resultados.`,
        type: 'BOARD'
      });
      
      // Generate immediate job offers from Série C clubs (lower tier)
      const cClubs = finalClubs.filter(c => c.division === 'C' && c.id !== userClubId);
      const generatedOffers: JobOffer[] = [];
      for (let i = 0; i < 3; i++) {
        const target = cClubs[Math.floor(Math.random() * cClubs.length)];
        if (target && !generatedOffers.some(o => o.clubId === target.id)) {
          generatedOffers.push({
            clubId: target.id,
            clubName: target.name,
            division: 'C',
            salaryBonus: 0
          });
        }
      }
      nextOffers = generatedOffers;
      nextGameState = 'SEASON_END'; // Go to decision screen
    } else if (userConfidence < 20) {
      pushNews({
        id: `warn_${Date.now()}`,
        week: currentRound,
        text: `AVISO: A diretoria está extremamente descontente. Melhore seus resultados ou será demitido!`,
        type: 'BOARD'
      });
    } else if (userConfidence >= 85 && Math.random() < 0.2) {
      pushNews({
        id: `board_happy_${Date.now()}`,
        week: currentRound,
        text: `A diretoria está muito satisfeita com seu trabalho à frente do ${userClub.name}!`,
        type: 'BOARD'
      });
    }

    // --- MID-SEASON OFFERS FROM HIGHER DIVISION BOTS IN CRISIS ---
    // If player club is doing very well (confidence > 75) and there's a club in a higher division in crisis (confidence < 35)
    if (userClub && userClub.confidence >= 75 && Math.random() < 0.18) {
      const playerDiv = userClub.division;
      const targetDiv = playerDiv === 'C' ? 'B' : playerDiv === 'B' ? 'A' : null;
      if (targetDiv) {
        // Find higher division clubs in crisis
        const crisisClubs = finalClubs.filter(c => c.division === targetDiv && c.confidence < 35 && c.id !== userClubId);
        if (crisisClubs.length > 0) {
          const selectedCrisis = crisisClubs[Math.floor(Math.random() * crisisClubs.length)];
          const offerExists = nextOffers.some(o => o.clubId === selectedCrisis.id);
          if (!offerExists) {
            nextOffers = [...nextOffers, {
              clubId: selectedCrisis.id,
              clubName: selectedCrisis.name,
              division: targetDiv,
              salaryBonus: 15
            }];

            pushNews({
              id: `mid_offer_${Date.now()}`,
              week: currentRound,
              text: `ESPECULAÇÃO: O ${selectedCrisis.name} (Série ${targetDiv}) está em crise e monitora a contratação do técnico ${managerName}!`,
              type: 'OFFER'
            });
          }
        }
      }
    }

    // Refresh transfer market occasionally
    let nextMarket = marketPlayers;
    if (Math.random() < 0.25) {
      nextMarket = generateMarketPlayers(userClub.division as 'A' | 'B' | 'C');
    }
    if (Math.random() < 0.25 && foreignPlayerPool.length > 0) {
      setForeignMarketPlayers(sampleForeignPlayers(foreignPlayerPool, boughtForeignIds, 18));
    }

    // Set states
    setClubs(finalClubs);
    setSchedule(updatedMatches);
    setStadiumUpgrade(nextUpgrade);
    setActiveSponsors(updatedSponsors);
    setMarketPlayers(nextMarket);
    setOffers(nextOffers);

    // Advance round or end season. Whichever real state this leads to (back to normal
    // play, sacked, or the season just finished) is only applied once the user dismisses
    // the match view -- see pendingGameStateRef.
    if (currentRound < 38) {
      setCurrentRound(prev => prev + 1);
      saveGame(nextGameState === 'SEASON_END' ? 'SEASON_END' : 'PLAYING', managerName, currentYear, currentRound + 1, finalClubs, userClubId, updatedMatches, nextMarket, nextOffers, [...news, ...roundNews], history, nextUpgrade, updatedSponsors);
      pendingGameStateRef.current = nextGameState;
    } else {
      // Trigger season end
      endSeason(finalClubs, updatedMatches, updatedSponsors, nextUpgrade);
      pendingGameStateRef.current = 'SEASON_END';
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

    // Captures the top Série A finishers before the season rolls over, so next year's Copa do
    // Brasil can seed them straight to the Oitavas draw (see startCup in cupEngine.ts).
    setLastSeasonTopSerieA(standings.A.slice(0, CUP_OITAVAS_SEED_COUNT).map(s => s.clubId));

    // 2. Identify Promoted and Relegated teams
    const promotions: Record<'B' | 'C', string[]> = { B: [], C: [] };
    const relegations: Record<'A' | 'B', string[]> = { A: [], B: [] };

    const divisions: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const divisionChampions: Record<'A' | 'B' | 'C', string> = { A: '', B: '', C: '' };

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
      }
    });

    const getPrizeMoney = (division: 'A' | 'B' | 'C', rankIndex: number): number => {
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
      return 0;
    };

    // 2.5 Find top scorers per division to award/keep Star status
    const divisionTopScorers: Record<string, { playerName: string; goals: number }[]> = { A: [], B: [], C: [] };
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
    // Real careers end -- rolled per player, per club (league-wide, not just the user's), once
    // they age past 38. Outfield players (not GOL/ZAG) are quickest to hang up the boots once
    // they hit 39; goalkeepers hold on a bit longer; centre-backs (ZAG) longest of all, matching
    // how those positions actually age out in real football. Hard-capped a little past each
    // group's expected window so nobody just plays forever.
    const rollRetirement = (position: PlayerPosition, age: number): boolean => {
      if (age < 39) return false;
      const chanceByAge: Record<number, number> = position === 'ZAG'
        ? { 39: 0.08, 40: 0.18, 41: 0.32, 42: 0.55, 43: 0.80 }
        : position === 'GOL'
        ? { 39: 0.10, 40: 0.25, 41: 0.45, 42: 0.70, 43: 0.90 }
        : { 39: 0.35, 40: 0.60, 41: 0.85 };
      const hardCap = position === 'ZAG' || position === 'GOL' ? 44 : 42;
      if (age >= hardCap) return true;
      return Math.random() < (chanceByAge[age] ?? 1);
    };
    const retirementNews: NewsItem[] = [];

    const finalClubs = currentClubs.map(club => {
      let div = club.division;
      const divStandings = standings[club.division];
      const rankIndex = divStandings.findIndex(s => s.clubId === club.id);
      const prizeMoney = getPrizeMoney(club.division as 'A' | 'B' | 'C', rankIndex);
      const finances = club.finances + prizeMoney;

      // --- Bank: close out the season's revenue tally and adjust the Score Financeiro ---
      const seasonRevenueAccum = (club.seasonRevenueAccum ?? 0) + prizeMoney;
      const lastSeasonRevenue = seasonRevenueAccum > 0 ? seasonRevenueAccum : (club.lastSeasonRevenue ?? 1000000);
      const seasonProfit = finances - (club.seasonStartFinances ?? finances);
      let financialScore = club.financialScore ?? 70;
      if (seasonProfit > 0) financialScore = Math.min(100, financialScore + 3);
      else if (seasonProfit < 0) financialScore = Math.max(0, financialScore - 3);
      if (finances < 0) financialScore = Math.max(0, financialScore - 2);
      const totalDebt = (club.loans ?? []).reduce((sum, l) => sum + l.balance, 0);
      const wageBill = club.squad.reduce((sum, p) => sum + p.salary, 0) * 38;
      if (lastSeasonRevenue > 0 && wageBill / lastSeasonRevenue > 0.9) financialScore = Math.max(0, financialScore - 2);
      if (lastSeasonRevenue > 0 && totalDebt / lastSeasonRevenue > 0.8) financialScore = Math.max(0, financialScore - 2);

      // A club sitting on a healthy cash cushion is a going concern regardless of what dragged
      // the score down in the past -- without this, a club with tens of millions in the bank
      // could still be stuck reading "Endividado" from an old bad season, which doesn't reflect
      // its actual standing at all. Scaled against revenue so this means the same thing whether
      // it's a Série A giant or a small Série C club with a fat reserve.
      const cashRatio = lastSeasonRevenue > 0 ? finances / lastSeasonRevenue : 0;
      if (cashRatio >= 0.5) financialScore = Math.min(100, financialScore + 5);
      else if (cashRatio >= 0.2) financialScore = Math.min(100, financialScore + 2);

      if (div === 'A' && relegations.A.includes(club.id)) div = 'B';
      else if (div === 'B') {
        if (promotions.B.includes(club.id)) div = 'A';
        else if (relegations.B.includes(club.id)) div = 'C';
      } else if (div === 'C') {
        if (promotions.C.includes(club.id)) div = 'B';
      }

      // Reset squad card stats (clean slate for goals/cards) & evaluate Stars
      const isRelegated = (club.division === 'A' && relegations.A.includes(club.id)) ||
                          (club.division === 'B' && relegations.B.includes(club.id));
      const isChampion = rankIndex === 0;
      const isPromoted = (club.division === 'B' && promotions.B.includes(club.id)) ||
                         (club.division === 'C' && promotions.C.includes(club.id));

      // Board confidence for next season carries some of this year's performance forward
      // instead of always flattening to 70 — a title run or promotion buys goodwill,
      // a relegation costs it.
      const nextConfidence = isChampion ? 85 : isPromoted ? 78 : isRelegated ? 55 : 70;

      const agedSquad = club.squad.map(p => {
        const posGroup = getPositionGroup(p.position);
        const isMF_FW = posGroup === 'MF' || posGroup === 'FW';
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
          else {
            // A player clearly playing above his division's level (Série B caliber in Série C,
            // or Série A caliber in Série B) stood out all season -- give him a real, if not
            // guaranteed, shot at breaking out as a star next year.
            const standoutThreshold = club.division === 'C' ? 68 : club.division === 'B' ? 78 : Infinity;
            if (p.rating >= standoutThreshold && !isRelegated && Math.random() < 0.25) isStar = true;
          }
        }

        // Any player who scored 10+ goals this season earns a star and a rating bump for
        // next year, on top of whatever the checks above already decided. (Reduced from 10%
        // -- compounding year over year on top of the other bumps below was inflating ratings
        // too fast for a prolific scorer over a few seasons.)
        let rating = p.rating;
        if (p.goals >= 10) {
          isStar = true;
          rating = Math.min(99, Math.round(p.rating * 1.06));
        }

        // Consistently good form this season earns an extra 5% growth bump for next year:
        // needs a real sample of starts (10+) and to have spent most of them (75%+) rated
        // "Bom"/"Otimo" rather than "Ruim" -- rewards reliable performers, not just anyone
        // who avoided a bad-luck dip while barely playing.
        const startedRounds = p.seasonStartedRounds ?? 0;
        const goodRounds = p.seasonGoodRounds ?? 0;
        if (startedRounds >= 10 && goodRounds / startedRounds >= 0.75) {
          rating = Math.min(99, Math.round(rating * 1.05));
        }

        // Age up a year, and let a real career progression/decline curve play out: young
        // players (<=23) keep developing, players past 31 decline faster and more often as
        // they age further past that (matching real careers winding down), in between is
        // a stable prime. This is on top of the fine-grained weekly wear/training drift
        // that already happens round to round (see the isYoung/isOld block above).
        const age = p.age + 1;
        if (age <= 23) {
          if (Math.random() < 0.22) rating = Math.min(99, rating + 1);
        } else if (age >= 32) {
          const declineChance = 0.35 + (age - 32) * 0.05;
          if (Math.random() < Math.min(0.85, declineChance)) rating = Math.max(40, rating - (age >= 36 ? 2 : 1));
        }

        let value = p.value;
        let salary = p.salary;
        if (rating !== p.rating) {
          const ageFactor = age < 24 ? 1.3 : age > 30 ? 0.7 : 1.0;
          const posFactor = posGroup === 'FW' ? 1.2 : posGroup === 'GK' ? 0.9 : 1.0;
          const valBase = Math.pow(rating - 30, 2.5) * 800;
          value = Math.max(10000, Math.round(valBase * ageFactor * posFactor));
          salary = Math.round(value * 0.005);
        }

        return {
          ...p,
          age,
          isStar,
          rating,
          value,
          salary,
          contractLocked: (p.contractLockYears ?? 0) > 0, // multi-year locks persist across the season boundary
          goals: 0,
          yellowCards: 0,
          redCards: 0,
          energy: 100,
          seasonStartedRounds: 0,
          seasonGoodRounds: 0
        };
      });

      const squad = agedSquad.filter(p => {
        if (!rollRetirement(p.position, p.age)) return true;
        if (club.id === userClubId) {
          retirementNews.push({
            id: `retire_auto_${p.id}_${Date.now()}`,
            week: 0,
            text: `${p.name} (${p.position}, ${p.age} anos) se aposentou do futebol.`,
            type: 'INFO'
          });
        }
        return false;
      });

      return {
        ...club,
        division: div,
        confidence: nextConfidence,
        finances,
        squad,
        financialScore,
        lastSeasonRevenue,
        seasonRevenueAccum: 0,
        seasonStartFinances: finances,
        lateStrikes: financialScore >= 70 ? 0 : (club.lateStrikes ?? 0)
      };
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
                             (playerDiv === 'C' && promotions.C.includes(userClubId));
    const isPlayerChampion = divisionChampions[playerDiv] === playerClubFinal.name;
    const isPlayerRelegated = (playerDiv === 'A' && relegations.A.includes(userClubId)) ||
                              (playerDiv === 'B' && relegations.B.includes(userClubId));

    const careerOffers: JobOffer[] = [];
    const allAvailableClubs = finalClubs.filter(c => c.id !== userClubId);

    if (isPlayerChampion) {
      // Elite offers from higher divisions
      const nextDiv = playerDiv === 'C' ? 'B' : 'A';
      const potentialClubs = allAvailableClubs.filter(c => c.division === nextDiv);
      for (let i = 0; i < 3; i++) {
        const c = potentialClubs[Math.floor(Math.random() * potentialClubs.length)];
        if (c && !careerOffers.some(o => o.clubId === c.id)) {
          careerOffers.push({ clubId: c.id, clubName: c.name, division: c.division, salaryBonus: 20 });
        }
      }
    } else if (isPlayerPromoted) {
      // Good offers
      const nextDiv = playerDiv === 'C' ? 'B' : 'A';
      const potentialClubs = allAvailableClubs.filter(c => c.division === nextDiv || c.division === playerDiv);
      for (let i = 0; i < 2; i++) {
        const c = potentialClubs[Math.floor(Math.random() * potentialClubs.length)];
        if (c && !careerOffers.some(o => o.clubId === c.id)) {
          careerOffers.push({ clubId: c.id, clubName: c.name, division: c.division, salaryBonus: 10 });
        }
      }
    } else if (isPlayerRelegated) {
      // Only offers from lower divisions or same low tier
      const lowerDiv = playerDiv === 'A' ? 'B' : 'C';
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
        text: `Fim da Temporada ${currentYear}! Campeão Série A: ${divisionChampions.A}. Promoções: Série B (${promotions.B.map(id => currentClubs.find(c=>c.id===id)?.name).join(', ')}).`,
        type: 'BOARD'
      },
      {
        id: `prize_${Date.now()}`,
        week: 38,
        text: `Premiação da Liga! O ${playerClubFinal.name} terminou em ${userRankIndex + 1}º lugar na Série ${playerDiv} e recebeu R$ ${userPrize.toLocaleString()} em premiações.`,
        type: 'BOARD'
      },
      ...retirementNews
    ];
    setNews(prev => [...prev, ...summaryNews]);

    saveGame('SEASON_END', managerName, currentYear, 38, finalClubs, userClubId, currentSchedule, marketPlayers, careerOffers, [...news, ...summaryNews], nextHistory, upgrade, sponsorsList);
  };

  // Helper to calculate standings table
  const calculateStandings = (allClubs: Club[], allSchedule: LeagueMatch[]) => {
    const list: Record<'A' | 'B' | 'C', { clubId: string; clubName: string; points: number; played: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number }[]> = {
      A: [], B: [], C: []
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
        const homeEntry = list[match.division as 'A' | 'B' | 'C'].find(e => e.clubId === match.homeId);
        const awayEntry = list[match.division as 'A' | 'B' | 'C'].find(e => e.clubId === match.awayId);

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

    return list;
  };

  // Formation position requirements (mirrors App.tsx's getTacticNeeds) used to make sure
  // a squad can always field at least one valid tactical scheme, not a fixed headcount.
  // Minimum number of healthy players the squad must keep per position. CA has no floor
  // here on purpose -- a Ponta can always play as a makeshift centre-forward, so a club
  // doesn't need a dedicated CA to remain sellable/fieldable.
  const MIN_SQUAD_DEPTH: Partial<Record<PlayerPosition, number>> = {
    GOL: 1, ZAG: 3, LD: 1, LE: 1, VOL: 2, MEI: 4, PON: 3
  };
  const MIN_SQUAD_SIZE = 16; // 11 titulares + 5 reservas

  // Checks only the SOLD player's own position against its floor -- "you can sell as long
  // as you still have more than the minimum in that position." A different position already
  // sitting below its own floor (e.g. a thin midfield) is not this sale's problem to block.
  const findDepthViolation = (squadAfterSale: Player[], soldPosition: PlayerPosition): { pos: PlayerPosition; min: number } | null => {
    const min = MIN_SQUAD_DEPTH[soldPosition];
    if (min === undefined) return null;
    const remaining = squadAfterSale.filter(p => p.position === soldPosition && !p.isInjured).length;
    return remaining < min ? { pos: soldPosition, min } : null;
  };

  // Buy player from transfer market
  const buyPlayer = (player: Player) => {
    if (!userClub) return;

    if (userClub.finances < player.value) {
      alert('Finanças insuficientes para contratar este jogador.');
      return;
    }

    // Helper to sort squad by position GK, DF, MF, FW
    const sortSquad = (squad: Player[]) => {
      const order: Record<PlayerPosition, number> = { GOL: 0, ZAG: 1, LD: 2, LE: 3, VOL: 4, MEI: 5, PON: 6, CA: 7 };
      return [...squad].sort((a, b) => order[a.position] - order[b.position]);
    };

    // Deduct cost and add player
    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return {
          ...club,
          finances: club.finances - player.value,
          squad: sortSquad([...club.squad, player])
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

  // Sign a player straight out of the international market (foreignMarketPlayers). Unlike
  // buyPlayer, there's no seller club to remove them from -- they simply weren't part of the
  // simulated league pool. Once bought they're recorded in boughtForeignIds so this exact
  // player never resurfaces in the market again for the rest of the career.
  const buyForeignPlayer = (player: ForeignPlayer) => {
    if (!userClub) return;

    if (userClub.finances < player.value) {
      alert('Finanças insuficientes para contratar este jogador.');
      return;
    }

    const sortSquad = (squad: Player[]) => {
      const order: Record<PlayerPosition, number> = { GOL: 0, ZAG: 1, LD: 2, LE: 3, VOL: 4, MEI: 5, PON: 6, CA: 7 };
      return [...squad].sort((a, b) => order[a.position] - order[b.position]);
    };

    const { nationality, originClub, league, ...basePlayer } = player;
    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return {
          ...club,
          finances: club.finances - player.value,
          squad: sortSquad([...club.squad, basePlayer])
        };
      }
      return club;
    });

    const nextForeignMarket = foreignMarketPlayers.filter(p => p.id !== player.id);
    const nextBoughtIds = [...boughtForeignIds, player.id];

    setClubs(updatedClubs);
    setForeignMarketPlayers(nextForeignMarket);
    setBoughtForeignIds(nextBoughtIds);

    setNews(prev => [...prev, {
      id: `buy_foreign_${Date.now()}`,
      week: currentRound,
      text: `Contratação internacional! O ${userClub.name} anunciou a contratação de ${player.name} (${originClub} - ${league}) por ${formatCurrency(player.value)}.`,
      type: 'TRANSFER'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Sell player to market (returns 90% of value instantly)
  const sellPlayer = (player: Player) => {
    if (!userClub) return;

    if (userClub.squad.length <= MIN_SQUAD_SIZE) {
      alert(`Elenco muito reduzido! Você precisa manter pelo menos ${MIN_SQUAD_SIZE} jogadores no elenco (11 titulares + 5 reservas).`);
      return;
    }

    const squadAfterSale = userClub.squad.filter(p => p.id !== player.id);
    const violation = findDepthViolation(squadAfterSale, player.position);
    if (violation) {
      alert(`Impossível vender! O elenco precisa manter pelo menos ${violation.min} jogador(es) de ${violation.pos}.`);
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

  // Lists a player at a manager-chosen asking price instead of the instant fixed-90% sale
  // above. Clubs are less likely to bite the higher above market value the price is asked --
  // above 115% of value nobody bites at all -- while a star player draws extra interest at any
  // price. Returns a result object (rather than alert()ing directly) so the caller can show the
  // outcome in its own styled modal instead of a native browser popup.
  const attemptSellPlayer = (player: Player, askingPrice: number): { success: boolean; message?: string } => {
    if (!userClub) return { success: false };

    if (userClub.squad.length <= MIN_SQUAD_SIZE) {
      return { success: false, message: `Elenco muito reduzido! Você precisa manter pelo menos ${MIN_SQUAD_SIZE} jogadores no elenco (11 titulares + 5 reservas).` };
    }

    const squadAfterSale = userClub.squad.filter(p => p.id !== player.id);
    const violation = findDepthViolation(squadAfterSale, player.position);
    if (violation) {
      return { success: false, message: `Impossível vender! O elenco precisa manter pelo menos ${violation.min} jogador(es) de ${violation.pos}.` };
    }

    // The exact threshold/odds are intentionally not surfaced to the player -- a rejection
    // always reads the same regardless of whether it's the hard 15%-over cutoff or just an
    // unlucky roll below it, so the mechanic isn't reverse-engineerable from the message alone.
    const rejectionMessage = `Nenhum clube topa pagar ${formatCurrency(askingPrice)} por ${player.name}. Peça um valor menor.`;
    const ratio = player.value > 0 ? askingPrice / player.value : 1;
    if (ratio > 1.15) {
      return { success: false, message: rejectionMessage };
    }

    let chance = ratio <= 1.0 ? 0.85 + (1 - ratio) * 0.15 : 0.85 * (1 - (ratio - 1.0) / 0.15);
    if (player.isStar) chance += 0.15;
    chance = Math.max(0, Math.min(1, chance));

    if (Math.random() >= chance) {
      return { success: false, message: rejectionMessage };
    }

    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return { ...club, finances: club.finances + askingPrice, squad: club.squad.filter(p => p.id !== player.id) };
      }
      return club;
    });
    setClubs(updatedClubs);

    const otherClubs = clubs.filter(c => c.id !== userClubId);
    const buyerClub = otherClubs[Math.floor(Math.random() * otherClubs.length)] || { name: 'Outro Clube' };
    const nextNews = [{
      id: `sell_${Date.now()}`,
      week: currentRound,
      text: `Transferência! O ${buyerClub.name} comprou o jogador ${player.name} do ${userClub.name} por ${formatCurrency(askingPrice)}.`,
      type: 'TRANSFER' as const
    }];
    setNews(prev => [...prev, ...nextNews]);
    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, [...news, ...nextNews], history, stadiumUpgrade, activeSponsors);
    return { success: true, message: `Vendido! O ${buyerClub.name} comprou ${player.name} por ${formatCurrency(askingPrice)}.` };
  };

  // Retires a player from the game entirely -- unlike sellPlayer, no other club acquires them
  // and no money changes hands; the player simply leaves the squad and is gone for good.
  const retirePlayer = (player: Player) => {
    if (!userClub) return;

    if (userClub.squad.length <= MIN_SQUAD_SIZE) {
      alert(`Elenco muito reduzido! Você precisa manter pelo menos ${MIN_SQUAD_SIZE} jogadores no elenco (11 titulares + 5 reservas).`);
      return;
    }

    const squadAfterRetirement = userClub.squad.filter(p => p.id !== player.id);
    const violation = findDepthViolation(squadAfterRetirement, player.position);
    if (violation) {
      alert(`Impossível aposentar! O elenco precisa manter pelo menos ${violation.min} jogador(es) de ${violation.pos}.`);
      return;
    }

    const updatedClubs = clubs.map(club =>
      club.id === userClubId ? { ...club, squad: squadAfterRetirement } : club
    );
    setClubs(updatedClubs);

    setNews(prev => [...prev, {
      id: `retire_${Date.now()}`,
      week: currentRound,
      text: `${player.name} anunciou aposentadoria e encerrou a carreira como jogador do ${userClub.name}.`,
      type: 'BOARD'
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

    const sortSquad = (squad: Player[]) => {
      const order: Record<PlayerPosition, number> = { GOL: 0, ZAG: 1, LD: 2, LE: 3, VOL: 4, MEI: 5, PON: 6, CA: 7 };
      return [...squad].sort((a, b) => order[a.position] - order[b.position]);
    };

    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        const newPlayer = { ...player, contractLocked: true };
        return {
          ...club,
          finances: club.finances - pricePaid,
          squad: sortSquad([...club.squad, newPlayer])
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
    nextSponsors[sponsor.type] = { ...sponsor, signedDivision: userClub.division };

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
    setSponsorAlert({ kind: 'SIGNED', sponsorName: sponsor.name, sponsorType: sponsor.type });

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, nextSponsors);
  };

  // Cancel sponsor contract with penalty (costs 2 weeks of payment)
  const cancelSponsor = (type: 'MASTER' | 'COSTAS' | 'MANGAS') => {
    if (!userClub) return;
    const active = activeSponsors[type];
    if (!active) return;

    const penalty = active.weeklyPayment * 2;
    if (userClub.finances < penalty) {
      alert('Finanças insuficientes para pagar a multa rescisória!');
      return;
    }

    const nextSponsors = { ...activeSponsors };
    nextSponsors[type] = null;

    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return { ...club, finances: club.finances - penalty };
      }
      return club;
    });

    setClubs(updatedClubs);
    setActiveSponsors(nextSponsors);

    setNews(prev => [...prev, {
      id: `spon_cancel_${Date.now()}`,
      week: currentRound,
      text: `Rescisão! O ${userClub.name} rescindiu o patrocínio da ${active.name} pagando R$ ${penalty.toLocaleString()} de multa.`,
      type: 'INFO'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, nextSponsors);
    alert('Contrato de patrocínio rescindido!');
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

  // Build premium VIP boxes -- a flat revenue bonus on every home match, separate from
  // and stackable with regular ticket income and capacity upgrades.
  const buildVipBoxes = () => {
    if (!userClub) return;

    if (userClub.hasVipBoxes) {
      alert('Seu estádio já tem camarotes VIP.');
      return;
    }
    if (userClub.vipBoxesWeeksLeft && userClub.vipBoxesWeeksLeft > 0) {
      alert('Os camarotes VIP já estão em construção.');
      return;
    }

    const costByDiv: Record<string, number> = { A: 4000000, B: 2000000, C: 1000000 };
    const cost = costByDiv[userClub.division] ?? 1000000;
    if (userClub.finances < cost) {
      alert('Finanças insuficientes para construir os camarotes VIP.');
      return;
    }

    const weeksLeft = 6;
    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return { ...club, finances: club.finances - cost, vipBoxesWeeksLeft: weeksLeft };
      }
      return club;
    });

    setClubs(updatedClubs);

    setNews(prev => [...prev, {
      id: `vip_start_${Date.now()}`,
      week: currentRound,
      text: `Obras iniciadas! Construção de camarotes VIP no ${userClub.stadiumName} vai levar ${weeksLeft} rodadas.`,
      type: 'INFO'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Request a bank loan for the user's club. Amount and term are validated against the
  // credit limit (Score Financeiro × last season's revenue) and the bank refuses outright
  // below a minimum score, or if too many past installments have gone late.
  const requestLoan = (amount: number, totalRounds: number, purpose: string) => {
    if (!userClub || !userClubId) return;

    const score = userClub.financialScore ?? 70;

    const bankEvent = getBankEventForYear(currentYear);
    const baseRate = getBaseInterestRate(score);
    const specialDiscount = bankEvent.specialLine && score >= 90 ? 0.002 : 0;
    const ratePerRound = Math.max(0.002, baseRate + bankEvent.rateModifier - specialDiscount);

    const outstandingDebt = (userClub.loans ?? []).reduce((sum, l) => sum + l.balance, 0);
    const availableCredit = getAvailableCredit(score, userClub.lastSeasonRevenue ?? 1000000, outstandingDebt);
    if (amount > availableCredit) {
      alert(`Limite de crédito insuficiente! Disponível: ${formatCurrency(Math.round(availableCredit))}.`);
      return;
    }

    const installment = calculateInstallment(amount, ratePerRound, totalRounds);
    const newLoan: Loan = {
      id: `loan_${Date.now()}`,
      principal: amount,
      balance: amount,
      ratePerRound,
      installment,
      totalRounds,
      roundsPaid: 0,
      lateStreak: 0,
      purpose,
      startedYear: currentYear
    };

    const updatedClubs = clubs.map(c => c.id === userClubId
      ? { ...c, finances: c.finances + amount, loans: [...(c.loans ?? []), newLoan] }
      : c);
    setClubs(updatedClubs);

    setNews(prev => [...prev, {
      id: `loan_taken_${newLoan.id}`,
      week: currentRound,
      text: `Empréstimo aprovado! O ${userClub.name} tomou ${formatCurrency(amount)} do banco para ${purpose.toLowerCase()}, em ${totalRounds} parcelas de ${formatCurrency(Math.round(installment))}.`,
      type: 'INFO'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Pays off a loan's remaining balance early, at a 40% discount on the interest that would
  // still have been charged over the rest of the term.
  const payOffLoanEarly = (loanId: string) => {
    if (!userClub || !userClubId) return;
    const loan = (userClub.loans ?? []).find(l => l.id === loanId);
    if (!loan) return;

    const payoffAmount = calculatePayoffAmount(loan);
    if (userClub.finances < payoffAmount) {
      alert(`Caixa insuficiente para quitar! Necessário: ${formatCurrency(payoffAmount)}.`);
      return;
    }

    const updatedClubs = clubs.map(c => c.id === userClubId
      ? {
          ...c,
          finances: c.finances - payoffAmount,
          loans: (c.loans ?? []).filter(l => l.id !== loanId),
          financialScore: Math.min(100, (c.financialScore ?? 70) + 4)
        }
      : c);
    setClubs(updatedClubs);

    setNews(prev => [...prev, {
      id: `loan_payoff_${loanId}`,
      week: currentRound,
      text: `Empréstimo quitado antecipadamente por ${formatCurrency(payoffAmount)}! Seu Score Financeiro melhorou.`,
      type: 'INFO'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Renegotiates a loan that's fallen 2+ installments behind: longer term, higher rate, lower
  // installment -- a lifeline that costs more overall but eases the immediate cash crunch.
  const renegotiateLoanAction = (loanId: string) => {
    if (!userClub || !userClubId) return;
    const loan = (userClub.loans ?? []).find(l => l.id === loanId);
    if (!loan) return;
    if (loan.lateStreak < 2) {
      alert('A renegociação só fica disponível depois de 2 parcelas atrasadas seguidas.');
      return;
    }

    const renegotiated = renegotiateLoanCalc(loan);
    const updatedClubs = clubs.map(c => c.id === userClubId
      ? { ...c, loans: (c.loans ?? []).map(l => l.id === loanId ? renegotiated : l) }
      : c);
    setClubs(updatedClubs);

    setNews(prev => [...prev, {
      id: `loan_renegotiated_${loanId}_${currentRound}`,
      week: currentRound,
      text: `Empréstimo renegociado com o banco: prazo estendido e parcela reduzida para ${formatCurrency(Math.round(renegotiated.installment))}.`,
      type: 'INFO'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
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
    const divisions: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    
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
    const newCup = startCup(updatedClubs, currentYear + 1, lastSeasonTopSerieA);
    setCupState(newCup);
    setOffers([]);
    setStadiumUpgrade(null);
    setActiveSponsors({ MASTER: null, COSTAS: null, MANGAS: null }); // Clear sponsorships for new club

    const nextNews: NewsItem[] = [
      { id: `job_accept_${Date.now()}`, week: 0, text: `Nova Era! ${managerName} assumiu oficialmente o comando técnico do ${newClub.name}! Boa sorte na Série ${newClub.division}!`, type: 'BOARD' }
    ];
    const bankEvent = getBankEventForYear(currentYear + 1);
    if (bankEvent.label) {
      nextNews.push({ id: `bank_event_${currentYear + 1}`, week: 0, text: bankEvent.label, type: 'INFO' });
    }
    if (newCup.oitavasSeeds.includes(clubId)) {
      nextNews.push({ id: `cup_seed_${currentYear + 1}`, week: 0, text: `Copa do Brasil: como um dos melhores colocados da Série A na temporada passada, o ${newClub.name} entra direto nas Oitavas de Final, sem disputar Fase 0, 1ª e 2ª Fase!`, type: 'BOARD' });
    } else if (newCup.fase1ByeClubIds.includes(clubId)) {
      nextNews.push({ id: `cup_bye_${currentYear + 1}`, week: 0, text: `Copa do Brasil: o ${newClub.name} está entre os melhores fora dos classificados diretos e ganhou um bye, entrando direto na 1ª Fase.`, type: 'INFO' });
    }
    setNews(nextNews);
    setGameState('PLAYING');

    saveGame('PLAYING', managerName, currentYear + 1, 1, updatedClubs, clubId, newSchedule, marketPlayers, [], nextNews, history, null, { MASTER: null, COSTAS: null, MANGAS: null });
  };

  // Stay at the current club for another year
  const stayAtClub = () => {
    // Regenerate schedule for next year
    let updatedClubs = clubs.map(c => {
      const tvMoney = c.division === 'A' ? 8000000 : c.division === 'B' ? 2000000 : 500000;
      return {
        ...c,
        finances: c.finances + tvMoney
      };
    });
    setClubs(updatedClubs);
    const newSchedule: LeagueMatch[] = [];
    const divisions: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    
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
    const newCup = startCup(updatedClubs, currentYear + 1, lastSeasonTopSerieA);
    setCupState(newCup);
    setOffers([]);

    const userClubInstance = clubs.find(c => c.id === userClubId)!;
    const tvPay = userClubInstance.division === 'A' ? 8000000 : userClubInstance.division === 'B' ? 2000000 : userClubInstance.division === 'C' ? 500000 : 100000;
    const nextNews: NewsItem[] = [
      { id: `renew_${Date.now()}`, week: 0, text: `Contrato renovado! ${managerName} confirmou que permanece no ${userClubInstance.name} por mais uma temporada!`, type: 'BOARD' },
      { id: `tv_pay_${Date.now()}`, week: 0, text: `Cotas de TV pagas! O ${userClubInstance.name} recebeu R$ ${tvPay.toLocaleString()} pelos direitos de transmissão da Série ${userClubInstance.division}.`, type: 'INFO' }
    ];
    const bankEvent = getBankEventForYear(currentYear + 1);
    if (bankEvent.label) {
      nextNews.push({ id: `bank_event_${currentYear + 1}`, week: 0, text: bankEvent.label, type: 'INFO' });
    }

    // Promotion mid-contract earns the club a considerably richer sponsorship -- the deal
    // was priced for the old, lower division and a real sponsor would renegotiate up rather
    // than keep paying Série C rates once the club is playing (and being watched) in Série A.
    const nextSponsors = { ...activeSponsors };
    (Object.keys(nextSponsors) as Array<'MASTER' | 'COSTAS' | 'MANGAS'>).forEach(key => {
      const sp = nextSponsors[key];
      if (!sp || !sp.signedDivision || sp.signedDivision === userClubInstance.division) return;
      const oldMult = SPONSOR_DIVISION_MULTIPLIER[sp.signedDivision];
      const newMult = SPONSOR_DIVISION_MULTIPLIER[userClubInstance.division];
      if (newMult <= oldMult) return; // only bump on promotion, never cut an existing deal on relegation
      const scaledPayment = Math.round(sp.weeklyPayment * (newMult / oldMult));
      nextSponsors[key] = { ...sp, weeklyPayment: scaledPayment, signedDivision: userClubInstance.division };
      nextNews.push({ id: `sponsor_boost_${key}_${Date.now()}`, week: 0, text: `Acesso de Série! O patrocinador ${sp.name} renegociou o contrato após o acesso -- pagamento semanal subiu para ${formatCurrency(scaledPayment)}.`, type: 'INFO' });
    });

    if (newCup.oitavasSeeds.includes(userClubId)) {
      nextNews.push({ id: `cup_seed_${currentYear + 1}`, week: 0, text: `Copa do Brasil: como um dos melhores colocados da Série A na temporada passada, o ${userClubInstance.name} entra direto nas Oitavas de Final, sem disputar Fase 0, 1ª e 2ª Fase!`, type: 'BOARD' });
    } else if (newCup.fase1ByeClubIds.includes(userClubId)) {
      nextNews.push({ id: `cup_bye_${currentYear + 1}`, week: 0, text: `Copa do Brasil: o ${userClubInstance.name} está entre os melhores fora dos classificados diretos e ganhou um bye, entrando direto na 1ª Fase.`, type: 'INFO' });
    }

    setActiveSponsors(nextSponsors);
    setNews(nextNews);
    setGameState('PLAYING');

    saveGame('PLAYING', managerName, currentYear + 1, 1, updatedClubs, userClubId, newSchedule, marketPlayers, [], nextNews, history, stadiumUpgrade, nextSponsors);
  };

  // Manager voluntarily leaves the current club mid-season, becoming a free agent until a
  // club makes an offer. The former club stays in the league, simulated by the AI from here on.
  const requestResignation = () => {
    if (!userClub) return;
    const leftClubName = userClub.name;
    setFormerClubName(leftClubName);
    setClubs(prev => prev.map(c => c.id === userClubId ? { ...c, isPlayerClub: false } : c));
    setUserClubId('');
    setOffers([]);
    const nextNews: NewsItem[] = [
      { id: `resign_${Date.now()}`, week: currentRound, text: `${managerName} pediu demissão do ${leftClubName} e está no mercado à procura de um novo clube.`, type: 'BOARD' }
    ];
    setNews(prev => [...prev, ...nextNews]);
    setGameState('UNEMPLOYED');
    saveGame('UNEMPLOYED', managerName, currentYear, currentRound, clubs.map(c => c.id === userClubId ? { ...c, isPlayerClub: false } : c), '', schedule, marketPlayers, [], [...news, ...nextNews], history, stadiumUpgrade, activeSponsors);
  };

  // Advances one round while unemployed: every match in the league is simulated bot-vs-bot
  // (no live match to watch, since the manager has no club), and there's a chance a club comes
  // in with an offer -- weighted toward whichever division this manager has the most experience
  // coaching in, mirroring how real clubs court managers with a track record at their level.
  const simulateUnemployedRound = () => {
    const updatedSchedule = schedule.map(match => {
      if (match.round !== currentRound) return match;
      const home = clubs.find(c => c.id === match.homeId);
      const away = clubs.find(c => c.id === match.awayId);
      if (!home || !away) return match;
      const result = simulateMatch(home, away);
      return { ...match, simulated: true, result };
    });
    setSchedule(updatedSchedule);
    const nextRoundNum = currentRound + 1;
    setCurrentRound(nextRoundNum);

    // Roll for a job offer. Chance and division weighting scale with experience.
    const exp = divisionExperienceRef.current;
    const totalExp = exp.A + exp.B + exp.C;
    const weights: Record<'A' | 'B' | 'C', number> = totalExp > 0
      ? { A: 5 + exp.A, B: 5 + exp.B, C: 5 + exp.C }
      : { A: 5, B: 6, C: 7 };

    const nextNews: NewsItem[] = [];
    let nextOffers = offers;
    if (Math.random() < 0.35) {
      const divisions: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
      const totalWeight = weights.A + weights.B + weights.C;
      let roll = Math.random() * totalWeight;
      let chosenDiv: 'A' | 'B' | 'C' = 'C';
      for (const div of divisions) {
        if (roll < weights[div]) { chosenDiv = div; break; }
        roll -= weights[div];
      }
      const candidates = clubs.filter(c => c.division === chosenDiv && !offers.some(o => o.clubId === c.id));
      const chosenClub = candidates[Math.floor(Math.random() * candidates.length)];
      if (chosenClub) {
        const newOffer: JobOffer = { clubId: chosenClub.id, clubName: chosenClub.name, division: chosenClub.division, salaryBonus: 0 };
        nextOffers = [...offers, newOffer];
        setOffers(nextOffers);
        nextNews.push({ id: `unemp_offer_${Date.now()}`, week: nextRoundNum, text: `Proposta recebida! O ${chosenClub.name} (Série ${chosenClub.division}) quer contratar ${managerName}.`, type: 'OFFER' });
      }
    }
    if (nextNews.length > 0) setNews(prev => [...prev, ...nextNews]);

    saveGame('UNEMPLOYED', managerName, currentYear, nextRoundNum, clubs, '', updatedSchedule, marketPlayers, nextOffers, [...news, ...nextNews], history, stadiumUpgrade, activeSponsors);
  };

  // Accepts a job offer received while unemployed, taking over the new club immediately
  // (mid-season, unlike acceptJobOffer which only runs at the season/schedule boundary).
  const acceptMidSeasonJobOffer = (clubId: string) => {
    const newClub = clubs.find(c => c.id === clubId);
    if (!newClub) return;
    const updatedClubs = clubs.map(c => c.id === clubId ? { ...c, isPlayerClub: true, confidence: 70 } : c);
    setClubs(updatedClubs);
    setUserClubId(clubId);
    setOffers([]);
    setFormerClubName('');
    const nextNews: NewsItem[] = [
      { id: `midseason_hire_${Date.now()}`, week: currentRound, text: `Nova Era! ${managerName} assumiu o comando técnico do ${newClub.name}! Boa sorte na Série ${newClub.division}!`, type: 'BOARD' }
    ];
    setNews(prev => [...prev, ...nextNews]);
    setGameState('PLAYING');
    saveGame('PLAYING', managerName, currentYear, currentRound, updatedClubs, clubId, schedule, marketPlayers, [], [...news, ...nextNews], history, stadiumUpgrade, activeSponsors);
  };

  // Reset/delete save game
  const resetGame = () => {
    if (currentSlotRef.current) {
      localStorage.removeItem(`elifoot_2026_save_slot_${currentSlotRef.current}`);
    }
    setActiveSlot(null);
    setGameState('MENU');
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
    setCupState(null);
    setForeignMarketPlayers([]);
    setBoughtForeignIds([]);
  };

  const clearCurrentMatch = () => {
    if (currentMatch && currentMatchResult) {
      if (currentMatch.division === 'CUP') {
        resolveCupUserLeg(currentMatch, currentMatchResult);
      } else {
        // nextRound() commits a match result to `schedule` (for the points table/finances/etc.)
        // the instant "Iniciar Partida" is clicked, before the user has made any live substitutions.
        // If a mid-match substitution later changed the outcome, resimulateMidMatch only ever
        // updated currentMatchResult (the live view) -- schedule kept the stale, pre-substitution
        // score, so the points table and the "other matches" board (both read from `schedule`)
        // could visibly disagree with what actually happened live. Sync the final live result back
        // into schedule here so both agree with what the user actually watched play out.
        setSchedule(prev => prev.map(m =>
          m.round === currentMatch.round && m.homeId === currentMatch.homeId && m.awayId === currentMatch.awayId
            ? { ...m, result: currentMatchResult }
            : m
        ));
        processCupMilestone(currentMatch.round);
      }
    }
    setCurrentMatch(null);
    setCurrentMatchResult(null);
    if (gameState === 'MATCH_DAY') {
      setGameState(pendingGameStateRef.current);
    }
  };

  // --- Copa Mata-Mata (cup) integration -------------------------------------------------
  // A 60-team knockout bracket (one entry per club in the game) that runs alongside the
  // league season. Every tie the user isn't personally part of is simulated instantly; their
  // own tie is played live through the normal match engine (see startCupMatch/resolveCupUserLeg),
  // gating the next league round until it's resolved -- exactly the "extra midweek fixture,
  // less rest" rhythm real football has. See src/utils/cupEngine.ts for the bracket rules.

  const applyCupPrize = (clubsList: Club[], clubId: string, amount: number): Club[] => {
    if (amount <= 0) return clubsList;
    return clubsList.map(c => (c.id === clubId ? { ...c, finances: c.finances + amount } : c));
  };

  // Wraps up whichever phase just fully resolved (every tie in it, including the user's own if
  // they were involved) -- pays the "reached the next stage" prize money, merges Fase 1's direct
  // qualifiers back in after Fase 2, and hands off to the next phase (or crowns a champion).
  const finalizeCupPhase = (
    cup: CupState,
    phase: CupPhase,
    clubsList: Club[],
    pushNews: (item: NewsItem) => void
  ): { nextCup: CupState; nextClubs: Club[] } => {
    let nextClubs = clubsList;
    const phaseTies = cup.history.filter(t => t.phase === phase);
    const winners = phaseTies.map(t => t.winnerId);
    const nextCup: CupState = { ...cup, userTie: null, pendingSecondLeg: null };
    const nameOf = (id: string) => clubsList.find(c => c.id === id)?.name ?? id;

    if (phase === 'FASE0') {
      nextCup.aliveClubIds = [...winners, ...cup.fase1ByeClubIds];
      nextCup.fase1ByeClubIds = [];
      nextCup.phaseIndex = 1;
    } else if (phase === 'FASE1') {
      winners.forEach(w => { nextClubs = applyCupPrize(nextClubs, w, CUP_PRIZE_FOR_REACHING.FASE2); });
      nextCup.aliveClubIds = winners;
      nextCup.phaseIndex = 2;
    } else if (phase === 'FASE2') {
      winners.forEach(w => { nextClubs = applyCupPrize(nextClubs, w, CUP_PRIZE_FOR_REACHING.OITAVAS); });
      nextCup.aliveClubIds = [...winners, ...cup.oitavasSeeds];
      nextCup.oitavasSeeds = [];
      nextCup.phaseIndex = 3;
    } else if (phase === 'OITAVAS') {
      winners.forEach(w => { nextClubs = applyCupPrize(nextClubs, w, CUP_PRIZE_FOR_REACHING.QUARTAS); });
      nextCup.aliveClubIds = winners;
      nextCup.phaseIndex = 4;
    } else if (phase === 'QUARTAS') {
      winners.forEach(w => { nextClubs = applyCupPrize(nextClubs, w, CUP_PRIZE_FOR_REACHING.SEMI); });
      nextCup.aliveClubIds = winners;
      nextCup.phaseIndex = 5;
    } else if (phase === 'SEMI') {
      nextCup.aliveClubIds = winners;
      nextCup.phaseIndex = 6;
    } else {
      const championId = winners[0];
      nextClubs = applyCupPrize(nextClubs, championId, CUP_CHAMPION_PRIZE);
      nextCup.championId = championId;
      nextCup.phaseIndex = PHASES.length;
      const topScorers = getCupTopScorers(nextCup);
      if (topScorers.length > 0) {
        const share = CUP_TOP_SCORER_BONUS / topScorers.length;
        topScorers.forEach(s => { nextClubs = applyCupPrize(nextClubs, s.clubId, share); });
      }
      pushNews({
        id: `cup_champion_${Date.now()}`,
        week: currentRound,
        text: championId === userClubId
          ? `🏆 CAMPEÃO DA COPA! Seu time conquistou a Copa do Brasil e faturou ${formatCurrency(CUP_CHAMPION_PRIZE)}!`
          : `A Copa do Brasil terminou com o título para o ${nameOf(championId)}.`,
        type: 'BOARD'
      });
    }

    return { nextCup, nextClubs };
  };

  // Called right after a LEAGUE match ends -- checks whether that round is one of the cup's
  // scheduled milestones and, if so, draws the phase's ties. Every tie except the user's own is
  // resolved immediately; the user's is left pending for them to play live (or, if they have no
  // pairing this phase -- already eliminated, or sitting out Fase 2 as a direct qualifier --
  // the whole phase is finalized right away with no interstitial).
  const processCupMilestone = (finishedRound: number) => {
    const cup = cupStateRef.current;
    if (!cup || cup.phaseIndex >= PHASES.length) return;
    const expectedRound = CUP_MILESTONE_ROUNDS[cup.milestonesConsumed];
    if (expectedRound !== finishedRound) return;

    const phase = PHASES[cup.phaseIndex];
    const pushNews = (item: NewsItem) => setNews(prev => [...prev, item]);

    // Returning for leg 2 of a two-legged tie the user already played leg 1 of -- move it from
    // pendingSecondLeg into userTie now, exactly on schedule, so the fixture card only appears
    // once this round's league match has actually happened (not the instant leg 1 finished).
    if (cup.pendingSecondLeg) {
      setCupState({ ...cup, userTie: cup.pendingSecondLeg, pendingSecondLeg: null, milestonesConsumed: cup.milestonesConsumed + 1 });
      return;
    }

    const pairs = drawPhaseTies(cup.aliveClubIds);
    const userPair = pairs.find(p => p.homeId === userClubId || p.awayId === userClubId);

    const working: CupState = {
      ...cup,
      history: [...cup.history],
      scorers: { ...cup.scorers },
      eliminatedClubIds: [...cup.eliminatedClubIds],
      milestonesConsumed: cup.milestonesConsumed + 1
    };
    pairs.filter(p => p !== userPair).forEach(p => {
      simulateFullTie(working, phase, p.homeId, p.awayId, clubs);
    });

    if (userPair) {
      working.userTie = { homeId: userPair.homeId, awayId: userPair.awayId, legs: [] };
      setCupState(working);
      const opponentId = userPair.homeId === userClubId ? userPair.awayId : userPair.homeId;
      setCupDrawReveal({ phase, opponentId, isHome: userPair.homeId === userClubId });
      pushNews({
        id: `cup_draw_${Date.now()}`,
        week: currentRound,
        text: `Copa do Brasil ${CUP_PHASE_LABEL[phase]}: seu time enfrenta o ${clubs.find(c => c.id === opponentId)?.name ?? '???'}!`,
        type: 'MATCH'
      });
      return;
    }

    const { nextCup, nextClubs } = finalizeCupPhase(working, phase, clubs, pushNews);
    setCupState(nextCup);
    setClubs(nextClubs);
  };

  // Kicks off the live view for the user's own pending cup tie -- either the first leg/single
  // match, or leg 2 (home venue flips) if leg 1 is already done. Mirrors nextRoundImpl's kickoff
  // but reuses the exact same currentMatch/currentMatchResult/MATCH_DAY machinery the league
  // already has, so the whole live-match experience (ticking, subs, penalties, VAR, sound) works
  // unchanged for a cup fixture.
  const startCupMatch = (playerStarters: Player[]) => {
    const cup = cupStateRef.current;
    if (!cup || !cup.userTie || !userClub) return;
    const isSecondLeg = cup.userTie.legs.length === 1;
    const homeId = isSecondLeg ? cup.userTie.awayId : cup.userTie.homeId;
    const awayId = isSecondLeg ? cup.userTie.homeId : cup.userTie.awayId;
    const homeClubObj = clubs.find(c => c.id === homeId);
    const awayClubObj = clubs.find(c => c.id === awayId);
    if (!homeClubObj || !awayClubObj) return;

    const isHome = homeId === userClubId;
    const result = isHome
      ? simulateMatch(homeClubObj, awayClubObj, playerStarters, getAutoStarters(awayClubObj))
      : simulateMatch(homeClubObj, awayClubObj, getAutoStarters(homeClubObj), playerStarters);

    setCurrentMatch({ round: currentRound, homeId, awayId, division: 'CUP', simulated: true, result });
    setCurrentMatchResult(result);
    pendingGameStateRef.current = 'PLAYING'; // a cup match never itself triggers season-end/sacking
    setGameState('MATCH_DAY');
  };

  // Called from clearCurrentMatch once the user's own cup leg finishes playing live.
  const resolveCupUserLeg = (matchFixture: LeagueMatch, result: MatchResult) => {
    const cup = cupStateRef.current;
    if (!cup || !cup.userTie) return;
    const userTie = cup.userTie;
    const phase = PHASES[cup.phaseIndex];
    const leg: CupTieLeg = { ...result, homeId: matchFixture.homeId, awayId: matchFixture.awayId };
    const legs = [...userTie.legs, leg];

    if (TWO_LEGGED_PHASES.includes(phase) && legs.length < 2) {
      // Leg 1 done -- hide the fixture (clear userTie) and hold the result in pendingSecondLeg
      // until leg 2's own later milestone round actually arrives (see processCupMilestone).
      setCupState({ ...cup, userTie: null, pendingSecondLeg: { ...userTie, legs } });
      return;
    }

    const homeClubObj = clubs.find(c => c.id === userTie.homeId)!;
    const awayClubObj = clubs.find(c => c.id === userTie.awayId)!;

    let aggHome = 0;
    let aggAway = 0;
    legs.forEach(l => {
      if (l.homeId === userTie.homeId) { aggHome += l.homeScore; aggAway += l.awayScore; }
      else { aggHome += l.awayScore; aggAway += l.homeScore; }
    });

    if (aggHome === aggAway) {
      // Tied on aggregate -- hand off to the live, kick-by-kick shootout modal instead of
      // resolving it instantly. finishCupTieResolution (below) picks up once it's decided.
      setPenaltyShootout({
        phase,
        homeId: userTie.homeId,
        awayId: userTie.awayId,
        homeClubName: homeClubObj.name,
        awayClubName: awayClubObj.name,
        homeTakers: pickShootoutTakers(homeClubObj),
        awayTakers: pickShootoutTakers(awayClubObj),
        kicks: [],
        homeGoals: 0,
        awayGoals: 0,
        homeKicksTaken: 0,
        awayKicksTaken: 0,
        decided: false,
        legs
      });
      return;
    }

    finishCupTieResolution(cup, phase, userTie.homeId, userTie.awayId, homeClubObj, awayClubObj, legs);
  };

  // Shared tail end of resolving the user's own cup tie -- whether it was decided in normal time
  // (called directly from resolveCupUserLeg) or via the live shootout (called from
  // takePenaltyShootoutKick once the shootout is decided).
  const finishCupTieResolution = (
    cup: CupState,
    phase: CupPhase,
    homeId: string,
    awayId: string,
    homeClubObj: Club,
    awayClubObj: Club,
    legs: CupTieLeg[],
    forcedShootout?: { homeGoals: number; awayGoals: number; homeWins: boolean }
  ) => {
    const pushNews = (item: NewsItem) => setNews(prev => [...prev, item]);
    const working: CupState = {
      ...cup,
      history: [...cup.history],
      scorers: { ...cup.scorers },
      eliminatedClubIds: [...cup.eliminatedClubIds]
    };
    const tie = resolveTie(working, phase, homeId, awayId, homeClubObj, awayClubObj, legs, forcedShootout);

    const userWon = tie.winnerId === userClubId;
    pushNews({
      id: `cup_result_${Date.now()}`,
      week: currentRound,
      text: userWon
        ? `Copa ${CUP_PHASE_LABEL[phase]}: vitória! Seu time avança na competição${tie.wentToPenalties ? ' nos pênaltis' : ''}.`
        : `Copa ${CUP_PHASE_LABEL[phase]}: eliminado! Seu time está fora da Copa${tie.wentToPenalties ? ' nos pênaltis' : ''}.`,
      type: 'MATCH'
    });

    const { nextCup, nextClubs } = finalizeCupPhase(working, phase, clubs, pushNews);
    setCupState(nextCup);
    setClubs(nextClubs);
  };

  // Takes exactly one kick of the live shootout and re-checks whether it's now decided, using
  // the real early-finish rule (stop the instant the trailing side mathematically can't catch
  // up, e.g. 4-1 after 8 kicks -- not always playing out all 10). The UI calls this on a timer,
  // one kick at a time, so the manager watches it unfold instead of an instant reveal.
  const takePenaltyShootoutKick = () => {
    const shootout = penaltyShootoutRef.current;
    if (!shootout || shootout.decided) return;

    const side: 'home' | 'away' = shootout.homeKicksTaken === shootout.awayKicksTaken ? 'home' : 'away';
    const takers = side === 'home' ? shootout.homeTakers : shootout.awayTakers;
    const kicksTaken = side === 'home' ? shootout.homeKicksTaken : shootout.awayKicksTaken;
    const taker = takers[kicksTaken % takers.length];
    const scored = resolvePenaltyOutcome(taker.rating, taker.energy, side === 'home').scored;

    const homeGoals = shootout.homeGoals + (side === 'home' && scored ? 1 : 0);
    const awayGoals = shootout.awayGoals + (side === 'away' && scored ? 1 : 0);
    const homeKicksTaken = shootout.homeKicksTaken + (side === 'home' ? 1 : 0);
    const awayKicksTaken = shootout.awayKicksTaken + (side === 'away' ? 1 : 0);

    // Real shootout rule: decided the instant the trailing side can no longer catch up within
    // the remaining kicks of the initial best-of-5, OR (past round 5) as soon as scores differ
    // once both sides have taken the same number of kicks (sudden death, one kick each).
    const homeRemaining = Math.max(0, 5 - homeKicksTaken);
    const awayRemaining = Math.max(0, 5 - awayKicksTaken);
    let decided = false;
    if (homeGoals > awayGoals + awayRemaining) decided = true;
    else if (awayGoals > homeGoals + homeRemaining) decided = true;
    else if (homeKicksTaken >= 5 && homeKicksTaken === awayKicksTaken && homeGoals !== awayGoals) decided = true;

    setPenaltyShootout({
      ...shootout,
      kicks: [...shootout.kicks, { side, playerName: taker.name, scored }],
      homeGoals,
      awayGoals,
      homeKicksTaken,
      awayKicksTaken,
      decided
    });
  };

  // Called once the shootout modal has revealed the decisive kick and the user dismisses it --
  // applies the real outcome to the cup bracket and clears the shootout state.
  const finalizePenaltyShootout = () => {
    const shootout = penaltyShootoutRef.current;
    const cup = cupStateRef.current;
    if (!shootout || !cup) return;
    const homeClubObj = clubs.find(c => c.id === shootout.homeId);
    const awayClubObj = clubs.find(c => c.id === shootout.awayId);
    if (!homeClubObj || !awayClubObj) { setPenaltyShootout(null); return; }
    finishCupTieResolution(cup, shootout.phase, shootout.homeId, shootout.awayId, homeClubObj, awayClubObj, shootout.legs, {
      homeGoals: shootout.homeGoals,
      awayGoals: shootout.awayGoals,
      homeWins: shootout.homeGoals > shootout.awayGoals
    });
    setPenaltyShootout(null);
  };

  // Re-simulates the rest of an in-progress match after the user makes a mid-match
  // substitution. The original single-shot simulation has no idea a substitution happened --
  // it already generated all 90 minutes of events upfront from the starting XI -- so without
  // this, a "substituted out" player could still show up scoring or picking up cards later in
  // the same match. Events/score/stats up to fromMinute are frozen exactly as already shown;
  // only the remaining minutes are (re)computed with the updated lineup.
  const resimulateMidMatch = (updatedUserStarters: Player[], fromMinute: number, priorEventsOverride?: MatchEvent[]) => {
    if (!currentMatch || !currentMatchResult || !userClubId) return;
    const isHome = currentMatch.homeId === userClubId;
    const homeClubObj = clubs.find(c => c.id === currentMatch.homeId);
    const awayClubObj = clubs.find(c => c.id === currentMatch.awayId);
    if (!homeClubObj || !awayClubObj) return;
    const opponent = isHome ? awayClubObj : homeClubObj;

    const priorEvents = priorEventsOverride ?? currentMatchResult.events.filter(e => e.minute <= fromMinute);
    const priorRedCardedNames = new Set(priorEvents.filter(e => e.type === 'RED').map(e => e.player));
    const priorYellowNames = new Set(priorEvents.filter(e => e.type === 'YELLOW').map(e => e.player));

    const userStarters = updatedUserStarters.filter(p => !priorRedCardedNames.has(p.name));
    const opponentStarters = getAutoStarters(opponent).filter(p => !priorRedCardedNames.has(p.name));

    const priorYellowCardCounts: Record<string, number> = {};
    [...userStarters, ...opponentStarters].forEach(p => {
      if (priorYellowNames.has(p.name)) priorYellowCardCounts[p.id] = 1;
    });

    const homeStarters = isHome ? userStarters : opponentStarters;
    const awayStarters = isHome ? opponentStarters : userStarters;

    // Score to resume from is counted directly off the events that actually happened up to
    // fromMinute -- currentMatchResult.homeScore/awayScore is the FINAL tally of the original,
    // now-discarded full-match simulation, which already includes goals scored after fromMinute
    // that never happened live, so using it here would double count them.
    const homeScoreSoFar = priorEvents.filter(e => e.type === 'GOAL' && e.clubId === homeClubObj.id).length;
    const awayScoreSoFar = priorEvents.filter(e => e.type === 'GOAL' && e.clubId === awayClubObj.id).length;

    const result = simulateMatch(homeClubObj, awayClubObj, homeStarters, awayStarters, {
      startMinute: fromMinute + 1,
      initialHomeScore: homeScoreSoFar,
      initialAwayScore: awayScoreSoFar,
      initialHomeStats: currentMatchResult.homeStats,
      initialAwayStats: currentMatchResult.awayStats,
      priorEvents,
      priorYellowCardCounts
    });

    setCurrentMatchResult(result);
  };

  // Resolve a penalty for the user's team once the manager has picked who takes it live (the
  // "escolher batedor" modal), overriding whatever taker/outcome the original one-shot
  // simulation had pre-baked for that minute, then re-simulates the rest of the match so the
  // corrected outcome carries forward consistently (score, and any knock-on event odds).
  const resolveMidMatchPenalty = (takerId: string, minute: number, currentUserStarters: Player[]): MatchEvent | null => {
    if (!currentMatch || !currentMatchResult || !userClubId) return null;
    const isHome = currentMatch.homeId === userClubId;
    const userClubObj = clubs.find(c => c.id === userClubId);
    const taker = userClubObj?.squad.find(p => p.id === takerId);
    if (!taker) return null;

    const { scored, saved } = resolvePenaltyOutcome(taker.rating, taker.energy, isHome);
    const type: MatchEvent['type'] = scored ? 'GOAL' : saved ? 'SHOT_SAVED' : 'MISS';
    const description = scored
      ? `Pênalti! ${taker.name} cobra e converte em gol!`
      : saved
      ? `Pênalti! ${taker.name} cobra, mas o goleiro defende!`
      : `Pênalti! ${taker.name} cobra e manda a bola para fora!`;
    const newEvent: MatchEvent = { minute, type, player: taker.name, clubId: userClubId, description, isPenalty: true };

    const originalSpecial = currentMatchResult.events.find(e => e.minute === minute && e.isPenalty);
    const priorEvents = currentMatchResult.events
      .filter(e => e.minute <= minute && e !== originalSpecial)
      .concat(newEvent);

    resimulateMidMatch(currentUserStarters, minute, priorEvents);
    return newEvent;
  };

  // Renew player contract. Renewing always makes the player happier (clears dissatisfaction,
  // small rating bump) and always locks the player for the renewed term -- while locked, they
  // cannot be sold, cannot request to leave, and no other club can make an offer for them.
  // A player already locked can't be renewed again until the current lock runs out (see the
  // contractLocked check below and the disabled renew buttons in App.tsx) -- otherwise the +2
  // rating bump could be farmed indefinitely by spam-clicking renew on the same player.
  const renewContract = (playerId: string, duration: '6M' | '1Y' | '2Y') => {
    if (!userClubId) return;
    const addedWeeks = duration === '6M' ? 19 : duration === '1Y' ? 38 : 76;
    const lockYears = duration === '2Y' ? 2 : duration === '1Y' ? 1 : 0.5;
    const updatedClubs = clubs.map(c => {
      if (c.id !== userClubId) return c;
      const updatedSquad = c.squad.map(p => {
        if (p.id !== playerId || p.contractLocked) return p;
        const currentW = p.contractWeeks ?? 38;
        const rating = Math.min(99, p.rating + 2);
        const group = getPositionGroup(p.position);
        const ageFactor = p.age < 24 ? 1.3 : p.age > 30 ? 0.7 : 1.0;
        const posFactor = group === 'FW' ? 1.2 : group === 'GK' ? 0.9 : 1.0;
        const valBase = Math.pow(rating - 30, 2.5) * 800;
        const value = Math.max(10000, Math.round(valBase * ageFactor * posFactor));
        const salary = Math.round(value * 0.005);
        return {
          ...p,
          contractWeeks: currentW + addedWeeks,
          contractLocked: true,
          contractLockYears: lockYears,
          rating, value, salary,
          benchRounds: 0,
          // Renewing lifts morale -- a temporary effective-rating boost for his next 2 matches
          // (5-10%), on top of the permanent +2 above.
          renewalBoostMatchesLeft: 2,
          renewalBoostPercent: 0.05 + Math.random() * 0.05
        };
      });
      return { ...c, squad: updatedSquad };
    });
    setClubs(updatedClubs);
    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Accept an incoming purchase proposal from another club for a user's player. buyerClubName
  // is passed explicitly (rather than looked up from `clubs`) because the buyer may be a
  // foreign club that isn't part of the simulated league pool at all.
  const acceptIncomingProposal = (player: Player, buyerClubId: string, amount: number, buyerClubName: string) => {
    if (!userClub) return;

    if (userClub.squad.length <= MIN_SQUAD_SIZE) {
      alert(`Elenco muito reduzido! Você precisa manter pelo menos ${MIN_SQUAD_SIZE} jogadores no elenco (11 titulares + 5 reservas).`);
      return;
    }

    const squadAfterSale = userClub.squad.filter(p => p.id !== player.id);
    const violation = findDepthViolation(squadAfterSale, player.position);
    if (violation) {
      alert(`Impossível vender! O elenco precisa manter pelo menos ${violation.min} jogador(es) de ${violation.pos}.`);
      return;
    }

    // Process the transfer
    const updatedClubs = clubs.map(club => {
      if (club.id === userClubId) {
        return {
          ...club,
          finances: club.finances + amount,
          squad: club.squad.filter(p => p.id !== player.id)
        };
      }
      if (club.id === buyerClubId) {
        // Add player to buyer club
        const newP = { ...player, contractLocked: true, benchRounds: 0 };
        return {
          ...club,
          finances: Math.max(0, club.finances - amount),
          squad: [...club.squad, newP]
        };
      }
      return club;
    });

    setClubs(updatedClubs);

    setNews(prev => [...prev, {
      id: `prop_sold_${Date.now()}`,
      week: currentRound,
      text: `Transferência! O ${buyerClubName} contratou ${player.name} do ${userClub.name} por ${formatCurrency(amount)} após aceitação da proposta!`,
      type: 'TRANSFER'
    }]);

    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  const manualSave = () => {
    saveGame(gameState, managerName, currentYear, currentRound, clubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
    alert('Jogo salvo com sucesso!');
  };

  // Update the user club's ticket price by delta (min R$5, max R$500)
  const updateTicketPrice = (delta: number) => {
    if (!userClubId) return;
    const updatedClubs = clubs.map(c => {
      if (c.id !== userClubId) return c;
      const newPrice = Math.max(5, Math.min(500, c.ticketPrice + delta));
      return { ...c, ticketPrice: newPrice };
    });
    setClubs(updatedClubs);
    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Update the user club's VIP box price by delta (min R$20, max 4x the division baseline)
  const updateVipPrice = (delta: number) => {
    if (!userClubId || !userClub) return;
    const basePrice = VIP_BASE_PRICE_BY_DIV[userClub.division] ?? 200;
    const updatedClubs = clubs.map(c => {
      if (c.id !== userClubId) return c;
      const current = c.vipTicketPrice ?? basePrice;
      const newPrice = Math.max(20, Math.min(basePrice * 4, current + delta));
      return { ...c, vipTicketPrice: newPrice };
    });
    setClubs(updatedClubs);
    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Toggle the user club's designated penalty taker (click again to unset)
  const setPenaltyTaker = (playerId: string) => {
    if (!userClubId) return;
    const updatedClubs = clubs.map(c => {
      if (c.id !== userClubId) return c;
      return { ...c, penaltyTakerId: c.penaltyTakerId === playerId ? undefined : playerId };
    });
    setClubs(updatedClubs);
    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  // Clears the dissatisfaction flag once the user has resolved it (kept or sold the player) --
  // without this the flag stays at the sentinel value forever, and the modal re-triggers on
  // any unrelated club update (ticket price, penalty taker, etc).
  const resolvePlayerDissatisfaction = (playerId: string) => {
    if (!userClubId) return;
    const updatedClubs = clubs.map(c => {
      if (c.id !== userClubId) return c;
      return { ...c, squad: c.squad.map(p => p.id === playerId ? { ...p, benchRounds: 0 } : p) };
    });
    setClubs(updatedClubs);
    saveGame(gameState, managerName, currentYear, currentRound, updatedClubs, userClubId, schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors);
  };

  const loadGame = (data: any, slot: number) => {
    if (!data) return;
    // Ignore saves from before the current squad/position data version
    if (!data.dbVersion || data.dbVersion < 3) {
      alert('Este save é de uma versão antiga e incompatível do jogo. Não é possível carregá-lo.');
      return;
    }
    setActiveSlot(slot);
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
    if (data.cupState && data.cupState.fase1ByeClubIds) {
      setCupState(data.cupState);
    } else {
      // Older saves either predate the Copa entirely, or predate the Fase 0/seeding rework
      // (the bracket shape itself changed, so an in-progress old-format run can't be remapped
      // safely) -- retroactively start a fresh one for the rest of this season instead of
      // leaving the club out until next year, skipping milestone rounds already past.
      const freshCup = startCup(data.clubs, data.currentYear);
      const alreadyPassed = CUP_MILESTONE_ROUNDS.filter(r => r < data.currentRound).length;
      setCupState({ ...freshCup, milestonesConsumed: alreadyPassed });
    }
    setForeignMarketPlayers(data.foreignMarketPlayers ?? []);
    setBoughtForeignIds(data.boughtForeignIds ?? []);
    setDivisionExperience(data.divisionExperience ?? { A: 0, B: 0, C: 0 });
    setFormerClubName(data.formerClubName ?? '');
    setLastSeasonTopSerieA(data.lastSeasonTopSerieA ?? []);
  };

  const cheatFinances = () => {
    if (!userClubId) return;
    setClubs(prev => prev.map(c => {
      if (c.id !== userClubId) return c;
      return { ...c, finances: c.finances + 1000000000 };
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
      cupState,
      startCupMatch,
      cupDrawReveal,
      dismissCupDrawReveal,
      sponsorAlert,
      dismissSponsorAlert,
      penaltyShootout,
      takePenaltyShootoutKick,
      finalizePenaltyShootout,
      foreignMarketPlayers,
      foreignPlayerPool,
      boughtForeignIds,
      buyForeignPlayer,
      currentSlot,
      getFreeSlot,
      startGame,
      nextRound,
      buyPlayer,
      sellPlayer,
      attemptSellPlayer,
      retirePlayer,
      upgradeStadium,
      buildVipBoxes,
      requestLoan,
      payOffLoanEarly,
      renegotiateLoanAction,
      signSponsor,
      acceptJobOffer,
      stayAtClub,
      resetGame,
      divisionExperience,
      formerClubName,
      requestResignation,
      simulateUnemployedRound,
      acceptMidSeasonJobOffer,
      setGameState,
      clearCurrentMatch,
      resimulateMidMatch,
      resolveMidMatchPenalty,
      makeBidForPlayer,
      buyPlayerFromClub,
      manualSave,
      updateTicketPrice,
      updateVipPrice,
      setPenaltyTaker,
      resolvePlayerDissatisfaction,
      renewContract,
      acceptIncomingProposal,
      loadGame,
      cancelSponsor,
      cheatFinances
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
