import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { parseSave } from './migrate.ts';
import { driverStandings, raceSeed, teamStandings } from './season.ts';

/** A real save from milestone 4, captured from a played season of three rounds. */
const v1Text = readFileSync(new URL('./fixtures/career-v1.json', import.meta.url), 'utf8');
const v1 = JSON.parse(v1Text);
const teams = defaultTeams();

function okCareer(result: ReturnType<typeof parseSave>) {
  assert.equal(result.status, 'ok', result.status === 'unreadable' ? result.reason : result.status);
  return (result as Extract<typeof result, { status: 'ok' }>).career;
}

describe('save migration', () => {
  it('reports no save when there is nothing stored', () => {
    assert.deepEqual(parseSave(null, null, teams), { status: 'none' });
  });

  it('turns a milestone 4 save into version 2 without changing the season', () => {
    const career = okCareer(parseSave(null, v1Text, teams));
    assert.equal(career.version, 2);
    assert.equal(career.season, 1);
    assert.equal(career.roundsBefore, 0);
    assert.equal(career.seed, v1.seed);
    assert.equal(career.playerTeamId, v1.playerTeamId);
    assert.deepEqual(career.calendar, v1.calendar);
    assert.equal(career.results.length, v1.results.length);
    // Every row now names its driver: the driver in that car's seat.
    for (const race of career.results)
      for (const r of race.rows) {
        const [teamId, slot] = r.carId.split(':');
        assert.equal(r.driverId, teams.find((t) => t.id === teamId)!.drivers[Number(slot)].id);
      }
  });

  it('keeps every standing and every race seed exactly as the old save had them', () => {
    const career = okCareer(parseSave(null, v1Text, teams));
    // The old standings summed points by car seat.
    const old = new Map<string, number>();
    for (const race of v1.results) for (const r of race.rows) old.set(r.carId, (old.get(r.carId) ?? 0) + r.points);
    for (const d of driverStandings(career.results, teams)) {
      const [teamId, slot] = d.driverId.split('-');
      assert.equal(d.points, old.get(`${teamId}:${slot}`) ?? 0, d.driverId);
    }
    const oldTeams = new Map<string, number>();
    for (const [carId, pts] of old) oldTeams.set(carId.split(':')[0], (oldTeams.get(carId.split(':')[0]) ?? 0) + pts);
    for (const t of teamStandings(career.results, teams)) assert.equal(t.points, oldTeams.get(t.teamId) ?? 0, t.teamId);
    for (let round = 0; round < 10; round++) assert.equal(raceSeed(career, round), (v1.seed + round * 7919) >>> 0);
  });

  it('prefers a version 2 save over an old one, and reads it back unchanged', () => {
    const migrated = okCareer(parseSave(null, v1Text, teams));
    const stored = JSON.stringify({ ...migrated, season: 3, roundsBefore: 20 });
    const again = okCareer(parseSave(stored, v1Text, teams));
    assert.equal(again.season, 3);
    assert.equal(again.roundsBefore, 20);
    assert.deepEqual(again.results, migrated.results);
  });

  it('refuses a save made by a newer version, so it is never overwritten without asking', () => {
    const newer = JSON.stringify({ ...v1, version: 3 });
    const result = parseSave(newer, null, teams);
    assert.equal(result.status, 'unreadable');
    assert.match((result as { reason: string }).reason, /newer/);
  });

  it('refuses a save whose team is not on the grid', () => {
    const result = parseSave(null, JSON.stringify({ ...v1, playerTeamId: 'nobody' }), teams);
    assert.equal(result.status, 'unreadable');
  });

  it('refuses broken data rather than starting over quietly', () => {
    for (const text of ['{not json', '42', '{"version":1}', JSON.stringify({ ...v1, results: 'x' }), JSON.stringify({ ...v1, results: [{ rows: [{ carId: 5 }] }] }), JSON.stringify({ ...v1, version: 2, season: 1, roundsBefore: 0, results: [], finance: { balance: 'lots', ledger: [] } }), JSON.stringify({ ...v1, version: 2, season: 1, roundsBefore: 0, results: [], drivers: [{ driverId: 'aurora-0', salary: 0.3, seasonsLeft: 1 }, { driverId: 'aurora-0', salary: 0.3, seasonsLeft: 1 }] })]) {
      assert.equal(parseSave(null, text, teams).status, 'unreadable', text.slice(0, 40));
    }
  });
});
