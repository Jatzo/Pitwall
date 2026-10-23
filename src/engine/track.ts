/**
 * Track geometry and speed profile.
 *
 * A circuit is authored as a layout of key points in metres with a corner
 * radius at each (see circuitBuilder.ts). We sample it at a fixed spacing and
 * compute a physically-motivated speed profile: cornering grip that rises with
 * speed as downforce builds, plus acceleration and braking limits. Everything
 * the simulator needs - positions, speeds, DRS zones, corners, sectors, the pit
 * lane - comes from this one class.
 */

import { buildCircuit } from './circuitBuilder.ts';
import type { LayoutPoint } from './circuitBuilder.ts';

export interface TrackDef {
  id: string;
  name: string;
  location: string;
  /** One line on what makes the circuit different, for the calendar. */
  summary?: string;
  /** Key points in metres, each with its corner radius. The lap starts halfway along the first edge. */
  layout: readonly LayoutPoint[];
  /** Lap length in metres; must match the layout to within a few metres. */
  lengthM: number;
  /**
   * Optional override for the reference lap time (s). By default it is derived
   * from the layout: the time a perfect, fuel-free car takes to lap it.
   */
  refLapS?: number;
  /** Grip relative to a purpose-built circuit (default 1). */
  grip?: number;
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
// Traction-limited at low speed, power-limited above about 180 km/h. The race engine allows 9 m/s^2.
const ACCEL = 9;
const POWER = 450; // m^2/s^3: acceleration times speed
const BRAKE = 40; // m/s^2
// Lateral grip a = GRIP_LOW + GRIP_AERO * v^2: about 2 g in a hairpin, over 4 g in a fast sweeper.
const GRIP_LOW = 20;
const GRIP_AERO = 0.0035;
/** The pit lane runs this far from the track's centre line, on the outside of the lap. */
export const PIT_LANE_OFFSET_M = 42;
const PIT_TAPER_M = 80;

function wrapPi(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
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
  /** +1 or -1: the side of the track, as a left-hand offset, that faces away from the infield. */
  readonly outside: 1 | -1;
  private readonly overtake: Float64Array;

  constructor(def: TrackDef) {
    this.def = def;
    const circuit = buildCircuit(def.layout);

    // 1. Uniform samples of the exact geometry.
    const total = circuit.length;
    const n = Math.round(total / SPACING_M);
    const step = total / n;
    this.n = n;
    this.step = step;
    this.length = total;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.heading = new Float64Array(n);
    this.curvature = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = circuit.sample(i * step);
      this.x[i] = p.x;
      this.y[i] = p.y;
      this.heading[i] = p.heading;
      this.curvature[i] = p.kappa;
    }
    this.outside = circuit.turning < 0 ? -1 : 1;

    // 2. Speed profile.
    const grip = def.grip ?? 1;
    const low = GRIP_LOW * grip;
    const aero = GRIP_AERO * grip;
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const kappa = Math.abs(this.curvature[i]);
      v[i] = kappa <= aero ? V_MAX : Math.min(V_MAX, Math.sqrt(low / (kappa - aero)));
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 2 * n; i++) {
        const a = i % n;
        const b = (i + 1) % n;
        v[b] = Math.min(v[b], Math.sqrt(v[a] * v[a] + 2 * Math.min(ACCEL, POWER / Math.max(v[a], 1)) * step));
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

    // 3. Bounds.
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

    // 4. Sectors and pit lane, which must sit on the start/finish straight.
    this.sectorLines = [total / 3, (2 * total) / 3];
    this.pitEntryM = def.pitLane?.entryM ?? 230;
    this.pitExitM = def.pitLane?.exitM ?? 300;
    if (circuit.startStraight.before < this.pitEntryM || circuit.startStraight.after < this.pitExitM) {
      throw new Error(
        `${def.id}: the pit lane needs ${this.pitEntryM} m of straight before the line and ${this.pitExitM} m after, ` +
          `but the layout has ${circuit.startStraight.before.toFixed(0)} m and ${circuit.startStraight.after.toFixed(0)} m`,
      );
    }
    this.pitEntryS = total - this.pitEntryM;
    this.pitExitS = this.pitExitM;

    // 5. Features. A corner is a bend of 10 degrees or more that the car has to slow for.
    // Two bends the same way within 70 m are one corner (a hairpin drawn with two points);
    // a flick one way then the other is two, as a chicane is numbered on a real circuit.
    this.drsZones = this.findDrsZones();
    let top = 0;
    for (let i = 0; i < n; i++) top = Math.max(top, v[i]);
    const kept: { s: number; angle: number }[] = [];
    for (const c of circuit.corners) {
      if (Math.abs(c.angle) < 10 || this.speedAt(c.s) > 0.85 * top) continue;
      const last = kept[kept.length - 1];
      if (last && Math.sign(last.angle) === Math.sign(c.angle) && c.s - last.s < 70) continue;
      kept.push(c);
    }
    this.corners = kept.map((c, i) => ({ number: i + 1, s: c.s }));
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

  /**
   * A point on the pit lane, u metres from the start line (negative before it).
   * The lane leaves the track at the entry, runs parallel on the outside, and rejoins at the exit.
   */
  pitLanePoint(u: number): TrackPoint {
    const p = this.pointAt(u);
    const fromEnd = Math.min(u + this.pitEntryM, this.pitExitM - u);
    const k = Math.max(0, Math.min(1, fromEnd / PIT_TAPER_M));
    const off = PIT_LANE_OFFSET_M * this.outside * k * k * (3 - 2 * k);
    return { x: p.x + Math.sin(p.heading) * off, y: p.y - Math.cos(p.heading) * off, heading: p.heading };
  }

  /** The pit lane as an SVG path, entry to exit. */
  pitLanePath(): string {
    let d = '';
    for (let u = -this.pitEntryM; u <= this.pitExitM; u += SPACING_M * 2) {
      const p = this.pitLanePoint(u);
      d += `${u === -this.pitEntryM ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }
    return d;
  }

  /** Where garage `slot` of `slots` sits along the pit lane, centred on the start line. */
  garageU(slot: number, slots: number): number {
    const spacing = Math.min(20, (this.pitEntryM + this.pitExitM - 2 * PIT_TAPER_M) / Math.max(1, slots));
    return (slot - (slots - 1) / 2) * spacing;
  }

  /**
   * Where to draw a car on the pit lane. The race counts every stop at the start
   * line; `d` is the car's distance past it (negative on the way in). The map
   * stretches each half of the lane so the car stops at its own garage instead.
   */
  pitDisplayU(d: number, garage: number): number {
    if (d <= 0) return garage + (d * (garage + this.pitEntryM)) / this.pitEntryM;
    return garage + (d * (this.pitExitM - garage)) / this.pitExitM;
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

    const minLen = 350 / step;
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
