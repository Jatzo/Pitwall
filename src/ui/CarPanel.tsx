import { memo } from 'react';
import { formatGap, formatLap } from '../engine/format.ts';
import { burnPerLap, fuelLapsSpare, rejoinEstimate, tyreLapsLeft, wearRatesFor } from '../engine/insights.ts';
import type { CarState, RaceSim } from '../engine/race.ts';
import { TUNING } from '../engine/tuning.ts';
import { CLIFF_START, COMPOUNDS, PIT_COMPOUNDS } from '../engine/tyres.ts';
import type { EngineMode, PaceMode, RaceCommand, StrategyPlan } from '../engine/types.ts';
import { TeamLogo } from './TeamLogo.tsx';
import { Conditions } from './Conditions.tsx';
import { PlanEditor } from './PlanEditor.tsx';
import { cssVar } from './colour.ts';

interface Props {
  sim: RaceSim;
  car: CarState;
  /** Moves on with the race screen's 180 ms refresh. The panel is memoised, so this prop is what redraws it: keep it. */
  tick: number;
  dispatch: (cmd: RaceCommand) => void;
  /** Whether the camera is locked on this car. */
  following: boolean;
  onFollow: (carId: string | null) => void;
}

const PACE: { id: PaceMode; label: string; hint: string }[] = [
  { id: 'push', label: 'Push', hint: 'Faster, but burns tyres and fuel' },
  { id: 'standard', label: 'Standard', hint: 'Balanced' },
  { id: 'conserve', label: 'Conserve', hint: 'Slower, saves tyres and fuel' },
];
const ENGINE: { id: EngineMode; label: string; hint: string }[] = [
  { id: 'rich', label: 'Rich', hint: 'More power, more fuel and engine stress' },
  { id: 'standard', label: 'Standard', hint: 'Balanced' },
  { id: 'lean', label: 'Lean', hint: 'Less power, saves fuel and the engine' },
];

function Meter({ value, color, mark }: { value: number; color: string; mark?: number }) {
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      {mark !== undefined && <b style={{ left: `${mark * 100}%` }} />}
    </div>
  );
}

