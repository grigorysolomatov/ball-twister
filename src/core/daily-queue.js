// Grigory's daily queue (data/daily-queue.json), loaded once at start.
// [] on any failure (offline and not cached, or under node), so the
// daily falls back to a seeded level.

const url = new URL('../../data/daily-queue.json', import.meta.url).href;

async function load() {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch {
    // No queue today.
  }
  return [];
}

const data = await load();

export const DAILY_QUEUE = Array.isArray(data) ? data : [];
