import { useState } from 'react';
import { ordinal } from '../engine/format.ts';
import type { DriverDef, TeamDef } from '../engine/types.ts';
import { askingSalary, expiringSeats, freeAgents } from '../state/contracts.ts';
import type { SeatDecision } from '../state/contracts.ts';
import { salaryFor } from '../state/finance.ts';
import { teamStandings } from '../state/season.ts';
import type { Career } from '../state/season.ts';
import { Standings } from './Standings.tsx';
import { formatMoney } from './money.ts';

interface Props {
  career: Career;
  /** The grid as it raced this season. */
  teams: TeamDef[];
  onStart: (decisions: [SeatDecision | null, SeatDecision | null]) => void;
  onCalendar: () => void;
  onMenu: () => void;
}

const average = (d: DriverDef) => Math.round(Object.values(d.ratings).reduce((s, v) => s + v, 0) / Object.values(d.ratings).length);

export function SeasonEnd({ career, teams, onStart, onCalendar, onMenu }: Props) {
  const me = teams.find((t) => t.id === career.playerTeamId) ?? teams[0];
  const table = teamStandings(career.results, teams);
  const place = table.findIndex((t) => t.teamId === me.id) + 1;
  const points = table.find((t) => t.teamId === me.id)?.points ?? 0;
  const ending = expiringSeats(career);
  // Each ending contract starts on re-signing the same driver for one season.
  const [decisions, setDecisions] = useState<[SeatDecision | null, SeatDecision | null]>(() => [
    ending.includes(0) ? { kind: 'renew', seasons: 1 } : null,
    ending.includes(1) ? { kind: 'renew', seasons: 1 } : null,
  ]);
  const decide = (seat: 0 | 1, d: SeatDecision) => setDecisions((prev) => (seat === 0 ? [d, prev[1]] : [prev[0], d]));
  const agents = freeAgents(career);

  return (
    <div className="page stack">
      <div className="row wrap">
        <div style={{ flex: '1 1 16em' }}>
          <h2 className="page-title">Season {career.season} complete</h2>
          <div className="muted">
            {me.name} finished {ordinal(place)} of {table.length} in the teams' championship with {points} points. Balance{' '}
            {formatMoney(career.finance.balance)}.
          </div>
        </div>
        <button className="btn" onClick={onCalendar}>Season calendar</button>
        <button className="btn" onClick={onMenu}>Back to menu</button>
      </div>

      <div className="grid2 wide">
        <div className="stack">
          <div className="panel">
            <h3>Contracts</h3>
            <p className="muted small hq-note">
              Money, the car and its upgrades carry into next season, though every gain loses a quarter. The sponsor's deal ends, so sign a new one in
              Team HQ.
            </p>
            {([0, 1] as const).map((seat) => {
              const contract = career.drivers[seat];
              const driver = me.drivers[seat];
              if (!ending.includes(seat)) {
                const left = contract.seasonsLeft - 1;
                return (
                  <div key={seat} className="season-seat">
                    <b>{driver.name}</b>
                    <div className="muted small">
                      {formatMoney(contract.salary)} a race, signed for {left} more {left === 1 ? 'season' : 'seasons'}.
                    </div>
                  </div>
                );
              }
              const chosen = decisions[seat];
              const other = decisions[seat === 0 ? 1 : 0];
              const open = agents.filter((a) => !(other?.kind === 'sign' && other.driverId === a.id));
              const seasons = chosen?.seasons ?? 1;
              const asking = askingSalary(career, teams, seat);
              return (
                <fieldset key={seat} className="season-seat">
                  <legend>
                    <b>{driver.name}</b>'s contract has ended
                  </legend>
                  <label className="season-choice">
                    <input type="radio" name={`seat-${seat}`} checked={chosen?.kind === 'renew'} onChange={() => decide(seat, { kind: 'renew', seasons })} />
                    <span>
                      Re-sign {driver.name}
                      <span className="muted small">, asks {formatMoney(asking)} a race, was {formatMoney(contract.salary)}</span>
                    </span>
                  </label>
                  {open.map((a) => (
                    <label key={a.id} className="season-choice">
                      <input
                        type="radio"
                        name={`seat-${seat}`}
                        checked={chosen?.kind === 'sign' && chosen.driverId === a.id}
                        onChange={() => decide(seat, { kind: 'sign', driverId: a.id, seasons })}
                      />
                      <span>
                        Sign {a.name}
                        <span className="muted small">
                          , rating {average(a)}, pace {a.ratings.pace}, asks {formatMoney(salaryFor(a))} a race
                        </span>
                      </span>
                    </label>
                  ))}
                  <div className="row" style={{ marginTop: 8 }}>
                    <span className="muted small">Contract length</span>
                    <span className="btn-group">
                      {([1, 2] as const).map((n) => (
                        <button
                          key={n}
                          className={`btn small ${seasons === n ? 'active' : ''}`}
                          onClick={() => chosen && decide(seat, { ...chosen, seasons: n })}
                        >
                          {n} {n === 1 ? 'season' : 'seasons'}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="muted small" style={{ marginTop: 6 }}>
                    {driver.name} this season: rating {average(driver)}, pace {driver.ratings.pace}.
                  </div>
                </fieldset>
              );
            })}
            <button className="btn primary big" style={{ marginTop: 12 }} onClick={() => onStart(decisions)}>
              Start season {career.season + 1}
            </button>
          </div>
        </div>
        <Standings results={career.results} teams={teams} playerTeamId={career.playerTeamId} />
      </div>
    </div>
  );
}
