import type { Story } from './stories.ts';
import { inkFor } from './colour.ts';

/** What the strip shows between stories: the state of the race at a glance. */
export interface RaceGlance {
  leader: string | null;
  gapToSecond: string | null;
  fastest: string | null;
}

interface Props {
  story: Story | null;
  glance: RaceGlance;
  onSelect: (carId: string) => void;
}

/**
 * The story strip under the map. Clicking it selects the story's car. It is a
 * pointer shortcut only: a story lives a few seconds, too briefly to reach by
 * keyboard, and the timing tower selects cars from the keyboard already.
 */
export function StoryBanner({ story, glance, onSelect }: Props) {
  return (
    <div className="story-strip">
      {!story && (
        // The timing tower already carries these numbers for screen readers.
        <div className="story-idle" aria-hidden="true">
          {glance.leader && (
            <span>
              Leader <b>{glance.leader}</b>
            </span>
          )}
          {glance.gapToSecond && (
            <span>
              Gap to P2 <b className="num">{glance.gapToSecond}</b>
            </span>
          )}
          {glance.fastest && (
            <span>
              Fastest lap <b>{glance.fastest}</b>
            </span>
          )}
        </div>
      )}
      {story && (
        <div key={`${story.kind}:${story.headline}`} className="story" aria-hidden="true" onClick={() => onSelect(story.carIds[0])} title="Select this car">
          <div className="story-team" style={{ background: story.colour, color: inkFor(story.colour) }}>
            {story.team}
          </div>
          <div className="story-body">
            <div className="story-head">{story.headline}</div>
            <div className="story-detail">{story.detail}</div>
          </div>
          <div className="story-label">{story.label}</div>
        </div>
      )}
      {/* Race control already reads out overtakes, fastest laps and retirements. */}
      <div role="status" className="sr-only">
        {story?.announce ? `${story.headline}. ${story.detail}` : ''}
      </div>
    </div>
  );
}
