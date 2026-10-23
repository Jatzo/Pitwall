/**
 * Headless race runner: `npm run sim -- --track kestrel-ring --seed 7 --laps 20`.
 * Handy for balancing the model without opening the UI.
 */

import { defaultTeams } from '../src/data/teams.ts';
import { TRACKS, fullRaceLaps, trackById } from '../src/data/tracks.ts';
import { formatGap, formatLap, formatRaceTime } from '../src/engine/format.ts';
import { runQualifying } from '../src/engine/qualifying.ts';
import { RaceSim } from '../src/engine/race.ts';
import { scoreRace } from '../src/engine/scoring.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const track = trackById(arg('track', TRACKS[0].id));
const seed = Number(arg('seed', '1'));
const laps = Number(arg('laps', String(fullRaceLaps(track))));
const teams = defaultTeams();

const quali = runQualifying(track, teams, seed);
const sim = new RaceSim({ track, teams, grid: quali.grid, laps, seed, playerTeamId: null });
const t0 = performance.now();
sim.start();
const dt = 0.1;
while (sim.phase !== 'finished') sim.step(dt);
const ms = performance.now() - t0;

const name = (id: string): string => sim.carById(id)?.driver.code ?? id;
console.log(`\n${track.name}: ${laps} laps, seed ${seed}, ${(ms / 1000).toFixed(2)}s to simulate ${formatRaceTime(sim.time)}`);
console.log(`Pole: ${name(quali.grid[0])} ${formatLap(quali.rows[0].best)}   Ref lap: ${formatLap(sim.track.refLap)}`);

const rows = scoreRace(sim.results(), sim.fastestLap?.carId ?? null);
console.log('\nPos Grid Driver Laps  Gap          Best      Stops Pts  Notes');
for (const r of rows) {
  const car = sim.carById(r.carId)!;
  const gap = r.position === 1 ? formatRaceTime(r.timeS ?? 0) : r.finished ? (r.gapS !== null ? formatGap(r.gapS) : `+${r.lapsDown} lap`) : 'DNF';
  const strat = [car.plan.startCompound, ...car.stops.map((s) => s.compound)].join('');
  console.log(
    `${String(r.position).padStart(3)} ${String(r.grid).padStart(4)} ${name(r.carId).padEnd(6)} ${String(r.laps).padStart(4)}  ${gap.padEnd(12)} ${r.bestLap ? formatLap(r.bestLap) : '--'.padEnd(8)}  ${String(r.pitStops).padStart(3)}   ${String(r.points).padStart(3)}  ${r.outReason ?? ''} [${car.stops.length ? strat : car.usedCompounds.join('')}]`,
  );
}

const stops = sim.cars.flatMap((c) => c.stops.map((s) => s.duration));
const pitLaps = sim.cars.flatMap((c) => c.laps.filter((l) => l.pit));
console.log(
  `\nOvertakes: ${sim.overtakeCount}  Safety cars: ${sim.scCount}  DNFs: ${sim.cars.filter((c) => c.status === 'out').length}  Stops: ${stops.length} (avg stationary ${(stops.reduce((a, b) => a + b, 0) / Math.max(1, stops.length)).toFixed(2)}s)`,
);
console.log(`Fastest lap: ${sim.fastestLap ? `${name(sim.fastestLap.carId)} ${formatLap(sim.fastestLap.time)} (lap ${sim.fastestLap.lap})` : 'none'}`);
if (pitLaps.length) console.log(`Pit-lap count: ${pitLaps.length}`);
for (const e of sim.events.filter((x) => ['safetycar', 'green', 'retire', 'incident'].includes(x.kind)).slice(0, 12)) {
  console.log(`  L${e.lap} ${e.message}`);
}
