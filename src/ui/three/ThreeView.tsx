import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CarState, RaceSim } from '../../engine/race.ts';
import { cameraWindow } from '../director.ts';
import type { CameraWindow, Shot } from '../director.ts';
import { garageOrder } from '../TrackMap.tsx';
import { aerialCamera, carPose3, chaseCamera } from './geometry.ts';
import type { CameraPlace } from './geometry.ts';
import type { RaceScene } from './scene.ts';

interface Props {
  sim: RaceSim;
  shot: Shot | null;
  alpha: number;
  /** Changes every frame; each change draws one frame. */
  frame: number;
  speed: number;
  reducedMotion: boolean;
  width: number;
  height: number;
  /** Called when 3D cannot be shown: three.js failed to load, WebGL is missing, or the GPU dropped the context. */
  onFail: () => void;
}

/** The band on each tyre's sidewall, in the colours the timing tower uses for the compounds. */
const COMPOUND: Record<string, string> = { S: '#e8333a', M: '#f2c230', H: '#eeeeee', I: '#36b04a', W: '#2f7de1' };
/** Share of the gap to its target the camera closes each frame. */
const EASE = 0.12;

/** Draw times in ms, kept only when the page is opened with ?stats, for measuring the 3D view. */
const stats: { draws: number[]; gpu: string; memory: () => unknown } | null = new URLSearchParams(window.location.search).has('stats')
  ? { draws: [], gpu: '', memory: () => null }
  : null;
if (stats) (window as unknown as { __pitwall3d: typeof stats }).__pitwall3d = stats;

function ease(from: CameraPlace, to: CameraPlace): CameraPlace {
  const step = (a: number, b: number) => a + (b - a) * EASE;
  return {
    x: step(from.x, to.x),
    y: step(from.y, to.y),
    z: step(from.z, to.z),
    lookX: step(from.lookX, to.lookX),
    lookY: step(from.lookY, to.lookY),
    lookZ: step(from.lookZ, to.lookZ),
  };
}

/**
 * The 3D close-up. Up to 4x a chase camera sits low behind the director's car. From 8x, or when the player
 * has asked for reduced motion, it rises to an aerial shot of the same window the 2D close-up would show:
 * following at 8x, holding and cutting at 16x and 32x or with reduced motion, exactly as the 2D camera does.
 */
export function ThreeView({ sim, shot, alpha, frame, speed, reducedMotion, width, height, onFail }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const [scene, setScene] = useState<RaceScene | null>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const cameraRef = useRef<{ place: CameraPlace; target: string; aerial: boolean } | null>(null);
  const windowRef = useRef<CameraWindow | null>(null);

  // three.js loads only now, and the scene is built once per race.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    let made: RaceScene | null = null;
    const lost = (e: Event) => {
      e.preventDefault();
      if (alive) failRef.current();
    };
    canvas.addEventListener('webglcontextlost', lost);
    import('./scene.ts')
      .then(({ createScene }) => {
        if (!alive) return;
        made = createScene(
          canvas,
          sim.track,
          sim.cars.map((c) => ({ id: c.id, colour: c.team.colors.primary, accent: c.team.colors.secondary })),
        );
        if (stats) {
          stats.gpu = made.gpu;
          const held = made;
          stats.memory = () => held.memory();
        }
        setScene(made);
      })
      .catch(() => {
        if (alive) failRef.current();
      });
    return () => {
      alive = false;
      // Disposing loses the context on purpose, so stop listening first.
      canvas.removeEventListener('webglcontextlost', lost);
      made?.dispose();
    };
  }, [sim]);

  useLayoutEffect(() => {
    scene?.resize(Math.max(1, width), Math.max(1, height), window.devicePixelRatio || 1);
  }, [scene, width, height]);

  useLayoutEffect(() => {
    if (!scene) return;
    const garages = garageOrder(sim);
    const poses = sim.cars.map((c) => (c.status === 'out' ? null : carPose3(sim, c, alpha, garages)));
    const picked = (shot?.carIds ?? []).map((id) => sim.carById(id)).find((c): c is CarState => c !== undefined && c.status !== 'out');
    const target = picked ?? sim.standings()[0];
    const at = poses[sim.cars.indexOf(target)] ?? { x: 0, z: 0, heading: 0, rolled: 0 };

    const aerial = speed >= 8 || reducedMotion;
    let want: CameraPlace;
    let smooth: boolean;
    if (aerial) {
      const win = cameraWindow(sim.track, { x: at.x, y: at.z, s: target.dist }, speed, reducedMotion, windowRef.current, Math.max(1, width) / Math.max(1, height));
      windowRef.current = win;
      want = aerialCamera(win, Math.max(1, width) / Math.max(1, height));
      // A window that follows the car is eased; a held window is a cut.
      smooth = !win.fixed;
    } else {
      windowRef.current = null;
      want = chaseCamera(at);
      smooth = true;
    }
    const last = cameraRef.current;
    const place = smooth && last && last.target === target.id && last.aerial === aerial ? ease(last.place, want) : want;
    cameraRef.current = { place, target: target.id, aerial };

    const t0 = performance.now();
    scene.renderAt({ poses, tyres: sim.cars.map((c) => COMPOUND[c.tyre.compound] ?? '#dddddd'), camera: place, wetness: sim.wetness });
    if (stats) stats.draws.push(performance.now() - t0);

    // The followed car's driver code floats above it; nothing else is labelled in 3D.
    const tag = tagRef.current;
    if (tag) {
      const p = scene.project(at.x, at.z, aerial ? 14 : 1.6);
      tag.hidden = p === null || p.x < 0 || p.y < 0 || p.x > width || p.y > height;
      if (p) tag.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) translate(-50%, -100%)`;
      tag.textContent = target.driver.code;
      tag.style.borderColor = target.team.colors.primary;
    }
  }, [scene, sim, shot, alpha, frame, speed, reducedMotion, width, height]);

  return (
    <>
      <canvas ref={canvasRef} className="camera-3d" aria-hidden="true" />
      <span ref={tagRef} className="camera-3d-tag" aria-hidden="true" hidden />
    </>
  );
}
