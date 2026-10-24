/**
 * Race stories: the one thing worth watching right now, picked from what the
 * race is doing. Detection is pure and reads state the race already keeps;
 * the queue decides what is shown, from a story clock the race screen passes
 * in (real time that runs only while the race is playing).
 */

import { formatLap } from '../engine/format.ts';
import type { CarState, RaceSim } from '../engine/race.ts';
import { CLIFF_START, COMPOUNDS } from '../engine/tyres.ts';
import { battleFor } from './battles.ts';

export type StoryKind =
  | 'place'
  | 'retire'
  | 'tyres'
  | 'rivalPit'
  | 'closing'
  | 'threat'
  | 'pb'
  | 'battle'
  | 'fastest'
  | 'lead';

export interface Story {
  kind: StoryKind;
  priority: number;
  /** Cars the story is about; the first is the one a click selects. */
  carIds: string[];
  /** Team colour and short name for the strip. */
  colour: string;
  team: string;
  headline: string;
  detail: string;
  label: 'Your car' | 'Battle' | 'Headline';
  /** Read out by the strip's status region; false when race control already announces it. */
  announce: boolean;
  /** For a place story: places gained (negative when lost) and the position now. */
  delta?: number;
  position?: number;
  code?: string;
}

/** Own-car place changes are never dropped from the queue; everything below waits at most MAX_WAIT_S. */
export const PRIORITY: Record<StoryKind, number> & { ownRetire: number; ownFastest: number; ownBattle: number } = {
  place: 100,
  ownRetire: 95,
  tyres: 85,
  rivalPit: 80,
  closing: 75,
  threat: 75,
  pb: 70,
  ownBattle: 65,
  ownFastest: 60,
  battle: 50,
  lead: 45,
  fastest: 40,
  retire: 35,
};

/** How much a gap must change, per lap on average, to count as a trend. Lap times carry up to 0.5 s of noise. */
const TREND_RATE = 0.4;
/** Lap-end gaps a trend is judged over (four laps). */
const TREND_POINTS = 5;
/** A personal best must beat the previous best by this much. */
const PB_MARGIN = 0.2;
/** The same story about the same cars is not repeated within this many laps. */
const COOLDOWN_LAPS = 3;
const BATTLE_GAP = 1.0;

interface LapEnd {
  clean: boolean;
  aheadId: string | null;
  gapAhead: number | null;
  behindId: string | null;
  gapBehind: number | null;
}

export interface StoryWatch {
  eventCursor: number;
  laps: Map<string, number>;
  status: Map<string, CarState['status']>;
  history: Map<string, LapEnd[]>;
  streaks: Map<string, { aheadId: string; laps: number }>;
  tyresFlagged: Set<string>;
  lastTold: Map<string, number>;
}

export function watchStories(sim: RaceSim): StoryWatch {
  return {
    eventCursor: sim.events.length,
    laps: new Map(sim.cars.map((c) => [c.id, c.laps.length])),
    status: new Map(sim.cars.map((c) => [c.id, c.status])),
    history: new Map(),
    streaks: new Map(),
    tyresFlagged: new Set(),
    lastTold: new Map(),
  };
}

/** Closing speed in seconds a lap (positive when the gap shrinks), as the least-squares slope of the gaps. */
export function gapTrend(gaps: readonly number[]): number {
  const n = gaps.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = gaps.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  gaps.forEach((g, i) => {
    num += (i - mx) * (g - my);
    den += (i - mx) ** 2;
  });
  return -num / den;
}

function leaderLap(sim: RaceSim): number {
  return sim.standings()[0]?.lap ?? 0;
}

function positionOf(sim: RaceSim, car: CarState): number {
  return sim.standings().indexOf(car) + 1;
}

function base(car: CarState, kind: StoryKind, priority: number, label: Story['label'], announce: boolean) {
  return { kind, priority, label, announce, colour: car.team.colors.primary, team: car.team.shortName };
}

function placeDetail(sim: RaceSim, car: CarState): string {
  const pos = positionOf(sim, car);
  const ahead = sim.standings()[pos - 2];
  const gap = sim.gapToAhead(car);
  return ahead && gap !== null ? `Now P${pos}, ${gap.toFixed(1)} s behind ${ahead.driver.code}` : `Now P${pos}`;
}

