/**
 * Track geometry and speed profile.
 *
 * A circuit is authored as a handful of control points. We turn them into a
 * closed centripetal Catmull-Rom spline, resample it at a fixed spacing, derive
 * curvature, and compute a physically-motivated speed profile (cornering grip,
 * acceleration and braking limits). Everything the simulator needs - positions,
 * speeds, DRS zones, corners, sectors - comes from this one class.
 */

export type Vec2 = readonly [number, number];

export interface TrackDef {
  id: string;
  name: string;
  location: string;
  /** One line on what makes the circuit different, for the calendar. */
  summary?: string;
  /** Closed loop of control points (arbitrary units; scaled to lengthM). */
  controlPoints: readonly Vec2[];
  lengthM: number;
  /**
   * Optional override for the reference lap time (s). By default it is derived
   * from the layout: the time a perfect, fuel-free car takes to lap it.
   */
  refLapS?: number;
  /** Maximum lateral acceleration in m/s^2 (default 22, about 2.2 g). */
  cornerAccel?: number;
  /** Chance that rain falls at some point in a race here (0 to 1). */
  rainChance?: number;
  /** Tyre wear multiplier. 1 = average. */
  tyreSeverity: number;
  /** Overtaking difficulty multiplier. 1 = average, higher = harder. */
  overtakingDifficulty: number;
  /** How much each car attribute matters here. Should sum to 1. */
  weights: { power: number; aero: number; chassis: number };
  /** Pit lane extends this far before / after the start-finish line. */
  pitLane?: { entryM: number; exitM: number };
}

export interface TrackPoint {
  x: number;
  y: number;
  heading: number;
}

export interface Corner {
  number: number;
  /** Distance along the lap in metres. */
  s: number;
}

export interface DrsZone {
  detect: number;
  start: number;
  end: number;
}

