import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { TRACKS } from '../data/tracks.ts';
import { runQualifying } from './qualifying.ts';
import { RaceSim, TUNING, aiPaceMode, carId, incidentRatePerSecond, referenceRaceLaps } from './race.ts';
import type { RaceConfig } from './race.ts';
import { POINTS_TABLE, scoreRace } from './scoring.ts';

const DT = 0.1;

function makeSim(opts: Partial<RaceConfig> & { trackIndex?: number } = {}): RaceSim {
  const track = TRACKS[opts.trackIndex ?? 0];
  const teams = defaultTeams();
  const seed = opts.seed ?? 1;
  const quali = runQualifying(track, teams, seed);
  return new RaceSim({
    track,
    teams,
    grid: quali.grid,
    laps: opts.laps ?? 20,
    seed,
    playerTeamId: opts.playerTeamId ?? null,
    strategies: opts.strategies,
  });
}

function run(sim: RaceSim): RaceSim {
  sim.start();
  while (sim.phase !== 'finished') sim.step(DT);
  return sim;
}

/** Temporarily override tuning values (e.g. to remove randomness from a measurement). */
function withTuning<T>(overrides: Partial<Record<'incidentsPerRace' | 'failureAtZeroReliability', number>>, fn: () => T): T {
  const target = TUNING as unknown as Record<string, number>;
  const saved = Object.fromEntries(Object.keys(overrides).map((k) => [k, target[k]]));
  Object.assign(target, overrides);
  try {
    return fn();
  } finally {
    Object.assign(target, saved);
  }
}

describe('qualifying', () => {
  it('orders the whole grid with unique cars and faster cars up front', () => {
    const teams = defaultTeams();
    const q = runQualifying(TRACKS[0], teams, 5);
    assert.equal(q.grid.length, 20);
    assert.equal(new Set(q.grid).size, 20);
    const rows = q.rows.map((r) => r.best);
    // Q3 runners (top 10) set faster times than anyone who was knocked out earlier.
    assert.ok(Math.max(...rows.slice(0, 10)) < Math.min(...rows.slice(10)) + 1.5);
    // The strongest car beats the weakest by a clear margin.
    const top = q.grid.indexOf(carId(teams[0], 0));
    const bottom = q.grid.indexOf(carId(teams[9], 1));
    assert.ok(top < bottom);
  });

  it('is deterministic', () => {
    const teams = defaultTeams();
    assert.deepEqual(runQualifying(TRACKS[1], teams, 3), runQualifying(TRACKS[1], teams, 3));
  });
});

