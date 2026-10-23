/**
 * Weather: a rain timeline for one race, and a forecast of it.
 *
 * The timeline is decided before the race from a seed and the circuit's
 * chance of rain, so the weekend forecast and the race describe the same
 * weather. The forecast is honest in a measurable sense: each window gets a
 * noisy reading of whether it will rain, the noise grows with how far ahead
 * the window is, and the reading is turned into a probability with Bayes'
 * rule against the base rate. A stated 30% therefore comes true about 30% of
 * the time, and the near future is clearer than the far future.
 */

import { Rng, mixSeed } from './rng.ts';

export interface WeatherTimeline {
  /** Seconds between samples. */
  stepS: number;
  /** The race length the timeline was made for, in seconds. */
  durationS: number;
  /** Rain intensity per sample, 0 (none) to 1 (heavy). Empty means dry throughout. */
  rain: number[];
}

export interface ForecastWindow {
  fromS: number;
  toS: number;
  /** Probability that it rains at some point in the window. */
  chance: number;
}

/** Rain lighter than this does not wet the track and does not count as rain. */
export const RAIN_THRESHOLD = 0.05;
export const DRY_WEATHER: WeatherTimeline = { stepS: 30, durationS: 0, rain: [] };

const STEP_S = 30;
const SPELL_MIN_S = 8 * 60;
const SPELL_MAX_S = 35 * 60;
const SECOND_SPELL_CHANCE = 0.35;
const FORECAST_WINDOW_S = 300;

/** The rain for one race: none, or one or two spells with a ramp in and out. */
export function generateWeather(seed: number, rainChance: number, durationS: number): WeatherTimeline {
  const rng = new Rng(mixSeed(seed, 'weather'));
  if (!rng.chance(rainChance)) return { stepS: STEP_S, durationS, rain: [] };
  const rain = new Array<number>(Math.ceil(durationS / STEP_S) + 1).fill(0);
  const spells = rng.chance(SECOND_SPELL_CHANCE) ? 2 : 1;
  for (let k = 0; k < spells; k++) {
    const length = rng.range(SPELL_MIN_S, SPELL_MAX_S);
    // A spell may already be under way at the start, but at least half of it falls in the race.
    const start = Math.max(-length / 2, rng.range(-0.1, 0.95) * durationS);
    const peak = rng.range(0.15, 1);
    const ramp = Math.min(length / 3, 300);
    for (let i = 0; i < rain.length; i++) {
      const t = i * STEP_S - start;
      if (t < 0 || t > length) continue;
      const shape = Math.min(1, t / ramp, (length - t) / ramp);
      rain[i] = Math.max(rain[i], peak * shape);
    }
  }
  return { stepS: STEP_S, durationS, rain };
}

/** Rain intensity at a moment. After the timeline ends the last sample holds. */
export function rainAt(weather: WeatherTimeline, t: number): number {
  const { rain, stepS } = weather;
  if (rain.length === 0) return 0;
  const x = Math.max(0, t / stepS);
  const i = Math.floor(x);
  if (i >= rain.length - 1) return rain[rain.length - 1];
  return rain[i] + (rain[i + 1] - rain[i]) * (x - i);
}

/** Whether any rain falls between two moments. */
export function windowHasRain(weather: WeatherTimeline, fromS: number, toS: number): boolean {
  for (let t = fromS; t <= toS; t += weather.stepS / 2) {
    if (rainAt(weather, t) > RAIN_THRESHOLD) return true;
  }
  return false;
}

/**
 * Chance that a forecast window of the given length sees rain, before any
 * reading: the race's chance of rain times the share of the race an average
 * one or two spells would touch.
 */
function baseRate(rainChance: number, durationS: number, windowS: number): number {
  const averageSpell = (SPELL_MIN_S + SPELL_MAX_S) / 2;
  const spells = 1 + SECOND_SPELL_CHANCE;
  // Spells that start late run past the flag, so on average only about three
  // quarters of a spell lands in the race (measured over 2,000 races).
  const touched = Math.min(0.95, (0.75 * spells * (averageSpell + windowS)) / Math.max(durationS, windowS));
  return Math.min(0.95, Math.max(0.01, rainChance * touched));
}

/**
 * The forecast as it stands at `nowS`: `count` windows on a fixed 5-minute
 * grid. A new forecast is issued every 5 minutes, and each issue takes a fresh
 * reading of every window, so numbers hold steady between issues and firm up
 * as a window approaches.
 */
export function forecast(
  weather: WeatherTimeline,
  seed: number,
  rainChance: number,
  nowS: number,
  count = 6,
  windowS = FORECAST_WINDOW_S,
): ForecastWindow[] {
  const issue = Math.floor(nowS / FORECAST_WINDOW_S);
  const first = Math.floor(nowS / windowS);
  const prior = baseRate(rainChance, weather.durationS, windowS);
  const windows: ForecastWindow[] = [];
  for (let k = 0; k < count; k++) {
    const fromS = (first + k) * windowS;
    const toS = fromS + windowS;
    const lead = Math.max(0, fromS - nowS);
    const noise = 0.15 + (0.9 * lead) / 1800;
    const rng = new Rng(mixSeed(seed, `forecast:${windowS}:${issue}:${first + k}`));
    const truth = windowHasRain(weather, fromS, toS) ? 1 : 0;
    const reading = truth + rng.normal(0, noise);
    // Likelihood ratio of the reading under rain (mean 1) against no rain (mean 0).
    const ratio = Math.exp((2 * reading - 1) / (2 * noise * noise));
    const chance = (prior * ratio) / (prior * ratio + 1 - prior);
    windows.push({ fromS, toS, chance: Math.min(0.98, Math.max(0.02, chance)) });
  }
  return windows;
}
