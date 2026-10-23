import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DRY_WEATHER, forecast, generateWeather, rainAt, windowHasRain } from './weather.ts';

const HOUR = 3600;

describe('weather', () => {
  it('is the same for the same seed', () => {
    assert.deepEqual(generateWeather(7, 0.5, HOUR), generateWeather(7, 0.5, HOUR));
  });

  it('never rains when the chance is zero, and dry weather reads as zero everywhere', () => {
    for (let seed = 1; seed <= 200; seed++) {
      assert.ok(!windowHasRain(generateWeather(seed, 0, HOUR), 0, HOUR));
    }
    assert.equal(rainAt(DRY_WEATHER, 1234), 0);
  });

  it('rains in about the share of races the circuit says', () => {
    for (const chance of [0.2, 0.5]) {
      let wet = 0;
      for (let seed = 1; seed <= 400; seed++) if (windowHasRain(generateWeather(seed, chance, HOUR), 0, HOUR)) wet++;
      assert.ok(Math.abs(wet / 400 - chance) < 0.07, `chance ${chance}: ${wet / 400}`);
    }
  });

  it('keeps reading the last sample after the timeline ends, for races that overrun', () => {
    const wet = generateWeather(3, 1, 600);
    assert.equal(rainAt(wet, 10_000), wet.rain[wet.rain.length - 1]);
  });

  it('gives forecast chances between 2% and 98%', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const w of forecast(generateWeather(seed, 0.4, HOUR), seed, 0.4, 600)) {
        assert.ok(w.chance >= 0.02 && w.chance <= 0.98);
      }
    }
  });

  it('is honest: a stated chance comes true about that often', () => {
    const bins = Array.from({ length: 5 }, () => ({ said: 0, happened: 0, n: 0 }));
    for (let seed = 1; seed <= 600; seed++) {
      const weather = generateWeather(seed, 0.4, HOUR);
      for (const now of [0, 900, 1800]) {
        for (const w of forecast(weather, seed, 0.4, now)) {
          const bin = bins[Math.min(4, Math.floor(w.chance * 5))];
          bin.said += w.chance;
          bin.happened += windowHasRain(weather, w.fromS, w.toS) ? 1 : 0;
          bin.n++;
        }
      }
    }
    for (const b of bins.filter((x) => x.n >= 150)) {
      const said = b.said / b.n;
      const happened = b.happened / b.n;
      assert.ok(Math.abs(said - happened) < 0.12, `said ${said.toFixed(2)}, happened ${happened.toFixed(2)} (n=${b.n})`);
    }
  });

  it('is sharper in the next few minutes than half an hour out', () => {
    let near = 0;
    let far = 0;
    let count = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const weather = generateWeather(seed, 0.4, HOUR);
      const windows = forecast(weather, seed, 0.4, 600);
      const score = (i: number) => (windows[i].chance - (windowHasRain(weather, windows[i].fromS, windows[i].toS) ? 1 : 0)) ** 2;
      near += score(0);
      far += score(windows.length - 1);
      count++;
    }
    assert.ok(near / count < (far / count) * 0.6, `Brier near ${near / count}, far ${far / count}`);
  });
});
