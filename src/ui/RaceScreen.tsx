import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RaceSim } from '../engine/race.ts';
import type { RaceConfig } from '../engine/race.ts';
import type { RaceCommand } from '../engine/types.ts';
import { CameraView } from './CameraView.tsx';
import { CarPanel } from './CarPanel.tsx';
import { DecisionPrompt } from './DecisionPrompt.tsx';
import { direct } from './director.ts';
import type { Direction } from './director.ts';
import { weatherWord } from './Conditions.tsx';
import { EventFeed } from './EventFeed.tsx';
import { nextMoment, watchMoments } from './moments.ts';
import { boxCall, radioFor, watchRadio } from './radio.ts';
import type { Moment } from './moments.ts';
import { StoryBanner } from './StoryBanner.tsx';
import type { RaceGlance } from './StoryBanner.tsx';
import { formatLap } from '../engine/format.ts';
import { StoryQueue, holdFor, nextStories, watchStories } from './stories.ts';
import type { Story } from './stories.ts';
import { TimingTower } from './TimingTower.tsx';
import { TrackMap } from './TrackMap.tsx';

const STEP = 0.1; // simulation timestep in seconds
const SPEEDS = [1, 2, 4, 8, 16, 32];
const PAUSE_KEY = 'pitwall.pauseForMoments';
const STORIES_KEY = 'pitwall.stories';

/** A race-screen switch remembered between races; on unless turned off. */
function loadFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

function saveFlag(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, String(on));
  } catch {
    // Storage unavailable: the preference lasts for this race only.
  }
}

function glance(sim: RaceSim): RaceGlance {
  if (sim.phase === 'grid') return { leader: null, gapToSecond: null, fastest: null };
  const [first, second] = sim.standings();
  const gap = second ? sim.gapToAhead(second) : null;
  const fastest = sim.fastestLap ? sim.carById(sim.fastestLap.carId) : undefined;
  return {
    leader: first?.driver.code ?? null,
    gapToSecond: gap !== null ? `${gap.toFixed(1)} s` : null,
    fastest: fastest && sim.fastestLap ? `${fastest.driver.code} ${formatLap(sim.fastestLap.time)}` : null,
  };
}

interface Props {
  config: RaceConfig;
  onFinish: (sim: RaceSim) => void;
}

