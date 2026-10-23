import { formatGap, formatLap, formatRaceTime } from '../engine/format.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import type { TeamDef } from '../engine/types.ts';
import { trackById } from '../data/tracks.ts';
import type { Career } from '../state/season.ts';
import { isSeasonOver } from '../state/season.ts';
import { Standings } from './Standings.tsx';

interface Props {
  career: Career;
  teams: TeamDef[];
  rows: ScoredRow[];
  trackId: string;
  laps: number;
  onContinue: () => void;
}

export function ResultsScreen({ career, teams, rows, trackId, laps, onContinue }: Props) {
  const track = trackById(trackId);
  const byId = new Map<string, { team: TeamDef; name: string; code: string }>();
  for (const team of teams) {
    team.drivers.forEach((d, i) => byId.set(`${team.id}:${i}`, { team, name: d.name, code: d.code }));
  }
  const winner = rows[0] ? byId.get(rows[0].carId) : undefined;
  const over = isSeasonOver(career);

  return (
    <div className="page stack">
      <div className="row wrap">
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 24 }}>{track.name} results</h2>
          <div className="muted">
            Round {career.results.length} of {career.calendar.length} · {laps} laps{winner ? ` · won by ${winner.name} (${winner.team.shortName})` : ''}
          </div>
        </div>
        <button className="btn primary" onClick={onContinue}>
          {over ? 'See season summary' : 'Next race weekend'}
        </button>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' }}>
        <div className="panel">
          <h3>Classification</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>P</th>
                <th>Driver</th>
                <th className="r">Grid</th>
                <th className="r">Time / gap</th>
                <th className="r">Best</th>
                <th className="r">Stops</th>
                <th className="r">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const info = byId.get(r.carId);
                if (!info) return null;
                const mine = info.team.id === career.playerTeamId;
                let time = '';
                if (!r.finished) time = r.outReason ? `DNF (${r.outReason})` : 'DNF';
                else if (r.position === 1 && r.timeS !== null) time = formatRaceTime(r.timeS);
                else if (r.lapsDown > 0) time = `+${r.lapsDown} lap${r.lapsDown > 1 ? 's' : ''}`;
                else time = formatGap(r.gapS);
                return (
                  <tr key={r.carId} className={mine ? 'me' : ''}>
                    <td className="num">{r.finished ? r.position : '-'}</td>
                    <td>
                      <span className="team-chip">
                        <span className="swatch" style={{ background: info.team.colors.primary }} />
                        {info.name}
                        {r.penaltyS > 0 && <span className="bad num"> +{r.penaltyS}s</span>}
                      </span>
                    </td>
                    <td className="r num muted">{r.grid}</td>
                    <td className={`r num ${r.finished ? '' : 'bad'}`}>{time}</td>
                    <td className={`r num ${r.fastestLap ? 'purple' : ''}`}>{r.bestLap !== null ? formatLap(r.bestLap) : '--'}</td>
                    <td className="r num">{r.pitStops}</td>
                    <td className="r num"><b>{r.points || ''}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Purple marks the fastest lap (one extra point if the driver finishes in the top ten).</div>
        </div>
        <Standings results={career.results} teams={teams} playerTeamId={career.playerTeamId} />
      </div>
    </div>
  );
}
