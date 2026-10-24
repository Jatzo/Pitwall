import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import type { TeamDef } from '../engine/types.ts';
import {
  DEVELOPMENT,
  carryOver,
  costPerPoint,
  deliverProjects,
  developed,
  projectOptions,
  rivalGains,
  startProject,
} from './development.ts';
import { CALENDAR, newCareer, recordRace } from './season.ts';
import type { Career, Development } from './season.ts';

const teams = defaultTeams();

function row(carId: string, position: number): ScoredRow {
  return { position, carId, grid: position, laps: 10, finished: true, timeS: 1000, gapS: null, lapsDown: 0, bestLap: 90, pitStops: 1, penaltyS: 0, outReason: null, points: 0, fastestLap: false };
}

/** Races one round with no points, then delivers whatever is due. */
function race(career: Career): Career {
  return deliverProjects(recordRace(career, 20, [row(`${career.playerTeamId}:0`, 10)], teams)).career;
}

const option = (career: Career, area: string, kind: string, from: TeamDef[] = teams) =>
  projectOptions(career, from).find((o) => o.area === area && o.kind === kind)!;

describe('development', () => {
  it('charges more per point as a rating climbs', () => {
    assert.ok(costPerPoint(92) > costPerPoint(84));
    assert.ok(costPerPoint(84) > costPerPoint(66));
    // The strongest car pays more for the same project than the weakest.
    const top = newCareer('aurora', teams, 1);
    const back = newCareer('halcyon', teams, 1);
    assert.ok(option(top, 'aero', 'upgrade').cost > option(back, 'aero', 'upgrade').cost);
  });

  it('makes a longer project cheaper per point than a quick fix', () => {
    const c = newCareer('solstice', teams, 1);
    const perPoint = (kind: string) => option(c, 'power', kind).cost / option(c, 'power', kind).gain;
    assert.ok(perPoint('major') < perPoint('upgrade'));
    assert.ok(perPoint('upgrade') < perPoint('quick'));
  });

  it('pays for a project when it starts and books it in the ledger', () => {
    const c = newCareer('solstice', teams, 1);
    const o = option(c, 'aero', 'upgrade');
    const after = startProject(c, teams, 'aero', 'upgrade');
    assert.equal(after.finance.balance, Math.round((c.finance.balance - o.cost) * 100) / 100);
    assert.equal(after.finance.ledger[0].amount, -o.cost);
    assert.equal(after.development.projects.length, 1);
    assert.equal(after.development.projects[0].deliverAt, o.rounds);
  });

  it('will not start a project the team cannot pay for, or while in debt', () => {
    const c = newCareer('solstice', teams, 1);
    const poor = { ...c, finance: { ...c.finance, balance: 0.2 } };
    assert.ok(option(poor, 'aero', 'major').blocked);
    assert.throws(() => startProject(poor, teams, 'aero', 'major'));
    const debt = { ...c, finance: { ...c.finance, balance: -0.5 } };
    assert.ok(projectOptions(debt, teams).every((o) => o.blocked));
  });

  it('runs at most two projects, and one per area', () => {
    let c = newCareer('aurora', teams, 1);
    c = { ...c, finance: { ...c.finance, balance: 100 } };
    c = startProject(c, teams, 'aero', 'quick');
    assert.ok(option(c, 'aero', 'major').blocked, 'aero is already being worked on');
    c = startProject(c, teams, 'power', 'quick');
    assert.ok(projectOptions(c, teams).every((o) => o.blocked));
  });

  it('never takes a rating past the cap', () => {
    const maxed = teams.map((t) => (t.id === 'aurora' ? { ...t, car: { ...t.car, aero: 99, power: 98 } } : t));
    const c = { ...newCareer('aurora', maxed, 1), finance: { balance: 100, ledger: [] } };
    assert.ok(option(c, 'aero', 'quick', maxed).blocked);
    assert.equal(option(c, 'power', 'major', maxed).gain, 1);
  });

  it('delivers after the build time, not before, and the gain counts from the next race', () => {
    let c = newCareer('solstice', teams, 1);
    c = startProject(c, teams, 'chassis', 'upgrade');
    c = race(c);
    assert.equal(c.development.projects.length, 1, 'still building after one round');
    assert.equal(c.development.gains.chassis ?? 0, 0);
    c = race(c);
    assert.equal(c.development.projects.length, 0);
    assert.equal(c.development.delivered.length, 1);
    assert.equal(c.development.gains.chassis, c.development.delivered[0].gain);
  });

  it('gives the full gain or half of it, decided by the seed, and a quick fix always works', () => {
    const outcomes = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      let c = newCareer('solstice', teams, seed);
      c = race(race(race(startProject(c, teams, 'power', 'major'))));
      outcomes.add(c.development.gains.power ?? 0);
      // The same seed always gives the same outcome.
      const again = race(race(race(startProject(newCareer('solstice', teams, seed), teams, 'power', 'major'))));
      assert.equal(again.development.gains.power, c.development.gains.power);
    }
    const major = DEVELOPMENT.kinds.find((k) => k.kind === 'major')!;
    assert.deepEqual([...outcomes].sort(), [major.gain / 2, major.gain]);
    for (let seed = 1; seed <= 20; seed++) {
      const c = race(startProject(newCareer('solstice', teams, seed), teams, 'power', 'quick'));
      assert.equal(c.development.gains.power, DEVELOPMENT.kinds.find((k) => k.kind === 'quick')!.gain);
    }
  });

  it('develops the rivals from the seed alone, whatever the player does', () => {
    let quiet = newCareer('solstice', teams, 9);
    let busy = { ...quiet, finance: { ...quiet.finance, balance: 100 } };
    for (let i = 0; i < 4; i++) {
      quiet = race(quiet);
      if (busy.development.projects.length === 0) busy = startProject(busy, teams, 'aero', 'quick');
      busy = race(busy);
    }
    assert.deepEqual(rivalGains(teams, busy), rivalGains(teams, quiet));
    const gains = rivalGains(teams, quiet);
    assert.equal(gains.solstice, undefined, 'the player team is not a rival');
    assert.ok(Object.values(gains).every((g) => Object.values(g).reduce((s, v) => s + v, 0) > 0));
  });

  it('spends a rival budget on its weakest area', () => {
    const c = race(newCareer('solstice', teams, 3));
    const cobalt = teams.find((t) => t.id === 'cobalt')!;
    const weakest = (Object.keys(cobalt.car) as (keyof typeof cobalt.car)[]).reduce((a, b) => (cobalt.car[b] < cobalt.car[a] ? b : a));
    assert.deepEqual(Object.keys(rivalGains(teams, c).cobalt), [weakest]);
  });

  it('lets rival gains drift a quarter of the way back at the start of each season', () => {
    let c = newCareer('solstice', teams, 4);
    for (let i = 0; i < CALENDAR.length; i++) c = race(c);
    const end = rivalGains(teams, c);
    const next: Career = { ...c, season: 2, roundsBefore: CALENDAR.length, results: [] };
    // Before any race of the new season, only the drift has happened; the first race adds its budget on top.
    const start = rivalGains(teams, next);
    for (const [id, g] of Object.entries(end))
      for (const [area, v] of Object.entries(g)) assert.ok(Math.abs((start[id] as Record<string, number>)[area] - v * (1 - DEVELOPMENT.drift)) < 1e-9, `${id} ${area}`);
  });

  it('carries the player gains into a new season with the same drift, small gains included', () => {
    let dev: Development = { gains: { aero: 4, power: 1 }, projects: [], delivered: [] };
    dev = carryOver(dev);
    assert.deepEqual(dev.gains, { aero: 3, power: 0.75 });
    // A one-point gain is gone from the car within a few seasons.
    for (let i = 0; i < 2; i++) dev = carryOver(dev);
    const car = { power: 80, aero: 80, chassis: 80, reliability: 80, pitCrew: 80 };
    assert.equal(developed(car, dev.gains).power, 80);
  });
});
