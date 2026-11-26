// localStorage wrapper. All saved state lives under one key.

const KEY = 'ball-twister.v1';

function fresh() {
  return {
    records: {},
    settings: { theme: 'terracotta', tutorialDone: false },
    practicePlayed: 0,
  };
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && data.records) {
      return { ...fresh(), ...data,
        settings: { ...fresh().settings, ...data.settings } };
    }
  } catch (err) { /* fall through to fresh state */ }
  return fresh();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) { /* storage may be unavailable; play continues */ }
}
