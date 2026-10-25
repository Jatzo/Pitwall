import { memo } from 'react';
import type { RaceSim } from '../engine/race.ts';

interface Props {
  sim: RaceSim;
  /** Moves on with the race screen's 180 ms refresh. The panel is memoised, so this prop is what redraws it: keep it. */
  tick: number;
  limit?: number;
}

function EventFeedView({ sim, limit = 40 }: Props) {
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

/** Memoised: it redraws when `tick` moves on. */
export const EventFeed = memo(EventFeedView);
