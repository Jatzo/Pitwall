import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRACKS } from '../data/tracks.ts';
import { buildCircuit } from '../engine/circuitBuilder.ts';
import { Track } from '../engine/track.ts';
import { SETTINGS, settingFor } from './circuitLook.ts';
import type { Setting } from './circuitLook.ts';
import { buildScenery } from './scenery.ts';
import type { Pt, Scenery } from './scenery.ts';

/** Drawn half-width of the road, as the map draws it. */
function halfRoad(t: Track): number {
  const size = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxY - t.bounds.minY);
  return Math.max(14, size * 0.011) / 2;
}

function pitSamples(t: Track): Pt[] {
  const out: Pt[] = [];
  for (let u = -t.pitEntryM; u <= t.pitExitM; u += 10) {
    const p = t.pitLanePoint(u);
    out.push([p.x, p.y]);
  }
  return out;
}

function trackSamples(t: Track): Pt[] {
  return Array.from({ length: t.n }, (_, i) => [t.x[i], t.y[i]] as Pt);
}

function nearest(x: number, y: number, samples: readonly Pt[]): number {
  let best = Infinity;
  for (const [sx, sy] of samples) best = Math.min(best, Math.hypot(sx - x, sy - y));
  return best;
}

/** Points along a closed polygon's edges, every few metres. */
function outline(points: readonly Pt[], every = 5): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / every));
    for (let k = 0; k < steps; k++) out.push([ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps]);
  }
  return out;
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

/** Nearest and farthest distance of a shape's points to the track, and nearest to the pit lane. */
function reach(points: readonly Pt[], pad: number, road: readonly Pt[], pit: readonly Pt[]) {
  let lo = Infinity;
  let hi = 0;
  let pitLo = Infinity;
  for (const [x, y] of points) {
    const d = nearest(x, y, road);
    lo = Math.min(lo, d - pad);
    hi = Math.max(hi, d + pad);
    pitLo = Math.min(pitLo, nearest(x, y, pit) - pad);
  }
  return { lo, hi, pitLo };
}

/** The table of allowed distances from the race screen plan, in metres beyond the road's half-width R. */
function check(t: Track, sc: Scenery): string[] {
  const R = halfRoad(t);
  const road = trackSamples(t);
  const pit = pitSamples(t);
  const circuit = buildCircuit(t.def.layout);
  const fails: string[] = [];

  for (const a of sc.areas) {
    const pts = outline(a.points);
    const { lo, hi, pitLo } = reach(pts, 0, road, pit);
    const covers = road.some(([x, y]) => inside(x, y, a.points)) || pit.some(([x, y]) => inside(x, y, a.points));
    const say = (why: string) => fails.push(`${t.def.id} ${a.kind}: ${why} (track ${lo.toFixed(1)} to ${hi.toFixed(1)}, pit ${pitLo.toFixed(1)}, R ${R.toFixed(1)})`);
    if (covers) say('covers the track or pit lane');
    if (a.kind === 'gravel' || a.kind === 'runoff') {
      if (lo < R + 2 || hi > R + 80 || pitLo < 10) say('outside its band');
      const c = circuit.corners[a.corner ?? -1];
      if (!c) say('has no corner');
      else {
        // The arc's centre lies on the inside of the turn, one radius in from its middle.
        const mid = t.pointAt(c.s);
        const side = -Math.sign(c.angle);
        const cx = mid.x + Math.sin(mid.heading) * side * c.radius;
        const cy = mid.y - Math.cos(mid.heading) * side * c.radius;
        // Run-off on the outside never reaches into the circle the corner is drawn on.
        if (a.points.some(([x, y]) => Math.hypot(x - cx, y - cy) < c.radius)) say('sits on the inside of the turn');
      }
    } else if (a.kind === 'building') {
      if (lo < R + 2) say('touches the track');
      const lane = pts.map(([x, y]) => nearest(x, y, pit));
      if (Math.min(...lane) < 15 || Math.max(...lane) > 45) say('not 15 to 45 m beyond the pit lane');
    } else if (a.kind === 'stand') {
      if (lo < R + 25 || hi > R + 90 || pitLo < 20) say('outside its band');
    } else if (a.kind === 'block') {
      if (lo < R + 50 || pitLo < 40) say('too close');
    }
  }

  for (const l of sc.lines) {
    const { lo, hi, pitLo } = reach(l.points, l.width / 2, road, pit);
    const say = (why: string) => fails.push(`${t.def.id} ${l.kind}: ${why} (track ${lo.toFixed(1)} to ${hi.toFixed(1)}, R ${R.toFixed(1)})`);
    // Track samples are 5 m apart, so a measured distance can run about 0.3 m long.
    if (l.kind === 'kerb' && (lo < R - 0.4 || hi > R + 3.4)) say('not on the road edge');
    if (l.kind === 'barrier' && (lo < R + 2 || hi > R + 80 || pitLo < 10)) say('outside its band');
  }

  for (const d of sc.dots) {
    const gap = nearest(d.x, d.y, road) - d.r;
    const pitGap = nearest(d.x, d.y, pit) - d.r;
    if (gap < R + 50 || pitGap < 40) fails.push(`${t.def.id} ${d.kind} at ${d.x.toFixed(0)},${d.y.toFixed(0)}: ${gap.toFixed(1)} m from the track`);
  }

  for (const g of sc.tags) {
    const clear = nearest(g.x, g.y, road) - Math.hypot(g.w / 2, g.h / 2);
    if (clear < R) fails.push(`${t.def.id} tag ${g.n} sits on the road`);
  }
  return fails;
}

