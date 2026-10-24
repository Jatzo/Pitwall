import { memo, useMemo } from 'react';
import type { CarState, RaceSim } from '../engine/race.ts';
import { hashString } from '../engine/rng.ts';
import { PIT_LANE_OFFSET_M } from '../engine/track.ts';
import { CIRCUIT, LOOKS, settingFor } from './circuitLook.ts';
import { carPose } from './markers.ts';
import type { Pose } from './markers.ts';
import { buildScenery } from './scenery.ts';
import type { Area, Dot, Pt } from './scenery.ts';

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

/** Teams in grid order, which is also their order of garages along the pit lane. */
function garageOrder(sim: RaceSim): string[] {
  return [...new Set(sim.cars.map((c) => c.team.id))];
}

function f(n: number): string {
  return n.toFixed(1);
}

/** Open or closed outlines joined into one path. */
function pathOf(shapes: readonly (readonly Pt[])[], close: boolean): string {
  let d = '';
  for (const points of shapes) {
    points.forEach(([x, y], i) => {
      d += `${i ? 'L' : 'M'}${f(x)},${f(y)}`;
    });
    if (close) d += 'Z';
  }
  return d;
}

/** Circles joined into one path, so a forest is a handful of elements rather than thousands. */
function dotsPath(dots: readonly Dot[]): string {
  let d = '';
  for (const { x, y, r } of dots) d += `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0`;
  return d;
}

/**
 * The static map: the setting, run-off, kerbs, road, pit lane, garages and
 * corner tags. It renders once per race in its own SVG under the cars, so a
 * frame repaints only the car layer.
 */
