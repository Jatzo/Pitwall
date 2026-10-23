/**
 * Season state and standings. Pure data and functions (no browser APIs), so
 * the logic is easy to unit test.
 */

import { SEASON_CALENDAR } from '../data/tracks.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import type { TeamDef } from '../engine/types.ts';

export interface RaceRecordRow {
  carId: string;
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

export interface Career {
  version: 1;
  seed: number;
  playerTeamId: string;
  /** Track ids in race order. */
  calendar: string[];
  results: RaceRecord[];
}

export const CALENDAR: readonly string[] = SEASON_CALENDAR;

export function newCareer(playerTeamId: string, seed = Math.floor(Math.random() * 2 ** 31)): Career {
  return { version: 1, seed, playerTeamId, calendar: [...CALENDAR], results: [] };
}

/** Index of the next race to run (equals the number of races completed). */
export function currentRound(career: Career): number {
  return career.results.length;
}

export function isSeasonOver(career: Career): boolean {
  return career.results.length >= career.calendar.length;
}

export function recordRace(career: Career, laps: number, rows: readonly ScoredRow[]): Career {
  const round = career.results.length;
  const record: RaceRecord = {
    round,
    trackId: career.calendar[round],
    laps,
    rows: rows.map((r) => ({
      carId: r.carId,
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
  carId: string;
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
    for (const i of [0, 1] as const) {
      const carId = `${team.id}:${i}`;
      table.set(carId, { carId, teamId: team.id, points: 0, wins: 0, podiums: 0 });
    }
  }
  for (const race of results) {
    for (const row of race.rows) {
      const entry = table.get(row.carId);
      if (!entry) continue;
      entry.points += row.points;
      if (row.finished && row.position === 1) entry.wins++;
      if (row.finished && row.position <= 3) entry.podiums++;
    }
  }
  return [...table.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.carId.localeCompare(b.carId),
  );
}

export function teamStandings(results: readonly RaceRecord[], teams: readonly TeamDef[]): TeamStanding[] {
  const byTeam = new Map<string, TeamStanding>();
  for (const team of teams) byTeam.set(team.id, { teamId: team.id, points: 0, wins: 0 });
  for (const d of driverStandings(results, teams)) {
    const t = byTeam.get(d.teamId);
    if (t) {
      t.points += d.points;
      t.wins += d.wins;
    }
  }
  return [...byTeam.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.teamId.localeCompare(b.teamId));
}

/** Seed for a given round so every race weekend is reproducible. */
export function raceSeed(career: Career, round: number): number {
  return (career.seed + round * 7919) >>> 0;
}
