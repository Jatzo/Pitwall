/**
 * The team's money, in millions of pounds. A race pays a start fee and prize
 * money by points, and costs driver salaries, running costs and repairs. The
 * balance may fall below zero through running costs; while it does, no
 * upgrade can be started (see development), and the debt carries over.
 */

import { carOverall } from '../data/teams.ts';
import type { DriverDef, TeamDef } from '../engine/types.ts';
import type { Career, DriverContract, LedgerEntry } from './season.ts';

/** Every amount the economy uses, in one place so the season script can tune them. */
export const ECONOMY = {
  /** Starting balance for the weakest and the strongest car. */
  startMin: 10,
  startMax: 17,
  /** Paid to every team that starts a race. */
  startFee: 0.5,
  perPoint: 0.1,
  running: 0.4,
  /** A car retired by a collision; damage that does not retire a car is not recorded. */
  repair: 0.5,
  /** A driver's salary per race, from the weakest to the strongest driver. */
  salaryMin: 0.1,
  salaryMax: 0.4,
  ledgerKeep: 40,
} as const;

const money = (n: number): number => Math.round(n * 100) / 100;

export function startingBalance(teams: readonly TeamDef[], teamId: string): number {
  const strengths = teams.map((t) => carOverall(t.car));
  const lo = Math.min(...strengths);
  const hi = Math.max(...strengths);
  const team = teams.find((t) => t.id === teamId);
  if (!team || hi === lo) return ECONOMY.startMin;
  return money(ECONOMY.startMin + ((ECONOMY.startMax - ECONOMY.startMin) * (carOverall(team.car) - lo)) / (hi - lo));
}

/** Salary per race, from the driver's average rating: 60 earns the least, 90 or more the most. */
export function salaryFor(driver: DriverDef): number {
  const r = Object.values(driver.ratings);
  const avg = r.reduce((s, v) => s + v, 0) / r.length;
  const k = Math.max(0, Math.min(1, (avg - 60) / 30));
  return money(ECONOMY.salaryMin + k * (ECONOMY.salaryMax - ECONOMY.salaryMin));
}

/** A new team's money and contracts: its own two drivers, one signed for two seasons and one for one. */
export function startingMoney(teams: readonly TeamDef[], teamId: string): Pick<Career, 'finance' | 'drivers'> {
  const team = teams.find((t) => t.id === teamId) ?? teams[0];
  const contract = (d: DriverDef, seasons: number): DriverContract => ({ driverId: d.id, salary: salaryFor(d), seasonsLeft: seasons });
  return {
    finance: { balance: startingBalance(teams, team.id), ledger: [] },
    drivers: [contract(team.drivers[0], 2), contract(team.drivers[1], 1)],
  };
}

/** Books the most recent race: returns the career with the new balance, and the race's ledger lines. */
export function settleRace(career: Career): { career: Career; lines: LedgerEntry[] } {
  const race = career.results[career.results.length - 1];
  if (!race) return { career, lines: [] };
  const mine = race.rows.filter((r) => r.carId.startsWith(`${career.playerTeamId}:`));
  const points = mine.reduce((s, r) => s + r.points, 0);
  const collisions = mine.filter((r) => r.outReason === 'Collision').length;
  const line = (label: string, amount: number): LedgerEntry => ({ season: career.season, round: race.round, label, amount: money(amount) });
  const lines: LedgerEntry[] = [line('Start money', ECONOMY.startFee)];
  if (points > 0) lines.push(line(`Prize money (${points === 1 ? '1 point' : `${points} points`})`, points * ECONOMY.perPoint));
  lines.push(line('Driver salaries', -(career.drivers[0].salary + career.drivers[1].salary)));
  lines.push(line('Running costs', -ECONOMY.running));
  if (collisions > 0) lines.push(line(collisions === 1 ? 'Repairs (one car)' : 'Repairs (both cars)', -ECONOMY.repair * collisions));
  const balance = money(career.finance.balance + lines.reduce((s, l) => s + l.amount, 0));
  return {
    career: { ...career, finance: { balance, ledger: [...lines, ...career.finance.ledger].slice(0, ECONOMY.ledgerKeep) } },
    lines,
  };
}
