import { useEffect, useMemo, useState } from 'react';
import { trackById } from './data/tracks.ts';
import { carOverall } from './data/teams.ts';
import { scoreRace } from './engine/scoring.ts';
import type { ScoredRow } from './engine/scoring.ts';
import type { RaceConfig, RaceSim } from './engine/race.ts';
import type { CommandLog } from './engine/replay.ts';
import type { Difficulty, TeamDef } from './engine/types.ts';
import { clearCareer, loadCareer, loadTeams, resetTeams, saveCareer, saveTeams } from './state/storage.ts';
import { checkReplay, clearReplays, loadReplay, replayConfig, replayRecord, replayRounds, saveReplay } from './state/replays.ts';
import { deliverProjects, startProject } from './state/development.ts';
import { effectiveTeams } from './state/effectiveTeams.ts';
import { settleRace } from './state/finance.ts';
import { startNextSeason } from './state/contracts.ts';
import { chooseSponsor } from './state/sponsors.ts';
import { isSeasonOver, newCareer, recordRace } from './state/season.ts';
import type { Career } from './state/season.ts';
import { Calendar } from './ui/Calendar.tsx';
import { RaceScreen } from './ui/RaceScreen.tsx';
import { ResultsScreen } from './ui/ResultsScreen.tsx';
import { raceCharts } from './ui/raceCharts.ts';
import type { RaceCharts } from './ui/raceCharts.ts';
import { SeasonEnd } from './ui/SeasonEnd.tsx';
import { TeamEditor } from './ui/TeamEditor.tsx';
import { TeamHQ } from './ui/TeamHQ.tsx';
import { TeamLogo } from './ui/TeamLogo.tsx';
import { WeekendHub } from './ui/WeekendHub.tsx';
import type { RaceSetup } from './ui/WeekendHub.tsx';
import { cssVar } from './ui/colour.ts';
import { DIFFICULTY_LEVELS, difficultyName } from './ui/difficulty.ts';
import jatzoMark from './assets/jatzo-mark.png';

type Screen =
  | { name: 'menu' }
  | { name: 'hub' }
  | { name: 'race'; config: RaceConfig; key: number }
  | { name: 'results'; rows: ScoredRow[]; trackId: string; laps: number; charts: RaceCharts; round: number; replayKept: boolean }
  | { name: 'replay'; config: RaceConfig; commands: CommandLog; key: number; back: Screen }
  | { name: 'season' }
  | { name: 'calendar'; back: 'hub' | 'season' }
  | { name: 'teams' }
  | { name: 'hq' };

interface MenuProps {
  teams: TeamDef[];
  career: Career | null;
  /** Why the saved season could not be read, if it could not. */
  saveProblem: string | null;
  onNew: (teamId: string, difficulty: Difficulty) => void;
  onContinue: () => void;
  onTeams: () => void;
}

