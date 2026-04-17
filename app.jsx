// ─────────────────────────────────────────────────────────────
// Cee-Lo app — orchestrates the round and renders everything
// ─────────────────────────────────────────────────────────────
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const { Die, DiceRow, ResultBadge, Zone, VsDivider, AmountInput, SideBetChip } = window.CeeLoUI;
const {
  rollDice, evaluateRoll,
  isInstantWin, isInstantLoss, isPoint, isDead,
  comparePlayerVsHouse,
  SIDE_BETS, resolveSideBet, mainBetPayout,
} = window.CeeLo;

const TWEAKS = {
  animationSpeed: 1.0,
  showSideBets: true,
  showSecondWindow: true,
};

const SPEED_MS = (base) => Math.round(base / (TWEAKS.animationSpeed || 1));

// ── Phases ─────────────────────────────────────────────────
//   idle → bet-placed → house-rolling → [point-set → second-window →]
//   player-rolling → resolved
const PHASES = {
  idle: 'idle',
  betPlaced: 'bet-placed',
  houseRolling: 'house-rolling',
  pointSet: 'point-set',
  secondWindow: 'second-window',
  playerRolling: 'player-rolling',
  resolved: 'resolved',
};

// Safe fallback dice used if somehow all 10 rolls are dead
const SAFE_POINT_DICE = [3, 3, 4];

