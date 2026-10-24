import { trackById } from '../data/tracks.ts';
import type { TeamDef } from '../engine/types.ts';
import { AREAS, AREA_NAMES, DEVELOPMENT, kindLabel, projectOptions } from '../state/development.ts';
import type { Area } from '../state/development.ts';
import { roundLines } from '../state/finance.ts';
import type { Career, ProjectKind, SponsorDeal } from '../state/season.ts';
import { describeObjective, sponsorOffers, sponsorRecord } from '../state/sponsors.ts';
import { formatAmount, formatMoney } from './money.ts';

interface Props {
  career: Career;
  /** The grid as it races, for the car's ratings and the sponsors' targets. */
  teams: TeamDef[];
  /** The editor's teams, which project prices are worked out from. */
  editorTeams: TeamDef[];
  onBuy: (area: Area, kind: ProjectKind) => void;
  onSign: (deal: SponsorDeal) => void;
  onBack: () => void;
}

export function TeamHQ({ career, teams, editorTeams, onBuy, onSign, onBack }: Props) {
  const me = teams.find((t) => t.id === career.playerTeamId) ?? teams[0];
  const { balance } = career.finance;
  const options = projectOptions(career, editorTeams);
  const running = career.development.projects;
  const fieldAvg = (a: Area) => teams.reduce((s, t) => s + t.car[a], 0) / teams.length;
  // The race a project arrives after, counted within the season it was bought in.
  const arrives = (deliverAt: number) => {
    const round = deliverAt - career.roundsBefore;
    return round <= career.calendar.length ? `after round ${round}` : 'next season';
  };
  const wholeBlock =
    balance < 0 ? 'The team is in debt, so no project can start until the balance is above zero.'
    : running.length >= DEVELOPMENT.maxProjects ? `${DEVELOPMENT.maxProjects} projects are already being built. A new one can start when one arrives.`
    : null;

  const deal = career.sponsor?.season === career.season ? career.sponsor : null;
  const record = sponsorRecord(career);
  const offers = deal ? [] : sponsorOffers(career, teams);
  const sponsorPaid = deal && record ? deal.base * record.races + deal.bonus * record.met : 0;

  // This season's money, newest round first; the next round holds anything bought before it.
  const rounds = [];
  for (let r = career.results.length; r >= 0; r--) {
    const lines = roundLines(career, career.season, r);
    if (lines.length === 0) continue;
    const trackId = career.calendar[r];
    const raced = r < career.results.length;
    rounds.push({ r, lines, title: raced ? `Round ${r + 1}: ${trackById(trackId).name}` : `Before round ${r + 1}` });
  }

  return (
    <div className="page stack">
      <div className="row wrap">
        <div style={{ flex: '1 1 16em' }}>
          <h2 className="page-title">Team HQ</h2>
          <div className="muted">
            {me.name} · season {career.season} · {career.results.length} of {career.calendar.length} rounds raced
          </div>
        </div>
        <div className="hq-balance">
          <b className={`num ${balance < 0 ? 'bad' : ''}`}>{formatMoney(balance)}</b>
          <span className="muted small">Balance</span>
        </div>
        <button className="btn primary" onClick={onBack}>Back to the weekend</button>
      </div>

      <div className="grid2 wide">
        <div className="stack">
          <div className="panel">
            <h3>Car development</h3>
            <p className="muted small hq-note">
              Up to {DEVELOPMENT.maxProjects} projects at a time, one per area. A gain counts from the race after it arrives. Every gain
              loses a quarter when a new season starts.
            </p>
            {wholeBlock && <div className="warnbox" style={{ marginBottom: 8 }}>{wholeBlock}</div>}
            <div className="scroll-x">
              <table className="tbl hq-dev">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th className="r">Car</th>
                    <th className="r">Field</th>
                    {DEVELOPMENT.kinds.map((k) => (
                      <th key={k.kind} className="r">
                        {k.label}
                        <span className="hq-sub">
                          {k.rounds} {k.rounds === 1 ? 'round' : 'rounds'}, +{k.gain}, {k.risk === 0 ? 'always works' : `${Math.round(k.risk * 100)}% gives half`}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((area) => {
                    const project = running.find((p) => p.area === area);
                    const own = options.filter((o) => o.area === area);
                    const avg = fieldAvg(area);
                    return (
                      <tr key={area}>
                        <td>{AREA_NAMES[area]}</td>
                        <td className={`r num ${me.car[area] > avg + 0.5 ? 'good' : me.car[area] < avg - 0.5 ? 'bad' : ''}`}>{me.car[area]}</td>
                        <td className="r num muted">{avg.toFixed(1)}</td>
                        {project ? (
                          <td className="r" colSpan={3}>
                            <span className="hq-building">
                              {kindLabel(project.kind)} being built, +{project.gain}, arrives {arrives(project.deliverAt)}
                            </span>
                          </td>
                        ) : me.car[area] >= DEVELOPMENT.cap ? (
                          <td className="r muted" colSpan={3}>At the limit of {DEVELOPMENT.cap}</td>
                        ) : (
                          own.map((o) => (
                            <td key={o.kind} className="r">
                              <button
                                className="btn small num"
                                disabled={!!o.blocked}
                                title={o.blocked ?? `Start ${o.label.toLowerCase()} on ${AREA_NAMES[area].toLowerCase()}`}
                                aria-label={`${o.label} on ${AREA_NAMES[area]}, ${formatMoney(o.cost)}${o.blocked ? `: ${o.blocked}` : ''}`}
                                onClick={() => onBuy(area, o.kind)}
                              >
                                {formatMoney(o.cost)}
                                {o.gain < DEVELOPMENT.kinds.find((k) => k.kind === o.kind)!.gain && ` (+${o.gain})`}
                              </button>
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {career.development.delivered.length > 0 && (
              <>
                <h4 className="hq-h4">Arrived</h4>
                <ul className="hq-list small">
                  {career.development.delivered.slice(0, 5).map((d, i) => (
                    <li key={i}>
                      <span className="muted">Season {d.season}, round {d.round + 1}:</span> {AREA_NAMES[d.area].toLowerCase()}{' '}
                      {kindLabel(d.kind).toLowerCase()}, <b className="num">+{d.gain}</b>
                      {!d.full && <span className="muted"> (a bad result gave half)</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="panel">
            <h3>Drivers</h3>
            <table className="tbl">
              <thead>
                <tr><th>Driver</th><th className="r">Salary a race</th><th className="r">Seasons left</th></tr>
              </thead>
              <tbody>
                {career.drivers.map((c) => (
                  <tr key={c.driverId}>
                    <td>{me.drivers.find((d) => d.id === c.driverId)?.name ?? c.driverId}</td>
                    <td className="r num">{formatMoney(c.salary)}</td>
                    <td className="r num">{c.seasonsLeft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <h3>Sponsor</h3>
            {deal ? (
              <div className="kv">
                <span className="muted">Sponsor</span><b>{deal.name}</b>
                <span className="muted">Objective</span><span>{describeObjective(deal.objective, teams)}</span>
                <span className="muted">Each race</span><span className="num">{formatMoney(deal.base)}</span>
                <span className="muted">Bonus when met</span><span className="num">+{formatMoney(deal.bonus)}</span>
                <span className="muted">Record</span>
                <span className="num">{record && record.races > 0 ? `met in ${record.met} of ${record.races}` : 'no races yet'}</span>
                <span className="muted">Paid this season</span><span className="num">{formatMoney(sponsorPaid)}</span>
              </div>
            ) : (
              <>
                <p className="muted small hq-note">
                  Sign one deal for the season. It pays its base every race, and its bonus in each race where the objective is met.
                </p>
                <div className="scroll-x">
                  <table className="tbl">
                    <thead>
                      <tr><th>Sponsor and objective</th><th className="r">Each race</th><th className="r">Bonus</th><th /></tr>
                    </thead>
                    <tbody>
                      {offers.map((o) => (
                        <tr key={o.tier}>
                          <td>
                            <b>{o.name}</b>
                            <div className="muted small">{describeObjective(o.objective, teams)}</div>
                          </td>
                          <td className="r num">{formatMoney(o.base)}</td>
                          <td className="r num">+{formatMoney(o.bonus)}</td>
                          <td className="r"><button className="btn small" onClick={() => onSign(o)}>Sign</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <h3>Money</h3>
            {rounds.length === 0 && <div className="muted small">Nothing booked yet this season.</div>}
            {rounds.map(({ r, lines, title }) => (
              <div key={r} className="hq-round">
                <h4 className="hq-h4">{title}</h4>
                <div className="kv">
                  {lines.map((l, i) => (
                    <LedgerLine key={i} label={l.label} amount={l.amount} />
                  ))}
                  <span className="strong">Total</span>
                  <b className={`num ${tone(lines.reduce((s, l) => s + l.amount, 0))}`}>{formatAmount(lines.reduce((s, l) => s + l.amount, 0))}</b>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const tone = (n: number) => (n > 0 ? 'good' : n < 0 ? 'bad' : '');

export function LedgerLine({ label, amount }: { label: string; amount: number }) {
  return (
    <>
      <span className="muted">{label}</span>
      <span className={`num ${tone(amount)}`}>{formatAmount(amount)}</span>
    </>
  );
}
