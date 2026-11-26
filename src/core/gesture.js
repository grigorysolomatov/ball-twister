// Swipe/drag classification for a twist. Pure maths: no DOM, no clock.
//
// A press starts on a ring centre. Moving the finger right twists
// clockwise, left counter-clockwise (horizontal part decides). A path
// that curls around the centre instead uses the sign of its angular
// motion. Coming back near the start point cancels the twist.

export const CW = 1;
export const CCW = -1;
export const SWIPE_PX = 20;
export const TURN_RAD = 0.6;
export const STRAIGHT = 0.8;

export function createGesture(centre, cell, threshold = SWIPE_PX) {
  const g = {
    centre, cell, threshold,
    start: null, last: null, angle: 0, prevAngle: null,
    path: 0, maxDist: 0, x: 0, y: 0,
  };
  return g;
}

function angleOf(g, x, y) {
  return Math.atan2(y - g.centre.y, x - g.centre.x);
}

export function gestureStart(g, x, y) {
  g.start = { x, y };
  g.last = { x, y };
  g.x = x;
  g.y = y;
  g.prevAngle = null;
  return g;
}

export function gestureMove(g, x, y) {
  g.path += Math.hypot(x - g.last.x, y - g.last.y);
  g.last = { x, y };
  g.x = x;
  g.y = y;
  g.maxDist = Math.max(g.maxDist, Math.hypot(x - g.start.x, y - g.start.y));
  // Angular motion only counts away from the centre, where it is stable.
  if (Math.hypot(x - g.centre.x, y - g.centre.y) >= 0.3 * g.cell) {
    const a = angleOf(g, x, y);
    if (g.prevAngle !== null) {
      let d = a - g.prevAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      g.angle += d;
    }
    g.prevAngle = a;
  }
  return g;
}

// Current direction: CW, CCW, or 0 (no twist yet / cancelled).
export function gestureDir(g) {
  if (!g.start) return 0;
  const dx = g.x - g.start.x;
  const dy = g.y - g.start.y;
  const dist = Math.hypot(dx, dy);
  if (dist < g.threshold) return 0;
  const straight = g.path > 0 ? dist / g.path : 1;
  if (straight < STRAIGHT && Math.abs(g.angle) >= TURN_RAD) {
    return g.angle > 0 ? CW : CCW;
  }
  if (Math.abs(dx) < g.threshold) return 0;
  return dx > 0 ? CW : CCW;
}

// 0..1: how far the drag has got towards committing.
export function gestureProgress(g) {
  if (!g.start) return 0;
  const dir = gestureDir(g);
  if (dir === 0) {
    return Math.min(1, Math.hypot(g.x - g.start.x, g.y - g.start.y)
      / g.threshold) * 0.5;
  }
  return Math.min(1, 0.5 + Math.abs(g.x - g.start.x) / (g.threshold * 4));
}

// True when the press was a tap: it never moved beyond a small slop.
export function isTap(g, slop = 8) {
  return g.maxDist < slop;
}
