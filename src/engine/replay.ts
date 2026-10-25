/**
 * Running a race from its command log. A race is fixed by its config and
 * seed, and the player's only way to change it is a command, logged with the
 * race time it was given at. Feeding each command back in just before the
 * step at that time gives the same race, lap for lap.
 */

import { RaceSim } from './race.ts';
import type { RaceConfig } from './race.ts';
import type { RaceCommand } from './types.ts';

/** The fixed step every race runs on, live or replayed. */
export const STEP_S = 0.1;

export type CommandLog = readonly { t: number; cmd: RaceCommand }[];

/** Steps a race and gives it each logged command as its time comes. With an empty log it is a plain step. */
export class CommandFeed {
  private next = 0;
  private readonly sim: RaceSim;
  private readonly log: CommandLog;

  constructor(sim: RaceSim, log: CommandLog) {
    this.sim = sim;
    this.log = log;
  }

  /** Gives every command due by now. Commands logged on the grid are due at once. */
  applyDue(): void {
    while (this.next < this.log.length && this.log[this.next].t <= this.sim.time) this.sim.command(this.log[this.next++].cmd);
  }

  step(dt: number): void {
    this.applyDue();
    this.sim.step(dt);
  }
}

/** Runs a whole race from its config and log, headless. */
export function replayRace(config: RaceConfig, log: CommandLog): RaceSim {
  const sim = new RaceSim(config);
  const feed = new CommandFeed(sim, log);
  feed.applyDue();
  sim.start();
  while (sim.phase === 'racing') feed.step(STEP_S);
  return sim;
}
