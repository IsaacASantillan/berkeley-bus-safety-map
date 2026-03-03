/**
 * compute_stop_summary.js
 *
 * For every bus stop inside Berkeley, counts nearby incidents within a
 * configurable radius (default 50 m) and assigns a severity color.
 * Results are written to stop_incident_summary.
 *
 * Run after ingesting both stops and incidents.
 */
import 'dotenv/config';
import { getPool, closePool } from './db.js';

const RADIUS_M = parseInt(process.env.INCIDENT_RADIUS_METERS || '50', 10);

function severityColor(count) {
  if (count >= 4) return 'RED';
  if (count === 3) return 'ORANGE';
  if (count === 2) return 'YELLOW';
  if (count === 1) return 'GREEN';
  return 'GRAY';
}

async function run() {
  const pool = getPool();

  console.log(`Computing stop summaries (radius = ${RADIUS_M} m)…`);

  // Total incidents per stop (all time)
  const totalSql = `
    SELECT
      s.stop_id,
      COUNT(i.incident_id) AS cnt
    FROM stops s
    LEFT JOIN incidents i
      ON i.geom IS NOT NULL
     AND ST_DWithin(s.geom::geography, i.geom::geography, $1)
    WHERE s.in_city = true
    GROUP BY s.stop_id
  `;

  // Incidents in last 12 months per stop
  const last12Sql = `
    SELECT
      s.stop_id,
      COUNT(i.incident_id) AS cnt
    FROM stops s
    LEFT JOIN incidents i
      ON i.geom IS NOT NULL
     AND ST_DWithin(s.geom::geography, i.geom::geography, $1)
     AND i.occurred_at >= now() - INTERVAL '12 months'
    WHERE s.in_city = true
    GROUP BY s.stop_id
  `;

  const [totalRes, last12Res] = await Promise.all([
    pool.query(totalSql, [RADIUS_M]),
    pool.query(last12Sql, [RADIUS_M]),
  ]);

  // Build lookup maps
  const totalMap = new Map(totalRes.rows.map(r => [r.stop_id, parseInt(r.cnt, 10)]));
  const last12Map = new Map(last12Res.rows.map(r => [r.stop_id, parseInt(r.cnt, 10)]));

  const stopIds = [...new Set([...totalMap.keys(), ...last12Map.keys()])];

  let updated = 0;
  for (const stopId of stopIds) {
    const total = totalMap.get(stopId) ?? 0;
    const last12 = last12Map.get(stopId) ?? 0;
    const color = severityColor(total);

    await pool.query(
      `INSERT INTO stop_incident_summary
         (stop_id, incident_count_total, incident_count_last_12mo, severity_color, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (stop_id) DO UPDATE
         SET incident_count_total    = EXCLUDED.incident_count_total,
             incident_count_last_12mo = EXCLUDED.incident_count_last_12mo,
             severity_color           = EXCLUDED.severity_color,
             updated_at               = now()`,
      [stopId, total, last12, color]
    );
    updated++;
  }

  // Summarize distribution
  const { rows: dist } = await pool.query(`
    SELECT severity_color, COUNT(*) as cnt
    FROM stop_incident_summary
    GROUP BY severity_color
    ORDER BY cnt DESC
  `);

  console.log(`\nUpdated ${updated} stops. Distribution:`);
  for (const r of dist) {
    console.log(`  ${r.severity_color}: ${r.cnt}`);
  }

  await closePool();
  console.log('\nStop summary computation complete.');
}

run().catch(err => {
  console.error('compute_stop_summary failed:', err.message);
  process.exit(1);
});
