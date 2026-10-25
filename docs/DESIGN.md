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
- **Saves carry a version.** `src/state/migrate.ts` reads every version the game has written: a milestone 4 save is moved up once and kept as a backup, and a save that is damaged, made by a newer version, or for a team not on the grid is reported on the menu instead of being replaced. Each race row records the driver as well as the car, so driver points follow the driver and team points follow the car. Race seeds count rounds across the whole career, so a second season does not replay the first.
- **Money is booked after each race.** `src/state/finance.ts` holds every amount in one table. A race pays a start fee and prize money by points, and costs salaries, running costs and a repair for each car retired in a collision. The balance can go below zero; the debt carries over. `src/state/effectiveTeams.ts` lays the career over the editor's teams, so the editor's changes always come first and the engine still receives a plain `TeamDef[]`.
- **Car development.** `src/state/development.ts` sells projects in five areas: a quick fix (one round, one point, always works), an upgrade (two rounds, two points) or a major package (three rounds, four points). The bigger ones cost less per point, but a bad result gives half. A point costs more the closer a rating is to 99, with the fourth power of the distance, so a point at 84 costs about half what one at 92 does. Rivals spend a budget each round on their weakest area. The budget is drawn from the career seed and scaled by what the rival's own level costs, so every rival gains about the same points and the field keeps its order. At each season start every gain loses a quarter.
- **Sponsors.** `src/state/sponsors.ts` offers three deals a season from the seed: safe (high base, score points or both cars finish), balanced (a car in the top N, set by where the car ranks) and ambitious (low base, beat the team one place up, or win for the strongest car). The base is paid every race and the bonus when the objective is met. A deal runs one season.
- **Contracts and seasons.** `src/state/contracts.ts` ends a season: money, the car and contracts carry over, every gain loses a quarter, the sponsor's deal ends and the calendar starts again. A driver whose contract ends asks from 85% of their base salary with no points to 120% for the season's top scorer, or the player signs a free agent from `src/data/drivers.ts`. A signed free agent takes another race number if the editor has given theirs away, and the editor shows that seat but does not edit it.
- **Balance.** `npm run season` plays three seasons headless for four teams, with a policy that buys the most lap time per pound against one that never spends. Over three seeds: the safe objective was met in 79 to 93% of races, the balanced in 39 to 80% and the ambitious in 14 to 68%. With a midfield team as the player, the gap between the fastest and slowest car held at 24 points over the three seasons; the strongest team spending everything opened it by about 3. A team that spends finishes about a place higher than one that does not from its second season, and one that never spends drifts back about a place.

## Model decisions

| Area | Decision | Why |
| --- | --- | --- |
| Track | Polygon of key points in metres, each corner a true arc of authored radius, sampled every 5 m | Real straights and real corner radii, so hairpins and chicanes come out as they are drawn; the builder names the points when two corners do not fit |
| Speed profile | Lateral grip that rises with speed (2 g in a hairpin, over 4 g in a fast sweeper), power-limited acceleration and 4 g braking, then scaled to a reference lap about 5% slower than the physics allows | Hairpins at 55 to 65 km/h, fast corners flat out, and lap times the layout can deliver |
| Tyres | Linear wear effect plus a quadratic cliff at 72% | Gives a real reason to pit before the tyre "falls off" |
| Overtaking | Probability per tick from pace delta, DRS, circuit ease and racecraft | No teleporting past cars, but also no unbreakable trains |
| Gaps | 10 m checkpoint timestamps per car | Gap is time the car behind needs to reach where the car ahead was |
| AI strategy | Exhaustive search over stops and compounds, greedy stint allocation | Small search space, explainable, shared with the player's "Suggest best plan" |
| Penalties | A single-compound race costs 30 s; the AI plans it at 60 s so it never gambles on it | Keeps AI behaviour sensible while the player can still try it |
| Weather | A rain timeline decided before the race; track wetness on the racing line and off it | The weekend forecast and the race share one weather, and the line can dry before the rest of the track |
| Forecast | A noisy reading of each 5-minute window, turned into a chance of rain with Bayes' rule | Honest by construction: a stated 30% comes true about 30% of the time, and the near future is clearer than the far |
| Wet tyres | A loss per lap for each tyre class as a function of wetness, crossing at 0.14 and 0.56 | One curve set drives lap times, rival decisions and the numbers shown to the player |

