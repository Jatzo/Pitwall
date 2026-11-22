/**
 * The 3D race view's shapes, as plain arrays. Nothing here imports three.js, so Node can test it and the
 * view can load three.js only when it opens. The 2D map draws things larger than life so they read at map
 * size; this works in real metres instead. Map (x, y) becomes (x, height, y), which seen from above keeps
 * the map's orientation, so a left turn on the map is a left turn in 3D.
 */

import type { CarState, RaceSim } from '../../engine/race.ts';
import { hashString } from '../../engine/rng.ts';
import { PIT_LANE_OFFSET_M } from '../../engine/track.ts';
import type { Track, TrackPoint } from '../../engine/track.ts';
import { carPose } from '../markers.ts';
import type { Pt } from '../scenery.ts';

/** Half a 14 m road. */
export const ROAD_HALF_M = 7;
const PIT_HALF_M = 5;
/** A car's lateral place runs about -1 to 1 across the road; this keeps a 2 m car on 14 m of asphalt. */
export const LAT_M = 5;
export const CAR = { length: 5.4, width: 2, height: 1 } as const;
/** Kerbs are 1.2 m wide and run wherever the corner is tighter than this radius. */
export const KERB_M = 1.2;
const KERB_RADIUS_M = 260;
/** Metres of road one repeat of the asphalt texture covers. */
const ROAD_TEXTURE_M = 28;
/** One repeat of a building's face: four windows across, two floors up. */
const FACADE_W = 10;
const FACADE_H = 7;

/** Triangles over vertices of [x, height, z], with a texture place [u, v] per vertex. */
export interface Mesh {
  positions: number[];
  uvs: number[];
  indices: number[];
}

/** Where the camera stands and the point it looks at, in metres. */
export interface CameraPlace {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

/** Where a car sits in 3D: on the ground at (x, z), pointing along `heading` in the map's sense. */
export interface Pose3 {
  x: number;
  z: number;
  heading: number;
  /** Metres travelled, so the wheels can turn the right amount. */
  rolled: number;
}

const empty = (): Mesh => ({ positions: [], uvs: [], indices: [] });

/** Height of the normal of triangle a, b, c: positive when it faces up. */
function upness(m: Mesh, a: number, b: number, c: number): number {
  const p = m.positions;
  const [ax, az, bx, bz, cx, cz] = [p[a * 3], p[a * 3 + 2], p[b * 3], p[b * 3 + 2], p[c * 3], p[c * 3 + 2]];
  return (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
}

/** Adds a flat triangle, wound so it faces up whatever order the corners came in. */
function flat(m: Mesh, a: number, b: number, c: number): void {
  if (upness(m, a, b, c) >= 0) m.indices.push(a, b, c);
  else m.indices.push(a, c, b);
}

/**
 * A flat band along a line of points, from `inner` to `outer` metres to the left of it (negative is right),
 * lifted a little to sit on the ground. The texture runs across the band in u and along it in v, one repeat
 * every `repeatM` metres.
 */
export function band(points: readonly TrackPoint[], inner: number, outer: number, closed: boolean, lift: number, repeatM: number): Mesh {
  const m = empty();
  let along = 0;
  points.forEach((p, i) => {
    if (i > 0) along += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    const [sx, sz] = [Math.sin(p.heading), -Math.cos(p.heading)];
    m.positions.push(p.x + sx * inner, lift, p.y + sz * inner, p.x + sx * outer, lift, p.y + sz * outer);
    m.uvs.push(0, along / repeatM, 1, along / repeatM);
  });
  const n = points.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    flat(m, 2 * i, 2 * i + 1, 2 * j);
    flat(m, 2 * i + 1, 2 * j + 1, 2 * j);
  }
  return m;
}

function lapPoints(track: Track): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let i = 0; i < track.n; i++) points.push({ x: track.x[i], y: track.y[i], heading: track.heading[i] });
  return points;
}

/** The racing surface, every 5 m sample around the lap, closed. */
export function trackRibbon(track: Track): Mesh {
  // A whole number of texture repeats per lap, so the seam at the line does not show.
  const repeat = track.length / Math.round(track.length / ROAD_TEXTURE_M);
  return band(lapPoints(track), -ROAD_HALF_M, ROAD_HALF_M, true, 0.05, repeat);
}

function pitPoints(track: Track): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let u = -track.pitEntryM; u <= track.pitExitM; u += 5) points.push(track.pitLanePoint(u));
  return points;
}

/** The pit lane, entry to exit. */
export function pitRibbon(track: Track): Mesh {
  return band(pitPoints(track), -PIT_HALF_M, PIT_HALF_M, false, 0.04, ROAD_TEXTURE_M);
}

