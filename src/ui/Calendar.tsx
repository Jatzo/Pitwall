import { useMemo } from 'react';
import { fullRaceLaps, trackById } from '../data/tracks.ts';
import { ordinal } from '../engine/format.ts';
import { Track } from '../engine/track.ts';
import type { TrackDef } from '../engine/track.ts';
import type { TeamDef } from '../engine/types.ts';
import { currentRound, roundSummary } from '../state/season.ts';
import type { Career } from '../state/season.ts';
import { TrackOutline } from './TrackOutline.tsx';

interface Props {
  career: Career;
  teams: TeamDef[];
  onBack: () => void;
  /** Finished rounds that can be watched again. */
  replays: number[];
  onReplay: (round: number) => void;
}

/** Wear per kilometre against a 5.3 km reference, because wear is set per lap and laps differ in length. */
function tyreWord(def: TrackDef): string {
  const perKm = (def.tyreSeverity * 5300) / def.lengthM;
  if (perKm < 0.9) return 'Low';
  if (perKm <= 1.1) return 'Medium';
  return 'High';
}

function passingWord(def: TrackDef): string {
  if (def.overtakingDifficulty < 0.9) return 'Easy';
  if (def.overtakingDifficulty < 1.25) return 'Medium';
  return 'Hard';
}


/** The season's rounds in order, with what each circuit asks of a team and how finished rounds went. */
export function Calendar({ career, teams, onBack, replays, onReplay }: Props) {
  const tracks = useMemo(() => career.calendar.map((id) => new Track(trackById(id))), [career.calendar]);
  const next = currentRound(career);
  const driverName = (driverId: string): string => {
    const team = teams.find((t) => t.drivers.some((d) => d.id === driverId));
    const driver = team?.drivers.find((d) => d.id === driverId);
    return team && driver ? `${driver.name} (${team.shortName})` : driverId;
  };

  return (
    <div className="page stack">
      <div className="row wrap">
        <h2 className="page-title" style={{ flex: 1 }}>Season calendar</h2>
        <button className="btn" onClick={onBack}>Back</button>
      </div>
      <ol className="calendar">
        {tracks.map((track, round) => {
          const def = track.def;
          const race = career.results[round];
          const summary = race ? roundSummary(race, career.playerTeamId) : null;
          return (
            <li key={def.id} className={`panel calendar-round ${round === next ? 'next' : ''} ${race ? 'done' : ''}`} aria-current={round === next ? 'step' : undefined}>
              <div className="calendar-map">
                <TrackOutline track={track} height={110} />
              </div>
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <div className="muted label-caps">
                  Round {round + 1}
                  {round === next && ' · next'}
                </div>
                <b className="round-name">{def.name}</b>
                <div className="muted note">{def.location}</div>
                {def.summary && <div className="note">{def.summary}</div>}
                <div className="calendar-facts">
                  <span><b className="num">{(track.length / 1000).toFixed(2)}</b> km</span>
                  <span><b className="num">{track.refAvgKph.toFixed(0)}</b> km/h average</span>
                  <span><b className="num">{fullRaceLaps(def)}</b> laps at full distance</span>
                  <span>Tyre wear <b>{tyreWord(def)}</b></span>
                  <span>Passing <b>{passingWord(def)}</b></span>
                </div>
                {summary && (
                  <div className="note">
                    Won by {summary.winnerDriverId ? driverName(summary.winnerDriverId) : 'nobody'}.{' '}
                    {summary.playerBest !== null ? `Your best: ${ordinal(summary.playerBest)}, ${summary.playerPoints} points.` : 'Both your cars retired.'}
                  </div>
                )}
                {race && replays.includes(round) && (
                  <div>
                    <button className="btn small" onClick={() => onReplay(round)}>Watch replay</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
