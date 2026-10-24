import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import type { LapRecord, RaceEvent } from '../engine/race.ts';
import { CLIFF_START } from '../engine/tyres.ts';
import { MAX_WAIT_S, PRIORITY, StoryQueue, gapTrend, holdFor, nextStories, watchStories } from './stories.ts';
import type { Story } from './stories.ts';

function startedSim(seconds = 300, seed = 3): RaceSim {
  const track = TRACKS[0];
  const teams = defaultTeams();
  const sim = new RaceSim({ track, teams, grid: runQualifying(track, teams, seed).grid, laps: 20, seed, playerTeamId: teams[5].id });
  sim.start();
  for (let i = 0; i < seconds * 10; i++) sim.step(0.1);
  return sim;
}

function overtake(sim: RaceSim, passer: string, passed: string, lap: number): void {
  const e: RaceEvent = { id: 9000 + sim.events.length, t: sim.time, lap, kind: 'overtake', carId: passer, otherId: passed, message: 'test' };
  sim.events.push(e);
}

function lapRecord(lap: number, time: number, clean = true): LapRecord {
  return { lap, time, sectors: [time / 3, time / 3, time / 3], compound: 'M', tyreAge: lap, pit: false, clean };
}

function story(kind: Story['kind'], priority: number, extra: Partial<Story> = {}): Story {
  return { kind, priority, carIds: ['a:0'], colour: '#fff', team: 'T', headline: kind, detail: '', label: 'Headline', announce: false, ...extra };
}

describe('race stories', () => {
  it('tells a place change for a player car, about both cars, and nothing for two rivals', () => {
    const sim = startedSim();
    const watch = watchStories(sim);
    const mine = sim.cars.find((c) => c.isPlayer && c.status === 'running')!;
    const rivals = sim.cars.filter((c) => !c.isPlayer && c.status === 'running');
    overtake(sim, mine.id, rivals[0].id, 4);
    overtake(sim, rivals[1].id, rivals[2].id, 4);
    const found = nextStories(sim, watch).filter((s) => s.kind === 'place');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].carIds, [mine.id, rivals[0].id]);
    assert.equal(found[0].delta, 1);
    assert.equal(found[0].announce, false, 'race control already announces overtakes');
  });

  it('tells no place changes on the first lap, when the grid shuffles', () => {
    const sim = startedSim();
    const watch = watchStories(sim);
    const mine = sim.cars.find((c) => c.isPlayer)!;
    overtake(sim, mine.id, sim.cars.find((c) => !c.isPlayer)!.id, 1);
    assert.equal(nextStories(sim, watch).filter((s) => s.kind === 'place').length, 0);
  });

  it('tells a personal best only from the second clean lap, and only by a clear margin', () => {
    const sim = startedSim();
    const mine = sim.cars.find((c) => c.isPlayer && c.status === 'running')!;
    sim.fastestLap = { carId: 'someone-else', time: 90, lap: 2 };
    mine.laps.length = 0;
    const watch = watchStories(sim);
    mine.laps.push(lapRecord(1, 100));
    assert.equal(nextStories(sim, watch).filter((s) => s.kind === 'pb').length, 0, 'first clean lap');
    mine.laps.push(lapRecord(2, 99.9));
    assert.equal(nextStories(sim, watch).filter((s) => s.kind === 'pb').length, 0, 'within noise');
    mine.laps.push(lapRecord(3, 99.5));
    assert.equal(nextStories(sim, watch).filter((s) => s.kind === 'pb').length, 1);
  });

  it('tells tyres reaching the cliff once per set', () => {
    const sim = startedSim();
    const watch = watchStories(sim);
    const mine = sim.cars.find((c) => c.isPlayer && c.status === 'running')!;
    mine.tyre.wear = CLIFF_START + 0.01;
    assert.equal(nextStories(sim, watch).filter((s) => s.kind === 'tyres').length, 1);
    assert.equal(nextStories(sim, watch).filter((s) => s.kind === 'tyres').length, 0);
    mine.stops.push({ lap: 9, compound: 'H', duration: 2.5 });
    assert.equal(nextStories(sim, watch).filter((s) => s.kind === 'tyres').length, 1, 'a new set can reach the cliff again');
  });

  it('tells when the car just ahead of a player car dives into the pit lane', () => {
    const sim = startedSim();
    const watch = watchStories(sim);
    const order = sim.standings();
    const i = order.findIndex((c, k) => k > 0 && c.isPlayer && c.status === 'running' && !order[k - 1].isPlayer && order[k - 1].status === 'running');
    assert.ok(i > 0, 'fixture has a rival directly ahead of a player car');
    order[i - 1].status = 'pitLane';
    const found = nextStories(sim, watch).filter((s) => s.kind === 'rivalPit');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].carIds, [order[i].id, order[i - 1].id]);
  });

  it('measures a gap trend as seconds a lap, closing positive', () => {
    assert.ok(Math.abs(gapTrend([3, 2.6, 2.2, 1.8, 1.4]) - 0.4) < 1e-9);
    assert.ok(Math.abs(gapTrend([1, 1.5, 2, 2.5, 3]) + 0.5) < 1e-9);
    assert.equal(gapTrend([2]), 0);
  });

  it('over whole races, only ever tells place changes about player cars, battles within a second, and nothing twice too soon', () => {
    let battles = 0;
    for (const seed of [1, 2, 3]) {
      const sim = startedSim(0, seed);
      const watch = watchStories(sim);
      const told = new Map<string, number>();
      for (let i = 0; i < 40_000 && sim.phase === 'racing'; i++) {
        sim.step(0.1);
        for (const s of nextStories(sim, watch)) {
          if (s.kind === 'place') assert.ok(sim.carById(s.carIds[0])!.isPlayer);
          if (s.kind === 'battle') {
            battles++;
            assert.ok(/^\d\.\d s apart/.test(s.detail) && Number.parseFloat(s.detail) <= 1.0, s.detail);
          }
          if (s.kind !== 'place') {
            const key = `${s.kind}:${[...s.carIds].sort().join()}`;
            const lap = sim.standings()[0].lap;
            const last = told.get(key);
            assert.ok(last === undefined || lap - last >= 3, `${key} repeated after ${lap - (last ?? 0)} laps`);
            told.set(key, lap);
          }
        }
      }
    }
    assert.ok(battles > 0, 'three races produce at least one battle story');
  });
});

