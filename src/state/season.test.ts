import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import {
  currentRound,
  driverStandings,
  isSeasonOver,
  newCareer,
  raceSeed,
  recordRace,
  roundSummary,
  teamStandings,
} from './season.ts';
import type { Career } from './season.ts';

function row(carId: string, position: number, points: number, finished = true, fastestLap = false): ScoredRow {
  return {
    position,
    carId,
    grid: position,
    laps: 10,
    finished,
    timeS: finished ? 1000 + position : null,
    gapS: null,
    lapsDown: 0,
    bestLap: 90,
    pitStops: 1,
    penaltyS: 0,
    outReason: finished ? null : 'Engine',
    points,
    fastestLap,
  };
}

describe('season', () => {
  const teams = defaultTeams();

  it('starts empty and advances one round per race', () => {
    let career = newCareer('aurora', 5);
    assert.equal(career.version, 2);
    assert.equal(career.season, 1);
    assert.equal(currentRound(career), 0);
    assert.equal(isSeasonOver(career), false);
    career = recordRace(career, 20, [row('aurora:0', 1, 25)], teams);
    assert.equal(currentRound(career), 1);
    assert.equal(career.results[0].trackId, career.calendar[0]);
  });

  it('records which driver drove each car', () => {
    const career = recordRace(newCareer('aurora', 5), 20, [row('aurora:0', 1, 25), row('velox:1', 2, 18)], teams);
    assert.deepEqual(
      career.results[0].rows.map((r) => r.driverId),
      ['aurora-0', 'velox-1'],
    );
  });

  it('accumulates driver and constructor points with wins and podiums', () => {
    let career = newCareer('aurora', 5);
    career = recordRace(career, 20, [row('aurora:0', 1, 25), row('velox:0', 2, 18), row('aurora:1', 3, 15)], teams);
    career = recordRace(career, 20, [row('velox:0', 1, 25, true, true), row('aurora:0', 2, 18), row('velox:1', 3, 15)], teams);
    const drivers = driverStandings(career.results, teams);
    // aurora-0 and velox-0 tie on 43 points, a win and two podiums each; the id breaks the tie.
    assert.equal(drivers[0].driverId, 'aurora-0');
    assert.equal(drivers.find((d) => d.driverId === 'velox-0')?.points, 43);
    assert.equal(drivers.find((d) => d.driverId === 'aurora-0')?.wins, 1);
    assert.equal(drivers.find((d) => d.driverId === 'aurora-1')?.podiums, 1);
    const constructors = teamStandings(career.results, teams);
    assert.equal(constructors[0].teamId, 'aurora');
    assert.equal(constructors[0].points, 25 + 18 + 15);
    assert.equal(constructors.find((t) => t.teamId === 'velox')?.points, 18 + 25 + 15);
  });

  it("keeps points with the driver, and the team's points with the team, when a driver changes seat", () => {
    // Race 2 has velox-0 driving Aurora's second car.
    const moved = teams.map((t) => (t.id === 'aurora' ? { ...t, drivers: [t.drivers[0], teams.find((x) => x.id === 'velox')!.drivers[0]] as typeof t.drivers } : t));
    let career = newCareer('aurora', 5);
    career = recordRace(career, 20, [row('velox:0', 1, 25)], teams);
    career = recordRace(career, 20, [row('aurora:1', 1, 25)], moved);
    const drivers = driverStandings(career.results, moved);
    assert.equal(drivers.find((d) => d.driverId === 'velox-0')?.points, 50);
    assert.equal(drivers.find((d) => d.driverId === 'aurora-1')?.points ?? 0, 0);
    const constructors = teamStandings(career.results, moved);
    assert.equal(constructors.find((t) => t.teamId === 'velox')?.points, 25);
    assert.equal(constructors.find((t) => t.teamId === 'aurora')?.points, 25);
  });

  it('does not count wins or podiums for retired cars', () => {
    let career = newCareer('aurora', 5);
    career = recordRace(career, 20, [row('aurora:0', 1, 0, false)], teams);
    const d = driverStandings(career.results, teams).find((x) => x.driverId === 'aurora-0');
    assert.equal(d?.wins, 0);
    assert.equal(d?.podiums, 0);
  });

  it('derives stable, distinct seeds per round', () => {
    const career = newCareer('aurora', 1234);
    assert.equal(raceSeed(career, 2), raceSeed(career, 2));
    assert.notEqual(raceSeed(career, 0), raceSeed(career, 1));
  });

  it('keeps first-season seeds as they always were, and gives later seasons new ones', () => {
    const first = newCareer('aurora', 1234);
    for (let round = 0; round < 10; round++) assert.equal(raceSeed(first, round), (1234 + round * 7919) >>> 0);
    const second: Career = { ...first, season: 2, roundsBefore: 10 };
    for (let round = 0; round < 10; round++) assert.notEqual(raceSeed(second, round), raceSeed(first, round));
  });

  it('summarises a round by its winner and the best finish of the player team', () => {
    const c = recordRace(
      newCareer('cobalt', 1),
      10,
      [row('aurora:0', 1, 25), row('velox:1', 2, 18), row('cobalt:1', 3, 15), row('cobalt:0', 20, 0, false)],
      teams,
    );
    assert.deepEqual(roundSummary(c.results[0], 'cobalt'), { winnerDriverId: 'aurora-0', playerBest: 3, playerPoints: 15 });
  });

  it('reports no best finish when both player cars retire', () => {
    const c = recordRace(newCareer('cobalt', 1), 10, [row('aurora:0', 1, 25), row('cobalt:0', 19, 0, false), row('cobalt:1', 20, 0, false)], teams);
    assert.equal(roundSummary(c.results[0], 'cobalt').playerBest, null);
  });
});