/** Stories from everything that changed since the last call. Always moves the watch on. */
export function nextStories(sim: RaceSim, watch: StoryWatch): Story[] {
  const found: Story[] = [];
  const lap = leaderLap(sim);
  const remaining = sim.totalLaps - lap;

  const fresh = (key: string): boolean => {
    const last = watch.lastTold.get(key);
    if (last !== undefined && lap - last < COOLDOWN_LAPS) return false;
    watch.lastTold.set(key, lap);
    return true;
  };

  // Race events: overtakes, fastest laps, retirements.
  for (let i = watch.eventCursor; i < sim.events.length; i++) {
    const e = sim.events[i];
    const car = e.carId ? sim.carById(e.carId) : undefined;
    if (!car) continue;
    if (e.kind === 'overtake' && e.otherId && e.lap > 1) {
      const victim = sim.carById(e.otherId);
      if (!victim) continue;
      const own = car.isPlayer ? car : victim.isPlayer ? victim : null;
      if (own) {
        const gained = own === car;
        const pos = positionOf(sim, own);
        found.push({
          ...base(own, 'place', PRIORITY.place, 'Your car', false),
          carIds: [own.id, gained ? victim.id : car.id],
          headline: gained
            ? `${car.driver.code} passes ${victim.driver.code} for P${pos}`
            : `${victim.driver.code} loses P${pos - 1} to ${car.driver.code}`,
          detail: placeDetail(sim, own),
          delta: gained ? 1 : -1,
          position: pos,
          code: own.driver.code,
        });
      } else if (positionOf(sim, car) === 1 && fresh(`lead:${car.id}`)) {
        found.push({
          ...base(car, 'lead', PRIORITY.lead, 'Headline', false),
          carIds: [car.id, victim.id],
          headline: `${car.driver.code} takes the lead`,
          detail: `Passes ${victim.driver.code} on lap ${e.lap}`,
        });
      }
    } else if (e.kind === 'fastest' && sim.fastestLap && sim.fastestLap.carId === car.id && fresh(`fastest:${car.id}`)) {
      found.push({
        ...base(car, 'fastest', car.isPlayer ? PRIORITY.ownFastest : PRIORITY.fastest, car.isPlayer ? 'Your car' : 'Headline', false),
        carIds: [car.id],
        headline: `Fastest lap for ${car.driver.code}`,
        detail: `${formatLap(sim.fastestLap.time)} on lap ${sim.fastestLap.lap}`,
      });
    } else if (e.kind === 'retire') {
      const reason = e.message.split(': ')[1] ?? '';
      found.push({
        ...base(car, 'retire', car.isPlayer ? PRIORITY.ownRetire : PRIORITY.retire, car.isPlayer ? 'Your car' : 'Headline', false),
        carIds: [car.id],
        headline: `${car.driver.code} is out of the race`,
        detail: reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : `Retired on lap ${e.lap}`,
      });
    }
  }
  watch.eventCursor = sim.events.length;

  const order = sim.standings();
  for (const car of sim.cars) {
    // A rival entering the pit lane directly ahead of or behind a player car.
    const was = watch.status.get(car.id);
    watch.status.set(car.id, car.status);
    if (!car.isPlayer && was === 'running' && car.status === 'pitLane') {
      const i = order.indexOf(car);
      for (const [mine, rivalAhead] of [
        [order[i + 1], true],
        [order[i - 1], false],
      ] as const) {
        if (!mine || !mine.isPlayer || mine.status !== 'running') continue;
        const gap = rivalAhead ? sim.gapToAhead(mine) : sim.gapToAhead(car);
        const compound = car.pit ? COMPOUNDS[car.pit.compound].name.toLowerCase() : null;
        if (!fresh(`rivalPit:${car.id}:${mine.id}`)) continue;
        found.push({
          ...base(mine, 'rivalPit', PRIORITY.rivalPit, 'Your car', true),
          carIds: [mine.id, car.id],
          headline: rivalAhead
            ? `${car.driver.code} pits from just ahead of ${mine.driver.code}`
            : `${car.driver.code} pits from just behind ${mine.driver.code}`,
          detail:
            (gap !== null ? `${gap.toFixed(1)} s apart` : 'Close behind') +
            (compound ? `, going to ${compound}s` : '') +
            (rivalAhead ? '' : '. Watch for the undercut'),
        });
      }
    }

    // Tyres reaching the cliff, once per set.
    const tyreKey = `${car.id}:${car.stops.length}`;
    if (car.isPlayer && car.status === 'running' && car.tyre.wear >= CLIFF_START && !watch.tyresFlagged.has(tyreKey)) {
      watch.tyresFlagged.add(tyreKey);
      found.push({
        ...base(car, 'tyres', PRIORITY.tyres, 'Your car', true),
        carIds: [car.id],
        headline: `${car.driver.code}'s tyres reach the cliff`,
        detail: `${Math.round(car.tyre.wear * 100)}% worn after ${Math.floor(car.tyre.ageLaps)} laps on ${COMPOUNDS[car.tyre.compound].name.toLowerCase()}s`,
      });
    }

    // Everything else is judged once a lap, as each car crosses the line.
    const seen = watch.laps.get(car.id) ?? 0;
    if (car.laps.length === seen) continue;
    watch.laps.set(car.id, car.laps.length);
    const last = car.laps[car.laps.length - 1];

    // Battles: within a second at two lap ends in a row, for a top-3 place or involving a player car.
    const battle = battleFor(sim, car, BATTLE_GAP);
    const streak = watch.streaks.get(car.id);
    if (!battle) watch.streaks.delete(car.id);
    else {
      const laps = streak && streak.aheadId === battle.ahead.id ? streak.laps + 1 : 1;
      watch.streaks.set(car.id, { aheadId: battle.ahead.id, laps });
      const mine = battle.ahead.isPlayer || battle.behind.isPlayer;
      if (laps >= 2 && (mine || battle.position <= 3) && fresh(`battle:${[battle.ahead.id, car.id].sort().join(':')}`)) {
        const lead = battle.behind.isPlayer ? battle.behind : battle.ahead;
        found.push({
          ...base(lead, 'battle', mine ? PRIORITY.ownBattle : PRIORITY.battle, 'Battle', true),
          carIds: [lead.id, lead === battle.ahead ? battle.behind.id : battle.ahead.id],
          headline: `${battle.ahead.driver.code} and ${battle.behind.driver.code} fight for P${battle.position}`,
          detail: `${battle.gap.toFixed(1)} s apart, tyres ${Math.floor(battle.ahead.tyre.ageLaps)} and ${Math.floor(battle.behind.tyre.ageLaps)} laps old`,
        });
      }
    }

    if (!car.isPlayer || car.status !== 'running') continue;

    // Personal best: a clean lap at least PB_MARGIN better than every earlier clean lap.
    const earlier = car.laps.slice(0, -1).filter((l) => l.clean);
    const isRaceFastest = sim.fastestLap?.carId === car.id && sim.fastestLap.lap === last.lap;
    if (last.clean && earlier.length > 0 && !isRaceFastest) {
      const best = Math.min(...earlier.map((l) => l.time));
      if (last.time <= best - PB_MARGIN && fresh(`pb:${car.id}`)) {
        const gapToFastest = sim.fastestLap ? last.time - sim.fastestLap.time : null;
        found.push({
          ...base(car, 'pb', PRIORITY.pb, 'Your car', true),
          carIds: [car.id],
          headline: `${car.driver.code} sets a personal best`,
          detail: `${formatLap(last.time)}` + (gapToFastest !== null ? `, ${gapToFastest.toFixed(1)} s off the fastest lap` : ''),
        });
      }
    }

    // Gap trends to the same car ahead or behind over four clean laps.
    const i = order.indexOf(car);
    const ahead = order[i - 1];
    const behind = order[i + 1];
    const hist = watch.history.get(car.id) ?? [];
    hist.push({
      clean: last.clean,
      aheadId: ahead?.id ?? null,
      gapAhead: ahead ? sim.gapToAhead(car) : null,
      behindId: behind?.id ?? null,
      gapBehind: behind && behind.status === 'running' ? sim.gapToAhead(behind) : null,
    });
    if (hist.length > TREND_POINTS) hist.shift();
    watch.history.set(car.id, hist);
    if (hist.length < TREND_POINTS || !hist.every((h) => h.clean)) continue;

    const steady = (key: 'aheadId' | 'behindId') => hist.every((h) => h[key] !== null && h[key] === hist[0][key]);
    const gapsOf = (key: 'gapAhead' | 'gapBehind') => hist.map((h) => h[key]).filter((g): g is number => g !== null);
    const catchText = (gap: number, rate: number) => {
      const lapsToCatch = Math.ceil((gap - BATTLE_GAP) / rate);
      return lapsToCatch > 0 && lapsToCatch < remaining ? `, catches in about ${lapsToCatch} laps` : '';
    };

    const ga = gapsOf('gapAhead');
    if (ahead && steady('aheadId') && ga.length === TREND_POINTS) {
      const rate = gapTrend(ga);
      const gap = ga[ga.length - 1];
      if (rate >= TREND_RATE && gap >= BATTLE_GAP && fresh(`closing:${car.id}:${ahead.id}`)) {
        found.push({
          ...base(car, 'closing', PRIORITY.closing, 'Your car', true),
          carIds: [car.id, ahead.id],
          headline: `${car.driver.code} closes on ${ahead.driver.code} for P${i}`,
          detail: `${rate.toFixed(1)} s a lap over 4 laps, ${gap.toFixed(1)} s behind${catchText(gap, rate)}`,
        });
      }
    }
    const gb = gapsOf('gapBehind');
    if (behind && steady('behindId') && gb.length === TREND_POINTS) {
      const rate = gapTrend(gb);
      const gap = gb[gb.length - 1];
      if (rate >= TREND_RATE && gap >= BATTLE_GAP && fresh(`threat:${car.id}:${behind.id}`)) {
        found.push({
          ...base(car, 'threat', PRIORITY.threat, 'Your car', true),
          carIds: [car.id, behind.id],
          headline: `${behind.driver.code} closes on ${car.driver.code}`,
          detail: `${rate.toFixed(1)} s a lap over 4 laps, ${gap.toFixed(1)} s back${catchText(gap, rate)}`,
        });
      }
    }
  }
  return found;
}

