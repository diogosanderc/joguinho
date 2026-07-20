import type { Player, Club, PlayerPosition } from '../data/database';

const MIDFIELD_POSITIONS: PlayerPosition[] = ['VOL', 'MEI'];
const ATTACK_POSITIONS: PlayerPosition[] = ['PON', 'CA'];

export interface MatchEvent {
  minute: number;
  type: 'GOAL' | 'YELLOW' | 'RED' | 'INJURY' | 'SHOT_SAVED' | 'MISS';
  player?: string;
  clubId: string;
  description: string;
  isPenalty?: boolean;
  isHeader?: boolean;
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

// Auto-selects 11 starters for non-player clubs (default 4-4-2: 2 ZAG, 1 LD, 1 LE, 2 VOL, 2 MEI, 2 CA)
export const getAutoStarters = (club: Club): Player[] => {
  const fit = (pos: PlayerPosition) => club.squad.filter(p => p.position === pos && !p.isInjured).sort((a, b) => b.rating - a.rating);

  const starters: Player[] = [];
  const targets: [PlayerPosition, number][] = [['GOL', 1], ['ZAG', 2], ['LD', 1], ['LE', 1], ['VOL', 2], ['MEI', 2], ['CA', 2]];
  targets.forEach(([pos, count]) => {
    const pool = fit(pos);
    for (let i = 0; i < Math.min(count, pool.length); i++) starters.push(pool[i]);
  });

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

// Calculate defensive, midfield, and attacking forces of a team.
// Each position feeds defense/midfield/attack with a different weight:
// - GOL, ZAG: fully defensive.
// - LD, LE: split evenly between defense and attack (they cover the flank both ways).
// - VOL: the best volante anchors the defense; any extra volante feeds midfield instead.
// - MEI: mostly an attacking contributor (80%), with a smaller defensive role (20%).
// - PON, CA: fully attacking.
export const calculateTeamForces = (starters: Player[]) => {
  let defSum = 0, defWeight = 0;
  let midSum = 0, midWeight = 0;
  let atkSum = 0, atkWeight = 0;

  const addDef = (rating: number, weight: number) => { defSum += rating * weight; defWeight += weight; };
  const addMid = (rating: number, weight: number) => { midSum += rating * weight; midWeight += weight; };
  const addAtk = (rating: number, weight: number) => { atkSum += rating * weight; atkWeight += weight; };

  starters.forEach(p => {
    if (p.position === 'GOL' || p.position === 'ZAG') {
      addDef(p.rating, 1);
    } else if (p.position === 'LD' || p.position === 'LE') {
      addDef(p.rating, 0.5);
      addAtk(p.rating, 0.5);
    } else if (p.position === 'MEI') {
      addDef(p.rating, 0.2);
      addAtk(p.rating, 0.8);
    } else if (p.position === 'PON' || p.position === 'CA') {
      addAtk(p.rating, 1);
    }
  });

  // Volantes: the best one anchors the defense, extra volantes reinforce midfield
  const vols = starters.filter(p => p.position === 'VOL').sort((a, b) => b.rating - a.rating);
  vols.forEach((v, idx) => {
    if (idx === 0) addDef(v.rating, 1);
    else addMid(v.rating, 1);
  });

  const defense = defWeight > 0 ? Math.round(defSum / defWeight) : 40;
  const midfield = midWeight > 0 ? Math.round(midSum / midWeight) : 40;
  const attack = atkWeight > 0 ? Math.round(atkSum / atkWeight) : 40;
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

  const homeForces = calculateTeamForces(homeStarters);
  const awayForces = calculateTeamForces(awayStarters);

  // Base luck variation between 0.8 and 1.2 (+/- 20%)
  let homeLuck = 0.8 + Math.random() * 0.4;
  let awayLuck = 0.8 + Math.random() * 0.4;

  // "Dia Ruim" (Bad Day) - 7% chance for a favorite to perform terribly (reduced impact to 0.82)
  if (homeForces.overall > awayForces.overall + 8 && Math.random() < 0.07) {
    homeLuck *= 0.82;
  }
  if (awayForces.overall > homeForces.overall + 8 && Math.random() < 0.07) {
    awayLuck *= 0.82;
  }

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

  // 2. --- STANDINGS / RANK BOOST ---
  // Boost favorites / top placed teams chances.
  // We can look at reputation and confidence as proxies for standings.
  const homeStandingsAdv = homeClub.reputation + homeClub.confidence * 0.2;
  const awayStandingsAdv = awayClub.reputation + awayClub.confidence * 0.2;
  
  if (homeStandingsAdv > awayStandingsAdv + 10) {
    homeAtt *= 1.15;
    homeMid *= 1.15;
  } else if (awayStandingsAdv > homeStandingsAdv + 10) {
    awayAtt *= 1.15;
    awayMid *= 1.15;
  }

  // Star players boost: count star attackers/midfielders to boost attack forces
  const homeStarBoost = homeStarters.filter(p => p.isStar && [...ATTACK_POSITIONS, ...MIDFIELD_POSITIONS].includes(p.position)).length;
  const awayStarBoost = awayStarters.filter(p => p.isStar && [...ATTACK_POSITIONS, ...MIDFIELD_POSITIONS].includes(p.position)).length;
  homeAtt *= (1.0 + homeStarBoost * 0.06);
  awayAtt *= (1.0 + awayStarBoost * 0.06);

  let homeScore = 0;
  let awayScore = 0;
  const events: MatchEvent[] = [];

  const homeStats: MatchStats = { shots: 0, possession: 50, fouls: 0, corners: 0 };
  const awayStats: MatchStats = { shots: 0, possession: 50, fouls: 0, corners: 0 };

  // Track cards and injuries
  const yellowCards: Record<string, number> = {};
  const redCarded = new Set<string>();

  // Helper to choose a player for an event (weighted by rating and star status)
  const choosePlayer = (players: Player[], posFilter?: string[]) => {
    const list = posFilter 
      ? players.filter(p => posFilter.includes(p.position) && !redCarded.has(p.id))
      : players.filter(p => !redCarded.has(p.id));
    
    if (list.length === 0) return players[Math.floor(Math.random() * players.length)];
    
    // Weighted selection (stars get double weight + additional boost)
    const getWeight = (p: Player) => p.isStar ? p.rating * 3.5 : p.rating;
    const totalWeight = list.reduce((sum, p) => sum + getWeight(p), 0);
    let rand = Math.random() * totalWeight;
    for (const p of list) {
      rand -= getWeight(p);
      if (rand <= 0) return p;
    }
    return list[list.length - 1];
  };

  // Picks who scores an open-play goal. Most goals come from the attacking positions,
  // but ~15% are headers off a corner/set piece, where defenders (mainly ZAG) shine.
  const chooseGoalScorer = (starters: Player[]): { scorer: Player; isHeader: boolean } => {
    const isHeader = Math.random() < 0.15;
    if (isHeader) {
      const defenders = starters.filter(p => (p.position === 'ZAG' || p.position === 'LD' || p.position === 'LE') && !redCarded.has(p.id));
      if (defenders.length > 0) {
        // Center-backs win the aerial battle far more often than fullbacks
        const weightedPool = defenders.flatMap(p => Array(p.position === 'ZAG' ? 3 : 1).fill(p));
        return { scorer: choosePlayer(weightedPool), isHeader: true };
      }
    }
    return { scorer: choosePlayer(starters, ['CA', 'PON', 'VOL', 'MEI']), isHeader: false };
  };

  // Resolves a penalty kick: the designated taker (if set and available) takes it,
  // otherwise the best available outfield shooter steps up.
  const takePenalty = (club: Club, starters: Player[]): { taker: Player; scored: boolean; saved: boolean } => {
    const eligible = starters.filter(p => p.position !== 'GOL' && !redCarded.has(p.id));
    const pool = eligible.length > 0 ? eligible : starters.filter(p => !redCarded.has(p.id));
    const designated = club.penaltyTakerId ? pool.find(p => p.id === club.penaltyTakerId) : undefined;
    const taker = designated || choosePlayer(pool.length > 0 ? pool : starters, ['CA', 'PON', 'MEI', 'VOL']);

    const successChance = Math.min(0.92, Math.max(0.55, 0.75 + (taker.rating - 75) * 0.004));
    const scored = Math.random() < successChance;
    const saved = !scored && Math.random() < 0.6; // otherwise it goes wide/over

    return { taker, scored, saved };
  };

  // Red card penalty handler
  const applyRedCardPenalty = (isHome: boolean) => {
    if (isHome) {
      homeDef *= 0.82;
      homeMid *= 0.82;
      homeAtt *= 0.82;
    } else {
      awayDef *= 0.82;
      awayMid *= 0.82;
      awayAtt *= 0.82;
    }
  };

  // Elastic Goal Scaling: 
  // If attack is 30% higher than defense, boost scoring rate.
  let homeConversionRate = 0.35;
  let awayConversionRate = 0.35;
  
  if (homeAtt >= awayDef * 1.3) {
    homeConversionRate += 0.08;
  }
  if (awayDef <= homeAtt * 0.7) {
    homeConversionRate += 0.08;
  }
  
  if (awayAtt >= homeDef * 1.3) {
    awayConversionRate += 0.08;
  }
  if (homeDef <= awayAtt * 0.7) {
    awayConversionRate += 0.08;
  }

  // Blowout / Goleada chance check (5% chance to trigger extra attack strength if one team takes a 2-goal lead)
  let blowoutTriggered = false;

  // Match Simulation Loop (90 minutes)
  for (let min = 1; min <= 90; min++) {
    // Stat adjustments (possession flutters)
    const midSum = homeMid + awayMid;
    const currentPossession = Math.round((homeMid / midSum) * 100 + (Math.random() * 10 - 5));
    homeStats.possession = Math.max(25, Math.min(75, Math.round((homeStats.possession * (min - 1) + currentPossession) / min)));
    awayStats.possession = 100 - homeStats.possession;

    // Apply blowout booster if not already triggered
    if (!blowoutTriggered && Math.abs(homeScore - awayScore) >= 2 && Math.random() < 0.20) {
      blowoutTriggered = true;
      if (homeScore > awayScore) {
        homeAtt *= 1.30; // Home is dominating, give them chance for a blowout (goleada)
      } else {
        awayAtt *= 1.30;
      }
    }

    // Standard event check (approx 6-8 events per match)
    if (Math.random() < 0.11) {
      const homePossessionChance = homeMid / (homeMid + awayMid);
      const isHomeAttack = Math.random() < homePossessionChance;
      if (isHomeAttack) {
        // Home attacks! Compare Home Attack vs Away Defense
        homeStats.shots++;

        // A fraction of attacking sequences end in a penalty instead of a normal shot
        if (Math.random() < 0.06) {
          const { taker, scored, saved } = takePenalty(homeClub, homeStarters);
          if (scored) {
            homeScore++;
            events.push({ minute: min, type: 'GOAL', player: taker.name, clubId: homeClub.id, isPenalty: true,
              description: `Pênalti para o ${homeClub.name}! ${taker.name} cobra com categoria e converte para o gol!` });
          } else if (saved) {
            events.push({ minute: min, type: 'SHOT_SAVED', player: taker.name, clubId: homeClub.id, isPenalty: true,
              description: `Pênalti perdido! O goleiro do ${awayClub.name} adivinha o canto e defende a cobrança de ${taker.name}!` });
          } else {
            events.push({ minute: min, type: 'MISS', player: taker.name, clubId: homeClub.id, isPenalty: true,
              description: `Pênalti desperdiçado! ${taker.name} chuta para fora e desperdiça a chance!` });
          }
        } else {
          // AMPLIFY RATING INFLUENCE: Use a power factor to expand the difference between forces
          const baseAttackChance = homeAtt / (homeAtt + awayDef);
          const attackChance = Math.pow(baseAttackChance, 1.6); // Expands the advantage of higher ratings

          // Let's decide if it's a Goal, Saved, or Miss
          const attackRoll = Math.random();
          if (attackRoll < attackChance * homeConversionRate) { // Elastic conversion applied
            homeScore++;
            const { scorer, isHeader } = chooseGoalScorer(homeStarters);
            events.push({
              minute: min,
              type: 'GOAL',
              player: scorer.name,
              clubId: homeClub.id,
              isHeader,
              description: isHeader
                ? `Golaço de cabeça! Após cobrança de escanteio, ${scorer.name} sobe mais que a marcação e testa para o gol do ${homeClub.name}!`
                : `Gol do ${homeClub.name}! ${scorer.name} chuta forte de dentro da área sem chances para o goleiro!`
            });
            if (isHeader) homeStats.corners++;
          } else if (attackRoll < attackChance * 0.55) { // Saved
            const shooter = choosePlayer(homeStarters, ['CA', 'PON', 'VOL', 'MEI', 'ZAG', 'LD', 'LE']);
            events.push({
              minute: min,
              type: 'SHOT_SAVED',
              player: shooter.name,
              clubId: homeClub.id,
              description: `Defesaça! ${shooter.name} bate colocado e o goleiro do ${awayClub.name} espalma para escanteio.`
            });
            homeStats.corners++;
          } else { // Miss
            const shooter = choosePlayer(homeStarters, ['CA', 'PON', 'VOL', 'MEI', 'ZAG', 'LD', 'LE']);
            events.push({
              minute: min,
              type: 'MISS',
              player: shooter.name,
              clubId: homeClub.id,
              description: `${shooter.name} finaliza para fora após cruzamento na área.`
            });
          }
        }
      } else {
        // Away attacks! Compare Away Attack vs Home Defense
        awayStats.shots++;

        if (Math.random() < 0.06) {
          const { taker, scored, saved } = takePenalty(awayClub, awayStarters);
          if (scored) {
            awayScore++;
            events.push({ minute: min, type: 'GOAL', player: taker.name, clubId: awayClub.id, isPenalty: true,
              description: `Pênalti para o ${awayClub.name}! ${taker.name} cobra com categoria e converte para o gol!` });
          } else if (saved) {
            events.push({ minute: min, type: 'SHOT_SAVED', player: taker.name, clubId: awayClub.id, isPenalty: true,
              description: `Pênalti perdido! O goleiro do ${homeClub.name} adivinha o canto e defende a cobrança de ${taker.name}!` });
          } else {
            events.push({ minute: min, type: 'MISS', player: taker.name, clubId: awayClub.id, isPenalty: true,
              description: `Pênalti desperdiçado! ${taker.name} chuta para fora e desperdiça a chance!` });
          }
        } else {
          const baseAttackChance = awayAtt / (awayAtt + homeDef);
          const attackChance = Math.pow(baseAttackChance, 1.6);

          const attackRoll = Math.random();
          if (attackRoll < attackChance * awayConversionRate) { // Goal!
            awayScore++;
            const { scorer, isHeader } = chooseGoalScorer(awayStarters);
            events.push({
              minute: min,
              type: 'GOAL',
              player: scorer.name,
              clubId: awayClub.id,
              isHeader,
              description: isHeader
                ? `Golaço de cabeça! Após cobrança de escanteio, ${scorer.name} sobe mais que a marcação e testa para o gol do ${awayClub.name}!`
                : `Gol do ${awayClub.name}! ${scorer.name} aproveita o rebote da zaga e empurra para a rede!`
            });
            if (isHeader) awayStats.corners++;
          } else if (attackRoll < attackChance * 0.5) { // Saved
            const shooter = choosePlayer(awayStarters, ['CA', 'PON', 'VOL', 'MEI', 'ZAG', 'LD', 'LE']);
            events.push({
              minute: min,
              type: 'SHOT_SAVED',
              player: shooter.name,
              clubId: awayClub.id,
              description: `Incrível! ${shooter.name} cabeceia à queima-roupa e o goleiro do ${homeClub.name} salva com o pé.`
            });
            awayStats.corners++;
          } else { // Miss
            const shooter = choosePlayer(awayStarters, ['CA', 'PON', 'VOL', 'MEI', 'ZAG', 'LD', 'LE']);
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
    }

    // Fouls and Cards (approx 3.5% chance per minute)
    if (Math.random() < 0.035) {
      const isHomeFoul = Math.random() > 0.5;
      const offendingClub = isHomeFoul ? homeClub : awayClub;
      const offendingStarters = isHomeFoul ? homeStarters : awayStarters;

      if (isHomeFoul) homeStats.fouls++;
      else awayStats.fouls++;

      const cardRoll = Math.random();
      
      if (cardRoll < 0.25) { // Yellow Card
        const player = choosePlayer(offendingStarters, ['ZAG', 'LD', 'LE', 'VOL', 'MEI']);
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
        const player = choosePlayer(offendingStarters, ['ZAG', 'LD', 'LE', 'VOL', 'MEI']);
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

  // Decisive result enforcer (75% Decisive / 25% Draw)
  if (homeScore === awayScore && Math.random() < 0.50) {
    const homeOverall = homeForces.overall * homeAdvantage;
    const awayOverall = awayForces.overall;
    const homeWinChance = homeOverall / (homeOverall + awayOverall);
    
    // Distribute the goal across a random minute in the second half rather than always at 89'
    const randomSecondHalfMin = Math.floor(Math.random() * 40) + 46;
    if (Math.random() < homeWinChance) {
      homeScore++;
      const { scorer, isHeader } = chooseGoalScorer(homeStarters);
      events.push({
        minute: randomSecondHalfMin,
        type: 'GOAL',
        player: scorer.name,
        clubId: homeClub.id,
        isHeader,
        description: isHeader
          ? `Gol decisivo de cabeça! ${scorer.name} sobe mais que todo mundo na área e testa para o gol do ${homeClub.name} aos ${randomSecondHalfMin} minutos do segundo tempo!`
          : `Gol decisivo do ${homeClub.name}! ${scorer.name} aproveita cruzamento aos ${randomSecondHalfMin} minutos do segundo tempo!`
      });
    } else {
      awayScore++;
      const { scorer, isHeader } = chooseGoalScorer(awayStarters);
      events.push({
        minute: randomSecondHalfMin,
        type: 'GOAL',
        player: scorer.name,
        clubId: awayClub.id,
        isHeader,
        description: isHeader
          ? `Gol decisivo de cabeça! ${scorer.name} sobe mais que todo mundo na área e testa para o gol do ${awayClub.name} aos ${randomSecondHalfMin} minutos do segundo tempo!`
          : `Gol importante do ${awayClub.name}! ${scorer.name} escapa no contra-ataque e define a vitória aos ${randomSecondHalfMin} minutos!`
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
