import type { RaceSim } from '../engine/race.ts';
import { classPenalties } from '../engine/tyres.ts';
import type { TyreClass } from '../engine/tyres.ts';
import { RAIN_THRESHOLD, forecast } from '../engine/weather.ts';

export const CLASS_NAMES: Record<TyreClass, string> = { slick: 'Slicks', inter: 'Intermediates', wet: 'Full wets' };

/** A plain word for the weather now. */
export function weatherWord(rain: number, wetness: number): string {
  if (rain <= RAIN_THRESHOLD) return wetness > 0.02 ? 'Drying' : 'Dry';
  if (rain < 0.35) return 'Light rain';
  if (rain < 0.7) return 'Rain';
  return 'Heavy rain';
}

/** "Slicks +2.1 s, intermediates +0.4 s, full wets +1.3 s a lap" for the racing line now. */
export function classCostLine(wetness: number): string {
  const cost = classPenalties(wetness);
  return (['slick', 'inter', 'wet'] as const).map((c) => `${CLASS_NAMES[c]} +${cost[c].toFixed(1)} s`).join(', ') + ' a lap';
}

interface Props {
  sim: RaceSim;
}

/** The weather now, what it costs each kind of tyre, and the next half hour's forecast. */
export function Conditions({ sim }: Props) {
  const rainChance = sim.track.def.rainChance ?? 0;
  const windows = forecast(sim.weather, sim.cfg.seed, rainChance, sim.time);
  const cost = classPenalties(sim.wetness);
  const best = (['slick', 'inter', 'wet'] as const).reduce((a, b) => (cost[b] < cost[a] ? b : a));
  return (
    <div className="panel">
      <h3>Conditions</h3>
      <div className="row" style={{ marginBottom: 6 }}>
        <b>{weatherWord(sim.rain, sim.wetness)}</b>
        <span style={{ flex: 1 }} />
        <span className="muted">Racing line</span>
        <span className="num">{Math.round(sim.wetness * 100)}% wet</span>
      </div>
      <div className="meter" role="meter" aria-label="Racing line wetness" aria-valuenow={Math.round(sim.wetness * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${sim.wetness * 100}%`, background: '#3b8bff' }} />
        <b style={{ left: '14%' }} />
        <b style={{ left: '56%' }} />
      </div>
      <div className="muted small" style={{ margin: '6px 0 10px' }}>
        {sim.wetness > 0
          ? `${CLASS_NAMES[best]} suit the line now. ${classCostLine(sim.wetness)}.`
          : 'Dry line. Intermediates would lose about 2.5 s a lap here.'}
      </div>
      <div className="muted small" style={{ marginBottom: 4 }}>Chance of rain, next 30 minutes</div>
      <div className="forecast" role="list" aria-label="Rain forecast for the next 30 minutes">
        {windows.map((w, i) => (
          <div key={w.fromS} role="listitem" aria-label={`${i === 0 ? 'Now' : `In ${i * 5} minutes`}: ${Math.round(w.chance * 100)}% chance of rain`}>
            <i style={{ opacity: 0.15 + 0.85 * w.chance }} />
            <span className="num">{Math.round(w.chance * 100)}%</span>
            <span className="muted">{i === 0 ? 'now' : `+${i * 5}m`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
