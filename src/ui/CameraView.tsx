import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CarState, RaceSim } from '../engine/race.ts';
import { cameraWindow } from './director.ts';
import type { CameraWindow, Shot } from './director.ts';
import { carPose } from './markers.ts';
import { Ground, Marker, garageOrder, mapView } from './TrackMap.tsx';

interface Props {
  sim: RaceSim;
  shot: Shot | null;
  /** 0..1 fraction of the way through the current sim step, for smooth motion. */
  alpha: number;
  speed: number;
  /** Changes every frame so the cars move. */
  frame: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  following: boolean;
  onAuto: () => void;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(REDUCED).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED);
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * A close-up camera beside race control, pointed by the director. The ground
 * is the map's own static layer, drawn once and moved with a CSS transform;
 * only the cars redraw each frame.
 */
export function CameraView({ sim, shot, alpha, speed, selectedId, onSelect, following, onAuto }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState({ w: 320, h: 200 });
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setPx({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const reduced = useReducedMotion();
  const windowRef = useRef<CameraWindow | null>(null);

  const t = sim.track;
  const garages = garageOrder(sim);
  const view = mapView(t);
  const shotCars = (shot?.carIds ?? []).map((id) => sim.carById(id)).filter((c): c is CarState => c !== undefined);
  const anchor = shotCars[0] ?? sim.standings()[0];
  const first = carPose(sim, anchor, alpha, garages);
  let target = { x: first.x, y: first.y, s: anchor.dist };
  const partner = shotCars[1];
  if (partner) {
    // Frame a pair together when both fit; otherwise stay on the first car.
    const second = carPose(sim, partner, alpha, garages);
    if (Math.hypot(second.x - first.x, second.y - first.y) < 250) target = { ...target, x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }
  const win = cameraWindow(t, target, speed, reduced, windowRef.current, px.w / Math.max(1, px.h));
  windowRef.current = win;

  const scale = px.w / win.w;
  // Cars are drawn larger than life, at a size that reads in the close-up.
  const r = win.w * 0.022;
  const reach = r * 4;
  const visible = sim.cars
    .filter((c) => c.status !== 'out')
    .map((car) => ({ car, ...carPose(sim, car, alpha, garages) }))
    .filter((p) => p.x > win.x - reach && p.x < win.x + win.w + reach && p.y > win.y - reach && p.y < win.y + win.h + reach);
  const order = sim.standings();

  return (
    <div className="panel camera">
      <div className="camera-frame" ref={frameRef}>
        <div
          className="camera-world"
          aria-hidden="true"
          style={{ width: view.w * scale, height: view.h * scale, transform: `translate(${((view.x - win.x) * scale).toFixed(1)}px, ${((view.y - win.y) * scale).toFixed(1)}px)` }}
        >
          <Ground sim={sim} viewBox={view.box} />
        </div>
        <svg className="camera-cars" viewBox={`${win.x} ${win.y} ${win.w} ${win.h}`} preserveAspectRatio="none" aria-hidden="true">
          {visible.map(({ car, ...pose }) => (
            <Marker
              key={car.id}
              car={car}
              position={order.indexOf(car) + 1}
              pose={pose}
              r={r}
              selected={car.id === selectedId}
              spot={false}
              label={car.isPlayer || car.id === selectedId || (shot?.carIds.includes(car.id) ?? false)}
              onSelect={onSelect}
            />
          ))}
        </svg>
        <div className="camera-label">
          <span>{shot?.label ?? ''}</span>
          {following && (
            <button className="btn small" onClick={onAuto}>
              Auto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
