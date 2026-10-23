import { useEffect, useMemo, useState } from 'react';
import { fullRaceLaps, trackById } from '../data/tracks.ts';
import { formatLap } from '../engine/format.ts';
import { wearRatesFor } from '../engine/insights.ts';
import { runQualifying } from '../engine/qualifying.ts';
import type { QualifyingResult } from '../engine/qualifying.ts';
import { RaceSim } from '../engine/race.ts';
import { Track } from '../engine/track.ts';
import type { StrategyPlan, TeamDef } from '../engine/types.ts';
import { currentRound, raceSeed } from '../state/season.ts';
import type { Career } from '../state/season.ts';
import { PlanEditor } from './PlanEditor.tsx';
import { Standings } from './Standings.tsx';
import { TeamLogo } from './TeamLogo.tsx';

export interface RaceSetup {
  trackId: string;
  laps: number;
  grid: string[];
  plans: Record<string, StrategyPlan>;
  seed: number;
}

interface Props {
  career: Career;
  teams: TeamDef[];
  onStart: (setup: RaceSetup) => void;
}

const LENGTHS = [
  { pct: 0.2, label: 'Sprint (20%)' },
  { pct: 0.35, label: 'Short (35%)' },
  { pct: 0.5, label: 'Half (50%)' },
  { pct: 1, label: 'Full distance' },
];

function TrackPreview({ trackId }: { trackId: string }) {
  const geo = useMemo(() => {
    const t = new Track(trackById(trackId));
    const pad = Math.max(t.bounds.maxX - t.bounds.minX, t.bounds.maxY - t.bounds.minY) * 0.06;
    const w = t.bounds.maxX - t.bounds.minX + pad * 2;
    const h = t.bounds.maxY - t.bounds.minY + pad * 2;
    return { t, vb: `${t.bounds.minX - pad} ${t.bounds.minY - pad} ${w} ${h}`, road: Math.max(w, h) * 0.022 };
  }, [trackId]);
  const sf = geo.t.pointAt(0);
  return (
    <svg viewBox={geo.vb} style={{ width: '100%', height: 230 }} role="img" aria-label="Circuit layout">
      <path d={geo.t.svgPath(3)} fill="none" stroke="#05070b" strokeWidth={geo.road * 1.5} strokeLinejoin="round" />
      <path d={geo.t.svgPath(3)} fill="none" stroke="#4a5470" strokeWidth={geo.road} strokeLinejoin="round" />
      <circle cx={sf.x} cy={sf.y} r={geo.road * 0.9} fill="#e10600" />
    </svg>
  );
}

export function WeekendHub({ career, teams, onStart }: Props) {
  const round = currentRound(career);
  const trackDef = trackById(career.calendar[round]);
  const fullLaps = fullRaceLaps(trackDef);
  const [pct, setPct] = useState(0.35);
  const laps = Math.max(8, Math.round(fullLaps * pct));
  const playerTeam = teams.find((t) => t.id === career.playerTeamId) ?? teams[0];
  const geom = useMemo(() => new Track(trackDef), [trackDef]);

  const [quali, setQuali] = useState<QualifyingResult | null>(null);
  const [plans, setPlans] = useState<Record<string, StrategyPlan>>({});

  const suggest = (i: 0 | 1): StrategyPlan => RaceSim.suggestPlan(trackDef, playerTeam, playerTeam.drivers[i], laps, null);

  // Reset the weekend whenever the round, race length or edited teams change.
  useEffect(() => {
    setQuali(null);
  }, [round, teams]);
  useEffect(() => {
    setPlans({ [`${playerTeam.id}:0`]: suggest(0), [`${playerTeam.id}:1`]: suggest(1) });
  }, [round, laps, playerTeam.id]);

  const byId = new Map<string, { team: TeamDef; name: string }>();
  for (const team of teams) team.drivers.forEach((d, i) => byId.set(`${team.id}:${i}`, { team, name: d.name }));

  const runQuali = () => setQuali(runQualifying(trackDef, teams, raceSeed(career, round) + 1));

  const start = () => {
    if (!quali) return;
    onStart({ trackId: trackDef.id, laps, grid: quali.grid, plans, seed: raceSeed(career, round) });
  };

  return (
    <div className="page stack">
      <div className="row wrap">
        <div style={{ flex: 1 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Round {round + 1} of {career.calendar.length}
          </div>
          <h2 style={{ fontSize: 26 }}>{trackDef.name}</h2>
          <div className="muted">{trackDef.location}</div>
        </div>
        <TeamLogo team={playerTeam} size={44} />
        <div>
          <b>{playerTeam.name}</b>
          <div className="muted" style={{ fontSize: 12 }}>Team principal</div>
        </div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="panel">
            <h3>Circuit</h3>
            <TrackPreview trackId={trackDef.id} />
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
            {quali && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Locked once qualifying has run.</div>}
          </div>

          <Standings results={career.results} teams={teams} playerTeamId={career.playerTeamId} />
        </div>

        <div className="stack">
          <div className="panel">
            <div className="row" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0, flex: 1 }}>Qualifying</h3>
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
                            <span className="swatch" style={{ background: info.team.colors.primary }} />
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
                  <span className="swatch" style={{ background: playerTeam.colors.primary }} />
                  <h3 style={{ margin: 0, flex: 1 }}>Strategy: {driver.name}</h3>
                  {quali && <span className="muted num">grid P{quali.grid.indexOf(id) + 1}</span>}
                </div>
                <PlanEditor
                  plan={plan}
                  totalLaps={laps}
                  rates={wearRatesFor(trackDef, playerTeam, driver)}
                  onChange={(p) => setPlans((prev) => ({ ...prev, [id]: p }))}
                  onSuggest={() => setPlans((prev) => ({ ...prev, [id]: suggest(i) }))}
                />
              </div>
            );
          })}

          <button className="btn primary" style={{ padding: '12px 16px', fontSize: 16 }} onClick={start} disabled={!quali}>
            {quali ? 'Go to the grid' : 'Run qualifying first'}
          </button>
        </div>
      </div>
    </div>
  );
}
