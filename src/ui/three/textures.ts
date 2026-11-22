/**
 * Surface textures for the 3D view, painted on a canvas from a fixed seed, so nothing is downloaded and
 * every race (and any frame of a recording) gets the same pictures.
 */

import * as THREE from 'three';
import { Rng } from '../../engine/rng.ts';

type Paint = (g: CanvasRenderingContext2D, rng: Rng, size: number) => void;

function painted(size: number, seed: number, paint: Paint, repeat: 'both' | 'v' = 'both'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('No 2D canvas for textures');
  paint(g, new Rng(seed), size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeat === 'both' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Fine speckle in shades around a base colour. */
function grain(g: CanvasRenderingContext2D, rng: Rng, size: number, base: [number, number, number], spread: number, count: number, dot = 1.5): void {
  g.fillStyle = `rgb(${base.join(',')})`;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const d = rng.range(-spread, spread);
    g.fillStyle = `rgb(${base.map((c) => Math.round(Math.max(0, Math.min(255, c + d)))).join(',')})`;
    g.fillRect(rng.range(0, size), rng.range(0, size), rng.range(0.6, dot), rng.range(0.6, dot));
  }
}

/** Asphalt across the full 14 m road: grain, a darker rubbered line down the middle, white lines at both edges. */
export function asphalt(): THREE.CanvasTexture {
  return painted(
    512,
    11,
    (g, rng, s) => {
      grain(g, rng, s, [62, 65, 70], 16, 60000);
      const rubber = g.createLinearGradient(0, 0, s, 0);
      rubber.addColorStop(0.3, 'rgba(20,20,22,0)');
      rubber.addColorStop(0.5, 'rgba(20,20,22,0.35)');
      rubber.addColorStop(0.7, 'rgba(20,20,22,0)');
      g.fillStyle = rubber;
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#e9e9e4';
      g.fillRect(s * 0.012, 0, s * 0.018, s);
      g.fillRect(s * 0.97, 0, s * 0.018, s);
    },
    'v',
  );
}

/** Kerb: red then white along its length, with a little wear. */
export function kerb(): THREE.CanvasTexture {
  return painted(128, 12, (g, rng, s) => {
    g.fillStyle = '#c8202a';
    g.fillRect(0, 0, s, s / 2);
    g.fillStyle = '#eeeeea';
    g.fillRect(0, s / 2, s, s / 2);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(40,40,40,${rng.range(0.05, 0.2)})`;
      g.fillRect(rng.range(0, s), rng.range(0, s), 1.5, 1.5);
    }
  });
}

/** Grass with mown stripes, one repeat 40 m across. */
export function grass(base: [number, number, number]): THREE.CanvasTexture {
  return painted(512, 13, (g, rng, s) => {
    grain(g, rng, s, base, 14, 50000, 2);
    for (let i = 0; i < 8; i += 2) {
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.fillRect((i * s) / 8, 0, s / 8, s);
    }
  });
}

export function gravel(): THREE.CanvasTexture {
  return painted(256, 14, (g, rng, s) => grain(g, rng, s, [168, 150, 118], 30, 30000, 2.2));
}

/** Concrete for walls: grain, a darker strip at the foot, a painted band along the top. */
export function concrete(): THREE.CanvasTexture {
  return painted(256, 15, (g, rng, s) => {
    grain(g, rng, s, [176, 178, 180], 12, 12000);
    g.fillStyle = 'rgba(30,30,30,0.25)';
    g.fillRect(0, 0, s, s * 0.08);
    for (let x = 0; x < s; x += s / 4) {
      g.fillStyle = (x / (s / 4)) % 2 === 0 ? '#c8202a' : '#eeeeea';
      g.fillRect(x, s * 0.2, s / 4, s * 0.06);
    }
  });
}

/** Seated spectators: rows of colourful heads on dark seats. */
export function crowd(): THREE.CanvasTexture {
  const shirts = ['#d8d8d8', '#2b4f9e', '#c0392b', '#f1c40f', '#27ae60', '#e67e22', '#111111', '#8e44ad', '#ecf0f1'];
  return painted(256, 16, (g, rng, s) => {
    g.fillStyle = '#2a2e36';
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 16; row++) {
      g.fillStyle = '#1b1e24';
      g.fillRect(0, row * 16 + 12, s, 4);
      for (let col = 0; col < 32; col++) {
        if (rng.next() < 0.15) continue;
        g.fillStyle = shirts[Math.floor(rng.next() * shirts.length)];
        g.fillRect(col * 8 + 1, row * 16 + 5, 6, 7);
        g.fillStyle = rng.next() < 0.5 ? '#e0b48f' : '#7a4b2e';
        g.fillRect(col * 8 + 2, row * 16 + 1, 4, 4);
      }
    }
  });
}

/**
 * A building's face, one repeat 10 m across and 7 m up: two floors of four windows, framed, dark glass with
 * a little sky in it, and the odd lit room. The wall is white here and tinted per building.
 */
export function windows(wall: string): THREE.CanvasTexture {
  return painted(256, 17, (g, rng, s) => {
    grain(g, rng, s, [235, 235, 235], 10, 6000);
    g.fillStyle = wall;
    g.globalCompositeOperation = 'multiply';
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
    for (let floor = 0; floor < 2; floor++) {
      // A ledge between floors.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, floor * 128 + 120, s, 6);
      for (let w = 0; w < 4; w++) {
        const [x, y] = [w * 64 + 14, floor * 128 + 28];
        g.fillStyle = '#e9e6df';
        g.fillRect(x - 3, y - 3, 42, 76);
        const glass = g.createLinearGradient(0, y, 0, y + 70);
        const lit = rng.next() < 0.08;
        glass.addColorStop(0, lit ? '#f3dfa0' : '#6f8196');
        glass.addColorStop(1, lit ? '#d8b86a' : '#26313d');
        g.fillStyle = glass;
        g.fillRect(x, y, 36, 70);
        g.fillStyle = '#e9e6df';
        g.fillRect(x + 17, y, 2, 70);
      }
    }
  });
}

/** Catch fence: a fine diamond wire mesh, see-through between the wires. Sixteen diamonds per 4 m repeat. */
export function wireMesh(): THREE.CanvasTexture {
  return painted(256, 18, (g, _rng, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = 'rgba(60,64,70,0.85)';
    g.lineWidth = 1.6;
    for (let k = -s; k < s * 2; k += 16) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + s, s);
      g.moveTo(k + s, 0);
      g.lineTo(k, s);
      g.stroke();
    }
  });
}
