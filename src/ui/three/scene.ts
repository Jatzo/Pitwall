/**
 * The 3D race scene. This is the only part of the game that loads three.js, and it is loaded only when the
 * 3D view opens. Everything is built once per race; after that, `renderAt` draws a frame from what it is
 * given and remembers nothing between calls, so any frame can be drawn in any order. Easing the camera is
 * the caller's job.
 */

import * as THREE from 'three';
import type { Track } from '../../engine/track.ts';
import { hashString } from '../../engine/rng.ts';
import type { Setting } from '../circuitLook.ts';
import { settingFor } from '../circuitLook.ts';
import { buildScenery } from '../scenery.ts';
import type { Pt } from '../scenery.ts';
import { WHEELS, carParts } from './car.ts';
import { FOV_DEG, band, blockHeight, carScale, viewDistance, extrude, kerbs, merge, patch, pitRibbon, pitWallLine, placeHash, streetWallRuns, trackRibbon, treeSize, wall } from './geometry.ts';
import type { CameraPlace, Mesh, Pose3 } from './geometry.ts';
import { asphalt, concrete, crowd, grass, gravel, kerb, windows, wireMesh } from './textures.ts';

export interface SceneCar {
  id: string;
  /** Main livery colour, then the second. */
  colour: string;
  accent: string;
}

export interface SceneFrame {
  /** One per car, in the order the scene was built with; null hides the car. */
  poses: readonly (Pose3 | null)[];
  /** The colour of each car's tyre compound band, in the same order. */
  tyres: readonly string[];
  camera: CameraPlace;
  /** Water on the road, 0 to 1. */
  wetness: number;
}

/** A point on the screen, in pixels from the canvas's top left, or null when it is behind the camera. */
export type ScreenPoint = { x: number; y: number } | null;

export interface RaceScene {
  renderAt(frame: SceneFrame): void;
  /** Where a point on the ground appears in the last frame drawn, for labels over the canvas. */
  project(x: number, z: number, height: number): ScreenPoint;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
  /** Geometries and textures still held on the GPU, to check nothing leaks. */
  memory(): { geometries: number; textures: number };
  /** The GPU that draws the scene, as the browser reports it. */
  gpu: string;
}

/** Natural ground colours for 3D; the 2D map's are kept dark on purpose, which looks like dusk here. */
const GROUND: Record<Setting, [number, number, number]> = {
  countryside: [78, 112, 58],
  parkland: [72, 114, 60],
  moorland: [106, 100, 72],
  forest: [56, 88, 46],
  mountain: [90, 98, 72],
  coastal: [84, 114, 66],
  street: [70, 72, 76],
};
const CONIFERS: readonly Setting[] = ['forest', 'mountain', 'moorland'];
/** Facade colours for city blocks: stone, brick, render and concrete. */
const FACADES = ['#d8c8a8', '#b5654a', '#e6e0d4', '#9a9a96', '#c9a27a', '#8f5a44', '#d2d6da'];
const FOLIAGE = ['#2f5a2c', '#3a6b33', '#2a4f27', '#46773a'];
const FOG = '#b9cbdf';
/** Where the sun sits: high enough for short shadows, off to one side so the cars have shape. */
const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(42), THREE.MathUtils.degToRad(140));
/** Half the width of the patch of ground that gets shadows, centred on what the camera looks at. */
const SHADOW_M = 70;

function geometry(m: Mesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uvs, 2));
  g.setIndex(m.indices);
  g.computeVertexNormals();
  return g;
}

/**
 * A sky dome: deep blue overhead fading to a pale haze at the horizon, and the ground colour below it.
 * Drawn first and never fogged, with its colours shown as written.
 */
function gradientSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color('#2f6cc0') },
      horizon: { value: new THREE.Color('#c4d6ea') },
      below: { value: new THREE.Color('#8c9aa8') },
    },
    vertexShader: 'varying vec3 dir; void main() { dir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 zenith; uniform vec3 horizon; uniform vec3 below; varying vec3 dir;',
      'void main() {',
      '  float h = dir.y;',
      '  vec3 c = h > 0.0 ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, below, clamp(-h * 6.0, 0.0, 1.0));',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