function CarPanelView({ sim, car, dispatch, following, onFollow }: Props) {
  const mine = car.isPlayer;
  const out = car.status === 'out' || car.status === 'finished';
  const wearPct = car.tyre.wear;
  const wearColor = wearPct > CLIFF_START ? 'var(--bad)' : wearPct > 0.5 ? 'var(--warn)' : 'var(--good)';
  const lapsLeft = tyreLapsLeft(sim, car);
  const spare = fuelLapsSpare(sim, car);
  const fuelFrac = car.fuel / (sim.totalLaps * burnPerLap(sim) + 1.5);
  const remaining = sim.totalLaps - car.lap;
  const rates = wearRatesFor(sim.track.def, car.team, car.driver);
  const gap = sim.gapToAhead(car);

  const planForEditor: StrategyPlan = { startCompound: car.tyre.compound, stops: car.plan.stops };

  return (
    <div className="stack">
      <div className="panel">
        <div className="row">
          <TeamLogo team={car.team} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="car-title">
              <span className="num muted">#{car.driver.number}</span> {car.driver.name}
            </h3>
            <div className="muted small">{car.team.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="pos-big">
              {car.status === 'out' ? 'OUT' : `P${sim.standings().indexOf(car) + 1}`}
            </div>
            <div className="muted num small">grid {car.grid}</div>
          </div>
        </div>
        {car.status === 'out' && <div className="bad" style={{ marginTop: 8 }}>Retired: {car.outReason ?? 'unknown'}</div>}
        {car.status !== 'out' && (
          <button
            className={`btn small ${following ? 'active' : ''}`}
            style={{ marginTop: 8 }}
            aria-pressed={following}
            onClick={() => onFollow(following ? null : car.id)}
            title="Keep the camera on this car until you press Auto"
          >
            {following ? 'Following on camera' : 'Follow on camera'}
          </button>
        )}

        <div className="kv" style={{ marginTop: 12 }}>
          <span className="muted">Last lap</span>
          <span className="num">{car.lastLap !== null ? formatLap(car.lastLap) : '--'}</span>
          <span className="muted">Best lap</span>
          <span className="num">{car.bestLap !== null ? formatLap(car.bestLap) : '--'}</span>
          <span className="muted">Gap to car ahead</span>
          <span className="num">{gap !== null ? formatGap(gap) : '--'}</span>
          <span className="muted">Pit stops</span>
          <span className="num">{car.stops.length}</span>
          <span className="muted">Speed</span>
          <span className="num">{Math.round(car.speed * 3.6)} km/h</span>
          {car.penaltySeconds > 0 && (
            <>
              <span className="muted">Penalties</span>
              <span className="num bad">+{car.penaltySeconds}s</span>
            </>
          )}
          {car.damage > 0.05 && (
            <>
              <span className="muted">Damage</span>
              <span className="num warn">{Math.round(car.damage * 100)}%</span>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Tyres and fuel</h3>
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="tyre-dot" style={cssVar('--tyre', COMPOUNDS[car.tyre.compound].color)}>{car.tyre.compound}</span>
          <span>{COMPOUNDS[car.tyre.compound].name}</span>
          <span className="muted num">{Math.floor(car.tyre.ageLaps)} laps old</span>
          <span style={{ flex: 1 }} />
          <span className="num">{Math.round(wearPct * 100)}%</span>
        </div>
        <Meter value={wearPct} color={wearColor} mark={CLIFF_START} />
        {!out && (
          <div className="muted small" style={{ margin: '6px 0 12px' }}>
            About <b className="num strong">{Math.floor(lapsLeft)}</b> laps left before the tyres are finished
            {wearPct > CLIFF_START && <span className="bad"> (past the performance cliff)</span>}
          </div>
        )}
        <div className="row" style={{ marginBottom: 6 }}>
          <span>Fuel</span>
          <span style={{ flex: 1 }} />
          <span className="num">{car.fuel.toFixed(1)} kg</span>
        </div>
        <Meter value={fuelFrac} color={spare < 0 ? 'var(--bad)' : 'var(--text)'} />
        {!out && <div className="muted small" style={{ marginTop: 6 }}>
          {spare >= 0 ? (
            <>Enough for the finish with <b className="num strong">{spare.toFixed(1)}</b> laps spare</>
          ) : (
            <span className="bad">Short of fuel by {(-spare).toFixed(1)} laps. Lean the engine or conserve.</span>
          )}
        </div>}
      </div>

      <Conditions sim={sim} />

      {mine && !out && (
        <>
          <div className="panel">
            <h3>Driving</h3>
            <div className="stack" style={{ gap: 10 }}>
              <div>
                <div className="muted small" style={{ marginBottom: 4 }}>Pace</div>
                <span className="btn-group">
                  {PACE.map((p) => (
                    <button key={p.id} className={`btn small ${car.paceMode === p.id ? 'active' : ''}`} title={p.hint} onClick={() => dispatch({ type: 'pace', carId: car.id, mode: p.id })}>
                      {p.label}
                    </button>
                  ))}
                </span>
              </div>
              <div>
                <div className="muted small" style={{ marginBottom: 4 }}>Engine</div>
                <span className="btn-group">
                  {ENGINE.map((p) => (
                    <button key={p.id} className={`btn small ${car.engineMode === p.id ? 'active' : ''}`} title={p.hint} onClick={() => dispatch({ type: 'engine', carId: car.id, mode: p.id })}>
                      {p.label}
                    </button>
                  ))}
                </span>
              </div>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={car.auto} onChange={(e) => dispatch({ type: 'auto', carId: car.id, enabled: e.target.checked })} />
                <span>Race engineer on auto <span className="muted">(AI manages pace and stops)</span></span>
              </label>
            </div>
          </div>

          <div className="panel">
            <h3>Pit wall</h3>
            <div className="row wrap" style={{ marginBottom: 10 }}>
              <span className="muted">Box this lap for</span>
              {PIT_COMPOUNDS.map((c) => (
                <button
                  key={c}
                  className={`btn small tyre-choice ${car.pitRequest === c ? 'active' : ''}`}
                  disabled={remaining <= 1 || car.status === 'pitLane'}
                  onClick={() => dispatch({ type: 'pit', carId: car.id, compound: car.pitRequest === c ? null : c })}
                  title={`Pit at the next entry and fit ${COMPOUNDS[c].name}s`}
                >
                  <span style={{ color: COMPOUNDS[c].color, fontWeight: 800 }}>{c}</span>
                </button>
              ))}
              {car.pitRequest && <span className="warn">Box requested: {COMPOUNDS[car.pitRequest].name}</span>}
            </div>
            {car.status === 'running' && (
              <div className="muted small" style={{ margin: '-4px 0 10px' }}>
                {sim.sc.active
                  ? 'Safety car: the field is bunched, so a stop now costs few places.'
                  : `A stop now rejoins about P${rejoinEstimate(sim, car, TUNING.pitLossPlan)}.`}
              </div>
            )}
            <PlanEditor
              plan={planForEditor}
              totalLaps={sim.totalLaps}
              rates={rates}
              lockStart
              minStopLap={car.lap + 1}
              opts={{ fromLap: car.lap + 1, startWear: car.tyre.wear, alreadyUsed: car.usedCompounds }}
              onChange={(p) => dispatch({ type: 'plan', carId: car.id, plan: { startCompound: car.tyre.compound, stops: p.stops } })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Memoised: it redraws when `tick` moves on. */
export const CarPanel = memo(CarPanelView);
