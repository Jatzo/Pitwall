import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS, fullRaceLaps } from '../data/tracks.ts';
import { RaceSim } from './race.ts';
import { planStrategy } from './strategy.ts';
import { COMPOUNDS, tyrePenalty } from './tyres.ts';
import type { Compound, StrategyPlan } from './types.ts';

describe('tyres', () => {
  it('lose more time as they wear, and fall off a cliff when worn out', () => {
    for (const c of ['S', 'M', 'H'] as const) {
      let prev = -1;
      for (let w = 0; w <= 1.2; w += 0.05) {
        const p = tyrePenalty(c, w);
        assert.ok(p >= prev, `${c} not monotonic at ${w}`);
        prev = p;
      }
      assert.ok(tyrePenalty(c, 1.0) - tyrePenalty(c, 0.9) > tyrePenalty(c, 0.5) - tyrePenalty(c, 0.4));
    }
  });

  it('orders compounds: softer is faster fresh but wears quicker', () => {
    assert.ok(COMPOUNDS.S.paceDelta < COMPOUNDS.M.paceDelta);
    assert.ok(COMPOUNDS.M.paceDelta < COMPOUNDS.H.paceDelta);
    assert.ok(COMPOUNDS.S.wearPerLap > COMPOUNDS.M.wearPerLap);
    assert.ok(COMPOUNDS.M.wearPerLap > COMPOUNDS.H.wearPerLap);
  });
});

describe('strategy planner', () => {
  const team = defaultTeams()[0];
  const driver = team.drivers[0];

  function check(plan: StrategyPlan, laps: number): void {
    // Stops are strictly increasing and inside the race.
    let prev = 0;
    for (const s of plan.stops) {
      assert.ok(s.lap > prev, 'stops must be increasing');
      assert.ok(s.lap < laps, 'stop must be before the end');
      prev = s.lap;
    }
    // Two different compounds are used.
    const used = new Set<Compound>([plan.startCompound, ...plan.stops.map((s) => s.compound)]);
    assert.ok(used.size >= 2, 'must use two compounds');
  }

  it('produces legal plans for every circuit at full distance', () => {
    for (const def of TRACKS) {
      const laps = fullRaceLaps(def);
      const plan = RaceSim.suggestPlan(def, team, driver, laps, null);
      check(plan, laps);
      assert.ok(plan.stops.length >= 1 && plan.stops.length <= 3);
    }
  });

  it('respects a fixed start compound', () => {
    const def = TRACKS[0];
    const plan = RaceSim.suggestPlan(def, team, driver, fullRaceLaps(def), 'S');
    assert.equal(plan.startCompound, 'S');
  });

  it('needs fewer stops for a short race than a long one', () => {
    const def = TRACKS[0];
    const short = RaceSim.suggestPlan(def, team, driver, 15, null);
    const long = RaceSim.suggestPlan(def, team, driver, fullRaceLaps(def), null);
    assert.ok(short.stops.length <= long.stops.length);
  });

  it('pits more often when tyres wear faster', () => {
    const base = {
      lapsRemaining: 58,
      lapsCompleted: 0,
      pitLoss: 22,
      currentCompound: null,
      currentWear: 0,
      used: [] as Compound[],
    };
    const gentle = planStrategy({ ...base, wearRates: { S: 0.04, M: 0.022, H: 0.015 } });
    const harsh = planStrategy({ ...base, wearRates: { S: 0.09, M: 0.055, H: 0.04 } });
    assert.ok(harsh.stops.length >= gentle.stops.length);
    assert.ok(harsh.stops.length >= 2);
  });
});
