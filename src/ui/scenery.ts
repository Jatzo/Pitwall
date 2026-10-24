import { buildCircuit } from '../engine/circuitBuilder.ts';
import type { LayoutCorner } from '../engine/circuitBuilder.ts';
import { Rng } from '../engine/rng.ts';
import type { Track } from '../engine/track.ts';
import type { Setting } from './circuitLook.ts';

/**
 * The scenery around a circuit, made from the circuit's own geometry so every
 * layout gets kerbs, run-off, stands and its setting without hand drawing.
 * Everything is in track metres. Each kind of shape has a band of distance
 * from the track it must sit in; a shape that breaks its band is dropped, never
 * moved, so nothing generated can cover the road or the pit lane.
 */

export type Pt = readonly [number, number];
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Area {
  kind: 'gravel' | 'runoff' | 'stand' | 'building' | 'block';
  points: Pt[];
  /** Index into buildCircuit(layout).corners, for run-off. */
  corner?: number;
  /** Seat rows across a grandstand. */
  rows?: Pt[][];
  tone?: number;
}
export interface Line {
  kind: 'kerb' | 'barrier';
  points: Pt[];
  width: number;
}
export interface Dot {
  kind: 'tree' | 'rock';
  x: number;
  y: number;
  r: number;
  tone: number;
}
/** Background fills drawn under everything, exempt from the distance bands. */
export interface Fill {
  kind: 'water' | 'shore' | 'patch';
  points: Pt[];
}
export interface Tag {
  n: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Scenery {
  /** Drawn half-width of the road. */
  half: number;
  /** The area the scenery covers, wider than the circuit so it fills any map shape. */
  extent: Box;
  fills: Fill[];
  areas: Area[];
  lines: Line[];
  dots: Dot[];
  tags: Tag[];
}

/** How much of what each setting grows or builds, per square kilometre. */
const MAKEUP: Record<Setting, { clumps: number; trees: number; rocks: number; patches: number; water: boolean; street: boolean }> = {
  countryside: { clumps: 20, trees: 6, rocks: 0, patches: 0, water: false, street: false },
  parkland: { clumps: 3, trees: 40, rocks: 0, patches: 0, water: false, street: false },
  moorland: { clumps: 0, trees: 5, rocks: 22, patches: 1.5, water: false, street: false },
  forest: { clumps: 0, trees: 150, rocks: 0, patches: 0, water: false, street: false },
  mountain: { clumps: 6, trees: 30, rocks: 30, patches: 1.2, water: false, street: false },
  coastal: { clumps: 4, trees: 8, rocks: 0, patches: 0, water: true, street: false },
  street: { clumps: 0, trees: 0, rocks: 0, patches: 0, water: true, street: true },
};
const MAX_DOTS = 4000;
/** Metres between grandstands. */
const STAND_GAP = 200;

/** Nearest-point lookups against a fixed set of points, on a grid. */
class Near {
  private readonly grid = new Map<number, number[]>();
  private readonly cell: number;

  constructor(points: readonly Pt[], cell = 40) {
    this.cell = cell;
    for (const [x, y] of points) {
      const k = this.key(Math.floor(x / cell), Math.floor(y / cell));
      const list = this.grid.get(k);
      if (list) list.push(x, y);
      else this.grid.set(k, [x, y]);
    }
  }

  private key(ix: number, iy: number): number {
    return (ix + 50000) * 100000 + (iy + 50000);
  }

  /** Distance to the nearest point, or `limit` when none is that close. */
  dist(x: number, y: number, limit: number): number {
    const r = Math.ceil(limit / this.cell);
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best = limit * limit;
    for (let i = cx - r; i <= cx + r; i++) {
      for (let j = cy - r; j <= cy + r; j++) {
        const list = this.grid.get(this.key(i, j));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const dx = list[k] - x;
          const dy = list[k + 1] - y;
          best = Math.min(best, dx * dx + dy * dy);
        }
      }
    }
    return Math.sqrt(best);
  }

