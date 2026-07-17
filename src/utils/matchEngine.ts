import type { Player, Club } from '../data/database';

export interface MatchEvent {
  minute: number;
  type: 'GOAL' | 'YELLOW' | 'RED' | 'INJURY' | 'SHOT_SAVED' | 'MISS';
  player?: string;
  clubId: string;
  description: string;
}

export interface MatchStats {
  shots: number;
  possession: number;
  fouls: number;
  corners: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  homeStats: MatchStats;
  awayStats: MatchStats;
  attendance?: number;
}

// Auto-selects 11 starters for non-player clubs (default 4-4-2)
export const getAutoStarters = (club: Club): Player[] => {
  const gks = club.squad.filter(p => p.position === 'GK' && !p.isInjured).sort((a, b) => b.rating - a.rating);
  const dfs = club.squad.filter(p => p.position === 'DF' && !p.isInjured).sort((a, b) => b.rating - a.rating);
  const mfs = club.squad.filter(p => p.position === 'MF' && !p.isInjured).sort((a, b) => b.rating - a.rating);
  const fws = club.squad.filter(p => p.position === 'FW' && !p.isInjured).sort((a, b) => b.rating - a.rating);

  const starters: Player[] = [];
  if (gks[0]) starters.push(gks[0]);
  for (let i = 0; i < Math.min(4, dfs.length); i++) starters.push(dfs[i]);
  for (let i = 0; i < Math.min(4, mfs.length); i++) starters.push(mfs[i]);
  for (let i = 0; i < Math.min(2, fws.length); i++) starters.push(fws[i]);

  // If we don't have enough players (unlikely), fill with anyone who is fit
  if (starters.length < 11) {
    const ids = new Set(starters.map(p => p.id));
    const rest = club.squad.filter(p => !p.isInjured && !ids.has(p.id)).sort((a, b) => b.rating - a.rating);
    for (let i = 0; i < Math.min(11 - starters.length, rest.length); i++) {
      starters.push(rest[i]);
    }
  }

  return starters;
};

// Calculate defensive, midfield, and attacking forces of a team
export const calculateTeamForces = (starters: Player[]) => {
  const gk = starters.find(p => p.position === 'GK') || starters[0];
  const dfs = starters.filter(p => p.position === 'DF');
  const mfs = starters.filter(p => p.position === 'MF');
  const fws = starters.filter(p => p.position === 'FW');

  const gkRating = gk ? gk.rating : 40;
  
  const avgDef = dfs.length > 0 ? dfs.reduce((acc, p) => acc + p.rating, 0) / dfs.length : 40;
  const avgMid = mfs.length > 0 ? mfs.reduce((acc, p) => acc + p.rating, 0) / mfs.length : 40;
  const avgAtt = fws.length > 0 ? fws.reduce((acc, p) => acc + p.rating, 0) / fws.length : 40;

  // Defense force is weighted between GK and DFs
  const defense = Math.round(gkRating * 0.4 + avgDef * 0.6);
  const midfield = Math.round(avgMid);
  const attack = Math.round(avgAtt);
  const overall = Math.round((defense + midfield + attack) / 3);

  return { defense, midfield, attack, overall };
};

