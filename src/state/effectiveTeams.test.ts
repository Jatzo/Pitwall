import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { effectiveTeams } from './effectiveTeams.ts';
import { newCareer } from './season.ts';

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

  it('keeps the editor driver in a seat whose contract names a driver the team no longer has', () => {
    const career = newCareer('aurora', teams, 5);
    const lost = { ...career, drivers: [{ ...career.drivers[0], driverId: 'gone' }, career.drivers[1]] as typeof career.drivers };
    const aurora = effectiveTeams(teams, lost).find((t) => t.id === 'aurora')!;
    assert.deepEqual(aurora.drivers.map((d) => d.id), ['aurora-0', 'aurora-1']);
  });
});
