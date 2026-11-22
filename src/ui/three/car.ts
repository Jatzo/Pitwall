/**
 * The race car, an original open-wheel single-seater built from simple parts in real metres: a body lofted
 * through cross-sections, sidepods, a floor, front and rear wings with endplates, suspension arms, a helmet
 * and four wheels. It is modelled on no real car. Forward is +x, up is +y, and the tyres touch y = 0.
 *
 * Parts are grouped by what they are painted with, so each group is one instanced draw for the whole grid:
 * bodywork in the team's main colour, accents in its second colour, bare carbon, and the wheels apart so
 * they can turn.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One cross-section of a lofted part: where along the car, half its width, and its bottom and top. */
interface Section {
  x: number;
  half: number;
  bottom: number;
  top: number;
}

const RING = 20;

/** A smooth body through rounded-rectangle sections, closed at both ends. */
function loft(sections: readonly Section[], offsetZ = 0): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  sections.forEach((s, si) => {
    const cy = (s.bottom + s.top) / 2;
    const hy = (s.top - s.bottom) / 2;
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * Math.PI * 2;
      // A superellipse: flat-sided like a racing car's tub, with rounded corners.
      const c = Math.cos(a);
      const n = Math.sin(a);
      const z = Math.sign(c) * Math.abs(c) ** 0.6 * s.half;
      const y = Math.sign(n) * Math.abs(n) ** 0.6 * hy;
      positions.push(s.x, cy + y, z + offsetZ);
      uvs.push(k / RING, si / (sections.length - 1));
    }
  });
  for (let si = 0; si + 1 < sections.length; si++) {
    for (let k = 0; k < RING; k++) {
      const a = si * RING + k;
      const b = si * RING + ((k + 1) % RING);
      const c = a + RING;
      const d = b + RING;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Caps at the nose and the tail.
  for (const [si, flip] of [[0, true], [sections.length - 1, false]] as const) {
    const s = sections[si];
    const centre = positions.length / 3;
    positions.push(s.x, (s.bottom + s.top) / 2, offsetZ);
    uvs.push(0.5, 0.5);
    for (let k = 0; k < RING; k++) {
      const a = si * RING + k;
      const b = si * RING + ((k + 1) % RING);
      if (flip) indices.push(centre, b, a);
      else indices.push(centre, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** A box from its extents, optionally tilted nose-up about its own centre (radians). */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tilt = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  if (tilt) g.rotateZ(tilt);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** A thin rod between two points, for suspension arms. */
function rod(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.CylinderGeometry(radius, radius, dir.length(), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return g;
}

const BODY: Section[] = [
  { x: 2.62, half: 0.07, bottom: 0.13, top: 0.21 },
  { x: 2.3, half: 0.12, bottom: 0.11, top: 0.28 },
  { x: 1.8, half: 0.19, bottom: 0.1, top: 0.4 },
  { x: 1.2, half: 0.27, bottom: 0.09, top: 0.54 },
  { x: 0.6, half: 0.35, bottom: 0.08, top: 0.64 },
  { x: 0.0, half: 0.39, bottom: 0.08, top: 0.66 },
  { x: -0.45, half: 0.37, bottom: 0.08, top: 0.86 },
  { x: -1.1, half: 0.3, bottom: 0.09, top: 0.72 },
  { x: -1.7, half: 0.17, bottom: 0.14, top: 0.5 },
  { x: -2.1, half: 0.07, bottom: 0.24, top: 0.38 },
];

const SIDEPOD: Section[] = [
  { x: 0.45, half: 0.2, bottom: 0.1, top: 0.5 },
  { x: 0.1, half: 0.27, bottom: 0.09, top: 0.54 },
  { x: -0.6, half: 0.25, bottom: 0.09, top: 0.48 },
  { x: -1.25, half: 0.14, bottom: 0.1, top: 0.32 },
  { x: -1.6, half: 0.05, bottom: 0.12, top: 0.2 },
];

export const WHEELS = [
  { x: 1.72, z: 0.84, radius: 0.33, width: 0.3 },
  { x: 1.72, z: -0.84, radius: 0.33, width: 0.3 },
  { x: -1.56, z: 0.8, radius: 0.36, width: 0.4 },
  { x: -1.56, z: -0.8, radius: 0.36, width: 0.4 },
] as const;

export interface CarParts {
  /** Bodywork painted in the team's main colour. */
  paint: THREE.BufferGeometry;
  /** Wing endplates, the nose tip and the helmet, in the team's second colour. */
  accent: THREE.BufferGeometry;
  /** Floor, wing planes, suspension and the cockpit opening, in bare carbon. */
  carbon: THREE.BufferGeometry;
  /** One tyre, one rim and the coloured compound band on its sidewall, centred on the axle along z. */
  tyre: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  band: THREE.BufferGeometry;
  /** The red rain light on the back of the crash structure. */
  light: THREE.BufferGeometry;
}

export function carParts(): CarParts {
  const paint = mergeGeometries([loft(BODY), loft(SIDEPOD, 0.55), loft(SIDEPOD, -0.55), box(-1.5, -0.2, 0.62, 0.8, -0.02, 0.02)]);

  const accent = mergeGeometries([
    // Front wing endplates.
    box(2.3, 2.85, 0.06, 0.3, 0.92, 0.95),
    box(2.3, 2.85, 0.06, 0.3, -0.95, -0.92),
    // Rear wing endplates.
    box(-2.62, -2.02, 0.42, 1.04, 0.5, 0.53),
    box(-2.62, -2.02, 0.42, 1.04, -0.53, -0.5),
    // Helmet, sitting proud of the cockpit.
    new THREE.SphereGeometry(0.15, 16, 12).translate(-0.08, 0.76, 0),
  ]);

  const front = [new THREE.Vector3(1.72, 0.33, 0.84), new THREE.Vector3(1.72, 0.33, -0.84)];
  const rear = [new THREE.Vector3(-1.56, 0.36, 0.8), new THREE.Vector3(-1.56, 0.36, -0.8)];
  const carbon = mergeGeometries([
    // Floor and diffuser.
    box(-1.95, 1.3, 0.04, 0.08, -0.7, 0.7),
    box(-2.25, -1.95, 0.06, 0.24, -0.5, 0.5, 0.35),
    // Front wing: main plane and a raised flap.
    box(2.35, 2.82, 0.07, 0.1, -0.93, 0.93),
    box(2.28, 2.55, 0.12, 0.15, -0.9, 0.9, 0.25),
    // Rear wing: main plane, upper flap, and the pillar that holds it.
    box(-2.6, -2.15, 0.86, 0.9, -0.5, 0.5, 0.08),
    box(-2.45, -2.1, 0.96, 0.99, -0.5, 0.5, 0.3),
    box(-2.3, -2.1, 0.38, 0.88, -0.03, 0.03),
    // The cockpit opening, a dark shape over the tub around the helmet.
    loft([
      { x: 0.4, half: 0.05, bottom: 0.6, top: 0.67 },
      { x: 0.2, half: 0.25, bottom: 0.6, top: 0.68 },
      { x: -0.35, half: 0.25, bottom: 0.6, top: 0.68 },
      { x: -0.45, half: 0.05, bottom: 0.6, top: 0.67 },
    ]),
    // Wishbones: two arms from the tub to each wheel.
    ...front.flatMap((w) => [rod(new THREE.Vector3(1.95, 0.3, 0), w, 0.022), rod(new THREE.Vector3(1.45, 0.25, 0), w, 0.022)]),
    ...rear.flatMap((w) => [rod(new THREE.Vector3(-1.2, 0.34, 0), w, 0.024), rod(new THREE.Vector3(-1.75, 0.3, 0), w, 0.024)]),
  ]);

  // Wheels are drawn at unit size, each instance scaled to its radius and width.
  const tyre = new THREE.CylinderGeometry(1, 1, 1, 32).rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.62, 0.62, 1.02, 20).rotateX(Math.PI / 2);
  const band = new THREE.RingGeometry(0.72, 0.8, 32).translate(0, 0, 0.511);
  const bandBack = band.clone().rotateY(Math.PI);

  const light = box(-2.2, -2.15, 0.36, 0.42, -0.06, 0.06);

  return { paint, accent, carbon, tyre, rim, band: mergeGeometries([band, bandBack]), light };
}