const Ground = memo(function Ground({ sim, viewBox }: { sim: RaceSim; viewBox: string }) {
  const t = sim.track;
  const geo = useMemo(() => {
    const setting = settingFor(t.def.id);
    const look = LOOKS[setting];
    const sc = buildScenery(t, setting, hashString(t.def.id));
    const road = sc.half * 2;
    const e = sc.extent;
    const cx = (e.minX + e.maxX) / 2;
    const cy = (e.minY + e.maxY) / 2;
    const reach = Math.hypot(e.maxX - e.minX, e.maxY - e.minY) / 2;
    const stripes: number[] = [];
    if (look.stripe) for (let x = cx - reach; x < cx + reach; x += 120) stripes.push(x);
    const drs = t.drsZones.map((z) => {
      let d = '';
      const len = z.start <= z.end ? z.end - z.start : t.length - z.start + z.end;
      for (let s = 0; s <= len; s += 15) {
        const p = t.pointAt(z.start + s);
        d += `${s === 0 ? 'M' : 'L'}${f(p.x)},${f(p.y)}`;
      }
      return d;
    });
    const line = (s: number, half: number) => {
      const p = t.pointAt(s);
      const dx = Math.sin(p.heading) * half;
      const dy = -Math.cos(p.heading) * half;
      return { x1: p.x - dx, y1: p.y - dy, x2: p.x + dx, y2: p.y + dy };
    };
    const areas = (kind: Area['kind']) => sc.areas.filter((a) => a.kind === kind);
    const toned = <T extends { tone?: number }>(items: readonly T[], colours: readonly string[]) =>
      colours.map((colour, i) => ({ colour, items: items.filter((it) => (it.tone ?? 0) % colours.length === i) }));
    return {
      look,
      sc,
      road,
      tilt: (t.pointAt(0).heading * 180) / Math.PI,
      centre: { cx, cy, reach },
      stripes,
      gravel: pathOf(areas('gravel').map((a) => a.points), true),
      runoff: pathOf(areas('runoff').map((a) => a.points), true),
      blocks: toned(areas('block'), look.blocks).map((g) => ({ colour: g.colour, d: pathOf(g.items.map((a) => a.points), true) })),
      stands: pathOf(areas('stand').map((a) => a.points), true),
      rows: pathOf(areas('stand').flatMap((a) => a.rows ?? []), false),
      building: pathOf(areas('building').map((a) => a.points), true),
      barriers: pathOf(sc.lines.filter((l) => l.kind === 'barrier').map((l) => l.points), false),
      kerbs: pathOf(sc.lines.filter((l) => l.kind === 'kerb').map((l) => l.points), false),
      trees: toned(sc.dots.filter((d) => d.kind === 'tree'), look.trees).map((g) => ({ colour: g.colour, d: dotsPath(g.items) })),
      rocks: toned(sc.dots.filter((d) => d.kind === 'rock'), look.rocks).map((g) => ({ colour: g.colour, d: dotsPath(g.items) })),
      drs,
      start: line(0, road * 0.5),
      sectors: t.sectorLines.map((s) => line(s, road * 0.5)),
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
  const { look, sc, road, centre } = geo;
  const e = sc.extent;
  const fill = (kind: 'water' | 'shore' | 'patch') => (kind === 'water' ? look.water : kind === 'shore' ? look.shore : look.patch);

  return (
    <svg className="map-ground" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={e.minX} y={e.minY} width={e.maxX - e.minX} height={e.maxY - e.minY} fill={look.ground} />
      {geo.stripes.length > 0 && (
        <g transform={`rotate(${f(geo.tilt)} ${f(centre.cx)} ${f(centre.cy)})`}>
          {geo.stripes.map((x) => (
            <rect key={x} x={x} y={centre.cy - centre.reach} width={60} height={centre.reach * 2} fill={look.stripe} />
          ))}
        </g>
      )}
      {sc.fills.map((fl, i) => (
        <path key={i} d={pathOf([fl.points], true)} fill={fill(fl.kind)} />
      ))}
      <path d={geo.runoff} fill={CIRCUIT.runoff} />
      <path d={geo.gravel} fill={CIRCUIT.gravel} />
      {geo.blocks.map((g) => (
        <path key={g.colour} d={g.d} fill={g.colour} />
      ))}
      {geo.rocks.map((g) => (
        <path key={g.colour} d={g.d} fill={g.colour} />
      ))}
      {geo.trees.map((g) => (
        <path key={g.colour} d={g.d} fill={g.colour} />
      ))}
      <path d={geo.building} fill={CIRCUIT.building} />
      <path d={geo.stands} fill={CIRCUIT.stand} />
      <path d={geo.rows} fill="none" stroke={CIRCUIT.standRow} strokeWidth={2} />
      <path d={geo.barriers} fill="none" stroke={CIRCUIT.barrier} strokeWidth={1.5} />

      <path d={geo.d} fill="none" stroke={CIRCUIT.edge} strokeWidth={road} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke={CIRCUIT.asphalt} strokeWidth={road - 2} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke={CIRCUIT.racingLine} strokeWidth={road * 0.3} strokeLinejoin="round" />
      <path d={geo.kerbs} fill="none" stroke={CIRCUIT.kerbWhite} strokeWidth={3} />
      <path d={geo.kerbs} fill="none" stroke={CIRCUIT.kerbRed} strokeWidth={3} strokeDasharray="5 5" />
      {geo.drs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={CIRCUIT.drs} strokeOpacity={0.55} strokeWidth={road * 0.25} strokeLinecap="round" />
      ))}
      <path d={geo.pit} fill="none" stroke={CIRCUIT.edge} strokeWidth={road * 0.6 + 2} strokeLinecap="round" />
      <path d={geo.pit} fill="none" stroke={CIRCUIT.pitAsphalt} strokeWidth={road * 0.6} strokeLinecap="round" />
      {geo.garages.map((g) => (
        <rect
          key={g.id}
          x={-road * 0.6}
          y={-road * 0.7}
          width={road * 1.2}
          height={road * 1.4}
          fill={g.colour}
          stroke={CIRCUIT.tag}
          strokeWidth={road * 0.1}
          transform={`translate(${f(g.x)} ${f(g.y)}) rotate(${f(g.angle)})`}
        />
      ))}
      {geo.sectors.map((l, i) => (
        <line key={i} {...l} stroke={CIRCUIT.sectorLine} strokeOpacity={0.7} strokeWidth={road * 0.12} />
      ))}
      <line {...geo.start} stroke={CIRCUIT.edge} strokeWidth={road * 0.3} />
      <line {...geo.start} stroke={CIRCUIT.tag} strokeWidth={road * 0.3} strokeDasharray={`${road * 0.15} ${road * 0.15}`} />
      {sc.tags.map((g) => (
        <g key={g.n} transform={`translate(${f(g.x)} ${f(g.y)})`}>
          <rect x={-g.w / 2} y={-g.h / 2} width={g.w} height={g.h} fill={CIRCUIT.tag} fillOpacity={0.85} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={g.h * 0.72} fill={CIRCUIT.tagText}>
            {g.n}
          </text>
        </g>
      ))}
    </svg>
  );
});

/** An arrow in team colours pointing the way the car travels, with its place on a tag beside it. */
function Marker({
  car,
  position,
  pose,
  r,
  selected,
  spot,
  label,
  onSelect,
}: {
  car: CarState;
  position: number;
  pose: Pose;
  r: number;
  selected: boolean;
  spot: boolean;
  label: boolean;
  onSelect: (id: string) => void;
}) {
  const pitting = car.status === 'pitLane';
  const tagW = r * (position >= 10 ? 2.6 : 1.9);
  const tagH = r * 1.75;
  const tag = { x: r * 2.2, y: -r * 2.1 };
  return (
    <g transform={`translate(${f(pose.x)} ${f(pose.y)})`} onClick={() => onSelect(car.id)} style={{ cursor: 'pointer' }}>
      {selected && <circle r={r * 2.6} fill="none" stroke="#fff" strokeWidth={r * 0.28} />}
      {spot && <circle r={r * 3.2} fill="none" stroke="#e6e9f0" strokeWidth={r * 0.2} strokeDasharray={`${r * 0.7} ${r * 0.5}`} />}
      {car.isPlayer && <circle r={r * 2} fill="none" stroke={car.team.colors.secondary} strokeWidth={r * 0.3} />}
      <g transform={`rotate(${f((pose.heading * 180) / Math.PI)})`}>
        {/* A dark outline keeps the arrow readable on grass, gravel, water and asphalt alike. */}
        <path
          d={`M${f(r * 2)},0L${f(-r * 1.4)},${f(-r * 1.15)}L${f(-r * 0.75)},0L${f(-r * 1.4)},${f(r * 1.15)}Z`}
          fill={car.team.colors.primary}
          stroke={pitting ? '#fff' : CIRCUIT.tag}
          strokeWidth={r * 0.24}
          strokeLinejoin="round"
        />
        <path d={`M${f(r * 1.2)},0L${f(-r * 0.5)},${f(-r * 0.42)}L${f(-r * 0.5)},${f(r * 0.42)}Z`} fill={car.team.colors.secondary} />
      </g>
      <g transform={`translate(${f(tag.x)} ${f(tag.y)})`} style={{ pointerEvents: 'none' }}>
        <rect x={-tagW / 2} y={-tagH / 2} width={tagW} height={tagH} fill={CIRCUIT.tag} fillOpacity={0.85} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.4} fontWeight={800} fill={CIRCUIT.tagText}>
          {position}
        </text>
        {car.drsOn && <rect x={-tagW / 2} y={tagH / 2} width={tagW} height={r * 0.4} fill={CIRCUIT.drs} />}
      </g>
      {label && (
        <text
          x={tag.x + tagW / 2 + r * 0.4}
          y={tag.y}
          dominantBaseline="central"
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

  const placed = draw.map((car) => ({ car, ...carPose(sim, car, alpha, garages) }));
  const ends = spotlight.length === 2 ? spotlight.map((id) => placed.find((p) => p.car.id === id)) : [];
  const link = ends[0] && ends[1] ? ([ends[0], ends[1]] as const) : null;

  const scDist = sim.safetyCarDist();
  const sc = scDist !== null ? t.pointAt(scDist) : null;

  return (
    <div className="map-stack">
      <Ground sim={sim} viewBox={vb} />
      <svg className="map-cars" viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Live map of ${t.def.name}`}>
        {sim.rain > 0 && (
          // Wider than the circuit, since the scenery fills the whole map whatever its shape.
          <rect x={t.bounds.minX - size} y={t.bounds.minY - size} width={t.bounds.maxX - t.bounds.minX + size * 2} height={t.bounds.maxY - t.bounds.minY + size * 2} fill="#3b8bff" opacity={0.05 + 0.12 * sim.rain} pointerEvents="none" />
        )}
        {link && (
          <line x1={link[0].x} y1={link[0].y} x2={link[1].x} y2={link[1].y} stroke="#e6e9f0" strokeWidth={r * 0.18} strokeDasharray={`${r * 0.5} ${r * 0.4}`} />
        )}
        {placed.map(({ car, ...pose }) => (
          <Marker
            key={car.id}
            car={car}
            position={order.indexOf(car) + 1}
            pose={pose}
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
    </div>
  );
}
