import React, { useState, useEffect, useRef } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { PremiumProvider, usePremium } from './context/PremiumContext';
import { PremiumPaywallModal } from './components/PremiumPaywallModal';
import type { Sponsor } from './context/GameContext';
import { CLUB_DEFINITIONS, formatCurrency, isPlayerAvailable, isClassico, FOREIGN_CLUBS, VIP_BASE_PRICE_BY_DIV, VIP_BASE_INCOME_BY_DIV, VIP_BOX_BASE_CAPACITY, VIP_BOX_MAX_CAPACITY, VIP_SEAT_COST_BY_DIV, MEDICAL_DEPT_LEVEL_NAMES, MEDICAL_DEPT_REDUCTION_BY_LEVEL, MEDICAL_DEPT_COST_BY_LEVEL_DIV, YOUTH_ACADEMY_INTERVAL_BY_LEVEL, findFallbackReplacement } from './data/database';
import { ACHIEVEMENTS } from './data/achievements';
import type { Player, Club, PlayerPosition, ForeignPlayer } from './data/database';

// GOL, ZAG, LD, LE, VOL, MEI, PON, CA -- the standard position order used to sort market/squad
// listings throughout the app.
const POSITION_ORDER: Record<PlayerPosition, number> = { GOL: 0, ZAG: 1, LD: 2, LE: 3, VOL: 4, MEI: 5, PON: 6, CA: 7 };
const byPosition = <T extends { position: PlayerPosition }>(a: T, b: T) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position];

// Formats a plain digit string as a thousands-separated number for display while it's being
// typed (e.g. "10919340" -> "10.919.340"), Brazilian-style. Any non-digit characters are
// stripped first, so it's safe to feed back in the raw value from an onChange handler.
const formatDigitsWithSeparators = (digits: string): string => {
  const clean = digits.replace(/\D/g, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// Force box color tier: gray (weak) -> yellow -> blue -> green (elite), used for the
// defesa/ataque force boxes so the color itself signals how strong the number actually is.
const getForceColor = (value: number): string => {
  if (value >= 90) return '#66BB6A'; // green
  if (value >= 71) return '#29B6F6'; // blue
  if (value >= 51) return '#FFC107'; // yellow
  return '#9CA3AF'; // gray
};

// Projected VIP box income for one home match at the club's current price -- mirrors the
// formula GameContext actually applies round to round (price above the division baseline
// trims occupancy, same as the regular ticket price).
const estimateVipIncome = (club: Club): number => {
  const basePrice = VIP_BASE_PRICE_BY_DIV[club.division] ?? 200;
  const price = club.vipTicketPrice ?? basePrice;
  const baseIncome = VIP_BASE_INCOME_BY_DIV[club.division] ?? 20000;
  const capacity = club.vipBoxCapacity ?? VIP_BOX_BASE_CAPACITY;
  let priceFactor = 1.0;
  if (club.confidence < 95) {
    const ratio = price / basePrice;
    priceFactor = Math.max(0, Math.min(1, 1 - (ratio - 1) / 2));
  }
  return Math.round(baseIncome * (capacity / VIP_BOX_BASE_CAPACITY) * (price / basePrice) * priceFactor);
};
import { calculateTeamForces } from './utils/matchEngine';
import type { MatchEvent } from './utils/matchEngine';
import { LOAN_AMOUNTS, LOAN_TERMS, LOAN_PURPOSES, getScoreLabel, getBaseInterestRate, getAvailableCredit, calculateInstallment, calculatePayoffAmount, getBankEventForYear } from './utils/loanEngine';
import { CUP_PHASE_LABEL, TWO_LEGGED_PHASES, PHASES } from './utils/cupEngine';
import { LIBERTADORES_PHASE_LABEL, LIBERTADORES_GROUP_ROUNDS, LIBERTADORES_GROUP_LABELS, calculateGroupStandings } from './utils/libertadoresEngine';
import type { LibertadoresGroupLabel } from './utils/libertadoresEngine';
import { authenticateGameCenter, reportGameCenterAchievement, restoreSavesFromCloud, mirrorSaveToCloud, removeCloudSave } from './utils/nativeServices';
import { initAds, maybeShowInterstitialAfterMatch } from './utils/ads';
import {
  Home, Users, TrendingUp, DollarSign, Trophy,
  Play, Shield, AlertTriangle, Activity, CheckCircle,
  PlusCircle, FolderOpen, Lock
} from 'lucide-react';

// Shared styling for the Mercado tab's filter dropdowns (source/position/league/club selects) --
// a single consistent look instead of each one hand-rolling its own inline style object.
const PERSONALITY_ICON: Record<'LIDER' | 'TEMPERAMENTAL' | 'DECISIVO', string> = {
  LIDER: '🎖️', TEMPERAMENTAL: '😠', DECISIVO: '🥶'
};
const PERSONALITY_LABEL: Record<'LIDER' | 'TEMPERAMENTAL' | 'DECISIVO', string> = {
  LIDER: 'Líder: dá um pequeno bônus de força ao time quando titular',
  TEMPERAMENTAL: 'Temperamental: mais propenso a cartões',
  DECISIVO: 'Decisivo: rende mais em finais e mata-matas'
};

// Fictional sponsor brands offered for the Master/Costas/Mangas jersey slots -- picked
// deterministically per club+round (not Math.random()) so the offer doesn't change name every
// time this component re-renders while the user sits on the Finanças tab, but still varies
// week to week and across different careers/clubs.
const SPONSOR_BRAND_NAMES = [
  'BetMax', 'GolBet', 'Aposta10', 'PayFut',
  'BancoNova', 'CashPix', 'CredNow',
  'Cerveja Real', 'Gelada Premium',
  'VoltEnergia', 'LuzForte Energia',
  'ConectaTel', 'FalaMais Telecom',
  'SeguraVida Seguros', 'ProtegeMax Seguros',
  'RotaExpress Logística', 'EntregaJá',
  'TurboMotors', 'SaúdePlena', 'MegaVarejo'
];

const hashSeed = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

const pickSponsorBrand = (seed: string, exclude: string[] = []): string => {
  const pool = SPONSOR_BRAND_NAMES.filter(n => !exclude.includes(n));
  const options = pool.length > 0 ? pool : SPONSOR_BRAND_NAMES;
  return options[hashSeed(seed) % options.length];
};

// Soccer-ball icon used in the live-match goal ticker -- a plain currentColor path (traced from
// the app's own ball artwork) so it can be recolored per scorer (green for the user's club,
// white for the AI opponent) instead of the fixed-color ⚽ emoji it replaces.
const BallIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="820 250 2050 2050" width="12" height="12" style={{ flexShrink: 0, color }}>
    <path fill="currentColor" d="M 2228.691406 1060.359375 C 2225.179688 1063.089844 2221.648438 1065.839844 2218.109375 1068.609375 C 2214.078125 1066.230469 2210.058594 1063.859375 2206.050781 1061.511719 L 2206.019531 1061.519531 L 2203.648438 1463.421875 C 2207.460938 1461 2211.261719 1458.578125 2215.050781 1456.148438 L 2226.351562 1464.878906 L 2228.710938 1060.359375 Z M 2779.070312 1059.460938 C 2756.128906 1077.820312 2738.96875 1094.980469 2727.578125 1110.949219 C 2732.21875 1176.441406 2734.46875 1226.25 2734.351562 1260.398438 C 2734.628906 1291.101562 2733.03125 1336.851562 2729.558594 1397.660156 C 2729.550781 1397.671875 2729.539062 1397.679688 2729.53125 1397.691406 C 2729.191406 1404.011719 2728.808594 1410.488281 2728.410156 1417.128906 C 2730.449219 1420.109375 2732.71875 1423.179688 2735.25 1426.320312 C 2745.699219 1439.289062 2760.359375 1453.609375 2779.230469 1469.261719 C 2793.671875 1402.53125 2801.191406 1333.230469 2801 1262.160156 C 2800.820312 1192.609375 2793.269531 1124.800781 2779.089844 1059.460938 Z M 2476.410156 871.058594 C 2478.148438 874.558594 2479.910156 878.101562 2481.679688 881.679688 C 2476.550781 884.871094 2471.378906 888.109375 2466.171875 891.410156 C 2521.828125 924.761719 2575.148438 958.75 2619.488281 998.320312 C 2661.511719 1035.828125 2695.648438 1078.53125 2728.410156 1122.929688 C 2728.140625 1119 2727.859375 1115 2727.578125 1110.949219 C 2730.640625 1106.660156 2734.121094 1102.289062 2738.011719 1097.820312 C 2707.410156 1056.96875 2674.488281 1016.980469 2634.609375 981.378906 C 2588.300781 940.050781 2532.808594 904.828125 2476.429688 871.058594 Z M 1859.339844 523.578125 L 1858.101562 547.960938 C 1854.628906 635.851562 1843.699219 734.351562 1825.320312 843.46875 C 1939.660156 906.679688 2070.589844 981.71875 2218.109375 1068.609375 C 2315.101562 992.851562 2402.960938 930.539062 2481.679688 881.679688 C 2430.808594 779.050781 2393.441406 708.828125 2369.609375 671.039062 C 2345.480469 630.828125 2310.890625 584.039062 2265.851562 530.671875 C 2177.109375 518.320312 2110.121094 512.019531 2064.871094 511.761719 C 2019.78125 510.449219 1951.269531 514.390625 1859.339844 523.578125 M 2314.851562 427.851562 L 2253.050781 528.910156 C 2257.269531 529.480469 2261.539062 530.070312 2265.851562 530.671875 C 2268.339844 533.609375 2270.789062 536.539062 2273.21875 539.441406 L 2334.429688 439.339844 C 2327.96875 435.429688 2321.449219 431.601562 2314.871094 427.851562 Z M 1544.941406 408.609375 C 1544.160156 411.121094 1543.359375 413.558594 1542.539062 415.929688 L 1540.601562 422 C 1535.460938 424.191406 1530.429688 426.359375 1525.5 428.511719 C 1590.359375 438.660156 1653.46875 450.050781 1710.53125 469.75 C 1763.339844 487.988281 1811.191406 513.421875 1858.460938 540.78125 L 1859.339844 523.578125 C 1863.578125 523.160156 1867.769531 522.738281 1871.910156 522.339844 C 1823.558594 494.269531 1773.480469 467.46875 1717.941406 448.289062 C 1663.789062 429.589844 1604.640625 418.21875 1544.941406 408.609375 Z M 1556.820312 343.359375 C 1419 385.359375 1294.320312 457.429688 1190.398438 551.898438 C 1206.71875 562 1226.441406 569.75 1249.558594 575.171875 L 1249.558594 575.179688 C 1249.558594 575.171875 1249.558594 575.171875 1249.558594 575.171875 C 1254.160156 576.25 1258.878906 577.230469 1263.738281 578.121094 C 1267.800781 575.398438 1271.789062 572.730469 1275.71875 570.109375 C 1275.71875 570.109375 1275.71875 570.109375 1275.71875 570.101562 L 1275.730469 570.109375 C 1338.609375 528.140625 1384.351562 499.261719 1412.949219 483.46875 C 1444.078125 465.550781 1486.628906 445.058594 1540.601562 422 L 1542.539062 415.929688 C 1549.210938 396.808594 1553.980469 372.621094 1556.828125 343.359375 Z M 1275.710938 570.109375 C 1271.789062 572.730469 1267.800781 575.398438 1263.738281 578.121094 C 1258.890625 577.230469 1254.160156 576.25 1249.570312 575.179688 C 1227.128906 635.160156 1206.640625 695.328125 1196.101562 753.578125 C 1185.820312 810.339844 1185.011719 865.058594 1186.460938 918.691406 C 1188.488281 915.78125 1190.558594 912.859375 1192.640625 909.898438 C 1198.140625 912.5 1203.640625 915.078125 1209.140625 917.640625 C 1207.730469 864.808594 1208.570312 812.121094 1218.441406 757.621094 C 1229.390625 697.179688 1251.480469 634.21875 1275.730469 570.109375 Z M 1827.441406 830.679688 C 1682.519531 913.558594 1544.230469 992.671875 1478.410156 1030.671875 C 1482.488281 1032.191406 1486.570312 1033.710938 1490.648438 1035.21875 L 1489.980469 1050.199219 C 1555.769531 1012.230469 1693.640625 933.351562 1838.25 850.640625 C 1833.929688 848.230469 1829.609375 845.839844 1825.320312 843.46875 C 1826.039062 839.191406 1826.75 834.929688 1827.449219 830.679688 Z M 1192.640625 909.898438 C 1130.949219 997.46875 1089.539062 1060.480469 1068.410156 1098.929688 C 1045.558594 1138.320312 1020.980469 1192.089844 994.6875 1260.210938 C 1030.71875 1350.769531 1059.921875 1415.5 1082.289062 1454.390625 C 1103.878906 1494.421875 1140.609375 1548.078125 1192.488281 1615.363281 C 1296.109375 1567.851562 1394.199219 1524.441406 1486.75 1485.128906 C 1481.519531 1339.890625 1482.289062 1201.898438 1489.039062 1071.160156 L 1490.648438 1035.21875 C 1390.53125 998.199219 1291.191406 956.429688 1192.640625 909.898438 Z M 999.675781 1247.390625 L 875.074219 1249.101562 C 874.984375 1255.128906 874.945312 1261.171875 874.960938 1267.230469 C 874.964844 1268.75 874.972656 1270.28125 874.984375 1271.808594 L 998.636719 1270.109375 C 997.332031 1266.839844 996.015625 1263.539062 994.6875 1260.210938 C 996.359375 1255.878906 998.023438 1251.609375 999.683594 1247.390625 Z M 1185.628906 1606.4375 C 1186.769531 1671.589844 1189.269531 1736.574219 1200.378906 1795.753906 C 1210.890625 1851.796875 1229.089844 1902.414062 1248.601562 1951.335938 C 1254.589844 1950.082031 1260.089844 1949.121094 1265.089844 1948.464844 L 1274.261719 1954.300781 C 1253.160156 1902.101562 1233.621094 1849.789062 1222.691406 1791.5625 C 1212.050781 1734.875 1209.519531 1672.34375 1208.371094 1608.097656 C 1203.089844 1610.507812 1197.789062 1612.929688 1192.488281 1615.363281 C 1190.179688 1612.359375 1187.890625 1609.386719 1185.640625 1606.4375 Z M 1486.210938 1469.070312 L 1486.210938 1469.078125 C 1486.378906 1474.421875 1486.558594 1479.769531 1486.75 1485.128906 C 1483.28125 1486.609375 1479.789062 1488.089844 1476.300781 1489.578125 L 1825.671875 1691.71875 C 1824.570312 1687.007812 1823.429688 1682.390625 1822.269531 1677.875 C 1826.710938 1675.65625 1831.128906 1673.433594 1835.550781 1671.210938 L 1486.21875 1469.070312 Z M 2215.050781 1456.148438 L 2239.21875 1474.828125 C 2329.589844 1545.148438 2407.808594 1602.542969 2473.871094 1646.996094 C 2419.820312 1774.429688 2374.050781 1861.136719 2336.539062 1907.121094 C 2320.621094 1929.464844 2297.488281 1959.671875 2267.160156 1997.746094 C 2174.109375 2008.910156 2104.980469 2014.488281 2059.769531 2014.472656 C 2014.328125 2015.453125 1947.480469 2011.328125 1859.230469 2002.09375 C 1854.75 1864.394531 1842.429688 1756.320312 1822.269531 1677.875 C 1963.769531 1607.109375 2094.699219 1533.199219 2215.050781 1456.148438 M 1858.621094 1985.328125 C 1815.578125 2005.53125 1745.261719 2035.785156 1682.199219 2056.523438 C 1626.109375 2074.96875 1575.640625 2085.9375 1525.929688 2095.457031 C 1529.679688 2097.308594 1533.480469 2099.1875 1537.351562 2101.089844 L 1541.820312 2115.503906 C 1588.289062 2106.394531 1636.339844 2095.507812 1689.289062 2078.089844 C 1755.941406 2056.171875 1830.171875 2023.972656 1873.230469 2003.539062 C 1868.628906 2003.070312 1863.960938 2002.589844 1859.230469 2002.09375 C 1859.039062 1996.457031 1858.839844 1990.867188 1858.640625 1985.328125 Z M 1265.089844 1948.464844 C 1260.078125 1949.121094 1254.578125 1950.082031 1248.589844 1951.339844 C 1230.878906 1955.054688 1208.890625 1961.382812 1182.609375 1970.328125 C 1287.761719 2068.015625 1414.75 2142.480469 1555.410156 2185.59375 C 1551.640625 2155.675781 1547.210938 2132.621094 1542.109375 2116.4375 L 1537.351562 2101.089844 C 1533.480469 2099.1875 1529.679688 2097.308594 1525.941406 2095.457031 L 1525.929688 2095.460938 C 1466.121094 2065.84375 1422.101562 2043.023438 1393.859375 2026.988281 C 1359.890625 2007.894531 1320.441406 1983.933594 1275.519531 1955.097656 L 1274.28125 1954.308594 L 1274.261719 1954.3125 C 1274.261719 1954.304688 1274.261719 1954.304688 1274.261719 1954.300781 Z M 1835.441406 301.671875 C 2367.308594 300.269531 2799.601562 730.300781 2801 1262.160156 C 2802.398438 1794.015625 2372.378906 2226.3125 1840.519531 2227.710938 C 1308.660156 2229.113281 876.359375 1799.089844 874.960938 1267.230469 C 873.558594 735.371094 1303.589844 303.070312 1835.441406 301.671875 Z M 1835.390625 278.960938 C 1290.980469 280.398438 850.824219 722.890625 852.257812 1267.289062 C 853.691406 1811.6875 1296.179688 2251.847656 1840.578125 2250.414062 C 2384.980469 2248.980469 2825.140625 1806.496094 2823.710938 1262.101562 C 2822.269531 717.691406 2379.789062 277.53125 1835.390625 278.960938 Z M 2274.53125 1988.488281 C 2272.121094 1991.523438 2269.660156 1994.605469 2267.160156 1997.746094 C 2262.878906 1998.257812 2258.648438 1998.761719 2254.480469 1999.25 L 2315.550781 2101.148438 C 2322.121094 2097.390625 2328.640625 2093.558594 2335.109375 2089.652344 Z M 2729.511719 1397.71875 C 2687.398438 1448.46875 2645.25 1497.96875 2596.511719 1540.519531 C 2547.890625 1582.949219 2492.46875 1618.671875 2460.730469 1638.105469 C 2465.171875 1641.125 2469.550781 1644.089844 2473.871094 1646.996094 C 2472 1651.410156 2470.140625 1655.777344 2468.289062 1660.09375 C 2499.488281 1641.136719 2559.121094 1603.292969 2611.441406 1557.621094 C 2656.988281 1517.859375 2696.789062 1472.339844 2735.238281 1426.328125 C 2732.71875 1423.179688 2730.449219 1420.109375 2728.410156 1417.128906 C 2728.808594 1410.5 2729.179688 1404.03125 2729.53125 1397.71875 Z M 2729.511719 1397.71875" />
  </svg>
);

// Potencial oculto: never shown as a flat number until the player is well-scouted (enough
// games started) -- narrows from "observando" to a range to the exact hidden ceiling.
const getPotentialDisplay = (player: Player): string | null => {
  if (!player.potentialRating) return null;
  const games = player.scoutingGames ?? 0;
  if (games < 5) return '🔭 Potencial: observando...';
  if (games < 15) {
    const lo = Math.max(player.rating, player.potentialRating - 8);
    const hi = Math.min(99, player.potentialRating + 8);
    return `🔭 Potencial: ${lo}-${hi}`;
  }
  return `🔭 Potencial: ${player.potentialRating}`;
};

const marketSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#121316',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: 'white',
  fontSize: '0.85rem'
};
const marketSelectLabelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#9ca3af',
  fontWeight: 700,
  letterSpacing: '0.3px',
  textTransform: 'uppercase'
};

// First-time interactive tutorial: one step per bottom-nav tab, in tour order. Each step names
// the tab the player is currently looking at (tabIndex) and the one they must tap next to
// advance (nextTabIndex), so the tour is driven by real navigation instead of a "Next" button.
const TUTORIAL_STEPS: { tabIndex: number; title: string; text: string; nextTabIndex: number | null }[] = [
  { tabIndex: 0, title: 'Escritório', text: 'Aqui você acompanha o feed de notícias do seu clube e do campeonato, e inicia a partida da rodada.', nextTabIndex: 1 },
  { tabIndex: 1, title: 'Elenco', text: 'Monte sua escalação, mude a tática, renove contratos e cuide da condição dos jogadores.', nextTabIndex: 2 },
  { tabIndex: 2, title: 'Mercado', text: 'Compre e venda jogadores livres, de times brasileiros ou de ligas estrangeiras.', nextTabIndex: 3 },
  { tabIndex: 3, title: 'Finanças', text: 'Controle o caixa do clube, ingressos, patrocínios, empréstimos e o estádio.', nextTabIndex: 4 },
  { tabIndex: 4, title: 'Classificação', text: 'Veja a tabela do campeonato, artilheiros e o histórico da sua carreira. Pronto, agora é com você!', nextTabIndex: null }
];

