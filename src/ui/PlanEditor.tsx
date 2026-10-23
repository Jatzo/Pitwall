import { analysePlan } from '../engine/insights.ts';
import type { AnalyseOptions } from '../engine/insights.ts';
import type { WearRates } from '../engine/strategy.ts';
import { COMPOUNDS, DRY_COMPOUNDS } from '../engine/tyres.ts';
import type { Compound, StrategyPlan } from '../engine/types.ts';

interface Props {
  plan: StrategyPlan;
  totalLaps: number;
  rates: WearRates;
  onChange: (plan: StrategyPlan) => void;
  /** Pre-race the start tyre can be changed; mid-race it is fixed. */
  lockStart?: boolean;
  opts?: AnalyseOptions;
  /** Earliest lap a stop may be planned on. */
  minStopLap?: number;
  onSuggest?: () => void;
}

export function CompoundSelect({ value, onChange }: { value: Compound; onChange: (c: Compound) => void }) {
  return (
    <span className="btn-group">
      {DRY_COMPOUNDS.map((c) => (
        <button
          key={c}
          type="button"
          className={`btn small ${value === c ? 'active' : ''}`}
          style={value === c ? { borderColor: COMPOUNDS[c].color } : undefined}
          onClick={() => onChange(c)}
          title={COMPOUNDS[c].name}
        >
          <span style={{ color: COMPOUNDS[c].color, fontWeight: 800 }}>{c}</span>
        </button>
      ))}
    </span>
  );
}

export function PlanEditor({ plan, totalLaps, rates, onChange, lockStart, opts, minStopLap = 1, onSuggest }: Props) {
  const report = analysePlan(plan, totalLaps, rates, opts);
  const span = Math.max(1, totalLaps - (opts?.fromLap ?? 1) + 1);

  const setStop = (i: number, patch: Partial<{ lap: number; compound: Compound }>) => {
    const stops = plan.stops.map((s, k) => (k === i ? { ...s, ...patch } : s));
    onChange({ ...plan, stops });
  };
  const addStop = () => {
    const last = plan.stops[plan.stops.length - 1];
    const lap = Math.min(totalLaps - 1, Math.max(minStopLap, last ? last.lap + 8 : Math.round(totalLaps / 2)));
    onChange({ ...plan, stops: [...plan.stops, { lap, compound: plan.stops.length % 2 === 0 ? 'H' : 'M' }] });
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="stint" aria-label="Stint overview">
        {report.stints.map((s, i) => (
          <div key={i} style={{ flex: Math.max(s.laps, 0.5) / span, background: COMPOUNDS[s.compound].color }} title={`${COMPOUNDS[s.compound].name}: laps ${s.fromLap}-${s.toLap}`}>
            {s.laps >= 4 ? `${s.compound} ${s.laps}` : ''}
          </div>
        ))}
      </div>

      <div className="row wrap">
        <span className="muted" style={{ width: 52 }}>Start</span>
        {lockStart ? (
          <span className="tyre-dot" style={{ borderColor: COMPOUNDS[plan.startCompound].color }}>{plan.startCompound}</span>
        ) : (
          <CompoundSelect value={plan.startCompound} onChange={(c) => onChange({ ...plan, startCompound: c })} />
        )}
        <span className="muted num" style={{ fontSize: 12 }}>
          {report.stints[0] ? `to lap ${report.stints[0].toLap} (~${Math.round(report.stints[0].endWear * 100)}% worn)` : ''}
        </span>
      </div>

      {plan.stops.map((s, i) => (
        <div className="row wrap" key={i}>
          <span className="muted" style={{ width: 52 }}>Stop {i + 1}</span>
          <label className="row" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>lap</span>
            <input
              type="number"
              className="num"
              style={{ width: 62 }}
              min={minStopLap}
              max={totalLaps - 1}
              value={s.lap}
              onChange={(e) => setStop(i, { lap: Math.max(minStopLap, Math.min(totalLaps - 1, Math.round(Number(e.target.value) || minStopLap))) })}
            />
          </label>
          <CompoundSelect value={s.compound} onChange={(c) => setStop(i, { compound: c })} />
          <span className="muted num" style={{ fontSize: 12 }}>
            {report.stints[i + 1] ? `${report.stints[i + 1].laps} laps, ~${Math.round(report.stints[i + 1].endWear * 100)}%` : ''}
          </span>
          <button className="btn small" type="button" onClick={() => onChange({ ...plan, stops: plan.stops.filter((_, k) => k !== i) })} aria-label={`Remove stop ${i + 1}`}>
            Remove
          </button>
        </div>
      ))}

      <div className="row wrap">
        <button className="btn small" type="button" onClick={addStop} disabled={plan.stops.length >= 4}>
          Add stop
        </button>
        {onSuggest && (
          <button className="btn small" type="button" onClick={onSuggest}>
            Suggest best plan
          </button>
        )}
      </div>

      {report.warnings.length > 0 && (
        <div className="warnbox">
          {report.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
