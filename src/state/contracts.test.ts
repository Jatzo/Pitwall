import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FREE_AGENTS } from '../data/drivers.ts';
import { defaultTeams } from '../data/teams.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import { askingSalary, expiringSeats, freeAgents, startNextSeason } from './contracts.ts';
import { DEVELOPMENT } from './development.ts';
import { effectiveTeams } from './effectiveTeams.ts';
import { salaryFor } from './finance.ts';
import { CALENDAR, newCareer, raceSeed, recordRace } from './season.ts';
import type { Career } from './season.ts';

const teams = defaultTeams();

function row(carId: string, position: number, points: number): ScoredRow {
  return { position, carId, grid: position, laps: 10, finished: true, timeS: 1000, gapS: null, lapsDown: 0, bestLap: 90, pitStops: 1, penaltyS: 0, outReason: null, points, fastestLap: false };
}

/** A whole season in which the team's second driver wins every race and the first scores nothing. */
function seasonPlayed(teamId = 'cobalt'): Career {
  let c = newCareer(teamId, teams, 11);
  for (let i = 0; i < CALENDAR.length; i++) c = recordRace(c, 20, [row(`${teamId}:1`, 1, 25), row('velox:0', 2, 18), row(`${teamId}:0`, 20, 0)], teams);
  return c;
}

describe('free agents', () => {
  it('have their own ids, codes and numbers, apart from every default driver', () => {
    const grid = teams.flatMap((t) => t.drivers);
    for (const key of ['id', 'code', 'number'] as const) {
      const all = [...grid, ...FREE_AGENTS].map((d) => d[key]);
      assert.equal(new Set(all).size, all.length, key);
    }
  });
});

describe('contracts', () => {
  it('lists the seats whose contracts end with this season', () => {
    const c = seasonPlayed();
    assert.deepEqual(expiringSeats(c), [1]);
  });

  it('asks more of a driver who did well this season, and less of one who did not', () => {
    const c = seasonPlayed();
    const racing = effectiveTeams(teams, c);
    const cobalt = teams.find((t) => t.id === 'cobalt')!;
    assert.ok(askingSalary(c, racing, 1) > salaryFor(cobalt.drivers[1]));
    assert.ok(askingSalary(c, racing, 0) < salaryFor(cobalt.drivers[0]));
  });

  it('offers only free agents nobody has signed', () => {
    const c = seasonPlayed();
    const signed = { ...c, drivers: [{ ...c.drivers[0], driverId: FREE_AGENTS[0].id }, c.drivers[1]] as Career['drivers'] };
    assert.equal(freeAgents(c).length, FREE_AGENTS.length);
    assert.ok(!freeAgents(signed).some((d) => d.id === FREE_AGENTS[0].id));
  });
});

describe('the next season', () => {
  it('keeps the money and the car, starts a fresh calendar and counts the rounds already raced', () => {
    let c = seasonPlayed();
    c = { ...c, finance: { ...c.finance, balance: 7.5 }, development: { ...c.development, gains: { aero: 4 } } };
    const next = startNextSeason(c, effectiveTeams(teams, c), [null, { kind: 'renew', seasons: 2 }]);
    assert.equal(next.season, 2);
    assert.equal(next.roundsBefore, CALENDAR.length);
    assert.deepEqual(next.results, []);
    assert.deepEqual(next.calendar, [...CALENDAR]);
    assert.equal(next.finance.balance, 7.5);
    assert.equal(next.development.gains.aero, 4 * (1 - DEVELOPMENT.drift));
    assert.equal(next.sponsor, null);
    assert.notEqual(raceSeed(next, 0), raceSeed(c, 0));
  });

  it('runs down every contract, renews at the asking salary and signs a free agent at theirs', () => {
    const c = seasonPlayed();
    const racing = effectiveTeams(teams, c);
    const renewed = startNextSeason(c, racing, [null, { kind: 'renew', seasons: 2 }]);
    assert.deepEqual(renewed.drivers[0], { ...c.drivers[0], seasonsLeft: c.drivers[0].seasonsLeft - 1 });
    assert.deepEqual(renewed.drivers[1], { driverId: c.drivers[1].driverId, salary: askingSalary(c, racing, 1), seasonsLeft: 2 });
    const agent = FREE_AGENTS[2];
    const swapped = startNextSeason(c, racing, [null, { kind: 'sign', driverId: agent.id, seasons: 1 }]);
    assert.deepEqual(swapped.drivers[1], { driverId: agent.id, salary: salaryFor(agent), seasonsLeft: 1 });
    // The new driver races for the team from the first round.
    assert.equal(effectiveTeams(teams, swapped).find((t) => t.id === 'cobalt')!.drivers[1].id, agent.id);
  });

  it('will not start before the season is over, or with an ending contract left undecided', () => {
    const c = seasonPlayed();
    const racing = effectiveTeams(teams, c);
    assert.throws(() => startNextSeason(newCareer('cobalt', teams, 1), racing, [null, { kind: 'renew', seasons: 1 }]));
    assert.throws(() => startNextSeason(c, racing, [null, null]));
    assert.throws(() => startNextSeason(c, racing, [null, { kind: 'sign', driverId: 'velox-0', seasons: 1 }]), 'only free agents can be signed');
  });
});

describe('a signed free agent on the grid', () => {
  it('takes their seat, and another number when theirs is already taken', () => {
    const agent = FREE_AGENTS[0];
    const c = newCareer('cobalt', teams, 1);
    const signed = { ...c, drivers: [c.drivers[0], { driverId: agent.id, salary: 0.2, seasonsLeft: 1 }] as Career['drivers'] };
    const seat = effectiveTeams(teams, signed).find((t) => t.id === 'cobalt')!.drivers[1];
    assert.equal(seat.id, agent.id);
    assert.equal(seat.number, agent.number);
    const clash = teams.map((t) => (t.id === 'velox' ? { ...t, drivers: [{ ...t.drivers[0], number: agent.number }, t.drivers[1]] as typeof t.drivers } : t));
    const moved = effectiveTeams(clash, signed);
    const numbers = moved.flatMap((t) => t.drivers.map((d) => d.number));
    assert.equal(new Set(numbers).size, numbers.length);
  });
});