// ──────────────────────────────────────────────────────────
function App() {
  const [balance, setBalance] = useState(1000);
  const [wager, setWager] = useState(10);
  const [sideBetAmts, setSideBetAmts] = useState({}); // {key: amount}
  const [phase, setPhase] = useState(PHASES.idle);

  const [houseDice, setHouseDice] = useState([1, 1, 1]);
  const [houseResult, setHouseResult] = useState(null);
  const [houseRolling, setHouseRolling] = useState(false);
  const [houseAttempts, setHouseAttempts] = useState(0);

  const [playerDice, setPlayerDice] = useState([1, 1, 1]);
  const [playerResult, setPlayerResult] = useState(null);
  const [playerRolling, setPlayerRolling] = useState(false);
  const [playerAttempts, setPlayerAttempts] = useState(0);

  const [outcome, setOutcome] = useState(null); // 'win' | 'lose' | 'push'
  const [payoutBreakdown, setPayoutBreakdown] = useState(null);
  const [history, setHistory] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const [flash, setFlash] = useState(null);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweakVals, setTweakVals] = useState(TWEAKS);

  // ── Tweaks live-update ─────────────────────────────────
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    TWEAKS.animationSpeed = tweakVals.animationSpeed;
    TWEAKS.showSideBets = tweakVals.showSideBets;
    TWEAKS.showSecondWindow = tweakVals.showSecondWindow;
  }, [tweakVals]);

  const setTweak = (key, val) => {
    setTweakVals((p) => ({ ...p, [key]: val }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, window.location.origin);
  };

  // ── Side bet helpers ───────────────────────────────────
  const totalSideBets = Object.values(sideBetAmts).reduce((a, b) => a + b, 0);
  const setSideBet = (k, amt) => {
    setSideBetAmts((p) => {
      const n = { ...p };
      if (amt <= 0) delete n[k];
      else n[k] = amt;
      return n;
    });
  };

  // ── Start round ────────────────────────────────────────
  const canPlaceBet = phase === PHASES.idle && (wager > 0 || totalSideBets > 0);
  const totalStake = wager + totalSideBets;

  const placeBet = async () => {
    if (!canPlaceBet) return;
    if (totalStake > balance) { setFlash({ type: 'err', msg: 'Not enough balance' }); setTimeout(() => setFlash(null), 1500); return; }
    setBalance((b) => b - totalStake);
    setPhase(PHASES.betPlaced);
    setOutcome(null);
    setPayoutBreakdown(null);
    setHouseResult(null);
    setPlayerResult(null);
    setHouseAttempts(0);
    setPlayerAttempts(0);

    await sleep(SPEED_MS(450));
    await houseRoll();
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── House roll (auto) ──────────────────────────────────
  const houseRoll = async () => {
    setPhase(PHASES.houseRolling);
    setHouseRolling(true);

    let attempts = 0;
    let finalDice, finalR;
    for (let i = 0; i < 10; i++) {
      attempts++;
      setHouseAttempts(attempts);
      await sleep(SPEED_MS(900));
      const dice = rollDice();
      const r = evaluateRoll(dice);
      setHouseDice(dice);
      if (!isDead(r)) {
        setHouseRolling(false);
        setHouseResult(r);
        finalDice = dice; finalR = r;
        break;
      }
      await sleep(SPEED_MS(450));
    }

    // Fallback: if all 10 rolls were dead, force a valid point roll
    if (!finalR) {
      finalDice = SAFE_POINT_DICE;
      finalR = evaluateRoll(finalDice);
      setHouseDice(finalDice);
      setHouseResult(finalR);
      setHouseRolling(false);
    }

    await sleep(SPEED_MS(600));

    if (isInstantWin(finalR) || isInstantLoss(finalR)) {
      await resolveRound(finalR, null);
      return;
    }

    if (isPoint(finalR)) {
      setPhase(PHASES.pointSet);
      if (TWEAKS.showSideBets && TWEAKS.showSecondWindow) {
        setPhase(PHASES.secondWindow);
      }
    }
  };

  // ── Player roll (manual tap) ───────────────────────────
  const playerRoll = async () => {
    if (phase !== PHASES.pointSet && phase !== PHASES.secondWindow) return;
    setPhase(PHASES.playerRolling);
    setPlayerRolling(true);

    let attempts = 0;
    let finalDice, finalR;
    for (let i = 0; i < 10; i++) {
      attempts++;
      setPlayerAttempts(attempts);
      await sleep(SPEED_MS(900));
      const dice = rollDice();
      const r = evaluateRoll(dice);
      setPlayerDice(dice);
      if (!isDead(r)) {
        setPlayerRolling(false);
        setPlayerResult(r);
        finalDice = dice; finalR = r;
        break;
      }
      await sleep(SPEED_MS(450));
    }

    // Fallback: if all 10 rolls were dead, force a valid point roll
    if (!finalR) {
      finalDice = SAFE_POINT_DICE;
      finalR = evaluateRoll(finalDice);
      setPlayerDice(finalDice);
      setPlayerResult(finalR);
      setPlayerRolling(false);
    }

    await sleep(SPEED_MS(600));
    await resolveRound(houseResult, finalR);
  };

  // ── Resolve & settle ───────────────────────────────────
  const resolveRound = async (hR, pR) => {
    let mainOutcome = 'lose';
    if (pR === null) {
      if (isInstantWin(hR)) mainOutcome = 'lose';
      else if (isInstantLoss(hR)) mainOutcome = 'win';
    } else {
      mainOutcome = comparePlayerVsHouse(hR, pR);
    }

    setOutcome(mainOutcome);

    const mainMult = mainBetPayout(mainOutcome, pR || hR);
    const mainPayout = wager * mainMult;

    const effectivePlayer = pR || hR;
    const sideRes = {};
    let sidePayoutTotal = 0;
    for (const k of Object.keys(sideBetAmts)) {
      const amt = sideBetAmts[k];
      const hit = resolveSideBet(k, hR, effectivePlayer);
      sideRes[k] = hit ? 'win' : 'lose';
      if (hit) sidePayoutTotal += amt * (1 + SIDE_BETS[k].odds);
    }

    const totalReturn = mainPayout + sidePayoutTotal;
    setPayoutBreakdown({
      mainOutcome, mainMult, mainPayout, sideRes, sidePayoutTotal, totalReturn,
      netChange: totalReturn - totalStake,
    });

    setBalance((b) => b + totalReturn);
    setPhase(PHASES.resolved);

    setHistory((h) => [
      {
        id: Date.now(),
        house: hR, player: pR,
        outcome: mainOutcome,
        net: totalReturn - totalStake,
        wager: totalStake,
      },
      ...h,
    ].slice(0, 24));

    const flashMsg = mainOutcome === 'win'
      ? (pR?.kind === 'cee-lo' ? 'CEE-LO!' : pR?.kind === 'trips' && pR.value === 6 ? 'TRIP SIXES!' : pR?.kind === 'trips' ? 'TRIPS!' : pR?.kind === 'pair6' ? 'HEADCRACK!' : 'WIN')
      : mainOutcome === 'lose' ? (pR?.kind === 'bust' || pR?.kind === 'pair1' ? 'ACE OUT' : 'HOUSE WINS') : 'PUSH';
    setFlash({ type: mainOutcome, msg: flashMsg });
    setTimeout(() => setFlash(null), 2600);
  };

  // ── Reset for next round ──────────────────────────────
  const nextRound = () => {
    setPhase(PHASES.idle);
    setHouseDice([1, 1, 1]);
    setPlayerDice([1, 1, 1]);
    setHouseResult(null);
    setPlayerResult(null);
    setOutcome(null);
    setPayoutBreakdown(null);
    setSideBetAmts({});
    setHouseAttempts(0);
    setPlayerAttempts(0);
  };

  // ── Derived ─────────────────────────────────────────────
  const houseActive = [PHASES.houseRolling, PHASES.pointSet, PHASES.secondWindow].includes(phase);
  const playerActive = [PHASES.playerRolling, PHASES.pointSet, PHASES.secondWindow].includes(phase);
  const canTapToRoll = phase === PHASES.pointSet || phase === PHASES.secondWindow;

  const houseSubtitle =
    phase === PHASES.houseRolling && houseAttempts > 1 ? `RE-ROLL · attempt ${houseAttempts}` :
    phase === PHASES.houseRolling ? 'rolling the bones…' :
    houseResult ? (isPoint(houseResult) ? `point to beat: ${houseResult.point}` : houseResult.label) :
    'waiting on your bet';

  const playerSubtitle =
    phase === PHASES.playerRolling && playerAttempts > 1 ? `RE-ROLL · attempt ${playerAttempts}` :
    phase === PHASES.playerRolling ? 'shake \'em up…' :
    canTapToRoll ? 'TAP DICE TO ROLL' :
    playerResult ? playerResult.label :
    phase === PHASES.resolved ? '—' :
    phase === PHASES.idle ? 'place your bets' :
    '—';

  const mainBetLocked = phase !== PHASES.idle;
  const sideBetLocked = phase !== PHASES.idle && !(phase === PHASES.secondWindow && TWEAKS.showSecondWindow);
  const liveAvailable = new Set(['headcrack', 'aceout', 'tripsix', 'over3', 'under3', 'exact2', 'exact3', 'exact4', 'exact5']);

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="app-root" data-screen-label="Cee-Lo table">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="brand">
          <img src="assets/logo-mark.png" alt="Dices" className="brand-mark" />
          <span className="brand-word">Dices</span>
          <span className="game-tag">Cee-Lo · 4-5-6</span>
        </div>
        <div className="balance-pill">
          <span className="bal-label">BALANCE</span>
          <span className="coin-dot" />
          <span className="bal-val">{balance.toFixed(2)}</span>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setShowRules(true)} title="Rules">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
              <circle cx="12" cy="17" r="0.6" fill="currentColor" />
            </svg>
          </button>
          <button className="icon-btn" title="Chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a8 8 0 1 1-3.8-6.8L21 4l-1.2 3.8A8 8 0 0 1 21 12z" />
            </svg>
          </button>
          <div className="avatar-dot" />
        </div>
      </header>

      {/* ── Main two-column layout ── */}
      <main className="main-grid">
        {/* ── Left bet rail ── */}
        <aside className="bet-rail">
          <div className="rail-tabs">
            <button className="tab active">Manual</button>
            <button className="tab">Auto</button>
            <button className="tab">Advanced</button>
          </div>

          <div className="rail-section">
            <AmountInput value={wager} onChange={setWager} label="MAIN WAGER" disabled={mainBetLocked} />
            <div className="field-row">
              <div className="field-col">
                <label className="field-label">POTENTIAL (1:1)</label>
                <div className="readout">{(wager * 2).toFixed(2)}</div>
              </div>
              <div className="field-col">
                <label className="field-label">CEE-LO (2:1)</label>
                <div className="readout accent">{(wager * 3).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {TWEAKS.showSideBets && (
            <div className="rail-section sidebets">
              <div className="section-head">
                <span className="section-title">SIDE BETS</span>
                {phase === PHASES.secondWindow && <span className="live-pill">● LIVE WINDOW</span>}
              </div>

              <div className="sb-group">
                <div className="sb-group-label">over / under</div>
                <div className="sb-grid-2">
                  {['under3', 'over3'].map((k) => (
                    <SideBetChip
                      key={k} keyName={k} def={SIDE_BETS[k]}
                      amount={sideBetAmts[k] || 0}
                      onSet={(a) => setSideBet(k, a)}
                      disabled={sideBetLocked && !(phase === PHASES.secondWindow && liveAvailable.has(k))}
                      resolved={phase === PHASES.resolved && payoutBreakdown?.sideRes?.[k]}
                    />
                  ))}
                </div>
              </div>

              <div className="sb-group">
                <div className="sb-group-label">exact point</div>
                <div className="sb-grid-4">
                  {['exact2', 'exact3', 'exact4', 'exact5'].map((k) => (
                    <SideBetChip
                      key={k} keyName={k} def={SIDE_BETS[k]}
                      amount={sideBetAmts[k] || 0}
                      onSet={(a) => setSideBet(k, a)}
                      disabled={sideBetLocked && !(phase === PHASES.secondWindow && liveAvailable.has(k))}
                      resolved={phase === PHASES.resolved && payoutBreakdown?.sideRes?.[k]}
                    />
                  ))}
                </div>
              </div>

              <div className="sb-group">
                <div className="sb-group-label">specials</div>
                <div className="sb-grid-2">
                  {['headcrack', 'aceout', 'tripsix', 'push'].map((k) => (
                    <SideBetChip
                      key={k} keyName={k} def={SIDE_BETS[k]}
                      amount={sideBetAmts[k] || 0}
                      onSet={(a) => setSideBet(k, a)}
                      disabled={sideBetLocked && !(phase === PHASES.secondWindow && liveAvailable.has(k))}
                      resolved={phase === PHASES.resolved && payoutBreakdown?.sideRes?.[k]}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="rail-footer">
            <div className="stake-line">
              <span>TOTAL STAKE</span>
              <span className="stake-val">▴ {totalStake.toFixed(2)}</span>
            </div>

            {phase === PHASES.idle && (
              <button className="play-btn" onClick={placeBet} disabled={!canPlaceBet}>
                PLACE BET · ROLL
              </button>
            )}
            {phase === PHASES.resolved && (
              <button className="play-btn" onClick={nextRound}>
                NEXT ROUND
              </button>
            )}
            {(phase === PHASES.betPlaced || phase === PHASES.houseRolling) && (
              <button className="play-btn loading" disabled>
                HOUSE ROLLING…
              </button>
            )}
            {(phase === PHASES.pointSet || phase === PHASES.secondWindow) && (
              <button className="play-btn ready" onClick={playerRoll}>
                {phase === PHASES.secondWindow ? 'ROLL YOUR DICE · LOCK SIDES' : 'ROLL YOUR DICE'}
              </button>
            )}
            {phase === PHASES.playerRolling && (
              <button className="play-btn loading" disabled>
                ROLLING…
              </button>
            )}

            {payoutBreakdown && (
              <div className={`payout-box payout-${payoutBreakdown.mainOutcome}`}>
                <div className="pb-row"><span>Main bet</span><span>{payoutBreakdown.mainOutcome === 'win' ? `+${(payoutBreakdown.mainPayout - wager).toFixed(2)}` : payoutBreakdown.mainOutcome === 'push' ? 'returned' : `−${wager.toFixed(2)}`}</span></div>
                {payoutBreakdown.sidePayoutTotal > 0 && (
                  <div className="pb-row"><span>Side bets</span><span>+{(payoutBreakdown.sidePayoutTotal - Object.values(sideBetAmts).reduce((a,b)=>a+b,0)).toFixed(2)}</span></div>
                )}
                <div className="pb-row total">
                  <span>Net</span>
                  <span>{payoutBreakdown.netChange >= 0 ? '+' : ''}{payoutBreakdown.netChange.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right stage ── */}
        <section className="stage">
          <div className="stage-inner">
            <Zone
              title="THE HOUSE"
              subtitle={houseSubtitle}
              dice={houseDice}
              rolling={houseRolling}
              result={houseResult}
              active={houseActive}
              glyph="⬢"
              side="house"
            />

            <VsDivider phase={phase} outcome={outcome} />

            <div className={`player-zone-wrap ${canTapToRoll ? 'tap-ready' : ''}`}
                 onClick={canTapToRoll ? playerRoll : undefined}>
              <Zone
                title="YOU"
                subtitle={playerSubtitle}
                dice={playerDice}
                rolling={playerRolling}
                result={playerResult}
                active={playerActive}
                glyph="◆"
                side="player"
              />
              {canTapToRoll && <div className="tap-hint">↻ TAP TO ROLL</div>}
            </div>

            {flash && (
              <div className={`flash flash-${flash.type}`}>
                <div className="flash-glyph">
                  {flash.type === 'win' ? '◆◆◆' : flash.type === 'lose' ? '✕' : flash.type === 'push' ? '=' : '!'}
                </div>
                <div className="flash-msg">{flash.msg}</div>
              </div>
            )}
          </div>

          <HistoryStrip history={history} />
        </section>
      </main>

      {/* ── Bottom rules tab ── */}
      <div className="bottom-strip" onClick={() => setShowRules(true)}>
        <div className="bs-left">
          <span className="bs-title">Cee-Lo</span>
          <span className="bs-tag">Dices Originals</span>
        </div>
        <div className="bs-right">
          <span className="bs-odds">▴ 1,200× MAX</span>
          <span className="bs-fair">Demo · Play Money</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>

      {showRules && <RulesDrawer onClose={() => setShowRules(false)} />}

      {tweaksOpen && <TweaksPanel vals={tweakVals} onChange={setTweak} onClose={() => setTweaksOpen(false)} />}
    </div>
  );
}

// ── History strip ─────────────────────────────────────────────
function HistoryStrip({ history }) {
  if (!history.length) return (
    <div className="history-strip empty">
      <span className="hs-label">RECENT ROLLS</span>
      <span className="hs-placeholder">no rounds yet — place your first bet</span>
    </div>
  );
  return (
    <div className="history-strip">
      <span className="hs-label">RECENT</span>
      <div className="hs-scroller">
        {history.map((h) => (
          <div key={h.id} className={`hs-chip hs-${h.outcome}`}>
            <span className="hs-dice">
              {h.house?.kind === 'cee-lo' ? '4·5·6' :
               h.house?.kind === 'trips' ? `${h.house.value}·${h.house.value}·${h.house.value}` :
               h.house?.kind === 'point' ? `P${h.house.point}` :
               h.house?.label?.slice(0, 4) || '—'}
            </span>
            <span className="hs-vs">vs</span>
            <span className="hs-dice">
              {h.player?.kind === 'cee-lo' ? '4·5·6' :
               h.player?.kind === 'trips' ? `${h.player.value}·${h.player.value}·${h.player.value}` :
               h.player?.kind === 'point' ? `P${h.player.point}` :
               h.player?.label?.slice(0, 4) || '—'}
            </span>
            <span className="hs-net">{h.net >= 0 ? '+' : ''}{h.net.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rules drawer ──────────────────────────────────────────────
function RulesDrawer({ onClose }) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>How Cee-Lo works</h2>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          <section>
            <h3>THE LOOP</h3>
            <p>You bet. The House rolls first. If the House doesn't auto-win or auto-lose, it sets a <em>point</em>. You tap to roll your dice, trying to beat it. Higher point wins. Same point = push.</p>
          </section>
          <section className="rules-grid">
            <div className="rule-card rule-hot">
              <div className="rule-badge">INSTANT WIN</div>
              <div className="rule-title">4 · 5 · 6 (Cee-Lo)</div>
              <div className="rule-sub">pays 2:1</div>
            </div>
            <div className="rule-card rule-hot">
              <div className="rule-badge">INSTANT WIN</div>
              <div className="rule-title">Trips (any)</div>
              <div className="rule-sub">pays 3:1 · Trip Sixes 5:1</div>
            </div>
            <div className="rule-card rule-hot">
              <div className="rule-badge">INSTANT WIN</div>
              <div className="rule-title">Pair + 6 (Headcrack)</div>
              <div className="rule-sub">pays 1:1</div>
            </div>
            <div className="rule-card rule-cold">
              <div className="rule-badge">INSTANT LOSS</div>
              <div className="rule-title">1 · 2 · 3 (Ace Out)</div>
              <div className="rule-sub">you bust</div>
            </div>
            <div className="rule-card rule-cold">
              <div className="rule-badge">INSTANT LOSS</div>
              <div className="rule-title">Pair + 1 (Aced Out)</div>
              <div className="rule-sub">you bust</div>
            </div>
            <div className="rule-card rule-neutral">
              <div className="rule-badge">SETS POINT</div>
              <div className="rule-title">Pair + 2/3/4/5</div>
              <div className="rule-sub">odd die = point. higher wins.</div>
            </div>
            <div className="rule-card rule-dead">
              <div className="rule-badge">DEAD ROLL</div>
              <div className="rule-title">No pair, no straight</div>
              <div className="rule-sub">re-roll automatically</div>
            </div>
          </section>
          <section>
            <h3>HIERARCHY (high → low)</h3>
            <ol className="hier-list">
              <li><span>1</span> Trip Sixes (6-6-6)</li>
              <li><span>2</span> Other Trips (5s → 1s)</li>
              <li><span>3</span> Cee-Lo (4-5-6)</li>
              <li><span>4</span> Headcrack (Pair + 6)</li>
              <li><span>5</span> Point 5 · 4 · 3 · 2</li>
              <li><span>6</span> Aced Out (Pair + 1) — loss</li>
              <li><span>7</span> Bust (1-2-3) — loss</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Tweaks panel (demo controls — no cheat mode) ──────────────
function TweaksPanel({ vals, onChange, onClose }) {
  return (
    <div className="tweaks-panel">
      <div className="tp-head">
        <span>Demo Settings</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="tp-body">
        <label className="tp-field">
          <span>Animation speed</span>
          <div className="tp-slider-row">
            <input
              type="range" min="0.3" max="3" step="0.1"
              value={vals.animationSpeed}
              onChange={(e) => onChange('animationSpeed', Number(e.target.value))}
            />
            <span className="tp-val">{vals.animationSpeed.toFixed(1)}×</span>
          </div>
        </label>
        <label className="tp-field toggle">
          <span>Show side bets panel</span>
          <input
            type="checkbox"
            checked={vals.showSideBets}
            onChange={(e) => onChange('showSideBets', e.target.checked)}
          />
        </label>
        <label className="tp-field toggle">
          <span>Second betting window (after House point)</span>
          <input
            type="checkbox"
            checked={vals.showSecondWindow}
            onChange={(e) => onChange('showSecondWindow', e.target.checked)}
          />
        </label>
        <div className="tp-hint">Changes apply on the next round.</div>
      </div>
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