describe('race simulation', () => {
  it('is deterministic for a seed', () => {
    const a = run(makeSim({ seed: 11 }));
    const b = run(makeSim({ seed: 11 }));
    assert.deepEqual(a.results(), b.results());
    assert.deepEqual(
      a.events.map((e) => e.message),
      b.events.map((e) => e.message),
    );
    const c = run(makeSim({ seed: 12 }));
    assert.notDeepEqual(a.results(), c.results());
  });

  it('runs to completion with a sensible classification', () => {
    const sim = run(makeSim({ seed: 3, laps: 25 }));
    const rows = sim.results();
    assert.equal(rows.length, 20);
    assert.equal(new Set(rows.map((r) => r.carId)).size, 20);
    assert.equal(rows[0].laps, 25);
    assert.ok(rows[0].finished);
    // Finishers come before retirements, and lap counts never increase down the order.
    let seenRetired = false;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].finished) seenRetired = true;
      else assert.ok(!seenRetired, 'a finisher is classified behind a retirement');
      if (i > 0 && rows[i].finished && rows[i - 1].finished) {
        assert.ok(rows[i].laps <= rows[i - 1].laps);
        if (rows[i].laps === rows[i - 1].laps) {
          assert.ok((rows[i].timeS ?? 0) >= (rows[i - 1].timeS ?? 0));
        }
      }
    }
    assert.ok(sim.time > 25 * sim.track.refLap && sim.time < 25 * sim.track.refLap * 1.5);
  });

  it('records plausible lap times and sectors', () => {
    const sim = run(makeSim({ seed: 4, laps: 15 }));
    const ref = sim.track.refLap;
    for (const car of sim.cars) {
      for (const lap of car.laps) {
        assert.ok(lap.time > ref * 0.95, `lap too fast: ${lap.time}`);
        const sum = lap.sectors[0] + lap.sectors[1] + lap.sectors[2];
        assert.ok(Math.abs(sum - lap.time) < 1e-6);
        assert.ok(lap.sectors.every((s) => s > 0));
      }
      if (car.status === 'finished') {
        const clean = car.laps.filter((l) => l.clean);
        for (const l of clean) assert.ok(l.time < ref * 1.25, `clean lap too slow: ${l.time}`);
      }
    }
    assert.ok(sim.fastestLap !== null);
  });

  it('never runs a car out of fuel on the standard setting, and wear stays bounded', () => {
    const sim = run(makeSim({ seed: 6, laps: 30 }));
    for (const car of sim.cars) {
      assert.ok(car.fuel >= 0);
      if (car.status === 'finished') assert.notEqual(car.outReason, 'Out of fuel');
      assert.ok(car.tyre.wear < 1.5, `${car.id} wear ${car.tyre.wear}`);
    }
  });

  it('keeps cars apart on track', () => {
    const sim = makeSim({ seed: 8, laps: 12 });
    sim.start();
    let tooClose = 0;
    while (sim.phase !== 'finished') {
      sim.step(DT);
      if (sim.time < 30) continue;
      const on = sim.cars
        .filter((c) => c.status === 'running' && !c.passing)
        .map((c) => ({ c, pos: sim.track.wrap(c.dist) }))
        .sort((a, b) => a.pos - b.pos);
      for (let i = 0; i < on.length - 1; i++) {
        if (on[i + 1].pos - on[i].pos < 2 && !on[i + 1].c.passing) tooClose++;
      }
    }
    // A few ticks of merging at pit exit are fine; sustained overlap is not.
    assert.ok(tooClose < 200, `cars overlapped for ${tooClose} car-ticks`);
  });

  it('costs roughly twenty to twenty-five seconds to pit under green flags', () => {
    const sim = withTuning({ incidentsPerRace: 0, failureAtZeroReliability: 0 }, () =>
      run(makeSim({ seed: 2, laps: 40 })),
    );
    assert.equal(sim.scCount, 0);
    const losses: number[] = [];
    for (const car of sim.cars) {
      const clean = car.laps.filter((l) => l.clean).map((l) => l.time).sort((a, b) => a - b);
      if (clean.length < 8) continue;
      const median = clean[Math.floor(clean.length / 2)];
      for (let i = 0; i < car.laps.length - 1; i++) {
        if (car.laps[i].pit && car.laps[i + 1].pit) {
          losses.push(car.laps[i].time + car.laps[i + 1].time - 2 * median);
        }
      }
    }
    assert.ok(losses.length >= 10, `expected pit stops to happen, got ${losses.length}`);
    losses.sort((a, b) => a - b);
    const med = losses[Math.floor(losses.length / 2)];
    assert.ok(med > 18 && med < 27, `median pit loss ${med}`);
  });

  it('executes a player pit request with the chosen compound', () => {
    const teams = defaultTeams();
    const playerTeam = teams[3];
    const id = carId(playerTeam, 0);
    const sim = withTuning({ incidentsPerRace: 0, failureAtZeroReliability: 0 }, () => {
      const s = makeSim({
        seed: 5,
        laps: 20,
        playerTeamId: playerTeam.id,
        strategies: {
          [carId(playerTeam, 0)]: { startCompound: 'M', stops: [] },
          [carId(playerTeam, 1)]: { startCompound: 'M', stops: [] },
        },
      });
      s.start();
      s.command({ type: 'pit', carId: id, compound: 'H' });
      while (s.phase !== 'finished') s.step(DT);
      return s;
    });
    const car = sim.carById(id)!;
    assert.equal(car.status, 'finished');
    assert.equal(car.stops.length, 1);
    assert.equal(car.stops[0].compound, 'H');
    assert.ok(car.stops[0].duration > 1.5 && car.stops[0].duration < 12);
    assert.equal(car.penaltySeconds, 0, 'two compounds were used so no penalty');
  });

  it('penalises finishing a dry race on a single compound', () => {
    const teams = defaultTeams();
    const playerTeam = teams[0];
    const one: Record<string, { startCompound: 'M'; stops: [] }> = {};
    one[carId(playerTeam, 0)] = { startCompound: 'M', stops: [] };
    one[carId(playerTeam, 1)] = { startCompound: 'M', stops: [] };
    const sim = withTuning({ incidentsPerRace: 0, failureAtZeroReliability: 0 }, () =>
      run(makeSim({ seed: 9, laps: 12, playerTeamId: playerTeam.id, strategies: one })),
    );
    for (const id of Object.keys(one)) {
      const car = sim.carById(id)!;
      assert.equal(car.status, 'finished');
      assert.ok(car.penaltySeconds > 0);
    }
  });

  it('reports gaps that grow down the order', () => {
    const sim = makeSim({ seed: 13, laps: 30 });
    sim.start();
    while (sim.time < 20 * sim.track.refLap && sim.phase !== 'finished') sim.step(DT);
    const order = sim.standings().filter((c) => c.status === 'running');
    const gaps = order.slice(1, 6).map((c) => sim.gapToLeader(c).seconds);
    assert.ok(gaps.every((g) => g === null || g >= 0));
    const finite = gaps.filter((g): g is number => g !== null);
    for (let i = 1; i < finite.length; i++) assert.ok(finite[i] >= finite[i - 1] - 0.5);
  });

  it('keeps the mechanical failure risk per second the same in short and long races', () => {
    const short = makeSim({ laps: 20 });
    const long = makeSim({ laps: referenceRaceLaps(TRACKS[0]) });
    for (const car of short.cars) {
      assert.equal(car.failureRate, long.carById(car.id)!.failureRate);
    }
  });

  it('scales race incidents with the square root of race distance', () => {
    const full = referenceRaceLaps(TRACKS[0]);
    const lap = TRACKS[0].refLapS!;
    const expected = (laps: number) => incidentRatePerSecond(laps, full, lap) * laps * lap;
    assert.ok(Math.abs(expected(full) - TUNING.incidentsPerRace) < 1e-9);
    assert.ok(Math.abs(expected(full / 4) - TUNING.incidentsPerRace / 2) < 1e-9);
  });

  it('reports finished cars by the difference in finishing time', () => {
    const sim = run(makeSim({ seed: 5 }));
    const order = sim.standings().filter((c) => c.finishTime !== null);
    for (let i = 1; i < order.length; i++) {
      if (order[i].lap !== order[i - 1].lap) continue;
      const expected = order[i].finishTime! + order[i].penaltySeconds - (order[i - 1].finishTime! + order[i - 1].penaltySeconds);
      assert.equal(sim.gapToAhead(order[i]), expected);
    }
    const last = order[order.length - 1];
    if (last.lap === order[0].lap) {
      assert.equal(sim.gapToLeader(last).seconds, last.finishTime! + last.penaltySeconds - order[0].finishTime! - order[0].penaltySeconds);
    }
  });

  it('lets a safety car period bunch the field and then restart', () => {
    // Find a seed that produces a safety car, then check the field closes up.
    let found = false;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      const sim = makeSim({ seed, laps: 30 });
      sim.start();
      let minSpread = Infinity;
      while (sim.phase !== 'finished') {
        sim.step(DT);
        if (sim.sc.active) {
          const order = sim.standings().filter((c) => c.status === 'running');
          if (order.length > 6) {
            minSpread = Math.min(minSpread, (order[0].dist - order[5].dist) / sim.track.length);
          }
        }
      }
      if (sim.scCount > 0) {
        found = true;
        assert.ok(sim.events.some((e) => e.kind === 'green'), 'safety car should end');
        assert.ok(minSpread < 0.3, `top six should bunch up, spread ${minSpread} laps`);
      }
    }
    assert.ok(found, 'expected at least one safety car across 12 seeds');
  });

  it('hands control back and forth with auto mode without breaking', () => {
    const teams = defaultTeams();
    const t = teams[2];
    const sim = makeSim({ seed: 14, laps: 12, playerTeamId: t.id });
    sim.start();
    sim.command({ type: 'auto', carId: carId(t, 0), enabled: true });
    sim.command({ type: 'pace', carId: carId(t, 1), mode: 'push' });
    while (sim.phase !== 'finished') sim.step(DT);
    assert.equal(sim.phase, 'finished');
  });
});

