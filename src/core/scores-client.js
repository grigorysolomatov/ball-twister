// Client for the daily score server (worker/). Off until SCORES_URL is
// set after the server is deployed; every call then resolves to null.

export const SCORES_URL = '';

export function scoresEnabled(url = SCORES_URL) {
  return Boolean(url);
}

// Send a solved daily. Returns the server reply or null (off, offline).
export async function submitScore({ puzzle, moves, ms }, url = SCORES_URL,
  fetchFn = globalThis.fetch) {
  if (!scoresEnabled(url)) return null;
  try {
    const res = await fetchFn(`${url}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ puzzle, moves, ms }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Histogram for a daily, or null when off or unreachable.
export async function fetchHistogram(puzzle, url = SCORES_URL,
  fetchFn = globalThis.fetch) {
  if (!scoresEnabled(url)) return null;
  try {
    const res = await fetchFn(`${url}/histogram?puzzle=${puzzle}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