// Wrapper to enable context access
const AppContent: React.FC = () => {
  const {
    gameState, managerName, currentYear, currentRound, clubs, userClubId, userClub,
    schedule, marketPlayers, offers, news, history, careerStats, stadiumUpgrade, vipBoxUpgrade, medicalDeptUpgrade, youthAcademyUpgrade, activeSponsors,
    currentMatch, currentMatchResult, cupState, startCupMatch, cupDrawReveal, dismissCupDrawReveal, championCelebration, dismissChampionCelebration, libertadoresState, startLibertadoresMatch, libertadoresDrawReveal, dismissLibertadoresDrawReveal, mundialClubs, mundialState, startMundialMatch, mundialDrawReveal, dismissMundialDrawReveal, sponsorAlert, dismissSponsorAlert, premiumCompetitionAlert, dismissPremiumCompetitionAlert, penaltyShootout, takePenaltyShootoutKick, finalizePenaltyShootout, foreignMarketPlayers, foreignPlayerPool, boughtForeignIds, buyForeignPlayer, libertadoresClubs, buyLibertadoresPlayer, currentSlot, getFreeSlot, startGame, nextRound, buyPlayer, sellPlayer, attemptSellPlayer, retirePlayer,
    upgradeStadium, buildVipBoxes, upgradeVipBoxes, upgradeMedicalDept, upgradeYouthAcademy, requestLoan, payOffLoanEarly, renegotiateLoanAction, signSponsor, acceptJobOffer, stayAtClub, resetGame, setGameState, clearCurrentMatch, resimulateMidMatch, resolveMidMatchPenalty,
    makeBidForPlayer, buyPlayerFromClub, manualSave, updateTicketPrice, updateVipPrice, renewContract, acceptIncomingProposal, loadGame, cancelSponsor, resolvePlayerDissatisfaction,
    formerClubName, requestResignation, simulateUnemployedRound, acceptMidSeasonJobOffer
  } = useGame();

  const { isPremium } = usePremium();
  const [premiumPaywallReason, setPremiumPaywallReason] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState(0); // 0: Escritorio, 1: Elenco, 2: Mercado, 3: Finanças, 4: Classificação

  // Main menu states (New Game / Load Game)
  const [menuView, setMenuView] = useState<'ROOT' | 'LOAD'>('ROOT');
  const [, setSlotRefreshTick] = useState(0); // bumped to force re-reading save slots from localStorage
  const [overwriteSlotPicker, setOverwriteSlotPicker] = useState<{ name: string; clubId: string } | null>(null);

  // Always land on the root menu (not a leftover "Load Game" sub-view) whenever we arrive at the main menu
  useEffect(() => {
    if (gameState === 'MENU') setMenuView('ROOT');
  }, [gameState]);

  // On cold start: sign in to Game Center in the background, and pull down any save/tactics
  // slots that exist in iCloud but not on this device (e.g. after a reinstall or new phone).
  // Both are silent no-ops outside iOS. Never overwrites a slot that already has local data.
  useEffect(() => {
    authenticateGameCenter();
    restoreSavesFromCloud().then(restored => {
      if (restored > 0) setSlotRefreshTick(t => t + 1);
    });
    initAds();
  }, []);

  // Syncs the in-app Conquistas list to real Apple Game Center achievements. ACHIEVEMENTS is
  // derived (evaluated fresh against careerStats, never separately "unlocked and stored" -- see
  // its own comment), so there's no discrete "just unlocked" event to hook into; instead this
  // diffs against a locally persisted set of already-reported ids every time careerStats changes,
  // reporting (and marking as reported) whatever's newly true. Device-level, not save-slot-scoped,
  // since Game Center achievements belong to the Apple ID, not any one career.
  useEffect(() => {
    const key = 'retrofoot_2026_gc_achievements_reported';
    let reported: string[] = [];
    try {
      reported = JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      reported = [];
    }
    const newlyUnlocked = ACHIEVEMENTS.filter(a => !reported.includes(a.id) && a.check(careerStats));
    if (newlyUnlocked.length === 0) return;
    newlyUnlocked.forEach(a => reportGameCenterAchievement(a.id));
    localStorage.setItem(key, JSON.stringify([...reported, ...newlyUnlocked.map(a => a.id)]));
  }, [careerStats]);

  // Starting state states
  const [inputName, setInputName] = useState('');
  const [selectedStartClubId, setSelectedStartClubId] = useState('');
  const [selectedStartDivision, setSelectedStartDivision] = useState<'A' | 'B' | 'C'>('C');
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  // Entrevista Coletiva only shows before a clássico (league) or a final (Copa/Libertadores) --
  // this tracks which of those three contexts triggered it, so the tone picker knows which
  // start-match function to call afterward. null = not showing.
  const [pressConferenceContext, setPressConferenceContext] = useState<'LEAGUE' | 'CUP' | 'LIBERTADORES' | null>(null);

  // Squad selection states
  const [selectedTactic, setSelectedTactic] = useState<'4-4-2' | '3-5-2' | '4-3-3'>('4-4-2');
  const [starters, setStarters] = useState<Player[]>([]);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subslotIndex, setSubslotIndex] = useState<number | null>(null);

  // Standings filter states
  const [standingsTab, setStandingsTab] = useState<'A' | 'B' | 'C'>('C');
  const [standingsCompetition, setStandingsCompetition] = useState<'NACIONAL' | 'LIBERTADORES'>('NACIONAL');
  const [libertadoresStandingsGroup, setLibertadoresStandingsGroup] = useState<LibertadoresGroupLabel>('A');
  const [statsView, setStatsView] = useState<'TABLE' | 'STATS' | 'GAMES' | 'HISTORY' | 'ACHIEVEMENTS'>('TABLE');

  // Whenever the user's club actually changes division (promotion/relegation at season
  // rollover, or picking a new club), snap the Classificação tab to that division -- otherwise
  // it keeps showing whatever division was last viewed, even after moving up/down a tier.
  useEffect(() => {
    if (userClub) {
      setStandingsTab(userClub.division);
    }
  }, [userClub?.division]);

  // Market filter states
  const [marketPosFilter, setMarketPosFilter] = useState<'ALL' | PlayerPosition>('ALL');
  const [marketSearchQuery, setMarketSearchQuery] = useState('');

  // Bank loan request form state
  const [loanAmountIdx, setLoanAmountIdx] = useState(2); // default R$ 20M
  const [loanTermIdx, setLoanTermIdx] = useState(2); // default 36 rounds
  const [loanPurposeIdx, setLoanPurposeIdx] = useState(0);

  // Snap the selected loan amount down whenever it stops fitting the club's credit limit
  // (score dropped, a loan was taken, etc.) -- otherwise the form keeps a now-unaffordable
  // amount selected, and it's not obvious from the button alone that it's disabled.
  useEffect(() => {
    if (!userClub) return;
    const score = userClub.financialScore ?? 70;
    const outstandingDebt = (userClub.loans ?? []).reduce((sum, l) => sum + l.balance, 0);
    const availableCredit = getAvailableCredit(score, userClub.lastSeasonRevenue ?? 1000000, outstandingDebt);
    if (LOAN_AMOUNTS[loanAmountIdx] > availableCredit) {
      const affordableIdx = LOAN_AMOUNTS.reduce((best, amt, idx) => (amt <= availableCredit ? idx : best), -1);
      setLoanAmountIdx(affordableIdx >= 0 ? affordableIdx : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userClub?.financialScore, userClub?.lastSeasonRevenue, userClub?.loans]);

  // Match Simulation variables
  const [simMinute, setSimMinute] = useState(0);
  const [simScoreHome, setSimScoreHome] = useState(0);
  const [simScoreAway, setSimScoreAway] = useState(0);
  const [simEvents, setSimEvents] = useState<any[]>([]);
  const [simSpeedMode, setSimSpeedMode] = useState<'LENTO' | 'MEDIO' | 'RAPIDO'>('LENTO');
  const simSpeed = simSpeedMode === 'LENTO' ? 250 : simSpeedMode === 'MEDIO' ? 100 : 35;
  const [isSimPaused, setIsSimPaused] = useState(false);
  const [matchDone, setMatchDone] = useState(false);

  // Mid-match substitution variables
  const [midMatchSubModal, setMidMatchSubModal] = useState(false);
  const [midMatchStarters, setMidMatchStarters] = useState<Player[]>([]);
  const [subsUsed, setSubsUsed] = useState(0);
  const MAX_SUBS = 5;

  // Half-time and red-card modals
  const [halftimeModalOpen, setHalftimeModalOpen] = useState(false);
  const [halftimeShown, setHalftimeShown] = useState(false);
  const [redCardModalOpen, setRedCardModalOpen] = useState(false);
  const [lastRedCardMinute, setLastRedCardMinute] = useState(-1);
  const [redCardPlayer, setRedCardPlayer] = useState<Player | null>(null);
  const [injuryModalOpen, setInjuryModalOpen] = useState(false);
  const [lastInjuryMinute, setLastInjuryMinute] = useState(-1);
  const [injuryPlayer, setInjuryPlayer] = useState<Player | null>(null);
  const [savesModalOpen, setSavesModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [sellPriceModal, setSellPriceModal] = useState<Player | null>(null);
  const [sellPriceDigits, setSellPriceDigits] = useState('');
  const [sellPriceInputError, setSellPriceInputError] = useState('');
  const [sellResult, setSellResult] = useState<{ success: boolean; text: string } | null>(null);

  // Penalty and VAR suspense modals. For the user's own penalties, 'CHOOSE' comes first so the
  // manager picks who takes it live; then (for both sides) 'WAITING' shows the setup/analysis
  // beat, and after a few seconds flips to 'RESULT' (which is also when the event actually gets
  // committed to the feed/score), then auto-closes.
  const [penaltyModalOpen, setPenaltyModalOpen] = useState(false);
  const [penaltyPhase, setPenaltyPhase] = useState<'CHOOSE' | 'WAITING' | 'RESULT'>('WAITING');
  const [penaltyEvent, setPenaltyEvent] = useState<MatchEvent | null>(null);
  const [chosenPenaltyTakerId, setChosenPenaltyTakerId] = useState<string | null>(null);
  const [varModalOpen, setVarModalOpen] = useState(false);
  const [varPhase, setVarPhase] = useState<'WAITING' | 'RESULT'>('WAITING');
  const [varEvent, setVarEvent] = useState<MatchEvent | null>(null);

  // Copa do Brasil draw reveal: briefly cycles random club names (like a live TV draw) before
  // landing on the real opponent, whenever a fresh phase pairs the user up with someone new.
  const [drawAnimating, setDrawAnimating] = useState(false);
  const [drawDisplayName, setDrawDisplayName] = useState('');
  useEffect(() => {
    if (!cupDrawReveal) return;
    // The Final has no real draw -- the opponent is always whoever legitimately won the other
    // semifinal, only the home/away side is a coin-flip -- so skip the "shuffling names" bit
    // there, since cycling through random unrelated clubs would misleadingly suggest the
    // opponent itself was up for chance.
    if (cupDrawReveal.phase === 'FINAL') {
      setDrawAnimating(false);
      return;
    }
    setDrawAnimating(true);
    const pool = clubs.filter(c => c.id !== userClubId && c.id !== cupDrawReveal.opponentId).map(c => c.name);
    const interval = setInterval(() => {
      setDrawDisplayName(pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : '???');
    }, 90);
    const stop = setTimeout(() => {
      clearInterval(interval);
      setDrawAnimating(false);
    }, 1600);
    return () => { clearInterval(interval); clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupDrawReveal]);

  // Auto-advances the live penalty shootout one kick at a time -- re-fires every time
  // penaltyShootout changes (a kick just landed), scheduling the next one after a beat so the
  // manager watches it unfold instead of getting an instant final score.
  useEffect(() => {
    if (!penaltyShootout || penaltyShootout.decided) return;
    const t = setTimeout(() => { takePenaltyShootoutKick(); }, penaltyShootout.kicks.length === 0 ? 900 : 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penaltyShootout]);

  // Vibration for the live match -- off by default (no UI to toggle for now), read once from
  // its own localStorage key in case a settings UI opts a user back in later.
  const vibrationEnabled = localStorage.getItem('retrofoot_2026_vibration_enabled') === 'true';

  const vibrateGoal = () => {
    if (vibrationEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  };

  // Sponsors list generator (deterministic based on club reputation)
  const [sponsorProposals, setSponsorProposals] = useState<Sponsor[]>([]);

  // Market Search & Negotiation states
  const [marketViewMode, setMarketViewMode] = useState<'FREE_AGENTS' | 'CLUBS' | 'FOREIGN'>('FREE_AGENTS');
  // The cached Premium flag seeds isPremium optimistically on mount (see PremiumContext), so a
  // stale "true" can let a non-Premium device briefly land on Mercado Internacional before the
  // real StoreKit check resolves to false -- kick them back out the moment that happens instead
  // of leaving the tab open until the next manual dropdown change.
  useEffect(() => {
    if (marketViewMode === 'FOREIGN' && !isPremium) {
      setMarketViewMode('CLUBS');
    }
  }, [isPremium]);
  const [selectedSearchDiv, setSelectedSearchDiv] = useState<'A' | 'B' | 'C'>('C');
  const [selectedSearchClubId, setSelectedSearchClubId] = useState<string>('');
  const [foreignBrowseMode, setForeignBrowseMode] = useState<'SAMPLE' | 'BY_CLUB'>('SAMPLE');
  const FOREIGN_LEAGUES = [
    'Premier League', 'Serie A', 'Bundesliga', 'La Liga', 'Ligue 1', 'Saudi Pro League',
    'Primeira Liga', 'Eredivisie', 'Super Lig', 'Liga Russa', 'Liga Belga', 'MLS',
    'Liga Argentina', 'Liga Boliviana', 'Liga Chilena', 'Liga Colombiana', 'Liga Equatoriana',
    'Liga Paraguaia', 'Liga Peruana', 'Liga Uruguaia', 'Liga Venezuelana'
  ] as const;
  const [selectedForeignLeague, setSelectedForeignLeague] = useState<typeof FOREIGN_LEAGUES[number]>('Premier League');
  const [selectedForeignClub, setSelectedForeignClub] = useState<string>('');
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
  const [incomingProposal, setIncomingProposal] = useState<{ player: Player; buyerClub: { id: string; name: string; league?: string }; amount: number } | null>(null);
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

  // Player condition badge: green (Bom/Ótimo) for players in good shape or improving,
  // red (Ruim) for players trending down and not recommended to field right now.
  const getPlayerCondition = (trend?: 'UP' | 'DOWN' | 'NEUTRAL') => {
    if (trend === 'DOWN') return { label: 'Ruim', arrow: '↓', color: 'var(--accent-red)', bg: 'rgba(255, 23, 68, 0.12)', border: 'rgba(255, 23, 68, 0.25)' };
    if (trend === 'UP') return { label: 'Ótimo', arrow: '↑', color: 'var(--accent-green)', bg: 'rgba(0, 230, 118, 0.18)', border: 'rgba(0, 230, 118, 0.35)' };
    return { label: 'Bom', arrow: '↑', color: 'var(--accent-green)', bg: 'rgba(0, 230, 118, 0.08)', border: 'rgba(0, 230, 118, 0.2)' };
  };

  const ConditionBadge: React.FC<{ trend?: 'UP' | 'DOWN' | 'NEUTRAL' }> = ({ trend }) => {
    const c = getPlayerCondition(trend);
    return (
      <span style={{
        fontSize: '0.62rem',
        fontWeight: 800,
        padding: '1px 6px',
        borderRadius: '6px',
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        whiteSpace: 'nowrap'
      }}>
        {c.arrow} {c.label}
      </span>
    );
  };

  const [startersPerTactic, setStartersPerTactic] = useState<Record<string, Player[]>>({});
  const [lastUserClubId, setLastUserClubId] = useState('');

  // Tactic/lineup choices (selected formation + whatever "Escalar Melhores"/"Poupar Cansados"/
  // manual edits produced per tactic) aren't part of the main save blob -- they live here in
  // local state. Persist them to their own localStorage entry per slot so switching tabs,
  // reloading, or coming back to a save doesn't silently revert to the auto-picked default.
  useEffect(() => {
    if (userClubId !== lastUserClubId) {
      let restored = false;
      if (currentSlot) {
        const raw = localStorage.getItem(`retrofoot_2026_tactics_slot_${currentSlot}`);
        if (raw) {
          try {
            const saved = JSON.parse(raw);
            if (saved && saved.userClubId === userClubId) {
              setSelectedTactic(saved.selectedTactic || '4-4-2');
              setStartersPerTactic(saved.startersPerTactic || {});
              restored = true;
            }
          } catch {
            // ignore corrupt entry, fall through to reset
          }
        }
      }
      if (!restored) {
        setStartersPerTactic({});
      }
      setLastUserClubId(userClubId);
    }
  }, [userClubId, lastUserClubId, currentSlot]);

  useEffect(() => {
    if (currentSlot && userClubId) {
      const serialized = JSON.stringify({ userClubId, selectedTactic, startersPerTactic });
      localStorage.setItem(`retrofoot_2026_tactics_slot_${currentSlot}`, serialized);
      mirrorSaveToCloud(`retrofoot_2026_tactics_slot_${currentSlot}`, serialized);
    }
  }, [currentSlot, userClubId, selectedTactic, startersPerTactic]);

  // Helper to determine positional requirements for each tactic
  const getTacticNeeds = (tactic: string) => {
    if (tactic === '4-3-3') {
      return { targetZAG: 2, targetLD: 1, targetLE: 1, targetVOL: 1, targetMEI: 2, targetPON: 2, targetCA: 1 };
    } else if (tactic === '3-5-2') {
      return { targetZAG: 3, targetLD: 1, targetLE: 1, targetVOL: 1, targetMEI: 2, targetPON: 0, targetCA: 2 };
    }
    // Default 4-4-2
    return { targetZAG: 2, targetLD: 1, targetLE: 1, targetVOL: 2, targetMEI: 2, targetPON: 0, targetCA: 2 };
  };

  // Helper function to check if the club has enough healthy players for a tactic
  const isTacticAvailable = (tactic: string, squadList: Player[]) => {
    const { targetZAG, targetLD, targetLE, targetVOL, targetMEI, targetPON, targetCA } = getTacticNeeds(tactic);
    const healthy = squadList.filter(isPlayerAvailable);
    const count = (pos: PlayerPosition) => healthy.filter(p => p.position === pos).length;

    // PON and CA cover for each other: a winger can play as a makeshift centre-forward (and
    // vice versa) until the club buys a natural fit, so only the combined total needs to add up.
    // A Meia can likewise fill in for a missing Volante until the club buys one.
    return (
      count('GOL') >= 1 &&
      count('ZAG') >= targetZAG &&
      count('LD') >= targetLD &&
      count('LE') >= targetLE &&
      count('VOL') + count('MEI') >= targetVOL + targetMEI &&
      count('PON') + count('CA') >= targetPON + targetCA
    );
  };

  // Auto-switch selectedTactic if the current one is not available
  useEffect(() => {
    if (userClub) {
      const activeTacticAvailable = isTacticAvailable(selectedTactic, userClub.squad);
      if (!activeTacticAvailable) {
        // Find the first tactic that is available
        const tactics: ('4-4-2' | '3-5-2' | '4-3-3')[] = ['4-4-2', '3-5-2', '4-3-3'];
        const fallback = tactics.find(t => isTacticAvailable(t, userClub.squad));
        if (fallback) {
          setSelectedTactic(fallback);
        }
      }
    }
  }, [userClubId, userClub?.squad]);

  // Load or pick starters when tactic changes — preserves current starters by position
  useEffect(() => {
    if (userClub) {
      if (startersPerTactic[selectedTactic] && startersPerTactic[selectedTactic].length > 0) {
        // Saved lineup for this tactic — validate (injures / sold players). `usedIds` accumulates
        // as slots are resolved (seeded with the whole saved lineup so a still-valid teammate
        // isn't stolen) -- recomputing it fresh from `saved` on every iteration (the previous
        // bug) never accounted for replacements already chosen earlier in this same pass, so if
        // two saved players at the same/sibling position both went invalid (injured/sold), they
        // could both resolve to the SAME single replacement, leaving `validated` with a
        // duplicate id and one fewer *distinct* player than positions -- exactly what showed up
        // as an empty "?" slot on the pitch (which correctly refuses to draw the same id twice).
        const saved = startersPerTactic[selectedTactic];
        const usedIds = new Set(saved.map(x => x.id));
        const validated = saved.map(p => {
          const found = userClub.squad.find(s => s.id === p.id);
          if (!found || !isPlayerAvailable(found)) {
            const replacement = findFallbackReplacement(userClub.squad, p.position, usedIds);
            const resolved = replacement
              || userClub.squad.find(s => isPlayerAvailable(s) && !usedIds.has(s.id) && s.position !== 'GOL')
              || userClub.squad.find(s => isPlayerAvailable(s) && !usedIds.has(s.id))
              || p;
            usedIds.add(resolved.id);
            return resolved;
          }
          return found;
        });
        setStarters(validated);
        setMidMatchStarters(validated);
      } else {
        // Auto-pick best 11 matching the new scheme criteria
        const { targetZAG, targetLD, targetLE, targetVOL, targetMEI, targetPON, targetCA } = getTacticNeeds(selectedTactic);
        const pool = [...userClub.squad].filter(isPlayerAvailable).sort((a, b) => b.rating - a.rating);
        const selected: Player[] = [];
        const gks = pool.filter(p => p.position === 'GOL');
        if (gks[0]) selected.push(gks[0]);

        const zags = pool.filter(p => p.position === 'ZAG');
        const lds = pool.filter(p => p.position === 'LD');
        const les = pool.filter(p => p.position === 'LE');
        const vols = pool.filter(p => p.position === 'VOL');
        const meis = pool.filter(p => p.position === 'MEI');
        const pons = pool.filter(p => p.position === 'PON');
        const cas = pool.filter(p => p.position === 'CA');

        for (let i = 0; i < Math.min(targetZAG, zags.length); i++) selected.push(zags[i]);
        for (let i = 0; i < Math.min(targetLD, lds.length); i++) selected.push(lds[i]);
        for (let i = 0; i < Math.min(targetLE, les.length); i++) selected.push(les[i]);
        for (let i = 0; i < Math.min(targetVOL, vols.length); i++) selected.push(vols[i]);
        for (let i = 0; i < Math.min(targetMEI, meis.length); i++) selected.push(meis[i]);
        for (let i = 0; i < Math.min(targetPON, pons.length); i++) selected.push(pons[i]);
        for (let i = 0; i < Math.min(targetCA, cas.length); i++) selected.push(cas[i]);

        // PON and CA cover for each other: a winger can play as a makeshift centre-forward
        // (and vice versa) when the club lacks a natural fit -- nobody else fills attack.
        const ponCaShort = (targetPON + targetCA) - selected.filter(p => p.position === 'PON' || p.position === 'CA').length;
        if (ponCaShort > 0) {
          const usedIds = new Set(selected.map(p => p.id));
          const extra = [...pons, ...cas].filter(p => !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
          for (let i = 0; i < Math.min(ponCaShort, extra.length); i++) selected.push(extra[i]);
        }

        // A Meia can anchor the midfield when the club has no natural Volante at all.
        const volMeiShort = (targetVOL + targetMEI) - selected.filter(p => p.position === 'VOL' || p.position === 'MEI').length;
        if (volMeiShort > 0) {
          const usedIds = new Set(selected.map(p => p.id));
          const extra = [...vols, ...meis].filter(p => !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
          for (let i = 0; i < Math.min(volMeiShort, extra.length); i++) selected.push(extra[i]);
        }

        if (selected.length < 11) {
          const ids = new Set(selected.map(p => p.id));
          const hasGoalkeeper = selected.some(p => p.position === 'GOL');
          const rest = userClub.squad.filter(p => isPlayerAvailable(p) && !ids.has(p.id) && (!hasGoalkeeper || p.position !== 'GOL')).sort((a, b) => b.rating - a.rating);
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
      // Tracks replacements already handed out earlier in this same pass -- without it, two
      // starters going unavailable at once (e.g. two players injured/suspended together) could
      // both independently pick the same bench player as their replacement, since checking only
      // against the ORIGINAL `starters` array doesn't see a pick made moments earlier in this
      // very map(), leaving that player fielded twice and someone else's slot empty.
      const usedReplacementIds = new Set<string>();
      const nextS = starters.map(p => {
        const found = userClub.squad.find(s => s.id === p.id);
        if (!found || !isPlayerAvailable(found)) {
          changed = true;
          const isFree = (s: Player) => !starters.some(x => x.id === s.id) && !usedReplacementIds.has(s.id);
          const replacement = userClub.squad.find(s => s.position === p.position && isPlayerAvailable(s) && isFree(s))
            || userClub.squad.find(s => isPlayerAvailable(s) && isFree(s));
          if (replacement) usedReplacementIds.add(replacement.id);
          return replacement || p;
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

      // Sponsors pay better when the club is well-placed in its own table --
      // rank 1 gets the full 1.3x, last place only 0.7x.
      const divStandings = getStandingsData()[div];
      const totalTeams = divStandings.length;
      const rank = divStandings.findIndex(e => e.clubId === userClub.id) + 1;
      const positionFactor = totalTeams > 1 && rank > 0
        ? 0.7 + (1 - (rank - 1) / (totalTeams - 1)) * 0.6
        : 1.0;

      // Heavy bank debt spooks sponsors too -- the more a club owes relative to its revenue,
      // the less they're willing to offer.
      const outstandingDebt = (userClub.loans ?? []).reduce((s, l) => s + l.balance, 0);
      const debtRatio = (userClub.lastSeasonRevenue ?? 0) > 0 ? outstandingDebt / (userClub.lastSeasonRevenue ?? 1) : 0;
      const debtFactor = Math.max(0.6, 1 - debtRatio * 0.4);

      const finalMultiplier = divMultiplier * positionFactor * debtFactor;

      // Série A signing bonuses are calibrated directly against real sponsorship scale (a top
      // club's master sponsorship should read like R$45-80M, not a couple million) -- reputation
      // interpolates across the actual A-division range (70-92) rather than reusing the shared
      // rep²×K formula below, which was tuned for the smaller B/C economy and read far too low
      // once applied to A. Costas/Mangas scale off Master's same curve at their usual ~32%/~19%.
      const performanceFactor = positionFactor * debtFactor;
      let masterSigningBonus: number;
      let costasSigningBonus: number;
      let mangasSigningBonus: number;
      if (div === 'A') {
        const repSpan = Math.max(0, Math.min(1, (rep - 70) / (92 - 70)));
        const masterBase = 45_000_000 + repSpan * (80_000_000 - 45_000_000);
        masterSigningBonus = Math.round(masterBase * performanceFactor);
        costasSigningBonus = Math.round(masterBase * 0.32 * performanceFactor);
        mangasSigningBonus = Math.round(masterBase * 0.19 * performanceFactor);
      } else {
        masterSigningBonus = Math.round(rep * rep * 250 * finalMultiplier);
        costasSigningBonus = Math.round(rep * rep * 130 * finalMultiplier);
        mangasSigningBonus = Math.round(rep * rep * 70 * finalMultiplier);
      }

      const seedBase = `${userClub.id}_${currentRound}`;
      const masterBrand = pickSponsorBrand(`${seedBase}_MASTER`);
      const costasBrand = pickSponsorBrand(`${seedBase}_COSTAS`, [masterBrand]);
      const mangasBrand = pickSponsorBrand(`${seedBase}_MANGAS`, [masterBrand, costasBrand]);

      const sponsors: Sponsor[] = [
        {
          id: 'sp_master',
          name: `${masterBrand} Master`,
          type: 'MASTER',
          signingBonus: masterSigningBonus,
          weeklyPayment: Math.round(rep * 120 * finalMultiplier),
          contractWeeks: 38
        },
        {
          id: 'sp_costas',
          name: `${costasBrand} Costas`,
          type: 'COSTAS',
          signingBonus: costasSigningBonus,
          weeklyPayment: Math.round(rep * 60 * finalMultiplier),
          contractWeeks: 38
        },
        {
          id: 'sp_mangas',
          name: `${mangasBrand} Mangas`,
          type: 'MANGAS',
          signingBonus: mangasSigningBonus,
          weeklyPayment: Math.round(rep * 30 * finalMultiplier),
          contractWeeks: 38
        }
      ];
      setSponsorProposals(sponsors);
    }
  }, [activeTab, userClub]);

  // Live match simulator runner
  const feedEndRef = useRef<HTMLDivElement>(null);
  const userMatchRef = useRef<HTMLDivElement>(null);
  // Cooldown so incoming transfer offers can't fire on back-to-back rounds -- a stacked squad
  // of stars was triggering one nearly every round late in the season, making it feel like the
  // office screen never let the user get back to actually playing.
  const lastOfferRoundRef = useRef(0);
  const scrollableRef = useRef<HTMLDivElement>(null);

  // Reset scroll to the top whenever the visible tab changes or a match just ended
  // (returning from the live-match overlay used to leave the tab scrolled wherever it was).
  useEffect(() => {
    scrollableRef.current?.scrollTo(0, 0);
  }, [activeTab, gameState]);

  // Keyed on `currentMatch` (the fixture itself), not `currentMatchResult` -- the latter also
  // gets replaced in place when a mid-match substitution re-simulates the rest of an ongoing
  // match, and that must NOT reset the clock/score/feed back to kickoff.
  useEffect(() => {
    if (gameState === 'MATCH_DAY' && currentMatch) {
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
      setInjuryModalOpen(false);
      setLastInjuryMinute(-1);
      setSubsUsed(0);
      setPenaltyModalOpen(false);
      setPenaltyEvent(null);
      setChosenPenaltyTakerId(null);
      setVarModalOpen(false);
      setVarEvent(null);
      // Defensive: neither of these ever pauses the sim, and both render as a full-screen
      // modal regardless of gameState -- if one were ever still open when a match starts, it
      // would silently sit on top of the live match for its whole duration (ticking away
      // unseen underneath), which looks exactly like "the round played but no live match showed".
      setIncomingProposal(null);
      setUnhappyPlayer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, currentMatch]);

  // Goal vibration, on either team's goal, in the user's live match. Watching the combined goal
  // total (rather than hooking into every individual place a goal gets committed -- normal
  // ticking, penalty reveal, VAR-confirmed reveal) catches all of them from one spot. Only fires
  // on an increase, so a new match resetting the score back to 0 never triggers it.
  const prevTotalGoalsRef = useRef(0);
  useEffect(() => {
    const total = simScoreHome + simScoreAway;
    if (total > prevTotalGoalsRef.current) {
      vibrateGoal();
    }
    prevTotalGoalsRef.current = total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simScoreHome, simScoreAway]);

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
        if (pObj) {
          setRedCardPlayer(pObj);
          // A red card forces the player off immediately -- the team plays a man down for
          // the rest of the match, there's no "keep him on" option like with a yellow.
          setMidMatchStarters(prev => prev.filter(p => p.id !== pObj.id));
        }
      }
      setRedCardModalOpen(true);
      setIsSimPaused(true);
    }
  }, [simEvents, userClubId, lastRedCardMinute, gameState, currentMatchResult, matchDone, userClub]);

  // Auto-open injury modal when a player gets injured in user's match
  useEffect(() => {
    if (gameState !== 'MATCH_DAY' || !currentMatchResult || matchDone) return;
    const userInjuries = simEvents.filter(
      e => e.type === 'INJURY' && e.clubId === userClubId && e.minute > lastInjuryMinute
    );
    if (userInjuries.length > 0) {
      const latest = userInjuries[userInjuries.length - 1];
      setLastInjuryMinute(latest.minute);
      if (userClub && latest.player) {
        const pObj = userClub.squad.find(x => x.name === latest.player);
        if (pObj) setInjuryPlayer(pObj);
      }
      setInjuryModalOpen(true);
      setIsSimPaused(true);
    }
  }, [simEvents, userClubId, lastInjuryMinute, gameState, currentMatchResult, matchDone, userClub]);


  useEffect(() => {
    if (gameState !== 'MATCH_DAY' || !currentMatchResult || isSimPaused || matchDone) return;

    const timer = setTimeout(() => {
      if (simMinute < 90) {
        const nextMin = simMinute + 1;
        setSimMinute(nextMin);

        // Find events that happened in this minute. A penalty or VAR-reviewed goal gets held
        // back for the suspense modal instead of landing on the feed/scoreboard immediately --
        // only one such "special" event is handled per minute, which is already extremely rare
        // to double up on.
        const eventsInMin = currentMatchResult.events.filter(e => e.minute === nextMin);
        const specialEvent = eventsInMin.find(e => e.isPenalty || e.varChecked);
        const normalEvents = specialEvent ? eventsInMin.filter(e => e !== specialEvent) : eventsInMin;

        if (normalEvents.length > 0) {
          setSimEvents(prev => [...prev, ...normalEvents]);

          // Update score in real time
          normalEvents.forEach(ev => {
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

        if (specialEvent) {
          if (specialEvent.isPenalty) {
            // The user's own penalty gives the manager a "escolher batedor" modal to pick who
            // takes it live, overriding whoever the pre-simulation baked in; opponent penalties
            // (or the rare case with no eligible outfield player left on the pitch) keep the
            // automatic reveal flow.
            const eligibleTakers = midMatchStarters.filter(p => p.position !== 'GOL');
            const canChoose = specialEvent.clubId === userClubId && eligibleTakers.length > 0;
            setPenaltyEvent(specialEvent);
            setChosenPenaltyTakerId(null);
            setPenaltyPhase(canChoose ? 'CHOOSE' : 'WAITING');
            setPenaltyModalOpen(true);
          } else {
            setVarEvent(specialEvent);
            setVarPhase('WAITING');
            setVarModalOpen(true);
          }
          setIsSimPaused(true);
        }

        // Scroll to bottom of events feed
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setMatchDone(true);
      }
    }, simSpeed);

    return () => clearTimeout(timer);
  }, [simMinute, isSimPaused, matchDone, gameState, currentMatchResult, simSpeed]);

  // Penalty suspense: hold on "cobrando..." for a beat, then reveal the outcome (committing it
  // to the feed/scoreboard only at that point), then auto-close and resume play.
  useEffect(() => {
    if (!penaltyModalOpen || penaltyPhase !== 'WAITING' || !penaltyEvent) return;
    const t = setTimeout(() => {
      const ev = penaltyEvent;
      setSimEvents(prev => [...prev, ev]);
      if (ev.type === 'GOAL') {
        const isHomeGoal = ev.clubId === currentMatch?.homeId;
        if (isHomeGoal) setSimScoreHome(prev => prev + 1); else setSimScoreAway(prev => prev + 1);
      }
      setPenaltyPhase('RESULT');
    }, 3000);
    return () => clearTimeout(t);
  }, [penaltyModalOpen, penaltyPhase, penaltyEvent, currentMatch]);

  useEffect(() => {
    if (!penaltyModalOpen || penaltyPhase !== 'RESULT') return;
    const t = setTimeout(() => {
      setPenaltyModalOpen(false);
      setPenaltyEvent(null);
      setIsSimPaused(false);
    }, 1800);
    return () => clearTimeout(t);
  }, [penaltyModalOpen, penaltyPhase]);

  // VAR suspense: same beat structure -- "analisando..." then the confirmed/overturned result.
  useEffect(() => {
    if (!varModalOpen || varPhase !== 'WAITING' || !varEvent) return;
    const t = setTimeout(() => {
      const ev = varEvent;
      setSimEvents(prev => [...prev, ev]);
      if (ev.type === 'GOAL') {
        const isHomeGoal = ev.clubId === currentMatch?.homeId;
        if (isHomeGoal) setSimScoreHome(prev => prev + 1); else setSimScoreAway(prev => prev + 1);
      }
      setVarPhase('RESULT');
    }, 3000);
    return () => clearTimeout(t);
  }, [varModalOpen, varPhase, varEvent, currentMatch]);

  useEffect(() => {
    if (!varModalOpen || varPhase !== 'RESULT') return;
    const t = setTimeout(() => {
      setVarModalOpen(false);
      setVarEvent(null);
      setIsSimPaused(false);
    }, 1800);
    return () => clearTimeout(t);
  }, [varModalOpen, varPhase]);

  // Auto-scroll to user's match row at minute 1 (start of match)
  useEffect(() => {
    if (gameState === 'MATCH_DAY' && simMinute === 1) {
      userMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [simMinute, gameState]);

  // Detect unhappy players who triggered the randomized dissatisfaction roll (benchRounds === 999).
  // Deliberately depends only on currentRound/gameState, not userClub -- userClub gets a new
  // object reference on every unrelated club update too (ticket price, penalty taker, etc.), and
  // re-running this on those would re-open the modal for a player whose flag hasn't been resolved.
  useEffect(() => {
    if (userClub && gameState === 'PLAYING') {
      const unhappy = userClub.squad.find(p => p.benchRounds === 999);
      if (unhappy) {
        setUnhappyPlayer(unhappy);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound, gameState]);

  // Roll for incoming purchase proposal from other clubs for user's players after rounds.
  // Depends on gameState too (not just currentRound): currentRound is only ever bumped inside
  // nextRound() in the very same synchronous update that also flips gameState to 'MATCH_DAY',
  // so with currentRound as the sole dependency this guard could basically never see 'PLAYING'
  // at the moment it re-evaluates -- the roll needs to happen once we're actually back on the
  // office screen, which is exactly when gameState (not currentRound) changes to 'PLAYING'.
  useEffect(() => {
    if (userClub && gameState === 'PLAYING' && currentRound > 1 && currentRound - lastOfferRoundRef.current >= 4) {
      // 15% chance of receiving an offer for a player in the squad, at most once every 4 rounds
      if (Math.random() < 0.15) {
        lastOfferRoundRef.current = currentRound;
        // Only target players who are not locked and are either a clear standout (star profile,
        // highly rated, or top scorer) OR a promising young talent on the rise (system-identified:
        // 23 or younger, decent rating, and trending up in form).
        const isPromisingYoungster = (p: Player) => p.age <= 23 && p.rating >= 68 && p.performanceTrend === 'UP';
        const potentialPlayers = userClub.squad.filter(p => !p.isInjured && !p.contractLocked && (p.isStar || p.rating >= 75 || p.goals >= 3 || isPromisingYoungster(p)));
        if (potentialPlayers.length > 0) {
          const targetPlayer = potentialPlayers[Math.floor(Math.random() * potentialPlayers.length)];
          // Only a genuine standout draws interest from abroad -- everyone else's suitors stay
          // domestic. Foreign clubs pay a lot more (110%-170% of value vs. 90%-125% at home).
          const isEliteTarget = targetPlayer.isStar || targetPlayer.rating >= 78;
          const goForeign = isEliteTarget && Math.random() < 0.5;
          if (goForeign) {
            // Combine the European flavor-only list with the real Libertadores clubs so
            // incoming offers can cite an actual South American club by name.
            const foreignBuyerPool: { id: string; name: string; league?: string }[] = [
              ...FOREIGN_CLUBS,
              ...libertadoresClubs.map(c => ({ id: c.id, name: c.name, league: 'Libertadores' }))
            ];
            const buyer = foreignBuyerPool[Math.floor(Math.random() * foreignBuyerPool.length)];
            const amount = Math.round(targetPlayer.value * (1.10 + Math.random() * 0.60));
            setIncomingProposal({ player: targetPlayer, buyerClub: buyer, amount });
            setNegOfferAmount(amount);
            setIncomingNegResult(null);
          } else {
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
    }
  }, [currentRound, gameState]);

  // Advances the interactive tutorial the moment the player actually taps the tab it's pointing
  // at, instead of requiring a generic "Next" button -- the tour tracks real navigation.
  useEffect(() => {
    if (tutorialStep === null) return;
    const step = TUTORIAL_STEPS[tutorialStep];
    if (step?.nextTabIndex !== null && step?.nextTabIndex !== undefined && activeTab === step.nextTabIndex) {
      setTutorialStep(step.nextTabIndex);
    }
  }, [activeTab, tutorialStep]);

  // Kicks off a brand new career and, the very first time this player has ever done so on this
  // browser, queues the interactive tutorial tour right behind it -- a global flag (not tied to
  // any save slot), so it's a true "first time playing" thing rather than "first time in this campaign".
  const beginNewCareer = (name: string, clubId: string, slot: number) => {
    startGame(name, clubId, slot);
    if (!localStorage.getItem('retrofoot_2026_tutorial_seen')) {
      localStorage.setItem('retrofoot_2026_tutorial_seen', 'true');
      setTutorialStep(0);
    }
  };

  // Reset the live-match clock/score/flags SYNCHRONOUSLY at the moment the user starts a match,
  // batched in the same click as nextRound()/startCupMatch(). The [gameState, currentMatch]
  // effect below also resets these, but that runs across two commits -- there's a first commit
  // where the overlay can briefly mount still carrying the *previous* match's matchDone=true /
  // simMinute=90, which reads as "the round played but the live match was skipped straight to
  // the result." Doing it here guarantees the overlay always mounts at kickoff (0', not done),
  // independent of effect timing. Also clears any pending office-screen modal so it can never
  // sit on top of the live match.
  const beginMatchKickoff = () => {
    setSimMinute(0);
    setSimScoreHome(0);
    setSimScoreAway(0);
    setSimEvents([]);
    setMatchDone(false);
    setIsSimPaused(false);
    setSubsUsed(0);
    setHalftimeShown(false);
    setHalftimeModalOpen(false);
    setPenaltyModalOpen(false);
    setVarModalOpen(false);
    setIncomingProposal(null);
    setUnhappyPlayer(null);
    setRedCardPlayer(null);
    setLastRedCardMinute(-1);
    // `starters` is kept in sync with squad changes (suspensions, injuries, sales) by the
    // "sync starters when club squad changes" effect, but that effect only ever updates
    // `starters` itself -- `midMatchStarters` (the array the live match view and substitution
    // modal actually read from) was never refreshed from it, so a player suspended between
    // matches could still show up as an "on-field titular" you could keep fielding, using
    // whatever stale lineup midMatchStarters last held. Re-sync it here, at the exact moment
    // a match kicks off, so it always reflects the current validated starting XI.
    setMidMatchStarters(starters);
  };

  // Helper to make substitution in current match
  const handleMidMatchSub = (inPlayer: Player, outPlayer: Player) => {
    if (!currentMatch || !currentMatchResult) return;
    if (subsUsed >= MAX_SUBS) return;

    // Replace in starters. The modal stays open afterward -- the user can queue up to
    // MAX_SUBS swaps in one sitting instead of reopening it one substitution at a time.
    const nextStarters = midMatchStarters.map(p => p.id === outPlayer.id ? inPlayer : p);
    setMidMatchStarters(nextStarters);
    setSubsUsed(prev => prev + 1);

    // Re-simulate the rest of the match with the updated lineup -- the original one-shot
    // simulation had no way to know this substitution would happen, so without this the
    // substituted-out player could still show up scoring or getting cards later on.
    resimulateMidMatch(nextStarters, simMinute);

    // Append sub news/event
    const subEvent = {
      minute: simMinute,
      type: 'INFO',
      clubId: userClubId,
      description: `Substituição no ${userClub?.name}: sai ${outPlayer.name}, entra ${inPlayer.name}.`
    };
    setSimEvents(prev => [...prev, subEvent]);
  };

  // User confirmed who takes their team's live penalty -- resolve the outcome for that specific
  // player (overriding whatever the pre-simulation had baked in) and hand off to the existing
  // WAITING -> RESULT suspense reveal, unchanged.
  const handleConfirmPenaltyTaker = () => {
    if (!penaltyEvent || !chosenPenaltyTakerId) return;
    const resolvedEvent = resolveMidMatchPenalty(chosenPenaltyTakerId, penaltyEvent.minute, midMatchStarters);
    if (resolvedEvent) {
      setPenaltyEvent(resolvedEvent);
    }
    setPenaltyPhase('WAITING');
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

  // Libertadores group-stage standings, computed live off whatever matches have been played so
  // far -- valid during the group stage itself and still readable afterward (groups/schedule
  // stick around for the rest of the season even once the knockout phase takes over).
  const libertadoresGroupStandings = libertadoresState
    ? calculateGroupStandings(
        libertadoresState.groups[libertadoresStandingsGroup] ?? [],
        libertadoresState.schedule.filter(m => m.group === libertadoresStandingsGroup),
        libertadoresState.tiebreakSeeds
      )
    : [];
  const findClubName = (id: string) => clubs.find(c => c.id === id)?.name ?? libertadoresClubs.find(c => c.id === id)?.name ?? mundialClubs.find(c => c.id === id)?.name ?? '???';
  const findClubColor = (id: string) => clubs.find(c => c.id === id)?.primaryColor ?? libertadoresClubs.find(c => c.id === id)?.primaryColor ?? mundialClubs.find(c => c.id === id)?.primaryColor ?? '#555';

  // Top scorers calculation by division
  const getTopScorers = () => {
    const list: { player: Player; club: Club }[] = [];
    clubs.forEach(c => {
      if (c.division === standingsTab) {
        c.squad.forEach(p => {
          if (p.goals > 0) {
            list.push({ player: p, club: c });
          }
        });
      }
    });
    return list.sort((a, b) => b.player.goals - a.player.goals).slice(0, 10);
  };

  const topScorers = getTopScorers();

  // True when running as the installed native app (Capacitor's iOS WKWebView), not a browser tab.
  const isNativeApp = (): boolean => {
    try {
      return (window as any).Capacitor?.isNativePlatform?.() === true;
    } catch {
      return false;
    }
  };

  // Reads a save slot's headline info for display (Menu load screen, overwrite picker)
  // Export/import a save as a .json file, so it can be kept as a backup anywhere (Drive, email,
  // WhatsApp to self) and restored later by importing the file back into a slot.
  const exportSave = async (slot: number) => {
    const raw = localStorage.getItem(`retrofoot_2026_save_slot_${slot}`);
    if (!raw) return;
    const tacticsRaw = localStorage.getItem(`retrofoot_2026_tactics_slot_${slot}`);
    const bundle = { save: JSON.parse(raw), tactics: tacticsRaw ? JSON.parse(tacticsRaw) : null };
    const data = JSON.parse(raw);
    const club = data.clubs?.find((c: any) => c.isPlayerClub);
    const fileName = `retrofoot2026_${(data.managerName || 'save').replace(/[^a-zA-Z0-9]+/g, '_')}_${club?.name?.replace(/[^a-zA-Z0-9]+/g, '_') || ''}_r${data.currentRound}.json`;
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });

    // Inside the native app's WKWebView, an <a download> click is silently ignored -- there's no
    // browser download manager to catch it. The Web Share API (native share sheet: Files, e-mail,
    // WhatsApp, AirDrop...) is what actually works there, so prefer it whenever it's available.
    const file = new File([blob], fileName, { type: 'application/json' });
    const nav = navigator as any;
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName });
        return;
      } catch (e) {
        if ((e as any)?.name === 'AbortError') return; // user cancelled the share sheet
        // fall through to the download-link approach below
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [importTargetSlot, setImportTargetSlot] = useState<number | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File, slot: number) => {
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const saveData = bundle.save ?? bundle; // tolerate importing a raw save export too
      const serializedSave = JSON.stringify(saveData);
      localStorage.setItem(`retrofoot_2026_save_slot_${slot}`, serializedSave);
      mirrorSaveToCloud(`retrofoot_2026_save_slot_${slot}`, serializedSave);
      if (bundle.tactics) {
        const serializedTactics = JSON.stringify(bundle.tactics);
        localStorage.setItem(`retrofoot_2026_tactics_slot_${slot}`, serializedTactics);
        mirrorSaveToCloud(`retrofoot_2026_tactics_slot_${slot}`, serializedTactics);
      }
      setSlotRefreshTick(t => t + 1);
      // If we just overwrote the slot currently being played, refresh the live state too --
      // otherwise the import sits in localStorage unseen until the user switches away and back.
      if (slot === currentSlot) {
        loadGame(saveData, slot);
      }
      alert(`Save importado com sucesso para o Slot 0${slot}!`);
    } catch (e) {
      console.warn('handleImportFile failed', e);
      alert('Não foi possível importar esse arquivo. Verifique se é um arquivo de save válido do Retrofoot 2026.');
    }
  };

  const getSaveLabel = (key: string): string | null => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      const club = data.clubs?.find((c: any) => c.isPlayerClub);
      return `${data.managerName} - ${club?.name || 'Time'} (Ano ${data.currentYear}, Rodada ${data.currentRound})`;
    } catch {
      return 'Save corrompido';
    }
  };

  // --- MAIN MENU RENDER (New Game / Load Game) ---
  if (gameState === 'MENU') {

    const saveSlots = [1, 2, 3, 4].map(n => ({ slot: n, key: `retrofoot_2026_save_slot_${n}` }));

    if (menuView === 'LOAD') {
      return (
        <div className="mobile-wrapper safe-padded" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-gold)', letterSpacing: '-1px' }}>Carregar Jogo</h1>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Escolha uma campanha salva para continuar</p>
          </div>

          <div className="card" style={{ background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'hidden' }}>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {saveSlots.map(({ slot, key }) => {
                const label = getSaveLabel(key);
                const locked = !label && !isPremium && slot > 1;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: label ? '#121316' : '#0d0e10',
                      border: label ? '1px solid rgba(0, 230, 118, 0.15)' : '1px solid rgba(255,255,255,0.03)',
                      opacity: label ? 1 : 0.5
                    }}
                  >
                    <div
                      onClick={() => {
                        if (locked) { setPremiumPaywallReason(`Slot 0${slot}`); return; }
                        if (!label) return;
                        const raw = localStorage.getItem(key);
                        if (!raw) return;
                        try {
                          const data = JSON.parse(raw);
                          loadGame(data, slot);
                        } catch {
                          alert('Não foi possível carregar este save.');
                        }
                      }}
                      style={{ flex: 1, cursor: (label || locked) ? 'pointer' : 'default' }}
                    >
                      <div style={{ fontWeight: 800, fontSize: '0.85rem', color: label ? 'var(--accent-green)' : '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {locked && <Lock size={13} />} Slot 0{slot}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>{locked ? 'Premium' : (label || 'Vazio')}</div>
                    </div>
                    {label && (
                      <button
                        onClick={() => {
                          if (confirm(`Excluir a campanha do Slot 0${slot}? Essa ação não pode ser desfeita.`)) {
                            localStorage.removeItem(key);
                            localStorage.removeItem(`retrofoot_2026_tactics_slot_${slot}`);
                            removeCloudSave(key);
                            removeCloudSave(`retrofoot_2026_tactics_slot_${slot}`);
                            setSlotRefreshTick(t => t + 1);
                          }
                        }}
                        style={{
                          background: 'rgba(255, 23, 68, 0.1)',
                          border: '1px solid rgba(255, 23, 68, 0.25)',
                          color: 'var(--accent-red)',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                        title="Excluir esta campanha"
                      >
                        🗑️
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (locked) { setPremiumPaywallReason(`Slot 0${slot}`); return; }
                        if (label && !confirm(`O Slot 0${slot} já tem uma campanha (${label}). Importar um arquivo vai SUBSTITUIR esse save. Continuar?`)) return;
                        setImportTargetSlot(slot);
                        importFileInputRef.current?.click();
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'white',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                      title={locked ? 'Recurso Premium' : 'Importar um save de um arquivo exportado anteriormente'}
                    >
                      {locked ? <Lock size={13} /> : '⬆️'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '12px 0 0', lineHeight: '1.4', textAlign: 'center' }}>
            💡 Precisa restaurar um save de um backup? Toque no ⬆️ ao lado do slot pra importar um arquivo exportado antes.
          </p>

          <input
            ref={importFileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && importTargetSlot !== null) {
                handleImportFile(file, importTargetSlot);
              }
              e.target.value = '';
              setImportTargetSlot(null);
            }}
          />

          <button
            className="btn btn-secondary"
            onClick={() => setMenuView('ROOT')}
            style={{ marginTop: '16px', height: '48px', fontSize: '0.9rem' }}
          >
            ← Voltar
          </button>
          {premiumPaywallReason && (
            <PremiumPaywallModal reason={premiumPaywallReason} onClose={() => setPremiumPaywallReason(null)} />
          )}
        </div>
      );
    }

    return (
      <div className="mobile-wrapper safe-padded" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-green)', letterSpacing: '-1px' }}>RETROFOOT 2026</h1>
          <p style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: 500 }}>Seja um verdadeiro campeão!</p>
          <p style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, marginTop: '4px' }}>por Diogo Sander</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', maxWidth: '320px' }}>
          <button
            className="btn btn-primary"
            onClick={() => setGameState('START')}
            style={{ height: '56px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <PlusCircle size={20} /> Novo Jogo
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setMenuView('LOAD')}
            style={{ height: '56px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <FolderOpen size={20} /> Carregar Jogo
          </button>
        </div>
      </div>
    );
  }

  // --- START SCREEN RENDER ---
  if (gameState === 'START') {
    const startClubs = CLUB_DEFINITIONS.filter(c => c.division === selectedStartDivision).sort((a, b) => a.name.localeCompare(b.name));

    // All 4 save slots are occupied — ask which one to overwrite before starting
    if (overwriteSlotPicker) {
      return (
        <div className="mobile-wrapper safe-padded" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-red)', letterSpacing: '-1px' }}>Slots Cheios</h1>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>
              {isPremium
                ? 'Os 4 slots de save já estão ocupados. Escolha uma campanha para substituir:'
                : 'O slot de save grátis já está ocupado. Escolha uma campanha para substituir, ou desbloqueie o Premium pra ter mais slots:'}
            </p>
          </div>

          <div className="card" style={{ background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'hidden' }}>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {[1, 2, 3, 4].map(slot => {
                const label = getSaveLabel(`retrofoot_2026_save_slot_${slot}`);
                const locked = !label && !isPremium && slot > 1;
                return (
                  <div
                    key={slot}
                    onClick={() => {
                      if (locked) { setPremiumPaywallReason(`Slot 0${slot}`); return; }
                      if (confirm(`Substituir a campanha do Slot 0${slot}? Essa ação não pode ser desfeita.`)) {
                        beginNewCareer(overwriteSlotPicker.name, overwriteSlotPicker.clubId, slot);
                        setOverwriteSlotPicker(null);
                      }
                    }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: '#121316',
                      border: '1px solid rgba(255, 23, 68, 0.2)',
                      cursor: 'pointer',
                      opacity: locked ? 0.6 : 1
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {locked && <Lock size={14} />} Slot 0{slot}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>{locked ? 'Premium' : label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => setOverwriteSlotPicker(null)}
            style={{ marginTop: '16px', height: '48px', fontSize: '0.9rem' }}
          >
            ← Cancelar
          </button>
          {premiumPaywallReason && (
            <PremiumPaywallModal reason={premiumPaywallReason} onClose={() => setPremiumPaywallReason(null)} />
          )}
        </div>
      );
    }

    return (
      <div className="mobile-wrapper safe-padded" style={{ justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-green)', letterSpacing: '-1px' }}>RETROFOOT 2026</h1>
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

        <div className="card" style={{ background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: '260px', overflow: 'hidden' }}>
          <h3 style={{ marginBottom: '8px', fontWeight: 700 }}>2. Escolha seu clube</h3>
          <select
            value={selectedStartDivision}
            onChange={(e) => {
              const div = e.target.value as 'A' | 'B' | 'C';
              if (div !== 'C' && !isPremium) { setPremiumPaywallReason(div === 'A' ? 'Série A' : 'Série B'); return; }
              setSelectedStartDivision(div);
              setSelectedStartClubId('');
            }}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              background: '#121316',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              color: 'white',
              fontSize: '0.85rem'
            }}
          >
            <option value="A">{isPremium ? 'Série A' : '🔒 Série A (Premium)'}</option>
            <option value="B">{isPremium ? 'Série B' : '🔒 Série B (Premium)'}</option>
            <option value="C">Série C</option>
          </select>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', gap: '8px', display: 'flex', flexDirection: 'column' }}>
            {startClubs.map(club => (
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
          onClick={() => {
            const free = getFreeSlot();
            if (free) {
              beginNewCareer(inputName, selectedStartClubId, free);
            } else {
              setOverwriteSlotPicker({ name: inputName, clubId: selectedStartClubId });
            }
          }}
          style={{ marginTop: '16px', height: '52px', fontSize: '1rem' }}
        >
          Iniciar Carreira
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setGameState('MENU')}
          style={{ marginTop: '8px', height: '40px', fontSize: '0.85rem' }}
        >
          ← Voltar ao Menu
        </button>
        {premiumPaywallReason && (
          <PremiumPaywallModal reason={premiumPaywallReason} onClose={() => setPremiumPaywallReason(null)} />
        )}
      </div>
    );
  }

  if (gameState === 'UNEMPLOYED') {
    return (
      <div className="mobile-wrapper safe-padded" style={{ justifyContent: 'center', gap: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <Users size={48} color="var(--accent-gold)" style={{ margin: '0 auto 12px auto' }} />
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Mercado de Trabalho</h2>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            {managerName} está sem clube{formerClubName ? ` desde a saída do ${formerClubName}` : ''}. Aguardando propostas...
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
            Propostas Recebidas
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
            {offers.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}>Nenhum clube interessado ainda. Simule a próxima rodada.</p>
            ) : (
              offers.map((off, idx) => (
                <div
                  key={idx}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#121316', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{off.clubName}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Série {off.division}</span>
                  </div>
                  <button
                    onClick={() => acceptMidSeasonJobOffer(off.clubId)}
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

        <button
          className="btn btn-secondary"
          onClick={simulateUnemployedRound}
          style={{ height: '48px' }}
        >
          Simular Próxima Rodada (Rodada {currentRound})
        </button>

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

  // Guard safety
  if (!userClub) return null;

  // Calculate team stats
  const startersForces = calculateTeamForces(starters);

  // --- LIVE MATCH SIMULATOR OVERLAY ---
  if (gameState === 'MATCH_DAY' && currentMatch) {
    const isHome = currentMatch.homeId === userClubId;
    const opponentId = isHome ? currentMatch.awayId : currentMatch.homeId;
    const opponent = (clubs.find(c => c.id === opponentId) ?? libertadoresClubs.find(c => c.id === opponentId) ?? mundialClubs.find(c => c.id === opponentId))!;
    const roundToDisplay = currentRound - 1;
    const roundMatches = schedule.filter(m => m.round === roundToDisplay);

    return (
      <div className="live-match-overlay">
        {/* TOP USER GAME CONTROL BANNER */}
        <div className="match-scoreboard" style={{ padding: '14px 16px', gap: '8px', zIndex: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 700 }}>
            <span>
              {currentMatch.division === 'CUP' && cupState
                ? `🏆 COPA • ${CUP_PHASE_LABEL[PHASES[cupState.phaseIndex]]}`
                : currentMatch.division === 'LIBERTADORES' && libertadoresState
                ? `🌎 LIBERTADORES • ${libertadoresState.phase === 'GROUPS' ? 'Fase de Grupos' : LIBERTADORES_PHASE_LABEL[libertadoresState.phase]}`
                : currentMatch.division === 'MUNDIAL' && mundialState
                ? `🌐 MUNDIAL DE CLUBES • ${mundialState.phase === 'SEMIFINAL' ? 'Semifinal' : 'Final'}`
                : `SEU JOGO • SÉRIE ${userClub.division}`} • 🔄 {subsUsed}/{MAX_SUBS}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-green)', fontWeight: 800 }}>
              {simMinute}' - {simMinute <= 45 ? '1º Tempo' : simMinute < 90 ? '2º Tempo' : 'Fim de Jogo'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
            {(() => {
              const homeName = isHome ? userClub.name : opponent.name;
              const awayName = !isHome ? userClub.name : opponent.name;
              // Long/hyphenated club names ("Estudiantes de La Plata", "Atletico-MG") would
              // otherwise overflow or wrap mid-word right at the hyphen -- shrink the font for
              // long names and swap the hyphen for a non-breaking one so the browser only ever
              // wraps at real word boundaries.
              const nameStyle = (name: string): React.CSSProperties => ({
                fontWeight: 800,
                fontSize: name.length > 18 ? '0.72rem' : name.length > 13 ? '0.85rem' : '1rem',
                color: 'white',
                flex: 1,
                minWidth: 0,
                textAlign: 'center',
                lineHeight: 1.15
              });
              const displayName = (name: string) => name.replace(/-/g, '‑');
              return (
                <>
                  <span style={nameStyle(homeName)}>{displayName(homeName)}</span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '2px', color: 'var(--accent-gold)', flexShrink: 0 }}>
                    {simScoreHome} - {simScoreAway}
                  </span>
                  <span style={nameStyle(awayName)}>{displayName(awayName)}</span>
                </>
              );
            })()}
          </div>

          {currentMatchResult?.attendance !== undefined && (
            <div style={{ textAlign: 'center', fontSize: '0.68rem', color: '#9ca3af', marginBottom: '2px' }}>
              🏟️ Público: <strong style={{ color: '#e8f5e9' }}>{currentMatchResult.attendance.toLocaleString('pt-BR')}</strong>
            </div>
          )}

          {/* Match event ticker (goals, penalties, red cards) — fixed height so it never shifts the banner below */}
          <div style={{
            height: '16px',
            lineHeight: '16px',
            overflowX: 'auto',
            overflowY: 'hidden',
            whiteSpace: 'nowrap',
            fontSize: '0.68rem',
            color: '#e8f5e9',
            textAlign: 'center',
            fontStyle: 'italic',
            marginBottom: '4px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '14px'
          }}>
            {(() => {
              const goals = simEvents.filter(e => e.type === 'GOAL');
              // A player who scores more than once lists his name a single time followed by
              // every minute ("Jogador 12', 45', 78'") instead of repeating the name per goal.
              const goalsByScorer = new Map<string, typeof goals>();
              goals.forEach(g => {
                const key = g.player ?? '';
                goalsByScorer.set(key, [...(goalsByScorer.get(key) ?? []), g]);
              });
              return Array.from(goalsByScorer.entries()).map(([name, gs]) => {
                const minutesText = gs.map(g => `${g.minute}'${g.isPenalty ? ' (P)' : g.isHeader ? ' (C)' : ''}`).join(', ');
                const isOwnGoalScorer = gs[0].clubId === userClubId;
                return (
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <BallIcon color={isOwnGoalScorer ? 'var(--accent-green)' : '#ffffff'} />
                    {name} {minutesText}
                  </span>
                );
              });
            })()}
          </div>

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
            {!matchDone && (
              <button
                onClick={() => { setMidMatchSubModal(true); setIsSimPaused(true); }}
                disabled={subsUsed >= MAX_SUBS}
                className="btn btn-secondary"
                style={{
                  padding: '4px 10px', fontSize: '0.7rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '8px',
                  background: subsUsed >= MAX_SUBS ? 'rgba(255,255,255,0.03)' : 'rgba(255, 193, 7, 0.1)',
                  border: subsUsed >= MAX_SUBS ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255, 193, 7, 0.2)',
                  color: subsUsed >= MAX_SUBS ? '#6b7280' : 'var(--accent-gold)',
                  cursor: subsUsed >= MAX_SUBS ? 'not-allowed' : 'pointer'
                }}
              >
                Substituir ({MAX_SUBS - subsUsed})
              </button>
            )}
          </div>


        </div>

        {/* CLASSIC SIMULTANEOUS DIVISION BOARD -- doesn't apply to a Copa match (no division
            grouping, and every other tie in the phase was already resolved instantly when it
            was drawn), so it's swapped for a short cup-context blurb instead. */}
        {currentMatch.division === 'CUP' ? (
          <div className="classic-board-container" style={{ scrollBehavior: 'smooth', padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
            🏆 Copa do Brasil — {CUP_PHASE_LABEL[PHASES[cupState?.phaseIndex ?? 0]]}<br />
            Os demais confrontos desta fase já foram decididos.
          </div>
        ) : currentMatch.division === 'LIBERTADORES' ? (
          <div className="classic-board-container" style={{ scrollBehavior: 'smooth', padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
            🌎 Copa Libertadores — {libertadoresState?.phase === 'GROUPS' ? 'Fase de Grupos' : LIBERTADORES_PHASE_LABEL[libertadoresState?.phase ?? 'OITAVAS']}<br />
            Os demais confrontos desta rodada já foram decididos.
          </div>
        ) : currentMatch.division === 'MUNDIAL' ? (
          <div className="classic-board-container" style={{ scrollBehavior: 'smooth', padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
            🌐 Mundial de Clubes — {mundialState?.phase === 'SEMIFINAL' ? 'Semifinal' : 'Final'}<br />
            O ápice da carreira: vença para conquistar o título mundial.
          </div>
        ) : (
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

                    const isUserMatch = match.homeId === userClubId || match.awayId === userClubId;

                    // schedule's `match.result` is committed the instant "Iniciar Partida" is
                    // clicked, before any live substitution can change the outcome -- for the
                    // user's own match, read the live currentMatchResult instead (kept in sync
                    // by resimulateMidMatch) so this row never contradicts the scoreboard above it.
                    const matchEvents = (isUserMatch ? currentMatchResult?.events : match.result?.events) || [];
                    const homeScore = matchEvents.filter(e => e.type === 'GOAL' && e.clubId === match.homeId && e.minute <= simMinute).length;
                    const awayScore = matchEvents.filter(e => e.type === 'GOAL' && e.clubId === match.awayId && e.minute <= simMinute).length;

                    const liveGoals = matchEvents.filter(e => e.type === 'GOAL' && e.minute <= simMinute);
                    // A player who scores more than once lists his name a single time followed by
                    // every minute ("Jogador 12', 45', 78'") instead of repeating the name per goal.
                    const goalsByScorer = new Map<string, typeof liveGoals>();
                    liveGoals.forEach(g => {
                      const key = g.player ?? '';
                      goalsByScorer.set(key, [...(goalsByScorer.get(key) ?? []), g]);
                    });
                    const scorersText = Array.from(goalsByScorer.entries()).map(([name, goals]) => {
                      const minutesText = goals.map(g => `${g.minute}'${g.isPenalty ? ' (P)' : g.isHeader ? ' (C)' : ''}`).join(', ');
                      return `${name} ${minutesText}`;
                    }).join(' • ');

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

                        {/* Stadium and Attendance below the score — fixed height, scrolls horizontally instead of growing the row */}
                        <div style={{
                          textAlign: 'center',
                          fontSize: '0.62rem',
                          color: '#a5d6a7',
                          marginTop: '4px',
                          fontFamily: 'monospace',
                          opacity: 0.9,
                          height: '14px',
                          lineHeight: '14px',
                          whiteSpace: 'nowrap',
                          overflowX: 'auto',
                          overflowY: 'hidden'
                        }}>
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
        )}

        {matchDone && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', background: '#16181c', flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                clearCurrentMatch();
                maybeShowInterstitialAfterMatch(isPremium);
                if (currentMatch.division === 'CUP' || currentMatch.division === 'LIBERTADORES' || currentMatch.division === 'MUNDIAL') {
                  setActiveTab(1);
                } else {
                  setStandingsTab(userClub.division as 'A' | 'B' | 'C');
                  setStatsView('TABLE');
                  setActiveTab(4);
                }
              }}
              style={{ height: '44px' }}
            >
              {currentMatch.division === 'CUP' || currentMatch.division === 'LIBERTADORES' || currentMatch.division === 'MUNDIAL' ? 'Fim de Jogo (Continuar)' : 'Fim de Rodada (Ver Classificação)'}
            </button>
          </div>
        )}

        {/* PENALTY MODAL. For the user's own penalty, opens on 'CHOOSE' first so the manager
            picks the taker live; then (both sides) the usual suspenseful reveal plays out. */}
        {penaltyModalOpen && penaltyEvent && (() => {
          const isUserClub = penaltyEvent.clubId === userClubId;
          const takerClubName = isUserClub ? userClub.name : opponent.name;
          const scored = penaltyEvent.type === 'GOAL';
          const eligibleTakers = midMatchStarters.filter(p => p.position !== 'GOL');
          return (
            <div className="modal-overlay">
              <div className="modal-content" style={{ padding: '24px', maxWidth: '340px', textAlign: 'center' }}>
                <span style={{ fontSize: '2.6rem' }}>⚽</span>
                <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>PÊNALTI!</h3>
                <p style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: '4px' }}>{takerClubName} tem a chance na marca da cal.</p>

                {penaltyPhase === 'CHOOSE' ? (
                  <>
                    <p style={{ fontSize: '0.78rem', color: 'var(--accent-gold)', fontWeight: 700, margin: '12px 0 6px' }}>Escolha quem vai bater:</p>
                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                      {eligibleTakers.map(p => (
                        <div
                          key={p.id}
                          onClick={() => setChosenPenaltyTakerId(p.id)}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                            padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
                            background: chosenPenaltyTakerId === p.id ? 'rgba(255, 193, 7, 0.15)' : 'rgba(255,255,255,0.03)',
                            border: chosenPenaltyTakerId === p.id ? '1px solid var(--accent-gold)' : '1px solid rgba(255,255,255,0.06)'
                          }}
                        >
                          <span style={{ fontSize: '0.82rem', fontWeight: chosenPenaltyTakerId === p.id ? 700 : 500 }}>
                            {userClub.penaltyTakerId === p.id ? '🎯 ' : ''}{p.name}{' '}
                            <span style={{ color: '#9ca3af', fontWeight: 400 }}>({p.position})</span>
                          </span>
                          <span className={`rating-badge ${p.rating >= 80 ? 'gold' : p.rating >= 70 ? 'silver' : ''}`}>{p.rating}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={!chosenPenaltyTakerId}
                      onClick={handleConfirmPenaltyTaker}
                      style={{ marginTop: '14px', width: '100%', opacity: chosenPenaltyTakerId ? 1 : 0.5, cursor: chosenPenaltyTakerId ? 'pointer' : 'not-allowed' }}
                    >
                      ⚽ Confirmar Cobrança
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.2)', borderRadius: '8px', padding: '10px', margin: '14px 0' }}>
                      <span style={{ fontWeight: 700 }}>🎯 Batedor: {penaltyEvent.player}</span>
                    </div>
                    {penaltyPhase === 'WAITING' ? (
                      <div className="match-time-pill" style={{ fontSize: '0.9rem', padding: '8px 18px' }}>Cobrando...</div>
                    ) : (
                      <div style={{ margin: '10px 0' }}>
                        {scored ? (
                          <span style={{ fontSize: '1.7rem', fontWeight: 900, color: 'var(--accent-green)' }}>⚽ GOL!</span>
                        ) : (
                          <span style={{ fontSize: '1.7rem', fontWeight: 900, color: 'var(--accent-red)' }}>❌ PERDEU!</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* VAR MODAL (auto-opens on a VAR-reviewed goal, with a suspenseful reveal) */}
        {varModalOpen && varEvent && (() => {
          const confirmed = varEvent.type === 'GOAL';
          return (
            <div className="modal-overlay">
              <div className="modal-content" style={{ padding: '24px', maxWidth: '340px', textAlign: 'center' }}>
                <span style={{ fontSize: '2.6rem' }}>📺</span>
                <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>VAR</h3>
                <p style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: '4px' }}>Possível impedimento no lance de {varEvent.player}.</p>
                {varPhase === 'WAITING' ? (
                  <div className="match-time-pill" style={{ fontSize: '0.9rem', padding: '8px 18px', marginTop: '14px' }}>🔎 Analisando...</div>
                ) : (
                  <div style={{ margin: '14px 0' }}>
                    {confirmed ? (
                      <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-green)' }}>⚽ GOL CONFIRMADO!</span>
                    ) : (
                      <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-red)' }}>🚫 IMPEDIMENTO! Sem gol.</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* HALF-TIME MODAL (auto-opens at 45') */}
        {halftimeModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '2rem' }}>⏸️</span>
                <h3 style={{ fontWeight: 800, marginTop: '6px', color: 'var(--accent-gold)' }}>Intervalo — 45'</h3>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>O árbitro apita o fim do primeiro tempo. Deseja fazer alguma substituição? ({MAX_SUBS - subsUsed}/{MAX_SUBS} disponíveis)</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                {subsUsed < MAX_SUBS && (
                  <button
                    className="btn btn-secondary"
                    style={{ background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', color: 'var(--accent-gold)' }}
                    onClick={() => { setHalftimeModalOpen(false); setMidMatchSubModal(true); }}
                  >
                    🔄 Fazer Substituição
                  </button>
                )}
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
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
                  Ele foi expulso e já saiu de campo — seu time segue com {midMatchStarters.length} jogadores pelo resto da partida.
                  {subsUsed < MAX_SUBS
                    ? ' Você ainda pode reorganizar o time tirando outro jogador para encaixar alguém do banco.'
                    : ' Suas 5 substituições já foram usadas, não é possível reorganizar mais.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                {subsUsed < MAX_SUBS && (
                  <button
                    className="btn btn-secondary"
                    style={{ background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', color: 'var(--accent-red)', fontWeight: 700 }}
                    onClick={() => {
                      setRedCardModalOpen(false);
                      setSubslotIndex(null);
                      setMidMatchSubModal(true);
                    }}
                  >
                    🔄 Reorganizar Time ({MAX_SUBS - subsUsed} sub. restante{MAX_SUBS - subsUsed === 1 ? '' : 's'})
                  </button>
                )}
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

        {/* INJURY MODAL (auto-opens when a player gets injured in user's match) */}
        {injuryModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ padding: '20px', maxWidth: '340px' }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '2.4rem' }}>🚑</span>
                <h3 style={{ fontWeight: 800, marginTop: '6px', color: 'var(--accent-gold)' }}>Jogador Lesionado!</h3>
                {injuryPlayer && (
                  <div style={{ background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.2)', borderRadius: '8px', padding: '8px', margin: '8px 0', fontSize: '0.8rem' }}>
                    Jogador: <strong>❌ {injuryPlayer.name}</strong> ({injuryPlayer.position})
                    {injuryPlayer.injuryWeeks !== undefined && injuryPlayer.injuryWeeks > 0 && (
                      <div style={{ marginTop: '4px', color: 'var(--accent-red)', fontWeight: 700 }}>
                        Fora por {injuryPlayer.injuryWeeks} {injuryPlayer.injuryWeeks === 1 ? 'jogo' : 'jogos'} — não poderá ser escalado até se recuperar.
                      </div>
                    )}
                  </div>
                )}
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
                  {subsUsed < MAX_SUBS
                    ? 'Escolha abaixo quem entra no lugar dele.'
                    : 'Suas 5 substituições já foram usadas — o time segue desfalcado nessa posição pelo resto da partida.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                {subsUsed < MAX_SUBS ? (
                  <button
                    className="btn btn-secondary"
                    style={{ background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', color: 'var(--accent-gold)', fontWeight: 700 }}
                    onClick={() => {
                      setInjuryModalOpen(false);
                      if (injuryPlayer) {
                        const idx = midMatchStarters.findIndex(s => s.id === injuryPlayer.id);
                        setSubslotIndex(idx >= 0 ? idx : null);
                      }
                      setMidMatchSubModal(true);
                    }}
                  >
                    🔄 Substituir Agora
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setInjuryModalOpen(false);
                      setIsSimPaused(false);
                      if (injuryPlayer) {
                        setMidMatchStarters(prev => prev.filter(p => p.id !== injuryPlayer.id));
                      }
                    }}
                  >
                    ▶️ Continuar Jogo
                  </button>
                )}
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
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '12px', padding: '8px 10px', borderRadius: '8px',
                  background: subsUsed >= MAX_SUBS ? 'rgba(255,23,68,0.08)' : 'rgba(0,230,118,0.06)',
                  border: `1px solid ${subsUsed >= MAX_SUBS ? 'rgba(255,23,68,0.25)' : 'rgba(0,230,118,0.2)'}`
                }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: subsUsed >= MAX_SUBS ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    Substituições: {subsUsed}/{MAX_SUBS}
                  </span>
                  {subsUsed >= MAX_SUBS && <span style={{ fontSize: '0.72rem', color: 'var(--accent-red)' }}>Limite atingido</span>}
                </div>

                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '12px' }}>Ajuste seus titulares. Você pode fazer várias trocas nesta mesma janela — uma, duas, três, até {MAX_SUBS} — sem precisar reabrir a cada substituição.</p>

                {redCardPlayer && !midMatchStarters.some(s => s.id === redCardPlayer.id) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderRadius: '8px', marginBottom: '12px', background: 'rgba(255,23,68,0.08)', border: '1px solid rgba(255,23,68,0.25)' }}>
                    <span style={{ fontSize: '1rem' }}>🟥</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-red)' }}>
                      Expulso: <strong>{redCardPlayer.name}</strong> ({redCardPlayer.position})
                    </span>
                  </div>
                )}

                {/* An injured player isn't auto-removed from midMatchStarters the way a red card
                    is -- he's only actually swapped out once the manager picks his replacement
                    below -- so without this banner it wasn't obvious, looking at this modal alone,
                    which of the 11 names is the one who needs to come off. */}
                {injuryPlayer && midMatchStarters.some(s => s.id === injuryPlayer.id) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderRadius: '8px', marginBottom: '12px', background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.25)' }}>
                    <span style={{ fontSize: '1rem' }}>🚑</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
                      Lesionado: <strong>{injuryPlayer.name}</strong> ({injuryPlayer.position})
                    </span>
                  </div>
                )}

                <h4 style={{ fontSize: '0.85rem', marginBottom: '6px', color: 'var(--accent-gold)', fontWeight: 700 }}>Titulares em Campo ({midMatchStarters.length}):</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', marginBottom: '14px' }}>
                  {midMatchStarters.map(star => {
                    return (
                      <div
                        key={star.id}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#1e2126', borderRadius: '8px', fontSize: '0.8rem', border: star.redCards > 0 ? '1px solid var(--accent-red)' : 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`pos-badge ${star.position}`} style={{ padding: '2px 4px', fontSize: '0.65rem' }}>{star.position}</span>
                          <span style={{ fontWeight: 700 }}>{star.isStar ? '⭐ ' : ''}{star.name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>({star.rating})</span>
                          {star.yellowCards > 0 && <span style={{ fontSize: '0.72rem' }}>🟨{star.yellowCards > 1 ? ` x${star.yellowCards}` : ''}</span>}
                          {star.redCards > 0 && <span style={{ fontSize: '0.72rem' }}>🟥{star.redCards > 1 ? ` x${star.redCards}` : ''}</span>}
                          <ConditionBadge trend={star.performanceTrend} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: star.energy < 50 ? 'var(--accent-red)' : '#9ca3af' }}>⚡{star.energy}%</span>
                          <button
                            onClick={() => {
                              setSubslotIndex(midMatchStarters.indexOf(star));
                            }}
                            disabled={subsUsed >= MAX_SUBS}
                            style={{
                              background: subsUsed >= MAX_SUBS ? '#2a2d33' : 'var(--accent-red)',
                              color: subsUsed >= MAX_SUBS ? '#6b7280' : 'white',
                              border: 'none', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700,
                              cursor: subsUsed >= MAX_SUBS ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Mudar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {subslotIndex !== null && (() => {
                  const outgoing = midMatchStarters[subslotIndex];
                  // A player sent off THIS match is gone for the rest of it -- isPlayerAvailable
                  // alone doesn't catch that, since a live red card only gets recorded onto the
                  // player's persistent suspendedMatches field once the round ends, not mid-match.
                  // He's already filtered out of midMatchStarters by the live red-card effect, so
                  // without this he'd otherwise look like a perfectly fine bench option here.
                  const redCardedNamesThisMatch = new Set(simEvents.filter(e => e.type === 'RED').map(e => e.player));
                  const healthyBench = userClub.squad.filter(p => !midMatchStarters.some(s => s.id === p.id) && isPlayerAvailable(p) && !redCardedNamesThisMatch.has(p.name));
                  const samePositionBench = healthyBench.filter(p => p.position === outgoing?.position);
                  // Always show the WHOLE bench, not just same-position reserves -- the manager
                  // might deliberately want to bring on a different position (e.g. a defender in
                  // place of a winger, to shore up the defense after a red card elsewhere) even
                  // when a same-position reserve is available. Same-position options are sorted
                  // first purely for convenience. A goalkeeper is still never offered as an
                  // outfield substitute.
                  const restOfBench = outgoing?.position !== 'GOL'
                    ? healthyBench.filter(p => p.position !== 'GOL' && p.position !== outgoing?.position)
                    : healthyBench.filter(p => p.position !== outgoing?.position);
                  const benchPool = [...samePositionBench, ...restOfBench];
                  return (
                  <>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '6px', color: 'var(--accent-green)', fontWeight: 700 }}>
                      Escolha o Substituto {outgoing ? `(${outgoing.position})` : 'do Banco'}:
                    </h4>
                    {samePositionBench.length === 0 && outgoing && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--accent-gold)', marginBottom: '6px' }}>
                        Nenhum jogador de {outgoing.position} disponível — mostrando todo o banco.
                      </p>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                      {benchPool
                        .map(bench => {
                          return (
                            <div
                              key={bench.id}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#1e2126', borderRadius: '8px', fontSize: '0.8rem' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className={`pos-badge ${bench.position}`} style={{ padding: '2px 4px', fontSize: '0.65rem' }}>{bench.position}</span>
                                <span style={{ fontWeight: 700 }}>{bench.isStar ? '⭐ ' : ''}{bench.name}</span>
                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>({bench.rating})</span>
                                <ConditionBadge trend={bench.performanceTrend} />
                              </div>
                              <button
                                onClick={() => {
                                  const outP = midMatchStarters[subslotIndex];
                                  handleMidMatchSub(bench, outP);
                                  setSubslotIndex(null);
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
                  );
                })()}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '14px' }}
                  onClick={() => { setMidMatchSubModal(false); setSubslotIndex(null); setIsSimPaused(false); }}
                >
                  ▶️ Concluir e Voltar ao Jogo
                </button>
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
      <div className="mobile-wrapper safe-padded" style={{ justifyContent: 'center', gap: '16px' }}>
        {championCelebration && (
          <div className="modal-overlay" style={{ zIndex: 1300 }}>
            <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>🏆</span>
              <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>Parabéns!</h3>
              <p style={{ fontSize: '1rem', margin: '10px 0 20px', color: '#d1d5db' }}>
                Você foi campeão {championCelebration.competition === 'Mundial de Clubes' ? 'do' : 'da'} <strong style={{ color: 'var(--accent-gold)' }}>{championCelebration.competition}</strong> com o <strong>{championCelebration.clubName}</strong>!
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={dismissChampionCelebration}>
                Continuar
              </button>
            </div>
          </div>
        )}
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
              Você encerrou a temporada no comando do <strong>{userClub.name}</strong>. A diretoria está satisfeita com seu trabalho!
            </p>
          </div>
        )}

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
            {isSacked ? 'Propostas de Recomeço' : 'Propostas Disponíveis'}
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
          >
            <span className="club-badge-mini" style={{ backgroundColor: userClub.primaryColor, border: `1px solid ${userClub.secondaryColor}` }} />
            <span>{userClub.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', marginLeft: '4px' }}>Série {userClub.division}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, color: userClub.finances < 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontSize: '1rem' }}>
              {formatCurrency(userClub.finances)}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600 }}>
              {managerName} • Ano {currentYear}
            </div>
          </div>
          <button
            onClick={() => setSettingsModalOpen(true)}
            title="Configurações"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', borderRadius: '10px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* RENDER TABS CONTENT */}
      <div className="scrollable" ref={scrollableRef}>

        {/* --- TAB 0: ESCRITÓRIO --- */}
        {activeTab === 0 && (
          <>
            {/* News feed */}
            <div className="card-title"><Activity size={18} color="var(--accent-green)" /> Feed de Notícias</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {news.slice().reverse().map((n) => (
                <div
                  key={n.id}
                  onClick={n.linkTab !== undefined ? () => setActiveTab(n.linkTab!) : undefined}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: n.importance === 'HIGH' ? 'rgba(255, 193, 7, 0.08)' : '#121316',
                    borderLeft: `3px solid ${n.importance === 'HIGH' ? 'var(--accent-gold)' : n.type === 'BOARD' ? 'var(--accent-red)' : n.type === 'TRANSFER' ? 'var(--accent-blue)' : n.type === 'OFFER' ? 'var(--accent-gold)' : 'var(--accent-gray)'}`,
                    border: n.importance === 'HIGH' ? '1px solid rgba(255, 193, 7, 0.25)' : undefined,
                    fontSize: '0.8rem',
                    lineHeight: '1.4',
                    cursor: n.linkTab !== undefined ? 'pointer' : 'default'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: n.importance === 'HIGH' ? 'var(--accent-gold)' : '#6b7280', marginBottom: '2px', fontWeight: 700 }}>
                    <span>{n.importance === 'HIGH' ? '🚨 ÚLTIMA HORA' : n.type.toUpperCase()}</span>
                    <span>RODADA {n.week}</span>
                  </div>
                  <span style={{ color: n.importance === 'HIGH' ? '#fff' : '#d1d5db', fontWeight: n.importance === 'HIGH' ? 600 : 400 }}>
                    {n.text}{n.linkTab !== undefined ? ' →' : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Sound/vibration toggle UI intentionally hidden for now (too prominent for a
                plain web page that isn't installed as a real app yet) -- the feature itself
                still works at its default (both on); revisit with a small, unobtrusive icon
                once this ships as an actual app. */}
          </>
        )}

        {/* --- TAB 1: ELENCO & TÁTICA --- */}
        {activeTab === 1 && (
          <>
            {/* Round info + Iniciar Partida -- a pending Copa tie OR Libertadores fixture gates
                the league: the extra midweek fixture has to be played before the next
                Brasileirão round unlocks. Copa do Brasil takes priority when both are due the
                same week (per the user's choice, that just means two extra matches, played in
                sequence, instead of the game avoiding the collision). */}
            {cupState && cupState.userTie ? (() => {
              const phase = PHASES[cupState.phaseIndex];
              const tie = cupState.userTie;
              const isSecondLeg = tie.legs.length === 1;
              const legHomeId = isSecondLeg ? tie.awayId : tie.homeId;
              const legAwayId = isSecondLeg ? tie.homeId : tie.awayId;
              const isHomeThisLeg = legHomeId === userClubId;
              const opponentId = isHomeThisLeg ? legAwayId : legHomeId;
              const opponent = clubs.find(c => c.id === opponentId);
              const isTwoLegged = TWO_LEGGED_PHASES.includes(phase);
              return (
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.12) 0%, rgba(12, 13, 14, 0.9) 100%)', border: '1px solid rgba(255, 193, 7, 0.4)' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: 700, textTransform: 'uppercase' }}>🏆 Copa do Brasil</span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                      {CUP_PHASE_LABEL[phase]}{isTwoLegged ? (isSecondLeg ? ' (Jogo de Volta)' : ' (Jogo de Ida)') : ''}
                    </h2>
                  </div>
                  {opponent && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="club-badge-mini" style={{ backgroundColor: opponent.primaryColor, border: `1px solid ${opponent.secondaryColor}`, width: '16px', height: '16px' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>VS {opponent.name} ({isHomeThisLeg ? 'Casa' : 'Fora'})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: '#9ca3af' }}>
                        <span>Série {opponent.division}</span>
                      </div>
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (!isPremium) { setPremiumPaywallReason('Copa do Brasil'); return; }
                      if (phase === 'FINAL') {
                        setPressConferenceContext('CUP');
                      } else {
                        beginMatchKickoff();
                        startCupMatch(starters);
                      }
                    }}
                    style={{ marginTop: '16px', height: '48px', background: 'var(--accent-gold)' }}
                  >
                    {isPremium ? <Play size={18} fill="#000" /> : <Lock size={16} />} Iniciar Partida da Copa
                  </button>
                </div>
              );
            })() : libertadoresState && libertadoresState.userTie ? (() => {
              const phase = libertadoresState.phase;
              const tie = libertadoresState.userTie;
              const isSecondLeg = phase !== 'GROUPS' && tie.legs.length === 1;
              const legHomeId = isSecondLeg ? tie.awayId : tie.homeId;
              const legAwayId = isSecondLeg ? tie.homeId : tie.awayId;
              const isHomeThisLeg = legHomeId === userClubId;
              const opponentId = isHomeThisLeg ? legAwayId : legHomeId;
              const opponent = clubs.find(c => c.id === opponentId) ?? libertadoresClubs.find(c => c.id === opponentId);
              const isTwoLegged = phase !== 'GROUPS' && phase !== 'FINAL';
              const phaseLabel = phase === 'GROUPS' ? `Fase de Grupos (Grupo ${tie.group})` : LIBERTADORES_PHASE_LABEL[phase];
              return (
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(0, 150, 220, 0.14) 0%, rgba(12, 13, 14, 0.9) 100%)', border: '1px solid rgba(0, 150, 220, 0.4)' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#4db8ff', fontWeight: 700, textTransform: 'uppercase' }}>🌎 Copa Libertadores</span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                      {phaseLabel}{isTwoLegged ? (isSecondLeg ? ' (Jogo de Volta)' : ' (Jogo de Ida)') : ''}
                    </h2>
                  </div>
                  {opponent && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="club-badge-mini" style={{ backgroundColor: opponent.primaryColor, border: `1px solid ${opponent.secondaryColor}`, width: '16px', height: '16px' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>VS {opponent.name} ({isHomeThisLeg ? 'Casa' : 'Fora'})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: '#9ca3af' }}>
                        <span>{opponent.country ?? `Série ${opponent.division}`}</span>
                      </div>
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (!isPremium) { setPremiumPaywallReason('Copa Libertadores'); return; }
                      if (phase === 'FINAL') {
                        setPressConferenceContext('LIBERTADORES');
                      } else {
                        beginMatchKickoff();
                        startLibertadoresMatch(starters);
                      }
                    }}
                    style={{ marginTop: '16px', height: '48px', background: '#0096dc' }}
                  >
                    {isPremium ? <Play size={18} fill="#000" /> : <Lock size={16} />} Iniciar Partida da Libertadores
                  </button>
                </div>
              );
            })() : mundialState ? (() => {
              const phase = mundialState.phase;
              const opponentId = phase === 'SEMIFINAL' ? mundialState.semifinalOpponentId : mundialState.finalOpponentId;
              const opponent = mundialClubs.find(c => c.id === opponentId);
              const phaseLabel = phase === 'SEMIFINAL' ? 'Semifinal' : 'Final';
              return (
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.16) 0%, rgba(12, 13, 14, 0.9) 100%)', border: '1px solid rgba(147, 51, 234, 0.4)' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 700, textTransform: 'uppercase' }}>🌐 Mundial de Clubes</span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{phaseLabel}</h2>
                  </div>
                  {opponent && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="club-badge-mini" style={{ backgroundColor: opponent.primaryColor, border: `1px solid ${opponent.secondaryColor}`, width: '16px', height: '16px' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>VS {opponent.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', color: '#9ca3af' }}>
                        <span>{opponent.country}</span>
                      </div>
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (!isPremium) { setPremiumPaywallReason('Mundial de Clubes'); return; }
                      beginMatchKickoff();
                      startMundialMatch(starters);
                    }}
                    style={{ marginTop: '16px', height: '48px', background: '#9333ea' }}
                  >
                    {isPremium ? <Play size={18} fill="#000" /> : <Lock size={16} />} Iniciar Partida do Mundial
                  </button>
                </div>
              );
            })() : (
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
                  onClick={() => {
                    const roundMatches = schedule.filter(m => m.round === currentRound);
                    const pMatch = roundMatches.find(m => m.homeId === userClubId || m.awayId === userClubId);
                    const oppId = pMatch ? (pMatch.homeId === userClubId ? pMatch.awayId : pMatch.homeId) : null;
                    if (oppId && isClassico(userClubId, oppId)) {
                      setPressConferenceContext('LEAGUE');
                    } else {
                      beginMatchKickoff();
                      nextRound(starters);
                    }
                  }}
                  style={{ marginTop: '16px', height: '48px' }}
                >
                  <Play size={18} fill="#000" /> Iniciar Partida
                </button>
              </div>
            )}

            {/* Tactic dropdown and Force summary */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>Esquema Tático</span>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {(['4-4-2', '3-5-2', '4-3-3'] as const).map(tac => {
                  const available = userClub ? isTacticAvailable(tac, userClub.squad) : true;
                  return (
                    <button
                      key={tac}
                      onClick={() => setSelectedTactic(tac)}
                      disabled={!available}
                      className={`sub-tab-btn ${selectedTactic === tac ? 'active' : ''}`}
                      style={{ 
                        flex: '1 1 auto', 
                        padding: '8px 12px', 
                        fontSize: '0.8rem', 
                        minWidth: '80px', 
                        textAlign: 'center',
                        opacity: available ? 1 : 0.4,
                        cursor: available ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      title={available ? `Selecionar tática ${tac}` : `Tática Indisponível: Sem jogadores saudáveis suficientes para o esquema ${tac}`}
                    >
                      {tac} {!available && <span style={{ fontSize: '0.7rem' }}>🔒</span>}
                    </button>
                  );
                })}
              </div>

              {/* Squad optimization buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '6px 4px', fontSize: '0.7rem', borderRadius: '8px', border: '1px solid rgba(0, 230, 118, 0.2)', color: 'var(--accent-green)', background: 'rgba(0, 230, 118, 0.05)' }}
                  onClick={() => {
                    if (!userClub) return;
                    // Helper logic to grab target tactic sizes
                    const { targetZAG, targetLD, targetLE, targetVOL, targetMEI, targetPON, targetCA } = getTacticNeeds(selectedTactic);

                    const pool = [...userClub.squad].filter(isPlayerAvailable).sort((a, b) => b.rating - a.rating);
                    const bestSelected: Player[] = [];
                    const gks = pool.filter(p => p.position === 'GOL');
                    if (gks[0]) bestSelected.push(gks[0]);

                    const zags = pool.filter(p => p.position === 'ZAG');
                    const lds = pool.filter(p => p.position === 'LD');
                    const les = pool.filter(p => p.position === 'LE');
                    const vols = pool.filter(p => p.position === 'VOL');
                    const meis = pool.filter(p => p.position === 'MEI');
                    const pons = pool.filter(p => p.position === 'PON');
                    const cas = pool.filter(p => p.position === 'CA');

                    for (let i = 0; i < Math.min(targetZAG, zags.length); i++) bestSelected.push(zags[i]);
                    for (let i = 0; i < Math.min(targetLD, lds.length); i++) bestSelected.push(lds[i]);
                    for (let i = 0; i < Math.min(targetLE, les.length); i++) bestSelected.push(les[i]);
                    for (let i = 0; i < Math.min(targetVOL, vols.length); i++) bestSelected.push(vols[i]);
                    for (let i = 0; i < Math.min(targetMEI, meis.length); i++) bestSelected.push(meis[i]);
                    for (let i = 0; i < Math.min(targetPON, pons.length); i++) bestSelected.push(pons[i]);
                    for (let i = 0; i < Math.min(targetCA, cas.length); i++) bestSelected.push(cas[i]);

                    // PON and CA cover for each other: a winger can play as a makeshift
                    // centre-forward (and vice versa) when the club lacks a natural fit.
                    const ponCaShort = (targetPON + targetCA) - bestSelected.filter(p => p.position === 'PON' || p.position === 'CA').length;
                    if (ponCaShort > 0) {
                      const usedIds = new Set(bestSelected.map(p => p.id));
                      const extra = [...pons, ...cas].filter(p => !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
                      for (let i = 0; i < Math.min(ponCaShort, extra.length); i++) bestSelected.push(extra[i]);
                    }

                    // A Meia can anchor the midfield when the club has no natural Volante at all.
                    const volMeiShort = (targetVOL + targetMEI) - bestSelected.filter(p => p.position === 'VOL' || p.position === 'MEI').length;
                    if (volMeiShort > 0) {
                      const usedIds = new Set(bestSelected.map(p => p.id));
                      const extra = [...vols, ...meis].filter(p => !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
                      for (let i = 0; i < Math.min(volMeiShort, extra.length); i++) bestSelected.push(extra[i]);
                    }

                    // Fill to 11 if needed
                    if (bestSelected.length < 11) {
                      const ids = new Set(bestSelected.map(p => p.id));
                      const rest = userClub.squad.filter(p => isPlayerAvailable(p) && !ids.has(p.id)).sort((a, b) => b.rating - a.rating);
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
                    const { targetZAG, targetLD, targetLE, targetVOL, targetMEI, targetPON, targetCA } = getTacticNeeds(selectedTactic);

                    // Sort all non-injured squad by energy level (higher energy first), then by rating
                    const pool = [...userClub.squad].filter(isPlayerAvailable).sort((a, b) => b.energy - a.energy || b.rating - a.rating);

                    const selected: Player[] = [];
                    // Force pick the gk with best energy
                    const gks = pool.filter(p => p.position === 'GOL');
                    if (gks[0]) selected.push(gks[0]);

                    const zags = pool.filter(p => p.position === 'ZAG');
                    const lds = pool.filter(p => p.position === 'LD');
                    const les = pool.filter(p => p.position === 'LE');
                    const vols = pool.filter(p => p.position === 'VOL');
                    const meis = pool.filter(p => p.position === 'MEI');
                    const pons = pool.filter(p => p.position === 'PON');
                    const cas = pool.filter(p => p.position === 'CA');

                    for (let i = 0; i < Math.min(targetZAG, zags.length); i++) selected.push(zags[i]);
                    for (let i = 0; i < Math.min(targetLD, lds.length); i++) selected.push(lds[i]);
                    for (let i = 0; i < Math.min(targetLE, les.length); i++) selected.push(les[i]);
                    for (let i = 0; i < Math.min(targetVOL, vols.length); i++) selected.push(vols[i]);
                    for (let i = 0; i < Math.min(targetMEI, meis.length); i++) selected.push(meis[i]);
                    for (let i = 0; i < Math.min(targetPON, pons.length); i++) selected.push(pons[i]);
                    for (let i = 0; i < Math.min(targetCA, cas.length); i++) selected.push(cas[i]);

                    // PON and CA cover for each other: a winger can play as a makeshift
                    // centre-forward (and vice versa) when the club lacks a natural fit.
                    const ponCaShort = (targetPON + targetCA) - selected.filter(p => p.position === 'PON' || p.position === 'CA').length;
                    if (ponCaShort > 0) {
                      const usedIds = new Set(selected.map(p => p.id));
                      const extra = [...pons, ...cas].filter(p => !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
                      for (let i = 0; i < Math.min(ponCaShort, extra.length); i++) selected.push(extra[i]);
                    }

                    // A Meia can anchor the midfield when the club has no natural Volante at all.
                    const volMeiShort = (targetVOL + targetMEI) - selected.filter(p => p.position === 'VOL' || p.position === 'MEI').length;
                    if (volMeiShort > 0) {
                      const usedIds = new Set(selected.map(p => p.id));
                      const extra = [...vols, ...meis].filter(p => !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
                      for (let i = 0; i < Math.min(volMeiShort, extra.length); i++) selected.push(extra[i]);
                    }

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

              {/* Force Summary (under buttons) -- box color signals the strength tier itself
                  (gray 0-50, yellow 51-70, blue 71-89, green 90-99), not a fixed defesa/ataque color. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                {(() => {
                  const defColor = getForceColor(startersForces.defense);
                  const atkColor = getForceColor(startersForces.attack);
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: `${defColor}14`, border: `1px solid ${defColor}40`, borderRadius: '10px', padding: '8px 12px' }}>
                        <Shield size={18} color={defColor} />
                        <div>
                          <div style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.5px' }}>DEFESA</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: defColor, lineHeight: 1.1 }}>{startersForces.defense}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: `${atkColor}14`, border: `1px solid ${atkColor}40`, borderRadius: '10px', padding: '8px 12px' }}>
                        <TrendingUp size={18} color={atkColor} />
                        <div>
                          <div style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.5px' }}>ATAQUE</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: atkColor, lineHeight: 1.1 }}>{startersForces.attack}</div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Soccer pitch representation (height expanded to 440px to prevent labels squeezing) */}
            <div className="pitch-container" style={{ position: 'relative', width: '100%', height: '440px', background: 'radial-gradient(circle, var(--pitch-green-light) 0%, var(--pitch-green) 100%)', borderRadius: '16px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
                <div className="pitch-line pitch-center-circle" />
                <div className="pitch-line pitch-midline" />
                <div className="pitch-line pitch-penalty-area-top" />
                <div className="pitch-line pitch-penalty-area-bottom" />

                {(() => {


                  // Dynamically assign current coords by matching players directly to tactical role requirements rather than layout index slots.
                  // This guarantees that a GOL (GK) is always placed in the goal coordinates, ATAs in the attack coordinates, etc.
                  // regardless of the order they appear inside the starters state array!
                  
                  // Setup coordinate mapping slots for each role
                  const roleCoords: Record<string, { role: PlayerPosition; x: number; y: number }[]> = {
                    '4-4-2': [
                      { role: 'GOL', x: 50, y: 88 },
                      { role: 'LE', x: 12, y: 72 },
                      { role: 'ZAG', x: 37, y: 74 },
                      { role: 'ZAG', x: 63, y: 74 },
                      { role: 'LD', x: 88, y: 72 },
                      { role: 'VOL', x: 35, y: 58 },
                      { role: 'VOL', x: 65, y: 58 },
                      { role: 'MEI', x: 25, y: 38 },
                      { role: 'MEI', x: 75, y: 38 },
                      { role: 'CA', x: 35, y: 18 },
                      { role: 'CA', x: 65, y: 18 }
                    ],
                    '3-5-2': [
                      { role: 'GOL', x: 50, y: 88 },
                      { role: 'ZAG', x: 30, y: 76 },
                      { role: 'ZAG', x: 50, y: 78 },
                      { role: 'ZAG', x: 70, y: 76 },
                      { role: 'LE', x: 10, y: 58 },
                      { role: 'LD', x: 90, y: 58 },
                      { role: 'VOL', x: 50, y: 50 },
                      { role: 'MEI', x: 32, y: 36 },
                      { role: 'MEI', x: 68, y: 36 },
                      { role: 'CA', x: 35, y: 18 },
                      { role: 'CA', x: 65, y: 18 }
                    ],
                    '4-3-3': [
                      { role: 'GOL', x: 50, y: 88 },
                      { role: 'LE', x: 12, y: 72 },
                      { role: 'ZAG', x: 37, y: 74 },
                      { role: 'ZAG', x: 63, y: 74 },
                      { role: 'LD', x: 88, y: 72 },
                      { role: 'VOL', x: 50, y: 56 },
                      { role: 'MEI', x: 30, y: 42 },
                      { role: 'MEI', x: 70, y: 42 },
                      { role: 'PON', x: 18, y: 22 },
                      { role: 'PON', x: 82, y: 22 },
                      { role: 'CA', x: 50, y: 14 }
                    ]
                  };

                  const currentSlots = roleCoords[selectedTactic] || roleCoords['4-4-2'];

                  // Assign every slot in 3 ordered passes -- doing this per-slot inline (as
                  // before) made the outcome depend on array order: if a MEI slot came before
                  // the CA slots and had no exact match, its generic "any leftover player"
                  // fallback could grab a PON that a later CA slot actually needed, leaving
                  // the attack empty. Resolving all slots in dedicated passes first prevents
                  // an earlier slot's loose fallback from stealing a later slot's rightful sibling.
                  const placedIds = new Set<string>();
                  const slotAssignments: (Player | null)[] = new Array(currentSlots.length).fill(null);

                  // Pass 1: exact position match
                  currentSlots.forEach((slot, i) => {
                    const match = starters.find(p => !placedIds.has(p.id) && p.position === slot.role);
                    if (match) { slotAssignments[i] = match; placedIds.add(match.id); }
                  });

                  // Pass 2: PON and CA cover for each other (a winger playing as makeshift
                  // striker, or vice versa), and MEI covers VOL, before any slot resorts to a
                  // mismatched position.
                  currentSlots.forEach((slot, i) => {
                    if (slotAssignments[i]) return;
                    let sibling: PlayerPosition | null = null;
                    if (slot.role === 'CA') sibling = 'PON';
                    else if (slot.role === 'PON') sibling = 'CA';
                    else if (slot.role === 'VOL') sibling = 'MEI';
                    if (!sibling) return;
                    const match = starters.find(p => !placedIds.has(p.id) && p.position === sibling);
                    if (match) { slotAssignments[i] = match; placedIds.add(match.id); }
                  });

                  // Pass 3: fill whatever is still empty with any leftover player (safeguard)
                  currentSlots.forEach((_slot, i) => {
                    if (slotAssignments[i]) return;
                    const match = starters.find(p => !placedIds.has(p.id));
                    if (match) { slotAssignments[i] = match; placedIds.add(match.id); }
                  });

                  return currentSlots.map((slot, index) => {
                    const matchingPlayer = slotAssignments[index];

                    if (!matchingPlayer) {
                      // Empty slot placeholder (should not happen with 11 starters, but good for safety)
                      return (
                        <div key={`empty-${index}`} style={{ position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}>
                          <div className="token-circle empty">?</div>
                        </div>
                      );
                    }

                    const p = matchingPlayer;
                    const sideLabel: string = p.position;

                    const positionColors: Record<PlayerPosition, string> = {
                      GOL: '#ffa726',
                      ZAG: '#29b6f6',
                      LD: '#29b6f6',
                      LE: '#29b6f6',
                      VOL: 'var(--accent-green)',
                      MEI: 'var(--accent-green)',
                      PON: 'var(--accent-red)',
                      CA: 'var(--accent-red)'
                    };
                    const labelColor = positionColors[p.position];

                    return (
                      <div 
                        key={p.id} 
                        className="player-token" 
                        onClick={() => { setSubslotIndex(starters.indexOf(p)); setSubModalOpen(true); }}
                        style={{
                          position: 'absolute',
                          left: `${slot.x}%`,
                          top: `${slot.y}%`,
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
            <div className="card-title"><Users size={18} color="var(--accent-green)" /> Todos os Jogadores ({userClub.squad.length}, mín. 16)</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {userClub.squad.map(player => {
                const isStarter = starters.some(s => s.id === player.id);
                const isExpanded = selectedManagePlayerId === player.id;
                const remainingWeeks = player.contractWeeks ?? 38;

                return (
                  <div key={player.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div 
                      className={`player-row ${player.isInjured || (player.suspendedMatches ?? 0) > 0 ? 'injured' : ''}`}
                      onClick={() => setSelectedManagePlayerId(isExpanded ? null : player.id)}
                      style={{
                        borderLeft: isStarter ? '3px solid var(--accent-green)' : '3px solid transparent',
                        background: isStarter ? 'rgba(0, 230, 118, 0.03)' : '',
                        cursor: 'pointer'
                      }}
                    >
                      <span className={`pos-badge ${player.position}`}>{player.position}</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                          {player.personality && <span style={{ fontSize: '0.75rem' }} title={PERSONALITY_LABEL[player.personality]}>{PERSONALITY_ICON[player.personality]}</span>}
                          {player.goals > 0 && <span title={`${player.goals} gol(s) na temporada`} style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-gold)' }}>⚽ {player.goals}</span>}
                          {player.yellowCards > 0 && <span title={`${player.yellowCards} cartão(ões) amarelo(s) na temporada`} style={{ fontSize: '0.72rem' }}>🟨{player.yellowCards > 1 ? ` x${player.yellowCards}` : ''}</span>}
                          {player.redCards > 0 && <span title={`${player.redCards} cartão(ões) vermelho(s) na temporada`} style={{ fontSize: '0.72rem' }}>🟥{player.redCards > 1 ? ` x${player.redCards}` : ''}</span>}
                          <ConditionBadge trend={player.performanceTrend} />
                          {userClub.penaltyTakerId === player.id && <span style={{ fontSize: '0.75rem' }} title="Cobrador de Pênalti">🎯</span>}
                          {player.contractLocked && <span style={{ fontSize: '0.75rem' }} title="Contrato Trancado">🔒</span>}
                          {player.isInjured && <span title="Lesionado - indisponível para escalação" style={{ fontSize: '0.65rem', background: 'var(--accent-red)', color: 'white', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>❌ Lesionado ({player.injuryWeeks} {player.injuryWeeks === 1 ? 'jogo' : 'jogos'})</span>}
                          {!player.isInjured && (player.suspendedMatches ?? 0) > 0 && <span title="Suspenso - indisponível para escalação" style={{ fontSize: '0.65rem', background: 'var(--accent-red)', color: 'white', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>🟥 Suspenso ({player.suspendedMatches} {player.suspendedMatches === 1 ? 'jogo' : 'jogos'})</span>}
                          {player.energy < 60 && <span style={{ fontSize: '0.65rem', background: 'rgba(255, 193, 7, 0.1)', color: 'var(--accent-gold)', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>Fadiga ({player.energy}%)</span>}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{player.age} anos • {formatCurrency(player.value)}</span>
                        {getPotentialDisplay(player) && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--accent-gold)' }}>{getPotentialDisplay(player)}</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: player.energy < 60 ? 'var(--accent-red)' : 'var(--accent-green)' }}>⚡{player.energy}%</span>
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
                        {player.contractLocked && (
                          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 4px' }}>
                            🔒 Contrato já renovado e trancado -- só é possível renovar de novo depois que este vencer.
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => { renewContract(player.id, '6M'); setSelectedManagePlayerId(null); }}
                            disabled={player.contractLocked}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: player.contractLocked ? '#2a2d33' : 'rgba(255, 193, 7, 0.05)', border: player.contractLocked ? '1px solid #3a3d43' : '1px solid rgba(255, 193, 7, 0.2)', color: player.contractLocked ? '#6b7280' : 'var(--accent-gold)', minWidth: '100px', cursor: player.contractLocked ? 'not-allowed' : 'pointer' }}
                            title="Renova o contrato por 6 meses e tranca o jogador (não pode sair nem ser comprado)"
                          >
                            🔒 Renovar 6M (+19s)
                          </button>
                          <button
                            onClick={() => { renewContract(player.id, '1Y'); setSelectedManagePlayerId(null); }}
                            disabled={player.contractLocked}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: player.contractLocked ? '#2a2d33' : 'rgba(255, 193, 7, 0.1)', border: player.contractLocked ? '1px solid #3a3d43' : '1px solid rgba(255, 193, 7, 0.3)', color: player.contractLocked ? '#6b7280' : 'var(--accent-gold)', minWidth: '100px', cursor: player.contractLocked ? 'not-allowed' : 'pointer' }}
                            title="Renova o contrato por 1 ano e tranca o jogador (não pode sair nem ser comprado)"
                          >
                            🔒 Renovar 1 Ano (+38s)
                          </button>
                          <button
                            onClick={() => { renewContract(player.id, '2Y'); setSelectedManagePlayerId(null); }}
                            disabled={player.contractLocked}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: player.contractLocked ? '#2a2d33' : 'rgba(255, 193, 7, 0.15)', border: player.contractLocked ? '1px solid #3a3d43' : '1px solid rgba(255, 193, 7, 0.38)', color: player.contractLocked ? '#6b7280' : 'var(--accent-gold)', minWidth: '100px', cursor: player.contractLocked ? 'not-allowed' : 'pointer' }}
                            title="Renova o contrato por 2 anos e tranca o jogador (não pode sair nem ser comprado)"
                          >
                            🔒 Renovar 2 Anos (+76s)
                          </button>
                          <button
                            onClick={() => {
                              if (player.contractLocked) return;
                              setSellPriceDigits(String(player.value));
                              setSellPriceModal(player);
                            }}
                            disabled={player.contractLocked}
                            className="btn btn-danger"
                            style={{ flex: 1.2, padding: '6px', fontSize: '0.72rem', background: player.contractLocked ? '#2e191b' : 'rgba(255, 23, 68, 0.1)', border: player.contractLocked ? '1px solid #4a1c20' : '1px solid rgba(255, 23, 68, 0.2)', color: player.contractLocked ? '#9ca3af' : 'var(--accent-red)', minWidth: '100px', cursor: player.contractLocked ? 'not-allowed' : 'pointer' }}
                          >
                            {player.contractLocked ? '🔒 Trancado' : `💰 Vender (Valor: ${formatCurrency(player.value)})`}
                          </button>
                          <button
                            onClick={() => {
                              if (player.contractLocked) return;
                              if (confirm(`Aposentar ${player.name}? Ele encerra a carreira e sai do jogo definitivamente -- essa ação não pode ser desfeita.`)) {
                                retirePlayer(player);
                                setSelectedManagePlayerId(null);
                              }
                            }}
                            disabled={player.contractLocked}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px', fontSize: '0.72rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: player.contractLocked ? '#6b7280' : '#9ca3af', minWidth: '100px', cursor: player.contractLocked ? 'not-allowed' : 'pointer' }}
                          >
                            🎽 Aposentar
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
                      Substituindo titular: <strong>{starters[subslotIndex]?.name}</strong> ({starters[subslotIndex]?.position})
                    </p>
                    {userClub.squad
                      .filter(p => !starters.some(s => s.id === p.id) && isPlayerAvailable(p) && p.position === starters[subslotIndex]?.position)
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
                      {userClub.squad.filter(p => !starters.some(s => s.id === p.id) && isPlayerAvailable(p) && p.position === starters[subslotIndex]?.position).length === 0 && (
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
            {/* Filters -- all dropdowns instead of button grids, laid out two per row so the
                actual player list starts much closer to the top instead of after a wall of
                buttons. */}
            <div className="card" style={{ padding: '10px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={marketSelectLabelStyle}>Buscar jogador pelo nome</label>
                <input
                  type="text"
                  value={marketSearchQuery}
                  onChange={(e) => setMarketSearchQuery(e.target.value)}
                  placeholder="Ex: Messi..."
                  style={marketSelectStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={marketSelectLabelStyle}>Fonte</label>
                <select
                  value={marketViewMode}
                  onChange={(e) => {
                    const mode = e.target.value as typeof marketViewMode;
                    if (mode === 'FOREIGN' && !isPremium) {
                      setPremiumPaywallReason('Mercado Internacional');
                      return;
                    }
                    setMarketViewMode(mode);
                  }}
                  style={marketSelectStyle}
                >
                  <option value="FREE_AGENTS">Jogadores Livres</option>
                  <option value="CLUBS">Jogadores de Clubes</option>
                  <option value="FOREIGN">{!isPremium ? '🔒 Jogadores de Outras Ligas (Premium)' : 'Jogadores de Outras Ligas'}</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={marketSelectLabelStyle}>Posição</label>
                <select
                  value={marketPosFilter}
                  onChange={(e) => setMarketPosFilter(e.target.value as typeof marketPosFilter)}
                  style={marketSelectStyle}
                >
                  {(['ALL', 'GOL', 'ZAG', 'LD', 'LE', 'VOL', 'MEI', 'PON', 'CA'] as const).map(pos => (
                    <option key={pos} value={pos}>{pos === 'ALL' ? 'Todos' : pos}</option>
                  ))}
                </select>
              </div>
              </div>
            </div>

            {marketSearchQuery.trim().length >= 2 ? (() => {
              const q = marketSearchQuery.trim().toLowerCase();
              const matchesPos = (pos: PlayerPosition) => marketPosFilter === 'ALL' || pos === marketPosFilter;

              type SearchHit =
                | { source: 'FREE'; key: string; player: Player }
                | { source: 'CLUB'; key: string; player: Player; clubName: string; clubDivision: 'A' | 'B' | 'C'; clubId: string }
                | { source: 'FOREIGN'; key: string; player: ForeignPlayer };

              const hits: SearchHit[] = [];

              marketPlayers.forEach(p => {
                if (matchesPos(p.position) && p.name.toLowerCase().includes(q)) {
                  hits.push({ source: 'FREE', key: `free_${p.id}`, player: p });
                }
              });

              clubs.forEach(c => {
                if (c.id === userClubId) return;
                c.squad.forEach(p => {
                  if (matchesPos(p.position) && p.name.toLowerCase().includes(q)) {
                    hits.push({ source: 'CLUB', key: `club_${p.id}`, player: p, clubName: c.name, clubDivision: c.division as 'A' | 'B' | 'C', clubId: c.id });
                  }
                });
              });

              if (isPremium) {
                foreignPlayerPool.forEach(p => {
                  if (boughtForeignIds.includes(p.id)) return;
                  if (matchesPos(p.position) && p.name.toLowerCase().includes(q)) {
                    hits.push({ source: 'FOREIGN', key: `foreign_${p.id}`, player: p });
                  }
                });
              }

              hits.sort((a, b) => b.player.rating - a.player.rating);
              const shown = hits.slice(0, 40);

              return (
                <>
                  <div className="card-title"><Users size={18} color="var(--accent-green)" /> Busca: "{marketSearchQuery.trim()}" ({hits.length}{hits.length > shown.length ? `, mostrando ${shown.length}` : ''})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                    {shown.length === 0 && (
                      <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>
                        Nenhum jogador encontrado{!isPremium ? ' (Mercado Internacional exige Premium)' : ''}.
                      </p>
                    )}
                    {shown.map(hit => {
                      const player = hit.player;
                      const originLabel = hit.source === 'FREE'
                        ? 'Sem Clube (Livre)'
                        : hit.source === 'CLUB'
                        ? `${hit.clubName} (Série ${hit.clubDivision})`
                        : `${hit.player.originClub} (${hit.player.league})`;
                      const locked = hit.source === 'CLUB' && player.contractLocked;

                      return (
                        <div key={hit.key} className="player-row">
                          <span className={`pos-badge ${player.position}`}>{player.position}</span>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{originLabel}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="rating-badge">{player.rating}</span>
                            {locked ? (
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px' }}>🔒 1 ano</span>
                            ) : (
                              <button
                                onClick={() => {
                                  if (hit.source === 'FREE') {
                                    setPurchaseConfirmData({
                                      player,
                                      clubName: 'Sem Clube (Livre)',
                                      price: player.value,
                                      onConfirm: () => buyPlayer(player)
                                    });
                                  } else if (hit.source === 'CLUB') {
                                    setNegotiatingPlayer(player);
                                    setNegotiatingClubId(hit.clubId);
                                    setOfferAmount(player.value);
                                    setNegotiationStage('OFFER');
                                    setNegotiationResult(null);
                                  } else {
                                    setPurchaseConfirmData({
                                      player,
                                      clubName: `${hit.player.originClub} (${hit.player.league})`,
                                      price: player.value,
                                      onConfirm: () => {
                                        const sourceClub = libertadoresClubs.find(c => c.name === hit.player.originClub);
                                        if (sourceClub) {
                                          buyLibertadoresPlayer(hit.player, sourceClub.id);
                                        } else {
                                          buyForeignPlayer(hit.player);
                                        }
                                      }
                                    });
                                  }
                                }}
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', width: 'auto', borderRadius: '8px', fontSize: '0.8rem' }}
                              >
                                {hit.source === 'CLUB' ? 'Negociar' : formatCurrency(player.value)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })() : marketViewMode === 'FREE_AGENTS' ? (
              <>
                {/* BUY LIST */}
                <div className="card-title"><TrendingUp size={18} color="var(--accent-green)" /> Comprar Jogadores (Transferências)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {marketPlayers
                    .filter(p => {
                      return marketPosFilter === 'ALL' || p.position === marketPosFilter;
                    })
                    .sort(byPosition)
                    .map(player => (
                      <div key={player.id} className="player-row">
                        <span className={`pos-badge ${player.position}`}>{player.position}</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{player.age} anos • Salário: {formatCurrency(player.salary)}/sem</span>
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
            ) : marketViewMode === 'CLUBS' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={marketSelectLabelStyle}>Série</label>
                    <select
                      value={selectedSearchDiv}
                      onChange={(e) => {
                        const div = e.target.value as typeof selectedSearchDiv;
                        if (div === 'A' && !isPremium) { setPremiumPaywallReason('Série A'); return; }
                        setSelectedSearchDiv(div);
                      }}
                      style={marketSelectStyle}
                    >
                      {(['A', 'B', 'C'] as const).map(div => (
                        <option key={div} value={div}>{div === 'A' && !isPremium ? '🔒 Série A (Premium)' : `Série ${div}`}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={marketSelectLabelStyle}>Clube</label>
                    <select
                      value={selectedSearchClubId}
                      onChange={(e) => setSelectedSearchClubId(e.target.value)}
                      style={marketSelectStyle}
                    >
                      <option value="" disabled>Escolha um clube...</option>
                      <option value="ALL">Todos os Clubes</option>
                      {clubs
                        .filter(c => c.division === selectedSearchDiv && c.id !== userClubId)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </div>
                </div>

                {(() => {
                  if (selectedSearchClubId === 'ALL') {
                    const allPlayers = clubs
                      .filter(c => c.division === selectedSearchDiv && c.id !== userClubId)
                      .flatMap(c => c.squad.map(player => ({ player, club: c })))
                      .filter(({ player }) => marketPosFilter === 'ALL' || player.position === marketPosFilter)
                      .sort((a, b) => b.player.rating - a.player.rating);

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                        <div className="card-title">Todos os Clubes da Série {selectedSearchDiv}</div>
                        {allPlayers.map(({ player, club }) => (
                          <div key={player.id} className="player-row">
                            <span className={`pos-badge ${player.position}`}>{player.position}</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{club.name} • {player.age} anos • Valor: {formatCurrency(player.value)}</span>
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
                                    setNegotiatingClubId(club.id);
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
                        {allPlayers.length === 0 && (
                          <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>Nenhum jogador encontrado com a posição filtrada.</p>
                        )}
                      </div>
                    );
                  }

                  const searchedClub = clubs.find(c => c.id === selectedSearchClubId);
                  if (!searchedClub) return <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}>Selecione um clube para visualizar o elenco.</p>;

                  const filteredSquad = searchedClub.squad
                    .filter(p => marketPosFilter === 'ALL' || p.position === marketPosFilter)
                    .sort(byPosition);

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                      <div className="card-title">Elenco do {searchedClub.name}</div>
                      {filteredSquad.map(player => (
                        <div key={player.id} className="player-row">
                          <span className={`pos-badge ${player.position}`}>{player.position}</span>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{player.age} anos • Valor: {formatCurrency(player.value)}</span>
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
            ) : (() => {
              return (
              <>
                {/* INTERNATIONAL MARKET -- Premier League, Serie A, Bundesliga, La Liga, Ligue 1,
                    Saudi Pro League, Primeira Liga, Eredivisie, Super Lig, Liga Russa, Liga Belga,
                    MLS, and every South American country's own league (Argentina, Bolívia, Chile,
                    Colômbia, Equador, Paraguai, Peru, Uruguai, Venezuela). foreignPlayerPool
                    already tags each player with their real originClub/league, including the
                    South American ones whose originClub is a real, currently-competing
                    Libertadores club (see the purchase handler below, which checks
                    libertadoresClubs directly to route those purchases correctly). Foreign
                    signings cost far more than domestic ones (same rating->value curve as
                    everyone else, just with ratings that go well past the domestic ~84 ceiling),
                    so this is really only realistic for a well-established, wealthy club. */}
                <div className="card-title"><TrendingUp size={18} color="var(--accent-green)" /> Mercado Internacional</div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '-8px 0 12px' }}>
                  Jogadores de ligas estrangeiras (Premier League, Serie A, Bundesliga, La Liga, Ligue 1, Liga Saudita, Primeira Liga, Eredivisie, Super Lig, Liga Russa, Liga Belga, MLS, e as ligas nacionais da América do Sul). Custam bem mais caro que o mercado nacional.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                  <label style={marketSelectLabelStyle}>Modo de Busca</label>
                  <select
                    value={foreignBrowseMode}
                    onChange={(e) => setForeignBrowseMode(e.target.value as typeof foreignBrowseMode)}
                    style={marketSelectStyle}
                  >
                    <option value="SAMPLE">Sorteio do Dia</option>
                    <option value="BY_CLUB">Por Clube</option>
                  </select>
                </div>

                {foreignBrowseMode === 'BY_CLUB' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={marketSelectLabelStyle}>Liga</label>
                      <select
                        value={selectedForeignLeague}
                        onChange={(e) => { setSelectedForeignLeague(e.target.value as typeof selectedForeignLeague); setSelectedForeignClub(''); }}
                        style={marketSelectStyle}
                      >
                        {FOREIGN_LEAGUES.map(lg => (
                          <option key={lg} value={lg}>{lg}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={marketSelectLabelStyle}>Clube</label>
                      <select
                        value={selectedForeignClub}
                        onChange={(e) => setSelectedForeignClub(e.target.value)}
                        style={marketSelectStyle}
                      >
                        <option value="" disabled>Escolha um clube...</option>
                        {[...new Set(foreignPlayerPool.filter(p => p.league === selectedForeignLeague).map(p => p.originClub))]
                          .sort((a, b) => a.localeCompare(b))
                          .map(clubName => (
                            <option key={clubName} value={clubName}>{clubName}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {foreignBrowseMode === 'SAMPLE' && foreignMarketPlayers.length === 0 && (
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>Carregando mercado internacional...</p>
                  )}
                  {foreignBrowseMode === 'BY_CLUB' && !selectedForeignClub && (
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>Selecione um clube para visualizar o elenco.</p>
                  )}
                  {(foreignBrowseMode === 'SAMPLE'
                    ? foreignMarketPlayers
                    : foreignPlayerPool.filter(p => p.originClub === selectedForeignClub && !boughtForeignIds.includes(p.id))
                  )
                    .filter(p => marketPosFilter === 'ALL' || p.position === marketPosFilter)
                    .sort(byPosition)
                    .map(player => (
                      <div key={player.id} className="player-row">
                        <span className={`pos-badge ${player.position}`}>{player.position}</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{player.isStar ? '⭐ ' : ''}{player.name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{player.age} anos • {player.nationality} • {player.originClub} ({player.league})</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="rating-badge">{player.rating}</span>
                          <button
                            onClick={() => {
                              setPurchaseConfirmData({
                                player,
                                clubName: `${player.originClub} (${player.league})`,
                                price: player.value,
                                onConfirm: () => {
                                  // A player whose originClub is a real, currently-competing
                                  // Libertadores club must come out of that club's actual squad
                                  // (buyLibertadoresPlayer) rather than just being marked "bought"
                                  // from a static flavor-only pool (buyForeignPlayer) -- checking
                                  // libertadoresClubs directly (instead of a league name) means
                                  // this keeps working no matter what each country's league is
                                  // called.
                                  const sourceClub = libertadoresClubs.find(c => c.name === player.originClub);
                                  if (sourceClub) {
                                    buyLibertadoresPlayer(player, sourceClub.id);
                                  } else {
                                    buyForeignPlayer(player);
                                  }
                                }
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
              );
            })()}

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
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#9ca3af' }}>Público Estimado (Bilheteria):</span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                    ~{formatCurrency(Math.round(userClub.stadiumCapacity * 0.7 * userClub.ticketPrice))}
                  </span>
                </div>
                {(() => {
                  const starCount = userClub.squad.filter(p => p.isStar).length;
                  const merchBase = userClub.reputation * 60;
                  const confidenceFactor = 0.6 + (userClub.confidence / 100) * 0.6;
                  const starMultiplier = 1 + Math.min(starCount, 5) * 0.08;
                  const merchIncome = Math.round(merchBase * confidenceFactor * starMultiplier);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#9ca3af' }}>Vendas de Camisas/Merchandising:</span>
                      <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                        +{formatCurrency(merchIncome)}
                      </span>
                    </div>
                  );
                })()}
                {userClub.hasVipBoxes && (() => {
                  const vipIncome = estimateVipIncome(userClub);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#9ca3af' }}>Camarotes VIP:</span>
                      <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                        +{formatCurrency(vipIncome)}
                      </span>
                    </div>
                  );
                })()}
                {(userClub.loans ?? []).length > 0 && (() => {
                  const loanInstallments = (userClub.loans ?? []).reduce((sum, l) => sum + l.installment, 0);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                      <span style={{ color: '#9ca3af' }}>Parcelas de Empréstimos:</span>
                      <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>
                        -{formatCurrency(Math.round(loanInstallments))}
                      </span>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Saldo Semanal (Projetado):</span>
                  {(() => {
                    const starCount = userClub.squad.filter(p => p.isStar).length;
                    const merchBase = userClub.reputation * 60;
                    const confidenceFactor = 0.6 + (userClub.confidence / 100) * 0.6;
                    const starMultiplier = 1 + Math.min(starCount, 5) * 0.08;
                    const merchIncome = Math.round(merchBase * confidenceFactor * starMultiplier);
                    const vipIncome = userClub.hasVipBoxes ? estimateVipIncome(userClub) : 0;
                    const loanInstallments = (userClub.loans ?? []).reduce((sum, l) => sum + l.installment, 0);
                    const balance = Object.values(activeSponsors).reduce((sum, sp) => sum + (sp?.weeklyPayment || 0), 0) +
                                    Math.round(userClub.stadiumCapacity * 0.7 * userClub.ticketPrice) +
                                    merchIncome + vipIncome -
                                    userClub.squad.reduce((sum, p) => sum + p.salary, 0) -
                                    loanInstallments;
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

            {/* VIP Boxes */}
            <div className="card">
              <div className="card-title"><DollarSign size={18} color="var(--accent-gold)" /> Camarotes VIP</div>
              {(() => {
                const seatCost = VIP_SEAT_COST_BY_DIV[userClub.division] ?? 5000;
                const cost = seatCost * VIP_BOX_BASE_CAPACITY;
                const basePrice = VIP_BASE_PRICE_BY_DIV[userClub.division] ?? 200;
                const income = estimateVipIncome(userClub);
                const capacity = userClub.vipBoxCapacity ?? VIP_BOX_BASE_CAPACITY;

                if (userClub.hasVipBoxes) {
                  const expansionOptions = [100, 200].filter(add => capacity + add <= VIP_BOX_MAX_CAPACITY);
                  return (
                    <>
                      <div style={{ fontSize: '0.8rem', color: 'var(--accent-green)', marginBottom: '10px' }}>
                        ✅ Camarotes VIP concluídos! Gerando +{formatCurrency(income)} projetados a cada jogo em casa.
                      </div>
                      <div className="stat-box" style={{ marginBottom: '8px' }}>
                        <span className="stat-label">Capacidade do Camarote</span>
                        <span className="stat-value">{capacity.toLocaleString()} lugares</span>
                      </div>
                      <div className="stat-box" style={{ marginBottom: '8px' }}>
                        <span className="stat-label">Preço do Camarote</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <button
                            onClick={() => updateVipPrice(-basePrice * 0.1)}
                            style={{ background: 'rgba(255,23,68,0.15)', border: '1px solid rgba(255,23,68,0.3)', color: 'var(--accent-red)', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >-</button>
                          <span className="stat-value" style={{ minWidth: '70px', textAlign: 'center' }}>{formatCurrency(userClub.vipTicketPrice ?? basePrice)}</span>
                          <button
                            onClick={() => updateVipPrice(basePrice * 0.1)}
                            style={{ background: 'rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.3)', color: 'var(--accent-green)', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >+</button>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '12px' }}>
                        💡 Preço alto demais afasta a clientela VIP e a ocupação cai -- assim como o ingresso comum.
                      </div>

                      {vipBoxUpgrade ? (
                        <div style={{ padding: '12px', background: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
                          🚧 Ampliação em andamento: +{vipBoxUpgrade.capacityAdded.toLocaleString()} lugares ({vipBoxUpgrade.weeksLeft} rodadas restantes).
                        </div>
                      ) : capacity >= VIP_BOX_MAX_CAPACITY ? (
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                          🏆 Capacidade máxima do camarote atingida ({VIP_BOX_MAX_CAPACITY.toLocaleString()} lugares).
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {expansionOptions.map(add => (
                            <button
                              key={add}
                              onClick={() => upgradeVipBoxes(add)}
                              className="btn btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '10px' }}
                            >
                              Ampliar +{add} (Custo: {formatCurrency(add * seatCost)})
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                }
                if (userClub.vipBoxesWeeksLeft && userClub.vipBoxesWeeksLeft > 0) {
                  return (
                    <div style={{ padding: '12px', background: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
                      🚧 Obras em andamento: {userClub.vipBoxesWeeksLeft} rodadas restantes.
                    </div>
                  );
                }
                return (
                  <>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '10px' }}>
                      Construa camarotes VIP (começando com {VIP_BOX_BASE_CAPACITY} lugares, ampliáveis depois até {VIP_BOX_MAX_CAPACITY.toLocaleString()}) para gerar até +{formatCurrency(income)} extras a cada jogo em casa, dependendo do preço cobrado. O custo por assento do camarote é sempre maior que o do estádio comum, por ser uma estrutura premium.
                    </div>
                    <button
                      onClick={() => buildVipBoxes()}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '10px', width: '100%' }}
                    >
                      Construir Camarotes VIP (Custo: {formatCurrency(cost)})
                    </button>
                  </>
                );
              })()}
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
                            <span style={{ color: '#9ca3af' }}>+{formatCurrency(active.weeklyPayment * 38)}/anual</span>
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
                            <span style={{ color: '#9ca3af' }}>Luvas: {formatCurrency(offer.signingBonus)} • {formatCurrency(offer.weeklyPayment * 38)}/anual</span>
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

            {/* Departamento Médico */}
            <div className="card">
              <div className="card-title"><Shield size={18} color="var(--accent-green)" /> Departamento Médico</div>
              {(() => {
                const level = userClub.medicalDeptLevel ?? 0;
                const reduction = MEDICAL_DEPT_REDUCTION_BY_LEVEL[level] ?? 0;
                const nextLevel = level + 1;
                const nextCost = MEDICAL_DEPT_COST_BY_LEVEL_DIV[nextLevel]?.[userClub.division] ?? 0;

                return (
                  <>
                    <div className="stat-box" style={{ marginBottom: '10px' }}>
                      <span className="stat-label">Nível Atual</span>
                      <span className="stat-value">{MEDICAL_DEPT_LEVEL_NAMES[level]}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '12px' }}>
                      {level > 0
                        ? `Lesões dos seus jogadores duram ${Math.round(reduction * 100)}% menos tempo.`
                        : 'Sem departamento médico ainda -- lesões seguem a duração padrão.'}
                    </div>

                    {medicalDeptUpgrade ? (
                      <div style={{ padding: '12px', background: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
                        🚧 Obras em andamento: Nível {MEDICAL_DEPT_LEVEL_NAMES[medicalDeptUpgrade.level]} ({medicalDeptUpgrade.weeksLeft} rodadas restantes).
                      </div>
                    ) : level >= 3 ? (
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                        🏆 Departamento médico no nível máximo.
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (!isPremium) { setPremiumPaywallReason('Departamento Médico'); return; }
                          upgradeMedicalDept();
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        {!isPremium && <Lock size={14} />} Avançar para Nível {MEDICAL_DEPT_LEVEL_NAMES[nextLevel]} (Custo: {formatCurrency(nextCost)})
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Categoria de Base */}
            <div className="card">
              <div className="card-title"><Users size={18} color="var(--accent-green)" /> Categoria de Base</div>
              {(() => {
                const level = userClub.youthAcademyLevel ?? 0;
                const interval = YOUTH_ACADEMY_INTERVAL_BY_LEVEL[level];
                const nextLevel = level + 1;
                const nextCost = MEDICAL_DEPT_COST_BY_LEVEL_DIV[nextLevel]?.[userClub.division] ?? 0;

                return (
                  <>
                    <div className="stat-box" style={{ marginBottom: '10px' }}>
                      <span className="stat-label">Nível Atual</span>
                      <span className="stat-value">{MEDICAL_DEPT_LEVEL_NAMES[level]}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '12px' }}>
                      {level > 0
                        ? `Revela um novo talento da base a cada ${interval} rodadas.`
                        : 'Sem categoria de base ainda -- construa para gerar seus próprios talentos.'}
                    </div>

                    {youthAcademyUpgrade ? (
                      <div style={{ padding: '12px', background: 'rgba(255, 193, 7, 0.05)', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
                        🚧 Obras em andamento: Nível {MEDICAL_DEPT_LEVEL_NAMES[youthAcademyUpgrade.level]} ({youthAcademyUpgrade.weeksLeft} rodadas restantes).
                      </div>
                    ) : level >= 3 ? (
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                        🏆 Categoria de base no nível máximo.
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (!isPremium) { setPremiumPaywallReason('Categoria de Base'); return; }
                          upgradeYouthAcademy();
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        {!isPremium && <Lock size={14} />} Avançar para Nível {MEDICAL_DEPT_LEVEL_NAMES[nextLevel]} (Custo: {formatCurrency(nextCost)})
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Bank Loans */}
            <div className="card">
              <div className="card-title"><DollarSign size={18} color="var(--accent-gold)" /> Banco Nacional — Empréstimos</div>
              {(() => {
                const score = userClub.financialScore ?? 70;
                const scoreLabel = getScoreLabel(score);
                const bankEvent = getBankEventForYear(currentYear);
                const baseRate = getBaseInterestRate(score);
                const outstandingDebt = (userClub.loans ?? []).reduce((s, l) => s + l.balance, 0);
                const availableCredit = getAvailableCredit(score, userClub.lastSeasonRevenue ?? 1000000, outstandingDebt);

                const amount = LOAN_AMOUNTS[loanAmountIdx];
                const term = LOAN_TERMS[loanTermIdx];
                const specialDiscount = bankEvent.specialLine && score >= 90 ? 0.002 : 0;
                const ratePerRound = Math.max(0.002, baseRate + bankEvent.rateModifier - specialDiscount);
                const installment = calculateInstallment(amount, ratePerRound, term);
                const totalPaid = installment * term;

                const scoreColor = score >= 80 ? 'var(--accent-green)' : score >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)';

                return (
                  <>
                    <div className="stat-grid" style={{ marginBottom: '12px' }}>
                      <div className="stat-box">
                        <span className="stat-label">Score Financeiro</span>
                        <span className="stat-value" style={{ color: scoreColor }}>{score} ({scoreLabel})</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">Limite Disponível</span>
                        <span className="stat-value">{formatCurrency(Math.round(availableCredit))}</span>
                      </div>
                    </div>

                    {bankEvent.label && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent-gold)', marginBottom: '10px', padding: '6px 10px', background: 'rgba(255,193,7,0.06)', borderRadius: '8px', border: '1px solid rgba(255,193,7,0.15)' }}>
                        📰 {bankEvent.label}
                      </div>
                    )}

                    {(() => {
                      const wasBlockedBefore = (userClub.lateStrikes ?? 0) >= 3;
                      return wasBlockedBefore ? (
                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-red)', marginBottom: '10px', padding: '8px 10px', background: 'rgba(255,23,68,0.06)', borderRadius: '8px', border: '1px solid rgba(255,23,68,0.15)' }}>
                          ⚠️ Histórico de atrasos recorrentes -- o banco ainda empresta, mas a taxas bem mais altas.
                        </div>
                      ) : null;
                    })()}
                    {(userClub.loans ?? []).length > 0 ? (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        💰 Você já tem um empréstimo em aberto. Quite-o (veja abaixo) antes de solicitar um novo.
                      </div>
                    ) : (
                    <>
                        <div style={{ marginBottom: '10px' }}>
                          <span className="stat-label">Valor Solicitado</span>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {LOAN_AMOUNTS.map((amt, idx) => {
                              const overLimit = amt > availableCredit;
                              return (
                                <button
                                  key={amt}
                                  onClick={() => setLoanAmountIdx(idx)}
                                  disabled={overLimit}
                                  className={`sub-tab-btn ${loanAmountIdx === idx && !overLimit ? 'active' : ''}`}
                                  style={{
                                    opacity: overLimit ? 0.35 : 1,
                                    fontSize: '0.7rem',
                                    padding: '6px 8px',
                                    textDecoration: overLimit ? 'line-through' : 'none'
                                  }}
                                  title={overLimit ? 'Acima do limite disponível' : undefined}
                                >
                                  {formatCurrency(amt)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div style={{ marginBottom: '10px' }}>
                          <span className="stat-label">Prazo</span>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {LOAN_TERMS.map((t, idx) => (
                              <button
                                key={t}
                                onClick={() => setLoanTermIdx(idx)}
                                className={`sub-tab-btn ${loanTermIdx === idx ? 'active' : ''}`}
                                style={{ fontSize: '0.7rem', padding: '6px 8px' }}
                              >
                                {t} rodadas
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: '10px' }}>
                          <span className="stat-label">Finalidade</span>
                          <select
                            value={loanPurposeIdx}
                            onChange={e => setLoanPurposeIdx(Number(e.target.value))}
                            style={{ width: '100%', marginTop: '6px', padding: '8px', borderRadius: '8px', background: '#121316', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: '0.78rem' }}
                          >
                            {LOAN_PURPOSES.map((p, idx) => <option key={p} value={idx}>{p}</option>)}
                          </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', marginBottom: '12px', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Taxa:</span><span>{(ratePerRound * 100).toFixed(2)}% por rodada</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Parcela:</span><span>{formatCurrency(Math.round(installment))}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Total pago:</span><span>{formatCurrency(Math.round(totalPaid))}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Juros totais:</span><span>{formatCurrency(Math.round(totalPaid - amount))}</span></div>
                        </div>

                        <button
                          onClick={() => requestLoan(amount, term, LOAN_PURPOSES[loanPurposeIdx])}
                          disabled={amount > availableCredit}
                          className="btn btn-secondary"
                          style={{ width: '100%', fontSize: '0.8rem', padding: '10px', opacity: amount > availableCredit ? 0.4 : 1 }}
                        >
                          💰 Solicitar Empréstimo
                        </button>
                      </>
                    )}

                    {(userClub.loans ?? []).length > 0 && (
                      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span className="stat-label">Empréstimos Ativos</span>
                        {(userClub.loans ?? []).map(loan => {
                          const payoff = calculatePayoffAmount(loan);
                          return (
                            <div key={loan.id} style={{ padding: '10px', background: '#121316', borderRadius: '10px', border: loan.lateStreak > 0 ? '1px solid rgba(255,23,68,0.3)' : '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '4px' }}>
                                <span>{loan.purpose}</span>
                                <span>{formatCurrency(loan.balance)}</span>
                              </div>
                              <div style={{ color: '#9ca3af', marginBottom: '6px' }}>
                                Parcela: {formatCurrency(Math.round(loan.installment))} • {loan.roundsPaid}/{loan.totalRounds} pagas
                                {loan.lateStreak > 0 && <span style={{ color: 'var(--accent-red)' }}> • {loan.lateStreak} atrasada(s)</span>}
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => payOffLoanEarly(loan.id)}
                                  className="btn btn-secondary"
                                  style={{ flex: 1, fontSize: '0.68rem', padding: '6px' }}
                                >
                                  Quitar ({formatCurrency(payoff)})
                                </button>
                                {loan.lateStreak >= 2 && (
                                  <button
                                    onClick={() => renegotiateLoanAction(loan.id)}
                                    className="btn btn-secondary"
                                    style={{ flex: 1, fontSize: '0.68rem', padding: '6px', color: 'var(--accent-gold)' }}
                                  >
                                    Renegociar
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

          </>
        )}

        {/* --- TAB 4: CLASSIFICAÇÃO & HISTÓRICO --- */}
        {activeTab === 4 && (
          <>
            {/* View selectors */}
            <div style={{ display: 'flex', gap: '4px', padding: '0 0 12px 0' }}>
              <button
                onClick={() => setStatsView('TABLE')}
                className={`sub-tab-btn ${statsView === 'TABLE' ? 'active' : ''}`}
                style={{ flex: 1, padding: '6px 4px', fontSize: '0.68rem' }}
              >
                Tabela
              </button>
              <button
                onClick={() => setStatsView('STATS')}
                className={`sub-tab-btn ${statsView === 'STATS' ? 'active' : ''}`}
                style={{ flex: 1, padding: '6px 4px', fontSize: '0.68rem' }}
              >
                Artilharia
              </button>
              <button
                onClick={() => setStatsView('GAMES')}
                className={`sub-tab-btn ${statsView === 'GAMES' ? 'active' : ''}`}
                style={{ flex: 1, padding: '6px 4px', fontSize: '0.68rem' }}
              >
                Histórico
              </button>
              <button
                onClick={() => setStatsView('HISTORY')}
                className={`sub-tab-btn ${statsView === 'HISTORY' ? 'active' : ''}`}
                style={{ flex: 1, padding: '6px 4px', fontSize: '0.68rem' }}
              >
                Carreira
              </button>
              <button
                onClick={() => setStatsView('ACHIEVEMENTS')}
                className={`sub-tab-btn ${statsView === 'ACHIEVEMENTS' ? 'active' : ''}`}
                style={{ flex: 1, padding: '6px 4px', fontSize: '0.68rem' }}
              >
                Conquistas
              </button>
            </div>

            {statsView === 'ACHIEVEMENTS' && (
              <div className="card">
                <div className="card-title">🏅 Conquistas</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '0.75rem', color: '#9ca3af' }}>
                  <span>Vitórias: <strong style={{ color: 'white' }}>{careerStats.totalWins}</strong></span>
                  <span>Sequência invicta: <strong style={{ color: 'white' }}>{careerStats.longestUnbeatenStreak}</strong></span>
                  <span>Títulos: <strong style={{ color: 'white' }}>{careerStats.titlesWon}</strong></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {ACHIEVEMENTS.map(ach => {
                    const unlocked = ach.check(careerStats);
                    return (
                      <div
                        key={ach.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
                          borderRadius: '12px',
                          background: unlocked ? 'rgba(0,230,118,0.06)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${unlocked ? 'rgba(0,230,118,0.25)' : 'rgba(255,255,255,0.05)'}`,
                          opacity: unlocked ? 1 : 0.5
                        }}
                      >
                        <span style={{ fontSize: '1.6rem' }}>{unlocked ? ach.icon : '🔒'}</span>
                        <div>
                          <strong style={{ fontSize: '0.85rem', color: unlocked ? 'var(--accent-green)' : 'white' }}>{ach.title}</strong>
                          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>{ach.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {statsView === 'TABLE' && (
              <>
                {/* Competition selector -- only shown once the Libertadores is actually running
                    this season, so the toggle doesn't appear before it exists or linger visible
                    with nothing behind it. */}
                {libertadoresState && (
                  <div className="sub-tabs" style={{ padding: '0 0 8px 0' }}>
                    <button
                      onClick={() => setStandingsCompetition('NACIONAL')}
                      className={`sub-tab-btn ${standingsCompetition === 'NACIONAL' ? 'active' : ''}`}
                      style={{ flex: 1 }}
                    >
                      Nacional
                    </button>
                    <button
                      onClick={() => setStandingsCompetition('LIBERTADORES')}
                      className={`sub-tab-btn ${standingsCompetition === 'LIBERTADORES' ? 'active' : ''}`}
                      style={{ flex: 1 }}
                    >
                      🌎 Libertadores
                    </button>
                  </div>
                )}

                {standingsCompetition === 'LIBERTADORES' && libertadoresState ? (
                  <>
                    {/* Group selectors -- 8 groups (A-H), wraps onto a second line on narrow screens */}
                    <div className="sub-tabs" style={{ padding: '0 0 12px 0', flexWrap: 'wrap' }}>
                      {LIBERTADORES_GROUP_LABELS.map(g => (
                        <button
                          key={g}
                          onClick={() => setLibertadoresStandingsGroup(g)}
                          className={`sub-tab-btn ${libertadoresStandingsGroup === g ? 'active' : ''}`}
                          style={{ flex: '1 0 22%' }}
                        >
                          Grupo {g}
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

                      {libertadoresGroupStandings.map((entry, idx) => {
                        const isUser = entry.clubId === userClubId;
                        // Top 2 of every group advance to the round of 16.
                        const highlightClass = idx < 2 ? 'pos-green-highlight' : '';

                        return (
                          <div
                            key={entry.clubId}
                            className={`table-row ${highlightClass} ${isUser ? 'user-team-row' : ''}`}
                          >
                            <span style={{ fontWeight: 800 }}>{idx + 1}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="club-badge-mini" style={{ backgroundColor: findClubColor(entry.clubId) }} />
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{findClubName(entry.clubId)}</span>
                              {isUser && <span style={{ fontSize: '0.65rem', background: 'var(--accent-gold)', color: 'black', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, flexShrink: 0 }}>VOCÊ</span>}
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
                ) : (
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
                            className={`table-row ${highlightClass} ${isUser ? 'user-team-row' : ''}`}
                          >
                            <span style={{ fontWeight: 800 }}>{idx + 1}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="club-badge-mini" style={{ backgroundColor: clubs.find(c=>c.id===entry.clubId)?.primaryColor }} />
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.clubName}</span>
                              {isUser && <span style={{ fontSize: '0.65rem', background: 'var(--accent-gold)', color: 'black', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, flexShrink: 0 }}>VOCÊ</span>}
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
                      topScorers.map(({ player, club }, idx) => {
                        const isOwnPlayer = club.id === userClubId;
                        const unavailable = isOwnPlayer || player.contractLocked;
                        return (
                          <div
                            key={player.id}
                            onClick={() => {
                              if (isOwnPlayer) return;
                              if (player.contractLocked) {
                                alert(`${player.name} está com o contrato trancado e não pode ser negociado agora.`);
                                return;
                              }
                              setNegotiatingPlayer(player);
                              setNegotiatingClubId(club.id);
                              setOfferAmount(player.value);
                              setNegotiationStage('OFFER');
                              setNegotiationResult(null);
                            }}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#121316', borderRadius: '12px', cursor: unavailable ? 'default' : 'pointer' }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{idx + 1}. {player.name}</span>
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                                {club.name} (Série {club.division})
                                {isOwnPlayer ? ' • Seu jogador' : player.contractLocked ? ' • 🔒 Indisponível' : ` • ${formatCurrency(player.value)}`}
                              </span>
                            </div>
                            <span style={{ fontWeight: 800, color: 'var(--accent-green)', display: 'flex', alignItems: 'center' }}>⚽ {player.goals}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}

            {statsView === 'GAMES' && (
              <div className="card">
                <div className="card-title"><Trophy size={18} color="var(--accent-gold)" /> Histórico - Temporada {currentYear}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(() => {
                    const myGames = schedule
                      .filter(m => m.simulated && m.result && (m.homeId === userClubId || m.awayId === userClubId))
                      .sort((a, b) => a.round - b.round);
                    if (myGames.length === 0) {
                      return <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>Nenhuma partida disputada ainda nesta temporada.</p>;
                    }
                    return myGames.map(m => {
                      const isHome = m.homeId === userClubId;
                      const oppId = isHome ? m.awayId : m.homeId;
                      const opponent = clubs.find(c => c.id === oppId);
                      const myScore = isHome ? m.result!.homeScore : m.result!.awayScore;
                      const oppScore = isHome ? m.result!.awayScore : m.result!.homeScore;
                      const outcome = myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E';
                      const outcomeColor = outcome === 'V' ? 'var(--accent-green)' : outcome === 'D' ? 'var(--accent-red)' : 'var(--accent-gold)';
                      return (
                        <div
                          key={`${m.round}-${m.homeId}-${m.awayId}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#121316', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}
                        >
                          <span style={{ width: '28px', color: '#9ca3af', fontWeight: 700 }}>{m.round}ª</span>
                          <span style={{
                            width: '22px', height: '22px', borderRadius: '6px', background: outcomeColor, color: 'black',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.7rem', flexShrink: 0
                          }}>{outcome}</span>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {isHome ? 'vs' : '@'} {opponent?.name ?? '???'}
                          </span>
                          <span style={{ fontWeight: 800 }}>{myScore} - {oppScore}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {statsView === 'GAMES' && cupState && (
              <div className="card" style={{ marginTop: '10px' }}>
                <div className="card-title">🏆 Copa do Brasil - {cupState.year}</div>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '10px' }}>
                  {cupState.championId
                    ? (cupState.championId === userClubId ? '🏆 Seu time é o CAMPEÃO da Copa!' : `Campeão: ${clubs.find(c => c.id === cupState.championId)?.name ?? '???'}`)
                    : cupState.aliveClubIds.includes(userClubId) || cupState.fase1ByeClubIds.includes(userClubId) || cupState.oitavasSeeds.includes(userClubId) || cupState.userTie
                    ? `Seu time segue vivo na competição -- fase atual: ${CUP_PHASE_LABEL[PHASES[Math.min(cupState.phaseIndex, PHASES.length - 1)]]}.`
                    : 'Seu time foi eliminado da Copa nesta temporada.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(() => {
                    const myTies = cupState.history.filter(t => t.homeId === userClubId || t.awayId === userClubId);
                    if (myTies.length === 0) {
                      return <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>Nenhum confronto de Copa disputado ainda.</p>;
                    }
                    return myTies.map(t => {
                      const won = t.winnerId === userClubId;
                      const opponentId = t.homeId === userClubId ? t.awayId : t.homeId;
                      const opponent = clubs.find(c => c.id === opponentId);
                      const myAgg = t.homeId === userClubId ? t.aggregateHomeGoals : t.aggregateAwayGoals;
                      const oppAgg = t.homeId === userClubId ? t.aggregateAwayGoals : t.aggregateHomeGoals;
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#121316', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                          <span style={{ width: '70px', color: '#9ca3af', fontWeight: 700, fontSize: '0.68rem' }}>{CUP_PHASE_LABEL[t.phase]}</span>
                          <span style={{
                            width: '22px', height: '22px', borderRadius: '6px', background: won ? 'var(--accent-green)' : 'var(--accent-red)', color: 'black',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.7rem', flexShrink: 0
                          }}>{won ? 'V' : 'D'}</span>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            vs {opponent?.name ?? '???'}
                          </span>
                          <span style={{ fontWeight: 800 }}>{myAgg} - {oppAgg}{t.wentToPenalties ? ' (pên.)' : ''}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {statsView === 'GAMES' && libertadoresState && (
              <div className="card" style={{ marginTop: '10px' }}>
                <div className="card-title">🌎 Copa Libertadores - {libertadoresState.year}</div>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '10px' }}>
                  {libertadoresState.championId
                    ? (libertadoresState.championId === userClubId ? '🏆 Seu time é o CAMPEÃO da Libertadores!' : `Campeão: ${clubs.find(c => c.id === libertadoresState.championId)?.name ?? libertadoresClubs.find(c => c.id === libertadoresState.championId)?.name ?? '???'}`)
                    : !libertadoresState.participantIds.includes(userClubId)
                    ? 'Seu time não se classificou para a Libertadores nesta temporada.'
                    : libertadoresState.phase === 'GROUPS'
                    ? `Seu time disputa a Fase de Grupos (rodada ${libertadoresState.groupRoundsPlayed} de ${LIBERTADORES_GROUP_ROUNDS}).`
                    : libertadoresState.userTie || libertadoresState.pendingSecondLeg || libertadoresState.bracketOrder.includes(userClubId)
                    ? `Seu time segue vivo na competição -- fase atual: ${LIBERTADORES_PHASE_LABEL[libertadoresState.phase]}.`
                    : 'Seu time foi eliminado da Libertadores nesta temporada.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(() => {
                    const myGroupMatches = libertadoresState.schedule.filter(m => m.simulated && (m.homeId === userClubId || m.awayId === userClubId));
                    const myTies = libertadoresState.history.filter(t => t.homeId === userClubId || t.awayId === userClubId);
                    if (myGroupMatches.length === 0 && myTies.length === 0) {
                      return <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>Nenhum confronto de Libertadores disputado ainda.</p>;
                    }
                    return (
                      <>
                        {myGroupMatches.map(m => {
                          const isHome = m.homeId === userClubId;
                          const oppId = isHome ? m.awayId : m.homeId;
                          const opponent = clubs.find(c => c.id === oppId) ?? libertadoresClubs.find(c => c.id === oppId);
                          const myScore = isHome ? m.result!.homeScore : m.result!.awayScore;
                          const oppScore = isHome ? m.result!.awayScore : m.result!.homeScore;
                          const outcome = myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E';
                          const outcomeColor = outcome === 'V' ? 'var(--accent-green)' : outcome === 'D' ? 'var(--accent-red)' : 'var(--accent-gold)';
                          return (
                            <div key={`${m.group}-${m.round}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#121316', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                              <span style={{ width: '70px', color: '#9ca3af', fontWeight: 700, fontSize: '0.68rem' }}>Grupo {m.group}</span>
                              <span style={{
                                width: '22px', height: '22px', borderRadius: '6px', background: outcomeColor, color: 'black',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.7rem', flexShrink: 0
                              }}>{outcome}</span>
                              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {isHome ? 'vs' : '@'} {opponent?.name ?? '???'}
                              </span>
                              <span style={{ fontWeight: 800 }}>{myScore} - {oppScore}</span>
                            </div>
                          );
                        })}
                        {myTies.map(t => {
                          const won = t.winnerId === userClubId;
                          const opponentId = t.homeId === userClubId ? t.awayId : t.homeId;
                          const opponent = clubs.find(c => c.id === opponentId) ?? libertadoresClubs.find(c => c.id === opponentId);
                          const myAgg = t.homeId === userClubId ? t.aggregateHomeGoals : t.aggregateAwayGoals;
                          const oppAgg = t.homeId === userClubId ? t.aggregateAwayGoals : t.aggregateHomeGoals;
                          return (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#121316', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                              <span style={{ width: '70px', color: '#9ca3af', fontWeight: 700, fontSize: '0.68rem' }}>{LIBERTADORES_PHASE_LABEL[t.phase]}</span>
                              <span style={{
                                width: '22px', height: '22px', borderRadius: '6px', background: won ? 'var(--accent-green)' : 'var(--accent-red)', color: 'black',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.7rem', flexShrink: 0
                              }}>{won ? 'V' : 'D'}</span>
                              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                vs {opponent?.name ?? '???'}
                              </span>
                              <span style={{ fontWeight: 800 }}>{myAgg} - {oppAgg}{t.wentToPenalties ? ' (pên.)' : t.wentToExtraTime ? ' (pror.)' : ''}</span>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
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
                          <span>🏆 Campeão Série A: <strong>{hist.champions.A}</strong></span>
                          <span>🏆 Campeão Série B: <strong>{hist.champions.B}</strong></span>
                          <span>🏆 Campeão Série C: <strong>{hist.champions.C}</strong></span>
                          {hist.cupChampion && (
                            <span>
                              🏆 Campeão Copa do Brasil: <strong>{hist.cupChampion}</strong>
                              {!!hist.cupEarnings && <span style={{ color: 'var(--accent-green)' }}> ({formatCurrency(hist.cupEarnings)})</span>}
                            </span>
                          )}
                          {hist.libertadoresChampion && (
                            <span>
                              🌎 Campeão Libertadores: <strong>{hist.libertadoresChampion}</strong>
                              {!!hist.libertadoresEarnings && <span style={{ color: 'var(--accent-green)' }}> ({formatCurrency(hist.libertadoresEarnings)})</span>}
                            </span>
                          )}
                          {hist.seasonTopScorerName && (
                            <span>
                              🏅 Craque do Ano: <strong>{hist.seasonTopScorerName}</strong> ({hist.seasonTopScorerGoals} gols)
                            </span>
                          )}
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

      {/* PENALTY SHOOTOUT MODAL -- decides a drawn Copa do Brasil tie. Highest priority of the
          office-screen modals since the cup bracket can't advance until it's resolved. */}
      {penaltyShootout && (() => {
        const lastKick = penaltyShootout.kicks[penaltyShootout.kicks.length - 1];
        return (
          <div className="modal-overlay" style={{ zIndex: 1300 }}>
            <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>⚽</span>
              <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>Disputa de Pênaltis</h3>
              <div style={{ fontSize: '1rem', fontWeight: 800, margin: '8px 0' }}>
                {penaltyShootout.homeClubName} <span style={{ color: 'var(--accent-gold)' }}>{penaltyShootout.homeGoals} - {penaltyShootout.awayGoals}</span> {penaltyShootout.awayClubName}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', margin: '10px 0 16px', flexWrap: 'wrap', maxWidth: '280px' }}>
                {penaltyShootout.kicks.map((k, i) => (
                  <span key={i} title={`${k.playerName} (${k.side === 'home' ? penaltyShootout.homeClubName : penaltyShootout.awayClubName})`} style={{
                    width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 800,
                    background: k.scored ? 'rgba(0,230,118,0.18)' : 'rgba(255,23,68,0.18)',
                    color: k.scored ? 'var(--accent-green)' : 'var(--accent-red)',
                    border: `1px solid ${k.scored ? 'rgba(0,230,118,0.4)' : 'rgba(255,23,68,0.4)'}`
                  }}>
                    {k.scored ? '⚽' : '✕'}
                  </span>
                ))}
              </div>
              {lastKick ? (
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '14px' }}>
                  <strong style={{ color: 'white' }}>{lastKick.playerName}</strong> ({lastKick.side === 'home' ? penaltyShootout.homeClubName : penaltyShootout.awayClubName}){' '}
                  {lastKick.scored ? <span style={{ color: 'var(--accent-green)', fontWeight: 800 }}>⚽ GOL!</span> : <span style={{ color: 'var(--accent-red)', fontWeight: 800 }}>❌ PERDEU!</span>}
                </p>
              ) : (
                <div className="match-time-pill" style={{ fontSize: '0.9rem', padding: '8px 18px', margin: '0 auto 14px' }}>Preparando cobranças...</div>
              )}
              {penaltyShootout.decided && (
                <>
                  <p style={{ fontSize: '0.9rem', fontWeight: 800, color: penaltyShootout.homeGoals > penaltyShootout.awayGoals ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: '14px' }}>
                    {penaltyShootout.homeGoals > penaltyShootout.awayGoals ? penaltyShootout.homeClubName : penaltyShootout.awayClubName} venceu a disputa!
                  </p>
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={finalizePenaltyShootout}>
                    Continuar
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* FIRST-TIME INTERACTIVE TUTORIAL -- a small floating banner (not a blocking modal) that
          points at the exact nav tab the player should tap next (see the tutorial-target/
          tutorial-dimmed classes on the bottom nav below), advancing automatically once they
          actually navigate there (see the useEffect watching activeTab/tutorialStep). */}
      {tutorialStep !== null && gameState !== 'MATCH_DAY' && (() => {
        const step = TUTORIAL_STEPS[tutorialStep];
        const isLastStep = step.nextTabIndex === null;
        return (
          <div style={{ position: 'fixed', left: '12px', right: '12px', bottom: '84px', zIndex: 1500, display: 'flex', justifyContent: 'center' }}>
            <div className="card" style={{ maxWidth: '380px', width: '100%', border: '1px solid var(--accent-gold)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <strong style={{ fontSize: '0.85rem', color: 'var(--accent-gold)' }}>{step.title}</strong>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{tutorialStep + 1}/{TUTORIAL_STEPS.length}</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#d1d5db', margin: '0 0 10px' }}>{step.text}</p>
              {isLastStep ? (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setTutorialStep(null)}>
                  Vamos jogar!
                </button>
              ) : (
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', margin: 0, textAlign: 'center' }}>
                  👇 Toque em "{TUTORIAL_STEPS[step.nextTabIndex!].title}" para continuar
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ENTREVISTA COLETIVA -- shown only before um clássico (liga) ou uma final (Copa do
          Brasil/Libertadores), letting the player pick a tone that nudges the confidence swing
          from the result: Confiante risks bigger ups and downs, Provocador also knocks the
          opponent's confidence regardless of the result, Cauteloso is the safe/neutral baseline. */}
      {pressConferenceContext && gameState !== 'MATCH_DAY' && (() => {
        const chooseTone = (tone: 'CONFIANTE' | 'CAUTELOSO' | 'PROVOCADOR') => {
          const context = pressConferenceContext;
          setPressConferenceContext(null);
          beginMatchKickoff();
          if (context === 'LEAGUE') nextRound(starters, tone);
          else if (context === 'CUP') startCupMatch(starters, tone);
          else if (context === 'LIBERTADORES') startLibertadoresMatch(starters, tone);
        };
        return (
          <div className="modal-overlay" style={{ zIndex: 1400 }}>
            <div className="modal-content" style={{ maxWidth: '360px' }}>
              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '2.2rem' }}>🎤</span>
                <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>Entrevista Coletiva</h3>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
                  Qual vai ser o tom antes do jogo?
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ textAlign: 'left', padding: '12px' }}
                  onClick={() => chooseTone('CONFIANTE')}
                >
                  <strong>😤 Confiante</strong>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '4px 0 0' }}>Promete a vitória. Se ganhar, confiança extra. Se perder, o tombo é maior.</p>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ textAlign: 'left', padding: '12px' }}
                  onClick={() => chooseTone('CAUTELOSO')}
                >
                  <strong>😐 Cauteloso</strong>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '4px 0 0' }}>Não cria expectativa nem arma o adversário. Sem efeito extra.</p>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ textAlign: 'left', padding: '12px' }}
                  onClick={() => chooseTone('PROVOCADOR')}
                >
                  <strong>😏 Provocador</strong>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '4px 0 0' }}>Mexe com a confiança do adversário, ganhe ou perca. Mas se perder, também dói na sua.</p>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CHAMPION CELEBRATION MODAL -- top priority in the modal queue, since it's a one-off
          highlight (Copa do Brasil title, decided mid-season) that shouldn't get buried behind
          any other auto-popup modal. The Série A version of this same modal is rendered inside
          the SEASON_END screen instead, since that's a full-screen state swap, not an overlay
          on the office screen. */}
      {championCelebration && gameState !== 'MATCH_DAY' && !penaltyShootout && (
        <div className="modal-overlay" style={{ zIndex: 1300 }}>
          <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem' }}>🏆</span>
            <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>Parabéns!</h3>
            <p style={{ fontSize: '1rem', margin: '10px 0 20px', color: '#d1d5db' }}>
              Você foi campeão {championCelebration.competition === 'Mundial de Clubes' ? 'do' : 'da'} <strong style={{ color: 'var(--accent-gold)' }}>{championCelebration.competition}</strong> com o <strong>{championCelebration.clubName}</strong>!
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={dismissChampionCelebration}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* COPA DO BRASIL DRAW REVEAL MODAL -- gated the same way as the other office-screen
          modals below, so it can never render over a match that's already in progress. */}
      {cupDrawReveal && gameState !== 'MATCH_DAY' && !penaltyShootout && !championCelebration && (() => {
        const opponentClub = clubs.find(c => c.id === cupDrawReveal.opponentId);
        return (
          <div className="modal-overlay" style={{ zIndex: 1200 }}>
            <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>{cupDrawReveal.phase === 'FINAL' ? '🏆' : '🎱'}</span>
              <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>
                {cupDrawReveal.phase === 'FINAL' ? 'Você chegou à Final!' : 'Sorteio da Copa do Brasil'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '4px 0 16px' }}>
                {cupDrawReveal.phase === 'FINAL' ? 'Seu adversário na decisão é quem venceu a outra semifinal:' : CUP_PHASE_LABEL[cupDrawReveal.phase]}
              </p>
              {drawAnimating ? (
                <div className="match-time-pill" style={{ fontSize: '1rem', padding: '10px 20px', margin: '0 auto' }}>
                  🔀 {drawDisplayName || '...'}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, margin: '10px 0' }}>
                    {cupDrawReveal.isHome ? userClub?.name : opponentClub?.name}
                    <span style={{ color: 'var(--accent-gold)' }}> x </span>
                    {cupDrawReveal.isHome ? opponentClub?.name : userClub?.name}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '0 0 20px' }}>
                    {cupDrawReveal.isHome ? '🏠 Você joga em casa' : '✈️ Você joga fora de casa'}
                  </p>
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={dismissCupDrawReveal}>
                    Continuar
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {libertadoresDrawReveal && gameState !== 'MATCH_DAY' && !penaltyShootout && !cupDrawReveal && !championCelebration && (() => {
        if (libertadoresDrawReveal.kind === 'GROUPS') {
          const opponents = libertadoresDrawReveal.opponentIds.map(id => clubs.find(c => c.id === id) ?? libertadoresClubs.find(c => c.id === id));
          return (
            <div className="modal-overlay" style={{ zIndex: 1200 }}>
              <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
                <span style={{ fontSize: '2.5rem' }}>🌎</span>
                <h3 style={{ fontWeight: 800, marginTop: '8px', color: '#4db8ff' }}>Sorteio da Libertadores</h3>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '4px 0 16px' }}>Grupo {libertadoresDrawReveal.group}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '10px 0 20px' }}>
                  {opponents.map(o => o && (
                    <div key={o.id} style={{ fontSize: '0.95rem', fontWeight: 700, background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '8px' }}>{o.name}</div>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={dismissLibertadoresDrawReveal}>
                  Continuar
                </button>
              </div>
            </div>
          );
        }
        const opponentClub = clubs.find(c => c.id === libertadoresDrawReveal.opponentId) ?? libertadoresClubs.find(c => c.id === libertadoresDrawReveal.opponentId);
        return (
          <div className="modal-overlay" style={{ zIndex: 1200 }}>
            <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>🌎</span>
              <h3 style={{ fontWeight: 800, marginTop: '8px', color: '#4db8ff' }}>Sorteio da Libertadores</h3>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '4px 0 16px' }}>{LIBERTADORES_PHASE_LABEL[libertadoresDrawReveal.phase]}</p>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, margin: '10px 0' }}>
                {libertadoresDrawReveal.isHome ? userClub?.name : opponentClub?.name}
                <span style={{ color: '#4db8ff' }}> x </span>
                {libertadoresDrawReveal.isHome ? opponentClub?.name : userClub?.name}
              </div>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '0 0 20px' }}>
                {libertadoresDrawReveal.isHome ? '🏠 Você manda o jogo de volta em casa' : '✈️ O adversário manda o jogo de volta em casa'}
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={dismissLibertadoresDrawReveal}>
                Continuar
              </button>
            </div>
          </div>
        );
      })()}

      {mundialDrawReveal && gameState !== 'MATCH_DAY' && !penaltyShootout && !cupDrawReveal && !libertadoresDrawReveal && !championCelebration && (() => {
        const opponentClub = mundialClubs.find(c => c.id === mundialDrawReveal.opponentId);
        return (
          <div className="modal-overlay" style={{ zIndex: 1200 }}>
            <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem' }}>🌐</span>
              <h3 style={{ fontWeight: 800, marginTop: '8px', color: '#c084fc' }}>
                {mundialDrawReveal.phase === 'SEMIFINAL' ? 'Mundial de Clubes!' : 'Você está na Final!'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '4px 0 16px' }}>
                {mundialDrawReveal.phase === 'SEMIFINAL' ? 'Semifinal' : 'Final'}
              </p>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, margin: '10px 0' }}>
                {userClub?.name}
                <span style={{ color: '#c084fc' }}> x </span>
                {opponentClub?.name}
              </div>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '0 0 20px' }}>
                {opponentClub?.country}
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={dismissMundialDrawReveal}>
                Continuar
              </button>
            </div>
          </div>
        );
      })()}

      {/* UNHAPPY PLAYER DISSATISFACTION MODAL -- gated to gameState !== 'MATCH_DAY' because
          its trigger effect can still land its state update after the user has already
          tapped into a new match: without this guard it renders on top of the live match
          screen, hiding the whole thing (sim keeps ticking underneath) until dismissed. Also
          deferred behind cupDrawReveal/libertadoresDrawReveal so these auto-popup modals queue
          one at a time instead of stacking when more than one triggers on the same round
          transition. */}
      {unhappyPlayer && gameState !== 'MATCH_DAY' && !cupDrawReveal && !libertadoresDrawReveal && !mundialDrawReveal && !penaltyShootout && !championCelebration && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem' }}>😠</span>
            <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>Jogador Insatisfeito</h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', lineHeight: '1.5', margin: '12px 0 20px 0' }}>
              O jogador <strong>{unhappyPlayer.name}</strong> ({unhappyPlayer.position}) está se sentindo inferior no elenco por não estar jogando e solicitou ser vendido para outro clube!
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
                  resolvePlayerDissatisfaction(unhappyPlayer.id);
                  setUnhappyPlayer(null);
                }}
              >
                Manter no Elenco
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SPONSOR CONTRACT ALERT MODAL -- fires when a deal expires (passive, during round
          processing, easy to miss in the news feed alone) or when the user signs a new one
          (explicit confirmation on top of the news item). */}
      {sponsorAlert && gameState !== 'MATCH_DAY' && !cupDrawReveal && !libertadoresDrawReveal && !mundialDrawReveal && !unhappyPlayer && !penaltyShootout && !championCelebration && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem' }}>{sponsorAlert.kind === 'SIGNED' ? '🤝' : '📉'}</span>
            <h3 style={{ fontWeight: 800, marginTop: '8px', color: sponsorAlert.kind === 'SIGNED' ? 'var(--accent-green)' : 'var(--accent-gold)' }}>
              {sponsorAlert.kind === 'SIGNED' ? 'Novo Patrocínio!' : 'Patrocínio Encerrado'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', lineHeight: '1.5', margin: '12px 0 20px 0' }}>
              {sponsorAlert.kind === 'SIGNED' ? (
                <>Contrato de Patrocínio {sponsorAlert.sponsorType === 'MASTER' ? 'Master' : sponsorAlert.sponsorType === 'COSTAS' ? 'Costas' : 'Mangas'} assinado com a <strong>{sponsorAlert.sponsorName}</strong>!</>
              ) : (
                <>O contrato de Patrocínio {sponsorAlert.sponsorType === 'MASTER' ? 'Master' : sponsorAlert.sponsorType === 'COSTAS' ? 'Costas' : 'Mangas'} com a <strong>{sponsorAlert.sponsorName}</strong> chegou ao fim. Procure um novo patrocinador na aba Finanças.</>
              )}
            </p>
            <button className="btn btn-primary" onClick={dismissSponsorAlert}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* INCOMING CLUB TRANSFER PROPOSAL MODAL -- same race as the dissatisfaction modal
          above: guard against rendering over a live match that's already in progress, and
          queue behind the other two auto-popup modals instead of stacking on top of them. */}
      {incomingProposal && gameState !== 'MATCH_DAY' && !cupDrawReveal && !libertadoresDrawReveal && !mundialDrawReveal && !unhappyPlayer && !sponsorAlert && !penaltyShootout && !championCelebration && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '345px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem' }}>{incomingProposal.buyerClub.league ? '🌍' : '💼'}</span>
            <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-green)' }}>{incomingProposal.buyerClub.league ? 'Proposta do Exterior!' : 'Proposta Recebida!'}</h3>
            <p style={{ fontSize: '0.82rem', color: '#9ca3af', lineHeight: '1.4', margin: '10px 0 16px 0' }}>
              O <strong>{incomingProposal.buyerClub.name}</strong>{incomingProposal.buyerClub.league ? ` (${incomingProposal.buyerClub.league})` : ''} enviou uma oferta oficial para comprar seu jogador <strong>{incomingProposal.player.name}</strong> ({incomingProposal.player.position}, Rating {incomingProposal.player.rating})!
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
                      acceptIncomingProposal(incomingProposal.player, incomingProposal.buyerClub.id, incomingProposal.amount, incomingProposal.buyerClub.name);
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
                        acceptIncomingProposal(incomingProposal.player, incomingProposal.buyerClub.id, negOfferAmount, incomingProposal.buyerClub.name);
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

      {/* PREMIUM COMPETITION UPSELL MODAL -- fires right alongside the news item whenever a
          non-Premium player's own Copa do Brasil/Libertadores tie got auto-resolved instead of
          played live (see processCupMilestone/processLibertadoresMilestone in GameContext), so
          the offer to unlock it lands at the exact moment the player feels the loss, not just as
          a line buried in the news feed. Queued behind the other auto-popup modals. */}
      {premiumCompetitionAlert && gameState !== 'MATCH_DAY' && !cupDrawReveal && !libertadoresDrawReveal && !mundialDrawReveal && !unhappyPlayer && !sponsorAlert && !incomingProposal && !penaltyShootout && !championCelebration && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '345px', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem' }}>{premiumCompetitionAlert.competitionLabel === 'Copa do Brasil' ? '🏆' : premiumCompetitionAlert.competitionLabel === 'Mundial de Clubes' ? '🌐' : '🌎'}</span>
            <h3 style={{ fontWeight: 800, marginTop: '8px', color: 'var(--accent-gold)' }}>
              {premiumCompetitionAlert.competitionLabel} — {premiumCompetitionAlert.phaseLabel}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', lineHeight: '1.5', margin: '12px 0 8px 0' }}>
              Seu time enfrentou o <strong>{premiumCompetitionAlert.opponentName}</strong> e{' '}
              {premiumCompetitionAlert.outcome === 'WIN' ? 'venceu' : premiumCompetitionAlert.outcome === 'DRAW' ? 'empatou' : 'foi eliminado'}
              {premiumCompetitionAlert.scoreLine ? ` por ${premiumCompetitionAlert.scoreLine}` : ''}
              {premiumCompetitionAlert.wentToPenalties ? ' nos pênaltis' : ''}.
            </p>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: '1.5', margin: '0 0 20px 0' }}>
              Sem o Premium, essas partidas são resolvidas automaticamente. Desbloqueie pra jogar você mesmo da próxima vez.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--accent-gold)' }}
                onClick={() => {
                  const reason = premiumCompetitionAlert.competitionLabel;
                  dismissPremiumCompetitionAlert();
                  setPremiumPaywallReason(reason);
                }}
              >
                🔓 Desbloquear Premium
              </button>
              <button className="btn btn-secondary" onClick={dismissPremiumCompetitionAlert}>
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELL PLAYER ASKING-PRICE MODAL -- replaces a native prompt() with a proper styled
          input that formats the number with thousand separators as the user types, instead of
          showing a raw unbroken digit string like "10919340". */}
      {sellPriceModal && (() => {
        const player = sellPriceModal;

        if (sellResult) {
          return (
            <div className="modal-overlay" style={{ zIndex: 1260 }}>
              <div className="modal-content" style={{ width: '100%', maxWidth: '340px', padding: '18px', textAlign: 'center' }}>
                <span style={{ fontSize: '2rem' }}>{sellResult.success ? '✅' : '❌'}</span>
                <h3 style={{ fontWeight: 800, marginTop: '8px', color: sellResult.success ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {sellResult.success ? 'Venda concluída!' : 'Proposta recusada'}
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#d1d5db', margin: '10px 0 18px', lineHeight: '1.4' }}>
                  {sellResult.text}
                </p>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    if (sellResult.success) {
                      setSellResult(null);
                      setSellPriceModal(null);
                      setSelectedManagePlayerId(null);
                    } else {
                      // Back to the input form for another attempt, same modal still open.
                      setSellResult(null);
                    }
                  }}
                >
                  {sellResult.success ? 'Continuar' : 'Tentar outro valor'}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="modal-overlay" style={{ zIndex: 1260 }}>
            <div className="modal-content" style={{ width: '100%', maxWidth: '340px', padding: '18px', textAlign: 'center' }}>
              <span style={{ fontSize: '2rem' }}>💰</span>
              <h3 style={{ fontWeight: 800, marginTop: '8px' }}>Vender {player.name}</h3>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '8px 0 14px', lineHeight: '1.4' }}>
                Valor de mercado: <strong style={{ color: 'white' }}>{formatCurrency(player.value)}</strong>.
                Quanto mais alto o valor pedido, menor a chance de algum clube aceitar.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', background: '#121316', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 14px', marginBottom: sellPriceInputError ? '6px' : '16px' }}>
                <span style={{ color: '#9ca3af', fontWeight: 700, marginRight: '4px' }}>R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatDigitsWithSeparators(sellPriceDigits)}
                  onChange={(e) => { setSellPriceDigits(e.target.value.replace(/\D/g, '')); setSellPriceInputError(''); }}
                  autoFocus
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: '1.1rem', fontWeight: 700, textAlign: 'right' }}
                />
              </div>
              {sellPriceDigits && (
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-green)', fontWeight: 700, marginBottom: '10px' }}>
                  {formatCurrency(Number(sellPriceDigits))}
                </p>
              )}
              {sellPriceInputError && (
                <p style={{ fontSize: '0.72rem', color: 'var(--accent-red)', marginBottom: '10px' }}>{sellPriceInputError}</p>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => { setSellPriceModal(null); setSellPriceInputError(''); }}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    const askingPrice = Number(sellPriceDigits);
                    if (!askingPrice || askingPrice <= 0) { setSellPriceInputError('Digite um valor válido.'); return; }
                    const result = attemptSellPlayer(player, askingPrice);
                    setSellResult({ success: result.success, text: result.message ?? '' });
                  }}
                >
                  Vender
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{negotiatingPlayer.age} anos • Força: {negotiatingPlayer.rating}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#9ca3af' }}>
                  <div>
                    <span>Valor de Mercado: </span>
                    <span style={{ fontWeight: 700, color: 'white' }}>{formatCurrency(negotiatingPlayer.value)}</span>
                  </div>
                  <div>
                    <span>Caixa Disponível: </span>
                    <span style={{ fontWeight: 700, color: (userClub?.finances || 0) < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{formatCurrency(userClub?.finances || 0)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>Sua Oferta:</label>

                  {/* Fine adjustment: +/- 5% of market value per tap, no typing needed */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => setOfferAmount(prev => Math.max(0, prev - Math.max(1000, Math.round(negotiatingPlayer.value * 0.05))))}
                      className="btn btn-secondary"
                      style={{ width: '44px', height: '44px', padding: 0, fontSize: '1.2rem', fontWeight: 800 }}
                    >
                      −
                    </button>
                    <div style={{ flex: 1, textAlign: 'center', fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
                      {formatCurrency(offerAmount)}
                    </div>
                    <button
                      onClick={() => setOfferAmount(prev => prev + Math.max(1000, Math.round(negotiatingPlayer.value * 0.05)))}
                      className="btn btn-secondary"
                      style={{ width: '44px', height: '44px', padding: 0, fontSize: '1.2rem', fontWeight: 800 }}
                    >
                      +
                    </button>
                  </div>

                  {/* Quick presets as a % of market value */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {[0.9, 1.0, 1.1, 1.2, 1.3, 1.5].map(mult => (
                      <button
                        key={mult}
                        onClick={() => setOfferAmount(Math.round(negotiatingPlayer.value * mult))}
                        className="btn btn-secondary"
                        style={{
                          padding: '8px 0',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: offerAmount === Math.round(negotiatingPlayer.value * mult) ? 'rgba(255, 193, 7, 0.15)' : undefined,
                          border: offerAmount === Math.round(negotiatingPlayer.value * mult) ? '1px solid var(--accent-gold)' : undefined,
                          color: offerAmount === Math.round(negotiatingPlayer.value * mult) ? 'var(--accent-gold)' : undefined
                        }}
                      >
                        {Math.round(mult * 100)}%
                      </button>
                    ))}
                  </div>
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
                      O clube e o jogador aceitaram a sua oferta de <strong>{formatCurrency(offerAmount)}</strong>! O contrato de 1 ano foi assinado.
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
                      O clube e o jogador recusaram sua oferta de <strong>{formatCurrency(offerAmount)}</strong> por estar abaixo do valor de mercado. Eles consideraram a oferta inaceitável.
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
                      O clube recusou sua oferta inicial de <strong>{formatCurrency(offerAmount)}</strong>, mas fez uma contraproposta de <strong>{formatCurrency(negotiationResult.counterAmount || 0)}</strong> para fechar negócio hoje.
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
              Tem certeza que deseja comprar o jogador <strong>{purchaseConfirmData.player.name}</strong> ({purchaseConfirmData.player.position}), do time <strong>{purchaseConfirmData.clubName}</strong>, por <strong>{formatCurrency(purchaseConfirmData.price)}</strong>?
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

      {/* DISCRETE SAVE SLOTS OVERLAY MODAL */}
      {/* SETTINGS MODAL -- gear icon in the header opens this instead of the old row of 4
          buttons that used to sit under the news feed (moved here per user request: those
          are account/session actions, not something that belongs mixed into the main content). */}
      {settingsModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1250 }}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '340px', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.1rem' }}>⚙️ Configurações</h3>
              <button
                onClick={() => setSettingsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.4rem', cursor: 'pointer', fontWeight: 800 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={manualSave}
                style={{ background: 'rgba(0, 230, 118, 0.1)', border: '1px solid rgba(0, 230, 118, 0.35)', color: 'var(--accent-green)', borderRadius: '10px', padding: '11px 0', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                💾 Salvar Rápido
              </button>

              <button
                onClick={() => { setSettingsModalOpen(false); setSavesModalOpen(true); }}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', borderRadius: '10px', padding: '11px 0', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                ⬇️⬆️ Exportar / Importar Save
              </button>

              <button
                onClick={() => {
                  if (confirm('Tem certeza que deseja pedir demissão? Você ficará sem clube até receber e aceitar uma proposta.')) {
                    setSettingsModalOpen(false);
                    requestResignation();
                  }
                }}
                style={{ background: 'rgba(255, 23, 68, 0.07)', border: '1px solid rgba(255, 23, 68, 0.25)', color: 'var(--accent-red)', borderRadius: '10px', padding: '11px 0', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                🚪 Pedir Demissão
              </button>

              <button
                onClick={() => { setSettingsModalOpen(false); setGameState('MENU'); }}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', borderRadius: '10px', padding: '11px 0', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                🏠 Voltar ao Menu
              </button>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />

              <button
                onClick={() => {
                  if (confirm('Tem certeza que deseja excluir esta campanha? Você voltará à tela inicial.')) {
                    setSettingsModalOpen(false);
                    resetGame();
                  }
                }}
                style={{ background: 'none', border: '1px solid rgba(255, 23, 68, 0.2)', color: 'var(--accent-red)', borderRadius: '10px', padding: '10px 0', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                🗑️ Excluir Campanha
              </button>
            </div>
          </div>
        </div>
      )}

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
              Seu progresso é salvo automaticamente neste slot a cada ação. Você pode trocar para outra campanha ou excluir slots que não usa mais.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {[1, 2, 3, 4].map(slot => {
                const saveKey = `retrofoot_2026_save_slot_${slot}`;
                const label = getSaveLabel(saveKey);
                const isCurrent = currentSlot === slot;
                const locked = !label && !isPremium && slot > 1;

                return (
                  <div key={slot} style={{ background: '#121316', border: isCurrent ? '1px solid var(--accent-green)' : '1px solid rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: isCurrent ? 'var(--accent-green)' : '#9ca3af', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {locked && <Lock size={12} />} Slot 0{slot}{isCurrent ? ' (Atual)' : ''}
                      </span>
                      <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{locked ? '🔒 Premium' : label ? '💾 Salvo' : '⚪ Livre'}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label || ''}>
                      {label || 'Vazio'}
                    </div>
                    {!isCurrent && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                        <button
                          onClick={() => {
                            if (!label) return;
                            if (confirm(`Trocar para a campanha do Slot 0${slot}? Seu progresso atual já está salvo neste slot e você pode voltar a ele depois.`)) {
                              const raw = localStorage.getItem(saveKey);
                              if (raw) {
                                loadGame(JSON.parse(raw), slot);
                                setSavesModalOpen(false);
                              }
                            }
                          }}
                          className="btn btn-secondary"
                          style={{ flex: 1, fontSize: '0.7rem', padding: '6px 0', borderRadius: '6px', background: label ? 'rgba(255,193,7,0.1)' : '#1e2126', border: label ? '1px solid rgba(255,193,7,0.2)' : '1px solid rgba(255,255,255,0.02)', color: label ? 'var(--accent-gold)' : '#9ca3af', cursor: label ? 'pointer' : 'not-allowed', fontWeight: 700 }}
                          disabled={!label}
                        >
                          Jogar
                        </button>
                        <button
                          onClick={() => {
                            if (!label) return;
                            if (confirm(`Excluir a campanha do Slot 0${slot}? Essa ação não pode ser desfeita.`)) {
                              localStorage.removeItem(saveKey);
                              localStorage.removeItem(`retrofoot_2026_tactics_slot_${slot}`);
                              removeCloudSave(saveKey);
                              removeCloudSave(`retrofoot_2026_tactics_slot_${slot}`);
                              setSlotRefreshTick(t => t + 1);
                            }
                          }}
                          className="btn btn-secondary"
                          style={{ flex: 1, fontSize: '0.7rem', padding: '6px 0', borderRadius: '6px', background: label ? 'rgba(255,23,68,0.1)' : '#1e2126', border: label ? '1px solid rgba(255,23,68,0.2)' : '1px solid rgba(255,255,255,0.02)', color: label ? 'var(--accent-red)' : '#9ca3af', cursor: label ? 'pointer' : 'not-allowed', fontWeight: 700 }}
                          disabled={!label}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => exportSave(slot)}
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '0.68rem', padding: '5px 0', borderRadius: '6px', background: label ? 'rgba(255,255,255,0.04)' : '#1e2126', border: '1px solid rgba(255,255,255,0.06)', color: label ? 'white' : '#6b7280', cursor: label ? 'pointer' : 'not-allowed' }}
                        disabled={!label}
                        title="Baixar este save como arquivo, pra guardar como backup"
                      >
                        ⬇️ Exportar
                      </button>
                      <button
                        onClick={() => {
                          if (locked) { setPremiumPaywallReason(`Slot 0${slot}`); return; }
                          if (label && !confirm(`O Slot 0${slot} já tem uma campanha (${label}). Importar um arquivo vai SUBSTITUIR esse save. Continuar?`)) return;
                          setImportTargetSlot(slot);
                          importFileInputRef.current?.click();
                        }}
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '0.68rem', padding: '5px 0', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'white' }}
                        title={locked ? 'Recurso Premium' : 'Restaurar um save de um arquivo exportado anteriormente'}
                      >
                        {locked ? <><Lock size={12} /> Importar</> : '⬆️ Importar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '12px', lineHeight: '1.4' }}>
              {isNativeApp()
                ? '💡 Reinstalar o app ou trocar de aparelho apaga os saves guardados apenas neste dispositivo. Exporte de vez em quando pra ter um backup guardado (Drive, e-mail, WhatsApp pra si mesmo) e importe de volta quando precisar.'
                : '💡 Como o jogo roda direto no navegador, limpar o cache/dados do navegador apaga os saves. Exporte de vez em quando pra ter um backup guardado (Drive, e-mail, WhatsApp pra si mesmo) e importe de volta quando precisar.'}
            </p>

            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && importTargetSlot !== null) {
                  handleImportFile(file, importTargetSlot);
                }
                e.target.value = '';
                setImportTargetSlot(null);
              }}
            />

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
      {(() => {
        // While the interactive tutorial is running, highlight only the single tab the player is
        // being guided to tap next and dim the rest so it's unmistakable which one to press.
        const tutorialTargetTab = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep].nextTabIndex : null;
        const navClass = (i: number) => {
          let cls = `nav-item ${activeTab === i ? 'active' : ''}`;
          if (tutorialTargetTab !== null) {
            cls += tutorialTargetTab === i ? ' tutorial-target' : ' tutorial-dimmed';
          }
          return cls;
        };
        return (
          <div className="bottom-nav">
            <button className={navClass(0)} onClick={() => setActiveTab(0)}>
              <Home />
              <span>Escritório</span>
            </button>
            <button className={navClass(1)} onClick={() => setActiveTab(1)}>
              <Users />
              <span>Elenco</span>
            </button>
            <button className={navClass(2)} onClick={() => setActiveTab(2)}>
              <TrendingUp />
              <span>Mercado</span>
            </button>
            <button className={navClass(3)} onClick={() => setActiveTab(3)}>
              <DollarSign />
              <span>Finanças</span>
            </button>
            <button className={navClass(4)} onClick={() => setActiveTab(4)}>
              <Trophy />
              <span>Classif.</span>
            </button>
          </div>
        );
      })()}
      {premiumPaywallReason && (
        <PremiumPaywallModal reason={premiumPaywallReason} onClose={() => setPremiumPaywallReason(null)} />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <PremiumProvider>
      <GameProvider>
        <AppContent />
      </GameProvider>
    </PremiumProvider>
  );
};

export default App;
