import { useCallback, useEffect, useRef, useState } from 'react';
import { RaceSim } from '../engine/race.ts';
import type { RaceConfig } from '../engine/race.ts';
import type { RaceCommand } from '../engine/types.ts';
import { CarPanel } from './CarPanel.tsx';
import { EventFeed } from './EventFeed.tsx';
import { TimingTower } from './TimingTower.tsx';
import { TrackMap } from './TrackMap.tsx';

const STEP = 0.1; // simulation timestep in seconds
const SPEEDS = [1, 2, 4, 8, 16, 32];

interface Props {
  config: RaceConfig;
  onFinish: (sim: RaceSim) => void;
}

export function RaceScreen({ config, onFinish }: Props) {
  const [sim] = useState(() => new RaceSim(config));
  const [frame, setFrame] = useState(0);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [labels, setLabels] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => sim.cars.find((c) => c.isPlayer)?.id ?? null);

  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const alphaRef = useRef(0);
  const accRef = useRef(0);
  playingRef.current = playing;
  speedRef.current = speed;

  // Main loop: advance the sim in fixed steps, render every animation frame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastTick = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (playingRef.current && sim.phase === 'racing') {
        accRef.current += dt * speedRef.current;
        let n = 0;
        while (accRef.current >= STEP && n < 600 && sim.phase === 'racing') {
          sim.step(STEP);
          accRef.current -= STEP;
          n++;
        }
        if (n >= 600) accRef.current = 0;
      }
      alphaRef.current = Math.min(1, accRef.current / STEP);
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
      setTick((t) => t + 1);
    },
    [sim],
  );

  const lightsOut = () => {
    sim.start();
    setPlaying(true);
  };

  const finishNow = () => {
    // Fast-forward to the flag without rendering every step.
    let guard = 0;
    while (sim.phase === 'racing' && guard < 400_000) {
      sim.step(STEP);
      guard++;
    }
    setTick((t) => t + 1);
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
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
        <b>{sim.track.def.name}</b>
        <span className="muted">{sim.track.def.location}</span>
        {pill}
        <span className="num">Lap {done ? sim.totalLaps : lap} / {sim.totalLaps}</span>
        <span style={{ flex: 1 }} />
        {sim.phase === 'grid' ? (
          <button className="btn primary" onClick={lightsOut}>Lights out</button>
        ) : (
          <>
            <button className="btn" onClick={() => setPlaying((p) => !p)} disabled={done}>
              {playing ? 'Pause' : 'Resume'}
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
          <TrackMap sim={sim} selectedId={selectedId} onSelect={setSelectedId} alpha={alphaRef.current} showAllLabels={labels} frame={frame} />
        </div>
        <div className="panel" style={{ maxHeight: 190, overflow: 'auto' }}>
          <h3>Race control</h3>
          <EventFeed sim={sim} tick={tick} />
        </div>
      </div>

      <div className="col">{selected ? <CarPanel sim={sim} car={selected} tick={tick} dispatch={dispatch} /> : <div className="panel muted">Select a car on the map or in the timing tower.</div>}</div>
    </div>
  );
}