function gpuName(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

export function createScene(canvas: HTMLCanvasElement, track: Track, cars: readonly SceneCar[]): RaceScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG, 700, 3200);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, 0.3, 9000);
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  // Sky, and the light it throws on shiny paint and wet asphalt.
  const sky = gradientSky();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyOnly = new THREE.Scene();
  skyOnly.add(sky);
  const environment = pmrem.fromScene(skyOnly, 0.02);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.1;
  scene.add(sky);

  const sun = new THREE.DirectionalLight('#fff2dc', 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -SHADOW_M, right: SHADOW_M, top: SHADOW_M, bottom: -SHADOW_M, near: 1, far: 600 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#dfe8f5', '#4a5240', 1.1));

  const setting = settingFor(track.def.id);
  const sc = buildScenery(track, setting, hashString(track.def.id));
  const add = (m: Mesh, material: THREE.Material, shadows: 'cast' | 'receive' | 'both' = 'receive') => {
    const mesh = new THREE.Mesh(geometry(m), material);
    mesh.castShadow = shadows !== 'receive';
    mesh.receiveShadow = shadows !== 'cast';
    scene.add(mesh);
    return mesh;
  };

  // The ground, mown grass or city paving, as big as the 2D map's scenery.
  const e = sc.extent;
  const [gw, gh] = [e.maxX - e.minX, e.maxY - e.minY];
  const grassMap = keep(grass(GROUND[setting]));
  grassMap.repeat.set(gw / 40, gh / 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshStandardMaterial({ map: grassMap, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((e.minX + e.maxX) / 2, 0, (e.minY + e.maxY) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Water and shore, flat, with the sky in the water.
  for (const f of sc.fills) {
    if (f.kind === 'patch') continue;
    const shape = new THREE.Shape(f.points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
    g.translate(0, f.kind === 'water' ? 0.02 : 0.015, 0);
    const material =
      f.kind === 'water'
        ? new THREE.MeshStandardMaterial({ color: '#2b5a78', roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: setting === 'street' ? '#8d9096' : '#c9b48a', roughness: 0.95, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // The road. Dry, it is rough grey; wet, it darkens and turns glossy so it mirrors the sky.
  const roadMap = keep(asphalt());
  const road = new THREE.MeshStandardMaterial({ map: roadMap, roughness: 0.9 });
  const dryRoad = new THREE.Color('#ffffff');
  const wetRoad = new THREE.Color('#6d7178');
  add(trackRibbon(track), road);
  add(pitRibbon(track), new THREE.MeshStandardMaterial({ map: roadMap, color: '#d8dbe0', roughness: 0.9 }));
  add(kerbs(track), new THREE.MeshStandardMaterial({ map: keep(kerb()), roughness: 0.55 }));
  const line = [track.pointAt(-0.6), track.pointAt(0.6)];
  add(band(line, -7, 7, false, 0.07, 1), new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6 }));

  // Run-off: gravel traps and paved areas on the outside of slow corners.
  const runoff = (kind: 'gravel' | 'runoff') => sc.areas.filter((a) => a.kind === kind).map((a) => patch(a.points, 0.03));
  add(merge(runoff('gravel')), new THREE.MeshStandardMaterial({ map: keep(gravel()), roughness: 1 }));
  add(merge(runoff('runoff')), new THREE.MeshStandardMaterial({ map: roadMap, color: '#b4b8bf', roughness: 0.95 }));

  // Concrete walls: a street circuit is lined with them, topped with catch fencing; every circuit has a pit wall.
  const street = setting === 'street' ? streetWallRuns(track) : [];
  const walls = [...street.map((run) => wall(run, 1.1, 0.5)), wall(pitWallLine(track), 1.2, 0.5)];
  add(merge(walls), new THREE.MeshStandardMaterial({ map: keep(concrete()), roughness: 0.85 }), 'both');
  if (street.length) {
    const fences = geometry(merge(street.map((run) => wall(run, 3.2, 0.02))));
    fences.translate(0, 1.1, 0);
    const fence = new THREE.Mesh(fences, new THREE.MeshStandardMaterial({ map: keep(wireMesh()), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }));
    scene.add(fence);
  }

  // Grandstands, stepped up from the track with a crowd on every step.
  const steps: Mesh[] = [];
  for (const a of sc.areas.filter((x) => x.kind === 'stand' && x.rows && x.rows.length > 0)) {
    const half = a.points.length / 2;
    const rails: Pt[][] = [a.points.slice(0, half), ...(a.rows ?? []), a.points.slice(half).reverse()];
    for (let i = 0; i + 1 < rails.length; i++) {
      if (rails[i].length !== rails[i + 1].length) continue;
      steps.push(extrude([...rails[i], ...[...rails[i + 1]].reverse()], 1.4 + 1.5 * i));
    }
  }
  add(merge(steps), new THREE.MeshStandardMaterial({ map: keep(crowd()), roughness: 0.9 }), 'both');

  // The pit building and city blocks, with windows.
  const pitBuilding = sc.areas.filter((a) => a.kind === 'building').map((a) => extrude(a.points, 7));
  add(merge(pitBuilding), new THREE.MeshStandardMaterial({ map: keep(windows('#d4d8de')), roughness: 0.6 }), 'both');
  // City blocks: one facade texture, tinted per block so the street is not one colour.
  const blockAreas = sc.areas.filter((a) => a.kind === 'block');
  if (blockAreas.length) {
    const meshes = blockAreas.map((a) => extrude(a.points, blockHeight(a.points[0][0], a.points[0][1])));
    const g = geometry(merge(meshes));
    const tints: number[] = [];
    const tint = new THREE.Color();
    blockAreas.forEach((a, i) => {
      tint.set(FACADES[Math.floor(placeHash(a.points[0][0], a.points[0][1], 'facade') * FACADES.length)]);
      for (let v = 0; v < meshes[i].positions.length / 3; v++) tints.push(tint.r, tint.g, tint.b);
    });
    g.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: keep(windows('#ffffff')), vertexColors: true, roughness: 0.8 }));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Trees: a trunk and a crown each, conifers in the hills and forest, broadleaf elsewhere.
  const trees = sc.dots.filter((d) => d.kind === 'tree');
  if (trees.length) {
    const conifer = CONIFERS.includes(setting);
    const crownShape = conifer
      ? new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)
      : new THREE.IcosahedronGeometry(1, 1).scale(1, 0.85, 1).translate(0, 0.85, 0);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 }), trees.length);
    const crowns = new THREE.InstancedMesh(crownShape, new THREE.MeshStandardMaterial({ roughness: 0.95 }), trees.length);
    const at = new THREE.Object3D();
    const colour = new THREE.Color();
    trees.forEach((d, i) => {
      const { radius, height } = treeSize(d.x, d.y);
      const trunk = conifer ? height * 0.2 : height * 0.35;
      at.position.set(d.x, 0, d.y);
      at.rotation.set(0, placeHash(d.x, d.y, 'turn') * Math.PI * 2, 0);
      at.scale.set(radius, trunk, radius);
      at.updateMatrix();
      trunks.setMatrixAt(i, at.matrix);
      at.position.y = trunk * 0.9;
      at.scale.set(radius, conifer ? height - trunk : radius, radius);
      at.updateMatrix();
      crowns.setMatrixAt(i, at.matrix);
      crowns.setColorAt(i, colour.set(FOLIAGE[Math.floor(placeHash(d.x, d.y, 'leaf') * FOLIAGE.length)]));
    });
    for (const m of [trunks, crowns]) {
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
  }
  const rocks = sc.dots.filter((d) => d.kind === 'rock');
  if (rocks.length) {
    const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#7c7f80', roughness: 1, flatShading: true }), rocks.length);
    const at = new THREE.Object3D();
    rocks.forEach((d, i) => {
      at.position.set(d.x, 0, d.y);
      at.scale.set(d.r * 0.5, d.r * 0.3, d.r * 0.45);
      at.rotation.set(0, placeHash(d.x, d.y, 'rock') * 6, 0);
      at.updateMatrix();
      mesh.setMatrixAt(i, at.matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Cars: each part is one instanced draw for the whole grid. Paint has a clear coat that catches the sky.
  const parts = carParts();
  const instanced = (g: THREE.BufferGeometry, material: THREE.Material, count: number) => {
    const m = new THREE.InstancedMesh(g, material, count);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  // The clear coat is kept light: a full one mirrors the pale horizon and bleaches the livery.
  const paint = instanced(parts.paint, new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.12, envMapIntensity: 0.5 }), cars.length);
  const accent = instanced(parts.accent, new THREE.MeshPhysicalMaterial({ roughness: 0.45, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.15, envMapIntensity: 0.5 }), cars.length);
  const carbon = instanced(parts.carbon, new THREE.MeshStandardMaterial({ color: '#141619', roughness: 0.4, metalness: 0.35 }), cars.length);
  const light = instanced(parts.light, new THREE.MeshStandardMaterial({ color: '#400000', emissive: '#ff1a1a', emissiveIntensity: 2.5 }), cars.length);
  const wheels = cars.length * WHEELS.length;
  const tyres = instanced(parts.tyre, new THREE.MeshStandardMaterial({ color: '#1a1a1b', roughness: 0.82 }), wheels);
  const rims = instanced(parts.rim, new THREE.MeshStandardMaterial({ color: '#8d939b', roughness: 0.28, metalness: 0.9 }), wheels);
  const bands = instanced(parts.band, new THREE.MeshStandardMaterial({ roughness: 0.6 }), wheels);
  const colour = new THREE.Color();
  cars.forEach((c, i) => {
    paint.setColorAt(i, colour.set(c.colour));
    accent.setColorAt(i, colour.set(c.accent));
  });

  const body = new THREE.Matrix4();
  const wheel = new THREE.Matrix4();
  const spin = new THREE.Matrix4();
  const size = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const look = new THREE.Vector3();
  const scaleBy = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const canvasSize = new THREE.Vector2();
  const shadow = sun.shadow.camera;

  return {
    gpu: gpuName(renderer),
    renderAt({ poses, tyres: compounds, camera: at, wetness }) {
      const grow = carScale(at);
      poses.forEach((p, i) => {
        if (!p) {
          for (const m of [paint, accent, carbon, light]) m.setMatrixAt(i, hidden);
          for (let w = 0; w < WHEELS.length; w++) for (const m of [tyres, rims, bands]) m.setMatrixAt(i * WHEELS.length + w, hidden);
          return;
        }
        // Map heading turns from +x towards +y; about the up axis that is the opposite sign.
        body.makeRotationY(-p.heading).scale(scaleBy.setScalar(grow)).setPosition(p.x, 0, p.z);
        for (const m of [paint, accent, carbon, light]) m.setMatrixAt(i, body);
        WHEELS.forEach((w, k) => {
          spin.makeRotationZ(-p.rolled / w.radius);
          size.makeScale(w.radius, w.radius, w.width);
          wheel.makeTranslation(w.x, w.radius, w.z).multiply(spin).multiply(size).premultiply(body);
          const j = i * WHEELS.length + k;
          tyres.setMatrixAt(j, wheel);
          rims.setMatrixAt(j, wheel);
          bands.setMatrixAt(j, wheel);
          bands.setColorAt(j, colour.set(compounds[i] ?? '#dddddd'));
        });
      });
      for (const m of [paint, accent, carbon, light, tyres, rims, bands]) m.instanceMatrix.needsUpdate = true;
      if (bands.instanceColor) bands.instanceColor.needsUpdate = true;

      const wet = Math.min(1, Math.max(0, wetness));
      road.color.lerpColors(dryRoad, wetRoad, wet);
      road.roughness = 0.9 - 0.65 * wet;

      camera.position.set(at.x, at.y, at.z);
      look.set(at.lookX, at.lookY, at.lookZ);
      camera.lookAt(look);
      sky.position.copy(camera.position);
      // Wide shots see further: the haze and the shadowed patch grow with the distance to what is in view.
      const far = viewDistance(at);
      const fog = scene.fog as THREE.Fog;
      fog.near = 700 + far;
      fog.far = 3200 + far * 2;
      const reach = Math.max(SHADOW_M, far * 0.75);
      if (shadow.right !== reach) {
        Object.assign(shadow, { left: -reach, right: reach, top: reach, bottom: -reach, far: 600 + far });
        shadow.updateProjectionMatrix();
      }
      // Shadows are drawn only round what the camera looks at, so they stay sharp.
      sun.target.position.copy(look);
      sun.position.copy(look).addScaledVector(SUN, 300);
      sun.target.updateMatrixWorld();
      renderer.render(scene, camera);
    },
    project(x, z, height) {
      projected.set(x, height, z).project(camera);
      if (projected.z > 1) return null;
      const size = renderer.getSize(canvasSize);
      return { x: ((projected.x + 1) / 2) * size.x, y: ((1 - projected.y) / 2) * size.y };
    },
    resize(width, height, pixelRatio) {
      renderer.setPixelRatio(Math.min(2, pixelRatio));
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose());
        }
      });
      for (const t of textures) t.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
    memory: () => ({ ...renderer.info.memory }),
  };
}
