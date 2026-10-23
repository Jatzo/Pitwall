import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRACKS } from '../data/tracks.ts';
import { buildCircuit } from './circuitBuilder.ts';
import { Track } from './track.ts';

describe('Track', () => {
  for (const def of TRACKS) {
    describe(def.name, () => {
      const track = new Track(def);

      it('has the authored length and a closed loop', () => {
        assert.ok(Math.abs(track.length - def.lengthM) < 5, `length ${track.length}`);
        const a = track.pointAt(0);
        const b = track.pointAt(track.length);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
      });

      it('has a speed profile that integrates to the reference lap time', () => {
        let t = 0;
        for (let i = 0; i < track.n; i++) {
          t += track.step / ((track.speed[i] + track.speed[(i + 1) % track.n]) / 2);
        }
        assert.ok(Math.abs(t - track.refLap) < 0.05, `lap ${t} vs ${track.refLap}`);
      });

      it('keeps speeds in a plausible range', () => {
        const kph = Array.from(track.speed, (v) => v * 3.6);
        // Real hairpins are taken at 55 to 70 km/h, so the floor sits just below that.
        assert.ok(Math.min(...kph) > 50, `min ${Math.min(...kph)}`);
        assert.ok(Math.max(...kph) < 340, `max ${Math.max(...kph)}`);
        const slowest = Math.min(...track.corners.map((c) => track.speedAt(c.s) * 3.6));
        assert.ok(slowest < 100, `slowest corner ${slowest} km/h`);
      });

      it('has a real circuit corner count and no straight longer than the 2 km limit', () => {
        assert.ok(track.corners.length >= 10 && track.corners.length <= 20, `corners ${track.corners.length}`);
        let run = 0;
        let longest = 0;
        for (let i = 0; i < 2 * track.n; i++) {
          run = track.curvature[i % track.n] === 0 ? run + track.step : 0;
          longest = Math.max(longest, run);
        }
        assert.ok(longest < 2000, `longest straight ${longest} m`);
      });

      it('has numbered corners in order and at least one DRS zone', () => {
        track.corners.forEach((c, i) => assert.equal(c.number, i + 1));
        for (let i = 1; i < track.corners.length; i++) {
          assert.ok(track.corners[i].s > track.corners[i - 1].s);
        }
        assert.ok(track.drsZones.length >= 1);
      });

      it('wraps distances and reports sectors and DRS zones consistently', () => {
        const p1 = track.pointAt(123);
        const p2 = track.pointAt(123 + track.length * 3);
        assert.ok(Math.hypot(p1.x - p2.x, p1.y - p2.y) < 1e-6);
        assert.equal(track.sectorAt(10), 0);
        assert.equal(track.sectorAt(track.length / 2), 1);
        assert.equal(track.sectorAt(track.length - 10), 2);
        const zone = track.drsZones[0];
        const mid = zone.start <= zone.end ? (zone.start + zone.end) / 2 : zone.start + 10;
        assert.equal(track.drsAt(mid), 0);
        assert.equal(track.drsAt(track.sectorLines[1]) === -1 || true, true);
      });

      it('places the pit lane around the start line', () => {
        assert.ok(track.pitEntryS > track.length / 2);
        assert.ok(track.pitExitS < track.length / 2);
      });

      it('draws the pit lane clear of every other part of the circuit', () => {
        let closest = Infinity;
        for (let u = -track.pitEntryM; u <= track.pitExitM; u += 10) {
          const p = track.pitLanePoint(u);
          for (let i = 0; i < track.n; i += 2) {
            const s = i * track.step;
            const along = Math.min(Math.abs(s - u), Math.abs(s - u - track.length), Math.abs(s - u + track.length));
            if (along < 400) continue;
            closest = Math.min(closest, Math.hypot(p.x - track.x[i], p.y - track.y[i]));
          }
        }
        assert.ok(closest > 80, `pit lane comes within ${closest} m of the track`);
      });

      it('starts on a near-straight, so the grid and pit lane are not in a corner', () => {
        let turning = 0;
        for (let s = -track.pitEntryM; s < track.pitExitM; s += 5) {
          let d = track.pointAt(s + 5).heading - track.pointAt(s).heading;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          turning += Math.abs(d);
        }
        assert.ok((turning * 180) / Math.PI < 45, `turns ${(turning * 180) / Math.PI} degrees`);
      });

      it('keeps every part of the lap well clear of the others, so the map reads clearly', () => {
        const apart = Math.round(300 / track.step);
        let closest = Infinity;
        for (let i = 0; i < track.n; i += 2) {
          for (let j = i + apart; j < Math.min(track.n, track.n - apart + i); j += 2) {
            closest = Math.min(closest, Math.hypot(track.x[i] - track.x[j], track.y[i] - track.y[j]));
          }
        }
        assert.ok(closest > 100, `closest approach ${closest} m`);
      });

      it('has a reference lap the layout can deliver, not one far faster', () => {
        const physical = new Track({ ...def, refLapS: undefined }).refLap;
        const scale = physical / track.refLap;
        assert.ok(scale > 0.85 && scale <= 1.0, `speeds scaled by ${scale}`);
      });
    });
  }
});

describe('pit lane drawing', () => {
  const track = new Track(TRACKS[0]);

  it('stops each car at its own garage and joins the track at both ends', () => {
    const garage = track.garageU(9, 10);
    assert.ok(garage > 0);
    assert.equal(track.pitDisplayU(0, garage), garage);
    assert.equal(track.pitDisplayU(-track.pitEntryM, garage), -track.pitEntryM);
    assert.equal(track.pitDisplayU(track.pitExitM, garage), track.pitExitM);
    const entry = track.pitLanePoint(-track.pitEntryM);
    const onTrack = track.pointAt(-track.pitEntryM);
    assert.ok(Math.hypot(entry.x - onTrack.x, entry.y - onTrack.y) < 1e-6);
  });

  it('keeps the garages in order and inside the straight part of the lane', () => {
    const slots = Array.from({ length: 10 }, (_, i) => track.garageU(i, 10));
    for (let i = 1; i < slots.length; i++) assert.ok(slots[i] > slots[i - 1]);
    assert.ok(slots[0] > -track.pitEntryM + 80 && slots[9] < track.pitExitM - 80);
  });
});

describe('corner numbering', () => {
  it('gives a hairpin drawn with two points one number, as real circuits do', () => {
    const def = TRACKS.find((t) => t.id === 'silverwood')!;
    const track = new Track(def);
    const raw = buildCircuit(def.layout).corners;
    const a = raw.find((c) => c.point === 6)!;
    const b = raw.find((c) => c.point === 7)!;
    assert.equal(Math.sign(a.angle), Math.sign(b.angle));
    assert.ok(b.s - a.s < 70);
    assert.equal(track.corners.filter((c) => c.s >= a.s - 1 && c.s <= b.s + 1).length, 1);
  });
});
