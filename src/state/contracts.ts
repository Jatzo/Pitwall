/**
 * Driver contracts and the change of season. A contract runs for a number of
 * seasons; when it ends, the player re-signs the driver at an asking salary
 * that follows their points, or signs a free agent at theirs. Only the
 * player's two seats change: rival teams keep their drivers.
 */

import { FREE_AGENTS } from '../data/drivers.ts';
import type { DriverDef, TeamDef } from '../engine/types.ts';
import { carryOver } from './development.ts';
import { salaryFor } from './finance.ts';
import { CALENDAR, driverStandings, isSeasonOver } from './season.ts';
import type { Career, DriverContract } from './season.ts';

export type SeatDecision = { kind: 'renew'; seasons: 1 | 2 } | { kind: 'sign'; driverId: string; seasons: 1 | 2 };

const money = (n: number): number => Math.round(n * 100) / 100;

/** Seats whose contracts end with this season, so a decision is needed before the next. */
export function expiringSeats(career: Career): (0 | 1)[] {
  return ([0, 1] as const).filter((seat) => career.drivers[seat].seasonsLeft <= 1);
}

/** What the driver in a seat asks to stay: from 85% of their base salary with no points to 120% for the season's top scorer. */
export function askingSalary(career: Career, teams: readonly TeamDef[], seat: 0 | 1): number {
  const id = career.drivers[seat].driverId;
  const driver = teams.find((t) => t.id === career.playerTeamId)?.drivers.find((d) => d.id === id);
  if (!driver) return career.drivers[seat].salary;
  const table = driverStandings(career.results, teams);
  const top = table[0]?.points ?? 0;
  const mine = table.find((s) => s.driverId === id)?.points ?? 0;
  return money(salaryFor(driver) * (0.85 + 0.35 * (top > 0 ? mine / top : 0)));
}

/** Free agents the player has not signed. */
export function freeAgents(career: Career): DriverDef[] {
  return FREE_AGENTS.filter((d) => !career.drivers.some((c) => c.driverId === d.id));
}

/**
 * The career at the start of the next season: money, car and contracts carry
 * over, every gain drifts back, the sponsor's deal has ended and the calendar
 * starts again. `teams` is the grid as it raced, for the asking salaries.
 */
export function startNextSeason(career: Career, teams: readonly TeamDef[], decisions: [SeatDecision | null, SeatDecision | null]): Career {
  if (!isSeasonOver(career)) throw new Error('The season is not over yet');
  const contract = (seat: 0 | 1): DriverContract => {
    const current = career.drivers[seat];
    const decision = decisions[seat];
    if (!decision) {
      if (current.seasonsLeft <= 1) throw new Error(`Seat ${seat + 1}: the contract has ended and needs a decision`);
      return { ...current, seasonsLeft: current.seasonsLeft - 1 };
    }
    if (decision.kind === 'renew') return { driverId: current.driverId, salary: askingSalary(career, teams, seat), seasonsLeft: decision.seasons };
    const agent = freeAgents(career).find((d) => d.id === decision.driverId);
    const other = decisions[seat === 0 ? 1 : 0];
    if (!agent || (other?.kind === 'sign' && other.driverId === agent.id)) throw new Error(`Seat ${seat + 1}: ${decision.driverId} is not a free agent`);
    return { driverId: agent.id, salary: salaryFor(agent), seasonsLeft: decision.seasons };
  };
  return {
    ...career,
    season: career.season + 1,
    roundsBefore: career.roundsBefore + career.results.length,
    results: [],
    calendar: [...CALENDAR],
    drivers: [contract(0), contract(1)],
    development: carryOver(career.development),
    sponsor: null,
  };
}
