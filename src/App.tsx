import { useEffect, useMemo, useState } from 'react';
import { trackById } from './data/tracks.ts';
import { carOverall } from './data/teams.ts';
import { scoreRace } from './engine/scoring.ts';
import type { ScoredRow } from './engine/scoring.ts';
import type { RaceConfig, RaceSim } from './engine/race.ts';
import type { TeamDef } from './engine/types.ts';
import { clearCareer, loadCareer, loadTeams, resetTeams, saveCareer, saveTeams } from './state/storage.ts';
import { effectiveTeams } from './state/effectiveTeams.ts';
import { settleRace } from './state/finance.ts';
import { isSeasonOver, newCareer, recordRace } from './state/season.ts';
import type { Career } from './state/season.ts';
import { Calendar } from './ui/Calendar.tsx';
import { RaceScreen } from './ui/RaceScreen.tsx';
import { ResultsScreen } from './ui/ResultsScreen.tsx';
import { Standings } from './ui/Standings.tsx';
import { TeamEditor } from './ui/TeamEditor.tsx';
import { TeamLogo } from './ui/TeamLogo.tsx';
import { WeekendHub } from './ui/WeekendHub.tsx';
import type { RaceSetup } from './ui/WeekendHub.tsx';
import { cssVar } from './ui/colour.ts';

type Screen =
  | { name: 'menu' }
  | { name: 'hub' }
  | { name: 'race'; config: RaceConfig; key: number }
  | { name: 'results'; rows: ScoredRow[]; trackId: string; laps: number }
  | { name: 'season' }
  | { name: 'calendar'; back: 'hub' | 'season' }
  | { name: 'teams' };

