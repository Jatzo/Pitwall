import { memo, useState } from 'react';
import { formatGap, formatLap } from '../engine/format.ts';
import { sessionBests } from '../engine/insights.ts';
import type { CarState, RaceSim } from '../engine/race.ts';
import { COMPOUNDS } from '../engine/tyres.ts';
import { cssVar } from './colour.ts';

interface Props {
  sim: RaceSim;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Moves on with the race screen's 180 ms refresh. The panel is memoised, so this prop is what redraws it: keep it. */
  tick: number;
}

function sectorClasses(car: CarState, bests: ReturnType<typeof sessionBests>): string[] {
  const last = car.laps[car.laps.length - 1];
  if (!last || !last.clean) return ['', '', ''];
  return [0, 1, 2].map((i) => {
    const v = last.sectors[i];
    if (!Number.isFinite(v) || !Number.isFinite(bests.sectors[i])) return '';
    if (v <= bests.sectors[i] + 1e-6) return 'p';
    let personal = Infinity;
    for (const l of car.laps) if (l.clean) personal = Math.min(personal, l.sectors[i]);
    return v <= personal + 1e-6 ? 'g' : 'y';
  });
}

function statusText(car: CarState): string | null {
  if (car.status === 'out') return 'OUT';
  if (car.status === 'pitLane') return 'PIT';
  if (car.status === 'finished') return 'FIN';
  return null;
}

function TimingTowerView({ sim, selectedId, onSelect }: Props) {
  const [mode, setMode] = useState<'interval' | 'leader'>('interval');
  const order = sim.standings();
  const bests = sessionBests(sim);
  const lead = order[0];

  return (
    <div className="tower">
      <div className="row tools">
        <span className="muted small">
          Lap <b className="num strong">{Math.min(sim.totalLaps, (lead?.lap ?? 0) + 1)}</b> / {sim.totalLaps}
        </span>
        <span className="btn-group">
          <button className={`btn small ${mode === 'interval' ? 'active' : ''}`} onClick={() => setMode('interval')}>
            Interval
          </button>
          <button className={`btn small ${mode === 'leader' ? 'active' : ''}`} onClick={() => setMode('leader')}>
            Gap
          </button>
        </span>
      </div>
      <div className="trow thead">
        <span className="pos">P</span>
        <span style={{ gridColumn: 'span 2' }}>Driver</span>
        <span className="r">{mode === 'interval' ? 'Int' : 'Gap'}</span>
        <span className="r">Last</span>
        <span>Tyre</span>
        <span>Sect</span>
        <span className="r">Pit</span>
      </div>
      {order.map((car, i) => {
        const st = statusText(car);
        let gap = '--';
        if (st === 'OUT') gap = 'OUT';
        else if (st === 'PIT') gap = 'PIT';
        else if (i === 0) gap = car.status === 'finished' ? 'WIN' : 'Leader';
        else if (mode === 'interval') {
          const g = sim.gapToAhead(car);
          gap = g === null ? '--' : formatGap(g);
        } else {
          const g = sim.gapToLeader(car);
          gap = g.lapsDown > 0 ? `+${g.lapsDown} L` : formatGap(g.seconds);
        }
        const sc = sectorClasses(car, bests);
        const isBest = car.lastLap !== null && bests.lap !== null && Math.abs(car.lastLap - bests.lap) < 1e-6;
        const isPb = car.lastLap !== null && car.bestLap !== null && Math.abs(car.lastLap - car.bestLap) < 1e-6;
        const spec = COMPOUNDS[car.tyre.compound];
        return (
          <div
            key={car.id}
            className={`trow ${car.id === selectedId ? 'sel' : ''} ${car.isPlayer ? 'mine' : ''} ${car.status === 'out' ? 'out' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={car.id === selectedId}
            aria-label={`${car.driver.name}, ${car.status === 'out' ? 'retired' : `P${i + 1}`}`}
            onClick={() => onSelect(car.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(car.id);
              }
            }}
          >
            <span className="pos num">{car.status === 'out' ? '' : i + 1}</span>
            <span className="teambar" style={cssVar('--team', car.team.colors.primary)} />
            <span className="code">{car.driver.code}</span>
            <span className={`num ${st === 'PIT' ? 'warn' : ''}`} style={{ textAlign: 'right' }}>{gap}</span>
            <span className={`num ${isBest ? 'purple' : isPb ? 'good' : ''}`} style={{ textAlign: 'right' }}>
              {car.lastLap !== null ? formatLap(car.lastLap) : '--'}
            </span>
            <span className="tyre">
              <span className="tyre-dot" style={cssVar('--tyre', spec.color)}>{car.tyre.compound}</span>
              <span className="num muted">{Math.floor(car.tyre.ageLaps)}</span>
            </span>
            <span className="sectors" title="Sectors of the last lap">
              {sc.map((c, k) => (
                <i key={k} className={c} />
              ))}
            </span>
            <span className="num" style={{ textAlign: 'right' }}>{st && st !== 'PIT' ? st : car.stops.length}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Memoised: it redraws when `tick` moves on. */
export const TimingTower = memo(TimingTowerView);
