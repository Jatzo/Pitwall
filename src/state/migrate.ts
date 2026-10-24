/**
 * Reading a saved career, from any version this game has written. Pure: it
 * takes the stored text and returns a career, or the reason it cannot, so a
 * save the game does not understand is reported rather than quietly replaced.
 */

import type { TeamDef } from '../engine/types.ts';
import { AREAS, emptyDevelopment } from './development.ts';
import { startingMoney } from './finance.ts';
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
/**
 * Sections added to version 2 after its first saves were written are filled
 * in with a new team's defaults, so those saves keep loading without a new
 * version. A section that is present but damaged makes the save unreadable.
 */
function withSections(raw: Raw, teams: readonly TeamDef[]): Raw | null {
  const fresh = startingMoney(teams, raw.playerTeamId as string);
  const finance = raw.finance ?? fresh.finance;
  if (!isObject(finance) || typeof finance.balance !== 'number' || !Array.isArray(finance.ledger)) return null;
  const drivers = raw.drivers ?? fresh.drivers;
  if (!Array.isArray(drivers) || drivers.length !== 2 || !drivers.every((d) => isObject(d) && typeof d.driverId === 'string' && typeof d.salary === 'number' && isInt(d.seasonsLeft, 0)) || drivers[0].driverId === drivers[1].driverId) return null;
  const development = raw.development ?? emptyDevelopment();
  if (!readDevelopment(development)) return null;
  const sponsor = raw.sponsor ?? null;
  if (sponsor !== null && !readSponsor(sponsor)) return null;
  return { ...raw, finance, drivers, development, sponsor };
}

function readSponsor(deal: unknown): boolean {
  if (!isObject(deal) || typeof deal.name !== 'string' || typeof deal.base !== 'number' || typeof deal.bonus !== 'number' || !isInt(deal.season, 1)) return false;
  if (deal.tier !== 'safe' && deal.tier !== 'balanced' && deal.tier !== 'ambitious') return false;
  const o = deal.objective;
  if (!isObject(o)) return false;
  if (o.kind === 'points' || o.kind === 'bothFinish') return true;
  if (o.kind === 'topN') return isInt(o.n, 1);
  return o.kind === 'beat' && typeof o.teamId === 'string';
}

const isArea = (v: unknown): boolean => typeof v === 'string' && (AREAS as readonly string[]).includes(v);
const isKind = (v: unknown): boolean => v === 'quick' || v === 'upgrade' || v === 'major';

function readDevelopment(dev: unknown): boolean {
  if (!isObject(dev) || !isObject(dev.gains) || !Array.isArray(dev.projects) || !Array.isArray(dev.delivered)) return false;
  if (!Object.entries(dev.gains).every(([a, v]) => isArea(a) && typeof v === 'number')) return false;
  if (!dev.projects.every((p) => isObject(p) && isArea(p.area) && isKind(p.kind) && typeof p.gain === 'number' && typeof p.cost === 'number' && isInt(p.startedAt, 0) && isInt(p.deliverAt, 0))) return false;
  return dev.delivered.every((d) => isObject(d) && isArea(d.area) && isKind(d.kind) && typeof d.gain === 'number');
}

function fromVersion1(raw: Raw, teams: readonly TeamDef[]): SaveResult {
  const common = readCommon(raw, teams, false);
  if ('reason' in common) return { status: 'unreadable', reason: common.reason };
  // The team editor never changes driver ids, so the seat's driver today is the one who raced there.
  const results = common.results.map((race) => ({
    ...(race as unknown as RaceRecord),
    rows: (race.rows as Raw[]).map((r) => ({ ...(r as unknown as RaceRecordRow), driverId: driverIdFor(teams, r.carId as string) })),
  }));
  const career = withSections({ version: 2, seed: raw.seed, playerTeamId: raw.playerTeamId, calendar: raw.calendar, results, season: 1, roundsBefore: 0 }, teams);
  return career ? { status: 'ok', career: career as unknown as Career } : { status: 'unreadable', reason: 'the data is damaged' };
}

function fromVersion2(raw: Raw, teams: readonly TeamDef[]): SaveResult {
  const common = readCommon(raw, teams, true);
  if ('reason' in common) return { status: 'unreadable', reason: common.reason };
  if (!isInt(raw.season, 1) || !isInt(raw.roundsBefore, 0)) return { status: 'unreadable', reason: 'the data is damaged' };
  const career = withSections(raw, teams);
  return career ? { status: 'ok', career: career as unknown as Career } : { status: 'unreadable', reason: 'the data is damaged' };
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
