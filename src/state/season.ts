/**
 * Season state and standings. Pure data and functions (no browser APIs), so
 * the logic is easy to unit test.
 */

import { SEASON_CALENDAR } from '../data/tracks.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import type { TeamDef } from '../engine/types.ts';
import { startingMoney } from './finance.ts';

export interface RaceRecordRow {
  /** The car: team id and seat, as `team:0` or `team:1`. Team points follow the car. */
  carId: string;
  /** The driver in that car for this race. Driver points follow the driver, wherever they race next. */
  driverId: string;
  position: number;
  grid: number;
  points: number;
  finished: boolean;
  fastestLap: boolean;
  outReason: string | null;
}

export interface RaceRecord {
  round: number;
  trackId: string;
  laps: number;
  rows: RaceRecordRow[];
}

/** One line of the team's accounts, in millions of pounds; income positive, costs negative. */
export interface LedgerEntry {
  season: number;
  round: number;
  label: string;
  amount: number;
}

/** A player driver's deal: salary per race in millions of pounds, and seasons left to run. */
export interface DriverContract {
  driverId: string;
  salary: number;
  seasonsLeft: number;
}

export interface Career {
  version: 2;
  seed: number;
  playerTeamId: string;
  /** Track ids in race order. */
  calendar: string[];
  /** This season's races. */
  results: RaceRecord[];
  /** 1 for the first season. */
  season: number;
  /** Rounds raced in earlier seasons, so every round of a career has its own seed. */
  roundsBefore: number;
  /** Money in millions of pounds, and the newest ledger lines first. */
  finance: { balance: number; ledger: LedgerEntry[] };
  /** The player team's two drivers, in seat order. */
  drivers: [DriverContract, DriverContract];
}

export const CALENDAR: readonly string[] = SEASON_CALENDAR;

export function newCareer(playerTeamId: string, teams: readonly TeamDef[], seed = Math.floor(Math.random() * 2 ** 31)): Career {
  return { version: 2, seed, playerTeamId, calendar: [...CALENDAR], results: [], season: 1, roundsBefore: 0, ...startingMoney(teams, playerTeamId) };
}

/** Index of the next race to run (equals the number of races completed). */
export function currentRound(career: Career): number {
  return career.results.length;
}

export function isSeasonOver(career: Career): boolean {
  return career.results.length >= career.calendar.length;
}

/** The driver who sat in a car, from the teams the race was run with. */
export function driverIdFor(teams: readonly TeamDef[], carId: string): string {
  const [teamId, seat] = carId.split(':');
  return teams.find((t) => t.id === teamId)?.drivers[Number(seat) as 0 | 1]?.id ?? `${teamId}-${seat}`;
}

export function recordRace(career: Career, laps: number, rows: readonly ScoredRow[], teams: readonly TeamDef[]): Career {
  const round = career.results.length;
  const record: RaceRecord = {
    round,
    trackId: career.calendar[round],
    laps,
    rows: rows.map((r) => ({
      carId: r.carId,
      driverId: driverIdFor(teams, r.carId),
      position: r.position,
      grid: r.grid,
      points: r.points,
      finished: r.finished,
      fastestLap: r.fastestLap,
      outReason: r.outReason,
    })),
  };
  return { ...career, results: [...career.results, record] };
}

export interface DriverStanding {
  driverId: string;
  /** The team the driver races for now, or last raced for. */
  teamId: string;
  points: number;
  wins: number;
  podiums: number;
}

export interface TeamStanding {
  teamId: string;
  points: number;
  wins: number;
}

export function driverStandings(results: readonly RaceRecord[], teams: readonly TeamDef[]): DriverStanding[] {
  const table = new Map<string, DriverStanding>();
  for (const team of teams) {
    for (const driver of team.drivers) table.set(driver.id, { driverId: driver.id, teamId: team.id, points: 0, wins: 0, podiums: 0 });
  }
  for (const race of results) {
    for (const row of race.rows) {
      // A driver no longer on the grid keeps the points they scored, under the team they last raced for.
      let entry = table.get(row.driverId);
      if (!entry) {
        entry = { driverId: row.driverId, teamId: row.carId.split(':')[0], points: 0, wins: 0, podiums: 0 };
        table.set(row.driverId, entry);
      }
      entry.points += row.points;
      if (row.finished && row.position === 1) entry.wins++;
      if (row.finished && row.position <= 3) entry.podiums++;
    }
  }
  return [...table.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.driverId.localeCompare(b.driverId),
  );
}

export function teamStandings(results: readonly RaceRecord[], teams: readonly TeamDef[]): TeamStanding[] {
  const byTeam = new Map<string, TeamStanding>();
  for (const team of teams) byTeam.set(team.id, { teamId: team.id, points: 0, wins: 0 });
  for (const race of results) {
    for (const row of race.rows) {
      const t = byTeam.get(row.carId.split(':')[0]);
      if (!t) continue;
      t.points += row.points;
      if (row.finished && row.position === 1) t.wins++;
    }
  }
  return [...byTeam.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.teamId.localeCompare(b.teamId));
}

export interface RoundSummary {
  winnerDriverId: string | null;
  /** Best classified finish of the player's two cars, or null if neither finished. */
  playerBest: number | null;
  playerPoints: number;
}

/** What the calendar shows for a finished round. */
export function roundSummary(race: RaceRecord, playerTeamId: string): RoundSummary {
  const winner = race.rows.find((r) => r.position === 1 && r.finished);
  const mine = race.rows.filter((r) => r.carId.startsWith(`${playerTeamId}:`));
  const finished = mine.filter((r) => r.finished).map((r) => r.position);
  return {
    winnerDriverId: winner?.driverId ?? null,
    playerBest: finished.length > 0 ? Math.min(...finished) : null,
    playerPoints: mine.reduce((sum, r) => sum + r.points, 0),
  };
}

/**
 * Seed for a round, so every race weekend is reproducible. It counts rounds
 * across the whole career, so a second season does not replay the first one's
 * weather and grids; first-season seeds are what they always were.
 */
export function raceSeed(career: Career, round: number): number {
  return (career.seed + (career.roundsBefore + round) * 7919) >>> 0;
}
