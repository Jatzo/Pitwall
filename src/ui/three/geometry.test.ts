import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../../data/teams.ts';
import { TRACKS, trackById } from '../../data/tracks.ts';
import { runQualifying } from '../../engine/qualifying.ts';
import { fastForward } from '../../engine/replay.ts';
import { Track } from '../../engine/track.ts';
import { hashString } from '../../engine/rng.ts';
import { settingFor } from '../circuitLook.ts';
import { buildScenery } from '../scenery.ts';
import type { Pt } from '../scenery.ts';
import { FOV_DEG, aerialCamera, carScale, chaseCamera, viewDistance, KERB_M, LAT_M, ROAD_HALF_M, blockHeight, carPose3, extrude, kerbRuns, kerbs, merge, pitRibbon, pitWallLine, STREET_WALL_M, streetWallRuns, trackRibbon, treeSize, wall } from './geometry.ts';
import type { Mesh } from './geometry.ts';

function finite(m: Mesh): boolean {
  const vertices = m.positions.length / 3;
  return (
    m.positions.every(Number.isFinite) &&
    m.uvs.every(Number.isFinite) &&
    m.uvs.length === vertices * 2 &&
    m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < vertices)
  );
}

/** Every flat triangle (all three corners at one height) faces up. */
function flatFacesUp(m: Mesh): boolean {
  const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    if (p[a * 3 + 1] !== p[b * 3 + 1] || p[a * 3 + 1] !== p[c * 3 + 1]) continue;
    const up = (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3] - p[a * 3]) - (p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]);
    if (up < -1e-6) return false;
  }
  return true;
}

/** Area of the flat triangles at one height, in square metres. */
function flatArea(m: Mesh, height: number): number {
  const p = m.positions;
  let sum = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    if ([a, b, c].some((i) => p[i * 3 + 1] !== height)) continue;
    sum += Math.abs((p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]) - (p[c * 3] - p[a * 3]) * (p[b * 3 + 2] - p[a * 3 + 2])) / 2;
  }
  return sum;
}

function shoelace(points: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
}

