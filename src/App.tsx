import React, { useState, useEffect, useRef } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import type { Sponsor } from './context/GameContext';
import { CLUB_DEFINITIONS, formatCurrency } from './data/database';
import type { Player, Club } from './data/database';
import { calculateTeamForces } from './utils/matchEngine';
import { 
  Home, Users, TrendingUp, DollarSign, Trophy, 
  Play, Shield, AlertTriangle, Activity, CheckCircle
} from 'lucide-react';

// Wrapper to enable context access
const AppContent: React.FC = () => {
  const {
    gameState, managerName, currentYear, currentRound, clubs, userClubId, userClub,
    schedule, marketPlayers, offers, news, history, stadiumUpgrade, activeSponsors,
    currentMatch, currentMatchResult, startGame, nextRound, buyPlayer, sellPlayer,
    upgradeStadium, signSponsor, acceptJobOffer, stayAtClub, resetGame, clearCurrentMatch,
    makeBidForPlayer, buyPlayerFromClub, manualSave, updateTicketPrice, renewContract, acceptIncomingProposal, loadGame, cancelSponsor, cheatFinances
  } = useGame();

  const [activeTab, setActiveTab] = useState(0); // 0: Escritorio, 1: Elenco, 2: Mercado, 3: Finanças, 4: Classificação
  
  // Starting state states
  const [inputName, setInputName] = useState('');
  const [selectedStartClubId, setSelectedStartClubId] = useState('');

  // Squad selection states
  const [selectedTactic, setSelectedTactic] = useState<'4-4-2' | '3-5-2' | '4-3-3'>('4-4-2');
  const [starters, setStarters] = useState<Player[]>([]);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subslotIndex, setSubslotIndex] = useState<number | null>(null);

  // Standings filter states
  const [standingsTab, setStandingsTab] = useState<'A' | 'B' | 'C'>('C');
  const [statsView, setStatsView] = useState<'TABLE' | 'STATS' | 'HISTORY'>('TABLE');

  // Market filter states
  const [marketPosFilter, setMarketPosFilter] = useState<'ALL' | 'GK' | 'ZAG' | 'LE' | 'LD' | 'MEI' | 'ATA'>('ALL');

  // Match Simulation variables
  const [simMinute, setSimMinute] = useState(0);
  const [simScoreHome, setSimScoreHome] = useState(0);
  const [simScoreAway, setSimScoreAway] = useState(0);
  const [simEvents, setSimEvents] = useState<any[]>([]);
  const [simSpeedMode, setSimSpeedMode] = useState<'LENTO' | 'MEDIO' | 'RAPIDO'>('MEDIO');
  const simSpeed = simSpeedMode === 'LENTO' ? 250 : simSpeedMode === 'MEDIO' ? 100 : 35;
  const [isSimPaused, setIsSimPaused] = useState(false);
  const [matchDone, setMatchDone] = useState(false);

  // Mid-match substitution variables
  const [midMatchSubModal, setMidMatchSubModal] = useState(false);
  const [midMatchStarters, setMidMatchStarters] = useState<Player[]>([]);

  // Half-time and red-card modals
  const [halftimeModalOpen, setHalftimeModalOpen] = useState(false);
  const [halftimeShown, setHalftimeShown] = useState(false);
  const [redCardModalOpen, setRedCardModalOpen] = useState(false);
  const [lastRedCardMinute, setLastRedCardMinute] = useState(-1);
  const [redCardPlayer, setRedCardPlayer] = useState<Player | null>(null);
  const [savesModalOpen, setSavesModalOpen] = useState(false);

  // Sponsors list generator (deterministic based on club reputation)
  const [sponsorProposals, setSponsorProposals] = useState<Sponsor[]>([]);

  // Market Search & Negotiation states
  const [marketViewMode, setMarketViewMode] = useState<'FREE_AGENTS' | 'CLUBS'>('FREE_AGENTS');
  const [selectedSearchDiv, setSelectedSearchDiv] = useState<'A' | 'B' | 'C'>('A');
  const [selectedSearchClubId, setSelectedSearchClubId] = useState<string>('');
  const [negotiatingPlayer, setNegotiatingPlayer] = useState<Player | null>(null);
  const [negotiatingClubId, setNegotiatingClubId] = useState<string>('');
  const [offerAmount, setOfferAmount] = useState<number>(0);
  const [negotiationResult, setNegotiationResult] = useState<{ status: 'ACCEPTED' | 'REJECTED' | 'COUNTER'; counterAmount?: number } | null>(null);
  const [negotiationStage, setNegotiationStage] = useState<'OFFER' | 'RESULT'>('OFFER');
  const [purchaseConfirmData, setPurchaseConfirmData] = useState<{ player: Player; clubName: string; price: number; onConfirm: () => void } | null>(null);
  
  // Squad management and dissatisfaction states
  const [selectedManagePlayerId, setSelectedManagePlayerId] = useState<string | null>(null);
  const [unhappyPlayer, setUnhappyPlayer] = useState<Player | null>(null);

  // Incoming transfer proposal from other clubs for user's players
  const [incomingProposal, setIncomingProposal] = useState<{ player: Player; buyerClub: Club; amount: number } | null>(null);
  const [incomingNegResult, setIncomingNegResult] = useState<string | null>(null);
  const [negOfferAmount, setNegOfferAmount] = useState<number>(0);


  // Auto-fill selectedSearchClubId when division or clubs list changes
  useEffect(() => {
    if (clubs.length > 0) {
      const divClubs = clubs.filter(c => c.division === selectedSearchDiv && c.id !== userClubId).sort((a, b) => a.name.localeCompare(b.name));
      if (divClubs.length > 0) {
        setSelectedSearchClubId(divClubs[0].id);
      }
    }
  }, [selectedSearchDiv, clubs, userClubId]);
  const getContrastColor = (hexcolor?: string) => {
    if (!hexcolor || hexcolor.length < 6) return 'white';
    const hex = hexcolor.replace('#', '');
    const r = parseInt(hex.substr(0,2),16);
    const g = parseInt(hex.substr(2,2),16);
    const b = parseInt(hex.substr(4,2),16);
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#111827' : '#ffffff';
  };

  const [startersPerTactic, setStartersPerTactic] = useState<Record<string, Player[]>>({});
  const [lastUserClubId, setLastUserClubId] = useState('');

  useEffect(() => {
    if (userClubId !== lastUserClubId) {
      setStartersPerTactic({});
      setLastUserClubId(userClubId);
    }
  }, [userClubId, lastUserClubId]);

  // Load or pick starters when tactic changes — preserves current starters by position
  useEffect(() => {
    if (userClub) {
      const getTacticNeeds = (tactic: string) => {
        let targetZAG = 2, targetLE = 1, targetLD = 1, targetMEI = 4, targetATA = 2;
        if (tactic === '4-3-3') {
          targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 3;
        } else if (tactic === '3-5-2') {
          targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 2;
        } else {
          // Default 4-4-2
          targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 4; targetATA = 2;
        }
        return { targetZAG, targetLE, targetLD, targetMEI, targetATA };
      };

      if (startersPerTactic[selectedTactic] && startersPerTactic[selectedTactic].length > 0) {
        // Saved lineup for this tactic — validate (injures / sold players)
        const saved = startersPerTactic[selectedTactic];
        const validated = saved.map(p => {
          const found = userClub.squad.find(s => s.id === p.id);
          if (!found || found.isInjured) {
            const replacement = userClub.squad.find(s => s.subPosition === p.subPosition && !s.isInjured && !saved.some(x => x.id === s.id));
            return replacement || userClub.squad.find(s => !s.isInjured && !saved.some(x => x.id === s.id)) || p;
          }
          return found;
        });
        setStarters(validated);
        setMidMatchStarters(validated);
      } else {
        // Auto-pick best 11 matching the new scheme criteria
        const { targetZAG, targetLE, targetLD, targetMEI, targetATA } = getTacticNeeds(selectedTactic);
        const pool = [...userClub.squad].filter(p => !p.isInjured).sort((a, b) => b.rating - a.rating);
        const selected: Player[] = [];
        const gks = pool.filter(p => p.subPosition === 'GOL');
        if (gks[0]) selected.push(gks[0]);

        const zags = pool.filter(p => p.subPosition === 'ZAG');
        const les = pool.filter(p => p.subPosition === 'LE');
        const lds = pool.filter(p => p.subPosition === 'LD');
        const meis = pool.filter(p => p.subPosition === 'MEI');
        const atas = pool.filter(p => p.subPosition === 'ATA');

        for (let i = 0; i < Math.min(targetZAG, zags.length); i++) selected.push(zags[i]);
        for (let i = 0; i < Math.min(targetLE, les.length); i++) selected.push(les[i]);
        for (let i = 0; i < Math.min(targetLD, lds.length); i++) selected.push(lds[i]);
        for (let i = 0; i < Math.min(targetMEI, meis.length); i++) selected.push(meis[i]);
        for (let i = 0; i < Math.min(targetATA, atas.length); i++) selected.push(atas[i]);

        if (selected.length < 11) {
          const ids = new Set(selected.map(p => p.id));
          const rest = userClub.squad.filter(p => !p.isInjured && !ids.has(p.id)).sort((a, b) => b.rating - a.rating);
          for (let i = 0; i < Math.min(11 - selected.length, rest.length); i++) selected.push(rest[i]);
        }
        setStarters(selected);
        setMidMatchStarters(selected);
        setStartersPerTactic(prev => ({ ...prev, [selectedTactic]: selected }));
      }
    }
  }, [userClubId, selectedTactic]);

  // Sync starters and check injuries when club squad changes
  useEffect(() => {
    if (userClub && starters.length > 0) {
      let changed = false;
      const nextS = starters.map(p => {
        const found = userClub.squad.find(s => s.id === p.id);
        if (!found || found.isInjured) {
          changed = true;
          const replacement = userClub.squad.find(s => s.subPosition === p.subPosition && !s.isInjured && !starters.some(x => x.id === s.id));
          return replacement || userClub.squad.find(s => !s.isInjured && !starters.some(x => x.id === s.id)) || p;
        }
        if (found.rating !== p.rating || found.energy !== p.energy) {
          changed = true;
          return found;
        }
        return p;
      });
      if (changed) {
        setStarters(nextS);
        setStartersPerTactic(prev => ({ ...prev, [selectedTactic]: nextS }));
      }
    }
  }, [userClub]);

  // Generate sponsors proposal when tab is loaded
  useEffect(() => {
    if (userClub && activeTab === 3) {
      const rep = userClub.reputation;
      const div = userClub.division;
      const divMultiplier = div === 'A' ? 5.0 : div === 'B' ? 2.0 : div === 'C' ? 0.8 : 0.3;
      
      const sponsors: Sponsor[] = [
        {
          id: 'sp_master',
          name: 'PixBet Master',
          type: 'MASTER',
          signingBonus: Math.round(rep * rep * 250 * divMultiplier),
          weeklyPayment: Math.round(rep * 120 * divMultiplier),
          contractWeeks: 38
        },
        {
          id: 'sp_costas',
          name: 'SuperBet Costas',
          type: 'COSTAS',
          signingBonus: Math.round(rep * rep * 130 * divMultiplier),
          weeklyPayment: Math.round(rep * 60 * divMultiplier),
          contractWeeks: 38
        },
        {
          id: 'sp_mangas',
          name: 'CredFácil Mangas',
          type: 'MANGAS',
          signingBonus: Math.round(rep * rep * 70 * divMultiplier),
          weeklyPayment: Math.round(rep * 30 * divMultiplier),
          contractWeeks: 38
        }
      ];
      setSponsorProposals(sponsors);
    }
  }, [activeTab, userClub]);

  // Live match simulator runner
  const feedEndRef = useRef<HTMLDivElement>(null);
  const userMatchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameState === 'MATCH_DAY' && currentMatchResult) {
      setSimMinute(0);
      setSimScoreHome(0);
      setSimScoreAway(0);
      setSimEvents([]);
      setMatchDone(false);
      setIsSimPaused(false);
      setHalftimeShown(false);
      setHalftimeModalOpen(false);
      setRedCardModalOpen(false);
      setLastRedCardMinute(-1);
    }
  }, [gameState, currentMatchResult]);

  // Auto-open half-time substitution modal at minute 45
  useEffect(() => {
    if (gameState === 'MATCH_DAY' && simMinute === 45 && !halftimeShown && !matchDone && !isSimPaused) {
      setHalftimeModalOpen(true);
      setHalftimeShown(true);
      setIsSimPaused(true);
    }
  }, [simMinute, halftimeShown, matchDone, isSimPaused, gameState]);

  // Auto-open red-card modal when a red card event fires in user's match
  useEffect(() => {
    if (gameState !== 'MATCH_DAY' || !currentMatchResult || matchDone) return;
    const userRedCards = simEvents.filter(
      e => e.type === 'RED' && e.clubId === userClubId && e.minute > lastRedCardMinute
    );
    if (userRedCards.length > 0) {
      const latest = userRedCards[userRedCards.length - 1];
      setLastRedCardMinute(latest.minute);
      if (userClub && latest.player) {
        const pObj = userClub.squad.find(x => x.name === latest.player);
        if (pObj) setRedCardPlayer(pObj);
      }
      setRedCardModalOpen(true);
      setIsSimPaused(true);
    }
  }, [simEvents, userClubId, lastRedCardMinute, gameState, currentMatchResult, matchDone, userClub]);


  useEffect(() => {
    if (gameState !== 'MATCH_DAY' || !currentMatchResult || isSimPaused || matchDone) return;

    const timer = setTimeout(() => {
      if (simMinute < 90) {
        const nextMin = simMinute + 1;
        setSimMinute(nextMin);

        // Find events that happened in this minute
        const eventsInMin = currentMatchResult.events.filter(e => e.minute === nextMin);
        if (eventsInMin.length > 0) {
          setSimEvents(prev => [...prev, ...eventsInMin]);
          
          // Update score in real time
          eventsInMin.forEach(ev => {
            if (ev.type === 'GOAL') {
              const isHomeGoal = ev.clubId === currentMatch?.homeId;
              if (isHomeGoal) {
                setSimScoreHome(prev => prev + 1);
              } else {
                setSimScoreAway(prev => prev + 1);
              }
            }
          });
        }

        // Scroll to bottom of events feed
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setMatchDone(true);
      }
    }, simSpeed);

    return () => clearTimeout(timer);
  }, [simMinute, isSimPaused, matchDone, gameState, currentMatchResult, simSpeed]);

  // Auto-scroll to user's match row at minute 1 (start of match)
  useEffect(() => {
    if (gameState === 'MATCH_DAY' && simMinute === 1) {
      userMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [simMinute, gameState]);

  // Detect unhappy players who triggered the randomized dissatisfaction roll (benchRounds === 999)
  useEffect(() => {
    if (userClub && gameState === 'PLAYING') {
      const unhappy = userClub.squad.find(p => p.benchRounds === 999);
      if (unhappy) {
        setUnhappyPlayer(unhappy);
      }
    }
  }, [currentRound, userClub, gameState]);

  // Roll for incoming purchase proposal from other clubs for user's players after rounds
  useEffect(() => {
    if (userClub && gameState === 'PLAYING' && currentRound > 1) {
      // 22% chance of receiving an offer for a player in the squad
      if (Math.random() < 0.22) {
        // Only target players who are not locked and are either Star profile, or highly rated (Rating >= 75), or high goals scorers
        const potentialPlayers = userClub.squad.filter(p => !p.isInjured && !p.contractLocked && (p.isStar || p.rating >= 75 || p.goals >= 3));
        if (potentialPlayers.length > 0) {
          const targetPlayer = potentialPlayers[Math.floor(Math.random() * potentialPlayers.length)];
          const otherClubs = clubs.filter(c => c.id !== userClubId).sort((a, b) => a.name.localeCompare(b.name));
          if (otherClubs.length > 0) {
            const buyer = otherClubs[Math.floor(Math.random() * otherClubs.length)];
            // Offer is around 90% to 125% of market value
            const amount = Math.round(targetPlayer.value * (0.90 + Math.random() * 0.35));
            setIncomingProposal({ player: targetPlayer, buyerClub: buyer, amount });
            setNegOfferAmount(amount);
            setIncomingNegResult(null);
          }
        }
      }
    }
  }, [currentRound]);

  const handleSkipMatch = () => {
    if (!currentMatchResult) return;
    setSimMinute(90);
    setSimScoreHome(currentMatchResult.homeScore);
    setSimScoreAway(currentMatchResult.awayScore);
    setSimEvents(currentMatchResult.events);
    setMatchDone(true);
  };

  // Helper to make substitution in current match
  const handleMidMatchSub = (inPlayer: Player, outPlayer: Player) => {
    if (!currentMatch || !currentMatchResult) return;
    
    // Replace in starters
    const nextStarters = midMatchStarters.map(p => p.id === outPlayer.id ? inPlayer : p);
    setMidMatchStarters(nextStarters);
    setMidMatchSubModal(false);

    // Append sub news/event
    const subEvent = {
      minute: simMinute,
      type: 'INFO',
      clubId: userClubId,
      description: `Substituição no ${userClub?.name}: sai ${outPlayer.name}, entra ${inPlayer.name}.`
    };
    setSimEvents(prev => [...prev, subEvent]);
  };

  const getStandingsData = () => {
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

    clubs.forEach(c => {
      list[c.division].push(initStandings(c));
    });

    schedule.forEach(match => {
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

  // UI calculations
  const standings = getStandingsData();
  const currentStandings = standings[standingsTab];

  // Top scorers calculation by division
  const getTopScorers = () => {
    const list: { name: string; club: string; division: string; goals: number }[] = [];
    clubs.forEach(c => {
      if (c.division === standingsTab) {
        c.squad.forEach(p => {
          if (p.goals > 0) {
            list.push({ name: p.name, club: c.name, division: c.division, goals: p.goals });
          }
        });
      }
    });
    return list.sort((a, b) => b.goals - a.goals).slice(0, 10);
  };

  const topScorers = getTopScorers();

  // --- START SCREEN RENDER ---
  if (gameState === 'START') {
    const cClubs = CLUB_DEFINITIONS.filter(c => c.division === 'C').sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div className="mobile-wrapper" style={{ justifyContent: 'center', padding: '30px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-green)', letterSpacing: '-1px' }}>ELIFOOT 2026</h1>
          <p style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: 500 }}>Dirigente de Futebol - Mobile</p>
        </div>

        <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 style={{ marginBottom: '12px', fontWeight: 700 }}>1. Nome do Dirigente</h3>
          <input 
            type="text" 
            placeholder="Seu nome..." 
            value={inputName} 
            onChange={(e) => setInputName(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#121316',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'white',
              fontSize: '1rem',
              outline: 'none',
              fontWeight: 600
            }}
          />
        </div>

        <div className="card" style={{ background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', flex: 0.8, overflow: 'hidden' }}>
          <h3 style={{ marginBottom: '8px', fontWeight: 700 }}>2. Escolha seu clube (Série C)</h3>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', gap: '8px', display: 'flex', flexDirection: 'column' }}>
            {cClubs.map(club => (
              <div 
                key={club.id}
                onClick={() => setSelectedStartClubId(club.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: selectedStartClubId === club.id ? 'rgba(0, 230, 118, 0.1)' : '#121316',
                  border: selectedStartClubId === club.id ? '2px solid var(--accent-green)' : '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="club-badge-mini" style={{ backgroundColor: club.primaryColor, border: `1.5px solid ${club.secondaryColor}`, width: '18px', height: '18px' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{club.name}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  Estádio: {(club.stadiumCapacity/1000).toFixed(0)}k
                </span>
              </div>
            ))}
          </div>
        </div>

        <button 
          className="btn btn-primary" 
          disabled={!inputName.trim() || !selectedStartClubId}
          onClick={() => startGame(inputName, selectedStartClubId)}
          style={{ marginTop: '16px', height: '52px', fontSize: '1rem' }}
        >
          Iniciar Carreira
        </button>
      </div>
    );
  }

  // Guard safety
  if (!userClub) return null;

  // Calculate team stats
  const startersForces = calculateTeamForces(starters);

  // --- LIVE MATCH SIMULATOR OVERLAY ---
  if (gameState === 'MATCH_DAY' && currentMatch) {
    const isHome = currentMatch.homeId === userClubId;
    const opponent = clubs.find(c => c.id === (isHome ? currentMatch.awayId : currentMatch.homeId))!;
    const roundToDisplay = currentRound - 1;
    const roundMatches = schedule.filter(m => m.round === roundToDisplay);

    return (
      <div className="live-match-overlay">
        {/* TOP USER GAME CONTROL BANNER */}
        <div className="match-scoreboard" style={{ padding: '14px 16px', gap: '8px', zIndex: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 700 }}>
            <span>SEU JOGO • SÉRIE {userClub.division}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-green)', fontWeight: 800 }}>
              {simMinute}' - {simMinute <= 45 ? '1º Tempo' : simMinute < 90 ? '2º Tempo' : 'Fim de Jogo'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', margin: '4px 0' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'white' }}>{isHome ? userClub.name : opponent.name}</span>
            <span style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '2px', color: 'var(--accent-gold)' }}>
              {simScoreHome} - {simScoreAway}
            </span>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'white' }}>{!isHome ? userClub.name : opponent.name}</span>
          </div>

          {/* Goal Scorers list for user match */}
          {(() => {
            const userGoals = simEvents.filter(e => e.type === 'GOAL');
            if (userGoals.length === 0) return null;
            return (
              <div style={{ fontSize: '0.68rem', color: '#e8f5e9', textAlign: 'center', fontStyle: 'italic', marginBottom: '4px' }}>
                ⚽ {userGoals.map(g => `${g.player} ${g.minute}'`).join(', ')}
              </div>
            );
          })()}

          {/* Quick controls */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '8px' }}>
              {(['LENTO', 'MEDIO', 'RAPIDO'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSimSpeedMode(mode)}
                  style={{
                    fontSize: '0.62rem',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: simSpeedMode === mode ? 'var(--accent-green)' : 'transparent',
                    color: simSpeedMode === mode ? 'black' : '#9ca3af',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => setIsSimPaused(!isSimPaused)} 
              disabled={matchDone}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.7rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
            >
              {isSimPaused ? 'Retomar' : 'Pausar'}
            </button>
            <button 
              onClick={handleSkipMatch} 
              disabled={matchDone}
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: '0.7rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
            >
              Pular
            </button>
            {!matchDone && (
              <button 
                onClick={() => setMidMatchSubModal(true)}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.7rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '8px', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.2)', color: 'var(--accent-gold)' }}
              >
                Substituir
              </button>
            )}
          </div>


        </div>

        {/* CLASSIC SIMULTANEOUS DIVISION BOARD */}
        <div className="classic-board-container" style={{ scrollBehavior: 'smooth' }}>
          {(['A', 'B', 'C'] as const).map(div => {
            const divMatches = roundMatches.filter(m => m.division === div);
            
            return (
              <div key={div}>
                <div className="classic-board-header">
                  Brasileirão - Série {div} - {roundToDisplay}ª Rodada
                </div>
                <div className="classic-board-table">
                  {divMatches.map(match => {
                    const home = clubs.find(c => c.id === match.homeId)!;
                    const away = clubs.find(c => c.id === match.awayId)!;
                    
                    const matchEvents = match.result?.events || [];
                    const homeScore = matchEvents.filter(e => e.type === 'GOAL' && e.clubId === match.homeId && e.minute <= simMinute).length;
                    const awayScore = matchEvents.filter(e => e.type === 'GOAL' && e.clubId === match.awayId && e.minute <= simMinute).length;
                    
                    const liveGoals = matchEvents.filter(e => e.type === 'GOAL' && e.minute <= simMinute);
                    const scorersText = liveGoals.map(g => {
                      const tempo = g.minute <= 45 ? '1º' : '2º';
                      return `${g.player} ${g.minute}' (${tempo})`;
                    }).join(', ');

                    const isUserMatch = match.homeId === userClubId || match.awayId === userClubId;

                    return (
                      <div ref={isUserMatch ? userMatchRef : undefined} key={match.homeId} className={`classic-match-row-wrapper ${isUserMatch ? 'highlighted' : ''}`}>
                        {/* Main Row: Teams and Scores */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <div className="classic-team-box" style={{ backgroundColor: home.primaryColor, color: getContrastColor(home.primaryColor) }}>
                            <span className="classic-team-name">{home.name}</span>
                          </div>
                          <div className="classic-score-box">{homeScore}</div>
                          <div className="classic-score-box">{awayScore}</div>
                          <div className="classic-team-box" style={{ backgroundColor: away.primaryColor, color: getContrastColor(away.primaryColor) }}>
                            <span className="classic-team-name">{away.name}</span>
                          </div>
                        </div>

                        {/* Stadium and Attendance below the score */}
                        <div style={{ textAlign: 'center', fontSize: '0.62rem', color: '#a5d6a7', marginTop: '4px', fontFamily: 'monospace', opacity: 0.9 }}>
                          🏟️ {home.stadiumName} • {scorersText || 'Sem gols'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {matchDone && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', background: '#16181c', flexShrink: 0 }}>
            <button className="btn btn-primary" onClick={clearCurrentMatch} style={{ height: '44px' }}>
              Fim de Rodada (Continuar)
            </button>
          </div>
        )}

        {/* HALF-TIME MODAL (auto-opens at 45') */}
        {halftimeModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '2rem' }}>⏸️</span>
                <h3 style={{ fontWeight: 800, marginTop: '6px', color: 'var(--accent-gold)' }}>Intervalo — 45'</h3>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>O árbitro apita o fim do primeiro tempo. Deseja fazer alguma substituição?</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                <button
                  className="btn btn-secondary"
                  style={{ background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', color: 'var(--accent-gold)' }}
                  onClick={() => { setHalftimeModalOpen(false); setMidMatchSubModal(true); }}
                >
                  🔄 Fazer Substituição
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => { setHalftimeModalOpen(false); setIsSimPaused(false); }}
                >
                  ▶️ Continuar Segundo Tempo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RED CARD MODAL (auto-opens when user's team gets a red card) */}
        {redCardModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ padding: '20px', maxWidth: '340px' }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '2.4rem' }}>🟥</span>
                <h3 style={{ fontWeight: 800, marginTop: '6px', color: 'var(--accent-red)' }}>Expulsão no Time!</h3>
                {redCardPlayer && (
                  <div style={{ background: 'rgba(255,23,68,0.08)', border: '1px solid rgba(255,23,68,0.2)', borderRadius: '8px', padding: '8px', margin: '8px 0', fontSize: '0.8rem' }}>
                    Jogador: <strong>{redCardPlayer.name}</strong> ({redCardPlayer.position})
                  </div>
                )}
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>Seu jogador foi expulso e deixou o time desfalcado. O que deseja fazer?</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                <button
                  className="btn btn-secondary"
                  style={{ background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', color: 'var(--accent-red)', fontWeight: 700 }}
                  onClick={() => { setRedCardModalOpen(false); setMidMatchSubModal(true); }}
                >
                  🔄 Substituir / Reorganizar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => { setRedCardModalOpen(false); setIsSimPaused(false); }}
                >
                  ▶️ Continuar Jogo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MID-MATCH SUB MODAL */}
        {midMatchSubModal && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxHeight: '85vh', overflowY: 'auto', width: '380px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontWeight: 800 }}>Mudar Formação / Substituir</h3>
                <button onClick={() => { setMidMatchSubModal(false); setIsSimPaused(false); }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
              </div>

              <div>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '12px' }}>Ajuste seus titulares. Substitua jogadores cansados ou taticamente inviáveis.</p>
                
                <h4 style={{ fontSize: '0.85rem', marginBottom: '6px', color: 'var(--accent-gold)', fontWeight: 700 }}>Titulares em Campo:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', marginBottom: '14px' }}>
                  {midMatchStarters.map(star => {
                    const trend = star.performanceTrend || 'NEUTRAL';
                    const trendSymbol = trend === 'UP' ? '🟢 ↗️' : trend === 'DOWN' ? '🔴 ↘️' : '🟡 ➡️';
                    
                    return (
                      <div 
                        key={star.id} 
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#1e2126', borderRadius: '8px', fontSize: '0.8rem', border: star.redCards > 0 ? '1px solid var(--accent-red)' : 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`pos-badge ${star.position}`} style={{ padding: '2px 4px', fontSize: '0.65rem' }}>{star.position}</span>
                          <span style={{ fontWeight: 700 }}>{star.isStar ? '⭐ ' : ''}{star.name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>({star.rating})</span>
                          <span style={{ fontSize: '0.75rem' }} title="Rendimento">{trendSymbol}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: star.energy < 50 ? 'var(--accent-red)' : '#9ca3af' }}>⚡{star.energy}%</span>
                          <button 
                            onClick={() => {
                              setSubslotIndex(midMatchStarters.indexOf(star));
                            }}
                            style={{ background: 'var(--accent-red)', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Mudar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {subslotIndex !== null && (
                  <>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '6px', color: 'var(--accent-green)', fontWeight: 700 }}>Escolha o Substituto do Banco:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                      {userClub.squad
                        .filter(p => !midMatchStarters.some(s => s.id === p.id) && !p.isInjured)
                        .map(bench => {
                          const trend = bench.performanceTrend || 'NEUTRAL';
                          const trendSymbol = trend === 'UP' ? '🟢 ↗️' : trend === 'DOWN' ? '🔴 ↘️' : '🟡 ➡️';
                          return (
                            <div 
                              key={bench.id} 
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#1e2126', borderRadius: '8px', fontSize: '0.8rem' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className={`pos-badge ${bench.position}`} style={{ padding: '2px 4px', fontSize: '0.65rem' }}>{bench.position}</span>
                                <span style={{ fontWeight: 700 }}>{bench.isStar ? '⭐ ' : ''}{bench.name}</span>
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>({bench.rating})</span>
                                <span style={{ fontSize: '0.75rem' }}>{trendSymbol}</span>
                              </div>
                              <button 
                                onClick={() => {
                                  const outP = midMatchStarters[subslotIndex];
                                  handleMidMatchSub(bench, outP);
                                  setSubslotIndex(null);
                                  setIsSimPaused(false);
                                }}
                                style={{ background: 'var(--accent-green)', color: 'black', border: 'none', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                              >
                                Entrar
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- SEASON END OVERLAY ---
  if (gameState === 'SEASON_END') {
    const isSacked = userClub.confidence <= 0;
    
    return (
      <div className="mobile-wrapper" style={{ justifyContent: 'center', padding: '30px', gap: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <Trophy size={48} color="var(--accent-gold)" style={{ margin: '0 auto 12px auto' }} />
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Resumo da Temporada</h2>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Ano de {currentYear} Finalizado</p>
        </div>

        {isSacked ? (
          <div className="card" style={{ border: '1px solid var(--accent-red)', background: 'rgba(255,23,68,0.05)' }}>
            <h3 style={{ color: 'var(--accent-red)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={18} /> Você foi Demitido!
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#d1d5db' }}>
              A diretoria e a torcida perderam a paciência com o desempenho pífio do time. Você foi dispensado de suas funções.
            </p>
          </div>
        ) : (
          <div className="card" style={{ border: '1px solid var(--accent-green)', background: 'rgba(0,230,118,0.05)' }}>
            <h3 style={{ color: 'var(--accent-green)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle size={18} /> Temporada Concluída!
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#d1d5db' }}>
              Você encerrou a temporada no comando do **{userClub.name}**. A diretoria está satisfeita com seu trabalho!
            </p>
          </div>
        )}

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
            {isSacked ? 'Propostas de Recomeço (Série D)' : 'Propostas Disponíveis'}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
            {offers.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}>Nenhum clube interessado no momento.</p>
            ) : (
              offers.map((off, idx) => (
                <div 
                  key={idx}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#121316', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{off.clubName}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Série {off.division} • Salário: +{off.salaryBonus}%</span>
                  </div>
                  <button 
                    onClick={() => acceptJobOffer(off.clubId)}
                    className="btn btn-primary"
                    style={{ padding: '6px 12px', width: 'auto', borderRadius: '8px', fontSize: '0.8rem' }}
                  >
                    Aceitar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {!isSacked && (
          <button 
            className="btn btn-secondary" 
            onClick={stayAtClub}
            style={{ height: '48px' }}
          >
            Permanecer no {userClub.name}
          </button>
        )}

        <button 
          className="btn btn-danger" 
          onClick={resetGame}
          style={{ height: '44px', background: 'none', border: '1px solid rgba(255,23,68,0.2)', color: 'var(--accent-red)' }}
        >
          Reiniciar Carreira
        </button>
      </div>
    );
  }

  // --- MAIN LAYOUT RENDER ---
  return (
    <div className="mobile-wrapper">
      {/* HEADER STATUS */}
      <div className="header-bar">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div 
            className="club-pill"
            onDoubleClick={() => {
              const code = prompt('Digite o código de trapaça (Cheat Code):');
              if (code === 'querosermilionario') {
                cheatFinances();
                alert('Trapaça ativada! R$ 1.000.000.000 (1 Bilhão) adicionados ao caixa do clube!');
              } else if (code !== null) {
                alert('Código incorreto!');
              }
            }}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <span className="club-badge-mini" style={{ backgroundColor: userClub.primaryColor, border: `1px solid ${userClub.secondaryColor}` }} />
            <span>{userClub.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', marginLeft: '4px' }}>Série {userClub.division}</span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, color: 'var(--accent-green)', fontSize: '1rem' }}>
            {formatCurrency(userClub.finances)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600 }}>
            {managerName} • Ano {currentYear}
          </div>
        </div>
      </div>

      {/* RENDER TABS CONTENT */}
      <div className="scrollable">
        
        {/* --- TAB 0: ESCRITÓRIO --- */}
        {activeTab === 0 && (
          <>
            {/* discrete save slots button */}
            <div style={{ display: 'flex', gap: '8px', margin: '0 0 14px 0' }}>
              <button
                onClick={() => setSavesModalOpen(true)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 193, 7, 0.08)',
                  border: '1px solid rgba(255, 193, 7, 0.25)',
                  color: 'var(--accent-gold)',
                  borderRadius: '10px',
                  padding: '9px 0',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'background 0.2s'
                }}
              >
                💾 Gerenciar Saves (Slots)
              </button>
            </div>
            {/* Save / Delete campaign buttons */}
            <div style={{ display: 'flex', gap: '8px', margin: '0 0 14px 0' }}>
              <button
                onClick={manualSave}
                style={{
                  flex: 1,
                  background: 'rgba(0, 230, 118, 0.1)',
                  border: '1px solid rgba(0, 230, 118, 0.35)',
                  color: 'var(--accent-green)',
                  borderRadius: '10px',
                  padding: '9px 0',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'background 0.2s'
                }}
              >
                💾 Salvar Rápido
              </button>
              <button
                onClick={() => {
                  if (confirm('Tem certeza que deseja excluir esta campanha? Você voltará à tela inicial.')) {
                    resetGame();
                  }
                }}
                style={{
                  flex: 1,
                  background: 'rgba(255, 23, 68, 0.07)',
                  border: '1px solid rgba(255, 23, 68, 0.25)',
                  color: 'var(--accent-red)',
                  borderRadius: '10px',
                  padding: '9px 0',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'background 0.2s'
                }}
              >
                🗑️ Excluir Campanha
              </button>
            </div>

            {/* Round info */}
            <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22, 24, 28, 0.9) 0%, rgba(12, 13, 14, 0.9) 100%)', border: '1px solid var(--accent-green-glow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)', fontWeight: 700, textTransform: 'uppercase' }}>Campeonato Brasileiro</span>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Rodada {currentRound} de 38</h2>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '0.6rem', color: '#9ca3af' }}>Confiança</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 800, color: userClub.confidence > 50 ? 'var(--accent-green)' : userClub.confidence > 25 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
                    {userClub.confidence}%
                  </span>
                </div>
              </div>

              {/* Match preview */}
              {(() => {
                const roundMatches = schedule.filter(m => m.round === currentRound);
                const pMatch = roundMatches.find(m => m.homeId === userClubId || m.awayId === userClubId);
                if (!pMatch) return <p>Fim da temporada.</p>;
                
                const isHome = pMatch.homeId === userClubId;
                const oppId = isHome ? pMatch.awayId : pMatch.homeId;
                const opponent = clubs.find(c => c.id === oppId)!;
                
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="club-badge-mini" style={{ backgroundColor: opponent.primaryColor, border: `1px solid ${opponent.secondaryColor}`, width: '16px', height: '16px' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>VS {opponent.name} ({isHome ? 'Casa' : 'Fora'})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: '#9ca3af' }}>
                      <span>Força: {opponent.reputation}</span>
                    </div>
                  </div>
                );
              })()}

              <button 
                className="btn btn-primary" 
                onClick={() => nextRound(starters)}
                style={{ marginTop: '16px', height: '48px' }}
              >
                <Play size={18} fill="#000" /> Iniciar Partida
              </button>
            </div>

            {/* News feed */}
            <div className="card-title"><Activity size={18} color="var(--accent-green)" /> Feed de Notícias</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {news.slice().reverse().map((n) => (
                <div 
                  key={n.id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: '#121316',
                    borderLeft: `3px solid ${n.type === 'BOARD' ? 'var(--accent-red)' : n.type === 'TRANSFER' ? 'var(--accent-blue)' : n.type === 'OFFER' ? 'var(--accent-gold)' : 'var(--accent-gray)'}`,
                    fontSize: '0.8rem',
                    lineHeight: '1.4'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#6b7280', marginBottom: '2px', fontWeight: 700 }}>
                    <span>{n.type.toUpperCase()}</span>
                    <span>RODADA {n.week}</span>
                  </div>
                  <span style={{ color: '#d1d5db' }}>{n.text}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* --- TAB 1: ELENCO & TÁTICA --- */}
        {activeTab === 1 && (
          <>
            {/* Tactic dropdown and Force summary */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>Esquema Tático</span>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {(['4-4-2', '3-5-2', '4-3-3'] as const).map(tac => (
                  <button
                    key={tac}
                    onClick={() => setSelectedTactic(tac)}
                    className={`sub-tab-btn ${selectedTactic === tac ? 'active' : ''}`}
                    style={{ flex: '1 1 auto', padding: '8px 12px', fontSize: '0.8rem', minWidth: '80px', textAlign: 'center' }}
                  >
                    {tac}
                  </button>
                ))}
              </div>

              {/* Squad optimization buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '6px 4px', fontSize: '0.7rem', borderRadius: '8px', border: '1px solid rgba(0, 230, 118, 0.2)', color: 'var(--accent-green)', background: 'rgba(0, 230, 118, 0.05)' }}
                  onClick={() => {
                    if (!userClub) return;
                    // Helper logic to grab target tactic sizes
                    let targetZAG = 2, targetLE = 1, targetLD = 1, targetMEI = 4, targetATA = 2;
                    if (selectedTactic === '4-3-3') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 3;
                    } else if (selectedTactic === '3-5-2') {
                      targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 2;
                    }

                    const pool = [...userClub.squad].filter(p => !p.isInjured).sort((a, b) => b.rating - a.rating);
                    const bestSelected: Player[] = [];
                    const gks = pool.filter(p => p.subPosition === 'GOL');
                    if (gks[0]) bestSelected.push(gks[0]);

                    const zags = pool.filter(p => p.subPosition === 'ZAG');
                    const les = pool.filter(p => p.subPosition === 'LE');
                    const lds = pool.filter(p => p.subPosition === 'LD');
                    const meis = pool.filter(p => p.subPosition === 'MEI');
                    const atas = pool.filter(p => p.subPosition === 'ATA');

                    for (let i = 0; i < Math.min(targetZAG, zags.length); i++) bestSelected.push(zags[i]);
                    for (let i = 0; i < Math.min(targetLE, les.length); i++) bestSelected.push(les[i]);
                    for (let i = 0; i < Math.min(targetLD, lds.length); i++) bestSelected.push(lds[i]);
                    for (let i = 0; i < Math.min(targetMEI, meis.length); i++) bestSelected.push(meis[i]);
                    for (let i = 0; i < Math.min(targetATA, atas.length); i++) bestSelected.push(atas[i]);

                    // Fill to 11 if needed
                    if (bestSelected.length < 11) {
                      const ids = new Set(bestSelected.map(p => p.id));
                      const rest = userClub.squad.filter(p => !p.isInjured && !ids.has(p.id)).sort((a, b) => b.rating - a.rating);
                      for (let i = 0; i < Math.min(11 - bestSelected.length, rest.length); i++) bestSelected.push(rest[i]);
                    }

                    setStarters(bestSelected);
                    setMidMatchStarters(bestSelected);
                    setStartersPerTactic(prev => ({ ...prev, [selectedTactic]: bestSelected }));
                  }}
                >
                  ⚡ Escalar Melhores
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '6px 4px', fontSize: '0.7rem', borderRadius: '8px', border: '1px solid rgba(255, 193, 7, 0.2)', color: 'var(--accent-gold)', background: 'rgba(255, 193, 7, 0.05)' }}
                  onClick={() => {
                    if (!userClub) return;
                    // Rotate fatigued players: replace players with energy < 75 with best rested bench players
                    let targetZAG = 2, targetLE = 1, targetLD = 1, targetMEI = 4, targetATA = 2;
                    if (selectedTactic === '4-3-3') {
                      targetZAG = 2; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 3;
                    } else if (selectedTactic === '3-5-2') {
                      targetZAG = 3; targetLE = 1; targetLD = 1; targetMEI = 3; targetATA = 2;
                    }

                    // Sort all non-injured squad by energy level (higher energy first), then by rating
                    const pool = [...userClub.squad].filter(p => !p.isInjured).sort((a, b) => b.energy - a.energy || b.rating - a.rating);
                    
                    const selected: Player[] = [];
                    // Force pick the gk with best energy
                    const gks = pool.filter(p => p.subPosition === 'GOL');
                    if (gks[0]) selected.push(gks[0]);

                    const zags = pool.filter(p => p.subPosition === 'ZAG');
                    const les = pool.filter(p => p.subPosition === 'LE');
                    const lds = pool.filter(p => p.subPosition === 'LD');
                    const meis = pool.filter(p => p.subPosition === 'MEI');
                    const atas = pool.filter(p => p.subPosition === 'ATA');

                    for (let i = 0; i < Math.min(targetZAG, zags.length); i++) selected.push(zags[i]);
                    for (let i = 0; i < Math.min(targetLE, les.length); i++) selected.push(les[i]);
                    for (let i = 0; i < Math.min(targetLD, lds.length); i++) selected.push(lds[i]);
                    for (let i = 0; i < Math.min(targetMEI, meis.length); i++) selected.push(meis[i]);
                    for (let i = 0; i < Math.min(targetATA, atas.length); i++) selected.push(atas[i]);

                    // Fill to 11
                    if (selected.length < 11) {
                      const ids = new Set(selected.map(p => p.id));
                      const rest = pool.filter(p => !ids.has(p.id));
                      for (let i = 0; i < Math.min(11 - selected.length, rest.length); i++) selected.push(rest[i]);
                    }

                    setStarters(selected);
                    setMidMatchStarters(selected);
                    setStartersPerTactic(prev => ({ ...prev, [selectedTactic]: selected }));
                  }}
                >
                  💤 Poupar Cansados
                </button>
              </div>

              {/* Force Summary (under buttons) */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-green)', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '6px' }}>
                Força do Time: DEF {startersForces.defense} | ATA {startersForces.attack}
              </div>
            </div>

            {/* Soccer pitch representation (height expanded to 440px to prevent labels squeezing) */}
            <div className="pitch-container" style={{ position: 'relative', width: '100%', height: '440px', background: 'radial-gradient(circle, var(--pitch-green-light) 0%, var(--pitch-green) 100%)', borderRadius: '16px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
                <div className="pitch-line pitch-center-circle" />
                <div className="pitch-line pitch-midline" />
                <div className="pitch-line pitch-penalty-area-top" />
                <div className="pitch-line pitch-penalty-area-bottom" />

                {(() => {
                  // Determine coordinates (x, y in %) for each role in the 11 starter positions
                  // x: 0 = left, 100 = right; y: 0 = top (attacker), 100 = bottom (goalkeeper)
                  // For GK, LE, LD, ZAGs, MEIs, ATAs
                  const coords: Record<string, { x: number; y: number }[]> = {
                    '4-4-2': [
                      { x: 50, y: 88 }, // GOL
                      { x: 12, y: 72 }, // LE
                      { x: 37, y: 74 }, // ZAG 1
                      { x: 63, y: 74 }, // ZAG 2
                      { x: 88, y: 72 }, // LD
                      { x: 15, y: 46 }, // MEI Left (Jadson position)
                      { x: 38, y: 52 }, // MEI Center-Left (Denilson)
                      { x: 62, y: 52 }, // MEI Center-Right (Paulo Assunção)
                      { x: 85, y: 46 }, // MEI Right (Maicon)
                      { x: 35, y: 20 }, // AT Left (Luis Fabiano)
                      { x: 65, y: 20 }  // AT Right (Lucas)
                    ],
                    '3-5-2': [
                      { x: 50, y: 88 }, // GOL
                      { x: 25, y: 74 }, // ZAG Left (Rhodolfo)
                      { x: 50, y: 76 }, // ZAG Center (Toloi)
                      { x: 75, y: 74 }, // ZAG Right (João Filipe)
                      { x: 10, y: 48 }, // LE (Cortez, acting as wing-back)
                      { x: 90, y: 48 }, // LD (Douglas, acting as wing-back)
                      { x: 30, y: 44 }, // MEI Center-Left (Jadson)
                      { x: 50, y: 56 }, // MEI Defensive (Denilson)
                      { x: 70, y: 44 }, // MEI Center-Right (Maicon)
                      { x: 35, y: 20 }, // AT Left (Luis Fabiano)
                      { x: 65, y: 20 }  // AT Right (Lucas)
                    ],
                    '4-3-3': [
                      { x: 50, y: 88 }, // GOL
                      { x: 12, y: 72 }, // LE (Cortez)
                      { x: 37, y: 74 }, // ZAG 1 (Rhodolfo)
                      { x: 63, y: 74 }, // ZAG 2 (Toloi)
                      { x: 88, y: 72 }, // LD (Wellington)
                      { x: 25, y: 48 }, // MEI Left (Jadson)
                      { x: 50, y: 56 }, // MEI Center (Denilson)
                      { x: 75, y: 48 }, // MEI Right (Maicon)
                      { x: 18, y: 24 }, // AT Left (Osvaldo)
                      { x: 50, y: 16 }, // AT Center (Luis Fabiano)
                      { x: 82, y: 24 }  // AT Right (Lucas)
                    ]
                  };

                  const currentCoords = coords[selectedTactic] || coords['4-4-2'];

                  // Group and order starters so they match the template coordinate assignments perfectly:
                  // 1. GK -> index 0
                  // 2. ZAG, LE, LD (DFs) -> ZAGs in center, LE on left, LD on right
                  // 3. MFs (MEI, and LE/LD if 3-5-2 wings)
                  // 4. ATAs -> AT
                  const gks = starters.filter(p => p.position === 'GK');
                  const zags = starters.filter(p => p.subPosition === 'ZAG');
                  const les = starters.filter(p => p.subPosition === 'LE');
                  const lds = starters.filter(p => p.subPosition === 'LD');
                  const meis = starters.filter(p => p.subPosition === 'MEI');
                  const atas = starters.filter(p => p.subPosition === 'ATA');

                  let orderedStarters: Player[] = [];
                  if (selectedTactic === '3-5-2') {
                    // 3-5-2 Order: GOL, 3 ZAGs, LE (left wing), LD (right wing), 3 MEIs, 2 ATAs
                    orderedStarters = [
                      ...gks.slice(0, 1),
                      ...zags.slice(0, 3),
                      ...les.slice(0, 1),
                      ...lds.slice(0, 1),
                      ...meis.slice(0, 3),
                      ...atas.slice(0, 2)
                    ];
                  } else if (selectedTactic === '4-3-3') {
                    // 4-3-3 Order: GOL, LE, 2 ZAGs, LD, 3 MEIs, 3 ATAs (where index 8 is left-wing, 9 is center, 10 is right-wing)
                    orderedStarters = [
                      ...gks.slice(0, 1),
                      ...les.slice(0, 1),
                      ...zags.slice(0, 2),
                      ...lds.slice(0, 1),
                      ...meis.slice(0, 3),
                      ...atas.slice(0, 3)
                    ];
                  } else {
                    // 4-4-2 Order: GOL, LE, 2 ZAGs, LD, 4 MEIs, 2 ATAs
                    orderedStarters = [
                      ...gks.slice(0, 1),
                      ...les.slice(0, 1),
                      ...zags.slice(0, 2),
                      ...lds.slice(0, 1),
                      ...meis.slice(0, 4),
                      ...atas.slice(0, 2)
                    ];
                  }

                  // Fill in any missing spots up to 11 with remaining starters
                  if (orderedStarters.length < 11) {
                    const ids = new Set(orderedStarters.map(p => p.id));
                    const rest = starters.filter(p => !ids.has(p.id));
                    orderedStarters = [...orderedStarters, ...rest].slice(0, 11);
                  }

                  return orderedStarters.map((p, idx) => {
                    const coord = currentCoords[idx] || { x: 50, y: 50 };
                    let sideLabel: string = p.subPosition || 'ZAG';
                    if (p.position === 'GK') sideLabel = 'GOL';
                    else if (p.subPosition === 'ATA') sideLabel = 'AT';

                    let labelColor = 'var(--accent-blue)';
                    if (sideLabel === 'GOL') labelColor = '#ffa726';
                    else if (sideLabel === 'MEI') labelColor = 'var(--accent-green)';
                    else if (sideLabel === 'LE' || sideLabel === 'LD') labelColor = '#29b6f6';
                    else if (sideLabel === 'AT') labelColor = 'var(--accent-red)';

                    return (
                      <div 
                        key={p.id} 
                        className="player-token" 
                        onClick={() => { setSubslotIndex(starters.indexOf(p)); setSubModalOpen(true); }}
                        style={{
                          position: 'absolute',
                          left: `${coord.x}%`,
                          top: `${coord.y}%`,
                          transform: 'translate(-50%, -50%)',
                          zIndex: 10
                        }}
                      >
                        <div className="token-circle" style={{ borderColor: p.isStar ? 'var(--accent-gold)' : labelColor }}>{p.rating}</div>
                        <span className="token-name" style={{ fontSize: '0.6rem', padding: '1px 3px', borderRadius: '4px', background: 'rgba(0,0,0,0.6)', whiteSpace: 'nowrap', marginTop: '2px', fontWeight: 'normal' }}>
                          <span style={{ color: labelColor, marginRight: '2px', fontWeight: 'normal' }}>{sideLabel}</span> 
                          {p.isStar ? '★ ' : ''}{p.name.split(' ')[0]}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>

            {/* List of squad players */}
            <div className="card-title"><Users size={18} color="var(--accent-green)" /> Todos os Jogadores ({userClub.squad.length}/22)</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {userClub.squad.map(player => {
                const isStarter = starters.some(s => s.id === player.id);
                const isExpanded = selectedManagePlayerId === player.id;
                const remainingWeeks = player.contractWeeks ?? 38;
                
                const trend = player.performanceTrend || 'NEUTRAL';
                const trendSymbol = trend === 'UP' ? '🟢 ↗️' : trend === 'DOWN' ? '🔴 ↘️' : '🟡 ➡️';
                
                return (
                  <div key={player.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div 
                      className={`player-row ${player.isInjured ? 'injured' : ''}`}
                      onClick={() => setSelectedManagePlayerId(isExpanded ? null : player.id)}
                      style={{
                        borderLeft: isStarter ? '3px solid var(--accent-green)' : '3px solid transparent',
                        background: isStarter ? 'rgba(0, 230, 118, 0.03)' : '',
                        cursor: 'pointer'
                      }}
                    >
                      <span className={`pos-badge ${player.position}`}>{player.subPosition || player.position}</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                          {player.contractLocked && <span style={{ fontSize: '0.75rem' }} title="Contrato Trancado">🔒</span>}
                          {player.isInjured && <span style={{ fontSize: '0.65rem', background: 'var(--accent-red)', color: 'white', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>DM ({player.injuryWeeks}s)</span>}
                          {player.energy < 60 && <span style={{ fontSize: '0.65rem', background: 'rgba(255, 193, 7, 0.1)', color: 'var(--accent-gold)', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>Fadiga ({player.energy}%)</span>}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Idade: {player.age} anos • {formatCurrency(player.value)} • Rendimento: {trendSymbol}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-green)' }}>E: {player.energy}%</span>
                        <span className={`rating-badge ${player.rating >= 80 ? 'gold' : player.rating >= 70 ? 'silver' : ''}`}>{player.rating}</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{
                        background: '#121316',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        marginTop: '-2px',
                        marginBottom: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        fontSize: '0.8rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#9ca3af' }}>
                          <span>Contrato restante: <strong style={{ color: 'white' }}>{remainingWeeks} rodadas {player.contractLockYears ? `(${player.contractLockYears} Anos Trancado)` : ''}</strong></span>
                          <span>Salário: <strong style={{ color: 'white' }}>{formatCurrency(player.salary)}/sem</strong></span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => { renewContract(player.id, '6M'); setSelectedManagePlayerId(null); }}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.2)', color: 'var(--accent-gold)', minWidth: '100px' }}
                          >
                            📝 Renovar 6M (+19s)
                          </button>
                          <button
                            onClick={() => { renewContract(player.id, '1Y'); setSelectedManagePlayerId(null); }}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)', color: 'var(--accent-gold)', minWidth: '100px' }}
                          >
                            📝 Renovar 1 Ano (+38s)
                          </button>
                          <button
                            onClick={() => { renewContract(player.id, 'LOCK_6M'); setSelectedManagePlayerId(null); }}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: 'rgba(255, 193, 7, 0.12)', border: '1px solid rgba(255, 193, 7, 0.35)', color: 'var(--accent-gold)', minWidth: '100px' }}
                            title="Renova o contrato por 6 meses e tranca o jogador"
                          >
                            🔒 Trancar 6 Meses
                          </button>
                          <button
                            onClick={() => { renewContract(player.id, 'LOCK_1Y'); setSelectedManagePlayerId(null); }}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: 'rgba(255, 193, 7, 0.12)', border: '1px solid rgba(255, 193, 7, 0.35)', color: 'var(--accent-gold)', minWidth: '100px' }}
                            title="Renova o contrato por 1 ano e tranca o jogador"
                          >
                            🔒 Trancar 1 Ano
                          </button>
                          <button
                            onClick={() => { renewContract(player.id, '2Y'); setSelectedManagePlayerId(null); }}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: 'rgba(255, 193, 7, 0.15)', border: '1px solid rgba(255, 193, 7, 0.4)', color: 'var(--accent-gold)', minWidth: '100px' }}
                            title="Renova o contrato por 2 anos e tranca o jogador"
                          >
                            🔒 Trancar 2 Anos
                          </button>
                          <button
                            onClick={() => { if (!player.contractLocked) { sellPlayer(player); setSelectedManagePlayerId(null); } }}
                            disabled={player.contractLocked}
                            className="btn btn-danger"
                            style={{ flex: 1.2, padding: '6px', fontSize: '0.72rem', background: player.contractLocked ? '#2e191b' : 'rgba(255, 23, 68, 0.1)', border: player.contractLocked ? '1px solid #4a1c20' : '1px solid rgba(255, 23, 68, 0.2)', color: player.contractLocked ? '#9ca3af' : 'var(--accent-red)', minWidth: '100px', cursor: player.contractLocked ? 'not-allowed' : 'pointer' }}
                          >
                            {player.contractLocked ? '🔒 Trancado' : `💰 Vender (${formatCurrency(Math.round(player.value * 0.9))})`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* SQUAD SUBSTITUTION MODAL */}
            {subModalOpen && subslotIndex !== null && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 800 }}>Escalar Jogador</h3>
                    <button onClick={() => { setSubModalOpen(false); setSubslotIndex(null); }} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                      Substituindo titular: **{starters[subslotIndex]?.name}** ({starters[subslotIndex]?.position})
                    </p>
                    {userClub.squad
                      .filter(p => !starters.some(s => s.id === p.id) && !p.isInjured && p.position === starters[subslotIndex]?.position)
                      .map(p => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            const nextS = [...starters];
                            nextS[subslotIndex] = p;
                            setStarters(nextS);
                            setStartersPerTactic(prev => ({ ...prev, [selectedTactic]: nextS }));
                            setSubModalOpen(false);
                            setSubslotIndex(null);
                          }}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: '#121316',
                            border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{p.isStar ? '⭐ ' : ''}{p.name}</span>
                          <span className="rating-badge">{p.rating}</span>
                        </div>
                      ))}
                      {userClub.squad.filter(p => !starters.some(s => s.id === p.id) && !p.isInjured && p.position === starters[subslotIndex]?.position).length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--accent-red)', textAlign: 'center' }}>Nenhum reserva saudável disponível para esta posição.</p>
                      )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- TAB 2: MERCADO --- */}
        {activeTab === 2 && (
          <>
            {/* View Mode Toggle */}
            <div className="card" style={{ padding: '8px', marginBottom: '14px', display: 'flex', gap: '8px' }}>
              <button
                className={`btn ${marketViewMode === 'FREE_AGENTS' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                onClick={() => setMarketViewMode('FREE_AGENTS')}
              >
                Jogadores Livres
              </button>
              <button
                className={`btn ${marketViewMode === 'CLUBS' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                onClick={() => setMarketViewMode('CLUBS')}
              >
                Comprar de Clubes
              </button>
            </div>

            {/* General Position filter buttons (used by both Free Agents and Club Squad view) */}
            <div className="sub-tabs" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {(['ALL', 'GOL', 'ZAG', 'LE', 'LD', 'MEI', 'ATA'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => setMarketPosFilter(pos === 'GOL' ? 'GK' as any : pos)}
                  className={`sub-tab-btn ${((marketPosFilter === 'GK' && pos === 'GOL') || (marketPosFilter === pos)) ? 'active' : ''}`}
                  style={{ flex: '1 1 auto', padding: '6px 10px', fontSize: '0.72rem', minWidth: '42px', textAlign: 'center' }}
                >
                  {pos === 'ALL' ? 'Todos' : pos}
                </button>
              ))}
            </div>

            {marketViewMode === 'FREE_AGENTS' ? (
              <>
                {/* BUY LIST */}
                <div className="card-title"><TrendingUp size={18} color="var(--accent-green)" /> Comprar Jogadores (Transferências)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {marketPlayers
                    .filter(p => {
                      const filterPos = marketPosFilter === 'GK' ? 'GOL' : marketPosFilter;
                      return marketPosFilter === 'ALL' || p.subPosition === filterPos;
                    })
                    .map(player => (
                      <div key={player.id} className="player-row">
                        <span className={`pos-badge ${player.position}`}>{player.subPosition || player.position}</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Idade: {player.age} anos • Salário: {formatCurrency(player.salary)}/sem</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="rating-badge">{player.rating}</span>
                          <button 
                            onClick={() => {
                              setPurchaseConfirmData({
                                player,
                                clubName: 'Sem Clube (Livre)',
                                price: player.value,
                                onConfirm: () => buyPlayer(player)
                              });
                            }}
                            className="btn btn-primary"
                            style={{ padding: '6px 12px', width: 'auto', borderRadius: '8px', fontSize: '0.8rem' }}
                          >
                            {formatCurrency(player.value)}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['A', 'B', 'C'] as const).map(div => (
                    <button
                      key={div}
                      className={`sub-tab-btn ${selectedSearchDiv === div ? 'active' : ''}`}
                      style={{ flex: 1 }}
                      onClick={() => setSelectedSearchDiv(div)}
                    >
                      Série {div}
                    </button>
                  ))}
                </div>
                
                {/* Club selector dropdown */}
                <select
                  value={selectedSearchClubId}
                  onChange={(e) => setSelectedSearchClubId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#121316',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '0.85rem',
                    marginBottom: '10px'
                  }}
                >
                  <option value="" disabled>Escolha um clube...</option>
                  {clubs
                    .filter(c => c.division === selectedSearchDiv && c.id !== userClubId)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>

                {(() => {
                  const searchedClub = clubs.find(c => c.id === selectedSearchClubId);
                  if (!searchedClub) return <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}>Selecione um clube para visualizar o elenco.</p>;
                  
                  const filteredSquad = searchedClub.squad.filter(p => {
                    const filterPos = marketPosFilter === 'GK' ? 'GOL' : marketPosFilter;
                    return marketPosFilter === 'ALL' || p.subPosition === filterPos;
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                      <div className="card-title">Elenco do {searchedClub.name}</div>
                      {filteredSquad.map(player => (
                        <div key={player.id} className="player-row">
                          <span className={`pos-badge ${player.position}`}>{player.subPosition || player.position}</span>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Idade: {player.age} anos • Valor: {formatCurrency(player.value)}</span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="rating-badge">{player.rating}</span>
                            {player.contractLocked ? (
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                🔒 1 ano
                              </span>
                            ) : (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '6px 10px', fontSize: '0.75rem', width: 'auto', borderRadius: '8px' }}
                                onClick={() => {
                                  setNegotiatingPlayer(player);
                                  setNegotiatingClubId(searchedClub.id);
                                  setOfferAmount(player.value);
                                  setNegotiationStage('OFFER');
                                  setNegotiationResult(null);
                                }}
                              >
                                Negociar
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {filteredSquad.length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>Nenhum jogador encontrado com a posição filtrada.</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* NEGOTIATION MODAL */}
            {negotiatingPlayer && (
              <div className="modal-overlay">
                <div className="modal-content" style={{ maxWidth: '380px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ fontWeight: 800 }}>Negociar Contratação</h3>
                    <button 
                      onClick={() => { setNegotiatingPlayer(null); setNegotiationResult(null); }} 
                      style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>

                  {negotiationStage === 'OFFER' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div className="player-row" style={{ background: 'rgba(255,255,255,0.02)', border: 'none', padding: '10px' }}>
                        <span className={`pos-badge ${negotiatingPlayer.position}`}>{negotiatingPlayer.position}</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{negotiatingPlayer.isStar ? '⭐ ' : ''}{negotiatingPlayer.name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Idade: {negotiatingPlayer.age} anos • Força: {negotiatingPlayer.rating}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#9ca3af' }}>
                        <div>
                          <span>Valor de Mercado: </span>
                          <span style={{ fontWeight: 700, color: 'white' }}>{formatCurrency(negotiatingPlayer.value)}</span>
                        </div>
                        <div>
                          <span>Caixa Disponível: </span>
                          <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{formatCurrency(userClub?.finances || 0)}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Sua Oferta (R$):</label>
                        <input 
                          type="number"
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(Number(e.target.value))}
                          style={{
                            padding: '10px',
                            background: '#121316',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '0.85rem',
                            fontWeight: 700
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: 600 }}>
                          Valor Digitado: {formatCurrency(offerAmount)}
                        </span>
                      </div>

                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          const res = makeBidForPlayer(negotiatingPlayer, negotiatingClubId, offerAmount);
                          setNegotiationResult(res);
                          setNegotiationStage('RESULT');
                        }}
                      >
                        Enviar Proposta
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center', padding: '10px 0' }}>
                      {negotiationResult?.status === 'ACCEPTED' && (
                        <>
                          <div style={{ fontSize: '2.5rem' }}>🎉</div>
                          <h4 style={{ color: 'var(--accent-green)', fontWeight: 700 }}>Proposta Aceita!</h4>
                          <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.4' }}>
                            O clube e o jogador aceitaram a sua oferta de **{formatCurrency(offerAmount)}**! O contrato de 1 ano foi assinado.
                          </p>
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              const sellerClubName = clubs.find(c => c.id === negotiatingClubId)?.name || 'Outro Clube';
                              setPurchaseConfirmData({
                                player: negotiatingPlayer,
                                clubName: sellerClubName,
                                price: offerAmount,
                                onConfirm: () => {
                                  buyPlayerFromClub(negotiatingPlayer, negotiatingClubId, offerAmount);
                                  setNegotiatingPlayer(null);
                                  setNegotiationResult(null);
                                }
                              });
                            }}
                          >
                            Finalizar Contratação
                          </button>
                        </>
                      )}

                      {negotiationResult?.status === 'REJECTED' && (
                        <>
                          <div style={{ fontSize: '2.5rem' }}>❌</div>
                          <h4 style={{ color: 'var(--accent-red)', fontWeight: 700 }}>Proposta Recusada!</h4>
                          <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.4' }}>
                            O clube e o jogador recusaram sua oferta de **{formatCurrency(offerAmount)}** por estar abaixo do valor de mercado. Eles consideraram a oferta inaceitável.
                          </p>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setNegotiatingPlayer(null);
                              setNegotiationResult(null);
                            }}
                          >
                            Fechar
                          </button>
                        </>
                      )}

                      {negotiationResult?.status === 'COUNTER' && (
                        <>
                          <div style={{ fontSize: '2.5rem' }}>🤝</div>
                          <h4 style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>Contraproposta Recebida!</h4>
                          <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: '1.4' }}>
                            O clube recusou sua oferta inicial de **{formatCurrency(offerAmount)}**, mas fez uma contraproposta de **{formatCurrency(negotiationResult.counterAmount || 0)}** para fechar negócio hoje.
                          </p>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => {
                                const sellerClubName = clubs.find(c => c.id === negotiatingClubId)?.name || 'Outro Clube';
                                const counterPrice = negotiationResult.counterAmount || 0;
                                setPurchaseConfirmData({
                                  player: negotiatingPlayer,
                                  clubName: sellerClubName,
                                  price: counterPrice,
                                  onConfirm: () => {
                                    buyPlayerFromClub(negotiatingPlayer, negotiatingClubId, counterPrice);
                                    setNegotiatingPlayer(null);
                                    setNegotiationResult(null);
                                  }
                                });
                              }}
                              style={{ flex: 1 }}
                            >
                              Aceitar ({formatCurrency(negotiationResult.counterAmount || 0)})
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                setNegotiatingPlayer(null);
                                setNegotiationResult(null);
                              }}
                              style={{ flex: 1 }}
                            >
                              Recusar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}



            {/* PURCHASE CONFIRMATION MODAL */}
            {purchaseConfirmData && (
              <div className="modal-overlay" style={{ zIndex: 1100 }}>
                <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
                  <h3 style={{ fontWeight: 800, marginBottom: '12px' }}>Confirmar Contratação</h3>
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af', lineHeight: '1.5', marginBottom: '20px' }}>
                    Tem certeza que deseja comprar o jogador **{purchaseConfirmData.player.name}** ({purchaseConfirmData.player.position}), do time **{purchaseConfirmData.clubName}**, por **{formatCurrency(purchaseConfirmData.price)}**?
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        purchaseConfirmData.onConfirm();
                        setPurchaseConfirmData(null);
                      }}
                    >
                      Sim, Comprar
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      onClick={() => setPurchaseConfirmData(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* --- TAB 3: FINANÇAS & ESTÁDIO --- */}
        {activeTab === 3 && (
          <>
            {/* Financial summaries */}
            <div className="card">
              <div className="card-title"><DollarSign size={18} color="var(--accent-green)" /> Balanço Semanal Estimado</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#9ca3af' }}>Salários de Jogadores:</span>
                  <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>
                    -{formatCurrency(userClub.squad.reduce((sum, p) => sum + p.salary, 0))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#9ca3af' }}>Patrocínios Ativos:</span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                    +{formatCurrency(Object.values(activeSponsors).reduce((sum, sp) => sum + (sp?.weeklyPayment || 0), 0))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span style={{ color: '#9ca3af' }}>Público Estimado (Bilheteria):</span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                    ~{formatCurrency(Math.round(userClub.stadiumCapacity * 0.7 * userClub.ticketPrice))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Saldo Semanal (Projetado):</span>
                  {(() => {
                    const balance = Object.values(activeSponsors).reduce((sum, sp) => sum + (sp?.weeklyPayment || 0), 0) + 
                                    Math.round(userClub.stadiumCapacity * 0.7 * userClub.ticketPrice) - 
                                    userClub.squad.reduce((sum, p) => sum + p.salary, 0);
                    return (
                      <span style={{ color: balance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {balance >= 0 ? '+' : ''}{formatCurrency(balance)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Stadium expand */}
            <div className="card">
              <div className="card-title"><Shield size={18} color="var(--accent-green)" /> Estádio: {userClub.stadiumName}</div>
              <div className="stat-grid" style={{ marginBottom: '12px' }}>
                <div className="stat-box">
                  <span className="stat-label">Capacidade Atual</span>
                  <span className="stat-value">{userClub.stadiumCapacity.toLocaleString()}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Preço do Ingresso</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <button
                      onClick={() => updateTicketPrice(-10)}
                      style={{ background: 'rgba(255,23,68,0.15)', border: '1px solid rgba(255,23,68,0.3)', color: 'var(--accent-red)', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >-</button>
                    <span className="stat-value" style={{ minWidth: '60px', textAlign: 'center' }}>{formatCurrency(userClub.ticketPrice)}</span>
                    <button
                      onClick={() => updateTicketPrice(10)}
                      style={{ background: 'rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.3)', color: 'var(--accent-green)', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >+</button>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '12px', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {userClub.confidence >= 95
                  ? '🔥 Confiança máxima! A torcida apoia independente do preço do ingresso.'
                  : '💡 Preços altos afastam torcedores. Com confiança ≥ 95%, a torcida paga qualquer preço.'}
              </div>

              {stadiumUpgrade ? (
                <div style={{ padding: '12px', background: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--accent-gold)', marginBottom: '14px' }}>
                  🚧 Obras em andamento: +{stadiumUpgrade.capacityAdded.toLocaleString()} assentos ({stadiumUpgrade.weeksLeft} rodadas restantes).
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => upgradeStadium(5000)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '10px' }}
                  >
                    Ampliar +5.000 (Cost: {formatCurrency(5000*350)})
                  </button>
                  <button 
                    onClick={() => upgradeStadium(10000)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '10px' }}
                  >
                    Ampliar +10.000 (Cost: {formatCurrency(10000*350)})
                  </button>
                </div>
              )}
            </div>

            {/* Sponsors */}
            <div className="card">
              <div className="card-title"><DollarSign size={18} color="var(--accent-green)" /> Contratos de Patrocínio (Anual)</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(['MASTER', 'COSTAS', 'MANGAS'] as const).map(type => {
                  const active = activeSponsors[type];
                  const offer = sponsorProposals.find(sp => sp.type === type);
                  
                  return (
                    <div 
                      key={type}
                      style={{ padding: '12px', background: '#121316', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '0.85rem' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontWeight: 700 }}>
                        <span style={{ color: '#9ca3af' }}>{type === 'MASTER' ? 'Patrocínio Master' : type === 'COSTAS' ? 'Patrocínio Costas' : 'Patrocínio Mangas'}</span>
                        {active ? (
                          <span style={{ color: 'var(--accent-green)' }}>Ativo ({active.contractWeeks}s)</span>
                        ) : (
                          <span style={{ color: 'var(--accent-gold)' }}>Disponível</span>
                        )}
                      </div>

                      {active ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{active.name}</span>
                            <span style={{ color: '#9ca3af' }}>+{formatCurrency(active.weeklyPayment)}/sem</span>
                          </div>
                          <button
                            onClick={() => cancelSponsor(type)}
                            className="btn btn-danger"
                            style={{ padding: '3px 8px', width: 'auto', borderRadius: '6px', fontSize: '0.7rem', background: 'rgba(255, 23, 68, 0.08)', border: '1px solid rgba(255, 23, 68, 0.2)', color: 'var(--accent-red)' }}
                          >
                            Rescindir
                          </button>
                        </div>
                      ) : offer ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem' }}>
                            <span>{offer.name}</span>
                            <span style={{ color: '#9ca3af' }}>Luvas: {formatCurrency(offer.signingBonus)} • {formatCurrency(offer.weeklyPayment)}/sem</span>
                          </div>
                          <button 
                            onClick={() => signSponsor(offer)}
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', width: 'auto', borderRadius: '6px', fontSize: '0.75rem' }}
                          >
                            Assinar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* --- TAB 4: CLASSIFICAÇÃO & HISTÓRICO --- */}
        {activeTab === 4 && (
          <>
            {/* View selectors */}
            <div style={{ display: 'flex', gap: '8px', padding: '0 0 12px 0' }}>
              <button 
                onClick={() => setStatsView('TABLE')}
                className={`sub-tab-btn ${statsView === 'TABLE' ? 'active' : ''}`}
                style={{ flex: 1 }}
              >
                Tabela
              </button>
              <button 
                onClick={() => setStatsView('STATS')}
                className={`sub-tab-btn ${statsView === 'STATS' ? 'active' : ''}`}
                style={{ flex: 1 }}
              >
                Artilharia
              </button>
              <button 
                onClick={() => setStatsView('HISTORY')}
                className={`sub-tab-btn ${statsView === 'HISTORY' ? 'active' : ''}`}
                style={{ flex: 1 }}
              >
                Histórico
              </button>
            </div>

            {statsView === 'TABLE' && (
              <>
                {/* Division selectors */}
                <div className="sub-tabs" style={{ padding: '0 0 12px 0' }}>
                  {(['A', 'B', 'C'] as const).map(div => (
                    <button
                      key={div}
                      onClick={() => setStandingsTab(div)}
                      className={`sub-tab-btn ${standingsTab === div ? 'active' : ''}`}
                      style={{ flex: 1 }}
                    >
                      Série {div}
                    </button>
                  ))}
                </div>

                <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
                  <div className="table-header">
                    <span>#</span>
                    <span>Time</span>
                    <span>J</span>
                    <span>V</span>
                    <span>SG</span>
                    <span>Pts</span>
                  </div>

                  {currentStandings.map((entry, idx) => {
                    const isUser = entry.clubId === userClubId;
                    
                    // Highlight colors
                    let highlightClass = '';
                    if (idx < 4) highlightClass = 'pos-green-highlight'; // Promotion
                    else if (idx >= 16 && standingsTab !== 'C') highlightClass = 'pos-red-highlight'; // Relegation

                    return (
                      <div 
                        key={entry.clubId}
                        className={`table-row ${isUser ? 'highlighted' : highlightClass}`}
                      >
                        <span style={{ fontWeight: 800 }}>{idx + 1}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="club-badge-mini" style={{ backgroundColor: clubs.find(c=>c.id===entry.clubId)?.primaryColor }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.clubName}</span>
                        </div>
                        <span>{entry.played}</span>
                        <span>{entry.wins}</span>
                        <span style={{ color: entry.gd > 0 ? 'var(--accent-green)' : entry.gd < 0 ? 'var(--accent-red)' : '' }}>
                          {entry.gd > 0 ? '+' : ''}{entry.gd}
                        </span>
                        <span style={{ fontWeight: 800 }}>{entry.points}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {statsView === 'STATS' && (
              <>
                {/* Division selectors */}
                <div className="sub-tabs" style={{ padding: '0 0 12px 0' }}>
                  {(['A', 'B', 'C'] as const).map(div => (
                    <button
                      key={div}
                      onClick={() => setStandingsTab(div)}
                      className={`sub-tab-btn ${standingsTab === div ? 'active' : ''}`}
                      style={{ flex: 1 }}
                    >
                      Série {div}
                    </button>
                  ))}
                </div>

                <div className="card">
                  <div className="card-title">
                    <Trophy size={18} color="var(--accent-gold)" /> Artilheiros - Série {standingsTab}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topScorers.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>Nenhum gol marcado ainda nesta temporada nesta série.</p>
                    ) : (
                      topScorers.map((sc, idx) => (
                        <div 
                          key={idx}
                          style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#121316', borderRadius: '12px' }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{idx + 1}. {sc.name}</span>
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{sc.club} (Série {sc.division})</span>
                          </div>
                          <span style={{ fontWeight: 800, color: 'var(--accent-green)', display: 'flex', alignItems: 'center' }}>⚽ {sc.goals}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {statsView === 'HISTORY' && (
              <div className="card">
                <div className="card-title"><Trophy size={18} color="var(--accent-gold)" /> Histórico da Carreira</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {history.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>Nenhum histórico registrado. Conclua uma temporada primeiro!</p>
                  ) : (
                    history.map((hist, idx) => (
                      <div 
                        key={idx}
                        style={{ padding: '12px', background: '#121316', borderRadius: '12px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                          <span>Temporada {hist.year}</span>
                          <span>{hist.userClub} (Série {hist.userDivision} - #{hist.userFinish})</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: '#9ca3af' }}>
                          <span>🏆 Campeão Série A: **{hist.champions.A}**</span>
                          <span>🏆 Campeão Série B: **{hist.champions.B}**</span>
                          <span>🏆 Campeão Série C: **{hist.champions.C}**</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* UNHAPPY PLAYER DISSATISFACTION MODAL */}
      {unhappyPlayer && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem' }}>😠</span>
            <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>Jogador Insatisfeito</h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', lineHeight: '1.5', margin: '12px 0 20px 0' }}>
              O jogador **{unhappyPlayer.name}** ({unhappyPlayer.position}) está se sentindo inferior no elenco por não estar jogando e solicitou ser vendido para outro clube!
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn btn-danger"
                onClick={() => {
                  sellPlayer(unhappyPlayer);
                  setUnhappyPlayer(null);
                }}
              >
                💰 Vender por {formatCurrency(Math.round(unhappyPlayer.value * 0.9))}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  // user ignores or closes, but reset dissatisfaction counters slightly to not prompt on every click
                  // Or let them resolve it by putting him in next match
                  setUnhappyPlayer(null);
                }}
              >
                Manter no Elenco
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INCOMING CLUB TRANSFER PROPOSAL MODAL */}
      {incomingProposal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '345px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem' }}>💼</span>
            <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-green)' }}>Proposta Recebida!</h3>
            <p style={{ fontSize: '0.82rem', color: '#9ca3af', lineHeight: '1.4', margin: '10px 0 16px 0' }}>
              O **{incomingProposal.buyerClub.name}** enviou uma oferta oficial para comprar seu jogador **{incomingProposal.player.name}** ({incomingProposal.player.position}, Rating {incomingProposal.player.rating})!
            </p>

            {incomingNegResult ? (
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-gold)' }}>
                {incomingNegResult}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Valor do Jogador: {formatCurrency(incomingProposal.player.value)}</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-green)' }}>Valor Oferecido: {formatCurrency(incomingProposal.amount)}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {!incomingNegResult && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      acceptIncomingProposal(incomingProposal.player, incomingProposal.buyerClub.id, incomingProposal.amount);
                      setIncomingProposal(null);
                    }}
                  >
                    🤝 Aceitar Oferta ({formatCurrency(incomingProposal.amount)})
                  </button>
                  
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '10px', fontSize: '0.8rem' }}
                      onClick={() => {
                        // Negotiation / Counter-offer: 40% chance the club accepts higher counter offer up to 25% extra, or gives response
                        const extraPercent = 0.10 + Math.random() * 0.15;
                        const counter = Math.round(incomingProposal.amount * (1 + extraPercent));
                        const roll = Math.random();
                        if (roll < 0.45) {
                          setIncomingNegResult(`O ${incomingProposal.buyerClub.name} aceitou sua contraproposta! Vendido por ${formatCurrency(counter)}.`);
                          setNegOfferAmount(counter);
                        } else if (roll < 0.80) {
                          const limit = Math.round(incomingProposal.amount * 1.05);
                          setIncomingNegResult(`O ${incomingProposal.buyerClub.name} recusou os ${formatCurrency(counter)}, mas aceita pagar no máximo ${formatCurrency(limit)}.`);
                          setNegOfferAmount(limit);
                        } else {
                          setIncomingNegResult(`O ${incomingProposal.buyerClub.name} achou a contraproposta muito alta e retirou o interesse na contratação!`);
                          setNegOfferAmount(0);
                        }
                      }}
                    >
                      💬 Negociar Valor
                    </button>
                    
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '10px', fontSize: '0.8rem', background: 'rgba(255,23,68,0.1)', color: 'var(--accent-red)', border: '1px solid rgba(255,23,68,0.2)' }}
                      onClick={() => {
                        setIncomingProposal(null);
                      }}
                    >
                      ❌ Recusar
                    </button>
                  </div>
                </>
              )}

              {incomingNegResult && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {negOfferAmount > 0 ? (
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        acceptIncomingProposal(incomingProposal.player, incomingProposal.buyerClub.id, negOfferAmount);
                        setIncomingProposal(null);
                      }}
                    >
                      🤝 Fechar Negócio ({formatCurrency(negOfferAmount)})
                    </button>
                  ) : null}
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setIncomingProposal(null);
                    }}
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DISCRETE SAVE SLOTS OVERLAY MODAL */}
      {savesModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1250 }}>
          <div className="modal-content" style={{ width: '360px', padding: '18px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent-gold)' }}>💾 Slots de Salvação</h3>
              <button 
                onClick={() => setSavesModalOpen(false)} 
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.4rem', cursor: 'pointer', fontWeight: 800 }}
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '14px', lineHeight: '1.4' }}>
              Salve seu progresso atual ou carregue uma campanha existente em um dos slots independentes disponíveis.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {[1, 2, 3, 4].map(slot => {
                const saveKey = `elifoot_2026_save_slot_${slot}`;
                const slotExists = !!localStorage.getItem(saveKey);
                let slotInfo = 'Vazio (Livre)';
                if (slotExists) {
                  try {
                    const data = JSON.parse(localStorage.getItem(saveKey) || '');
                    slotInfo = `${data.managerName} - ${data.clubs.find((c: any) => c.isPlayerClub)?.name || 'Time'} (Ano ${data.currentYear}, R:${data.currentRound})`;
                  } catch (e) {
                    slotInfo = 'Slot Ocupado';
                  }
                }

                return (
                  <div key={slot} style={{ background: '#121316', border: '1px solid rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--accent-green)', fontWeight: 800 }}>Slot 0{slot}</span>
                      <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{slotExists ? '💾 Salvo' : '⚪ Livre'}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slotInfo}>
                      {slotInfo}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                      <button
                        onClick={() => {
                          const dataToSave = JSON.parse(localStorage.getItem('elifoot_2026_save') || '{}');
                          if (Object.keys(dataToSave).length > 0) {
                            localStorage.setItem(saveKey, JSON.stringify(dataToSave));
                            alert(`Salvo com sucesso no Slot ${slot}!`);
                            // Force update by triggering state reset
                            setSavesModalOpen(false);
                            setSavesModalOpen(true);
                          } else {
                            alert('Nenhuma campanha ativa para salvar.');
                          }
                        }}
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '0.7rem', padding: '6px 0', borderRadius: '6px', background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.2)', color: 'var(--accent-green)', fontWeight: 700 }}
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => {
                          if (!slotExists) {
                            alert('Slot vazio!');
                            return;
                          }
                          if (confirm(`Deseja carregar a campanha do Slot ${slot}?`)) {
                            const loadedData = JSON.parse(localStorage.getItem(saveKey) || '{}');
                            loadGame(loadedData);
                            localStorage.setItem('elifoot_2026_save', JSON.stringify(loadedData));
                            setSavesModalOpen(false);
                            alert(`Slot ${slot} carregado com sucesso!`);
                          }
                        }}
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '0.7rem', padding: '6px 0', borderRadius: '6px', background: slotExists ? 'rgba(255,193,7,0.1)' : '#1e2126', border: slotExists ? '1px solid rgba(255,193,7,0.2)' : '1px solid rgba(255,255,255,0.02)', color: slotExists ? 'var(--accent-gold)' : '#9ca3af', cursor: slotExists ? 'pointer' : 'not-allowed', fontWeight: 700 }}
                        disabled={!slotExists}
                      >
                        Carregar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={() => setSavesModalOpen(false)}
              style={{ width: '100%', height: '40px', fontSize: '0.8rem', fontWeight: 700 }}
            >
              Fechar Janela
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION TABS */}
      <div className="bottom-nav">
        <button className={`nav-item ${activeTab === 0 ? 'active' : ''}`} onClick={() => setActiveTab(0)}>
          <Home />
          <span>Escritório</span>
        </button>
        <button className={`nav-item ${activeTab === 1 ? 'active' : ''}`} onClick={() => setActiveTab(1)}>
          <Users />
          <span>Elenco</span>
        </button>
        <button className={`nav-item ${activeTab === 2 ? 'active' : ''}`} onClick={() => setActiveTab(2)}>
          <TrendingUp />
          <span>Mercado</span>
        </button>
        <button className={`nav-item ${activeTab === 3 ? 'active' : ''}`} onClick={() => setActiveTab(3)}>
          <DollarSign />
          <span>Finanças</span>
        </button>
        <button className={`nav-item ${activeTab === 4 ? 'active' : ''}`} onClick={() => setActiveTab(4)}>
          <Trophy />
          <span>Classif.</span>
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
};

export default App;