/** Seconds a story stays on screen: shorter at high speed, where the next one comes sooner. */
export function holdFor(speed: number): number {
  if (speed >= 32) return 2.5;
  return speed >= 8 ? 3.5 : 4;
}

/** A story older than this is dropped rather than shown late (own place changes excepted). */
export const MAX_WAIT_S = 1.5;

function mergePlace(a: Story, b: Story): Story {
  const delta = (a.delta ?? 0) + (b.delta ?? 0);
  const pos = b.position ?? 0;
  const code = b.code ?? '';
  const headline =
    delta === 0
      ? `${code} swaps places and stays P${pos}`
      : delta > 0
        ? `${code} gains ${delta === 1 ? 'a place' : `${delta} places`}, now P${pos}`
        : `${code} drops ${delta === -1 ? 'a place' : `${-delta} places`}, now P${pos}`;
  return { ...b, delta, headline, carIds: b.carIds };
}

/** Picks what the strip shows, from timestamps on the story clock. */
export class StoryQueue {
  private pending: { story: Story; at: number }[] = [];
  private shown: { story: Story; until: number } | null = null;

  push(stories: readonly Story[], now: number): void {
    for (const story of stories) {
      if (story.kind === 'place') {
        const i = this.pending.findIndex((p) => p.story.kind === 'place' && p.story.carIds[0] === story.carIds[0]);
        if (i >= 0) {
          this.pending[i] = { story: mergePlace(this.pending[i].story, story), at: this.pending[i].at };
          continue;
        }
      }
      this.pending.push({ story, at: now });
    }
  }

  /** The story on screen at `now`; a new one is picked when the last has had `hold` seconds. */
  current(now: number, hold: number): Story | null {
    if (this.shown && now < this.shown.until) return this.shown.story;
    this.pending = this.pending.filter((p) => p.story.priority >= PRIORITY.place || now - p.at <= MAX_WAIT_S);
    if (this.pending.length === 0) {
      this.shown = null;
      return null;
    }
    let best = 0;
    for (let i = 1; i < this.pending.length; i++) {
      if (this.pending[i].story.priority > this.pending[best].story.priority) best = i;
    }
    const [next] = this.pending.splice(best, 1);
    this.shown = { story: next.story, until: now + hold };
    return next.story;
  }
}
