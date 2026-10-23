import { memo, useMemo } from 'react';
import type { CarState, RaceSim } from '../engine/race.ts';

interface Props {
  sim: RaceSim;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 0..1 fraction of the way through the current sim step, for smooth motion. */
  alpha: number;
  showAllLabels: boolean;
  /** Changes every render tick so the markers update. */
  frame: number;
}

/** Black or white, whichever reads better on a team colour. */
function inkFor(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return '#fff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against black beats contrast against white above about 0.18.
  return luminance > 0.18 ? '#0b0d12' : '#fff';
}

function interp(prev: number, cur: number, alpha: number): number {
  return prev + (cur - prev) * alpha;
}

/** Static layer: asphalt, DRS zones, pit lane, start line, corner numbers. */
const TrackLayer = memo(function TrackLayer({ sim }: { sim: RaceSim }) {
  const t = sim.track;
  const geo = useMemo(() => {
    const w = t.bounds.maxX - t.bounds.minX;
    const h = t.bounds.maxY - t.bounds.minY;
    const size = Math.max(w, h);
    const road = size * 0.026;
    const drs = t.drsZones.map((z) => {
      let d = '';
      const len = z.start <= z.end ? z.end - z.start : t.length - z.start + z.end;
      for (let s = 0; s <= len; s += 15) {
        const p = t.pointAt(z.start + s);
        d += `${s === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }
      return d;
    });
    const line = (s: number, half: number) => {
      const p = t.pointAt(s);
      const dx = Math.sin(p.heading) * half;
      const dy = -Math.cos(p.heading) * half;
      return { x1: p.x - dx, y1: p.y - dy, x2: p.x + dx, y2: p.y + dy };
    };
    const corners = t.corners.map((c) => {
      const p = t.pointAt(c.s);
      const off = road * 1.9;
      // Put the number on the outside of the bend, so it never sits on the road.
      const ahead = t.pointAt(c.s + 40);
      let turn = ahead.heading - p.heading;
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      const side = turn >= 0 ? -1 : 1;
      return {
        n: c.number,
        x: p.x + Math.sin(p.heading) * off * side,
        y: p.y - Math.cos(p.heading) * off * side,
      };
    });
    return {
      size,
      road,
      drs,
      start: line(0, road * 0.9),
      sectors: t.sectorLines.map((s) => line(s, road * 0.9)),
      corners,
      pit: t.pitLanePath(road * 1.7),
      d: t.svgPath(2),
    };
  }, [t]);

  return (
    <g>
      <path d={geo.d} fill="none" stroke="#05070b" strokeWidth={geo.road * 1.5} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke="#3b4358" strokeWidth={geo.road} strokeLinejoin="round" />
      {geo.drs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#2fd27a" strokeOpacity={0.55} strokeWidth={geo.road * 0.35} strokeLinecap="round" />
      ))}
      <path d={geo.pit} fill="none" stroke="#2a3040" strokeWidth={geo.road * 0.55} strokeLinecap="round" />
      {geo.sectors.map((l, i) => (
        <line key={i} {...l} stroke="#ffd75e" strokeOpacity={0.7} strokeWidth={geo.road * 0.12} />
      ))}
      <line {...geo.start} stroke="#fff" strokeWidth={geo.road * 0.3} strokeDasharray={`${geo.road * 0.3} ${geo.road * 0.3}`} />
      {geo.corners.map((c) => (
        <text key={c.n} x={c.x} y={c.y} fontSize={geo.road * 0.95} fill="#6d7790" textAnchor="middle" dominantBaseline="central">
          {c.n}
        </text>
      ))}
    </g>
  );
});

function Marker({
  car,
  position,
  x,
  y,
  r,
  selected,
  label,
  onSelect,
}: {
  car: CarState;
  position: number;
  x: number;
  y: number;
  r: number;
  selected: boolean;
  label: boolean;
  onSelect: (id: string) => void;
}) {
  const pitting = car.status === 'pitLane';
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} onClick={() => onSelect(car.id)} style={{ cursor: 'pointer' }}>
      {selected && <circle r={r * 2.1} fill="none" stroke="#fff" strokeWidth={r * 0.28} />}
      {car.isPlayer && <circle r={r * 1.45} fill="none" stroke={car.team.colors.secondary} strokeWidth={r * 0.3} />}
      <circle r={r} fill={car.team.colors.primary} stroke={pitting ? '#fff' : '#0b0d12'} strokeWidth={r * 0.28} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={r * (position >= 10 ? 1.05 : 1.25)}
        fontWeight={800}
        fill={inkFor(car.team.colors.primary)}
        style={{ pointerEvents: 'none' }}
      >
        {position}
      </text>
      {car.drsOn && <circle cx={r * 0.85} cy={-r * 0.85} r={r * 0.32} fill="#2fd27a" stroke="#0b0d12" strokeWidth={r * 0.1} />}
      {label && (
        <text
          x={r * 1.8}
          y={-r * 1.2}
          fontSize={r * 1.7}
          fontWeight={700}
          fill="#e6e9f0"
          stroke="#0b0d12"
          strokeWidth={r * 0.45}
          paintOrder="stroke"
          style={{ pointerEvents: 'none' }}
        >
          {car.driver.code}
        </text>
      )}
    </g>
  );
}

export function TrackMap({ sim, selectedId, onSelect, alpha, showAllLabels }: Props) {
  const t = sim.track;
  const pad = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxY - t.bounds.minY) * 0.08;
  const vb = `${(t.bounds.minX - pad).toFixed(0)} ${(t.bounds.minY - pad).toFixed(0)} ${(t.bounds.maxX - t.bounds.minX + pad * 2).toFixed(0)} ${(t.bounds.maxY - t.bounds.minY + pad * 2).toFixed(0)}`;
  const size = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxY - t.bounds.minY);
  const r = size * 0.015;

  const order = sim.standings();
  const leader = order[0];
  // Draw selected and player cars last so they stay on top.
  const draw = [...sim.cars]
    .filter((c) => c.status !== 'out')
    .sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer) || Number(a.id === selectedId) - Number(b.id === selectedId));

  const scDist = sim.safetyCarDist();
  const sc = scDist !== null ? t.pointAt(scDist) : null;

  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Live map of ${t.def.name}`}>
      <TrackLayer sim={sim} />
      {draw.map((car) => {
        const dist = interp(car.prevDist, car.dist, sim.phase === 'racing' ? alpha : 1);
        const lat = interp(car.prevLat, car.lat, sim.phase === 'racing' ? alpha : 1);
        const p = t.pointAt(dist);
        const x = p.x + Math.sin(p.heading) * lat * (size * 0.0012);
        const y = p.y - Math.cos(p.heading) * lat * (size * 0.0012);
        const label = showAllLabels || car.isPlayer || car.id === selectedId || car === leader;
        return (
          <Marker key={car.id} car={car} position={order.indexOf(car) + 1} x={x} y={y} r={r} selected={car.id === selectedId} label={label} onSelect={onSelect} />
        );
      })}
      {sc && (
        <g transform={`translate(${sc.x.toFixed(1)} ${sc.y.toFixed(1)})`}>
          <rect x={-r * 1.6} y={-r * 1.1} width={r * 3.2} height={r * 2.2} rx={r * 0.4} fill="#ffb020" stroke="#0b0d12" strokeWidth={r * 0.25} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.3} fontWeight={800} fill="#111">
            SC
          </text>
        </g>
      )}
    </svg>
  );
}
