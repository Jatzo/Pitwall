# Circuit design research

Facts for authoring fictional circuits that look and drive like grand prix circuits. Real circuit names appear here only as evidence. The game stays fictional. Figures marked "derived" are our own arithmetic, not a published number.

## 1. Rules and norms

FIA Appendix O (2026) is the primary source: [Appendix O 2026](https://www.fia.com/system/files/documents/appendix_o_2026_published_23122025.pdf).

- Minimum lap length for Formula One: 3.5 km. Recommended maximum for a new circuit: 7 km.
- Longest straight: 2 km maximum. Straights are measured on the line the fastest cars take, not the plan view.
- Track width for a new permanent circuit: at least 12 m. Width changes at no more than 1 m in 20 m. Starting grid at least 15 m wide, held to the exit of the first corner.
- Start line to first corner: preferably at least 250 m. Appendix O defines a corner as a change of direction of at least 45 degrees with a radius under 300 m.
- Grid slots: 8 m per car for Formula One.
- Run-off sits mainly on the outside of corners. Typical depth is 30 m to 100 m, set by approach and cornering speed. Verges are 1 m to 5 m. Low impact angles get a continuous vertical barrier, high angles get energy-absorbing barriers or gravel.
- Race distance: the fewest complete laps that exceed 305 km, and 260 km at Monaco. Two hours of racing is the cap. Source: [2026 Sporting Regulations, Section B](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_05_-_2026-02-27.pdf). Formula 1 reports a cut to 290 km from 2027 ([F1 Commission note](https://www.formula1.com/en/latest/article/regulatory-changes-for-2026-and-2027-agreed-at-latest-f1-commission-meeting.2wFfaMinLUT40dRVw3FeCC)). Treat 305 km as the norm.
- Monaco is the exception for a reason: 3.337 km and the slowest lap on the calendar. A 305 km race there would pass two hours.

## 2. Corner counts

Lap length and official turn count from [Wikipedia, List of Formula One circuits](https://en.wikipedia.org/wiki/List_of_Formula_One_circuits). Monza, Hungaroring and Montreal counts match the [Formula 1 circuit guides](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-autodromo-nazionale-monza.51PKqBRlxNs0fzLWQzsnd0). Counts vary by one between sources. Corners per km is derived.

| Circuit | Lap (km) | Corners | Per km |
|---|---|---|---|
| Monza | 5.793 | 11 | 1.9 |
| Red Bull Ring | 4.318 | 10 | 2.3 |
| Spa-Francorchamps | 7.004 | 20 | 2.9 |
| Barcelona | 4.657 | 14 | 3.0 |
| Silverstone | 5.891 | 18 | 3.1 |
| Suzuka | 5.807 | 18 | 3.1 |
| Hungaroring | 4.381 | 14 | 3.2 |
| Montreal | 4.361 | 14 | 3.2 |
| Baku | 6.003 | 20 | 3.3 |
| Circuit of the Americas | 5.513 | 20 | 3.6 |
| Singapore | 4.940 | 19 | 3.9 |
| Jeddah | 6.174 | 27 | 4.4 |
| Monaco | 3.337 | 19 | 5.7 |

Median: 3.2 corners per km. Permanent circuits sit between 1.9 and 3.9. Only the street circuits go higher. A 5 km lap at the median has 16 corners. Our current circuits are below that.

## 3. Corner types and how they drive

There is no official speed cut-off. Pat Symonds, as quoted in a [2021 F1 Racing column](https://www.pressreader.com/uk/f1-racing-uk/20210601/281543703854004), uses apex speed: slow below 125 km/h, medium 125 to 175 km/h, high above that. He calls the split arbitrary. Modern cars take many once-fast corners flat out, so they no longer count as corners at all.

Grip: drivers meet roughly 5 to 6 g in the fastest corners ([Formula Dream](https://www.formuladream.app/blog/f1-g-force-explained)). Mercedes measured a 5 g peak in Melbourne in 2017, the same article reports. Silverstone's Copse is taken close to 300 km/h at over 5 g ([Yahoo Sports](https://sports.yahoo.com/articles/silverstone-track-guide-corner-corner-115102560.html)). Slow corners load the car far less because aerodynamic grip falls with speed. No published slow-corner g figure was found.

| Type | Apex speed | Examples (sourced) | Radius (derived) |
|---|---|---|---|
| Hairpin | 45 to 80 km/h | Monaco hairpin 45 km/h, Montreal T10 and Singapore T13 about 55 to 60 km/h ([Autosport](https://www.autosport.com/f1/news/fastest-and-slowest-turns-on-the-f1-calendar/10571441/)) | 10 to 30 m |
| Slow chicane | 50 to 90 km/h | Monaco Nouvelle Chicane 55 km/h (same source) | 15 to 40 m per bend |
| Fast chicane | 200 to 280 km/h | Melbourne T11/12, approached over 280, left over 250 km/h ([Flow Racers](https://flowracers.com/blog/f1-corner-types/)) | 100 m and up |
| Esses | 150 to 285 km/h | Suzuka T3 to T7, up to 4 g ([F1 Briefing](https://f1briefing.com/7-corner-types-in-f1-tracks/)) | 60 to 150 m per bend |
| Sweeper | 220 to 300 km/h | Copse, over 5 g | 100 to 300 m |
| Double-apex | 150 to 300 km/h | Spoon first apex about 249 km/h; Pouhon over 5 g, speed quoted anywhere from 260 to 306 km/h | 80 to 200 m |
| Kink | Flat out | No figure published | 300 m and up |

Radius is speed squared over lateral acceleration. Assumed g: about 2 for hairpins, 3 for medium, 4.5 to 5 for fast corners. The assumed g for slow corners is ours. The published radii do not always reconcile: Suzuka's 130R is quoted at 130 m, about 320 km/h and 3.5 g, yet 320 km/h on 130 m needs about 6 g. Treat the radius as nominal. The racing line is wider.

## 4. Speed distribution and full throttle

Full-throttle share, fastest 2025 qualifying lap, from [Formula Dream](https://www.formuladream.app/blog/how-much-of-an-f1-lap-is-flat-out) (FastF1 telemetry, throttle above 98%):

| Type | Circuit | By time | By distance |
|---|---|---|---|
| Fast | Monza | 77.0% | 84.1% |
| Fast | Spa | 65.4% | 73.9% |
| Average | Silverstone | 68.5% | 77.6% |
| Average | Hungaroring | 54.0% | 62.3% |
| Street | Singapore | 53.0% | 64.7% |
| Street | Monaco | 44.4% | 57.5% |

Jeddah is a fast street circuit: 76.2% by time. Formula 1 quotes about 80% for Monza. Distance figures run about 9 points above time figures. Race laps will differ from qualifying laps. No race figures were found.

Share of slow, medium and fast corners per circuit: not published by any source found. Symonds describes the method, 200 m timing loops sorted into slow, medium, fast, power limited and straight, but gives no per-circuit table.

## 5. Designing for overtaking

What creates passing:

- A straight of about 800 m to 1 km, then a corner that cuts speed by at least 150 km/h ([Race Track Designer](https://racetrackdesigner.com/race-track-design-principles.html), [Apex Circuit Design](https://www.apexcircuitdesign.com/newsandsocial/f1-explains-podcast)). Hungaroring T1 takes cars from 310 to 96 km/h in 122 m at 4.5 g ([Formula 1 guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-hungaroring.4ddtLbzLWLRjli7Y793jqh), Brembo figures as reported).
- A corner tight enough to reward late braking. Silverstone's Brooklands is too open ([Sidepodcast](https://sidepodcast.com/post/tinkering-with-tilkes-circuits)).
- Width at the braking zone for side-by-side entry, and an exit where the overtaker can run wide and cut back.
- A clear view of the exit, so the line can be planned.
- Wide entry, narrower exit: cars funnel to one line.

What kills it:

- Walls on the outside of corners remove the cutback. Sidepodcast names Valencia and Singapore.
- Short or curved straights with light braking.
- Tight exits that stop two cars running together.
- A fast corner before the straight punishes the following car through lost downforce (Race Track Designer).

The sources disagree on the corner before the straight. Sidepodcast prefers a medium or fast corner, because slow corners stretch the field on exit and the chaser cannot close the gap. India's hairpin-then-straight design disappointed. Race Track Designer prefers a slow corner with a wide, opening exit. Our reading: a medium corner with a wide, opening exit.

## 6. Rhythm

Variety in speed, direction and commitment makes a lap. Large single-speed blocks are a design failure (Race Track Designer).

- Monza: a 1.1 km start straight, a braking zone, then flowing Lesmos, the Ascari chicane (T8 to T10) and the Parabolica. Two heavy stops, long flat-out runs between them ([Formula 1 guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-autodromo-nazionale-monza.51PKqBRlxNs0fzLWQzsnd0)).
- Suzuka: tightening T1 and T2, the S Curves (T3 to T7) taken on feel, the Degner double-apex, a hairpin, Spoon, flat-out 130R, then the Casio Triangle chicane ([Formula 1 guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-suzuka-circuit.2BbgsRdkeux78UBGbmYiZV)). A fast complex first, a slow technical middle, a fast corner, a chicane to settle the cars.
- Montreal: flat-out blasts, tight chicanes and a big braking zone for the hairpin at T10. The hairpin feeds a long straight and the final chicane, T13 and T14, with a wall on the exit ([Formula 1 guide](https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-gilles-villeneuve.5RUqO9YE80jmCiuODWNX9g)). The overtaking spot sits at the end of the lap.

## Rules of thumb for our fictional circuits

1. Corners per lap: about 3 per km. A 4.5 km lap gets 14 to 15, a 5.5 km lap gets 17 to 18. Stay under 4 per km unless the circuit is a street circuit.
2. Lap length: 4 to 6 km. Never under 3.5 km or over 7 km.
3. Mix by apex speed, our target: about 40% slow (below 125 km/h), 35% medium, 25% fast. Fast-circuit variants can shift 10 points from slow to fast.
4. Chicanes: 1 or 2 per lap, 3 at most. One slow chicane belongs near the end of a fast section. A fast chicane may take the place of a kink.
5. Hairpins: 1 or 2 per lap. Put one at the end of a long straight.
6. Longest straight: 0.8 to 1.2 km on the main straight. Never over 2 km. One second straight of 500 to 700 m is enough.
7. Radius per type: hairpin 10 to 30 m, medium corners 40 to 90 m, fast sweepers 100 to 300 m, kinks 300 m and up. Use the racing-line radius, not the kerb.
8. Main overtaking spot: end of the longest straight, with a speed drop of 150 km/h or more and a wide entry. The corner before it is medium with an open exit.
9. Second overtaking spot: end of the second-longest straight or after a hairpin. Keep the first corner at least 250 m from the start line.
10. Rhythm: never more than two corners of the same speed class in a row. Follow a fast complex with a slow technical section, and a long straight with a heavy stop.
11. Street variants: more corners per km (up to 4), walls on exits, narrower track. Expect fewer passes and make the main overtaking zone wider.
12. Full throttle by time: 65 to 75% for a fast circuit, 55 to 65% for average, 45 to 55% for a street circuit. Tune with the weather and tyre model, not by adding straights.
