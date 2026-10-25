/**
 * This season's race replays, kept apart from the career save so a replay can
 * be lost without losing anything else. A replay is the race's config, the
 * teams as they raced and the player's commands; the engine does the rest.
 * Only the current season's replays are kept, and the career always comes
 * first: when storage is full, the replays are cleared to make room.
 */

import { trackById } from '../data/tracks.ts';
import type { RaceConfig, RaceSim } from '../engine/race.ts';
import { replayRace } from '../engine/replay.ts';
import type { CommandLog } from '../engine/replay.ts';
import type { Difficulty, StrategyPlan, TeamDef } from '../engine/types.ts';
import type { WeatherTimeline } from '../engine/weather.ts';
import type { Career } from './season.ts';

const KEY = 'pitwall.replays.v1';

export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ReplayRecord {
  round: number;
  trackId: string;
  laps: number;
  seed: number;
  grid: string[];
  playerTeamId: string | null;
  strategies?: Record<string, StrategyPlan>;
  weather?: WeatherTimeline;
  /** Absent in replays kept before difficulty existed, which all ran on Medium. */
  difficulty?: Difficulty;
  /** The teams as they raced, without uploaded logo images, which can be large. */
  teams: TeamDef[];
  commands: CommandLog;
  /** Finishing order, to check that the game still reproduces the race. */
  order: string[];
}

interface Store {
  version: 1;
  careerSeed: number;
  season: number;
  replays: ReplayRecord[];
}

function browserStorage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStore(kv: KeyValue | null): Store | null {
  try {
    const raw = kv?.getItem(KEY);
    const store = raw ? (JSON.parse(raw) as Store) : null;
    return store && store.version === 1 && Array.isArray(store.replays) ? store : null;
  } catch {
    return null;
  }
}

export function clearReplays(kv: KeyValue | null = browserStorage()): void {
  try {
    kv?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Writes a value, and if storage is full, clears the replays and tries once more. */
export function saveWithRoom(kv: KeyValue | null, key: string, text: string): boolean {
  if (!kv) return false;
  try {
    kv.setItem(key, text);
    return true;
  } catch {
    clearReplays(kv);
    try {
      kv.setItem(key, text);
      return true;
    } catch {
      return false;
    }
  }
}

export function replayRecord(config: RaceConfig, sim: RaceSim, round: number): ReplayRecord {
  return {
    round,
    trackId: config.track.id,
    laps: config.laps,
    seed: config.seed,
    grid: [...config.grid],
    playerTeamId: config.playerTeamId,
    strategies: config.strategies,
    weather: config.weather,
    difficulty: config.difficulty,
    teams: config.teams.map((t) => ({ ...t, logo: { shape: t.logo.shape, initials: t.logo.initials } })),
    commands: sim.commandLog,
    order: sim.results().map((r) => r.carId),
  };
}

/** Saves a race's replay for the career's current season. False if it could not be kept. */
export function saveReplay(career: Career, record: ReplayRecord, kv: KeyValue | null = browserStorage()): boolean {
  const old = readStore(kv);
  const same = old && old.careerSeed === career.seed && old.season === career.season;
  const store: Store = {
    version: 1,
    careerSeed: career.seed,
    season: career.season,
    replays: [...(same ? old.replays.filter((r) => r.round !== record.round) : []), record],
  };
  try {
    kv?.setItem(KEY, JSON.stringify(store));
    return !!kv;
  } catch {
    // Storage is full: drop the replays rather than crowd out the career save.
    clearReplays(kv);
    return false;
  }
}

export function loadReplay(career: Career, round: number, kv: KeyValue | null = browserStorage()): ReplayRecord | null {
  const store = readStore(kv);
  if (!store || store.careerSeed !== career.seed || store.season !== career.season) return null;
  return store.replays.find((r) => r.round === round) ?? null;
}

/** Rounds of the career's current season that have a replay stored. */
export function replayRounds(career: Career, kv: KeyValue | null = browserStorage()): number[] {
  const store = readStore(kv);
  if (!store || store.careerSeed !== career.seed || store.season !== career.season) return [];
  return store.replays.map((r) => r.round);
}

/** The race config to replay, with each team's current editor logo for display. */
export function replayConfig(record: ReplayRecord, editorTeams: readonly TeamDef[]): RaceConfig {
  return {
    track: trackById(record.trackId),
    teams: record.teams.map((t) => ({ ...t, logo: editorTeams.find((e) => e.id === t.id)?.logo ?? t.logo })),
    grid: record.grid,
    laps: record.laps,
    seed: record.seed,
    playerTeamId: record.playerTeamId,
    strategies: record.strategies,
    weather: record.weather,
    difficulty: record.difficulty,
  };
}

/** True when the game still plays the race out as it finished; a changed engine or damaged record gives false. */
export function checkReplay(config: RaceConfig, record: ReplayRecord): boolean {
  try {
    const order = replayRace(config, record.commands).results().map((r) => r.carId);
    return order.length === record.order.length && order.every((id, i) => id === record.order[i]);
  } catch {
    return false;
  }
}
