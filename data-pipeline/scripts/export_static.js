/**
 * export_static.js
 *
 * Dumps the current database snapshot to static JSON files that the
 * frontend can load directly (no API server required).
 *
 * Writes to:
 *   apps/web/public/data/boundary.json      — Berkeley city boundary GeoJSON
 *   apps/web/public/data/stops.json         — all 623 stops with severity
 *   apps/web/public/data/stop-details.json  — incidents + links keyed by stop_id
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPool, closePool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'apps', 'web', 'public', 'data');
const RADIUS_M = parseInt(process.env.INCIDENT_RADIUS_METERS || '50', 10);

function write(filename, data) {
  const path = join(OUT_DIR, filename);
  writeFileSync(path, JSON.stringify(data));
  const kb = (Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1);
  console.log(`  Wrote ${filename} (${kb} KB)`);
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  const pool = getPool();

  // ── 1. Boundary ─────────────────────────────────────────────────────────────
  console.log('Exporting boundary…');
  const { rows: bRows } = await pool.query(`
    SELECT id, name, ST_AsGeoJSON(geom)::json AS geometry
    FROM city_boundary
  `);
  write('boundary.json', {
    type: 'FeatureCollection',
    features: bRows.map(r => ({
      type: 'Feature',
      geometry: r.geometry,
      properties: { id: r.id, name: r.name },
    })),
  });

  // ── 2. Stops list ────────────────────────────────────────────────────────────
  console.log('Exporting stops…');
  const { rows: stops } = await pool.query(`
    SELECT
      s.stop_id,
      s.stop_name,
      s.stop_lat,
      s.stop_lon,
      COALESCE(sis.incident_count_total, 0)     AS incident_count_total,
      COALESCE(sis.incident_count_last_12mo, 0)  AS incident_count_last_12mo,
      COALESCE(sis.severity_color, 'GRAY')       AS severity_color
    FROM stops s
    LEFT JOIN stop_incident_summary sis USING (stop_id)
    WHERE s.in_city = true
    ORDER BY s.stop_id
  `);
  write('stops.json', { stops });

  // ── 3. Stop details (incidents + links per stop) ─────────────────────────────
  console.log(`Exporting stop details (incidents within ${RADIUS_M} m)…`);

  // Fetch all relevant incidents at once with a spatial join
  const { rows: allIncidents } = await pool.query(`
    SELECT
      s.stop_id,
      i.incident_id,
      i.incident_type,
      i.category,
      i.occurred_at,
      i.address,
      i.source,
      i.source_url
    FROM stops s
    JOIN incidents i
      ON i.geom IS NOT NULL
     AND ST_DWithin(s.geom::geography, i.geom::geography, $1)
    WHERE s.in_city = true
    ORDER BY s.stop_id, i.occurred_at DESC NULLS LAST
  `, [RADIUS_M]);

  // Fetch all links
  const { rows: allLinks } = await pool.query(`
    SELECT stop_id, url, title, source, published_at, snippet
    FROM stop_links
    WHERE stop_id IN (SELECT stop_id FROM stops WHERE in_city = true)
    ORDER BY stop_id, published_at DESC NULLS LAST
  `);

  // Group by stop_id
  const details = {};

  // Seed with all Berkeley stops (even those with no incidents)
  for (const s of stops) {
    details[s.stop_id] = { incidents: [], links: [] };
  }

  for (const inc of allIncidents) {
    details[inc.stop_id]?.incidents.push({
      incident_id: inc.incident_id,
      incident_type: inc.incident_type,
      category: inc.category,
      occurred_at: inc.occurred_at,
      address: inc.address,
      source: inc.source,
      source_url: inc.source_url,
    });
  }

  for (const link of allLinks) {
    details[link.stop_id]?.links.push({
      url: link.url,
      title: link.title,
      source: link.source,
      published_at: link.published_at,
      snippet: link.snippet,
    });
  }

  write('stop-details.json', details);

  await closePool();

  console.log(`\nDone. Files written to apps/web/public/data/`);
  console.log(`  Stops: ${stops.length}`);
  console.log(`  Incidents linked: ${allIncidents.length}`);
  console.log(`  Links linked: ${allLinks.length}`);
}

run().catch(err => {
  console.error('export_static failed:', err.message);
  process.exit(1);
});