// Simulates a full 90-minute match
export const simulateMatch = (
  homeClub: Club,
  awayClub: Club,
  homeStartersInput?: Player[],
  awayStartersInput?: Player[]
): MatchResult => {
  const homeStarters = homeStartersInput || getAutoStarters(homeClub);
  const awayStarters = awayStartersInput || getAutoStarters(awayClub);

  let homeForces = calculateTeamForces(homeStarters);
  let awayForces = calculateTeamForces(awayStarters);

  // 1. --- STOCHASTIC ZEBRAS & RANDOMNESS ---
  // Base luck variation between 0.75 and 1.25 (+/- 25%)
  let homeLuck = 0.8 + Math.random() * 0.4;
  let awayLuck = 0.8 + Math.random() * 0.4;

  // "Dia Ruim" (Bad Day) - 7% chance for a favorite to perform terribly (e.g. fatigue, bad luck)
  if (homeForces.overall > awayForces.overall + 8 && Math.random() < 0.07) {
    homeLuck *= 0.7; // Major penalty to the strong home team
  }
  if (awayForces.overall > homeForces.overall + 8 && Math.random() < 0.07) {
    awayLuck *= 0.7; // Major penalty to the strong away team
  }

  // Home advantage factor (standard in football: around +5% force booster)
  // Home advantage factor depends on stadium occupancy
  const performanceRep = homeClub.confidence / 100;
  const occupancyRate = Math.max(0.0, Math.min(1.0, 0.3 + (homeClub.reputation / 100) * 0.5 + performanceRep * 0.2));
  const homeAdvantage = 1.0 + (occupancyRate * 0.15); // ranges from 1.0 to 1.15

  let homeAtt = homeForces.attack * homeLuck * homeAdvantage;
  let homeMid = homeForces.midfield * homeLuck * homeAdvantage;
  let homeDef = homeForces.defense * homeLuck * homeAdvantage;

  let awayAtt = awayForces.attack * awayLuck;
  let awayMid = awayForces.midfield * awayLuck;
  let awayDef = awayForces.defense * awayLuck;

  let homeScore = 0;
  let awayScore = 0;
  const events: MatchEvent[] = [];

  const homeStats: MatchStats = { shots: 0, possession: 50, fouls: 0, corners: 0 };
  const awayStats: MatchStats = { shots: 0, possession: 50, fouls: 0, corners: 0 };

  // Track cards and injuries
  const yellowCards: Record<string, number> = {};
  const redCarded = new Set<string>();

  // Helper to choose a player for an event (weighted by rating)
  const choosePlayer = (players: Player[], posFilter?: string[]) => {
    const list = posFilter 
      ? players.filter(p => posFilter.includes(p.position) && !redCarded.has(p.id))
      : players.filter(p => !redCarded.has(p.id));
    
    if (list.length === 0) return players[Math.floor(Math.random() * players.length)];
    
    // Weighted selection
    const totalRating = list.reduce((sum, p) => sum + p.rating, 0);
    let rand = Math.random() * totalRating;
    for (const p of list) {
      rand -= p.rating;
      if (rand <= 0) return p;
    }
    return list[list.length - 1];
  };

  // Red card penalty handler
  const applyRedCardPenalty = (isHome: boolean) => {
    if (isHome) {
      homeDef *= 0.85;
      homeMid *= 0.85;
      homeAtt *= 0.85;
    } else {
      awayDef *= 0.85;
      awayMid *= 0.85;
      awayAtt *= 0.85;
    }
  };

  // Match Simulation Loop (90 minutes)
  for (let min = 1; min <= 90; min++) {
    // Stat adjustments (possession flutters)
    const midSum = homeMid + awayMid;
    const currentPossession = Math.round((homeMid / midSum) * 100 + (Math.random() * 10 - 5));
    homeStats.possession = Math.max(25, Math.min(75, Math.round((homeStats.possession * (min - 1) + currentPossession) / min)));
    awayStats.possession = 100 - homeStats.possession;

    // Standard event check (approx 6-8 events per match)
    if (Math.random() < 0.08) {
      const homePossessionChance = homeMid / (homeMid + awayMid);
      const isHomeAttack = Math.random() < homePossessionChance;

      if (isHomeAttack) {
        // Home attacks! Compare Home Attack vs Away Defense
        homeStats.shots++;
        const attackChance = homeAtt / (homeAtt + awayDef);
        
        // Let's decide if it's a Goal, Saved, or Miss
        const attackRoll = Math.random();
        if (attackRoll < attackChance * 0.15) { // Goal!
          homeScore++;
          const scorer = choosePlayer(homeStarters, ['FW', 'MF']);
          events.push({
            minute: min,
            type: 'GOAL',
            player: scorer.name,
            clubId: homeClub.id,
            description: `Gol do ${homeClub.name}! ${scorer.name} chuta forte de dentro da área sem chances para o goleiro!`
          });
        } else if (attackRoll < attackChance * 0.5) { // Saved
          const shooter = choosePlayer(homeStarters, ['FW', 'MF', 'DF']);
          events.push({
            minute: min,
            type: 'SHOT_SAVED',
            player: shooter.name,
            clubId: homeClub.id,
            description: `Defesaça! ${shooter.name} bate colocado e o goleiro do ${awayClub.name} espalma para escanteio.`
          });
          homeStats.corners++;
        } else { // Miss
          const shooter = choosePlayer(homeStarters, ['FW', 'MF', 'DF']);
          events.push({
            minute: min,
            type: 'MISS',
            player: shooter.name,
            clubId: homeClub.id,
            description: `${shooter.name} finaliza para fora após cruzamento na área.`
          });
        }
      } else {
        // Away attacks! Compare Away Attack vs Home Defense
        awayStats.shots++;
        const attackChance = awayAtt / (awayAtt + homeDef);
        
        const attackRoll = Math.random();
        if (attackRoll < attackChance * 0.15) { // Goal!
          awayScore++;
          const scorer = choosePlayer(awayStarters, ['FW', 'MF']);
          events.push({
            minute: min,
            type: 'GOAL',
            player: scorer.name,
            clubId: awayClub.id,
            description: `Gol do ${awayClub.name}! ${scorer.name} aproveita o rebote da zaga e empurra para a rede!`
          });
        } else if (attackRoll < attackChance * 0.5) { // Saved
          const shooter = choosePlayer(awayStarters, ['FW', 'MF', 'DF']);
          events.push({
            minute: min,
            type: 'SHOT_SAVED',
            player: shooter.name,
            clubId: awayClub.id,
            description: `Incrível! ${shooter.name} cabeceia à queima-roupa e o goleiro do ${homeClub.name} salva com o pé.`
          });
          awayStats.corners++;
        } else { // Miss
          const shooter = choosePlayer(awayStarters, ['FW', 'MF', 'DF']);
          events.push({
            minute: min,
            type: 'MISS',
            player: shooter.name,
            clubId: awayClub.id,
            description: `${shooter.name} domina e chuta de longe, a bola passa raspando a trave.`
          });
        }
      }
    }

    // Fouls and Cards (approx 3% chance per minute)
    if (Math.random() < 0.035) {
      const isHomeFoul = Math.random() > 0.5;
      const offendingClub = isHomeFoul ? homeClub : awayClub;
      const offendingStarters = isHomeFoul ? homeStarters : awayStarters;

      if (isHomeFoul) homeStats.fouls++;
      else awayStats.fouls++;

      const cardRoll = Math.random();
      
      if (cardRoll < 0.25) { // Yellow Card
        const player = choosePlayer(offendingStarters, ['DF', 'MF']);
        const cards = (yellowCards[player.id] || 0) + 1;
        yellowCards[player.id] = cards;

        if (cards === 2) { // Double Yellow = Red!
          redCarded.add(player.id);
          events.push({
            minute: min,
            type: 'RED',
            player: player.name,
            clubId: offendingClub.id,
            description: `Cartão vermelho! ${player.name} recebe o segundo amarelo e é expulso de campo!`
          });
          applyRedCardPenalty(isHomeFoul);
        } else {
          events.push({
            minute: min,
            type: 'YELLOW',
            player: player.name,
            clubId: offendingClub.id,
            description: `Cartão amarelo para ${player.name} por entrada dura.`
          });
        }
      } else if (cardRoll < 0.28) { // Direct Red Card (very rare)
        const player = choosePlayer(offendingStarters, ['DF', 'MF']);
        redCarded.add(player.id);
        events.push({
          minute: min,
          type: 'RED',
          player: player.name,
          clubId: offendingClub.id,
          description: `Cartão vermelho direto! ${player.name} atinge o adversário por trás e está expulso!`
        });
        applyRedCardPenalty(isHomeFoul);
      }
    }

    // Injury check (approx 0.5% chance per minute)
    if (Math.random() < 0.005) {
      const isHomeInjury = Math.random() > 0.5;
      const targetStarters = isHomeInjury ? homeStarters : awayStarters;
      const targetClub = isHomeInjury ? homeClub : awayClub;
      
      const injuredPlayer = choosePlayer(targetStarters);
      events.push({
        minute: min,
        type: 'INJURY',
        player: injuredPlayer.name,
        clubId: targetClub.id,
        description: `Lesão! ${injuredPlayer.name} cai sentindo dores musculares e precisa deixar o campo.`
      });
    }
  }

  return {
    homeScore,
    awayScore,
    events: events.sort((a, b) => a.minute - b.minute),
    homeStats,
    awayStats,
    attendance: Math.round(homeClub.stadiumCapacity * occupancyRate)
  };
};

// Generates the round pairings for a 20-team round-robin schedule (Berger tables)
export const generateLeagueSchedule = (clubIds: string[]): { round: number; home: string; away: string }[] => {
  const schedule: { round: number; home: string; away: string }[] = [];
  const n = clubIds.length;
  
  // Clone to avoid mutation
  const teams = [...clubIds];
  
  // Berger algorithm for round-robin
  for (let round = 1; round < n; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];
      
      // Alternate home/away rounds
      if (round % 2 === 1) {
        schedule.push({ round, home, away });
      } else {
        schedule.push({ round, home: away, away: home });
      }
    }
    
    // Rotate teams (keep the first team fixed)
    teams.splice(1, 0, teams.pop()!);
  }

  // Return leg (rounds 20 to 38)
  const returnLeg: { round: number; home: string; away: string }[] = [];
  schedule.forEach(match => {
    returnLeg.push({
      round: match.round + 19,
      home: match.away,
      away: match.home
    });
  });

  return [...schedule, ...returnLeg].sort((a, b) => a.round - b.round);
};
