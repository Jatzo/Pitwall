/**
 * Circuit geometry from a designer's sketch.
 *
 * A layout is a closed polygon of key points in metres, each with the radius
 * of the corner drawn at that point. Every corner becomes a true circular arc
 * that meets the straights either side of it, the way circuits are drawn on
 * paper: straights of known length joined by corners of known radius. The
 * lap starts halfway along the first edge, which is the start/finish straight.
 */

export type LayoutPoint = readonly [x: number, y: number, radius: number];

interface Segment {
  /** Distance along the lap where the segment starts. */
  s0: number;
  len: number;
  x: number;
  y: number;
  heading: number;
  /** Signed curvature: 0 on a straight, positive when the heading increases. */
  kappa: number;
}

export interface LayoutCorner {
  /** Index of the key point the corner is drawn at. */
  point: number;
  /** Distance along the lap to the middle of the arc. */
  s: number;
  /** Turning angle in degrees, positive when the heading increases. */
  angle: number;
  radius: number;
}

export interface CircuitSample {
  x: number;
  y: number;
  heading: number;
  kappa: number;
}

export interface Circuit {
  length: number;
  corners: LayoutCorner[];
  /** Straight track either side of the start line before the first and last corners. */
  startStraight: { before: number; after: number };
  /** Total turning in degrees: -360 for an anticlockwise lap on screen, 360 for clockwise. */
  turning: number;
  sample(s: number): CircuitSample;
}

export function buildCircuit(points: readonly LayoutPoint[]): Circuit {
  const n = points.length;
  if (n < 3) throw new Error('a layout needs at least three points');
  const edges = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1) throw new Error(`points ${i} and ${(i + 1) % n} are in the same place`);
    return { dx: (q[0] - p[0]) / len, dy: (q[1] - p[1]) / len, len };
  });
  const corners = points.map((p, i) => {
    if (!(p[2] > 0)) throw new Error(`point ${i} needs a corner radius above zero`);
    const a = edges[(i - 1 + n) % n];
    const b = edges[i];
    const theta = Math.atan2(a.dx * b.dy - a.dy * b.dx, a.dx * b.dx + a.dy * b.dy);
    return { theta, tangent: p[2] * Math.tan(Math.abs(theta) / 2) };
  });
  for (let i = 0; i < n; i++) {
    const need = corners[i].tangent + corners[(i + 1) % n].tangent;
    if (need > edges[i].len + 1e-6) {
      throw new Error(`corners at points ${i} and ${(i + 1) % n} need ${need.toFixed(0)} m but the edge is ${edges[i].len.toFixed(0)} m`);
    }
  }
  const turning = (corners.reduce((sum, c) => sum + c.theta, 0) * 180) / Math.PI;
  if (Math.abs(Math.abs(turning) - 360) > 0.5) throw new Error(`the layout turns ${turning.toFixed(0)} degrees, not 360: it crosses itself`);

  const segments: Segment[] = [];
  const out: LayoutCorner[] = [];
  let s = 0;
  const push = (len: number, x: number, y: number, heading: number, kappa: number) => {
    if (len <= 0) return;
    segments.push({ s0: s, len, x, y, heading, kappa });
    s += len;
  };
  const e0 = edges[0];
  const startX = points[0][0] + e0.dx * e0.len * 0.5;
  const startY = points[0][1] + e0.dy * e0.len * 0.5;
  let x = startX;
  let y = startY;
  for (let step = 1; step <= n; step++) {
    const i = step % n;
    const inEdge = edges[(i - 1 + n) % n];
    const outEdge = edges[i];
    const { theta, tangent } = corners[i];
    const ax = points[i][0] - inEdge.dx * tangent;
    const ay = points[i][1] - inEdge.dy * tangent;
    push(Math.hypot(ax - x, ay - y), x, y, Math.atan2(inEdge.dy, inEdge.dx), 0);
    if (theta !== 0) {
      const r = points[i][2];
      const arc = Math.abs(theta) * r;
      out.push({ point: i, s: s + arc / 2, angle: (theta * 180) / Math.PI, radius: r });
      push(arc, ax, ay, Math.atan2(inEdge.dy, inEdge.dx), Math.sign(theta) / r);
    }
    x = points[i][0] + outEdge.dx * tangent;
    y = points[i][1] + outEdge.dy * tangent;
  }
  push(Math.hypot(startX - x, startY - y), x, y, Math.atan2(e0.dy, e0.dx), 0);
  const length = s;

  const half = e0.len * 0.5;
  const startStraight = { before: half - corners[0].tangent, after: half - corners[1 % n].tangent };

  const sample = (at: number): CircuitSample => {
    const w = ((at % length) + length) % length;
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].s0 <= w) lo = mid;
      else hi = mid - 1;
    }
    const seg = segments[lo];
    const t = w - seg.s0;
    const k = seg.kappa;
    if (k === 0) {
      return { x: seg.x + Math.cos(seg.heading) * t, y: seg.y + Math.sin(seg.heading) * t, heading: seg.heading, kappa: 0 };
    }
    const h = seg.heading + k * t;
    return {
      x: seg.x + (Math.sin(h) - Math.sin(seg.heading)) / k,
      y: seg.y - (Math.cos(h) - Math.cos(seg.heading)) / k,
      heading: h,
      kappa: k,
    };
  };

  return { length, corners: out, startStraight, turning, sample };
}
