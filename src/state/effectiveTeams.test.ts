import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { effectiveTeams } from './effectiveTeams.ts';
import { newCareer, recordRace } from './season.ts';
import type { ScoredRow } from '../engine/scoring.ts';

const teams = defaultTeams();

describe('effective teams', () => {
  it('leaves every other team exactly as the editor has it', () => {
    const out = effectiveTeams(teams, newCareer('aurora', teams, 5));
    assert.equal(out.length, teams.length);
    teams.forEach((t, i) => {
      if (t.id !== 'aurora') assert.equal(out[i], t);
    });
  });

  it('seats the signed drivers in the order of their contracts, without changing the editor teams', () => {
    const career = newCareer('aurora', teams, 5);
    const swapped = { ...career, drivers: [career.drivers[1], career.drivers[0]] as typeof career.drivers };
    const before = JSON.stringify(teams);
    const aurora = effectiveTeams(teams, swapped).find((t) => t.id === 'aurora')!;
    assert.deepEqual(aurora.drivers.map((d) => d.id), ['aurora-1', 'aurora-0']);
    assert.equal(JSON.stringify(teams), before);
  });

  it('adds the player gains and the rival gains to the cars, and nothing else about a team', () => {
    const row = { position: 1, carId: 'aurora:0', grid: 1, laps: 10, finished: true, timeS: 1000, gapS: null, lapsDown: 0, bestLap: 90, pitStops: 1, penaltyS: 0, outReason: null, points: 0, fastestLap: false } satisfies ScoredRow;
    let career = newCareer('aurora', teams, 5);
    for (let i = 0; i < 5; i++) career = recordRace(career, 20, [row], teams);
    career = { ...career, development: { ...career.development, gains: { aero: 3, power: 20 } } };
    const out = effectiveTeams(teams, career);
    const aurora = out.find((t) => t.id === 'aurora')!;
    const base = teams.find((t) => t.id === 'aurora')!;
    assert.equal(aurora.car.aero, base.car.aero + 3);
    assert.equal(aurora.car.power, 99, 'never past the cap');
    let moved = 0;
    teams.forEach((t, i) => {
      if (t.id === 'aurora') return;
      const { car, ...rest } = out[i];
      const { car: baseCar, ...baseRest } = t;
      assert.deepEqual(rest, baseRest);
      for (const k of Object.keys(car) as (keyof typeof car)[]) {
        assert.ok(car[k] >= baseCar[k] && Number.isInteger(car[k]));
        moved += car[k] - baseCar[k];
      }
    });
    assert.ok(moved > 0, 'rivals have developed after five rounds');
  });

  it('keeps the editor driver in a seat whose contract names a driver the team no longer has', () => {
    const career = newCareer('aurora', teams, 5);
    const lost = { ...career, drivers: [{ ...career.drivers[0], driverId: 'gone' }, career.drivers[1]] as typeof career.drivers };
    const aurora = effectiveTeams(teams, lost).find((t) => t.id === 'aurora')!;
    assert.deepEqual(aurora.drivers.map((d) => d.id), ['aurora-0', 'aurora-1']);
  });
});
