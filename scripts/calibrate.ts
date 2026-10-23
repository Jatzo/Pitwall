/**
 * Batch calibration: `npm run calibrate -- --seeds 30 --fraction 0.35 --weather`.
 * Runs full-length races over many seeds on every circuit and prints the
 * averages that the calibration targets in docs/DESIGN.md refer to, so a
 * tuning change can be judged on numbers rather than one memorable race.
 */

import { defaultTeams } from '../src/data/teams.ts';
import { TRACKS, fullRaceLaps } from '../src/data/tracks.ts';
import { runQualifying } from '../src/engine/qualifying.ts';
import { RaceSim } from '../src/engine/race.ts';
import { generateWeather, windowHasRain } from '../src/engine/weather.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const seeds = Number(arg('seeds', '20'));
const only = arg('track', '');
/** Share of full race distance, as the race length buttons in the game offer. */
const fraction = Number(arg('fraction', '1'));
/** With --weather each race gets its circuit's chance of rain, as in the game; without it every race is dry. */
const withWeather = process.argv.includes('--weather');
const teams = defaultTeams();

interface Totals {
  races: number;
  overtakes: number;
  safetyCars: number;
  retirements: number;
  stops: number;
  finishers: number;
  winnerStops: Record<number, number>;
  poleWins: number;
  leadChanges: number;
  winMargin: number;
  closeFinishes: number;
  winnerFromOutsideTop3: number;
  bestLapVsRef: number;
  wetRaces: number;
  wetStops: number;
  wetFinishers: number;
  wetWinnerFromOutsideTop3: number;
}

function empty(): Totals {
  return {
    races: 0, overtakes: 0, safetyCars: 0, retirements: 0, stops: 0, finishers: 0, winnerStops: {},
    poleWins: 0, leadChanges: 0, winMargin: 0, closeFinishes: 0, winnerFromOutsideTop3: 0, bestLapVsRef: 0,
    wetRaces: 0, wetStops: 0, wetFinishers: 0, wetWinnerFromOutsideTop3: 0,
  };
}

function runOne(trackIndex: number, seed: number, into: Totals): void {
  const track = TRACKS[trackIndex];
  const quali = runQualifying(track, teams, seed);
  const laps = Math.max(8, Math.round(fullRaceLaps(track) * fraction));
  const durationS = laps * (track.refLapS ?? 90) * 1.1;
  const weather = withWeather ? generateWeather(seed, track.rainChance ?? 0, durationS) : undefined;
  const sim = new RaceSim({ track, teams, grid: quali.grid, laps, seed, playerTeamId: null, weather });
  sim.start();
  let leader = '';
  let leaderLap = -1;
  while (sim.phase !== 'finished') {
    sim.step(0.1);
    const lead = sim.standings()[0];
    // Sample the leader once per lap at the line, so a pass and re-pass in one lap counts once.
    if (lead && lead.lap !== leaderLap) {
      leaderLap = lead.lap;
      if (leader && lead.id !== leader && lead.lap > 0) into.leadChanges++;
      leader = lead.id;
    }
  }
  const results = sim.results();
  const winner = sim.carById(results[0].carId)!;
  const second = results[1];
  into.races++;
  into.overtakes += sim.overtakeCount;
  into.safetyCars += sim.scCount;
  into.retirements += sim.cars.filter((c) => c.status === 'out').length;
  const finishers = sim.cars.filter((c) => c.status !== 'out');
  into.finishers += finishers.length;
  into.stops += finishers.reduce((n, c) => n + c.stops.length, 0);
  into.winnerStops[winner.stops.length] = (into.winnerStops[winner.stops.length] ?? 0) + 1;
  if (winner.grid === 1) into.poleWins++;
  if (winner.grid > 3) into.winnerFromOutsideTop3++;
  const margin = second?.gapS ?? 0;
  into.winMargin += margin;
  if (margin < 2) into.closeFinishes++;
  if (sim.fastestLap) into.bestLapVsRef += sim.fastestLap.time - sim.track.refLap;
  if (weather && windowHasRain(weather, 0, sim.time)) {
    into.wetRaces++;
    into.wetStops += finishers.reduce((n, c) => n + c.stops.length, 0);
    into.wetFinishers += finishers.length;
    if (winner.grid > 3) into.wetWinnerFromOutsideTop3++;
  }
}

function pct(n: number, d: number): string {
  return `${Math.round((100 * n) / Math.max(1, d))}%`;
}

function report(label: string, t: Totals): void {
  const r = t.races;
  const stops = Object.entries(t.winnerStops)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}:${pct(v, r)}`)
    .join(' ');
  console.log(
    [
      label.padEnd(16),
      `ovt ${(t.overtakes / r).toFixed(1).padStart(5)}`,
      `SC ${(t.safetyCars / r).toFixed(2)}`,
      `DNF ${(t.retirements / r).toFixed(2)}`,
      `stops/car ${(t.stops / Math.max(1, t.finishers)).toFixed(2)}`,
      `winner stops ${stops.padEnd(18)}`,
      `pole wins ${pct(t.poleWins, r).padStart(4)}`,
      `win from P4+ ${pct(t.winnerFromOutsideTop3, r).padStart(4)}`,
      `lead chg ${(t.leadChanges / r).toFixed(1)}`,
      `margin ${(t.winMargin / r).toFixed(1)}s`,
      `<2s ${pct(t.closeFinishes, r).padStart(4)}`,
      `FL-ref ${(t.bestLapVsRef / r).toFixed(2)}s`,
      ...(withWeather
        ? [`wet ${pct(t.wetRaces, r).padStart(4)}`, `wet stops/car ${(t.wetStops / Math.max(1, t.wetFinishers)).toFixed(2)}`, `wet win from P4+ ${pct(t.wetWinnerFromOutsideTop3, t.wetRaces)}`]
        : []),
    ].join('  '),
  );
}

const all = empty();
const t0 = performance.now();
TRACKS.forEach((track, i) => {
  if (only && track.id !== only) return;
  const t = empty();
  for (let s = 1; s <= seeds; s++) runOne(i, s, t);
  report(track.id, t);
  for (const key of Object.keys(all) as (keyof Totals)[]) {
    if (key === 'winnerStops') {
      for (const [k, v] of Object.entries(t.winnerStops)) all.winnerStops[Number(k)] = (all.winnerStops[Number(k)] ?? 0) + v;
    } else {
      all[key] += t[key];
    }
  }
});
report('ALL', all);
console.log(`\n${all.races} races in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
