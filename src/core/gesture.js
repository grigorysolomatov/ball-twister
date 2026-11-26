// Drag-to-rotate maths for one ring. Pure: no DOM, no clock.
//
// A press starts on a ring centre. Once the finger is a little way from
// the centre, its angle around the centre drives the ring one to one
// (theta, in radians, positive = clockwise on screen). Near the centre
// the angle is unstable, so the ring simply holds still there. On
// release the ring snaps to the nearest quarter turn, the only
// rotations that keep the board valid.

export const CW = 1;
export const CCW = -1;
export const QUARTER = Math.PI / 2;
// Fractions of a cell: angle tracking starts beyond START, and keeps
// going until the finger comes back inside STOP.
export const START = 0.45;
export const STOP = 0.3;
export const TAP_SLOP = 8;

export function createDrag(centre, cell) {
  return { centre, cell, theta: 0, prev: null, maxDist: 0, start: null };
}

export function dragStart(g, x, y) {
  g.start = { x, y };
  return dragMove(g, x, y);
}

export function dragMove(g, x, y) {
  if (g.start) {
    g.maxDist = Math.max(g.maxDist, Math.hypot(x - g.start.x, y - g.start.y));
  }
  const dx = x - g.centre.x;
  const dy = y - g.centre.y;
  const d = Math.hypot(dx, dy);
  const limit = (g.prev === null ? START : STOP) * g.cell;
  if (d < limit) {
    g.prev = null;
    return g;
  }
  const a = Math.atan2(dy, dx);
  if (g.prev !== null) {
    let step = a - g.prev;
    if (step > Math.PI) step -= 2 * Math.PI;
    if (step < -Math.PI) step += 2 * Math.PI;
    g.theta += step;
  }
  g.prev = a;
  return g;
}

// Whole quarter turns the ring snaps to (negative = counter-clockwise).
export function dragTurns(g) {
  return Math.round(g.theta / QUARTER) || 0;
}

// True when the press never moved beyond a small slop.
export function isTap(g, slop = TAP_SLOP) {
  return g.maxDist < slop;
}
