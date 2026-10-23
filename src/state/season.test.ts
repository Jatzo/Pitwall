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
    assert.equal(currentRound(career), 0);
    assert.equal(isSeasonOver(career), false);
    career = recordRace(career, 20, [row('aurora:0', 1, 25)]);
    assert.equal(currentRound(career), 1);
    assert.equal(career.results[0].trackId, career.calendar[0]);
  });

  it('accumulates driver and constructor points with wins and podiums', () => {
    let career = newCareer('aurora', 5);
    career = recordRace(career, 20, [row('aurora:0', 1, 25), row('velox:0', 2, 18), row('aurora:1', 3, 15)]);
    career = recordRace(career, 20, [row('velox:0', 1, 25, true, true), row('aurora:0', 2, 18), row('velox:1', 3, 15)]);
    const drivers = driverStandings(career.results, teams);
    assert.equal(drivers[0].carId, 'aurora:0'); // 25 + 18 = 43 beats velox:0's 18 + 25 = 43 on wins tie-break (1 each, podiums 2 each) then id
    assert.equal(drivers.find((d) => d.carId === 'velox:0')?.points, 43);
    assert.equal(drivers.find((d) => d.carId === 'aurora:0')?.wins, 1);
    assert.equal(drivers.find((d) => d.carId === 'aurora:1')?.podiums, 1);
    const constructors = teamStandings(career.results, teams);
    assert.equal(constructors[0].teamId, 'aurora');
    assert.equal(constructors[0].points, 25 + 18 + 15);
    assert.equal(constructors.find((t) => t.teamId === 'velox')?.points, 18 + 25 + 15);
  });

  it('does not count wins or podiums for retired cars', () => {
    let career = newCareer('aurora', 5);
    career = recordRace(career, 20, [row('aurora:0', 1, 0, false)]);
    const d = driverStandings(career.results, teams).find((x) => x.carId === 'aurora:0');
    assert.equal(d?.wins, 0);
    assert.equal(d?.podiums, 0);
  });

  it('derives stable, distinct seeds per round', () => {
    const career = newCareer('aurora', 1234);
    assert.equal(raceSeed(career, 2), raceSeed(career, 2));
    assert.notEqual(raceSeed(career, 0), raceSeed(career, 1));
  });

  it('summarises a round by its winner and the best finish of the player team', () => {
    const c = recordRace(newCareer('cobalt', 1), 10, [
      row('aurora:0', 1, 25),
      row('velox:1', 2, 18),
      row('cobalt:1', 3, 15),
      row('cobalt:0', 20, 0, false),
    ]);
    assert.deepEqual(roundSummary(c.results[0], 'cobalt'), { winnerCarId: 'aurora:0', playerBest: 3, playerPoints: 15 });
  });

  it('reports no best finish when both player cars retire', () => {
    const c = recordRace(newCareer('cobalt', 1), 10, [row('aurora:0', 1, 25), row('cobalt:0', 19, 0, false), row('cobalt:1', 20, 0, false)]);
    assert.equal(roundSummary(c.results[0], 'cobalt').playerBest, null);
  });
});
