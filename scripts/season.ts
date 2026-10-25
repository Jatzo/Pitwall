/**
 * Balance check for the management layer: `npm run season -- --seasons 3 --seeds 3`.
 * Plays whole careers headless, set up as the weekend hub sets up a race, for
 * a few teams with two policies: one that buys the most lap time per pound,
 * and one that never spends. Both sign the same sponsor tier each season. It
 * prints each team's championship place by season, its money, the gap between
 * the fastest and slowest car, and how often each tier's objective was met.
 *
 * `--difficulty easy|medium|hard` sets the rivals' level, and `--rival-pace off`
 * keeps their lap times at Medium so only their pit-wall calls change. The
 * script also prints how far rival stops sit from the best plan, the seconds
 * rivals spend on the wrong kind of tyre in wet races, and how often
 * teammates stop on the same lap.
 */

import { defaultTeams } from '../src/data/teams.ts';
import { SEASON_CALENDAR, fullRaceLaps, trackById } from '../src/data/tracks.ts';
import { runQualifying } from '../src/engine/qualifying.ts';
import { RaceSim } from '../src/engine/race.ts';
import { scoreRace } from '../src/engine/scoring.ts';
import { Track } from '../src/engine/track.ts';
import { DIFFICULTY, TUNING } from '../src/engine/tuning.ts';
import { bestClass, tyreClass } from '../src/engine/tyres.ts';
import type { Difficulty, TeamDef } from '../src/engine/types.ts';
import { RAIN_THRESHOLD, generateWeather } from '../src/engine/weather.ts';
import { AREAS, carryOver, deliverProjects, projectOptions, startProject } from '../src/state/development.ts';
import type { Area, ProjectOption } from '../src/state/development.ts';
import { effectiveTeams } from '../src/state/effectiveTeams.ts';
import { settleRace } from '../src/state/finance.ts';
import { SPONSORS, chooseSponsor, objectiveMet, sponsorOffers } from '../src/state/sponsors.ts';
import { isSeasonOver, newCareer, raceSeed, recordRace, teamStandings } from '../src/state/season.ts';
import type { Career } from '../src/state/season.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const seasons = Number(arg('seasons', '3'));
const seeds = Number(arg('seeds', '2'));
const playerTeams = arg('teams', 'aurora,solstice,cobalt,halcyon').split(',');
const fraction = Number(arg('fraction', '0.35'));
const reserve = Number(arg('reserve', '2'));
const tier = SPONSORS.tiers.findIndex((t) => t.tier === arg('sponsor', 'balanced'));
if (tier < 0) throw new Error(`--sponsor must be one of ${SPONSORS.tiers.map((t) => t.tier).join(', ')}`);
const difficulty = arg('difficulty', 'medium') as Difficulty;
if (!(difficulty in DIFFICULTY)) throw new Error('--difficulty must be easy, medium or hard');
const rivalPace = arg('rival-pace', 'on');
// A measuring switch only: the game never changes this table while it runs.
if (rivalPace === 'off') for (const level of Object.values(DIFFICULTY)) level.rivalPace = 0;
const editor = defaultTeams();
const geoms = new Map(SEASON_CALENDAR.map((id) => [id, new Track(trackById(id))]));

// Seconds a lap for one point in each area, from the engine's own numbers, averaged over the calendar.
const weights = SEASON_CALENDAR.map((id) => trackById(id).weights);
const avgWeight = (k: 'power' | 'aero' | 'chassis') => weights.reduce((s, w) => s + w[k], 0) / weights.length;
const lapsPerRace = SEASON_CALENDAR.reduce((s, id) => s + Math.max(8, Math.round(fullRaceLaps(trackById(id)) * fraction)), 0) / SEASON_CALENDAR.length;
const SECONDS_PER_POINT: Record<Area, number> = {
  power: avgWeight('power') * TUNING.carSecPerPoint,
  aero: avgWeight('aero') * TUNING.carSecPerPoint,
  chassis: avgWeight('chassis') * TUNING.carSecPerPoint,
  // A retirement costs about a minute against the field; one point cuts the chance of one by this much a race.
  reliability: ((TUNING.failureAtZeroReliability / 100) * fraction * 60) / lapsPerRace,
  // About one stop a race, 0.02 s a point.
  pitCrew: 0.02 / lapsPerRace,
};

