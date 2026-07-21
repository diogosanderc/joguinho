import { isPlayerAvailable, type Player, type Club, type PlayerPosition } from '../data/database';

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
  varChecked?: boolean; // this goal (allowed or disallowed) went through a VAR offside review
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

// Lets a match be resumed partway through with an updated lineup (e.g. after a mid-match
// substitution) instead of always simulating fresh from kickoff. Events/score/stats up to
// startMinute are carried over as-is; only the remaining minutes are (re)simulated, so a
// substituted-out player genuinely can't score/get carded/etc. afterward -- the original
// one-shot simulation had no way to know about a substitution decided live in the UI.
export interface SimulateMatchOptions {
  startMinute?: number;
  initialHomeScore?: number;
  initialAwayScore?: number;
  initialHomeStats?: MatchStats;
  initialAwayStats?: MatchStats;
  priorEvents?: MatchEvent[];
  priorYellowCardCounts?: Record<string, number>;
}

// Auto-selects 11 starters for non-player clubs (default 4-4-2: 2 ZAG, 1 LD, 1 LE, 2 VOL, 2 MEI, 2 CA)
export const getAutoStarters = (club: Club): Player[] => {
  const usedIds = new Set<string>();
  const fit = (pos: PlayerPosition) => club.squad.filter(p => p.position === pos && isPlayerAvailable(p) && !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);

  const starters: Player[] = [];
  // CA falls back to PON: a winger can play as a makeshift centre-forward when the club
  // has no natural striker at all, rather than pulling in a defender/keeper as filler.
  // VOL falls back to MEI: a Meia can anchor the midfield until the club buys a Volante.
  const targets: [PlayerPosition, number, PlayerPosition?][] = [
    ['GOL', 1], ['ZAG', 2], ['LD', 1], ['LE', 1], ['VOL', 2, 'MEI'], ['MEI', 2], ['CA', 2, 'PON']
  ];
  targets.forEach(([pos, count, fallbackPos]) => {
    const pool = fit(pos);
    const take = Math.min(count, pool.length);
    for (let i = 0; i < take; i++) { starters.push(pool[i]); usedIds.add(pool[i].id); }

    const remaining = count - take;
    if (remaining > 0 && fallbackPos) {
      const fallbackPool = fit(fallbackPos);
      const take2 = Math.min(remaining, fallbackPool.length);
      for (let i = 0; i < take2; i++) { starters.push(fallbackPool[i]); usedIds.add(fallbackPool[i].id); }
    }
  });

  // Fill any remaining slots with the best available player regardless of position --
  // real squads can genuinely have gaps now (e.g. zero natural CA or PON), so this triggers often.
  if (starters.length < 11) {
    const rest = club.squad.filter(p => isPlayerAvailable(p) && !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
    const need = 11 - starters.length; // captured once -- starters.length changes inside the loop below
    for (let i = 0; i < Math.min(need, rest.length); i++) {
      starters.push(rest[i]);
      usedIds.add(rest[i].id);
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
      // Meias are the backbone of "midfield" (possession/initiative) even though their
      // defense/attack split above stays untouched — without this, teams playing with a
      // single Volante would have midfield default to a flat 40 regardless of their Meias.
      addMid(p.rating, 1);
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

// Resolves the outcome of a penalty kick for a given taker's rating.
// Baseline: 75% scored, 25% missed overall (split between off-target and saved) -- matching
// real-world penalty conversion rates. Rating and home advantage nudge it a little either way.
// Exported standalone so a live, user-chosen taker (picked from the in-match "escolher batedor"
// modal) can be resolved the same way as the auto-picked taker inside simulateMatch.
export const resolvePenaltyOutcome = (takerRating: number, isHome: boolean): { scored: boolean; saved: boolean } => {
  const ratingAdj = (takerRating - 75) * 0.0015;
  const homeBonus = isHome ? 0.02 : 0;

  let missChance = 0.10 - ratingAdj * 0.4 - homeBonus * 0.3; // off-target portion of the 25%
  let savedChance = 0.15 - ratingAdj * 0.4 - homeBonus * 0.3; // keeper-save portion of the 25%
  missChance = Math.max(0.04, Math.min(0.15, missChance));
  savedChance = Math.max(0.06, Math.min(0.20, savedChance));

  const roll = Math.random();
  const scored = roll >= missChance + savedChance;
  const saved = !scored && roll < savedChance;

  return { scored, saved };
};

// Simulates a full 90-minute match (or the remainder of one -- see SimulateMatchOptions)
export const simulateMatch = (
  homeClub: Club,
  awayClub: Club,
  homeStartersInput?: Player[],
  awayStartersInput?: Player[],
  options: SimulateMatchOptions = {}
): MatchResult => {
  const homeStarters = homeStartersInput || getAutoStarters(homeClub);
  const awayStarters = awayStartersInput || getAutoStarters(awayClub);

  const homeForces = calculateTeamForces(homeStarters);
  const awayForces = calculateTeamForces(awayStarters);

  // A player whose rating clears the bar for the division ABOVE their own club is playing
  // beneath his level and stands out for it -- extra weight in the moments that matter (goals).
  const isDivisionStandout = (rating: number, division: 'A' | 'B' | 'C') => {
    if (division === 'C') return rating >= 68; // Série B caliber playing in Série C
    if (division === 'B') return rating >= 78; // Série A caliber playing in Série B
    return false; // already in the top flight
  };
  const standoutIds = new Set<string>([
    ...homeStarters.filter(p => isDivisionStandout(p.rating, homeClub.division)).map(p => p.id),
    ...awayStarters.filter(p => isDivisionStandout(p.rating, awayClub.division)).map(p => p.id)
  ]);

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

  let homeScore = options.initialHomeScore ?? 0;
  let awayScore = options.initialAwayScore ?? 0;
  const events: MatchEvent[] = [...(options.priorEvents ?? [])];

  const homeStats: MatchStats = options.initialHomeStats ? { ...options.initialHomeStats } : { shots: 0, possession: 50, fouls: 0, corners: 0 };
  const awayStats: MatchStats = options.initialAwayStats ? { ...options.initialAwayStats } : { shots: 0, possession: 50, fouls: 0, corners: 0 };

  // Track cards and injuries -- seeded from before startMinute when resuming a match in progress
  const yellowCards: Record<string, number> = { ...(options.priorYellowCardCounts ?? {}) };
  const redCarded = new Set<string>();

  // Helper to choose a player for an event (weighted by rating and star status)
  const choosePlayer = (players: Player[], posFilter?: string[]) => {
    const list = posFilter 
      ? players.filter(p => posFilter.includes(p.position) && !redCarded.has(p.id))
      : players.filter(p => !redCarded.has(p.id));
    
    if (list.length === 0) return players[Math.floor(Math.random() * players.length)];
    
    // Weighted selection (stars get double weight + additional boost; a player who's clearly
    // playing above his division's level also stands out more, though less than a full star)
    const getWeight = (p: Player) => {
      if (p.isStar) return p.rating * 3.5;
      return standoutIds.has(p.id) ? p.rating * 1.6 : p.rating;
    };
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

  // VAR check for open-play goals: 5% get reviewed for offside, of which 3-in-5 (3% overall)
  // are confirmed offside and disallowed, and 2-in-5 (2% overall) are confirmed as valid goals.
  const checkGoalWithVar = (): { reviewed: boolean; disallowed: boolean } => {
    const reviewed = Math.random() < 0.05;
    const disallowed = reviewed && Math.random() < 0.6;
    return { reviewed, disallowed };
  };

  // Resolves a penalty kick: the designated taker (if set and available) takes it,
  // otherwise the best available outfield shooter steps up. When it's the user's team, the
  // live "escolher batedor" modal overrides this auto-pick before the outcome is revealed (see
  // resolveMidMatchPenalty in GameContext.tsx) -- this auto-taker is only what plays out for
  // AI-controlled clubs, or as the pre-baked default before the user gets a chance to override it.
  const takePenalty = (club: Club, starters: Player[], isHome: boolean): { taker: Player; scored: boolean; saved: boolean } => {
    const eligible = starters.filter(p => p.position !== 'GOL' && !redCarded.has(p.id));
    const pool = eligible.length > 0 ? eligible : starters.filter(p => !redCarded.has(p.id));
    const designated = club.penaltyTakerId ? pool.find(p => p.id === club.penaltyTakerId) : undefined;
    const taker = designated || choosePlayer(pool.length > 0 ? pool : starters, ['CA', 'PON', 'MEI', 'VOL']);

    const { scored, saved } = resolvePenaltyOutcome(taker.rating, isHome);
    return { taker, scored, saved };
  };

  // Red card penalty handler: the sent-off player's line pays the price, not the whole team evenly.
  // Defenders (GOL/ZAG/LD/LE) get covered by swapping in a fresh defender and sacrificing an
  // attacker instead, so defense holds but attack drops. Midfielders and attackers who get sent
  // off just leave their own line a man short.
  const CARD_PENALTY = 0.80;
  const applyRedCardPenalty = (isHome: boolean, position: PlayerPosition) => {
    const isDefender = position === 'GOL' || position === 'ZAG' || position === 'LD' || position === 'LE';
    const isMidfielder = position === 'VOL' || position === 'MEI';
    if (isDefender) {
      if (isHome) homeAtt *= CARD_PENALTY; else awayAtt *= CARD_PENALTY;
    } else if (isMidfielder) {
      if (isHome) homeMid *= CARD_PENALTY; else awayMid *= CARD_PENALTY;
    } else {
      if (isHome) homeAtt *= CARD_PENALTY; else awayAtt *= CARD_PENALTY;
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
  // Already-decisive gaps carried over from a resumed match shouldn't be able to re-trigger this.
  let blowoutTriggered = Math.abs(homeScore - awayScore) >= 2;

  // Match Simulation Loop (resumes from startMinute when continuing an in-progress match)
  const startMinute = options.startMinute ?? 1;
  for (let min = startMinute; min <= 90; min++) {
    // Stat adjustments (possession flutters)
    const midSum = homeMid + awayMid;
    const currentPossession = Math.round((homeMid / midSum) * 100 + (Math.random() * 10 - 5));
    homeStats.possession = Math.max(25, Math.min(75, Math.round((homeStats.possession * (min - 1) + currentPossession) / min)));
    awayStats.possession = 100 - homeStats.possession;

    // Once a 2-goal gap opens, the match swings one of two ways: the leader presses on
    // for a goleada (60%), or the trailing side finds some fight and claws momentum back
    // (40%) — without this second branch, a 2-0 lead only ever snowballed further.
    if (!blowoutTriggered && Math.abs(homeScore - awayScore) >= 2 && Math.random() < 0.20) {
      blowoutTriggered = true;
      const homeLeading = homeScore > awayScore;
      if (Math.random() < 0.6) {
        if (homeLeading) homeAtt *= 1.30; else awayAtt *= 1.30;
      } else {
        if (homeLeading) awayAtt *= 1.20; else homeAtt *= 1.20;
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
          const { taker, scored, saved } = takePenalty(homeClub, homeStarters, true);
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
            const { scorer, isHeader } = chooseGoalScorer(homeStarters);
            const { reviewed, disallowed } = checkGoalWithVar();
            if (disallowed) {
              events.push({
                minute: min,
                type: 'MISS',
                player: scorer.name,
                clubId: homeClub.id,
                varChecked: true,
                description: `Gol anulado! O VAR foi acionado e confirmou impedimento na jogada de ${scorer.name}.`
              });
            } else {
              homeScore++;
              events.push({
                minute: min,
                type: 'GOAL',
                player: scorer.name,
                clubId: homeClub.id,
                isHeader,
                varChecked: reviewed,
                description: reviewed
                  ? `Gol! Após revisão do VAR, a arbitragem confirma o lance: ${scorer.name} balança as redes para o ${homeClub.name}!`
                  : isHeader
                    ? `Golaço de cabeça! Após cobrança de escanteio, ${scorer.name} sobe mais que a marcação e testa para o gol do ${homeClub.name}!`
                    : `Gol do ${homeClub.name}! ${scorer.name} chuta forte de dentro da área sem chances para o goleiro!`
              });
              if (isHeader) homeStats.corners++;
            }
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
          const { taker, scored, saved } = takePenalty(awayClub, awayStarters, false);
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
            const { scorer, isHeader } = chooseGoalScorer(awayStarters);
            const { reviewed, disallowed } = checkGoalWithVar();
            if (disallowed) {
              events.push({
                minute: min,
                type: 'MISS',
                player: scorer.name,
                clubId: awayClub.id,
                varChecked: true,
                description: `Gol anulado! O VAR foi acionado e confirmou impedimento na jogada de ${scorer.name}.`
              });
            } else {
              awayScore++;
              events.push({
                minute: min,
                type: 'GOAL',
                player: scorer.name,
                clubId: awayClub.id,
                isHeader,
                varChecked: reviewed,
                description: reviewed
                  ? `Gol! Após revisão do VAR, a arbitragem confirma o lance: ${scorer.name} balança as redes para o ${awayClub.name}!`
                  : isHeader
                    ? `Golaço de cabeça! Após cobrança de escanteio, ${scorer.name} sobe mais que a marcação e testa para o gol do ${awayClub.name}!`
                    : `Gol do ${awayClub.name}! ${scorer.name} aproveita o rebote da zaga e empurra para a rede!`
              });
              if (isHeader) awayStats.corners++;
            }
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
        const player = choosePlayer(offendingStarters, ['ZAG', 'LD', 'LE', 'VOL', 'MEI', 'PON', 'CA']);
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
          applyRedCardPenalty(isHomeFoul, player.position);
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
        const player = choosePlayer(offendingStarters, ['ZAG', 'LD', 'LE', 'VOL', 'MEI', 'PON', 'CA']);
        redCarded.add(player.id);
        events.push({
          minute: min,
          type: 'RED',
          player: player.name,
          clubId: offendingClub.id,
          description: `Cartão vermelho direto! ${player.name} atinge o adversário por trás e está expulso!`
        });
        applyRedCardPenalty(isHomeFoul, player.position);
      }
    }

    // Injury close-call check (approx 0.5% chance per minute). Whether it actually becomes an
    // injury depends on how fatigued that specific player already is -- a well-rested player
    // shrugs it off almost every time, while someone who's been playing non-stop without rest
    // is genuinely at risk.
    if (Math.random() < 0.005) {
      const isHomeInjury = Math.random() > 0.5;
      const targetStarters = isHomeInjury ? homeStarters : awayStarters;
      const targetClub = isHomeInjury ? homeClub : awayClub;

      const injuredPlayer = choosePlayer(targetStarters);
      const fatigue = 100 - (injuredPlayer.energy ?? 100); // 0 (rested) to ~70 (exhausted)
      const injuryChance = 0.05 + (fatigue / 100) * 0.65; // 5% baseline, up to ~50% when gassed
      if (Math.random() < injuryChance) {
        events.push({
          minute: min,
          type: 'INJURY',
          player: injuredPlayer.name,
          clubId: targetClub.id,
          description: `Lesão! ${injuredPlayer.name} cai sentindo dores musculares e precisa deixar o campo.`
        });
      }
    }
  }

  // Decisive result enforcer (75% Decisive / 25% Draw)
  // Uses the same attack-vs-defense threat ratios as every other chance in the match
  // (already carrying luck, home advantage, standings and star boosts) instead of a
  // separate overall-rating ratio, so the tie-breaker's odds match the run of play.
  if (homeScore === awayScore && Math.random() < 0.50) {
    const homeThreat = homeAtt / (homeAtt + awayDef);
    const awayThreat = awayAtt / (awayAtt + homeDef);
    const totalThreat = homeThreat + awayThreat;
    const homeWinChance = totalThreat > 0 ? homeThreat / totalThreat : 0.5;

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