export function RaceScreen({ config, onFinish }: Props) {
  const [sim] = useState(() => new RaceSim(config));
  const [frame, setFrame] = useState(0);
  const [tick, setTick] = useState(0);
  // Worked out once per refresh, so the memoised story strip redraws only when it changes.
  const glanceNow = useMemo(() => glance(sim), [sim, tick]);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [labels, setLabels] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => sim.cars.find((c) => c.isPlayer)?.id ?? null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [pauseForMoments, setPauseForMoments] = useState(() => loadFlag(PAUSE_KEY));
  const [storiesOn, setStoriesOn] = useState(() => loadFlag(STORIES_KEY));
  const [followId, setFollowId] = useState<string | null>(null);

  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const pauseRef = useRef(pauseForMoments);
  const momentRef = useRef(moment);
  const watchRef = useRef(watchMoments(sim));
  const alphaRef = useRef(0);
  const accRef = useRef(0);
  const storiesOnRef = useRef(storiesOn);
  const storyWatchRef = useRef(watchStories(sim));
  const storyQueueRef = useRef(new StoryQueue());
  const radioRef = useRef(watchRadio(config.seed));
  // Real seconds of play: it stops while paused or while a decision is open, so stories never expire unseen.
  const storyClockRef = useRef(0);
  const storyRef = useRef<Story | null>(null);
  const followRef = useRef(followId);
  const directionRef = useRef<Direction | null>(null);
  followRef.current = followId;
  storiesOnRef.current = storiesOn;
  playingRef.current = playing && moment === null;
  speedRef.current = speed;
  pauseRef.current = pauseForMoments;
  momentRef.current = moment;

  // Main loop: advance the sim in fixed steps, render every animation frame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastTick = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (playingRef.current && sim.phase === 'racing') {
        storyClockRef.current += dt;
        accRef.current += dt * speedRef.current;
        let n = 0;
        while (accRef.current >= STEP && n < 600 && sim.phase === 'racing') {
          sim.step(STEP);
          accRef.current -= STEP;
          n++;
          const stories = nextStories(sim, storyWatchRef.current);
          const radio = radioFor(sim, radioRef.current, stories);
          if (storiesOnRef.current) storyQueueRef.current.push([...stories, ...radio], storyClockRef.current);
          // Stop on the exact step a key moment happens, rather than at the end of this frame's batch.
          const found = nextMoment(sim, watchRef.current);
          if (found && pauseRef.current) {
            playingRef.current = false;
            accRef.current = 0;
            setMoment(found);
            break;
          }
        }
        if (n >= 600) accRef.current = 0;
      }
      alphaRef.current = Math.min(1, accRef.current / STEP);
      storyRef.current = storiesOnRef.current ? storyQueueRef.current.current(storyClockRef.current, holdFor(speedRef.current)) : null;
      directionRef.current = direct(sim, directionRef.current, storyClockRef.current, storyRef.current, followRef.current);
      setFrame((f) => (f + 1) % 1_000_000);
      if (now - lastTick > 180) {
        lastTick = now;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  const dispatch = useCallback(
    (cmd: RaceCommand) => {
      sim.command(cmd);
      // The driver answers a stop the player asks for; the acknowledgement comes from the request, not from car state.
      if (cmd.type === 'pit' && cmd.compound) {
        const ack = boxCall(sim, radioRef.current, cmd.carId, cmd.compound);
        if (ack && storiesOnRef.current) storyQueueRef.current.push([ack], storyClockRef.current);
      }
      setTick((t) => t + 1);
    },
    [sim],
  );

  const lightsOut = () => {
    sim.start();
    setPlaying(true);
  };

  const resume = () => {
    setMoment(null);
    setPlaying(true);
  };

  const togglePause = (on: boolean) => {
    setPauseForMoments(on);
    saveFlag(PAUSE_KEY, on);
  };

  const toggleStories = (on: boolean) => {
    setStoriesOn(on);
    saveFlag(STORIES_KEY, on);
    if (!on) storyQueueRef.current = new StoryQueue();
  };

  const finishNow = () => {
    setMoment(null);
    // Fast-forward to the flag without rendering every step.
    let guard = 0;
    while (sim.phase === 'racing' && guard < 400_000) {
      sim.step(STEP);
      guard++;
    }
    watchRef.current = watchMoments(sim);
    storyWatchRef.current = watchStories(sim);
    storyQueueRef.current = new StoryQueue();
    storyRef.current = null;
    setTick((t) => t + 1);
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea')) return;
      if (e.code === 'Space') {
        // Space on a focused button or row activates that control instead.
        if (el?.closest('button, [role="button"]')) return;
        e.preventDefault();
        if (momentRef.current) {
          setMoment(null);
          setPlaying(true);
        } else {
          setPlaying((p) => !p);
        }
      } else if (e.key === '+' || e.key === '=') setSpeed((s) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)] ?? s);
      else if (e.key === '-') setSpeed((s) => SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)] ?? s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = selectedId ? sim.carById(selectedId) : undefined;
  const done = sim.phase === 'finished';
  const lead = sim.standings()[0];
  const lap = Math.min(sim.totalLaps, (lead?.lap ?? 0) + 1);

  let pill = <span className="status-pill grid">GRID</span>;
  if (done) pill = <span className="status-pill fin">FINISHED</span>;
  else if (sim.phase === 'racing') pill = sim.sc.active ? <span className="status-pill sc">SAFETY CAR</span> : <span className="status-pill">GREEN</span>;

  return (
    <div className="race">
      <div className="panel controls">
        <b className="track-name">{sim.track.def.name}</b>
        <span className="muted">{sim.track.def.location}</span>
        {pill}
        <span className="num">Lap {done ? sim.totalLaps : lap} / {sim.totalLaps}</span>
        {(sim.rain > 0 || sim.wetness > 0) && (
          <span className="status-pill rain">
            {weatherWord(sim.rain, sim.wetness).toUpperCase()} · {Math.round(sim.wetness * 100)}% WET
          </span>
        )}
        <span style={{ flex: 1 }} />
        {sim.phase === 'grid' ? (
          <button className="btn primary" onClick={lightsOut}>Lights out</button>
        ) : (
          <>
            <button className="btn" onClick={() => (moment || !playing ? resume() : setPlaying(false))} disabled={done}>
              {playing && !moment ? 'Pause' : 'Resume'}
            </button>
            <span className="btn-group" role="group" aria-label="Simulation speed">
              {SPEEDS.map((s) => (
                <button key={s} className={`btn small ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)} disabled={done}>
                  {s}x
                </button>
              ))}
            </span>
            <button className="btn" onClick={finishNow} disabled={done}>Skip to finish</button>
          </>
        )}
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={pauseForMoments} onChange={(e) => togglePause(e.target.checked)} />
          <span className="muted">Pause for key moments</span>
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={storiesOn} onChange={(e) => toggleStories(e.target.checked)} />
          <span className="muted">Stories</span>
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
          <span className="muted">All labels</span>
        </label>
        {done && (
          <button className="btn primary" onClick={() => onFinish(sim)}>
            Results
          </button>
        )}
      </div>

      <div className="col">
        <div className="panel" style={{ padding: 8 }}>
          <TimingTower sim={sim} selectedId={selectedId} onSelect={setSelectedId} tick={tick} />
        </div>
      </div>

      <div className="center">
        <div className="panel trackbox">
          <TrackMap
            sim={sim}
            selectedId={selectedId}
            onSelect={setSelectedId}
            alpha={alphaRef.current}
            showAllLabels={labels}
            frame={frame}
            spotlight={storyRef.current?.carIds}
          />
          {moment && <DecisionPrompt sim={sim} moment={moment} dispatch={dispatch} onResume={resume} />}
        </div>
        {storiesOn && <StoryBanner story={storyRef.current} glance={glanceNow} onSelect={setSelectedId} />}
        <div className="race-lower">
          <div className="panel race-control">
            <h3>Race control</h3>
            <EventFeed sim={sim} tick={tick} />
          </div>
          <CameraView
            sim={sim}
            shot={directionRef.current?.shot ?? null}
            alpha={alphaRef.current}
            speed={speed}
            frame={frame}
            selectedId={selectedId}
            onSelect={setSelectedId}
            following={directionRef.current?.shot.kind === 'follow'}
            onAuto={() => setFollowId(null)}
          />
        </div>
      </div>

      <div className="col">{selected ? <CarPanel sim={sim} car={selected} tick={tick} dispatch={dispatch} following={followId === selected.id} onFollow={setFollowId} /> : <div className="panel muted">Select a car on the map or in the timing tower.</div>}</div>
    </div>
  );
}
