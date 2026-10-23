import { useEffect, useRef } from 'react';
import { rejoinEstimate } from '../engine/insights.ts';
import type { RaceSim } from '../engine/race.ts';
import { TUNING } from '../engine/tuning.ts';
import { COMPOUNDS, PIT_COMPOUNDS, bestClass, tyreClass } from '../engine/tyres.ts';
import type { RaceCommand } from '../engine/types.ts';
import { CLASS_NAMES, classCostLine } from './Conditions.tsx';
import { MIN_TYRE_AGE_FOR_SC_STOP, promptCars } from './moments.ts';
import type { Moment } from './moments.ts';

interface Props {
  sim: RaceSim;
  moment: Moment;
  dispatch: (cmd: RaceCommand) => void;
  onResume: () => void;
}

/** The pit call the race paused for: box now and on what, or stay out. */
export function DecisionPrompt({ sim, moment, dispatch, onResume }: Props) {
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => resumeRef.current?.focus(), []);

  const subject = moment.carId ? sim.carById(moment.carId) : undefined;
  const code = subject?.driver.code ?? 'Your car';
  const cars = promptCars(sim, moment);
  const advised = subject ? bestClass(sim.wetness, tyreClass(subject.tyre.compound)) : 'slick';
  const titles: Record<typeof moment.kind, string> = {
    safetycar: 'Safety car deployed',
    damage: `${code} has damage`,
    rain: 'Rain is falling',
    conditions: `${code}: ${CLASS_NAMES[advised].toLowerCase()} would be quicker now`,
  };
  const bodies: Record<typeof moment.kind, string> = {
    safetycar:
      'The field slows and bunches up behind the safety car, so a stop now costs far fewer places than under green flags. Rivals will be deciding too.',
    damage: 'A stop fixes the damage and costs the usual time in the pit lane.',
    rain: 'The track is getting wet. Slicks lose time from about 14% wetness, intermediates are quickest from there to about 55%, and full wets after that. Rivals react to the rain they can see; the forecast is yours.',
    conditions: `The racing line is ${Math.round(sim.wetness * 100)}% wet. ${classCostLine(sim.wetness)}.`,
  };
  const title = titles[moment.kind];

  return (
    <div className="decision" role="alertdialog" aria-labelledby="decision-title" aria-describedby="decision-body">
      <h2 id="decision-title">{title}</h2>
      <p id="decision-body" className="muted">
        {bodies[moment.kind]}
      </p>
      {cars.map((car) => {
        const position = sim.standings().indexOf(car) + 1;
        const next = car.plan.stops[0];
        const rejoin = rejoinEstimate(sim, car, TUNING.pitLossPlan);
        return (
          <div key={car.id} className="decision-car">
            <div className="row" style={{ gap: 8 }}>
              <b>{car.driver.code}</b>
              <span className="num">P{position}</span>
              <span className="tyre-dot" style={{ borderColor: COMPOUNDS[car.tyre.compound].color }}>{car.tyre.compound}</span>
              <span className="muted num">
                {Math.floor(car.tyre.ageLaps)} laps, {Math.round(car.tyre.wear * 100)}% worn
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {next ? `Plan: stop on lap ${next.lap} for ${COMPOUNDS[next.compound].name.toLowerCase()}s.` : 'Plan: no more stops.'}
              {moment.kind !== 'safetycar' && ` A stop now rejoins about P${rejoin}.`}
              {moment.kind === 'safetycar' &&
                car.tyre.ageLaps < MIN_TYRE_AGE_FOR_SC_STOP &&
                ' These tyres are barely used, so a stop gains little unless you want a different compound.'}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>Box for</span>
              {PIT_COMPOUNDS.map((c) => (
                <button
                  key={c}
                  className={`btn small ${car.pitRequest === c ? 'active' : ''}`}
                  aria-pressed={car.pitRequest === c}
                  onClick={() => dispatch({ type: 'pit', carId: car.id, compound: car.pitRequest === c ? null : c })}
                >
                  <span style={{ color: COMPOUNDS[c].color, fontWeight: 800 }}>{c}</span> {COMPOUNDS[c].name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button ref={resumeRef} className="btn primary" onClick={onResume}>
        {cars.some((c) => c.pitRequest) ? 'Resume race' : 'Stay out and resume'} <span style={{ opacity: 0.8, fontWeight: 400 }}>(Space)</span>
      </button>
    </div>
  );
}