describe('3D geometry', () => {
  it('lays a closed 14 m road round every circuit, with no gaps, no bad numbers and every face up', () => {
    for (const def of TRACKS) {
      const track = new Track(def);
      const road = trackRibbon(track);
      assert.ok(finite(road), def.id);
      assert.ok(flatFacesUp(road), def.id);
      // Two triangles per sample, the last joining back to the first.
      assert.equal(road.indices.length, track.n * 6, def.id);
      // Each pair of edge vertices is a road's width apart.
      const p = road.positions;
      assert.ok(Math.abs(Math.hypot(p[0] - p[3], p[2] - p[5]) - 2 * ROAD_HALF_M) < 1e-9, def.id);
      // The surface is about as big as the lap times the width.
      const area = flatArea(road, 0.05);
      assert.ok(Math.abs(area / (track.length * 2 * ROAD_HALF_M) - 1) < 0.02, `${def.id} road area ${area.toFixed(0)}`);
      const pit = pitRibbon(track);
      assert.ok(finite(pit) && flatFacesUp(pit), def.id);
    }
  });

  it('stands scenery up on its 2D footprint, the top covering the same area', () => {
    for (const id of ['vennholt', 'costa-alta', 'silverwood']) {
      const track = trackById(id);
      const t = new Track(track);
      const sc = buildScenery(t, settingFor(id), hashString(id));
      const shapes = sc.areas.filter((a) => a.kind === 'stand' || a.kind === 'building' || a.kind === 'block');
      assert.ok(shapes.length > 0, id);
      for (const a of shapes) {
        const m = extrude(a.points, 8);
        assert.ok(finite(m) && flatFacesUp(m), `${id} ${a.kind}`);
        const top = flatArea(m, 8);
        const want = shoelace(a.points);
        assert.ok(Math.abs(top / want - 1) < 0.01, `${id} ${a.kind}: top ${top.toFixed(0)} against ${want.toFixed(0)}`);
      }
      const merged = merge(shapes.map((a) => extrude(a.points, 8)));
      assert.ok(finite(merged), id);
    }
  });

  it('lays kerbs only through corners, on both edges, just outside the road', () => {
    for (const def of TRACKS) {
      const track = new Track(def);
      const runs = kerbRuns(track);
      assert.ok(runs.length >= 3, `${def.id} has ${runs.length} kerbed corners`);
      const kerbed = new Set<number>();
      for (const [a, b] of runs) for (let i = a; i <= b; i++) kerbed.add(i % track.n);
      // No more than half the lap is kerbed: the straights stay clear.
      assert.ok(kerbed.size < track.n / 2, `${def.id} kerbs ${kerbed.size} of ${track.n} samples`);
      const m = kerbs(track);
      assert.ok(finite(m) && flatFacesUp(m), def.id);
      // Every kerb vertex sits between the road edge and 1.2 m beyond it.
      for (let v = 0; v < m.positions.length; v += 3) {
        let best = Infinity;
        for (let i = 0; i < track.n; i++) best = Math.min(best, Math.hypot(m.positions[v] - track.x[i], m.positions[v + 2] - track.y[i]));
        assert.ok(best > ROAD_HALF_M - 0.5 && best < ROAD_HALF_M + KERB_M + 0.5, `${def.id} kerb vertex ${best.toFixed(2)} m from the centre line`);
        if (v > 3000) break;
      }
    }
  });

  it('builds the pit wall between the track and the pit lane, and walls with no bad numbers', () => {
    for (const def of TRACKS) {
      const track = new Track(def);
      const points = pitWallLine(track);
      assert.ok(points.length > 10, def.id);
      // Measured across the track at the wall's first point, where the lane runs alongside.
      const u = -track.pitEntryM + 80;
      const centre = track.pointAt(u);
      const lane = track.pitLanePoint(u);
      const [x, y] = points[0];
      const toTrack = Math.hypot(x - centre.x, y - centre.y);
      const toLane = Math.hypot(lane.x - centre.x, lane.y - centre.y);
      assert.ok(toTrack > ROAD_HALF_M + 5 && toTrack < toLane - 5, `${def.id} pit wall ${toTrack.toFixed(1)} m out, lane ${toLane.toFixed(1)} m`);
      assert.ok(finite(wall(points, 1.2, 0.5)), def.id);
    }
  });

  it('lines a street circuit with walls that never come onto the road, open where the pit lane joins', () => {
    for (const id of ['costa-alta', 'port-calder']) {
      const track = new Track(trackById(id));
      const runs = streetWallRuns(track);
      assert.ok(runs.length >= 2, id);
      for (const run of runs) {
        for (let k = 0; k < run.length; k += 7) {
          const [x, y] = run[k];
          let best = Infinity;
          for (let i = 0; i < track.n; i++) best = Math.min(best, Math.hypot(x - track.x[i], y - track.y[i]));
          // Tight corners pull the wall line in on the inside, but never onto the asphalt or the kerb.
          assert.ok(best > ROAD_HALF_M + KERB_M, `${id} wall ${best.toFixed(2)} m from the centre line`);
        }
      }
      // Nothing walls off the pit lane entry: no wall point on the outside near the start line.
      const lane = track.pitLanePoint(0);
      for (const run of runs) for (const [x, y] of run) assert.ok(Math.hypot(x - lane.x, y - lane.y) > STREET_WALL_M, id);
    }
  });

  it('puts the chase camera low behind the car, looking up the road past it', () => {
    const c = chaseCamera({ x: 100, z: 50, heading: Math.PI / 2, rolled: 0 });
    // Heading +y on the map is +z in 3D: the camera sits at lower z and looks to higher z.
    assert.ok(c.z < 50 && c.lookZ > 50 && Math.abs(c.x - 100) < 1e-9);
    assert.ok(c.y > 1 && c.y < 4);
    assert.equal(carScale(c), 1, 'cars are true size up close');
  });

  it('fits the aerial camera to the director window, further back for a wider window', () => {
    const aspect = 16 / 10;
    const small = aerialCamera({ x: 0, y: 0, w: 450, h: 450 / aspect }, aspect);
    const large = aerialCamera({ x: 0, y: 0, w: 1800, h: 1800 / aspect }, aspect);
    assert.equal(small.lookX, 225);
    assert.ok(Math.abs(small.lookZ - 450 / aspect / 2) < 1e-9, 'it looks at the window centre');
    assert.ok(viewDistance(large) > 3.5 * viewDistance(small));
    // The window's width just fits the horizontal field of view.
    const half = Math.tan(((FOV_DEG / 2) * Math.PI) / 180) * aspect;
    assert.ok(viewDistance(small) * half >= 225 && viewDistance(small) * half < 225 * 1.2);
    // Looking down from the map's bottom edge, so the map's top stays at the top of the picture.
    assert.ok(small.z > small.lookZ && small.y > 100);
    assert.ok(carScale(large) <= 5 && carScale(large) > 1);
  });

  it('sizes trees and blocks within real ranges, the same every time for the same place', () => {
    for (let i = 0; i < 500; i++) {
      const [x, y] = [i * 37.3, i * -11.9];
      const tree = treeSize(x, y);
      assert.ok(tree.radius >= 4 && tree.radius <= 9);
      assert.deepEqual(treeSize(x, y), tree);
      const h = blockHeight(x, y);
      assert.ok(h >= 12 && h <= 30);
    }
  });

  it('puts each car on the track line, offset sideways in metres', () => {
    const teams = defaultTeams();
    const def = TRACKS[0];
    const sim = fastForward({ track: def, teams, grid: runQualifying(def, teams, 3).grid, laps: 10, seed: 3, playerTeamId: 'cobalt' }, [], 900);
    for (const car of sim.cars.filter((c) => c.status === 'running')) {
      const pose = carPose3(sim, car, 1, []);
      const p = sim.track.pointAt(car.dist);
      assert.ok(Math.abs(Math.hypot(pose.x - p.x, pose.z - p.y) - Math.abs(car.lat) * LAT_M) < 1e-6, car.id);
      assert.ok(Math.abs(car.lat) * LAT_M + 1 <= ROAD_HALF_M, `${car.id} stays on the road`);
    }
  });
});
