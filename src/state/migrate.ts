/**
 * Reading a saved career, from any version this game has written. Pure: it
 * takes the stored text and returns a career, or the reason it cannot, so a
 * save the game does not understand is reported rather than quietly replaced.
 */

import type { TeamDef } from '../engine/types.ts';
import { driverIdFor } from './season.ts';
import type { Career, RaceRecord, RaceRecordRow } from './season.ts';

export const CAREER_VERSION = 2;

export type SaveResult = { status: 'none' } | { status: 'ok'; career: Career } | { status: 'unreadable'; reason: string };

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

function readRows(rows: unknown, needDriver: boolean): Raw[] | null {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (!isObject(r) || typeof r.carId !== 'string' || !r.carId.includes(':')) return null;
    if (typeof r.position !== 'number' || typeof r.points !== 'number' || typeof r.finished !== 'boolean') return null;
    if (needDriver && typeof r.driverId !== 'string') return null;
  }
  return rows as Raw[];
}

function readResults(results: unknown, needDriver: boolean): Raw[] | null {
  if (!Array.isArray(results)) return null;
  for (const race of results) {
    if (!isObject(race) || typeof race.trackId !== 'string' || readRows(race.rows, needDriver) === null) return null;
  }
  return results as Raw[];
}

/** What every version shares: a seed, a team on this grid, a calendar and this season's results. */
function readCommon(raw: Raw, teams: readonly TeamDef[], needDriver: boolean): { reason: string } | { results: Raw[] } {
  if (!isInt(raw.seed, 0)) return { reason: 'the data is damaged' };
  if (typeof raw.playerTeamId !== 'string' || !teams.some((t) => t.id === raw.playerTeamId)) return { reason: 'its team is not on the grid' };
  if (!Array.isArray(raw.calendar) || !raw.calendar.every((id) => typeof id === 'string')) return { reason: 'the data is damaged' };
  const results = readResults(raw.results, needDriver);
  if (!results) return { reason: 'the data is damaged' };
  return { results };
}

/** Version 1 (milestones 1 to 4): one season, rows keyed by car seat only. */
function fromVersion1(raw: Raw, teams: readonly TeamDef[]): SaveResult {
  const common = readCommon(raw, teams, false);
  if ('reason' in common) return { status: 'unreadable', reason: common.reason };
  // The team editor never changes driver ids, so the seat's driver today is the one who raced there.
  const results = common.results.map((race) => ({
    ...(race as unknown as RaceRecord),
    rows: (race.rows as Raw[]).map((r) => ({ ...(r as unknown as RaceRecordRow), driverId: driverIdFor(teams, r.carId as string) })),
  }));
  return {
    status: 'ok',
    career: {
      version: 2,
      seed: raw.seed as number,
      playerTeamId: raw.playerTeamId as string,
      calendar: raw.calendar as string[],
      results,
      season: 1,
      roundsBefore: 0,
    },
  };
}

function fromVersion2(raw: Raw, teams: readonly TeamDef[]): SaveResult {
  const common = readCommon(raw, teams, true);
  if ('reason' in common) return { status: 'unreadable', reason: common.reason };
  if (!isInt(raw.season, 1) || !isInt(raw.roundsBefore, 0)) return { status: 'unreadable', reason: 'the data is damaged' };
  return { status: 'ok', career: raw as unknown as Career };
}

function parseOne(text: string, teams: readonly TeamDef[]): SaveResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'unreadable', reason: 'the data is damaged' };
  }
  if (!isObject(raw) || typeof raw.version !== 'number') return { status: 'unreadable', reason: 'the data is damaged' };
  if (raw.version > CAREER_VERSION) return { status: 'unreadable', reason: 'it was made by a newer version of the game' };
  if (raw.version === 2) return fromVersion2(raw, teams);
  if (raw.version === 1) return fromVersion1(raw, teams);
  return { status: 'unreadable', reason: 'the data is damaged' };
}

/**
 * The saved career, from the current save if there is one, or else from a
 * milestone 4 save, which is moved up to the current version.
 */
export function parseSave(currentText: string | null, version1Text: string | null, teams: readonly TeamDef[]): SaveResult {
  if (currentText !== null) return parseOne(currentText, teams);
  if (version1Text !== null) return parseOne(version1Text, teams);
  return { status: 'none' };
}