## Weather

`src/engine/weather.ts` decides each race's rain before the weekend: with the circuit's chance of rain (15% to 40%), one or two spells of 8 to 35 minutes, ramped in and out. The race tracks two wetness levels. Rain pushes both towards a level set by its strength; without rain they dry, and running cars clear the racing line, so the line dries several times faster than the rest of the track. Off-line water makes passing harder, DRS is disabled above 30% wetness, and incidents rise with wetness, mostly for cars on the wrong tyres.

Each tyre class loses time to the conditions: slicks quickly as the track gets wet, intermediates when it is dry (and they overheat and wear fast), full wets unless it is properly wet. Every car is also up to 9 s a lap slower on a soaked track. Running intermediates or wets waives the two-compound rule.

Rival teams react to the rain they can see. Each lap they project the racing line forward 20 laps with the same wetting and drying model, total what each tyre class would lose, and stop when the saving beats the pit loss times a per-team caution (0.5 to 1.3), so teams split on when to stop. The forecast is the player's edge: it is not used by the rivals.

The forecast's honesty is measured, not assumed. Over 2,000 races per length:

| Stated chance | 30-minute race | 60-minute race | 90-minute race |
| --- | --- | --- | --- |
| 0 to 20% | 3% rained | 4% | 4% |
| 20 to 40% | 25% | 29% | 30% |
| 40 to 60% | 44% | 51% | 51% |
| 60 to 80% | 65% | 71% | 71% |
| 80 to 100% | 94% | 96% | 97% |

Each band's average stated chance sits near its middle (5%, 29%, 49%, 70%, 95%), so short races run a few points wet-shy in the middle bands.

Weather draws come from their own streams, and every wet-only path is skipped on a dry track, so a race without rain runs as it did before weather existed. That was checked once when the model was added (8 races, identical finishing times to the last bit), and a test keeps a never-raining timeline identical to no weather at all.

## Calibration

`npm run calibrate -- --seeds 30` runs 300 full-distance races (30 seeds on each of the 10 circuits) with every car on AI strategy and prints the averages below. `--fraction 0.35` does the same at the game's default "Short" distance. The targets come from real grands prix; the figures are the last measurement.

| Measure | Target | Full distance | 35% distance |
| --- | --- | --- | --- |
| On-track overtakes per race | about 50 | 45.9 | 28.2 |
| Safety cars per race | about 1 | 0.99 | 0.40 |
| Retirements per race | about 1.6 | 1.63 | 0.69 |
| Winners on one / two / three stops | both one and two common | 49% / 43% / 7% | 100% one stop |
| Pole position converted to a win | about half | 54% | 57% |
| Won from fourth or lower on the grid | some | 10% | 9% |
| Average winning margin | under about 10 s | 12.5 s | 4.5 s |
| Fastest lap against the reference lap | within a few tenths | +0.37 s | +0.28 s |

Overtaking sits a little under its target. The circuits were rebuilt with real corner radii, which leaves fewer and shorter straights where cars can pass, and raising the base pass rate by a quarter (`passRate` 0.1 to 0.125) only added three passes a race. The number of places to pass now sets the limit.

Each circuit is meant to pose a different problem, and the per-circuit rows show it does (full distance, 30 races each):

| Circuit | Character | Corners | Overtakes | Stops per car | One-stop winners |
| --- | --- | --- | --- | --- | --- |
| Hartwell Park | fastest lap, longest straight | 15 | 75 | 1.30 | 80% |
| Kestrel Ring | short and twisty | 12 | 56 | 1.88 | 43% |
| Monte Alba Autodrome | fast, two DRS zones | 14 | 50 | 1.65 | 53% |
| Dunmore Circuit | shortest lap, 79 laps | 11 | 50 | 2.13 | 17% |
| Sable Coast Autodrome | long back straight | 16 | 50 | 1.66 | 53% |
| Ridgeback Raceway | highest tyre wear | 12 | 48 | 2.01 | 43% |
| Vennholt Ring | tight and technical | 16 | 47 | 1.84 | 27% |
| Silverwood Circuit | all-rounder | 13 | 47 | 1.67 | 60% |
| Costa Alta Street Circuit | street circuit | 17 | 26 | 1.76 | 57% |
| Port Calder Street Circuit | slow street circuit | 16 | 9 | 1.85 | 60% |

