# Design notes

## Goals

1. A game that is genuinely fun to play, not a demo.
2. A codebase that shows range: simulation modelling, algorithms, state management, UI, testing and CI.
3. No licensing risk, so every team, driver and circuit is fictional and fully user-editable.

## Architecture

```
            +------------------+
  data/ --> |  engine (pure TS) | <-- tests, scripts/sim.ts (headless)
            +---------+--------+
                      |  RaceSim.step(dt), RaceSim.command(cmd)
            +---------v--------+
            |  state/ (season,  |  localStorage
            |  standings, save) |
            +---------+--------+
                      |
            +---------v--------+
            |  ui/ (React)     |  rAF loop + fixed 0.1 s sim step
            +------------------+
```

- **The engine never imports React or touches the browser.** That is what makes it testable in Node, runnable headless for balancing, and replayable: a race is fully determined by its config and seed, and player input is a log of `RaceCommand`s.
- **Fixed timestep, variable rendering.** The UI accumulates real time, steps the sim in 0.1 s increments, and interpolates marker positions between steps (`prevDist` to `dist`) so motion is smooth at 1x.
- **Per-car RNG streams** (`mixSeed(seed, label)`), so adding a car or an event does not reshuffle every other random draw.

## Model decisions

| Area | Decision | Why |
| --- | --- | --- |
| Track | Centripetal Catmull-Rom spline, 5 m resample | Smooth closed loops from a handful of control points, no overshoot |
| Speed profile | Grip limit, then forward acceleration and backward braking passes, rescaled to a reference lap | Plausible corner and straight speeds while keeping authored lap times |
| Tyres | Linear wear effect plus a quadratic cliff at 72% | Gives a real reason to pit before the tyre "falls off" |
| Overtaking | Probability per tick from pace delta, DRS, circuit ease and racecraft | No teleporting past cars, but also no unbreakable trains |
| Gaps | 10 m checkpoint timestamps per car | Gap is time the car behind needs to reach where the car ahead was |
| AI strategy | Exhaustive search over stops and compounds, greedy stint allocation | Small search space, explainable, shared with the player's "Suggest best plan" |
| Penalties | A single-compound race costs 30 s; the AI plans it at 60 s so it never gambles on it | Keeps AI behaviour sensible while the player can still try it |

## Calibration targets

Measured with `scripts/sim.ts` over many seeds and circuits, and covered by tests where practical:

- One- and two-stop winners both occur (about 40% / 60% over 40 full-length races, averaging 1.7 stops).
- Pit stop costs roughly 18 to 27 s of race time in clear air.
- About 50 on-track overtakes per full race, fewer where overtaking is hard.
- About one safety car (1.1) and 1.6 retirements per full race on average.
- Lap times within a few tenths of the reference lap for the best car early in a stint.

## Testing

`node --test` with native TypeScript type stripping, so there are no test dependencies. Covered: RNG, track geometry, strategy planner, race simulation (determinism, classification, lap and sector plausibility, fuel and wear bounds, car spacing, pit loss, safety car bunching, auto mode, scoring) and season standings.

## Known limits

- A race in progress is not saved; only completed rounds are.
- Weather, damage repair and car development do not exist yet.
- Track maps are authored from control points, not scanned from real layouts, by design.

## Roadmap

1. Season calendar of 8 to 12 circuits, with calendar and championship screens.
2. Weather: rain, drying lines, intermediates and wets, with forecast uncertainty.
3. Budget, R&D and car upgrades between rounds.
4. Driver contracts, development and a transfer market.
5. Sponsors and objectives.
6. Replay from the command log, plus lap-time and tyre-wear charts.