type Policy = 'spend' | 'none';

function buy(career: Career): Career {
  for (;;) {
    const value = (o: ProjectOption) => (o.gain * (1 - o.risk / 2) * SECONDS_PER_POINT[o.area]) / o.cost;
    const best = projectOptions(career, editor)
      .filter((o) => !o.blocked && o.cost <= career.finance.balance - reserve)
      .sort((a, b) => value(b) - value(a))[0];
    if (!best) return career;
    career = startProject(career, editor, best.area, best.kind);
  }
}

/** What the rivals' pit-wall calls cost them, summed over every race played. */
const calls = { stopGap: 0, plans: 0, wrongTyreSeconds: 0, wetRivalRaces: 0, sameLap: 0, pairs: 0 };

function raceOnce(career: Career): Career {
  const teams = effectiveTeams(editor, career);
  const round = career.results.length;
  const def = trackById(career.calendar[round]);
  const laps = Math.max(8, Math.round(fullRaceLaps(def) * fraction));
  const seed = raceSeed(career, round);
  const weather = generateWeather(seed, def.rainChance ?? 0, laps * geoms.get(def.id)!.refLap * 1.08);
  const grid = runQualifying(def, teams, seed, { playerTeamId: career.playerTeamId, difficulty }).grid;
  const sim = new RaceSim({ track: def, teams, grid, laps, seed, playerTeamId: career.playerTeamId, weather, difficulty });
  const rivals = sim.cars.filter((c) => !c.isPlayer);
  for (const car of rivals) {
    const best = RaceSim.suggestPlan(def, car.team, car.driver, laps, null);
    if (car.plan.stops.length === 0 || best.stops.length === 0) continue;
    calls.stopGap += Math.abs(car.plan.stops[0].lap - best.stops[0].lap);
    calls.plans++;
  }
  const wet = weather.rain.some((r) => r > RAIN_THRESHOLD);
  if (wet) calls.wetRivalRaces += rivals.length;
  sim.start();
  while (sim.phase !== 'finished') {
    sim.step(0.1);
    if (!wet) continue;
    const wanted = bestClass(sim.wetness);
    for (const car of rivals) if (car.status === 'running' && tyreClass(car.tyre.compound) !== wanted) calls.wrongTyreSeconds += 0.1;
  }
  for (const team of teams) {
    if (team.id === career.playerTeamId) continue;
    const [a, b] = [sim.carById(`${team.id}:0`), sim.carById(`${team.id}:1`)];
    if (!a || !b || a.stops.length === 0 || b.stops.length === 0) continue;
    calls.pairs++;
    if (a.stops.some((s) => b.stops.some((t) => t.lap === s.lap))) calls.sameLap++;
  }
  const rows = scoreRace(sim.results(), sim.fastestLap?.carId ?? null);
  return deliverProjects(settleRace(recordRace(career, sim.totalLaps, rows, teams)).career).career;
}

const perf = (t: TeamDef) => (t.car.power + t.car.aero + t.car.chassis) / 3;

interface SeasonLine {
  place: number;
  balance: number;
  car: number;
  spread: number;
  /** Races in which each tier's objective was met, safe first. */
  hits: number[];
  /** Races won by either of the team's cars. */
  wins: number;
}

