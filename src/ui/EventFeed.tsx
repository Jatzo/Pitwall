import type { RaceSim } from '../engine/race.ts';

interface Props {
  sim: RaceSim;
  tick: number;
  limit?: number;
}

export function EventFeed({ sim, limit = 40 }: Props) {
  const events = sim.events.slice(-limit).reverse();
  return (
    <div className="feed" aria-live="polite">
      {events.length === 0 && <div className="muted">Nothing to report yet.</div>}
      {events.map((e) => (
        <div key={e.id} className={`ev ${e.kind}`}>
          <span className="muted num">L{e.lap}</span>
          <span>{e.message}</span>
        </div>
      ))}
    </div>
  );
}
