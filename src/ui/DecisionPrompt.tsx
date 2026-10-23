import { useEffect, useRef } from 'react';
import { rejoinEstimate } from '../engine/insights.ts';
import type { RaceSim } from '../engine/race.ts';
import { TUNING } from '../engine/tuning.ts';
import { ALL_COMPOUNDS, COMPOUNDS } from '../engine/tyres.ts';
import type { RaceCommand } from '../engine/types.ts';
import { promptCars } from './moments.ts';
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

  const damaged = moment.carId ? sim.carById(moment.carId) : undefined;
  const title = moment.kind === 'safetycar' ? 'Safety car deployed' : `${damaged?.driver.code ?? 'Your car'} has damage`;
  const cars = promptCars(sim, moment);

  return (
    <div className="decision" role="alertdialog" aria-labelledby="decision-title" aria-describedby="decision-body">
      <h2 id="decision-title">{title}</h2>
      <p id="decision-body" className="muted">
        {moment.kind === 'safetycar'
          ? 'The field slows and bunches up behind the safety car, so a stop now costs far fewer places than under green flags. Rivals will be deciding too.'
          : 'A stop fixes the damage and costs the usual time in the pit lane.'}
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
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>Box for</span>
              {ALL_COMPOUNDS.map((c) => (
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
