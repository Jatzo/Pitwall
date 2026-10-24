import type { CarState, RaceSim } from '../engine/race.ts';
import { hashString } from '../engine/rng.ts';
import { COMPOUNDS } from '../engine/tyres.ts';
import type { Compound } from '../engine/types.ts';
import { PRIORITY } from './stories.ts';
import type { Story } from './stories.ts';

/**
 * Team radio: short lines from the player's two drivers, shown in the story
 * strip just after the story they answer. Rain is left to its prompt and gap
 * trends to their stories, so the radio never says what the strip already says.
 */

export type RadioTrigger = 'gain' | 'loss' | 'tyres' | 'aheadPits' | 'lastLap' | 'box';

/** {pos} is the driver's place, {rival} the other car's code, {compound} the tyre asked for. */
export const RADIO_LINES: Record<RadioTrigger, readonly string[]> = {
  gain: ['Got past {rival}. P{pos}.', 'Done. P{pos}, pushing on.', "That's P{pos}. Car feels good.", 'Clean move on {rival}. P{pos} now.'],
  loss: ['{rival} got me on the exit. Staying close.', "Lost one to {rival}. I'll stay on it.", "{rival} is past. I can see them, I'll go again.", "Couldn't hold {rival} off. Still with them."],
  tyres: ['These tyres are done.', 'No grip left. When are we boxing?', "Rears are gone, I'm losing time everywhere.", 'Tyres have fallen off. Need to stop soon.'],
  aheadPits: ['{rival} has boxed. Do we cover?', 'Car ahead is in. Pushing now.', "{rival} has pitted. Clear air, I'll push."],
  lastLap: ['Last lap. Bringing it home.', 'Final lap, P{pos}. Keeping it clean.', 'Last lap. All good here.'],
  box: ['Box this lap for {compound}s, understood.', 'Copy, boxing for {compound}s.', 'Understood, in this lap for {compound}s.'],
};

/** A driver does not say the same kind of thing again within this many laps. */
const COOLDOWN_LAPS = 4;

export interface RadioWatch {
  seed: number;
  /** Per driver and trigger: the lap it was last said, and how many times. */
  said: Map<string, { lap: number; count: number }>;
}

export function watchRadio(seed: number): RadioWatch {
  return { seed, said: new Map() };
}

/** A radio story, or null while the driver is still in the cooldown for this trigger. */
function say(watch: RadioWatch, car: CarState, trigger: RadioTrigger, fill: Record<string, string>, other?: CarState): Story | null {
  const key = `${car.id}:${trigger}`;
  const last = watch.said.get(key);
  if (last && car.lap - last.lap < COOLDOWN_LAPS) return null;
  const count = last ? last.count + 1 : 0;
  watch.said.set(key, { lap: car.lap, count });
  // A hash of the seed, rather than a random draw, so a replayed race says the same things.
  const lines = RADIO_LINES[trigger];
  const line = lines[hashString(`${watch.seed}:${key}:${count}`) % lines.length].replace(/\{(\w+)\}/g, (_, name: string) => fill[name] ?? '');
  return {
    kind: 'radio',
    priority: PRIORITY.radio,
    carIds: other ? [car.id, other.id] : [car.id],
    colour: car.team.colors.primary,
    team: car.team.shortName,
    headline: `"${line}"`,
    detail: `${car.driver.name} on the radio`,
    label: 'Team radio',
    announce: true,
  };
}

function placeOf(sim: RaceSim, car: CarState): string {
  return String(sim.standings().indexOf(car) + 1);
}

/** Radio lines answering this step's stories, plus the last-lap call. */
export function radioFor(sim: RaceSim, watch: RadioWatch, stories: readonly Story[]): Story[] {
  const out: Story[] = [];
  for (const story of stories) {
    const car = sim.carById(story.carIds[0]);
    if (!car?.isPlayer || car.status === 'out') continue;
    const other = story.carIds[1] ? sim.carById(story.carIds[1]) : undefined;
    let trigger: RadioTrigger | null = null;
    if (story.kind === 'place' && story.delta) trigger = story.delta > 0 ? 'gain' : 'loss';
    else if (story.kind === 'tyres') trigger = 'tyres';
    else if (story.kind === 'rivalPit' && story.rivalAhead) trigger = 'aheadPits';
    if (!trigger) continue;
    const line = say(watch, car, trigger, { pos: placeOf(sim, car), rival: other?.driver.code ?? '' }, other);
    if (line) out.push(line);
  }
  // The leader starting the final lap is the last lap for everyone still running.
  const leader = sim.standings()[0];
  if (leader && sim.phase === 'racing' && leader.lap === sim.totalLaps - 1) {
    for (const car of sim.cars) {
      if (!car.isPlayer || car.status !== 'running' || watch.said.has(`${car.id}:lastLap`)) continue;
      const line = say(watch, car, 'lastLap', { pos: placeOf(sim, car) });
      if (line) out.push(line);
    }
  }
  return out;
}

/** The driver's reply to a stop the player has just asked for. */
export function boxCall(sim: RaceSim, watch: RadioWatch, carId: string, compound: Compound): Story | null {
  const car = sim.carById(carId);
  if (!car?.isPlayer || car.status !== 'running') return null;
  return say(watch, car, 'box', { compound: COMPOUNDS[compound].name.toLowerCase() });
}
