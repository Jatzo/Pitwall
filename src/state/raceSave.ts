/**
 * The race in progress, so a reload or a trip to the menu does not lose it. A race is fixed by its config
 * and seed, and the player changes it only through logged orders, so the save is the race log and how
 * many steps have run. Resuming runs the race headless to that step and checks it came out the same.
 */

import type { RaceConfig, RaceSim } from '../engine/race.ts';
import { fastForward } from '../engine/replay.ts';
import { hashString } from '../engine/rng.ts';
import type { TeamDef } from '../engine/types.ts';
import { browserStorage, raceLog, replayConfig } from './replays.ts';
import type { KeyValue, RaceLog } from './replays.ts';
import type { Career } from './season.ts';

export const RACE_KEY = 'pitwall.race.v1';

export interface RaceSave {
  version: 1;
  careerSeed: number;
  season: number;
  record: RaceLog;
  /** Fixed steps run since the lights; 0 while still on the grid. */
  steps: number;
  /** Fingerprint of the race at the save, to catch a game update that plays it out differently. */
  check: number;
}

/** A number that changes if the race has moved: the clock, the leader's place on track and every car's laps, status and stops. */
export function raceCheck(sim: RaceSim): number {
  // Before the first step the race resumes on the grid, so a race just started and one not yet started match.
  const lead = sim.time > 0 ? sim.standings()[0] : undefined;
  const cars = sim.cars.map((c) => `${c.id}:${c.lap}:${c.status}:${c.stops.length}`).join('|');
  return hashString(`${sim.time.toFixed(3)}/${Math.round(lead?.dist ?? 0)}/${cars}`);
}

/** The round this career is on, as the race will be scored. */
const roundOf = (career: Career) => career.results.length;

/**
 * Saves the race; false if it could not be kept. Never makes room by clearing anything else, and never
 * saves a finished race, which the career already holds.
 */
export function saveRace(career: Career, config: RaceConfig, sim: RaceSim, steps: number, kv: KeyValue | null = browserStorage()): boolean {
  if (sim.phase === 'finished') return false;
  const save: RaceSave = {
    version: 1,
    careerSeed: career.seed,
    season: career.season,
    record: raceLog(config, sim, roundOf(career)),
    steps,
    check: raceCheck(sim),
  };
  try {
    kv?.setItem(RACE_KEY, JSON.stringify(save));
    return !!kv;
  } catch {
    return false;
  }
}

/** The saved race for this career's current round, or null. */
export function loadRace(career: Career, kv: KeyValue | null = browserStorage()): RaceSave | null {
  try {
    const raw = kv?.getItem(RACE_KEY);
    const save = raw ? (JSON.parse(raw) as RaceSave) : null;
    if (!save || save.version !== 1 || !save.record || !Array.isArray(save.record.commands) || !Number.isInteger(save.steps)) return null;
    return save.careerSeed === career.seed && save.season === career.season && save.record.round === roundOf(career) ? save : null;
  } catch {
    return null;
  }
}

export function clearRace(kv: KeyValue | null = browserStorage()): void {
  try {
    kv?.removeItem(RACE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The race rebuilt to where it was left, or null if this version of the game no longer plays it out the same. */
export function resumeRace(save: RaceSave, editorTeams: readonly TeamDef[]): { config: RaceConfig; sim: RaceSim } | null {
  try {
    const config = replayConfig(save.record, editorTeams);
    const sim = fastForward(config, save.record.commands, save.steps);
    return raceCheck(sim) === save.check ? { config, sim } : null;
  } catch {
    return null;
  }
}
