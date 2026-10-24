import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { carOverall, defaultTeams } from '../data/teams.ts';
import { settleRace } from './finance.ts';
import { chooseSponsor, describeObjective, objectiveMet, sponsorOffers, sponsorRecord } from './sponsors.ts';
import { newCareer, recordRace } from './season.ts';
import type { Career, Objective, RaceRecordRow } from './season.ts';
import type { ScoredRow } from '../engine/scoring.ts';

const teams = defaultTeams();
const byStrength = [...teams].sort((a, b) => carOverall(b.car) - carOverall(a.car));

function row(carId: string, position: number, points = 0, finished = true): RaceRecordRow {
  return { carId, driverId: carId.replace(':', '-'), position, grid: position, points, finished, fastestLap: false, outReason: finished ? null : 'Engine' };
}

const scored = (r: RaceRecordRow): ScoredRow => ({ ...r, laps: 10, timeS: 1000, gapS: null, lapsDown: 0, bestLap: 90, pitStops: 1, penaltyS: 0 });

describe('sponsors', () => {
  it('offers three deals from the seed and the season, the same every time', () => {
    const c = newCareer('solstice', teams, 7);
    const offers = sponsorOffers(c, teams);
    assert.equal(offers.length, 3);
    assert.equal(new Set(offers.map((o) => o.name)).size, 3);
    assert.deepEqual(sponsorOffers(c, teams), offers);
    assert.notDeepEqual(sponsorOffers({ ...c, season: 2 }, teams), offers);
  });

  it('trades a high base payment for a big bonus, from the safe deal to the ambitious one', () => {
    const [safe, balanced, ambitious] = sponsorOffers(newCareer('cobalt', teams, 3), teams);
    assert.ok(safe.base > balanced.base && balanced.base > ambitious.base);
    assert.ok(safe.bonus < balanced.bonus && balanced.bonus < ambitious.bonus);
  });

  it('sets harder targets for a stronger car', () => {
    const balanced = (id: string) => sponsorOffers(newCareer(id, teams, 3), teams)[1].objective;
    const top = balanced(byStrength[0].id);
    const back = balanced(byStrength[byStrength.length - 1].id);
    assert.equal(top.kind, 'topN');
    assert.equal(back.kind, 'topN');
    assert.ok((top as { n: number }).n < (back as { n: number }).n);
    // The ambitious deal names a team ahead of the player's, or asks the strongest car to win.
    const ambitious = sponsorOffers(newCareer(byStrength[4].id, teams, 3), teams)[2].objective as { kind: 'beat'; teamId: string };
    assert.equal(ambitious.kind, 'beat');
    assert.ok(byStrength.findIndex((t) => t.id === ambitious.teamId) < 4);
    assert.deepEqual(sponsorOffers(newCareer(byStrength[0].id, teams, 3), teams)[2].objective, { kind: 'topN', n: 1 });
  });

  it('judges each objective from the race rows', () => {
    const rows = [row('velox:0', 1, 25), row('cobalt:0', 6, 8), row('velox:1', 9, 2), row('cobalt:1', 15, 0, false)];
    const met = (o: Objective) => objectiveMet(o, rows, 'cobalt');
    assert.equal(met({ kind: 'points' }), true);
    assert.equal(met({ kind: 'bothFinish' }), false);
    assert.equal(met({ kind: 'topN', n: 6 }), true);
    assert.equal(met({ kind: 'topN', n: 5 }), false);
    assert.equal(met({ kind: 'beat', teamId: 'velox' }), false);
    assert.equal(objectiveMet({ kind: 'beat', teamId: 'cobalt' }, rows, 'velox'), true);
    // A retired car does not count for a top finish.
    assert.equal(objectiveMet({ kind: 'topN', n: 20 }, [row('cobalt:0', 3, 0, false), row('cobalt:1', 4, 0, false)], 'cobalt'), false);
  });

  it('describes objectives in plain words', () => {
    assert.equal(describeObjective({ kind: 'topN', n: 1 }, teams), 'Win the race');
    assert.equal(describeObjective({ kind: 'topN', n: 6 }, teams), 'A car in the top 6');
    assert.equal(describeObjective({ kind: 'beat', teamId: 'velox' }, teams), 'Finish ahead of both Velox cars');
  });

  it('pays the base every race and the bonus only when the objective is met', () => {
    let c = newCareer('cobalt', teams, 3);
    const deal = { ...sponsorOffers(c, teams)[0], objective: { kind: 'bothFinish' } as Objective };
    c = chooseSponsor(c, deal);
    const finished = settleRace(recordRace(c, 20, [scored(row('cobalt:0', 8, 4)), scored(row('cobalt:1', 12))], teams)).lines;
    assert.ok(finished.some((l) => l.label === `Sponsor: ${deal.name}` && l.amount === deal.base));
    assert.ok(finished.some((l) => l.label.startsWith('Sponsor bonus') && l.amount === deal.bonus));
    const retired = settleRace(recordRace(c, 20, [scored(row('cobalt:0', 8, 4)), scored(row('cobalt:1', 20, 0, false))], teams)).lines;
    assert.ok(retired.some((l) => l.label === `Sponsor: ${deal.name}`));
    assert.ok(!retired.some((l) => l.label.startsWith('Sponsor bonus')));
  });

  it('pays nothing without a deal, and a deal ends with its season', () => {
    const c = newCareer('cobalt', teams, 3);
    const lines = settleRace(recordRace(c, 20, [scored(row('cobalt:0', 8, 4))], teams)).lines;
    assert.ok(!lines.some((l) => l.label.startsWith('Sponsor')));
    const signed = chooseSponsor(c, sponsorOffers(c, teams)[1]);
    const nextSeason: Career = { ...signed, season: 2, roundsBefore: signed.calendar.length };
    const later = settleRace(recordRace(nextSeason, 20, [scored(row('cobalt:0', 8, 4))], teams)).lines;
    assert.ok(!later.some((l) => l.label.startsWith('Sponsor')));
  });

  it('signs one deal a season', () => {
    const c = newCareer('cobalt', teams, 3);
    const [a, b] = sponsorOffers(c, teams);
    const signed = chooseSponsor(c, a);
    assert.equal(signed.sponsor?.name, a.name);
    assert.throws(() => chooseSponsor(signed, b));
    const next = { ...signed, season: 2 };
    assert.equal(chooseSponsor(next, sponsorOffers(next, teams)[0]).sponsor?.season, 2);
  });

  it("counts this season's races in which the objective was met", () => {
    let c = newCareer('cobalt', teams, 3);
    assert.equal(sponsorRecord(c), null);
    c = chooseSponsor(c, { ...sponsorOffers(c, teams)[0], objective: { kind: 'bothFinish' } });
    c = recordRace(c, 20, [scored(row('cobalt:0', 8)), scored(row('cobalt:1', 12))], teams);
    c = recordRace(c, 20, [scored(row('cobalt:0', 8)), scored(row('cobalt:1', 20, 0, false))], teams);
    assert.deepEqual(sponsorRecord(c), { met: 1, races: 2 });
    assert.equal(sponsorRecord({ ...c, season: 2 }), null, 'a deal from last season has no record this season');
    // Signed after a race: that race is not the sponsor's.
    let late = recordRace(newCareer('cobalt', teams, 3), 20, [scored(row('cobalt:0', 8)), scored(row('cobalt:1', 12))], teams);
    late = chooseSponsor(late, { ...sponsorOffers(late, teams)[0], objective: { kind: 'bothFinish' } });
    late = recordRace(late, 20, [scored(row('cobalt:0', 8)), scored(row('cobalt:1', 20, 0, false))], teams);
    assert.deepEqual(sponsorRecord(late), { met: 0, races: 1 });
  });
});
