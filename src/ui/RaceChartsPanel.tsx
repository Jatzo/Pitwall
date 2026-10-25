import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { CLIFF_START } from '../engine/tyres.ts';
import type { ChartLap, ChartSeries, RaceCharts } from './raceCharts.ts';

const HEIGHT = 200;
const M = { top: 14, right: 44, bottom: 26, left: 54 };

/** Lap time as m:ss.s, short enough for an axis. */
function shortLap(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}
const pct = (w: number) => `${Math.round(w * 100)}%`;

/** Evenly spaced round values covering the domain, about four of them. */
function ticks(lo: number, hi: number): number[] {
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60];
  const step = steps.find((s) => (hi - lo) / s <= 5) ?? 60;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

interface ChartProps {
  title: string;
  series: ChartSeries[];
  totalLaps: number;
  value: (l: ChartLap) => number;
  domain: [number, number];
  format: (v: number) => string;
  safetyCarLaps: number[];
  /** A labelled reference value, such as the tyre cliff. */
  reference?: { value: number; label: string };
}

function LineChart({ title, series, totalLaps, value, domain, format, safetyCarLaps, reference }: ChartProps) {
  const [ref, width] = useWidth();
  const [hoverLap, setHoverLap] = useState<number | null>(null);
  const [lo, hi] = domain;
  const plotW = Math.max(10, width - M.left - M.right);
  const x = (lap: number) => M.left + ((lap - 1) / Math.max(1, totalLaps - 1)) * plotW;
  // Values past the top of the scale are pinned to it; the readout gives the real value.
  const y = (v: number) => M.top + (1 - (Math.min(v, hi) - lo) / (hi - lo)) * (HEIGHT - M.top - M.bottom);
  const lapTicks = [1, ...Array.from({ length: Math.floor(totalLaps / 5) }, (_, i) => (i + 1) * 5).filter((n) => n > 1)];

  // End labels in value order, nudged apart so two codes never overlap.
  const ends = series
    .filter((s) => s.laps.length > 0)
    .map((s) => ({ s, y: y(value(s.laps[s.laps.length - 1])), x: x(s.laps[s.laps.length - 1].lap) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;

  // Runs of consecutive safety-car laps, drawn as one band each.
  const bands: [number, number][] = [];
  for (const lap of safetyCarLaps) {
    const last = bands[bands.length - 1];
    if (last && lap === last[1] + 1) last[1] = lap;
    else bands.push([lap, lap]);
  }
  const lapW = plotW / Math.max(1, totalLaps - 1);

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const lap = Math.round(((e.clientX - box.left - M.left) / plotW) * (totalLaps - 1)) + 1;
    setHoverLap(lap >= 1 && lap <= totalLaps ? lap : null);
  };
  const readout = hoverLap === null ? [] : series.map((s) => ({ s, lap: s.laps.find((l) => l.lap === hoverLap) })).filter((r) => r.lap);

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <h4 className="hq-h4">{title}</h4>
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.carId}>
              <i style={{ background: `var(--viz-${s.slot})` }} />
              {s.code}
              <span className="muted"> {s.mine ? (s.won ? 'your car, winner' : 'your car') : 'winner'}</span>
            </li>
          ))}
        </ul>
      </figcaption>
      <div className="chart-plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`${title} by lap. The table below gives every value.`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverLap(null)}>
            {bands.map(([a, b]) => (
              <g key={a}>
                <rect className="chart-sc" x={x(a) - lapW / 2} y={M.top} width={(b - a + 1) * lapW} height={HEIGHT - M.top - M.bottom} />
                <text className="chart-axis" x={x(a) - lapW / 2 + 3} y={M.top + 10}>SC</text>
              </g>
            ))}
            {ticks(lo, hi).map((v) => (
              <g key={v}>
                <line className="chart-grid" x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} />
                <text className="chart-axis num" x={M.left - 6} y={y(v) + 4} textAnchor="end">{format(v)}</text>
              </g>
            ))}
            {lapTicks.map((lap) => (
              <text key={lap} className="chart-axis num" x={x(lap)} y={HEIGHT - 8} textAnchor="middle">{lap}</text>
            ))}
            {reference && (
              <g>
                <line className="chart-ref" x1={M.left} x2={M.left + plotW} y1={y(reference.value)} y2={y(reference.value)} />
                <text className="chart-axis" x={M.left + plotW} y={y(reference.value) - 4} textAnchor="end">{reference.label}</text>
              </g>
            )}
            {series.map((s) => (
              <g key={s.carId} style={{ color: `var(--viz-${s.slot})` }}>
                <polyline className="chart-line" points={s.laps.map((l) => `${x(l.lap)},${y(value(l))}`).join(' ')} />
                {/* The in-lap and the out-lap both count as pit laps, so one dot marks each stop, on its first lap. */}
                {s.laps.filter((l, i) => l.pit && !s.laps[i - 1]?.pit).map((l) => (
                  <circle key={l.lap} className="chart-dot" cx={x(l.lap)} cy={y(value(l))} r={4} />
                ))}
              </g>
            ))}
            {ends.map(({ s, x: ex, y: ey }) => (
              <text key={s.carId} className="chart-end" x={ex + 6} y={ey + 4}>{s.code}</text>
            ))}
            {hoverLap !== null && <line className="chart-cross" x1={x(hoverLap)} x2={x(hoverLap)} y1={M.top} y2={HEIGHT - M.bottom} />}
          </svg>
        )}
        {hoverLap !== null && readout.length > 0 && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(0, x(hoverLap) - 70), Math.max(0, width - 150)) }}>
            <b>Lap {hoverLap}</b>
            {readout.map(({ s, lap }) => (
              <div key={s.carId}>
                <i style={{ background: `var(--viz-${s.slot})` }} />
                {s.code} <span className="num">{format(value(lap!))}</span>
                {lap!.pit && <span className="muted"> pit</span>}
                {lap!.safetyCar && <span className="muted"> SC</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

interface Props {
  charts: RaceCharts;
}

/** Lap times and tyre wear from the race just finished. The race's own laps, so nothing is saved. */
export function RaceChartsPanel({ charts }: Props) {
  const maxWear = Math.max(1, ...charts.wearSeries.flatMap((s) => s.laps.map((l) => l.wear)));
  const wearTop = Math.ceil(maxWear * 10) / 10;
  return (
    <div className="panel">
      <h3>Race charts</h3>
      <div className="grid2">
        <LineChart
          title="Lap times"
          series={charts.lapSeries}
          totalLaps={charts.totalLaps}
          value={(l) => l.time}
          domain={charts.lapDomain}
          format={shortLap}
          safetyCarLaps={charts.safetyCarLaps}
        />
        <LineChart
          title="Tyre wear"
          series={charts.wearSeries}
          totalLaps={charts.totalLaps}
          value={(l) => l.wear}
          domain={[0, wearTop]}
          format={pct}
          safetyCarLaps={charts.safetyCarLaps}
          reference={{ value: CLIFF_START, label: `Cliff ${pct(CLIFF_START)}` }}
        />
      </div>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        Dots mark pit stops. Pit laps, the opening lap and laps behind the safety car sit at the top of the lap-time scale; point at a lap for its time.
      </p>
      <details className="chart-table">
        <summary>Lap by lap</summary>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Lap</th>
                {charts.lapSeries.map((s) => <th key={s.carId} className="r">{s.code} time</th>)}
                {charts.wearSeries.map((s) => <th key={s.carId} className="r">{s.code} wear</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: charts.totalLaps }, (_, i) => i + 1).map((lap) => (
                <tr key={lap}>
                  <td className="num">{lap}</td>
                  {charts.lapSeries.map((s) => {
                    const l = s.laps.find((x) => x.lap === lap);
                    return <td key={s.carId} className="r num">{l ? `${shortLap(l.time)}${l.pit ? ' pit' : ''}${l.safetyCar ? ' SC' : ''}` : ''}</td>;
                  })}
                  {charts.wearSeries.map((s) => {
                    const l = s.laps.find((x) => x.lap === lap);
                    return <td key={s.carId} className="r num">{l ? pct(l.wear) : ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
