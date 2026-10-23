import { useMemo } from 'react';
import type { Track } from '../engine/track.ts';

interface Props {
  track: Track;
  /** Height in CSS pixels; the width follows the container. */
  height: number;
}

/** A circuit's shape with the start line marked, for the hub and the calendar. */
export function TrackOutline({ track, height }: Props) {
  const geo = useMemo(() => {
    const b = track.bounds;
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.06;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    return { d: track.svgPath(3), vb: `${b.minX - pad} ${b.minY - pad} ${w} ${h}`, road: Math.max(w, h) * 0.022, start: track.pointAt(0) };
  }, [track]);
  return (
    <svg viewBox={geo.vb} style={{ width: '100%', height }} role="img" aria-label={`Layout of ${track.def.name}`}>
      <path d={geo.d} fill="none" stroke="#05070b" strokeWidth={geo.road * 1.5} strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke="#4a5470" strokeWidth={geo.road} strokeLinejoin="round" />
      <circle cx={geo.start.x} cy={geo.start.y} r={geo.road * 0.9} fill="#e10600" />
    </svg>
  );
}
