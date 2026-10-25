# Pitwall case study

## What it is

Pitwall is a browser-based Formula-style team manager written in TypeScript. The player runs two cars through ten-round seasons on fictional circuits, and watches every car move round a live map while making tyre, fuel and pit-stop calls. Between races they spend a budget on car upgrades, sign a sponsor for the season and decide which drivers to keep.

A real-time race simulation has three requirements that pull against each other. It must be deterministic, so a race can be replayed and tested from a seed. It must be plausible, so overtakes, safety cars and retirements land near real-race figures. It must be fun, so the player faces decisions that matter and results that are not foregone. Most of the work went into finding where the simulation failed one of the three, measuring it, and changing the cause.

## Skills shown

| Skill area | Where to look | Evidence |
| --- | --- | --- |
| Simulation modelling | `src/engine/track.ts`, `tyres.ts`, `weather.ts`, `race.ts` | Circuits built from straights and true arcs of real radii, speed profiles from grip that rises with speed, tyre wear with a cliff, and a wet-track model, running a 58-lap race headless in well under a second |
| Algorithms | `src/engine/strategy.ts`, `race.ts`, `circuitBuilder.ts` | Strategy search with greedy stint allocation, gap timing from 10 m checkpoints, and corner arcs fitted between straights with the clash named when two corners do not fit |
| Probability | `src/engine/weather.ts` | A rain forecast built with Bayes' rule, with its reliability measured over 2,000 races per race length |
| Deterministic design | `src/engine/rng.ts` | `mixSeed(seed, label)` gives each purpose its own random stream, so adding a car or an event does not reshuffle other draws |
| React architecture | `src/ui/RaceScreen.tsx`, `moments.ts` | A fixed 0.1 s simulation step inside an animation loop, with interpolation, and pausing on the exact step through refs |
| State management and migrations | `src/state/migrate.ts`, `effectiveTeams.ts` | Saves read from every version the game has written, and the career laid over the editor's teams, so the engine still receives plain team data |
| Game economy | `scripts/season.ts`, `src/state/finance.ts`, `development.ts`, `sponsors.ts` | Whole careers played headless, spending against not spending, with the targets and the one target missed recorded |
| Testing | `src/**/*.test.ts` | 352 `node:test` tests, including statistical tests (forecast honesty, rain frequency), geometry tests (every circuit checked for faults) and a real milestone 4 save as a migration fixture |
| Calibration method | `scripts/calibrate.ts` | Batch runs of 300 headless races compared with real-race targets, recorded in `docs/DESIGN.md` |
| CI/CD | `.github/workflows/ci.yml`, `deploy.yml` | GitHub Actions runs typecheck, lint, test and build, then deploys to Pages |
| Accessibility | `src/ui/TimingTower.tsx`, `Conditions.tsx`, `DecisionPrompt.tsx` | A timing tower that works from the keyboard, ARIA meters, and an alert dialog for race decisions |
| Documentation | `README.md`, `docs/DESIGN.md` | Architecture, model decisions with reasons, measured tables and known limits |

## Problems and how they were solved

### 1. Short races were deadlier than long ones

**Seen.** A 20-lap playtest produced three mechanical failures.

**Measured.** Failure risk was set per race and spread over however many laps were run. A 35% race therefore averaged 1.7 retirements, the same as a full race.

**Changed.** Failures became a rate per second of a 305 km race. Incidents grow with the square root of distance.

**Result.** 0.69 retirements per short race. Full races are unchanged at about 1.7.

### 2. Finding the decision that matters

**Seen.** At 32x speed a safety car came and went without the player noticing.

**Measured.** Over 1,550 pit stops, a stop under the safety car cost 0.15 places on average. Under green flags it cost 2.96.

**Changed.** The game now pauses for a safety car, damage, rain and a change in the best tyre, and asks for the call. The pause stops the simulation on the exact 0.1 s step through refs. React state would only take effect after up to 80 more steps at 32x.

**Result.** The player is asked at the moments where the choice is worth the most.

### 3. Races were too predictable

**Seen.** Over 300 races, pole won 65%, only 3% were won from fourth or lower, and winning margins averaged 15.2 s.

**Measured.** Four single-setting changes were tried. Pole wins dropped to between 46% and 54%, but margins did not move.

**Changed.** Margin needed a behaviour change. Rival drivers now save tyres when nobody is within reach, as real leaders do, and push to the flag only with a place to win or defend.

**Result.** Pole wins 52%, 11% are won from fourth or lower, and margins average 10.9 s.

### 4. Small samples mislead

**Seen.** A 20-seed run (80 races) gave 0.81 safety cars per race against a target of 1.

**Measured.** The 300-race run gave 1.08.

**Changed.** Nothing in the model. The setting was already right.

**Result.** Every balance claim since then comes from 300 races.

### 5. Gaps after the flag showed "--"

**Seen.** Once cars crossed the line, the timing tower had no gaps.

**Measured.** Gaps come from 10 m checkpoint timestamps. On the cool-down lap cars slow and pass each other, so comparing checkpoints stops meaning anything.

**Changed.** After the flag, the gap is the difference in finishing times. A test covers it.

**Result.** The results table shows real gaps.

### 6. Circuit difficulty barely changed overtaking

**Seen.** Raising a street circuit's difficulty from 1.8 to 3.0 cut overtakes from only 72 to 58 a race.