describe('story queue', () => {
  it('shows the highest priority first and holds it', () => {
    const q = new StoryQueue();
    q.push([story('lead', PRIORITY.lead), story('tyres', PRIORITY.tyres)], 0);
    assert.equal(q.current(0, 2.5)?.kind, 'tyres');
    assert.equal(q.current(2.4, 2.5)?.kind, 'tyres');
    assert.equal(q.current(2.5, 2.5), null, 'the lead story waited too long');
  });

  it('drops a story that waited too long, but never an own place change', () => {
    const q = new StoryQueue();
    q.push([story('battle', PRIORITY.battle), story('place', PRIORITY.place, { delta: 1, position: 5, code: 'EKL' })], 0);
    q.push([story('tyres', PRIORITY.tyres)], 0);
    assert.equal(q.current(0, 4)?.kind, 'place');
    assert.equal(q.current(4, 4), null, `battle and tyres waited over ${MAX_WAIT_S} s`);
    const q2 = new StoryQueue();
    q2.push([story('tyres', PRIORITY.tyres)], 0);
    q2.push([story('place', PRIORITY.place, { delta: -1, position: 6, code: 'EKL' })], 0.1);
    assert.equal(q2.current(0.1, 4)?.kind, 'place');
    assert.equal(q2.current(4.1, 4), null);
  });

  it('merges a burst of place changes for one car into one story', () => {
    const q = new StoryQueue();
    q.push([story('tyres', PRIORITY.tyres)], 0);
    assert.equal(q.current(0, 2.5)?.kind, 'tyres');
    const p = (delta: number, position: number) => story('place', PRIORITY.place, { carIds: ['me:0', 'x:0'], delta, position, code: 'EKL' });
    q.push([p(1, 6)], 0.5);
    q.push([p(1, 5)], 1);
    q.push([p(-1, 6)], 1.5);
    q.push([p(1, 5)], 2);
    const shown = q.current(10, 2.5);
    assert.equal(shown?.headline, 'EKL gains 2 places, now P5');
    assert.equal(q.current(12.5, 2.5), null, 'one merged story, not four');
  });

  it('holds stories for less time at high speed', () => {
    assert.ok(holdFor(16) < holdFor(2));
  });
});