/** Runs of samples, as [first, last] indices, where the corner is tighter than the kerb radius, widened 10 m each way. */
export function kerbRuns(track: Track): [number, number][] {
  const pad = Math.round(10 / track.step);
  const tight = Array.from({ length: track.n }, (_, i) => Math.abs(track.curvature[i]) > 1 / KERB_RADIUS_M);
  const wide = tight.map((_, i) => {
    for (let k = -pad; k <= pad; k++) if (tight[(i + k + track.n) % track.n]) return true;
    return false;
  });
  const runs: [number, number][] = [];
  for (let i = 0; i < track.n; i++) {
    if (wide[i] && !wide[(i - 1 + track.n) % track.n]) {
      let j = i;
      while (wide[(j + 1) % track.n] && j - i < track.n - 1) j++;
      runs.push([i, j]);
    }
  }
  return runs;
}

/** Kerbs on both edges of every corner, 1.2 m wide, a stripe every 2.5 m. */
export function kerbs(track: Track): Mesh {
  const all = lapPoints(track);
  const meshes: Mesh[] = [];
  for (const [a, b] of kerbRuns(track)) {
    const run: TrackPoint[] = [];
    for (let i = a; i <= b + 1; i++) run.push(all[i % track.n]);
    meshes.push(band(run, ROAD_HALF_M, ROAD_HALF_M + KERB_M, false, 0.08, 5));
    meshes.push(band(run, -ROAD_HALF_M - KERB_M, -ROAD_HALF_M, false, 0.08, 5));
  }
  return merge(meshes);
}

/** A wall along a line of points: two faces and a top, `thickness` wide. */
export function wall(points: readonly Pt[], height: number, thickness: number): Mesh {
  const m = empty();
  let along = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    const [nx, ny] = [(-(y1 - y0) / len) * (thickness / 2), ((x1 - x0) / len) * (thickness / 2)];
    for (const side of [1, -1]) {
      const base = m.positions.length / 3;
      const [ox, oy] = [nx * side, ny * side];
      m.positions.push(x0 + ox, 0, y0 + oy, x1 + ox, 0, y1 + oy, x1 + ox, height, y1 + oy, x0 + ox, height, y0 + oy);
      m.uvs.push(along / 4, 0, (along + len) / 4, 0, (along + len) / 4, height / 4, along / 4, height / 4);
      m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const top = m.positions.length / 3;
    m.positions.push(x0 + nx, height, y0 + ny, x1 + nx, height, y1 + ny, x1 - nx, height, y1 - ny, x0 - nx, height, y0 - ny);
    m.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    flat(m, top, top + 1, top + 2);
    flat(m, top, top + 2, top + 3);
    along += len;
  }
  return m;
}

/** The pit wall: a concrete wall between the track and the pit lane, where the lane runs alongside. */
export function pitWallLine(track: Track): Pt[] {
  const offset = track.outside * (ROAD_HALF_M + PIT_LANE_OFFSET_M - PIT_HALF_M) / 2;
  const reach = 80;
  const points: Pt[] = [];
  for (let u = -track.pitEntryM + reach; u <= track.pitExitM - reach; u += 5) {
    const p = track.pointAt(u);
    points.push([p.x + Math.sin(p.heading) * offset, p.y - Math.cos(p.heading) * offset]);
  }
  return points;
}

/** How far from the centre line a street circuit's walls stand: 2.5 m of verge beyond the road edge. */
export const STREET_WALL_M = ROAD_HALF_M + 2.5;

/**
 * The walls that line a street circuit on both sides, as runs of points. The outside wall stops where the
 * pit lane leaves and rejoins, and the pit wall takes over between.
 */