function play(teamId: string, policy: Policy, seed: number): SeasonLine[] {
  let career = newCareer(teamId, editor, seed, difficulty);
  const lines: SeasonLine[] = [];
  for (let s = 1; s <= seasons; s++) {
    const offers = sponsorOffers(career, effectiveTeams(editor, career));
    career = chooseSponsor(career, offers[tier]);
    const hits = offers.map(() => 0);
    while (!isSeasonOver(career)) {
      if (policy === 'spend') career = buy(career);
      career = raceOnce(career);
      const rows = career.results[career.results.length - 1].rows;
      offers.forEach((o, i) => (hits[i] += objectiveMet(o.objective, rows, teamId) ? 1 : 0));
    }
    const teams = effectiveTeams(editor, career);
    const place = teamStandings(career.results, teams).findIndex((t) => t.teamId === teamId) + 1;
    const perfs = teams.map(perf);
    const wins = career.results.filter((r) => r.rows.find((row) => row.position === 1)?.carId.startsWith(`${teamId}:`)).length;
    lines.push({ place, balance: career.finance.balance, car: perf(teams.find((t) => t.id === teamId)!), spread: Math.max(...perfs) - Math.min(...perfs), hits, wins });
    career = { ...career, season: career.season + 1, roundsBefore: career.roundsBefore + career.results.length, results: [], development: carryOver(career.development) };
  }
  return lines;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const startPlace = (id: string) => [...editor].sort((a, b) => perf(b) - perf(a)).findIndex((t) => t.id === id) + 1;

console.log(`\n${seasons} seasons, ${seeds} seeds, races at ${Math.round(fraction * 100)}% distance, reserve £${reserve}m, ${SPONSORS.tiers[tier].tier} sponsor, ${difficulty}, rival pace ${rivalPace}`);
console.log(`Seconds a lap per point: ${AREAS.map((a) => `${a} ${SECONDS_PER_POINT[a].toFixed(4)}`).join(', ')}\n`);
console.log('Team       Policy  Car rank  ' + Array.from({ length: seasons }, (_, i) => `S${i + 1} place  £m     car `).join(' ') + ' spread          met safe/bal/amb  wins a season');
const t0 = performance.now();
for (const id of playerTeams) {
  for (const policy of ['spend', 'none'] as Policy[]) {
    const runs = Array.from({ length: seeds }, (_, i) => play(id, policy, 1000 + i));
    const cols = Array.from({ length: seasons }, (_, s) => {
      const at = runs.map((r) => r[s]);
      return `${avg(at.map((l) => l.place)).toFixed(1).padStart(8)}  ${avg(at.map((l) => l.balance)).toFixed(1).padStart(5)}  ${avg(at.map((l) => l.car)).toFixed(1).padStart(5)}`;
    });
    const spread = Array.from({ length: seasons }, (_, s) => avg(runs.map((r) => r[s].spread)).toFixed(1)).join('/');
    const races = runs.length * seasons * SEASON_CALENDAR.length;
    const met = SPONSORS.tiers.map((_, i) => `${Math.round((100 * runs.flat().reduce((n, l) => n + l.hits[i], 0)) / races)}%`).join('/');
    const wins = avg(runs.flat().map((l) => l.wins)).toFixed(1);
    console.log(`${id.padEnd(10)} ${policy.padEnd(6)} ${String(startPlace(id)).padStart(8)}  ${cols.join(' ')}  ${spread.padEnd(15)} ${met.padEnd(17)} ${wins}`);
  }
}
const base = editor.map(perf);
console.log(`\nStarting spread ${(Math.max(...base) - Math.min(...base)).toFixed(1)}. ${((performance.now() - t0) / 1000).toFixed(0)} s.`);
console.log(
  `Rival calls: first stop ${(calls.stopGap / calls.plans).toFixed(2)} laps from the best plan, ` +
    `${(calls.wrongTyreSeconds / Math.max(1, calls.wetRivalRaces)).toFixed(1)} s a rival on the wrong tyres per wet race, ` +
    `teammates share a stop lap in ${Math.round((100 * calls.sameLap) / Math.max(1, calls.pairs))}% of races.`,
);