function Menu({
  teams,
  career,
  saveProblem,
  onNew,
  onContinue,
  onTeams,
}: {
  teams: TeamDef[];
  career: Career | null;
  /** Why the saved season could not be read, if it could not. */
  saveProblem: string | null;
  onNew: (teamId: string) => void;
  onContinue: () => void;
  onTeams: () => void;
}) {
  const [pick, setPick] = useState(teams[0].id);
  const savedTeam = career ? teams.find((t) => t.id === career.playerTeamId) : undefined;
  return (
    <div className="page stack">
      <div className="hero">
        <h1>PITWALL</h1>
        <p>
          Run a Formula-style team through a season. Set the strategy, then manage tyres, fuel and pit stops live from the
          pit wall while every car circulates the track. All teams, drivers and circuits are fictional.
        </p>
      </div>

      {saveProblem && (
        <div className="warnbox">
          Your saved season could not be read, because {saveProblem}. It is still stored, and starting a new season will replace it.
        </div>
      )}

      {career && savedTeam && (
        <div className="panel row wrap">
          <TeamLogo team={savedTeam} size={36} />
          <div style={{ flex: 1 }}>
            <b>Season in progress: {savedTeam.name}</b>
            <div className="muted">{career.results.length} of {career.calendar.length} rounds completed</div>
          </div>
          <button className="btn primary" onClick={onContinue}>Continue season</button>
        </div>
      )}

      <div className="row">
        <h2 className="section-title" style={{ flex: 1 }}>{career ? 'Or start a new season' : 'Choose your team'}</h2>
        <button className="btn" onClick={onTeams}>Edit teams, drivers and logos</button>
      </div>
      <div className="team-cards">
        {teams.map((t) => {
          const c = t.car;
          return (
            <button
              key={t.id}
              className={`team-card ${pick === t.id ? 'sel' : ''}`}
              style={cssVar('--team', t.colors.primary)}
              onClick={() => setPick(t.id)}
              aria-pressed={pick === t.id}
            >
              <TeamLogo team={t} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{t.name}</b>
                <div className="muted small">{t.drivers[0].name} · {t.drivers[1].name}</div>
                <div className="bars">
                  <span>Car</span>
                  <div className="bar"><i style={{ width: `${carOverall(c)}%` }} /></div>
                  <span>Pit crew</span>
                  <div className="bar"><i style={{ width: `${c.pitCrew}%` }} /></div>
                  <span>Reliability</span>
                  <div className="bar"><i style={{ width: `${c.reliability}%` }} /></div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div>
        <button
          className="btn primary"
          style={{ padding: '10px 18px' }}
          onClick={() => {
            if ((career || saveProblem) && !window.confirm('Starting a new season will replace your saved progress. Continue?')) return;
            onNew(pick);
          }}
        >
          Start new season
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [teams, setTeams] = useState<TeamDef[]>(() => loadTeams());
  const [saved] = useState(() => loadCareer(loadTeams()));
  const [career, setCareer] = useState<Career | null>(saved.status === 'ok' ? saved.career : null);
  const [saveProblem, setSaveProblem] = useState<string | null>(saved.status === 'unreadable' ? saved.reason : null);
  // A season moved up from an older save is written in the current format at once; the old copy stays as a backup.
  useEffect(() => {
    if (saved.status === 'ok') saveCareer(saved.career);
  }, [saved]);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  // The grid as it races, with the career laid over the editor's teams. It changes only when either does,
  // so a weekend already under way keeps its qualifying.
  const racing = useMemo(() => (career ? effectiveTeams(teams, career) : teams), [teams, career]);

  const updateTeams = (next: TeamDef[]) => {
    setTeams(next);
    saveTeams(next);
  };

  const startRace = (setup: RaceSetup) => {
    if (!career) return;
    const config: RaceConfig = {
      track: trackById(setup.trackId),
      teams: racing,
      grid: setup.grid,
      laps: setup.laps,
      seed: setup.seed,
      playerTeamId: career.playerTeamId,
      strategies: setup.plans,
      weather: setup.weather,
    };
    setScreen({ name: 'race', config, key: Date.now() });
  };

  const finishRace = (sim: RaceSim) => {
    if (!career) return;
    const rows = scoreRace(sim.results(), sim.fastestLap?.carId ?? null);
    const next = settleRace(recordRace(career, sim.totalLaps, rows, racing)).career;
    setCareer(next);
    saveCareer(next);
    setScreen({ name: 'results', rows, trackId: sim.track.def.id, laps: sim.totalLaps });
  };

  const goMenu = () => {
    if (screen.name === 'race' && !window.confirm('Leave the race? This race will not be saved.')) return;
    setScreen({ name: 'menu' });
  };

  let body;
  switch (screen.name) {
    case 'menu':
      body = (
        <Menu
          teams={teams}
          career={career}
          saveProblem={saveProblem}
          onNew={(teamId) => {
            clearCareer();
            setSaveProblem(null);
            const c = newCareer(teamId, teams);
            saveCareer(c);
            setCareer(c);
            setScreen({ name: 'hub' });
          }}
          onContinue={() => setScreen(career && isSeasonOver(career) ? { name: 'season' } : { name: 'hub' })}
          onTeams={() => setScreen({ name: 'teams' })}
        />
      );
      break;
    case 'hub':
      body = career ? (
        <WeekendHub career={career} teams={racing} onStart={startRace} onCalendar={() => setScreen({ name: 'calendar', back: 'hub' })} />
      ) : null;
      break;
    case 'race':
      body = <RaceScreen key={screen.key} config={screen.config} onFinish={finishRace} />;
      break;
    case 'results':
      body = career ? (
        <ResultsScreen
          career={career}
          teams={racing}
          rows={screen.rows}
          trackId={screen.trackId}
          laps={screen.laps}
          onContinue={() => setScreen(isSeasonOver(career) ? { name: 'season' } : { name: 'hub' })}
        />
      ) : null;
      break;
    case 'season':
      body = career ? (
        <div className="page stack">
          <h2 className="page-title">Season complete</h2>
          <Standings results={career.results} teams={racing} playerTeamId={career.playerTeamId} />
          <div className="row">
            <button className="btn primary" onClick={() => setScreen({ name: 'menu' })}>Back to menu</button>
            <button className="btn" onClick={() => setScreen({ name: 'calendar', back: 'season' })}>Season calendar</button>
          </div>
        </div>
      ) : null;
      break;
    case 'calendar': {
      const back = screen.back;
      body = career ? <Calendar career={career} teams={racing} onBack={() => setScreen(back === 'hub' ? { name: 'hub' } : { name: 'season' })} /> : null;
      break;
    }
    case 'teams':
      body = (
        <TeamEditor
          teams={teams}
          onChange={updateTeams}
          onReset={() => {
            if (window.confirm('Reset every team, driver, colour and logo to the defaults?')) setTeams(resetTeams());
          }}
          onClose={() => setScreen({ name: 'menu' })}
        />
      );
      break;
  }

  return (
    <div className={screen.name === 'race' ? 'app fixed' : 'app'}>
      <header className="topbar">
        <span className="brand">Pitwall</span>
        <span className="spacer" />
        {screen.name !== 'menu' && (
          <button className="btn small" onClick={goMenu}>
            Menu
          </button>
        )}
      </header>
      {body}
    </div>
  );
}
