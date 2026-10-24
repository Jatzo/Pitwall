import type { Story } from './stories.ts';
import { inkFor } from './TrackMap.tsx';

interface Props {
  story: Story | null;
  onSelect: (carId: string) => void;
}

/**
 * The story strip under the map. Clicking it selects the story's car. It is a
 * pointer shortcut only: a story lives a few seconds, too briefly to reach by
 * keyboard, and the timing tower selects cars from the keyboard already.
 */
export function StoryBanner({ story, onSelect }: Props) {
  return (
    <div className="story-strip">
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
