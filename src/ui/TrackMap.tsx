import { memo, useMemo } from 'react';
import type { CarState, RaceSim } from '../engine/race.ts';
import { PIT_LANE_OFFSET_M } from '../engine/track.ts';

interface Props {
  sim: RaceSim;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 0..1 fraction of the way through the current sim step, for smooth motion. */
  alpha: number;
  showAllLabels: boolean;
  /** Changes every render tick so the markers update. */
  frame: number;
  /** Cars the story on screen is about: ringed, and linked when there are two. */
  spotlight?: readonly string[];
}

/** Black or white, whichever reads better on a team colour. */
export function inkFor(hex: string): string {
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

/** Teams in grid order, which is also their order of garages along the pit lane. */
function garageOrder(sim: RaceSim): string[] {
  return [...new Set(sim.cars.map((c) => c.team.id))];
}

/** Static layer: asphalt, DRS zones, pit lane and garages, start line, corner numbers. */
const TrackLayer = memo(function TrackLayer({ sim }: { sim: RaceSim }) {
  const t = sim.track;
  const geo = useMemo(() => {
    const w = t.bounds.maxX - t.bounds.minX;
    const h = t.bounds.maxY - t.bounds.minY;
    const size = Math.max(w, h);
    // About 16 m of asphalt at a typical circuit's size, so chicanes still read as two corners.
    const road = Math.max(14, size * 0.011);
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
      const off = size * 0.03;
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
      pit: t.pitLanePath(),
      garages: garageOrder(sim).map((id, slot, all) => {
        const p = t.pitLanePoint(t.garageU(slot, all.length));
        const team = sim.cars.find((c) => c.team.id === id)!.team;
        const out = (PIT_LANE_OFFSET_M * 0.55) * t.outside;
        return {
          id,
          colour: team.colors.primary,
          x: p.x + Math.sin(p.heading) * out,
          y: p.y - Math.cos(p.heading) * out,
          angle: (p.heading * 180) / Math.PI,
        };
      }),
      d: t.svgPath(1),
    };
  }, [t, sim]);

  return (
    <g>
      <path d={geo.d} fill="none" stroke="#05070b" strokeWidth={geo.road * 1.5} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke="#3b4358" strokeWidth={geo.road} strokeLinejoin="round" />
      {geo.drs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#2fd27a" strokeOpacity={0.55} strokeWidth={geo.road * 0.35} strokeLinecap="round" />
      ))}
      <path d={geo.pit} fill="none" stroke="#05070b" strokeWidth={geo.road * 0.95} strokeLinecap="round" />
      <path d={geo.pit} fill="none" stroke="#2c3345" strokeWidth={geo.road * 0.6} strokeLinecap="round" />
      {geo.garages.map((g) => (
        <rect
          key={g.id}
          x={-geo.road * 0.6}
          y={-geo.road * 0.7}
          width={geo.road * 1.2}
          height={geo.road * 1.4}
          rx={geo.road * 0.12}
          fill={g.colour}
          fillOpacity={0.8}
          stroke="#05070b"
          strokeWidth={geo.road * 0.1}
          transform={`translate(${g.x.toFixed(1)} ${g.y.toFixed(1)}) rotate(${g.angle.toFixed(1)})`}
        />
      ))}
      {geo.sectors.map((l, i) => (
        <line key={i} {...l} stroke="#ffd75e" strokeOpacity={0.7} strokeWidth={geo.road * 0.12} />
      ))}
      <line {...geo.start} stroke="#fff" strokeWidth={geo.road * 0.3} strokeDasharray={`${geo.road * 0.3} ${geo.road * 0.3}`} />
      {geo.corners.map((c) => (
        <text key={c.n} x={c.x} y={c.y} fontSize={geo.size * 0.022} fill="#7d87a0" textAnchor="middle" dominantBaseline="central">
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
  spot,
  label,
  onSelect,
}: {
  car: CarState;
  position: number;
  x: number;
  y: number;
  r: number;
  selected: boolean;
  spot: boolean;
  label: boolean;
  onSelect: (id: string) => void;
}) {
  const pitting = car.status === 'pitLane';
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} onClick={() => onSelect(car.id)} style={{ cursor: 'pointer' }}>
      {selected && <circle r={r * 2.1} fill="none" stroke="#fff" strokeWidth={r * 0.28} />}
      {spot && <circle r={r * 2.7} fill="none" stroke="#e6e9f0" strokeWidth={r * 0.2} strokeDasharray={`${r * 0.7} ${r * 0.5}`} />}
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

export function TrackMap({ sim, selectedId, onSelect, alpha, showAllLabels, spotlight = [] }: Props) {
  const t = sim.track;
  const pad = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxY - t.bounds.minY) * 0.08;
  const vb = `${(t.bounds.minX - pad).toFixed(0)} ${(t.bounds.minY - pad).toFixed(0)} ${(t.bounds.maxX - t.bounds.minX + pad * 2).toFixed(0)} ${(t.bounds.maxY - t.bounds.minY + pad * 2).toFixed(0)}`;
  const size = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxY - t.bounds.minY);
  const r = size * 0.015;

  const order = sim.standings();
  const garages = garageOrder(sim);
  const leader = order[0];
  // Draw selected and player cars last so they stay on top.
  const draw = [...sim.cars]
    .filter((c) => c.status !== 'out')
    .sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer) || Number(a.id === selectedId) - Number(b.id === selectedId));

  const placed = draw.map((car) => {
    const dist = interp(car.prevDist, car.dist, sim.phase === 'racing' ? alpha : 1);
    const lat = interp(car.prevLat, car.lat, sim.phase === 'racing' ? alpha : 1);
    if (car.status === 'pitLane' && car.pit) {
      // On the pit lane: drawn travelling to the team's own garage, not on the racing line.
      const slot = garages.indexOf(car.team.id);
      const p = t.pitLanePoint(t.pitDisplayU(dist - car.pit.boxDist, t.garageU(slot, garages.length)));
      return { car, x: p.x, y: p.y };
    }
    const p = t.pointAt(dist);
    return { car, x: p.x + Math.sin(p.heading) * lat * (size * 0.0012), y: p.y - Math.cos(p.heading) * lat * (size * 0.0012) };
  });
  const ends = spotlight.length === 2 ? spotlight.map((id) => placed.find((p) => p.car.id === id)) : [];
  const link = ends[0] && ends[1] ? ([ends[0], ends[1]] as const) : null;

  const scDist = sim.safetyCarDist();
  const sc = scDist !== null ? t.pointAt(scDist) : null;

  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Live map of ${t.def.name}`}>
      <TrackLayer sim={sim} />
      {sim.rain > 0 && (
        <rect x={t.bounds.minX - pad} y={t.bounds.minY - pad} width={t.bounds.maxX - t.bounds.minX + pad * 2} height={t.bounds.maxY - t.bounds.minY + pad * 2} fill="#3b8bff" opacity={0.05 + 0.12 * sim.rain} pointerEvents="none" />
      )}
      {link && (
        <line x1={link[0].x} y1={link[0].y} x2={link[1].x} y2={link[1].y} stroke="#e6e9f0" strokeWidth={r * 0.18} strokeDasharray={`${r * 0.5} ${r * 0.4}`} />
      )}
      {placed.map(({ car, x, y }) => (
        <Marker
          key={car.id}
          car={car}
          position={order.indexOf(car) + 1}
          x={x}
          y={y}
          r={r}
          selected={car.id === selectedId}
          spot={spotlight.includes(car.id)}
          label={showAllLabels || car.isPlayer || car.id === selectedId || car === leader}
          onSelect={onSelect}
        />
      ))}
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
