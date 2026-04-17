// ─────────────────────────────────────────────────────────────
// Cee-Lo UI components
// ─────────────────────────────────────────────────────────────
const { useState, useEffect, useRef, useMemo } = React;

// ── Die (single) ──────────────────────────────────────────────
function Die({ value, rolling, size = 64, delay = 0 }) {
  const [displayVal, setDisplayVal] = useState(value);

  useEffect(() => {
    if (!rolling) { setDisplayVal(value); return; }
    let id;
    const tick = () => {
      setDisplayVal(1 + Math.floor(Math.random() * 6));
      id = setTimeout(tick, 55);
    };
    id = setTimeout(tick, delay);
    return () => clearTimeout(id);
  }, [rolling, value, delay]);

  const pipPositions = {
    1: [[0.5, 0.5]],
    2: [[0.25, 0.25], [0.75, 0.75]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.25, 0.22], [0.25, 0.5], [0.25, 0.78], [0.75, 0.22], [0.75, 0.5], [0.75, 0.78]],
  };
  const pipR = size * 0.075;
  const pips = pipPositions[displayVal] || [];

  return (
    <div
      className={`die ${rolling ? 'die-rolling' : ''}`}
      style={{ width: size, height: size, borderRadius: size * 0.18 }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {pips.map(([x, y], i) => (
          <circle key={i} cx={x * size} cy={y * size} r={pipR} fill="#7BFDEB" />
        ))}
      </svg>
    </div>
  );
}

// ── Dice row ──────────────────────────────────────────────────
function DiceRow({ dice, rolling, size = 64 }) {
  return (
    <div className="dice-row">
      {dice.map((v, i) => (
        <Die key={i} value={v} rolling={rolling} size={size} delay={i * 60} />
      ))}
    </div>
  );
}

// ── Result label badge ────────────────────────────────────────
function ResultBadge({ result, variant }) {
  if (!result) return <div className="result-badge placeholder">—</div>;
  const tone =
    result.kind === 'cee-lo' || result.kind === 'trips' || result.kind === 'pair6' ? 'hot' :
    result.kind === 'bust' || result.kind === 'pair1' ? 'cold' :
    result.kind === 'dead' ? 'mute' : 'neutral';
  return (
    <div className={`result-badge tone-${tone} ${variant || ''}`}>
      {result.label}
      {result.kind === 'point' && <span className="point-val">{result.point}</span>}
    </div>
  );
}

// ── Zone (House or Player) ────────────────────────────────────
function Zone({ title, subtitle, dice, rolling, result, active, glyph, side }) {
  return (
    <div className={`zone ${active ? 'zone-active' : ''} zone-${side}`}>
      <div className="zone-header">
        <div className="zone-title">
          <span className="zone-glyph">{glyph}</span>
          <span>{title}</span>
        </div>
        <div className="zone-sub">{subtitle}</div>
      </div>
      <div className="zone-body">
        <DiceRow dice={dice} rolling={rolling} size={72} />
      </div>
      <div className="zone-footer">
        <ResultBadge result={result} />
      </div>
    </div>
  );
}

// ── VS divider ────────────────────────────────────────────────
function VsDivider({ phase, outcome }) {
  const label =
    outcome === 'win' ? 'YOU WIN' :
    outcome === 'lose' ? 'HOUSE WINS' :
    outcome === 'push' ? 'PUSH' :
    phase === 'idle' ? 'READY' :
    phase === 'house-rolling' ? 'HOUSE ROLLING' :
    phase === 'point-set' ? 'BEAT THE POINT' :
    phase === 'second-window' ? 'LIVE BETS OPEN' :
    phase === 'player-rolling' ? 'YOUR ROLL' :
    'VS';
  const tone =
    outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : outcome === 'push' ? 'push' : 'neutral';
  return (
    <div className={`vs-divider vs-${tone}`}>
      <div className="vs-line" />
      <div className="vs-label">{label}</div>
      <div className="vs-line" />
    </div>
  );
}

// ── Amount input ──────────────────────────────────────────────
function AmountInput({ value, onChange, label = 'Wager', disabled }) {
  return (
    <div className="amount-block">
      <label className="field-label">{label}</label>
      <div className={`amount-input ${disabled ? 'disabled' : ''}`}>
        <span className="coin-dot" />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          disabled={disabled}
          step="0.5"
          min="0"
        />
        <div className="amt-btns">
          <button onClick={() => onChange(Math.max(0, value / 2))} disabled={disabled}>½</button>
          <button onClick={() => onChange(value * 2)} disabled={disabled}>2×</button>
        </div>
      </div>
    </div>
  );
}

// ── Side bet chip ─────────────────────────────────────────────
function SideBetChip({ keyName, def, amount, onSet, disabled, resolved }) {
  const active = amount > 0;
  const tone = resolved === 'win' ? 'chip-win' : resolved === 'lose' ? 'chip-lose' : '';
  return (
    <button
      className={`sidebet-chip ${active ? 'active' : ''} ${tone}`}
      disabled={disabled}
      onClick={() => {
        if (amount > 0) onSet(0);
        else onSet(1); // default 1 unit
      }}
    >
      <div className="sb-top">
        <span className="sb-label">{def.label}</span>
        <span className="sb-odds">{def.odds}×</span>
      </div>
      <div className="sb-bottom">
        {amount > 0 ? <span className="sb-amt">▴ {amount.toFixed(2)}</span> : <span className="sb-place">tap to bet</span>}
        {amount > 0 && (
          <div className="sb-steppers" onClick={(e) => e.stopPropagation()}>
            <span onClick={() => onSet(Math.max(0, amount - 1))}>−</span>
            <span onClick={() => onSet(amount + 1)}>+</span>
          </div>
        )}
      </div>
    </button>
  );
}

window.CeeLoUI = { Die, DiceRow, ResultBadge, Zone, VsDivider, AmountInput, SideBetChip };
