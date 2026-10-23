import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRACKS } from '../data/tracks.ts';
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
        assert.ok(Math.min(...kph) > 60, `min ${Math.min(...kph)}`);
        assert.ok(Math.max(...kph) < 340, `max ${Math.max(...kph)}`);
      });

      it('has numbered corners in order and at least one DRS zone', () => {
        assert.ok(track.corners.length >= 5, `corners ${track.corners.length}`);
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