With real corners the spread of overtaking between circuits now looks like real racing: a handful at the slow street circuit, around seventy-five at the power circuit. A car stuck behind another still retries every second, so Port Calder keeps a high difficulty (6) on top of its layout. Tyre wear is set per lap, so short laps such as Dunmore's add up to more stops over a race.

Covered by tests as well: a green-flag stop costs 18 to 27 s (measured median 21.4 s over 2,825 stops). Every circuit is also checked for layout faults: it must not come within 100 m of itself, must have 10 to 20 corners and a corner under 100 km/h, must keep every straight under the 2 km limit, must have room for the pit lane on the start straight with the drawn lane clear of the rest of the track, must not need speeds faster than its layout allows, and must hold an 8-lap race with every car classified.

Two measurements shaped the race-control design. A stop under the safety car costs about 0.17 places on average against 3.1 places under green flags (974 and 2,816 stops), because the field slows and bunches up. That is why the game pauses and asks the player to make that call. And hazards are set per full-distance race: mechanical failures are a rate per second of a 305 km race, and incidents grow with the square root of distance, so a short race keeps some drama without a full race's worth of retirements.

With weather on (`--weather`), as in the game, 28% of full-distance races see rain. Wet races average 4.11 stops a car and 16% of them are won from fourth or lower, against 10% of dry races. Across all races, retirements rise from 1.63 to 1.73 and safety cars from 0.99 to 1.05.

Qualifying uses the same car and driver ratings as the race, plus three sources of luck: half of each driver's race-day form (`qualiFormShare`), a factor shared by a team's two cars for how well the car suits that session (`qualiTeamSigma`, 0.2 s), and lap-to-lap noise set by driver consistency. Without the first two, the top team took pole in all 200 test sessions and every team qualified within about a place of its usual spot. Now the fastest team on each circuit takes pole 60% of the time, midfield teams move three places or so from weekend to weekend, and the slowest team's best is 14th. Sharing all of the race-day form made pole too good a bet (66% of poles won, 3% of races won from fourth or lower), so qualifying shows only half of it.

The last tuning pass narrowed the car spread (`carSecPerPoint` 0.085 to 0.07), widened race-day form (`formSigma` 0.2 to 0.3), and taught the AI to save its tyres when nobody is within reach (`cruiseGap`), as real leaders do. Before it, pole won 65% of races, only 3% were won from fourth or lower, and the average margin was 15.2 s.

## Look

The interface borrows from television race graphics: near-black panels, one racing red, and a condensed display face.

- Type: Saira Semi Condensed for titles, positions and driver codes; Barlow for text; JetBrains Mono for every time and gap. All three are bundled from Fontsource (SIL Open Font Licence), Latin characters only, about 164 KB in total.
- Colour: every colour is a token in `src/styles.css`. Red marks rules, active controls and the selected car; a lighter red is used for red text, because the strong red is too dark for small text on near-black. Timing colours follow television graphics: purple for the fastest lap of the race, green for a driver's personal best, amber for the safety car and blue for rain. Text on a team colour picks black or white by brightness.
- Shape: sharp corners throughout, with an angled cut on three things only: the race bar, status pills and the story team block.
- Checked by `src/ui/theme.test.ts`: every text colour against every surface it sits on, at WCAG AA (4.5:1), and the ink on every default team colour. The test also fails if a colour is written into the stylesheet outside the token list.

The race map draws each circuit in its surroundings, made from the circuit's own geometry: kerbs at every numbered corner, gravel or tarmac run-off on the outside of slow corners, three grandstands and the pit building. Around them sits a setting picked per circuit in `src/ui/circuitLook.ts`: countryside, parkland, moorland, forest, mountain, coast, or a street circuit's city blocks and harbour. Each kind of shape has a band of distance from the track and the pit lane, from the road edge for kerbs to at least 50 m back for trees and city blocks. A shape that breaks its band is dropped, never moved, and `src/ui/scenery.test.ts` measures every shape on every circuit against its band by brute force.