function Menu({ teams, career, saveProblem, onNew, onContinue, onTeams }: MenuProps) {
  const [pick, setPick] = useState(teams[0].id);
  const [level, setLevel] = useState<Difficulty>('medium');
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
            <div className="muted">
              {career.results.length} of {career.calendar.length} rounds completed · {difficultyName(career.difficulty)}
            </div>
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
      <div className="stack" style={{ gap: 6 }}>
        <div className="row wrap">
          <span className="muted">Difficulty</span>
          <span className="btn-group" role="group" aria-label="Difficulty">
            {DIFFICULTY_LEVELS.map((l) => (
              <button key={l.id} className={`btn small ${level === l.id ? 'active' : ''}`} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
                {l.name}
              </button>
            ))}
          </span>
        </div>
        <div className="muted small">Sets how quick the rival teams are and how well they call their pit stops. Your own cars are the same on every level, and the choice is fixed for the career.</div>
      </div>
      <div>
        <button
          className="btn primary"
          style={{ padding: '10px 18px' }}
          onClick={() => {
            if ((career || saveProblem) && !window.confirm('Starting a new season will replace your saved progress. Continue?')) return;
            onNew(pick, level);
          }}
        >
          Start new season
        </button>
      </div>
      <footer className="made-by">
        <a href="https://jatzo.co.uk" target="_blank" rel="noopener noreferrer">
          Made by <img src={jatzoMark} alt="" width={20} height={20} /> Jatzo
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </footer>
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
  // Seats in the player's team that a signed free agent holds, which the editor shows but does not edit.
  const heldBy: Record<string, string> = {};
  if (career) {
    const mine = racing.find((t) => t.id === career.playerTeamId);
    const own = teams.find((t) => t.id === career.playerTeamId);
    mine?.drivers.forEach((d, seat) => {
      if (own && d.id !== own.drivers[seat].id) heldBy[`${career.playerTeamId}:${seat}`] = d.name;
    });
  }

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
      difficulty: career.difficulty,
    };
    setScreen({ name: 'race', config, key: Date.now() });
  };

  // Every change to the career is saved at once: a finished race and every decision in Team HQ.
  const commit = (next: Career) => {
    setCareer(next);
    saveCareer(next);
  };

  const finishRace = (sim: RaceSim) => {
    if (!career || screen.name !== 'race') return;
    const round = career.results.length;
    const rows = scoreRace(sim.results(), sim.fastestLap?.carId ?? null);
    const next = deliverProjects(settleRace(recordRace(career, sim.totalLaps, rows, racing)).career).career;
    // The career is written first, so a full store loses the replay and never the season.
    commit(next);
    const replayKept = saveReplay(next, replayRecord(screen.config, sim, round));
    setScreen({ name: 'results', rows, trackId: sim.track.def.id, laps: sim.totalLaps, charts: raceCharts(sim, career.playerTeamId), round, replayKept });
  };

  const watchReplay = (round: number, back: Screen) => {
    if (!career) return;
    const record = loadReplay(career, round);
    if (!record) return;
    const config = replayConfig(record, teams);
    if (!checkReplay(config, record)) {
      window.alert('This replay no longer matches the current version of the game, so it cannot be shown.');
      return;
    }
    setScreen({ name: 'replay', config, commands: record.commands, key: Date.now(), back });
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
          onNew={(teamId, difficulty) => {
            clearCareer();
            setSaveProblem(null);
            const c = newCareer(teamId, teams, undefined, difficulty);
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
        <WeekendHub
          career={career}
          teams={racing}
          onStart={startRace}
          onCalendar={() => setScreen({ name: 'calendar', back: 'hub' })}
          onHQ={() => setScreen({ name: 'hq' })}
        />
      ) : null;
      break;
    case 'race':
      body = <RaceScreen key={screen.key} config={screen.config} onFinish={finishRace} />;
      break;
    case 'replay': {
      const back = screen.back;
      body = <RaceScreen key={screen.key} config={screen.config} onFinish={() => setScreen(back)} replay={{ commands: screen.commands, onExit: () => setScreen(back) }} />;
      break;
    }
    case 'results':
      body = career ? (
        <ResultsScreen
          career={career}
          teams={racing}
          rows={screen.rows}
          charts={screen.charts}
          trackId={screen.trackId}
          laps={screen.laps}
          onContinue={() => setScreen(isSeasonOver(career) ? { name: 'season' } : { name: 'hub' })}
          onReplay={screen.replayKept ? () => watchReplay(screen.round, screen) : undefined}
        />
      ) : null;
      break;
    case 'season':
      body = career ? (
        <SeasonEnd
          career={career}
          teams={racing}
          onStart={(decisions) => {
            clearReplays();
            commit(startNextSeason(career, racing, decisions));
            setScreen({ name: 'hub' });
          }}
          onCalendar={() => setScreen({ name: 'calendar', back: 'season' })}
          onMenu={() => setScreen({ name: 'menu' })}
        />
      ) : null;
      break;
    case 'calendar': {
      const back = screen.back;
      body = career ? (
        <Calendar
          career={career}
          teams={racing}
          onBack={() => setScreen(back === 'hub' ? { name: 'hub' } : { name: 'season' })}
          replays={replayRounds(career)}
          onReplay={(round) => watchReplay(round, screen)}
        />
      ) : null;
      break;
    }
    case 'hq':
      body = career ? (
        <TeamHQ
          career={career}
          teams={racing}
          editorTeams={teams}
          onBuy={(area, kind) => commit(startProject(career, teams, area, kind))}
          onSign={(deal) => commit(chooseSponsor(career, deal))}
          onBack={() => setScreen({ name: 'hub' })}
        />
      ) : null;
      break;
    case 'teams':
      body = (
        <TeamEditor
          teams={teams}
          heldBy={heldBy}
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
    <div className={screen.name === 'race' || screen.name === 'replay' ? 'app fixed' : 'app'}>
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
