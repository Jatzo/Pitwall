import type { CarState, RaceSim } from '../engine/race.ts';

export interface Pose {
  x: number;
  y: number;
  /** The way the car points, in radians, as the track's heading. */
  heading: number;
}

function interp(prev: number, cur: number, alpha: number): number {
  return prev + (cur - prev) * alpha;
}

/**
 * Where to draw a car between two sim steps, and the way it points. On the pit
 * lane it is drawn travelling to its own garage.
 */
export function carPose(sim: RaceSim, car: CarState, alpha: number, garages: readonly string[]): Pose {
  const t = sim.track;
  const a = sim.phase === 'racing' ? alpha : 1;
  const dist = interp(car.prevDist, car.dist, a);
  if (car.status === 'pitLane' && car.pit) {
    const slot = garages.indexOf(car.team.id);
    const u = t.pitDisplayU(dist - car.pit.boxDist, t.garageU(slot, garages.length));
    const p = t.pitLanePoint(u);
    // The lane bends away from the track at each end, so read its direction from the lane itself.
    const ahead = t.pitLanePoint(u + 1);
    const behind = t.pitLanePoint(u - 1);
    return { x: p.x, y: p.y, heading: Math.atan2(ahead.y - behind.y, ahead.x - behind.x) };
  }
  const size = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxY - t.bounds.minY);
  const lat = interp(car.prevLat, car.lat, a) * size * 0.0012;
  const p = t.pointAt(dist);
  return { x: p.x + Math.sin(p.heading) * lat, y: p.y - Math.cos(p.heading) * lat, heading: p.heading };
}