const SPACING_M = 5;
const V_MAX = 86; // m/s, about 310 km/h
const ACCEL = 6.0; // m/s^2 used for the speed profile
const BRAKE = 40; // m/s^2

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function wrapPi(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Centripetal Catmull-Rom (Barry-Goldman form) for one segment p1 -> p2. */
function centripetal(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const alpha = 0.5;
  const t0 = 0;
  const t1 = t0 + Math.max(dist(p0, p1), 1e-6) ** alpha;
  const t2 = t1 + Math.max(dist(p1, p2), 1e-6) ** alpha;
  const t3 = t2 + Math.max(dist(p2, p3), 1e-6) ** alpha;
  const t = t1 + (t2 - t1) * u;

  const mix = (a: Vec2, b: Vec2, ta: number, tb: number, tt: number): Vec2 => {
    const w = (tt - ta) / (tb - ta);
    return [a[0] * (1 - w) + b[0] * w, a[1] * (1 - w) + b[1] * w];
  };
  const a1 = mix(p0, p1, t0, t1, t);
  const a2 = mix(p1, p2, t1, t2, t);
  const a3 = mix(p2, p3, t2, t3, t);
  const b1 = mix(a1, a2, t0, t2, t);
  const b2 = mix(a2, a3, t1, t3, t);
  return mix(b1, b2, t1, t2, t);
}

function sampleSpline(points: readonly Vec2[], perSegment: number): Vec2[] {
  const m = points.length;
  const out: Vec2[] = [];
  for (let i = 0; i < m; i++) {
    const p0 = points[(i - 1 + m) % m];
    const p1 = points[i];
    const p2 = points[(i + 1) % m];
    const p3 = points[(i + 2) % m];
    for (let k = 0; k < perSegment; k++) out.push(centripetal(p0, p1, p2, p3, k / perSegment));
  }
  return out;
}

export class Track {
  readonly def: TrackDef;
  /** Lap length in metres. */
  readonly length: number;
  /** Number of samples around the lap. */
  readonly n: number;
  /** Sample spacing in metres. */
  readonly step: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly heading: Float64Array;
  readonly curvature: Float64Array;
  /** Speed profile in m/s, scaled so one lap takes exactly refLap seconds. */
  readonly speed: Float64Array;
  readonly refLap: number;
  readonly corners: Corner[];
  readonly drsZones: DrsZone[];
  /** Sector boundaries (distance along the lap). */
  readonly sectorLines: readonly [number, number];
  readonly pitEntryS: number;
  readonly pitExitS: number;
  readonly pitEntryM: number;
  readonly pitExitM: number;
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };
  private readonly overtake: Float64Array;

  constructor(def: TrackDef) {
    this.def = def;

    // 1. Dense spline, scaled to the nominal length.
    const raw = sampleSpline(def.controlPoints, 80);
    let rawLen = 0;
    for (let i = 0; i < raw.length; i++) rawLen += dist(raw[i], raw[(i + 1) % raw.length]);
    const k = def.lengthM / rawLen;
    const px = raw.map((p) => p[0] * k);
    const py = raw.map((p) => p[1] * k);
    const m = raw.length;
    const cum = new Float64Array(m + 1);
    for (let i = 1; i <= m; i++) {
      cum[i] = cum[i - 1] + Math.hypot(px[i % m] - px[i - 1], py[i % m] - py[i - 1]);
    }
    const total = cum[m];

    // 2. Uniform resample.
    const n = Math.round(total / SPACING_M);
    const step = total / n;
    this.n = n;
    this.step = step;
    this.length = total;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    let idx = 0;
    for (let j = 0; j < n; j++) {
      const target = j * step;
      while (idx < m - 1 && cum[idx + 1] <= target) idx++;
      const span = cum[idx + 1] - cum[idx] || 1;
      const f = (target - cum[idx]) / span;
      this.x[j] = px[idx] + (px[(idx + 1) % m] - px[idx]) * f;
      this.y[j] = py[idx] + (py[(idx + 1) % m] - py[idx]) * f;
    }

    // 3. Heading and curvature.
    this.heading = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      this.heading[i] = Math.atan2(this.y[b] - this.y[a], this.x[b] - this.x[a]);
    }
    this.curvature = new Float64Array(n);
    const w = 4;
    for (let i = 0; i < n; i++) {
      const dh = wrapPi(this.heading[(i + w) % n] - this.heading[(i - w + n) % n]);
      this.curvature[i] = dh / (2 * w * step);
    }

    // 4. Speed profile.
    const aLat = def.cornerAccel ?? 22;
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const kappa = Math.max(Math.abs(this.curvature[i]), 1e-6);
      v[i] = Math.min(V_MAX, Math.sqrt(aLat / kappa));
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 2 * n; i++) {
        const a = i % n;
        const b = (i + 1) % n;
        v[b] = Math.min(v[b], Math.sqrt(v[a] * v[a] + 2 * ACCEL * step));
      }
      for (let i = 2 * n; i > 0; i--) {
        const a = (i - 1) % n;
        const b = i % n;
        v[a] = Math.min(v[a], Math.sqrt(v[b] * v[b] + 2 * BRAKE * step));
      }
    }
    let phys = 0;
    for (let i = 0; i < n; i++) phys += step / ((v[i] + v[(i + 1) % n]) / 2);
    // Optionally rescale so one lap takes exactly the authored reference time.
    const refLap = def.refLapS ?? phys;
    const scale = phys / refLap;
    for (let i = 0; i < n; i++) v[i] *= scale;
    this.speed = v;
    this.refLap = refLap;

    // 5. Bounds.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, this.x[i]);
      maxX = Math.max(maxX, this.x[i]);
      minY = Math.min(minY, this.y[i]);
      maxY = Math.max(maxY, this.y[i]);
    }
    this.bounds = { minX, minY, maxX, maxY };

    // 6. Sectors and pit lane.
    this.sectorLines = [total / 3, (2 * total) / 3];
    this.pitEntryM = def.pitLane?.entryM ?? 230;
    this.pitExitM = def.pitLane?.exitM ?? 300;
    this.pitEntryS = total - this.pitEntryM;
    this.pitExitS = this.pitExitM;

    // 7. Features.
    this.drsZones = this.findDrsZones();
    this.corners = this.findCorners();
    this.overtake = this.buildOvertakeMap();
  }

  wrap(s: number): number {
    const r = s % this.length;
    return r < 0 ? r + this.length : r;
  }

  private locate(s: number): { i: number; f: number } {
    const w = this.wrap(s) / this.step;
    let i = Math.floor(w);
    if (i >= this.n) i = this.n - 1;
    return { i, f: w - i };
  }

  pointAt(s: number): TrackPoint {
    const { i, f } = this.locate(s);
    const j = (i + 1) % this.n;
    const h0 = this.heading[i];
    const h1 = this.heading[j];
    const heading = h0 + wrapPi(h1 - h0) * f;
    return {
      x: this.x[i] + (this.x[j] - this.x[i]) * f,
      y: this.y[i] + (this.y[j] - this.y[i]) * f,
      heading,
    };
  }

  speedAt(s: number): number {
    const { i, f } = this.locate(s);
    return this.speed[i] + (this.speed[(i + 1) % this.n] - this.speed[i]) * f;
  }

  sectorAt(s: number): 0 | 1 | 2 {
    const w = this.wrap(s);
    if (w < this.sectorLines[0]) return 0;
    if (w < this.sectorLines[1]) return 1;
    return 2;
  }

  /** Index of the DRS zone containing s, or -1. */
  drsAt(s: number): number {
    const w = this.wrap(s);
    for (let z = 0; z < this.drsZones.length; z++) {
      const { start, end } = this.drsZones[z];
      const inside = start <= end ? w >= start && w <= end : w >= start || w <= end;
      if (inside) return z;
    }
    return -1;
  }

  /** 0..1: how easy it is to pass at this point of the lap. */
  overtakeAt(s: number): number {
    const { i } = this.locate(s);
    return this.overtake[i];
  }

  /** Average speed of the reference lap in km/h. */
  get refAvgKph(): number {
    return (this.length / this.refLap) * 3.6;
  }

  /** Polyline for rendering, as an SVG path "d" string (closed). */
  svgPath(everyNth = 2): string {
    let d = '';
    for (let i = 0; i < this.n; i += everyNth) {
      d += `${i === 0 ? 'M' : 'L'}${this.x[i].toFixed(1)},${this.y[i].toFixed(1)}`;
    }
    return `${d}Z`;
  }

  /** Offset polyline for the pit lane (SVG path, open). */
  pitLanePath(offsetM: number): string {
    const startS = this.pitEntryS;
    const total = this.pitEntryM + this.pitExitM;
    let d = '';
    for (let s = 0; s <= total; s += SPACING_M * 2) {
      const p = this.pointAt(startS + s);
      const ox = p.x + Math.sin(p.heading) * offsetM;
      const oy = p.y - Math.cos(p.heading) * offsetM;
      d += `${s === 0 ? 'M' : 'L'}${ox.toFixed(1)},${oy.toFixed(1)}`;
    }
    return d;
  }

  private findDrsZones(): DrsZone[] {
    const { n, step, curvature, length } = this;
    const straight = new Uint8Array(n);
    for (let i = 0; i < n; i++) straight[i] = Math.abs(curvature[i]) < 1 / 1100 ? 1 : 0;
    let anchor = -1;
    for (let i = 0; i < n; i++) {
      if (!straight[i]) {
        anchor = i;
        break;
      }
    }
    if (anchor < 0) return [];

    const runs: { start: number; len: number }[] = [];
    let runStart = -1;
    for (let c = 1; c <= n; c++) {
      const i = (anchor + c) % n;
      if (straight[i]) {
        if (runStart < 0) runStart = c;
      } else if (runStart >= 0) {
        runs.push({ start: (anchor + runStart) % n, len: c - runStart });
        runStart = -1;
      }
    }
    if (runStart >= 0) runs.push({ start: (anchor + runStart) % n, len: n + 1 - runStart });

    const minLen = 260 / step;
    const candidates = runs.filter((r) => r.len >= minLen).sort((a, b) => b.len - a.len);
    const wanted = length > 5000 && candidates[2] && candidates[2].len * step > 450 ? 3 : 2;
    const chosen = candidates.slice(0, wanted);
    return chosen
      .map((r) => {
        const startS = this.wrapLen(r.start * step + 20);
        const endS = this.wrapLen((r.start + r.len) * step - 70);
        return { detect: this.wrapLen(startS - 130), start: startS, end: endS };
      })
      .sort((a, b) => a.start - b.start);
  }

  private wrapLen(s: number): number {
    return this.wrap(s);
  }

  private findCorners(): Corner[] {
    const { n, step, speed } = this;
    const found: number[] = [];
    const near = Math.round(150 / step);
    const far = Math.round(400 / step);
    for (let i = 0; i < n; i++) {
      let isMin = true;
      let hi = 0;
      for (let d = -far; d <= far; d++) {
        const vv = speed[(i + d + n) % n];
        if (Math.abs(d) <= near && vv < speed[i]) {
          isMin = false;
          break;
        }
        if (vv > hi) hi = vv;
      }
      if (isMin && speed[i] < 0.8 * hi && Math.abs(this.curvature[i]) > 0.002) found.push(i);
    }
    const spaced: number[] = [];
    const minGap = Math.round(60 / step);
    for (const i of found) {
      const last = spaced[spaced.length - 1];
      if (last === undefined || i - last >= minGap) spaced.push(i);
    }
    if (spaced.length > 1 && spaced[0] + n - spaced[spaced.length - 1] < minGap) spaced.pop();
    return spaced.map((i, idx) => ({ number: idx + 1, s: i * step }));
  }

  private buildOvertakeMap(): Float64Array {
    const { n, step, speed } = this;
    const map = new Float64Array(n).fill(0.15);
    for (const zone of this.drsZones) {
      const startI = Math.floor(zone.start / step);
      const endI = Math.floor(zone.end / step);
      const len = (endI - startI + n) % n;
      for (let c = 0; c <= len; c++) map[(startI + c) % n] = Math.max(map[(startI + c) % n], 0.45);
      const vEnd = speed[endI % n];
      const maxExtra = Math.round(500 / step);
      for (let c = 0; c < maxExtra; c++) {
        const j = (endI + c) % n;
        map[j] = 1;
        if (speed[j] < 0.6 * vEnd) break;
      }
    }
    return map;
  }
}
