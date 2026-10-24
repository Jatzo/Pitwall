import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import { battleFor } from './battles.ts';
import { HOLD_S, cameraWindow, direct } from './director.ts';
import type { Direction } from './director.ts';
import type { Story } from './stories.ts';

function startedSim(steps = 1500): RaceSim {
  const track = TRACKS[0];
  const teams = defaultTeams();
  const sim = new RaceSim({ track, teams, grid: runQualifying(track, teams, 3).grid, laps: 20, seed: 3, playerTeamId: teams[5].id });
  sim.start();
  for (let i = 0; i < steps; i++) sim.step(0.1);
  return sim;
}

function story(carIds: string[]): Story {
  return { kind: 'battle', priority: 50, carIds, colour: '#ffffff', team: 'Test', headline: 'A story', detail: '', label: 'Battle', announce: false };
}

/** What the director should pick with nothing held: the plan's order, written out independently. */
function expected(sim: RaceSim): string[] {
  const order = sim.standings();
  const mine = order
    .filter((c) => c.isPlayer)
    .flatMap((p) => [battleFor(sim, p), battleFor(sim, order[order.indexOf(p) + 1] ?? p)])
    .filter((b) => b !== null);
  const top = order
    .slice(1, 5)
    .map((c) => battleFor(sim, c))
    .filter((b) => b !== null);
  const pick = (list: typeof mine) => list.reduce((a, b) => (b.gap < a.gap ? b : a));
  if (mine.length) {
    const b = pick(mine);
    return [b.behind.id, b.ahead.id];
  }
  if (top.length) {
    const b = pick(top);
    return [b.behind.id, b.ahead.id];
  }
  return [order[0].id];
}

describe('camera director', () => {
  it('picks a battle with your car, then the closest top-five battle, then the leader', () => {
    const seen = { player: 0, battle: 0, leader: 0 };
    // The player's cars are nearly always in a fight, so a second race with them retired reaches the lower rungs.
    for (const retirePlayer of [false, true]) {
      const sim = startedSim(300);
      if (retirePlayer) for (const c of sim.cars) if (c.isPlayer) c.status = 'out';
      for (let i = 0; i < 6000 && sim.phase === 'racing'; i++) {
        sim.step(0.1);
        if (i % 5) continue;
        const d = direct(sim, null, 0, null, null);
        assert.deepEqual(d.shot.carIds, expected(sim), `step ${i}: ${d.shot.label}`);
        seen[d.shot.kind as keyof typeof seen]++;
      }
    }
    // Each rung of the order has to come up, or the test proves nothing about it.
    assert.ok(seen.player > 0 && seen.battle > 0 && seen.leader > 0, JSON.stringify(seen));
  });

  it('holds its own choice for six seconds of story time, then picks again', () => {
    const sim = startedSim();
    const fresh = direct(sim, null, 0, null, null);
    const other = sim.standings().find((c) => !fresh.shot.carIds.includes(c.id) && c.status === 'running')!;
    const held: Direction = { shot: { kind: 'leader', carIds: [other.id], label: 'held' }, since: 10 };
    assert.deepEqual(direct(sim, held, 10 + HOLD_S - 0.1, null, null).shot.carIds, [other.id]);
    assert.deepEqual(direct(sim, held, 10 + HOLD_S + 0.1, null, null).shot.carIds, fresh.shot.carIds);
  });

  it('cuts to a story at once, whatever it is holding', () => {
    const sim = startedSim();
    const held = direct(sim, null, 0, null, null);
    const ids = [sim.standings()[9].id];
    const d = direct(sim, held, 0.5, story(ids), null);
    assert.equal(d.shot.kind, 'story');
    assert.deepEqual(d.shot.carIds, ids);
    assert.equal(d.since, 0.5);
  });

  it('follows a locked car over stories, and Auto hands control back', () => {
    const sim = startedSim();
    const car = sim.standings()[12];
    const d = direct(sim, null, 0, story([sim.standings()[0].id]), car.id);
    assert.equal(d.shot.kind, 'follow');
    assert.deepEqual(d.shot.carIds, [car.id]);
    const released = direct(sim, d, 0.1, null, null);
    assert.notEqual(released.shot.kind, 'follow');
    assert.deepEqual(released.shot.carIds, direct(sim, null, 0, null, null).shot.carIds);
  });

  it('stops following a car that retires', () => {
    const sim = startedSim();
    const car = sim.standings()[12];
    car.status = 'out';
    assert.notEqual(direct(sim, null, 0, null, car.id).shot.kind, 'follow');
  });
});

describe('camera window', () => {
  const sim = startedSim(10);
  const t = sim.track;
  const at = (s: number) => {
    const p = t.pointAt(s);
    return { x: p.x, y: p.y, s };
  };

  it('follows the car with a 450 m window up to 4x and 900 m at 8x', () => {
    const p = at(500);
    for (const speed of [1, 2, 4]) {
      const w = cameraWindow(t, p, speed, false, null, 1.6);
      assert.equal(w.w, 450);
      assert.equal(w.third, null);
      assert.equal(w.fixed, false);
      assert.ok(Math.abs(w.x + w.w / 2 - p.x) < 1e-9 && Math.abs(w.y + w.h / 2 - p.y) < 1e-9);
    }
    assert.equal(cameraWindow(t, p, 8, false, null, 1.6).w, 900);
  });

  it('holds a fixed shot of a third of the lap at 16x and above, and cuts when the car leaves it', () => {
    for (const speed of [16, 32]) {
      const first = cameraWindow(t, at(100), speed, false, null, 1.6);
      const same = cameraWindow(t, at(t.length / 3 - 100), speed, false, first, 1.6);
      assert.equal(same, first, 'no panning inside the third');
      const next = cameraWindow(t, at(t.length / 3 + 100), speed, false, same, 1.6);
      assert.notEqual(next.third, first.third);
    }
  });

  it('frames the whole third in a fixed shot', () => {
    for (const third of [0, 1, 2]) {
      const w = cameraWindow(t, at(((third + 0.5) * t.length) / 3), 32, false, null, 1.6);
      assert.ok(Math.abs(w.w / w.h - 1.6) < 1e-9);
      for (let i = 0; i < t.n; i++) {
        if (t.sectorAt(i * t.step) !== third) continue;
        assert.ok(t.x[i] >= w.x && t.x[i] <= w.x + w.w && t.y[i] >= w.y && t.y[i] <= w.y + w.h, `third ${third} sample ${i} outside`);
      }
    }
  });

  it('cuts instead of panning when reduced motion is asked for, keeping the close-up size', () => {
    const inside = (w: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }) => p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h;
    for (const [speed, size] of [[1, 450], [8, 900]]) {
      const first = cameraWindow(t, at(500), speed, true, null, 1.6);
      assert.ok(first.fixed);
      assert.equal(first.w, size);
      assert.ok(inside(first, at(500)));
      // The car starts at the back of the shot, so it drives across before the cut.
      assert.equal(cameraWindow(t, at(500 + size * 0.3), speed, true, first, 1.6), first, 'no panning while the car crosses the shot');
      const next = cameraWindow(t, at(500 + size * 1.5), speed, true, first, 1.6);
      assert.notEqual(next, first);
      assert.ok(inside(next, at(500 + size * 1.5)));
    }
  });
});