  /** Whether any of the points lies inside the polygon. */
  within(poly: readonly Pt[]): boolean {
    const b = boxOf(poly);
    for (let i = Math.floor(b.minX / this.cell); i <= Math.floor(b.maxX / this.cell); i++) {
      for (let j = Math.floor(b.minY / this.cell); j <= Math.floor(b.maxY / this.cell); j++) {
        const list = this.grid.get(this.key(i, j));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) if (inside(list[k], list[k + 1], poly)) return true;
      }
    }
    return false;
  }
}

function boxOf(points: readonly Pt[]): Box {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of points) {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

function inside(x: number, y: number, poly: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Points along a closed polygon's edges, every few metres. */
function outline(points: readonly Pt[], every = 4): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / every));
    for (let k = 0; k < steps; k++) out.push([ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps]);
  }
  return out;
}

/**
 * Where a shape may sit, as distances from the track centreline and the pit
 * lane. The bands are the plan's table with half a metre to spare, so a shape
 * that passes here cannot fail a coarser check elsewhere.
 */
interface Band {
  lo: number;
  hi?: number;
  pit?: number;
  laneLo?: number;
  laneHi?: number;
}

class Field {
  readonly road: Near;
  readonly pit: Near;
  readonly water: Pt[][] = [];

  constructor(track: Track) {
    this.road = new Near(Array.from({ length: track.n }, (_, i) => [track.x[i], track.y[i]] as Pt));
    const lane: Pt[] = [];
    for (let u = -track.pitEntryM; u <= track.pitExitM; u += 10) {
      const p = track.pitLanePoint(u);
      lane.push([p.x, p.y]);
    }
    this.pit = new Near(lane);
  }

  /** Whether a point, padded by `pad`, sits inside the band. */
  ok(x: number, y: number, pad: number, b: Band): boolean {
    const limit = (b.hi ?? b.lo) + pad + 10;
    const d = this.road.dist(x, y, limit);
    if (d - pad < b.lo) return false;
    if (b.hi !== undefined && d + pad > b.hi) return false;
    if (b.pit !== undefined && this.pit.dist(x, y, b.pit + pad + 1) - pad < b.pit) return false;
    if (b.laneLo !== undefined) {
      const lane = this.pit.dist(x, y, (b.laneHi ?? b.laneLo) + 10);
      if (lane < b.laneLo || (b.laneHi !== undefined && lane > b.laneHi)) return false;
    }
    return true;
  }

  area(points: readonly Pt[], b: Band): boolean {
    if (this.road.within(points) || this.pit.within(points)) return false;
    return outline(points).every(([x, y]) => this.ok(x, y, 0, b));
  }

  wet(x: number, y: number): boolean {
    return this.water.some((w) => inside(x, y, w));
  }
}

