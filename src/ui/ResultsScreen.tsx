import { formatGap, formatLap, formatRaceTime } from '../engine/format.ts';
import type { ScoredRow } from '../engine/scoring.ts';
import type { TeamDef } from '../engine/types.ts';
import { trackById } from '../data/tracks.ts';
import type { Career } from '../state/season.ts';
import { isSeasonOver } from '../state/season.ts';
import { AREA_NAMES, kindLabel } from '../state/development.ts';
import { roundLines } from '../state/finance.ts';
import { describeObjective, objectiveMet } from '../state/sponsors.ts';
import { formatAmount, formatMoney } from './money.ts';
import { LedgerLine } from './TeamHQ.tsx';
import { RaceChartsPanel } from './RaceChartsPanel.tsx';
import type { RaceCharts } from './raceCharts.ts';
import { Standings } from './Standings.tsx';
import { cssVar } from './colour.ts';

interface Props {
  career: Career;
  teams: TeamDef[];
  rows: ScoredRow[];
  trackId: string;
  laps: number;
  charts: RaceCharts;
  onContinue: () => void;
  /** Missing when the race could not be kept for a replay. */
  onReplay?: () => void;
}

export function ResultsScreen({ career, teams, rows, trackId, laps, charts, onContinue, onReplay }: Props) {
  const track = trackById(trackId);
  const byId = new Map<string, { team: TeamDef; name: string; code: string }>();
  for (const team of teams) {
    team.drivers.forEach((d, i) => byId.set(`${team.id}:${i}`, { team, name: d.name, code: d.code }));
  }
  const winner = rows[0] ? byId.get(rows[0].carId) : undefined;
  const over = isSeasonOver(career);
  const round = career.results.length - 1;
  const lines = roundLines(career, career.season, round);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const deal = career.sponsor?.season === career.season && career.sponsor.fromRound <= round ? career.sponsor : null;
  const met = deal ? objectiveMet(deal.objective, career.results[round].rows, career.playerTeamId) : false;
  const arrived = career.development.delivered.filter((d) => d.season === career.season && d.round === round);

  return (
    <div className="page stack">
      <div className="row wrap">
        <div style={{ flex: 1 }}>
          <h2 className="page-title">{track.name} results</h2>
          <div className="muted">
            Round {career.results.length} of {career.calendar.length} · {laps} laps{winner ? ` · won by ${winner.name} (${winner.team.shortName})` : ''}
          </div>
        </div>
        {onReplay && <button className="btn" onClick={onReplay}>Watch replay</button>}
        <button className="btn primary" onClick={onContinue}>
          {over ? 'See season summary' : 'Next race weekend'}
        </button>
      </div>

      <div className="grid2 wide">
        <div className="panel">
          <h3>Classification</h3>
          <div className="scroll-x">
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
                          <span className="swatch" style={cssVar('--team', info.team.colors.primary)} />
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
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>Purple marks the fastest lap (one extra point if the driver finishes in the top ten).</div>
        </div>
        <div className="stack">
          <div className="panel">
            <h3>Team money</h3>
            <div className="kv">
              {lines.map((l, i) => (
                <LedgerLine key={i} label={l.label} amount={l.amount} />
              ))}
              <span className="strong">This round</span>
              <b className={`num ${total > 0 ? 'good' : total < 0 ? 'bad' : ''}`}>{formatAmount(total)}</b>
              <span className="strong">Balance</span>
              <b className={`num ${career.finance.balance < 0 ? 'bad' : ''}`}>{formatMoney(career.finance.balance)}</b>
            </div>
            {deal && (
              <div className="kv" style={{ marginTop: 10 }}>
                <span className="muted">{deal.name}: {describeObjective(deal.objective, teams)}</span>
                <b className={met ? 'good' : 'muted'}>{met ? 'Met' : 'Missed'}</b>
              </div>
            )}
            {arrived.map((d, i) => (
              <div key={i} className="small" style={{ marginTop: 6 }}>
                Arrived for the next race: {AREA_NAMES[d.area].toLowerCase()}{' '}
                {kindLabel(d.kind).toLowerCase()}, <b className="num">+{d.gain}</b>
                {!d.full && <span className="muted"> (a bad result gave half)</span>}
              </div>
            ))}
          </div>
          <Standings results={career.results} teams={teams} playerTeamId={career.playerTeamId} />
        </div>
      </div>
      <RaceChartsPanel charts={charts} />
    </div>
  );
}