**Measured.** A car stuck behind another retries every second, so difficulty delays a pass instead of preventing it.

**Changed.** The circuit now uses 6.0.

**Result.** It became the hardest place to pass, but the spread between circuits stayed narrower than in real racing. The circuit rebuild (story 9) fixed that: 9 overtakes a race at Port Calder, 71 at Hartwell Park.

### 7. Adding weather without changing dry races

**Seen.** A new model touches every lap time, so it can quietly alter races that never see rain.

**Measured.** Weather draws come from their own seeded streams, and every wet-only path is skipped on a dry track. Eight races were compared against the old code.

**Changed.** A test now keeps a never-raining timeline identical to no weather at all.

**Result.** The eight races finished identically to the last bit.

### 8. An honest forecast

**Seen.** The forecast turns a noisy reading of each 5-minute window into a probability with Bayes' rule.

**Measured.** Over 2,000 races it over-forecast: it said 29% and it rained in 22%. Late rain spells run past the flag.

**Changed.** The base rate was corrected. Rival teams react only to the rain they can see, so the forecast is the player's edge. A code review then found that a cautious rival could lose its planned dry stop and take a 30 s penalty. That was fixed, with a test.

**Result.** Stated and observed chances now sit within 2 points for 60 and 90-minute races.

### 9. Circuits that looked nothing like circuits

**Seen.** Playtesting, the owner said the circuits were too basic, with not enough corners or chicanes.

**Measured.** Each circuit was a smooth curve through 16 to 32 hand-placed points. The curve rounded off every tight corner, so no circuit had a real hairpin or chicane. Research into real grands prix gave the targets: about 3.2 corners per km, a mix of slow, medium and fast corners, a main straight of 0.8 to 1.2 km, and nothing over the 2 km limit. Converting the old outlines automatically only reproduced the same blobs.

**Changed.** Circuits are now drawn the way designers draw them: key points in metres, each with a corner radius, joined by straights and true arcs. The builder names the two points when their corners do not fit on the straight between them. Grip now rises with speed, as downforce does, so a 15 m hairpin comes out at about 60 km/h and a 200 m sweeper is flat out. All ten circuits were redrawn by hand to the research targets, with a pit lane and a garage for each team.

**Result.** 11 to 17 corners per circuit, hairpins at 56 to 63 km/h, and chicanes that read as two corners on the map. Over 300 races, overtakes spread from 9 a race at the slowest street circuit to 71 at the power circuit, close to real racing. They fell overall from 63 to 44 a race, a little under the target of 50, because there are fewer places to pass. Tests check every circuit's corner count, its slowest corner, its longest straight and that the pit lane is clear of the rest of the track.

### 10. A new save format that must not lose a season

**Seen.** The management layer needed money, contracts and car development in the save. The milestone 4 save had none of these, and it kept driver points by car seat, which would hand one driver's points to another once drivers change seats.

**Measured.** A real milestone 4 save, three rounds into a season, was captured as a test fixture before anything changed.

**Changed.** Saves carry a version. A milestone 4 save is moved up once, and its old copy is kept as a backup. Every race row records the driver as well as the car, so driver points follow the driver and team points follow the car. Race seeds count rounds across the whole career, so a second season does not replay the first. A save the game cannot read (damaged, made by a newer version, or for a team not on the grid) is reported on the menu and replaced only after the player confirms.

**Result.** The fixture loads with every standing and every race seed unchanged. Tests cover the newer, damaged and off-grid cases, and a season moved up from milestone 4 was played on to its end in the browser.

### 11. An economy where the leader could buy everything

**Seen.** The first version of money and car upgrades paid the strongest team about £4m a race in prize money. Rivals spent their budgets on their weakest areas, where points are cheapest, so the field slowly closed up.

**Measured.** `npm run season` plays three seasons headless for four teams, with a policy that buys the most lap time per pound against one that never spends. In the first run the strongest team spent its car up to 99 and opened the gap between the fastest and slowest car to 29.5 points, against 22.6 when it kept its money. With a midfield team as the player, the gap shrank every season: 23.0, 22.0, 21.7. A spending midfield team finished between half a place and 1.2 places higher than one that kept its money. The first sponsor objectives were either nearly free (a top 19 finish for the slowest car was met in 86 to 100% of races) or close to impossible (beating the team two places up was met in 3 to 21% of races).

**Changed.** Prize money fell from £0.1m to £0.04m a point, and every team is paid £0.6m for starting. Each rival's budget is scaled by what its own level costs, so every rival gains about the same points a round. A point costs more with the fourth power of a rating's distance towards 99, so one at 92 costs about twice one at 84. Sponsor objectives were reset to a top N set by where the car ranks, and to beating the team one place up.

**Result.** Over three seeds (`npm run season -- --seasons 3 --seeds 3`), with a midfield team as the player the gap held at 23.9, 23.6 and 24.0 points over three seasons, and the strongest team spending everything opened it by 3.3 to 3.9. Sponsor objectives were met in 79 to 93% of races for safe deals, 39 to 80% for balanced and 14 to 68% for ambitious. From its second season, a team that spends finishes about a place higher than one that does not. The aim was two places, so the gap is recorded as a known limit.

## Run it

```
npm install
npm test
npm run calibrate -- --seeds 30
npm run season -- --seasons 3 --seeds 3
```

The full setup is in the [README](../README.md) and the architecture is in [docs/DESIGN.md](DESIGN.md).
