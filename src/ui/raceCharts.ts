/**
 * What the results charts draw, picked from the finished race: lap times for
 * the player's two cars and the winner, and tyre wear for the player's cars.
 * Pure, so it is tested without a screen; nothing here is saved.
 */

import type { RaceSim } from '../engine/race.ts';

export interface ChartLap {
  lap: number;
  time: number;
  wear: number;
  pit: boolean;
  safetyCar: boolean;
}

export interface ChartSeries {
  carId: string;
  code: string;
  /** Colour slot, fixed by role: the player's first car, their second, then the winner. */
  slot: 1 | 2 | 3;
  mine: boolean;
  won: boolean;
  laps: ChartLap[];
}

export interface RaceCharts {
  totalLaps: number;
  lapSeries: ChartSeries[];
  wearSeries: ChartSeries[];
  /** Lap-time scale in seconds, from the racing laps; pit and safety-car laps run off the top. */
  lapDomain: [number, number];
  /** Laps on which the safety car was out for any charted car. */
  safetyCarLaps: number[];
}

export function raceCharts(sim: RaceSim, playerTeamId: string): RaceCharts {
  const winnerId = sim.results()[0]?.carId ?? null;
  const series = (carId: string, slot: 1 | 2 | 3): ChartSeries | null => {
    const car = sim.carById(carId);
    if (!car) return null;
    return {
      carId,
      code: car.driver.code,
      slot,
      mine: car.team.id === playerTeamId,
      won: carId === winnerId,
      laps: car.laps.map((l) => ({ lap: l.lap, time: l.time, wear: l.wear, pit: l.pit, safetyCar: l.safetyCar })),
    };
  };
  const mine = [series(`${playerTeamId}:0`, 1), series(`${playerTeamId}:1`, 2)].filter((s): s is ChartSeries => s !== null);
  const winner = winnerId && !mine.some((s) => s.carId === winnerId) ? series(winnerId, 3) : null;
  const lapSeries = winner ? [...mine, winner] : mine;

  const laps = lapSeries.flatMap((s) => s.laps);
  // The opening lap starts from the grid, so it is left out of the scale too.
  const racing = laps.filter((l) => !l.pit && !l.safetyCar && l.lap > 1).map((l) => l.time);
  const times = racing.length > 0 ? racing : laps.map((l) => l.time);
  const lo = times.length > 0 ? Math.min(...times) : 0;
  const hi = times.length > 0 ? Math.max(...times) : 1;
  const pad = Math.max(0.3, (hi - lo) * 0.1);

  return {
    totalLaps: sim.totalLaps,
    lapSeries,
    wearSeries: mine,
    lapDomain: [lo - pad, hi + pad],
    safetyCarLaps: [...new Set(laps.filter((l) => l.safetyCar).map((l) => l.lap))].sort((a, b) => a - b),
  };
}