const tracks = TRACKS.map((def) => new Track(def));

describe('circuit scenery', () => {
  it('gives every circuit a setting, and an unknown circuit the countryside', () => {
    for (const def of TRACKS) assert.ok(SETTINGS.includes(settingFor(def.id)), def.id);
    assert.equal(settingFor('nowhere'), 'countryside');
  });

  it('draws the same scenery from the same seed', () => {
    const t = tracks[0];
    assert.deepEqual(buildScenery(t, 'countryside', 7), buildScenery(t, 'countryside', 7));
    assert.notDeepEqual(buildScenery(t, 'countryside', 7).dots, buildScenery(t, 'countryside', 8).dots);
  });

  it('keeps every shape inside its band on every circuit', () => {
    const fails = tracks.flatMap((t) => check(t, buildScenery(t, settingFor(t.def.id), 1)));
    assert.deepEqual(fails, []);
  });

  it('keeps every setting inside the bands, tried on two different circuits', () => {
    const pair = [tracks.find((t) => t.def.id === 'kestrel-ring')!, tracks.find((t) => t.def.id === 'port-calder')!];
    const fails = pair.flatMap((t) => SETTINGS.flatMap((s: Setting) => check(t, buildScenery(t, s, 3))));
    assert.deepEqual(fails, []);
  });

  it('puts a kerb and one number tag at every numbered corner', () => {
    for (const t of tracks) {
      const sc = buildScenery(t, settingFor(t.def.id), 1);
      const R = halfRoad(t);
      for (const c of t.corners) {
        const p = t.pointAt(c.s);
        const kerb = sc.lines.some((l) => l.kind === 'kerb' && l.points.some(([x, y]) => Math.hypot(x - p.x, y - p.y) < R + 4));
        assert.ok(kerb, `${t.def.id} turn ${c.number} has no kerb`);
      }
      assert.deepEqual(sc.tags.map((g) => g.n), t.corners.map((c) => c.number), t.def.id);
    }
  });

  it('keeps grandstands 200 m apart, three to a circuit', () => {
    for (const t of tracks) {
      const stands = buildScenery(t, settingFor(t.def.id), 1).areas.filter((a) => a.kind === 'stand');
      assert.equal(stands.length, 3, t.def.id);
      for (let i = 0; i < stands.length; i++)
        for (let j = i + 1; j < stands.length; j++) {
          const gap = Math.min(...stands[i].points.flatMap(([x, y]) => stands[j].points.map(([u, v]) => Math.hypot(x - u, y - v))));
          assert.ok(gap >= 200, `${t.def.id}: two stands ${gap.toFixed(0)} m apart`);
        }
    }
  });

  it('keeps number tags apart from each other', () => {
    for (const t of tracks) {
      const tags = buildScenery(t, settingFor(t.def.id), 1).tags;
      for (let i = 0; i < tags.length; i++)
        for (let j = i + 1; j < tags.length; j++) {
          const apart = Math.abs(tags[i].x - tags[j].x) >= (tags[i].w + tags[j].w) / 2 || Math.abs(tags[i].y - tags[j].y) >= (tags[i].h + tags[j].h) / 2;
          assert.ok(apart, `${t.def.id}: tags ${tags[i].n} and ${tags[j].n} overlap`);
        }
    }
  });

  it('gives each setting the scenery it is named for', () => {
    const t = tracks[0];
    const kinds = (s: Setting) => {
      const sc = buildScenery(t, s, 1);
      return new Set([...sc.areas.map((a) => a.kind), ...sc.lines.map((l) => l.kind), ...sc.dots.map((d) => d.kind), ...sc.fills.map((f) => f.kind)]);
    };
    assert.ok(kinds('forest').has('tree'));
    assert.ok(kinds('mountain').has('rock'));
    assert.ok(kinds('coastal').has('water'));
    const street = kinds('street');
    assert.ok(street.has('block') && street.has('barrier') && street.has('water'));
    assert.ok(!street.has('gravel'));
    assert.ok(kinds('countryside').has('gravel'));
    for (const s of SETTINGS) assert.ok(kinds(s).has('stand') && kinds(s).has('building'), `${s} has stands and a pit building`);
  });
});