The scenery is built once per race, in 5 to 19 ms, into its own SVG under a second SVG that holds only the cars, so a frame repaints the cars and nothing else. In headless Chrome at 32x, a race frame takes about 15 ms, against 20 ms when the circuit and the cars shared one SVG, and hiding the scenery makes no measurable difference.

Cars are arrows in team colours with a dark outline, so they stand out against grass, gravel and asphalt, and each points the way its car travels. On the pit lane the arrow follows the lane's own line, which bends up to 38 degrees away from the track's heading where it leaves and rejoins the circuit. `src/ui/markers.test.ts` checks the direction against each car's movement on the track and on the lane.

Beside race control, a camera shows a close-up chosen by a director in `src/ui/director.ts`. In order, it shows a car the player has chosen to follow, the story on screen, a fight involving the player's car, the closest fight in the top five, and otherwise the leader. It holds each of its own choices for six seconds, so the picture does not hunt. Up to 4x the camera follows a 450 m window, and at 8x a 900 m one. At 16x and 32x a car crosses several windows a second, so the camera holds a fixed shot of the third of the lap the car is in and cuts when it moves on. When the player has asked for reduced motion the camera never pans: the close-up holds still with the car at the back of the frame, and cuts as the car leaves. The camera reuses the map's ground layer and moves it with a CSS transform. It costs about 4 ms a frame: about 75 frames a second against 89 without it, in headless Chrome at 32x.

The player's two drivers talk on the team radio (`src/ui/radio.ts`). They react to a place gained or lost, tyres at the cliff, the car ahead pitting and the last lap, and they answer when the player asks for a stop. Each trigger has three or four lines, picked from the race seed so a replay says the same thing, and a driver stays quiet about the same thing for four laps. A line waits up to six seconds behind the story it answers and sits below the factual stories about the same car, so it never pushes one off the strip. Over six 20-lap races the two drivers say about seven lines a race, and three in four reach the strip at 8x to 32x.

The timing tower, the car panel, race control and the story strip are memoised. They redraw on the race screen's 180 ms refresh, or at once when the player selects a car or gives a command. Before, they redrew on every animation frame. Measured on the production build in headless Chrome at 1440 by 900, with the CPU slowed four times: a race at 32x runs at 66 frames a second against 46 before (medians of 10 runs each, alternating), and at 4x race speed at 75 against 56 (5 runs each). At full CPU speed the work per frame fell from 4.6 to 2.7 ms. With the CPU slowed, selecting a car at 32x takes about 40 ms to paint against 34 ms before; at 4x race speed it is quicker, 24 ms against 29.

## Testing

`node --test` with native TypeScript type stripping, so there are no test dependencies. Covered: RNG, formatting, track geometry, strategy planner, race simulation (determinism, classification, lap and sector plausibility, fuel and wear bounds, car spacing, pit loss, safety car bunching, gaps after the flag, hazard scaling with distance, AI pace choices, auto mode, scoring), pit rejoin estimates, the key moments that pause a race, weather (rain frequency, forecast honesty and sharpness, wet tyre crossovers, wetting and drying, rival tyre changes, wet starts, a dry race unchanged by the weather model), season standings, and the management layer: save migration from a real milestone 4 save, money, car development and rival progress, sponsors and their objectives, contracts and the change of season.

## Known limits

- A race in progress is not saved; only completed rounds are.
- A midfield team that spends ends about one place higher than one that does not, where the economy aimed for two places up.
- Qualifying is always dry; rain arrives only in the race.
- Rival teams sometimes fit intermediates and then full wets a few laps later in a strengthening shower, because they only see the rain already falling.
- Circuits are drawn to the design rules of real circuits (corner counts, radii, straight lengths: see [research/circuit-design.md](research/circuit-design.md)) but are not copies of real layouts, by design.
- The pit lane is drawn with each team's garage, but the race still times every stop at the start line; the map moves each car to its own garage.

## Roadmap

1. Drivers who develop, and a transfer market in which rival teams sign drivers too.
2. Replay from the command log, plus lap-time and tyre-wear charts.
3. Wet qualifying.