export function streetWallRuns(track: Track): Pt[][] {
  const runs: Pt[][] = [];
  for (const side of [1, -1]) {
    let run: Pt[] = [];
    for (let i = 0; i <= track.n; i++) {
      const k = i % track.n;
      const s = k * track.step;
      // Distance along the lap from the line, negative before it, so the pit range can be tested.
      const u = s > track.length / 2 ? s - track.length : s;
      const pitSide = side === track.outside && u > -track.pitEntryM - 20 && u < track.pitExitM + 20;
      if (pitSide) {
        if (run.length > 1) runs.push(run);
        run = [];
        continue;
      }
      const off = side * STREET_WALL_M;
      run.push([track.x[k] + Math.sin(track.heading[k]) * off, track.y[k] - Math.cos(track.heading[k]) * off]);
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}

/**
 * A map shape stood up to `height`: walls round the edge and a flat top. Scenery shapes are two rails
 * joined end to end, or a four-cornered block, so the top is filled by pairing point i with point n-1-i.
 * Wall textures repeat every 10 m across and 7 m up (two 3.5 m floors), so windows come out at a real size.
 */
export function extrude(points: readonly Pt[], height: number): Mesh {
  const m = empty();
  const n = points.length;
  for (const [x, y] of points) {
    m.positions.push(x, height, y);
    m.uvs.push(x / 10, y / 10);
  }
  for (let i = 0; i < n / 2 - 1; i++) {
    const [a, b, c, d] = [i, i + 1, n - 2 - i, n - 1 - i];
    flat(m, a, b, c);
    flat(m, a, c, d);
  }
  // Walls, each its own quad so its edge stays sharp under the light.
  let along = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const base = m.positions.length / 3;
    m.positions.push(x0, 0, y0, x1, 0, y1, x1, height, y1, x0, height, y0);
    m.uvs.push(along / FACADE_W, 0, (along + len) / FACADE_W, 0, (along + len) / FACADE_W, height / FACADE_H, along / FACADE_W, height / FACADE_H);
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    along += len;
  }
  return m;
}

/** A flat map shape on the ground, such as a gravel trap, filled the same way as `extrude`'s top. */
export function patch(points: readonly Pt[], lift: number): Mesh {
  const m = empty();
  const n = points.length;
  for (const [x, y] of points) {
    m.positions.push(x, lift, y);
    m.uvs.push(x / 8, y / 8);
  }
  for (let i = 0; i < n / 2 - 1; i++) {
    const [a, b, c, d] = [i, i + 1, n - 2 - i, n - 1 - i];
    flat(m, a, b, c);
    flat(m, a, c, d);
  }
  return m;
}

/** Joins meshes into one, so a whole kind of scenery is one draw. */
export function merge(meshes: readonly Mesh[]): Mesh {
  const out = empty();
  for (const m of meshes) {
    const base = out.positions.length / 3;
    for (const v of m.positions) out.positions.push(v);
    for (const v of m.uvs) out.uvs.push(v);
    for (const i of m.indices) out.indices.push(base + i);
  }
  return out;
}

/** A number from 0 to 1 fixed by a place, so the same tree is the same size on every visit. */
export function placeHash(x: number, y: number, salt: string): number {
  return hashString(`${salt}:${Math.round(x)}:${Math.round(y)}`) / 0x1_0000_0000;
}

/** A tree's real size: 4 to 9 m across the crown, never the 2D map's broad canopy. */
export function treeSize(x: number, y: number): { radius: number; height: number } {
  const radius = 4 + 5 * placeHash(x, y, 'tree');
  return { radius, height: radius * 2.6 };
}

/** A city block's height, 12 to 30 m. */
export function blockHeight(x: number, y: number): number {
  return 12 + 18 * placeHash(x, y, 'block');
}

/** Where a car is in 3D. On track its sideways place is in metres; on the pit lane it is where the map draws it. */
export function carPose3(sim: RaceSim, car: CarState, alpha: number, garages: readonly string[]): Pose3 {
  const a = sim.phase === 'racing' ? alpha : 1;
  const dist = car.prevDist + (car.dist - car.prevDist) * a;
  if (car.status === 'pitLane' && car.pit) {
    const p = carPose(sim, car, alpha, garages);
    return { x: p.x, z: p.y, heading: p.heading, rolled: dist };
  }
  const lat = (car.prevLat + (car.lat - car.prevLat) * a) * LAT_M;
  const p = sim.track.pointAt(dist);
  return { x: p.x + Math.sin(p.heading) * lat, z: p.y - Math.cos(p.heading) * lat, heading: p.heading, rolled: dist };
}

/** The camera's vertical field of view, in degrees. */
export const FOV_DEG = 55;
/** The chase camera: metres behind and above the car, and how far ahead of it it looks. */
const BEHIND = 8.5;
const ABOVE = 2.4;
const AHEAD = 22;
/** The aerial camera looks down at this angle from the horizontal. */
const AERIAL_PITCH = (52 * Math.PI) / 180;

/** Low behind the car, looking up the road past it. */
export function chaseCamera(at: Pose3): CameraPlace {
  const [cx, cz] = [Math.cos(at.heading), Math.sin(at.heading)];
  return { x: at.x - cx * BEHIND, y: ABOVE, z: at.z - cz * BEHIND, lookX: at.x + cx * AHEAD, lookY: 0.9, lookZ: at.z + cz * AHEAD };
}

/**
 * A raised camera that fits a map window (the 2D director's shot) in frame, looking across the circuit from
 * the map's bottom edge, so north on the map stays at the top of the picture.
 */
export function aerialCamera(win: { x: number; y: number; w: number; h: number }, aspect: number): CameraPlace {
  const half = Math.tan(((FOV_DEG / 2) * Math.PI) / 180);
  const fitWidth = win.w / 2 / (half * aspect);
  // Seen at a slant, the window's depth is foreshortened by the sine of the pitch.
  const fitDepth = ((win.h / 2) * Math.sin(AERIAL_PITCH)) / half;
  const d = Math.max(fitWidth, fitDepth) * 1.05;
  const [cx, cz] = [win.x + win.w / 2, win.y + win.h / 2];
  return { x: cx, y: d * Math.sin(AERIAL_PITCH), z: cz + d * Math.cos(AERIAL_PITCH), lookX: cx, lookY: 0, lookZ: cz };
}

/** How far the camera is from what it looks at. */
export function viewDistance(c: CameraPlace): number {
  return Math.hypot(c.x - c.lookX, c.y - c.lookY, c.z - c.lookZ);
}

/** Cars drawn larger in wide shots so they stay visible: true size up close, up to five times far away. */
export function carScale(c: CameraPlace): number {
  return Math.min(5, Math.max(1, viewDistance(c) / 120));
}
