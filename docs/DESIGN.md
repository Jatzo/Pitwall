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

## Calibration

`npm run calibrate -- --seeds 30` runs 300 full-distance races (30 seeds on each of the 10 circuits) with every car on AI strategy and prints the averages below. `--fraction 0.35` does the same at the game's default "Short" distance. The targets come from real grands prix; the figures are the last measurement.

| Measure | Target | Full distance | 35% distance |
| --- | --- | --- | --- |
| On-track overtakes per race | about 50 | 62.6 | 32.7 |
| Safety cars per race | about 1 | 1.04 | 0.41 |
| Retirements per race | about 1.6 | 1.70 | 0.74 |
| Winners on one / two / three stops | both one and two common | 44% / 45% / 10% | 99% one stop |
| Pole position converted to a win | about half | 55% | 48% |
| Won from fourth or lower on the grid | some | 6% | 9% |
| Average winning margin | under about 10 s | 12.1 s | 4.0 s |
| Fastest lap against the reference lap | within a few tenths | +0.39 s | +0.33 s |

Each circuit is meant to pose a different problem, and the per-circuit rows show it does (full distance, 30 races each):

| Circuit | Character | Overtakes | Stops per car | One-stop winners |
| --- | --- | --- | --- | --- |
| Hartwell Park | fastest lap, three DRS zones | 105 | 1.55 | 73% |
| Sable Coast Autodrome | long back straight | 79 | 1.64 | 60% |
| Monte Alba Autodrome | fast, two DRS zones | 65 | 1.68 | 53% |
| Ridgeback Raceway | highest tyre wear | 60 | 2.20 | 37% |
| Silverwood Circuit | all-rounder | 58 | 1.83 | 50% |
| Kestrel Ring | short and twisty | 58 | 1.94 | 27% |
| Dunmore Circuit | shortest lap, 79 laps | 57 | 2.13 | 20% |
| Vennholt Ring | tight and technical | 54 | 1.86 | 33% |
| Costa Alta Street Circuit | street circuit | 46 | 1.77 | 43% |
| Port Calder Street Circuit | slow street circuit | 44 | 1.80 | 47% |

The range of overtakes between circuits is narrower than in real racing, where a street circuit can see a handful and the busiest circuits around eighty. A car stuck behind another keeps trying every second, so a circuit's difficulty mostly delays a pass rather than preventing it; Port Calder needs a difficulty of 6 to be the hardest place to pass. Tyre wear is set per lap, so short laps such as Dunmore's add up to more stops over a race.

Covered by tests as well: a green-flag stop costs 18 to 27 s (measured median 21.6 s over 1,274 stops). Every circuit is also checked for layout faults: it must not come within 100 m of itself, must start on a near-straight so the grid and pit lane fit, must not need speeds faster than its layout allows, and must hold an 8-lap race with every car classified.

Two measurements shaped the race-control design. A stop under the safety car costs about 0.15 places on average against 3.3 places under green flags (400 and 1,140 stops), because the field slows and bunches up. That is why the game pauses and asks the player to make that call. And hazards are set per full-distance race: mechanical failures are a rate per second of a 305 km race, and incidents grow with the square root of distance, so a short race keeps some drama without a full race's worth of retirements.

The last tuning pass narrowed the car spread (`carSecPerPoint` 0.085 to 0.07), widened race-day form (`formSigma` 0.2 to 0.3), and taught the AI to save its tyres when nobody is within reach (`cruiseGap`), as real leaders do. Before it, pole won 65% of races, only 3% were won from fourth or lower, and the average margin was 15.2 s.

## Testing

`node --test` with native TypeScript type stripping, so there are no test dependencies. Covered: RNG, formatting, track geometry, strategy planner, race simulation (determinism, classification, lap and sector plausibility, fuel and wear bounds, car spacing, pit loss, safety car bunching, gaps after the flag, hazard scaling with distance, AI pace choices, auto mode, scoring), pit rejoin estimates, the key moments that pause a race, and season standings.

## Known limits

- A race in progress is not saved; only completed rounds are.
- Weather and car development do not exist yet.
- Track maps are authored from control points, not scanned from real layouts, by design.

## Roadmap

1. Weather: rain, drying lines, intermediates and wets, with forecast uncertainty.
2. Budget, R&D and car upgrades between rounds.
3. Driver contracts, development and a transfer market.
4. Sponsors and objectives.
5. Replay from the command log, plus lap-time and tyre-wear charts.
6. A wider spread of overtaking between circuits (see Calibration).
