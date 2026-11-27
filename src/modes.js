// Mode registry. A mode builds levels and decides what a solve means.
// Register a new mode with registerMode(); the UI only talks to this.

import {
  dateInfo, dailyLevel, levelPlay, practiceLevel, tutorialLevel, TUTORIAL_STEPS,
} from './core/puzzle.js';
import { DAILY_QUEUE } from './core/daily-queue.js';

const modes = new Map();

export function registerMode(mode) {
  modes.set(mode.id, mode);
}

export function getMode(id) {
  return modes.get(id);
}

export function listModes() {
  return [...modes.values()];
}

registerMode({
  id: 'daily',
  title: 'Daily',
  // Same level for everyone on a given local date.
  next(ctx) {
    const { number } = dateInfo(ctx.now());
    return dailyLevel(number, DAILY_QUEUE);
  },
  label(level) {
    return `Daily #${level.number} \u00b7 ${level.name}`;
  },
  tracksStats: true,
  shareable: true,
  replayable: true,
});

registerMode({
  id: 'practice',
  title: 'Practice',
  next(ctx) {
    ctx.counter = (ctx.counter || 0) + 1;
    const seed = `${ctx.now().getTime()}-${ctx.counter}`;
    return practiceLevel(seed, 6 + (ctx.counter % 5) * 2);
  },
  label() { return 'Practice'; },
  tracksStats: false,
  shareable: false,
  replayable: false,
});

registerMode({
  id: 'level',
  title: 'Levels',
  next(ctx) {
    // Fresh random scramble on every play; only the daily is seeded.
    return levelPlay(ctx.levelId || 0, Math.floor(Math.random() * 2 ** 32));
  },
  label(level) { return level.label; },
  tracksStats: false,
  shareable: false,
  replayable: true,
});

registerMode({
  id: 'tutorial',
  title: 'Tutorial',
  steps: TUTORIAL_STEPS,
  next(ctx) {
    return tutorialLevel(ctx.step || 0);
  },
  label(level) { return `Tutorial ${level.step + 1}/${TUTORIAL_STEPS}`; },
  tracksStats: false,
  shareable: false,
  replayable: false,
});
