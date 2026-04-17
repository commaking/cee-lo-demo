// ─────────────────────────────────────────────────────────────
// Cee-Lo game logic — rules, roll evaluation, state machine
// ─────────────────────────────────────────────────────────────

const rand6 = () => 1 + Math.floor(Math.random() * 6);
const rollDice = () => [rand6(), rand6(), rand6()];

// Evaluate a 3-dice roll into a canonical outcome.
// Returns: { kind, point?, label, rank }
//   kind: 'cee-lo' | 'trips' | 'pair6' | 'point' | 'pair1' | 'bust' | 'dead'
function evaluateRoll(dice) {
  const sorted = [...dice].sort((a, b) => a - b);
  const [a, b, c] = sorted;

  // Trips
  if (a === b && b === c) {
    return {
      kind: 'trips',
      value: a,
      label: a === 6 ? 'TRIP SIXES' : `TRIPS ${a}s`,
      rank: a === 6 ? 1 : 2 - a / 100, // higher trip wins
    };
  }
  // 4-5-6 Cee-Lo
  if (a === 4 && b === 5 && c === 6) {
    return { kind: 'cee-lo', label: 'CEE-LO', rank: 3 };
  }
  // 1-2-3 bust
  if (a === 1 && b === 2 && c === 3) {
    return { kind: 'bust', label: 'ACE OUT', rank: 100 };
  }
  // Pair detection
  let pair = null, odd = null;
  if (a === b) { pair = a; odd = c; }
  else if (b === c) { pair = b; odd = a; }

  if (pair !== null) {
    if (odd === 6) return { kind: 'pair6', label: 'HEADCRACK', rank: 4 };
    if (odd === 1) return { kind: 'pair1', label: 'ACED OUT', rank: 99 };
    // Point 2/3/4/5
    return {
      kind: 'point',
      point: odd,
      label: `POINT ${odd}`,
      rank: 10 - odd, // point 5 = rank 5 (best point), point 2 = rank 8 (worst)
    };
  }
  // Dead roll
  return { kind: 'dead', label: 'DEAD ROLL', rank: 50 };
}

const isInstantWin = (r) => r.kind === 'cee-lo' || r.kind === 'trips' || r.kind === 'pair6';
const isInstantLoss = (r) => r.kind === 'bust' || r.kind === 'pair1';
const isPoint = (r) => r.kind === 'point';
const isDead = (r) => r.kind === 'dead';

// Compare two results (house vs player). Returns 'win' | 'lose' | 'push' from PLAYER's perspective.
function comparePlayerVsHouse(house, player) {
  if (isInstantWin(player) && !isInstantWin(house)) return 'win';
  if (isInstantWin(house) && !isInstantWin(player)) return 'lose';
  if (isInstantWin(house) && isInstantWin(player)) {
    // Both instant wins — lower rank = higher outcome
    if (player.rank < house.rank) return 'win';
    if (player.rank > house.rank) return 'lose';
    return 'push';
  }
  if (isInstantLoss(player)) return 'lose';
  if (isInstantLoss(house)) return 'win';
  // Both set points
  if (player.point > house.point) return 'win';
  if (player.point < house.point) return 'lose';
  return 'push';
}

// Side bet payout odds (approximate, tuned)
const SIDE_BETS = {
  over3:    { label: 'Over 3.5',    odds: 1.1, group: 'overunder' },
  under3:   { label: 'Under 3.5',   odds: 2.8, group: 'overunder' },
  exact2:   { label: 'Exact 2',     odds: 8,   group: 'exact' },
  exact3:   { label: 'Exact 3',     odds: 8,   group: 'exact' },
  exact4:   { label: 'Exact 4',     odds: 8,   group: 'exact' },
  exact5:   { label: 'Exact 5',     odds: 8,   group: 'exact' },
  headcrack:{ label: 'Headcrack',   odds: 7,   group: 'special' },
  aceout:   { label: 'Ace Out',     odds: 9,   group: 'special' },
  tripsix:  { label: 'Trip Sixes',  odds: 200, group: 'special' },
  push:     { label: 'Push',        odds: 10,  group: 'special' },
};

// Evaluate a side bet given final house + player results.
function resolveSideBet(betKey, house, player) {
  const p = player;
  const h = house;
  switch (betKey) {
    case 'over3':  return isPoint(p) && p.point > 3;
    case 'under3': return isPoint(p) && p.point <= 3;
    case 'exact2': return isPoint(p) && p.point === 2;
    case 'exact3': return isPoint(p) && p.point === 3;
    case 'exact4': return isPoint(p) && p.point === 4;
    case 'exact5': return isPoint(p) && p.point === 5;
    case 'headcrack': return p.kind === 'pair6';
    case 'aceout':    return isInstantLoss(p);
    case 'tripsix':   return p.kind === 'trips' && p.value === 6;
    case 'push': {
      return isPoint(h) && isPoint(p) && h.point === p.point;
    }
    default: return false;
  }
}

// Main bet payout multiplier based on win type.
// Standard 1:1, with boosted payouts for 4-5-6 (2x), Trips (3x), Trip Sixes (5x).
function mainBetPayout(outcome, playerResult) {
  if (outcome !== 'win') return outcome === 'push' ? 1 : 0;
  if (playerResult.kind === 'trips' && playerResult.value === 6) return 1 + 5;
  if (playerResult.kind === 'trips') return 1 + 3;
  if (playerResult.kind === 'cee-lo') return 1 + 2;
  return 1 + 1; // standard 1:1 (return stake + 1x)
}

window.CeeLo = {
  rollDice, evaluateRoll,
  isInstantWin, isInstantLoss, isPoint, isDead,
  comparePlayerVsHouse,
  SIDE_BETS, resolveSideBet, mainBetPayout,
};
