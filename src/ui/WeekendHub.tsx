import { useEffect, useMemo, useState } from 'react';
import { fullRaceLaps, trackById } from '../data/tracks.ts';
import { formatLap } from '../engine/format.ts';
import { wearRatesFor } from '../engine/insights.ts';
import { runQualifying } from '../engine/qualifying.ts';
import type { QualifyingResult } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import { Track } from '../engine/track.ts';
import { PIT_COMPOUNDS, bestClass } from '../engine/tyres.ts';
import { RAIN_THRESHOLD, forecast, generateWeather, rainAt } from '../engine/weather.ts';
import type { WeatherTimeline } from '../engine/weather.ts';
import type { StrategyPlan, TeamDef } from '../engine/types.ts';
import { AREAS } from '../state/development.ts';
import { currentRound, raceSeed } from '../state/season.ts';
import type { Career } from '../state/season.ts';
import { PlanEditor } from './PlanEditor.tsx';
import { Standings } from './Standings.tsx';
import { TeamLogo } from './TeamLogo.tsx';
import { TrackOutline } from './TrackOutline.tsx';
import { cssVar } from './colour.ts';
import { formatMoney } from './money.ts';

export interface RaceSetup {
  trackId: string;
  laps: number;
  grid: string[];
  plans: Record<string, StrategyPlan>;
  seed: number;
  weather: WeatherTimeline;
}

interface Props {
  career: Career;
  teams: TeamDef[];
  onStart: (setup: RaceSetup) => void;
  onCalendar: () => void;
  onHQ: () => void;
}

const LENGTHS = [
  { pct: 0.2, label: 'Sprint (20%)' },
  { pct: 0.35, label: 'Short (35%)' },
  { pct: 0.5, label: 'Half (50%)' },
  { pct: 1, label: 'Full distance' },
];