describe('scoring', () => {
  it('awards the standard points table plus a fastest-lap point in the top ten', () => {
    const sim = run(makeSim({ seed: 7, laps: 15 }));
    const rows = scoreRace(sim.results(), sim.fastestLap?.carId ?? null);
    const finishers = rows.filter((r) => r.finished);
    finishers.slice(0, 10).forEach((r, i) => {
      const bonus = r.carId === sim.fastestLap?.carId ? 1 : 0;
      assert.equal(r.points, POINTS_TABLE[i] + bonus);
    });
    for (const r of rows.filter((x) => !x.finished)) assert.equal(r.points, 0);
  });
});

describe('AI pace choice', () => {
  const calm = { safetyCar: false, lapsRemaining: 30, wear: 0.3, lapsToNextStop: 10, gapAhead: 5, gapBehind: 2 };

  it('runs standard pace with nothing going on', () => {
    assert.equal(aiPaceMode(calm), 'standard');
  });

  it('pushes when close behind another car on healthy tyres', () => {
    assert.equal(aiPaceMode({ ...calm, gapAhead: 0.8 }), 'push');
  });

  it('saves tyres when nobody is close ahead and the car behind is far back', () => {
    assert.equal(aiPaceMode({ ...calm, gapAhead: null, gapBehind: TUNING.cruiseGap + 1 }), 'conserve');
    assert.equal(aiPaceMode({ ...calm, gapAhead: 5, gapBehind: TUNING.cruiseGap + 1 }), 'conserve');
    assert.equal(aiPaceMode({ ...calm, gapAhead: null, gapBehind: TUNING.cruiseGap - 1 }), 'standard');
  });

  it('pushes on the last laps when there is a place to win or defend', () => {
    assert.equal(aiPaceMode({ ...calm, lapsRemaining: 2, gapAhead: null, gapBehind: 3 }), 'push');
    assert.equal(aiPaceMode({ ...calm, lapsRemaining: 2, gapAhead: 4, gapBehind: 30 }), 'push');
  });

  it('cruises to the flag with a safe lead and nobody to catch', () => {
    assert.equal(aiPaceMode({ ...calm, lapsRemaining: 2, gapAhead: null, gapBehind: TUNING.cruiseGap + 1 }), 'conserve');
  });

  it('conserves under the safety car', () => {
    assert.equal(aiPaceMode({ ...calm, safetyCar: true, gapAhead: 0.5 }), 'conserve');
  });
});
