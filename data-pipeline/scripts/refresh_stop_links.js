/**
 * refresh_stop_links.js
 *
 * For each Berkeley bus stop, generates search queries and fetches
 * related news/report links via GDELT 2.0 DOC API (free, no key needed).
 *
 * Links are stored in stop_links (title + URL + snippet only — no full text).
 * Rate-limited to 1 req/sec to be a good citizen.
 *
 * GDELT API docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */
import 'dotenv/config';
import { getPool, closePool } from './db.js';

const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';
const DELAY_MS = 1200;
const MAX_RESULTS = 8;
const STOPS_BATCH = 50; // process this many stops per run (to avoid timeout)

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function buildQueries(stop) {
  const queries = [];
  const name = stop.stop_name;

  if (name) {
    queries.push(`"${name}" Berkeley pedestrian safety`);
    queries.push(`"${name}" Berkeley bus stop incident`);
  }

  // Nearest intersection is not in our DB yet, so fall back to coords
  queries.push(`Berkeley bus stop safety ${stop.stop_lat.toFixed(4)} ${stop.stop_lon.toFixed(4)}`);

  return queries.slice(0, 3); // max 3 queries per stop
}

async function fetchGDELT(query) {
  const params = new URLSearchParams({
    query: query + ' sourcelang:English',
    mode: 'ArtList',
    maxrecords: String(MAX_RESULTS),
    format: 'json',
    sort: 'DateDesc',
  });

  const res = await fetch(`${GDELT_URL}?${params.toString()}`);
  if (!res.ok) {
    console.warn(`  GDELT HTTP ${res.status} for query: ${query}`);
    return [];
  }

  const json = await res.json().catch(() => null);
  return json?.articles ?? [];
}

async function run() {
  const pool = getPool();

  const { rows: stops } = await pool.query(`
    SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
    FROM stops s
    WHERE s.in_city = true
    ORDER BY s.stop_id
    LIMIT $1
  `, [STOPS_BATCH]);

  console.log(`Refreshing links for ${stops.length} stops (GDELT)…`);

  let totalStored = 0;

  for (const stop of stops) {
    const queries = buildQueries(stop);

    for (const query of queries) {
      await sleep(DELAY_MS);

      const articles = await fetchGDELT(query);

      for (const art of articles) {
        const url = art.url;
        const title = art.title || '';
        const source = art.domain || null;
        const publishedAt = art.seendate
          ? new Date(art.seendate.replace(
              /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
              '$1-$2-$3T$4:$5:$6Z'
            ))
          : null;

        if (!url || !title) continue;

        try {
          await pool.query(
            `INSERT INTO stop_links (stop_id, url, title, source, published_at, query_used)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (stop_id, url) DO NOTHING`,
            [stop.stop_id, url, title, source, publishedAt, query]
          );
          totalStored++;
        } catch (_) {}
      }
    }

    process.stdout.write('.');
  }

  console.log(`\n\nStored ${totalStored} links for ${stops.length} stops.`);
  await closePool();
  console.log('Link refresh complete.');
}

run().catch(err => {
  console.error('refresh_stop_links failed:', err.message);
  process.exit(1);
});
