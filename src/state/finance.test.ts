import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { carOverall, defaultTeams } from '../data/teams.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import { ECONOMY, salaryFor, settleRace, startingBalance } from './finance.ts';
import { parseSave } from './migrate.ts';
import { newCareer, recordRace } from './season.ts';
import type { Career } from './season.ts';

const teams = defaultTeams();

function row(carId: string, position: number, points: number, outReason: string | null = null): ScoredRow {
  const finished = outReason === null;
  return { position, carId, grid: position, laps: 10, finished, timeS: finished ? 1000 : null, gapS: null, lapsDown: 0, bestLap: 90, pitStops: 1, penaltyS: 0, outReason, points, fastestLap: false };
}

function raced(career: Career, rows: ScoredRow[]): Career {
  return recordRace(career, 20, rows, teams);
}

describe('money', () => {
  it('gives the strongest car the most to start with and the weakest the least', () => {
    const byStrength = [...teams].sort((a, b) => carOverall(a.car) - carOverall(b.car));
    assert.equal(startingBalance(teams, byStrength[0].id), ECONOMY.startMin);
    assert.equal(startingBalance(teams, byStrength[byStrength.length - 1].id), ECONOMY.startMax);
    for (const t of byStrength.slice(1, -1)) {
      const b = startingBalance(teams, t.id);
      assert.ok(b >= ECONOMY.startMin && b <= ECONOMY.startMax, `${t.id} ${b}`);
    }
  });

  it('starts a career with that balance and both drivers on contracts', () => {
    const career = newCareer('cobalt', teams, 5);
    assert.equal(career.finance.balance, startingBalance(teams, 'cobalt'));
    assert.deepEqual(career.finance.ledger, []);
    const cobalt = teams.find((t) => t.id === 'cobalt')!;
    assert.deepEqual(career.drivers.map((d) => d.driverId), cobalt.drivers.map((d) => d.id));
    for (const c of career.drivers) assert.ok(c.salary >= ECONOMY.salaryMin && c.salary <= ECONOMY.salaryMax && c.seasonsLeft >= 1);
  });

  it('pays better drivers more', () => {
    const drivers = teams.flatMap((t) => t.drivers);
    const avg = (d: (typeof drivers)[number]) => Object.values(d.ratings).reduce((s, v) => s + v, 0);
    const best = drivers.reduce((a, b) => (avg(b) > avg(a) ? b : a));
    const worst = drivers.reduce((a, b) => (avg(b) < avg(a) ? b : a));
    assert.ok(salaryFor(best) > salaryFor(worst));
  });

  it("books a race's start money, prize money, salaries and running costs, and the balance moves by their sum", () => {
    let career = newCareer('aurora', teams, 5);
    career = raced(career, [row('aurora:0', 2, 18), row('aurora:1', 5, 10), row('velox:0', 1, 25)]);
    const before = career.finance.balance;
    const { career: after, lines } = settleRace(career);
    const by = (label: RegExp) => lines.find((l) => label.test(l.label))?.amount;
    assert.equal(by(/^Start money/), ECONOMY.startFee);
    assert.equal(by(/^Prize money/), Math.round(28 * ECONOMY.perPoint * 100) / 100);
    assert.equal(by(/^Driver salaries/), -Math.round((career.drivers[0].salary + career.drivers[1].salary) * 100) / 100);
    assert.equal(by(/^Running costs/), -ECONOMY.running);
    assert.equal(by(/^Repairs/), undefined, 'no repairs without a collision');
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    assert.ok(Math.abs(after.finance.balance - (before + sum)) < 1e-9);
    assert.deepEqual(after.finance.ledger.slice(0, lines.length), lines);
    for (const l of lines) assert.equal(l.round, 0);
  });

  it('charges repairs only for a car retired by a collision', () => {
    let career = newCareer('aurora', teams, 5);
    career = raced(career, [row('aurora:0', 19, 0, 'Collision'), row('aurora:1', 20, 0, 'Engine'), row('velox:0', 18, 0, 'Collision')]);
    const repairs = settleRace(career).lines.find((l) => /^Repairs/.test(l.label));
    assert.equal(repairs?.amount, -ECONOMY.repair);
  });

  it('says "1 point" for a single point', () => {
    const career = raced(newCareer('aurora', teams, 5), [row('aurora:0', 10, 1)]);
    assert.ok(settleRace(career).lines.some((l) => l.label === 'Prize money (1 point)'));
  });

  it('lets running costs take the balance below zero', () => {
    let career = newCareer('aurora', teams, 5);
    career = { ...career, finance: { ...career.finance, balance: 0.1 } };
    career = raced(career, [row('aurora:0', 15, 0), row('aurora:1', 16, 0)]);
    assert.ok(settleRace(career).career.finance.balance < 0);
  });

  it('keeps the newest ledger lines and drops the oldest', () => {
    let career = newCareer('aurora', teams, 5);
    for (let i = 0; i < 12; i++) {
      career = raced(career, [row('aurora:0', 3, 15)]);
      career = settleRace(career).career;
    }
    assert.equal(career.finance.ledger.length, ECONOMY.ledgerKeep);
    assert.equal(career.finance.ledger[0].round, 11);
  });

  it('gives a save from before money existed its starting balance and contracts', () => {
    const v1 = readFileSync(new URL('./fixtures/career-v1.json', import.meta.url), 'utf8');
    const result = parseSave(null, v1, teams);
    assert.equal(result.status, 'ok');
    const career = (result as { career: Career }).career;
    assert.equal(career.finance.balance, startingBalance(teams, career.playerTeamId));
    assert.equal(career.drivers.length, 2);
    // A version 2 save written before money existed gets the same.
    const older: Partial<Career> = { ...career };
    delete older.finance;
    delete older.drivers;
    delete older.development;
    const again = parseSave(JSON.stringify(older), null, teams);
    assert.equal(again.status, 'ok');
    assert.equal((again as { career: Career }).career.finance.balance, startingBalance(teams, career.playerTeamId));
    assert.deepEqual((again as { career: Career }).career.development, { gains: {}, projects: [], delivered: [] });
  });
});