export function buildScenery(track: Track, setting: Setting, seed: number): Scenery {
  const rng = new Rng(seed);
  const field = new Field(track);
  const circuit = buildCircuit(track.def.layout);
  const b = track.bounds;
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  // About 16 m of asphalt at a typical circuit's size, wider than real, so chicanes still read as two corners.
  const R = Math.max(14, size * 0.011) / 2;
  const margin = size * 0.35;
  const extent = { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin };
  const makeup = MAKEUP[setting];

  /** A point `off` metres to the left of the racing direction at distance s. */
  const at = (s: number, off: number): Pt => {
    const p = track.pointAt(s);
    return [p.x + Math.sin(p.heading) * off, p.y - Math.cos(p.heading) * off];
  };
  const strip = (s0: number, s1: number, off: number | ((s: number) => number), step = 4): Pt[] => {
    const out: Pt[] = [];
    for (let s = s0; s < s1 + step / 2; s += step) out.push(at(Math.min(s, s1), typeof off === 'number' ? off : off(s)));
    return out;
  };
  const band = (lo: number, hi?: number, pit?: number): Band => ({ lo: R + lo + 0.5, hi: hi === undefined ? undefined : R + hi - 0.5, pit: pit === undefined ? undefined : pit + 0.5 });

  const fills: Fill[] = [];
  const areas: Area[] = [];
  const lines: Line[] = [];
  const dots: Dot[] = [];

  /** Keep the runs of a line that sit in their band; drop the rest. */
  const keepRuns = (kind: Line['kind'], points: Pt[], width: number, b2: Band) => {
    let run: Pt[] = [];
    const flush = () => {
      if (run.length >= 3) lines.push({ kind, points: run, width });
      run = [];
    };
    for (const p of points) {
      if (field.ok(p[0], p[1], width / 2, b2)) run.push(p);
      else flush();
    }
    flush();
  };

  // 1. Water along the side of the map farthest from the start line, for the coast and the harbour.
  if (makeup.water) {
    const p0 = track.pointAt(0);
    const sides = [
      { side: 'minX', gap: p0.x - b.minX },
      { side: 'maxX', gap: b.maxX - p0.x },
      { side: 'minY', gap: p0.y - b.minY },
      { side: 'maxY', gap: b.maxY - p0.y },
    ].sort((p, q) => q.gap - p.gap);
    const side = sides[0].side;
    const across = side === 'minX' || side === 'maxX';
    const sign = side.startsWith('max') ? 1 : -1;
    const edge = (across ? (sign > 0 ? b.maxX : b.minX) : sign > 0 ? b.maxY : b.minY) + sign * (R + 45);
    const far = across ? (sign > 0 ? extent.maxX : extent.minX) : sign > 0 ? extent.maxY : extent.minY;
    const from = across ? extent.minY : extent.minX;
    const to = across ? extent.maxY : extent.maxX;
    const shoreAt = (v: number, inset: number) => edge + sign * (8 * Math.sin(v / 130) + inset);
    const line = (inset: number): Pt[] => {
      const out: Pt[] = [];
      for (let v = from; v <= to; v += 20) out.push(across ? [shoreAt(v, inset), v] : [v, shoreAt(v, inset)]);
      return out;
    };
    const cap = (pts: Pt[], d: number): Pt[] => {
      const [fx, fy] = pts[0];
      const [lx, ly] = pts[pts.length - 1];
      return across ? [...pts, [d, ly], [d, fy]] : [...pts, [lx, d], [fx, d]];
    };
    const water = cap(line(14), far);
    fills.push({ kind: 'shore', points: cap(line(0), far) }, { kind: 'water', points: water });
    field.water.push(cap(line(-6), far));
  }

  // 2. Heather and bracken on the moor.
  const km2 = ((extent.maxX - extent.minX) * (extent.maxY - extent.minY)) / 1e6;
  for (let i = 0; i < Math.round(makeup.patches * km2); i++) {
    const cx = rng.range(extent.minX, extent.maxX);
    const cy = rng.range(extent.minY, extent.maxY);
    const rx = rng.range(60, 160);
    const ry = rng.range(40, 100);
    const turn = rng.range(0, Math.PI);
    const points: Pt[] = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * 2 * Math.PI;
      const wob = 1 + 0.15 * Math.sin(3 * a + turn);
      const x = Math.cos(a) * rx * wob;
      const y = Math.sin(a) * ry * wob;
      points.push([cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)]);
    }
    fills.push({ kind: 'patch', points });
  }

  // 3. Corners: run-off or barriers on the outside, kerbs at the apex and exit.
  let top = 0;
  for (let i = 0; i < track.n; i++) top = Math.max(top, track.speed[i]);
  circuit.corners.forEach((c: LayoutCorner, index: number) => {
    if (Math.abs(c.angle) < 10) return;
    const v = track.speedAt(c.s);
    const half = ((Math.abs(c.angle) * Math.PI) / 180) * c.radius * 0.5;
    const out = Math.sign(c.angle);
    const slow = v < 0.9 * top;

    if (slow) {
      // Kerbs sit on the road edge, so their band is the edge itself, with the 5 m sample spacing allowed for.
      const kerb = { lo: R - 0.35, hi: R + 3.35 };
      keepRuns('kerb', strip(c.s - half - 8, c.s + half + 8, -out * (R + 1.5), 2), 3, kerb);
      keepRuns('kerb', strip(c.s + half - 10, c.s + half + 40, out * (R + 1.5), 2), 3, kerb);
    }

    if (makeup.street) {
      keepRuns('barrier', strip(c.s - half - 30, c.s + half + 60, out * (R + 4.5), 3), 1.5, band(2, 80, 10));
      return;
    }
    if (!slow) return;
    const s0 = c.s - half - 50;
    const s1 = c.s + half + 70;
    const kind = v < 0.6 * top ? 'gravel' : 'runoff';
    for (const depth of v < 0.45 * top ? [70, 45, 25] : [45, 25]) {
      const bulge = (s: number) => out * (R + 6 + depth * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - s0) / (s1 - s0)))));
      const points = [...strip(s0, s1, out * (R + 4)), ...strip(s0, s1, bulge).reverse()];
      if (field.area(points, band(2, 80, 10))) {
        areas.push({ kind, points, corner: index });
        break;
      }
    }
  });

  // 4. The pit building behind the garages, and grandstands.
  const reachU = Math.min(110, track.pitEntryM - 100, track.pitExitM - 100);
  const behind = (u: number, off: number): Pt => {
    const p = track.pitLanePoint(u);
    return [p.x + Math.sin(p.heading) * off * track.outside, p.y - Math.cos(p.heading) * off * track.outside];
  };
  const building: Pt[] = [];
  for (let u = -reachU; u <= reachU; u += 5) building.push(behind(u, 16));
  for (let u = reachU; u >= -reachU; u -= 5) building.push(behind(u, 44));
  if (field.area(building, { lo: R + 2.5, laneLo: 15.5, laneHi: 44.5 })) areas.push({ kind: 'building', points: building });

  const stand = (s0: number, s1: number, side: number): boolean => {
    const points = [...strip(s0, s1, side * (R + 30), 6), ...strip(s0, s1, side * (R + 52), 6).reverse()];
    if (!field.area(points, band(25, 90, 20))) return false;
    // Slow corners often come in pairs, and two stands side by side read as one block on the map.
    const near = areas.some((o) => o.kind === 'stand' && o.points.some(([x, y]) => points.some(([u, v]) => Math.hypot(x - u, y - v) < STAND_GAP)));
    if (near) return false;
    const rows = [36, 41, 46].map((off) => strip(s0, s1, side * (R + off), 6));
    areas.push({ kind: 'stand', points, rows });
    return true;
  };
  for (const [s0, s1] of [[-150, 110], [-80, 60]]) if (stand(s0, s1, -track.outside)) break;
  // Two more stands, at the slowest corners that have room for one.
  const bySpeed = [...track.corners].sort((p, q) => track.speedAt(p.s) - track.speedAt(q.s));
  let cornerStands = 0;
  for (const nc of bySpeed) {
    if (cornerStands === 2) break;
    const c = matchCorner(circuit.corners, nc.s, track.length);
    const half = ((Math.abs(c.angle) * Math.PI) / 180) * c.radius * 0.5;
    const out = Math.sign(c.angle);
    const tries: [number, number, number][] = [
      [c.s - 60, c.s + 60, -out],
      [c.s - half - 160, c.s - half - 40, -out],
      [c.s - half - 180, c.s - half - 60, out],
    ];
    if (tries.some(([s0, s1, side]) => stand(s0, s1, side))) cornerStands++;
  }

  // 5. City blocks on a grid squared to the start straight.
  if (makeup.street) {
    const h = track.pointAt(0).heading;
    const ux: Pt = [Math.cos(h), Math.sin(h)];
    const uy: Pt = [-Math.sin(h), Math.cos(h)];
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const reach = Math.hypot(extent.maxX - extent.minX, extent.maxY - extent.minY) / 2;
    const pitch = 90;
    const blockBand = band(50, undefined, 40);
    for (let i = -reach; i <= reach; i += pitch) {
      for (let j = -reach; j <= reach; j += pitch) {
        const w = rng.range(48, 72);
        const d = rng.range(44, 70);
        const tone = rng.int(0, 2);
        const mx = cx + ux[0] * i + uy[0] * j;
        const my = cy + ux[1] * i + uy[1] * j;
        if (mx < extent.minX || mx > extent.maxX || my < extent.minY || my > extent.maxY || field.wet(mx, my)) continue;
        const corner = (a: number, c2: number): Pt => [mx + ux[0] * a + uy[0] * c2, my + ux[1] * a + uy[1] * c2];
        const points = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)];
        if (points.some(([x, y]) => field.wet(x, y))) continue;
        if (field.area(points, blockBand)) areas.push({ kind: 'block', points, tone });
      }
    }
  }

  // 6. Trees and rocks, kept well back from the track and the pit lane.
  const dotBand = band(50, undefined, 40);
  const tryDot = (kind: Dot['kind'], x: number, y: number, r: number, tones: number) => {
    if (dots.length >= MAX_DOTS) return;
    if (x < extent.minX || x > extent.maxX || y < extent.minY || y > extent.maxY || field.wet(x, y)) return;
    if (field.ok(x, y, r, dotBand)) dots.push({ kind, x, y, r, tone: rng.int(0, tones - 1) });
  };
  const randomPoint = (): Pt => [rng.range(extent.minX, extent.maxX), rng.range(extent.minY, extent.maxY)];
  // Forest canopy is drawn as broad crowns, so woodland reads as woodland at full-map size.
  const big = setting === 'forest' ? [22, 40] : setting === 'parkland' ? [12, 20] : setting === 'mountain' ? [6, 11] : [8, 15];
  const stone = setting === 'mountain' ? [8, 18] : [5, 13];
  for (let i = 0; i < Math.round(makeup.clumps * km2); i++) {
    const [cx, cy] = randomPoint();
    const n = rng.int(5, 9);
    for (let k = 0; k < n; k++) tryDot('tree', cx + rng.normal(0, 28), cy + rng.normal(0, 28), rng.range(big[0], big[1]), 4);
  }
  for (let i = 0; i < Math.round(makeup.trees * km2); i++) {
    const [x, y] = randomPoint();
    tryDot('tree', x, y, rng.range(big[0], big[1]), 4);
  }
  for (let i = 0; i < Math.round(makeup.rocks * km2); i++) {
    const [x, y] = randomPoint();
    tryDot('rock', x, y, rng.range(stone[0], stone[1]), 3);
  }

  // 7. A number tag for every numbered corner, off the road and clear of the others.
  const font = size * 0.02;
  const tags: Tag[] = [];
  for (const nc of track.corners) {
    const c = matchCorner(circuit.corners, nc.s, track.length);
    const out = Math.sign(c.angle) || 1;
    const w = font * (nc.number >= 10 ? 1.7 : 1.15);
    const h = font * 1.3;
    const diag = Math.hypot(w / 2, h / 2);
    let pick: Tag | null = null;
    let fallback: Tag | null = null;
    search: for (const side of [out, -out]) {
      for (const along of [0, -40, 40]) {
        for (const gap of [1, 2, 3, 4.5]) {
          const [x, y] = at(nc.s + along, side * (R + diag + gap * font * 0.6));
          const tag = { n: nc.number, x, y, w, h };
          fallback ??= tag;
          const clearRoad = field.road.dist(x, y, R + diag + 5) - diag >= R + 0.5;
          const clearTags = tags.every((o) => Math.abs(o.x - x) >= (o.w + w) / 2 + 2 || Math.abs(o.y - y) >= (o.h + h) / 2 + 2);
          if (clearRoad && clearTags) {
            pick = tag;
            break search;
          }
        }
      }
    }
    tags.push(pick ?? fallback!);
  }

  return { half: R, extent, fills, areas, lines, dots, tags };
}

/** The layout corner a numbered corner was taken from. */
function matchCorner(corners: readonly LayoutCorner[], s: number, length: number): LayoutCorner {
  let best = corners[0];
  let gap = Infinity;
  for (const c of corners) {
    const d = Math.abs(c.s - s);
    const wrapped = Math.min(d, length - d);
    if (wrapped < gap) {
      gap = wrapped;
      best = c;
    }
  }
  return best;
}
