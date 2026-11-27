// Grigory's daily queue (data/daily-queue.json), loaded once at start.
// JSON module import where supported, else fetch; [] on any failure so
// the daily always falls back to a seeded level.

const url = new URL('../../data/daily-queue.json', import.meta.url).href;

async function load() {
  try {
    return (await import(url, { with: { type: 'json' } })).default;
  } catch {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch {
      // Offline and not cached: no queue today.
    }
  }
  return [];
}

const data = await load();

export const DAILY_QUEUE = Array.isArray(data) ? data : [];
