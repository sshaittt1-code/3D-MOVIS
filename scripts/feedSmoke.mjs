const endpoints = [
  { name: 'movies', path: '/api/movies?page=1&page_size=20&category=popular', key: 'movies' },
  { name: 'series', path: '/api/series?page=1&page_size=20&category=popular', key: 'series' },
  { name: 'israeli', path: '/api/israeli?page=1&page_size=20&category=popular', key: 'items' }
];

export const runFeedSmoke = async (baseUrlInput = process.env.FEED_SMOKE_BASE_URL || 'http://127.0.0.1:3000') => {
  const baseUrl = baseUrlInput.replace(/\/$/, '');
  const failures = [];

  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`);
      const payload = await response.json();
      const items = Array.isArray(payload?.[endpoint.key]) ? payload[endpoint.key] : [];
      const hasPoster = items.every((item) => Boolean(item?.poster));
      const hasMediaType = items.every((item) => Boolean(item?.mediaType));
      const elapsedMs = Date.now() - startedAt;

      console.log(JSON.stringify({
        endpoint: endpoint.name,
        status: response.status,
        elapsedMs,
        itemCount: items.length,
        hasMore: Boolean(payload?.hasMore),
        hasPoster,
        hasMediaType,
        firstItem: items[0] ? {
          id: items[0].id,
          title: items[0].title,
          mediaType: items[0].mediaType,
          poster: items[0].poster
        } : null
      }, null, 2));

      if (!response.ok || items.length === 0 || !hasPoster || !hasMediaType) {
        failures.push(endpoint.name);
      }
    } catch (error) {
      failures.push(endpoint.name);
      console.error(JSON.stringify({
        endpoint: endpoint.name,
        error: String(error)
      }, null, 2));
    }
  }

  if (failures.length > 0) {
    throw new Error(`Feed smoke failed for: ${failures.join(', ')}`);
  }
};

const isDirectRun = process.argv[1]?.endsWith('feedSmoke.mjs');

if (isDirectRun) {
  runFeedSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
