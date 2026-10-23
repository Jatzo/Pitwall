import { useState } from 'react';
import { driverStandings, teamStandings } from '../state/season.ts';
import type { RaceRecord } from '../state/season.ts';
import type { TeamDef } from '../engine/types.ts';
import { TeamLogo } from './TeamLogo.tsx';

interface Props {
  results: readonly RaceRecord[];
  teams: readonly TeamDef[];
  playerTeamId: string;
}

export function Standings({ results, teams, playerTeamId }: Props) {
  const [tab, setTab] = useState<'drivers' | 'teams'>('drivers');
  const byTeam = new Map(teams.map((t) => [t.id, t]));
  const driverName = (carId: string) => {
    const [tid, idx] = carId.split(':');
    return byTeam.get(tid)?.drivers[Number(idx) as 0 | 1];
  };

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Championship</h3>
        <span className="btn-group">
          <button className={`btn small ${tab === 'drivers' ? 'active' : ''}`} onClick={() => setTab('drivers')}>Drivers</button>
          <button className={`btn small ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>Teams</button>
        </span>
      </div>
      {results.length === 0 && <div className="muted" style={{ marginBottom: 8 }}>No races yet. Everyone is on zero.</div>}
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>{tab === 'drivers' ? 'Driver' : 'Team'}</th>
            <th className="r">Wins</th>
            <th className="r">Pts</th>
          </tr>
        </thead>
        <tbody>
          {tab === 'drivers'
            ? driverStandings(results, teams).map((d, i) => {
                const team = byTeam.get(d.teamId);
                const drv = driverName(d.carId);
                if (!team || !drv) return null;
                return (
                  <tr key={d.carId} className={d.teamId === playerTeamId ? 'me' : ''}>
                    <td className="num muted">{i + 1}</td>
                    <td>
                      <span className="team-chip">
                        <span className="swatch" style={{ background: team.colors.primary }} />
                        {drv.name} <span className="muted">{team.shortName}</span>
                      </span>
                    </td>
                    <td className="r num">{d.wins}</td>
                    <td className="r num"><b>{d.points}</b></td>
                  </tr>
                );
              })
            : teamStandings(results, teams).map((t, i) => {
                const team = byTeam.get(t.teamId);
                if (!team) return null;
                return (
                  <tr key={t.teamId} className={t.teamId === playerTeamId ? 'me' : ''}>
                    <td className="num muted">{i + 1}</td>
                    <td>
                      <span className="team-chip">
                        <TeamLogo team={team} size={20} />
                        {team.name}
                      </span>
                    </td>
                    <td className="r num">{t.wins}</td>
                    <td className="r num"><b>{t.points}</b></td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
