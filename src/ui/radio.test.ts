import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import type { CarState } from '../engine/race.ts';
import { RADIO_LINES, boxCall, radioFor, watchRadio } from './radio.ts';
import type { RadioTrigger } from './radio.ts';
import { MAX_WAIT_S, PRIORITY, RADIO_WAIT_S, StoryQueue } from './stories.ts';
import type { Story } from './stories.ts';

function startedSim(laps = 20): RaceSim {
  const track = TRACKS[0];
  const teams = defaultTeams();
  const sim = new RaceSim({ track, teams, grid: runQualifying(track, teams, 3).grid, laps, seed: 3, playerTeamId: teams[5].id });
  sim.start();
  for (let i = 0; i < 300; i++) sim.step(0.1);
  return sim;
}

function story(kind: Story['kind'], carIds: string[], extra: Partial<Story> = {}): Story {
  return { kind, priority: PRIORITY[kind], carIds, colour: '#ffffff', team: 'Test', headline: kind, detail: '', label: 'Your car', announce: false, ...extra };
}

/** Whether a headline is one of a trigger's lines, with its blanks filled in. */
function fromPool(trigger: RadioTrigger, headline: string): boolean {
  return RADIO_LINES[trigger].some((line) => {
    const pattern = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+');
    return new RegExp(`^"${pattern}"$`).test(headline);
  });
}

function players(sim: RaceSim): [CarState, CarState] {
  const mine = sim.cars.filter((c) => c.isPlayer);
  return [mine[0], mine[1]];
}

describe('team radio', () => {
  it('answers a place gained or lost, tyres at the cliff and the car ahead pitting', () => {
    const sim = startedSim();
    const [a, b] = players(sim);
    const rival = sim.cars.find((c) => !c.isPlayer)!;
    const cases: [Story, RadioTrigger, CarState][] = [
      [story('place', [a.id, rival.id], { delta: 1 }), 'gain', a],
      [story('place', [b.id, rival.id], { delta: -1 }), 'loss', b],
      [story('tyres', [a.id]), 'tyres', a],
      [story('rivalPit', [b.id, rival.id], { rivalAhead: true }), 'aheadPits', b],
    ];
    for (const [given, trigger, car] of cases) {
      const said = radioFor(sim, watchRadio(1), [given]);
      assert.equal(said.length, 1, trigger);
      assert.equal(said[0].kind, 'radio');
      assert.equal(said[0].carIds[0], car.id);
      assert.equal(said[0].label, 'Team radio');
      assert.ok(fromPool(trigger, said[0].headline), `${trigger}: ${said[0].headline}`);
    }
  });

  it('says nothing about a rival pitting from behind, or about stories it has no line for', () => {
    const sim = startedSim();
    const [a] = players(sim);
    const rival = sim.cars.find((c) => !c.isPlayer)!;
    const said = radioFor(sim, watchRadio(1), [story('rivalPit', [a.id, rival.id], { rivalAhead: false }), story('pb', [a.id]), story('closing', [a.id, rival.id])]);
    assert.deepEqual(said, []);
  });

  it('calls the last lap once for each driver still running', () => {
    const sim = startedSim(3);
    const watch = watchRadio(1);
    const lines: Story[] = [];
    while (sim.phase === 'racing') {
      sim.step(0.1);
      lines.push(...radioFor(sim, watch, []));
    }
    const lastLap = lines.filter((s) => fromPool('lastLap', s.headline));
    const running = players(sim).filter((c) => c.status !== 'out');
    assert.equal(lastLap.length, running.length);
    assert.deepEqual(new Set(lastLap.map((s) => s.carIds[0])), new Set(running.map((c) => c.id)));
  });

  it('acknowledges a stop the player asks for, naming the tyres', () => {
    const sim = startedSim();
    const [a] = players(sim);
    const ack = boxCall(sim, watchRadio(1), a.id, 'M');
    assert.ok(ack && fromPool('box', ack.headline) && /mediums/.test(ack.headline), ack?.headline);
    const rival = sim.cars.find((c) => !c.isPlayer)!;
    assert.equal(boxCall(sim, watchRadio(1), rival.id, 'M'), null);
  });

  it('keeps a driver quiet about the same thing for four laps', () => {
    const sim = startedSim();
    const [a] = players(sim);
    const rival = sim.cars.find((c) => !c.isPlayer)!;
    const watch = watchRadio(1);
    const gain = [story('place', [a.id, rival.id], { delta: 1 })];
    assert.equal(radioFor(sim, watch, gain).length, 1);
    assert.equal(radioFor(sim, watch, gain).length, 0, 'same lap');
    assert.equal(radioFor(sim, watch, [story('tyres', [a.id])]).length, 1, 'a different trigger is not held back');
    a.lap += 3;
    assert.equal(radioFor(sim, watch, gain).length, 0, 'three laps on');
    a.lap += 1;
    assert.equal(radioFor(sim, watch, gain).length, 1, 'four laps on');
  });

  it('picks the same line from the same seed, and varies across seeds', () => {
    const sim = startedSim();
    const [a] = players(sim);
    const rival = sim.cars.find((c) => !c.isPlayer)!;
    const gain = [story('place', [a.id, rival.id], { delta: 1 })];
    assert.deepEqual(radioFor(sim, watchRadio(7), gain), radioFor(sim, watchRadio(7), gain));
    const seen = new Set(Array.from({ length: 20 }, (_, seed) => radioFor(sim, watchRadio(seed), gain)[0].headline));
    assert.ok(seen.size >= 3, `${seen.size} different lines over 20 seeds`);
  });

  it('keeps every line short and plain', () => {
    // No exclamation marks, and no en or em dashes (character codes 8211 and 8212).
    const banned = ['!', String.fromCharCode(8211), String.fromCharCode(8212)];
    for (const [trigger, lines] of Object.entries(RADIO_LINES)) {
      assert.ok(lines.length >= 3, `${trigger} has ${lines.length} phrasings`);
      for (const line of lines) {
        const filled = line.replace('{pos}', '20').replace('{rival}', 'XXX').replace('{compound}', 'intermediate');
        assert.ok(filled.length <= 60, `${trigger}: "${filled}" is ${filled.length} characters`);
        assert.ok(!banned.some((c) => line.includes(c)), `${trigger}: "${line}"`);
      }
    }
  });
});

describe('radio in the story queue', () => {
  it('waits for the story it answers, then shows', () => {
    const q = new StoryQueue();
    const place = story('place', ['a'], { delta: 1 });
    const radio = story('radio', ['a'], { label: 'Team radio' });
    q.push([place, radio], 0);
    assert.equal(q.current(0, 4), place);
    assert.ok(4 > MAX_WAIT_S);
    assert.equal(q.current(4.1, 4), radio);
  });

  it('is dropped once it is too late to make sense', () => {
    const q = new StoryQueue();
    q.push([story('radio', ['a'], { label: 'Team radio' })], 0);
    assert.equal(q.current(RADIO_WAIT_S + 0.1, 4), null);
  });

  it('never pushes a factual story about the same car off the strip', () => {
    assert.ok(PRIORITY.radio < PRIORITY.tyres && PRIORITY.radio < PRIORITY.rivalPit && PRIORITY.radio < PRIORITY.place);
  });
});
