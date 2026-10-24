import type { RaceSim } from '../engine/race.ts';
import type { Track } from '../engine/track.ts';
import { battleFor } from './battles.ts';
import type { Battle } from './battles.ts';
import type { Story } from './stories.ts';

/**
 * The camera director: what the camera shows, decided on the story clock (real
 * seconds that run only while the race plays). A car the player follows comes
 * first, then the story on screen; otherwise a battle with the player's car,
 * then the closest fight in the top five, then the leader. The director holds
 * each of its own choices for HOLD_S, so the camera does not hunt.
 */

export interface Shot {
  kind: 'follow' | 'story' | 'player' | 'battle' | 'leader';
  /** The cars in the shot; the camera is anchored on the first. */
  carIds: string[];
  label: string;
}

export interface Direction {
  shot: Shot;
  /** Story time the shot started. */
  since: number;
}

export const HOLD_S = 6;

function closest(battles: readonly Battle[]): Battle | null {
  return battles.length ? battles.reduce((a, b) => (b.gap < a.gap ? b : a)) : null;
}

function battleShot(kind: 'player' | 'battle', b: Battle): Shot {
  return { kind, carIds: [b.behind.id, b.ahead.id], label: `${b.behind.driver.code} chases ${b.ahead.driver.code} for P${b.position}` };
}

/** The director's own pick, with nothing held. */
function choose(sim: RaceSim): Shot {
  const order = sim.standings();
  const mine: Battle[] = [];
  for (const car of order) {
    if (!car.isPlayer) continue;
    // A fight with the player's car either way: chasing the car ahead, or chased by the car behind.
    const chasing = battleFor(sim, car);
    const chased = battleFor(sim, order[order.indexOf(car) + 1] ?? car);
    if (chasing) mine.push(chasing);
    if (chased) mine.push(chased);
  }
  const own = closest(mine);
  if (own) return battleShot('player', own);
  const top = closest(order.slice(1, 5).flatMap((c) => battleFor(sim, c) ?? []));
  if (top) return battleShot('battle', top);
  const leader = order[0];
  return { kind: 'leader', carIds: [leader.id], label: `${leader.driver.code} leads` };
}

function same(a: Shot, b: Shot): boolean {
  return a.kind === b.kind && a.carIds.length === b.carIds.length && a.carIds.every((id, i) => id === b.carIds[i]);
}

export function direct(sim: RaceSim, prev: Direction | null, now: number, story: Story | null, followId: string | null): Direction {
  const keep = (shot: Shot): Direction => (prev && same(prev.shot, shot) ? prev : { shot, since: now });
  const followed = followId ? sim.carById(followId) : undefined;
  if (followed && followed.status !== 'out') return keep({ kind: 'follow', carIds: [followed.id], label: `Following ${followed.driver.code}` });
  if (story) return keep({ kind: 'story', carIds: story.carIds, label: story.headline });
  const own = prev && prev.shot.kind !== 'follow' && prev.shot.kind !== 'story';
  const alive = prev?.shot.carIds.every((id) => sim.carById(id)?.status !== 'out');
  if (own && alive && now - prev.since < HOLD_S) return prev;
  return keep(choose(sim));
}

/** The part of the circuit the camera shows, in track metres, with its top-left corner at x, y. */
export interface CameraWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  /** True for a shot that holds still until the car leaves it; false while the camera follows the car. */
  fixed: boolean;
  /** The third of the lap a fast-forward shot covers, or null for a close-up. */
  third: 0 | 1 | 2 | null;
}

const FOLLOW_W = 450;
const FAST_FOLLOW_W = 900;

/**
 * Where the camera looks. Up to 8x it follows the target. At 16x and 32x a car
 * crosses several window widths a second, so it holds a fixed shot of the
 * third of the lap the target is in and cuts when the target leaves it. When
 * the player has asked for reduced motion, the close-up never pans either: it
 * holds still with the car at the back of the shot and cuts as the car leaves.
 */
export function cameraWindow(
  track: Track,
  target: { x: number; y: number; s: number },
  speed: number,
  reducedMotion: boolean,
  prev: CameraWindow | null,
  aspect: number,
): CameraWindow {
  if (speed < 16) {
    const w = speed >= 8 ? FAST_FOLLOW_W : FOLLOW_W;
    const h = w / aspect;
    if (!reducedMotion) return { x: target.x - w / 2, y: target.y - h / 2, w, h, fixed: false, third: null };
    const edge = w * 0.1;
    const holds =
      prev?.fixed && prev.third === null && prev.w === w && Math.abs(prev.w / prev.h - aspect) < 1e-6 &&
      target.x > prev.x + edge && target.x < prev.x + prev.w - edge && target.y > prev.y + edge && target.y < prev.y + prev.h - edge;
    if (holds) return prev;
    // Centre the new shot a little up the road, so the car has the length of the frame to drive across.
    const here = track.pointAt(target.s);
    const ahead = track.pointAt(target.s + w * 0.25);
    const cx = target.x + ahead.x - here.x;
    const cy = target.y + ahead.y - here.y;
    return { x: cx - w / 2, y: cy - h / 2, w, h, fixed: true, third: null };
  }
  const third = track.sectorAt(target.s);
  if (prev && prev.third === third && Math.abs(prev.w / prev.h - aspect) < 1e-6) return prev;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < track.n; i++) {
    if (track.sectorAt(i * track.step) !== third) continue;
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minY = Math.min(minY, track.y[i]);
    maxY = Math.max(maxY, track.y[i]);
  }
  const margin = Math.max(maxX - minX, maxY - minY) * 0.08;
  let w = Math.max(FOLLOW_W, maxX - minX + margin * 2);
  let h = maxY - minY + margin * 2;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h, fixed: true, third };
}