export function WeekendHub({ career, teams, onStart, onCalendar, onHQ }: Props) {
  const round = currentRound(career);
  const trackDef = trackById(career.calendar[round]);
  const fullLaps = fullRaceLaps(trackDef);
  const [pct, setPct] = useState(0.35);
  const laps = Math.max(8, Math.round(fullLaps * pct));
  const playerTeam = teams.find((t) => t.id === career.playerTeamId) ?? teams[0];
  const geom = useMemo(() => new Track(trackDef), [trackDef]);

  const [quali, setQuali] = useState<QualifyingResult | null>(null);
  const [plans, setPlans] = useState<Record<string, StrategyPlan>>({});

  const seed = raceSeed(career, round);
  const rainChance = trackDef.rainChance ?? 0;
  // The weather is decided with the round, so the forecast here and the race share it.
  const durationS = laps * geom.refLap * 1.08;
  const weather = useMemo(() => generateWeather(seed, rainChance, durationS), [seed, rainChance, durationS]);
  const wetStart = rainAt(weather, 0) > RAIN_THRESHOLD;
  const outlook = forecast(weather, seed, rainChance, 0, 4, durationS / 4);

  const suggest = (i: 0 | 1): StrategyPlan => {
    if (wetStart) return { startCompound: bestClass(Math.min(1, rainAt(weather, 0) * 1.2)) === 'wet' ? 'W' : 'I', stops: [] };
    return RaceSim.suggestPlan(trackDef, playerTeam, playerTeam.drivers[i], laps, null);
  };

  // Reset the weekend when the round or the grid itself changes: an edited team, a signed driver or an
  // upgrade that arrived. Spending money in Team HQ changes the career but not the grid, so it keeps qualifying.
  const gridKey = teams.map((t) => `${t.id}:${t.drivers.map((d) => d.id).join('+')}:${AREAS.map((a) => t.car[a]).join(',')}`).join('|');
  useEffect(() => {
    setQuali(null);
  }, [round, gridKey]);
  useEffect(() => {
    setPlans({ [`${playerTeam.id}:0`]: suggest(0), [`${playerTeam.id}:1`]: suggest(1) });
  }, [round, laps, playerTeam.id, wetStart]);

  const byId = new Map<string, { team: TeamDef; name: string }>();
  for (const team of teams) team.drivers.forEach((d, i) => byId.set(`${team.id}:${i}`, { team, name: d.name }));

  const runQuali = () => setQuali(runQualifying(trackDef, teams, seed));

  const start = () => {
    if (!quali) return;
    onStart({ trackId: trackDef.id, laps, grid: quali.grid, plans, seed, weather });
  };

  return (
    <div className="page stack">
      <div className="row wrap">
        <div style={{ flex: 1 }}>
          <div className="muted label-caps">
            Round {round + 1} of {career.calendar.length}
          </div>
          <h2 className="page-title">{trackDef.name}</h2>
          <div className="muted">{trackDef.location}</div>
        </div>
        <button className="btn" onClick={onCalendar}>Season calendar</button>
        <button className="btn" onClick={onHQ}>
          Team HQ <span className={`num ${career.finance.balance < 0 ? 'bad' : 'muted'}`}>{formatMoney(career.finance.balance)}</span>
        </button>
        <TeamLogo team={playerTeam} size={44} />
        <div>
          <b>{playerTeam.name}</b>
          <div className="muted small">Team principal</div>
        </div>
      </div>

      {career.sponsor?.season !== career.season && (
        <div className="warnbox">No sponsor is signed for this season. Team HQ has three offers.</div>
      )}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="panel">
            <h3>Circuit</h3>
            <TrackOutline track={geom} height={230} />
            <div className="trackinfo" style={{ marginTop: 8 }}>
              <div><b>{(geom.length / 1000).toFixed(2)} km</b><span>Lap length</span></div>
              <div><b>{formatLap(geom.refLap)}</b><span>Reference lap</span></div>
              <div><b>{geom.corners.length}</b><span>Corners</span></div>
              <div><b>{geom.drsZones.length}</b><span>DRS zones</span></div>
              <div><b>{trackDef.tyreSeverity.toFixed(2)}</b><span>Tyre wear</span></div>
              <div><b>{trackDef.overtakingDifficulty.toFixed(2)}</b><span>Overtaking</span></div>
            </div>
          </div>

          <div className="panel">
            <h3>Race length</h3>
            <div className="row wrap">
              <span className="btn-group">
                {LENGTHS.map((l) => (
                  <button key={l.pct} className={`btn small ${pct === l.pct ? 'active' : ''}`} onClick={() => setPct(l.pct)} disabled={!!quali}>
                    {l.label}
                  </button>
                ))}
              </span>
              <span className="muted num">{laps} laps</span>
            </div>
            {quali && <div className="muted small" style={{ marginTop: 6 }}>Locked once qualifying has run.</div>}
          </div>

          <div className="panel">
            <h3>Weather forecast</h3>
            <div className="muted small" style={{ marginBottom: 6 }}>
              It rains at some point in about {Math.round(rainChance * 100)}% of races here. Chance of rain in each quarter of this race:
            </div>
            <div className="forecast" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }} role="list" aria-label="Rain forecast by quarter of the race">
              {outlook.map((w, i) => (
                <div key={w.fromS} role="listitem" aria-label={`Quarter ${i + 1}: ${Math.round(w.chance * 100)}% chance of rain`}>
                  <i style={{ opacity: 0.15 + 0.85 * w.chance }} />
                  <span className="num">{Math.round(w.chance * 100)}%</span>
                  <span className="muted">Q{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>
              {wetStart
                ? 'It is raining at the start: intermediates or full wets can be chosen as the start tyre.'
                : 'Forecasts further ahead are less certain. In the race, the next half hour is shown in 5-minute steps.'}
            </div>
          </div>

          <Standings results={career.results} teams={teams} playerTeamId={career.playerTeamId} />
        </div>

        <div className="stack">
          <div className="panel">
            <div className="row" style={{ marginBottom: 8 }}>
              <h3 className="panel-head" style={{ margin: 0, flex: 1 }}>Qualifying</h3>
              <button className="btn primary" onClick={runQuali} disabled={!!quali}>
                {quali ? 'Completed' : 'Run qualifying'}
              </button>
            </div>
            {!quali && <div className="muted">Three knockout sessions decide the grid. Run it, then set your race strategy.</div>}
            {quali && (
              <table className="tbl">
                <thead>
                  <tr><th>P</th><th>Driver</th><th className="r">Q1</th><th className="r">Q2</th><th className="r">Q3</th></tr>
                </thead>
                <tbody>
                  {quali.rows.map((r) => {
                    const info = byId.get(r.carId);
                    if (!info) return null;
                    return (
                      <tr key={r.carId} className={info.team.id === career.playerTeamId ? 'me' : ''}>
                        <td className="num">{r.position}</td>
                        <td>
                          <span className="team-chip">
                            <span className="swatch" style={cssVar('--team', info.team.colors.primary)} />
                            {info.name}
                          </span>
                        </td>
                        <td className="r num">{r.q1 !== null ? formatLap(r.q1) : ''}</td>
                        <td className="r num">{r.q2 !== null ? formatLap(r.q2) : ''}</td>
                        <td className="r num">{r.q3 !== null ? formatLap(r.q3) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {[0, 1].map((n) => {
            const i = n as 0 | 1;
            const id = `${playerTeam.id}:${i}`;
            const plan = plans[id];
            if (!plan) return null;
            const driver = playerTeam.drivers[i];
            return (
              <div className="panel" key={id}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <span className="swatch" style={cssVar('--team', playerTeam.colors.primary)} />
                  <h3 className="panel-head" style={{ margin: 0, flex: 1 }}>Strategy: {driver.name}</h3>
                  {quali && <span className="muted num">grid P{quali.grid.indexOf(id) + 1}</span>}
                </div>
                <PlanEditor
                  plan={plan}
                  totalLaps={laps}
                  rates={wearRatesFor(trackDef, playerTeam, driver)}
                  onChange={(p) => setPlans((prev) => ({ ...prev, [id]: p }))}
                  onSuggest={() => setPlans((prev) => ({ ...prev, [id]: suggest(i) }))}
                  startOptions={wetStart ? PIT_COMPOUNDS : undefined}
                />
              </div>
            );
          })}

          <button className="btn primary big" onClick={start} disabled={!quali}>
            {quali ? 'Go to the grid' : 'Run qualifying first'}
          </button>
        </div>
      </div>
    </div>
  );
}
