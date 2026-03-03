/**
 * ingest_boundary.js
 *
 * Fetches the Berkeley city boundary polygon and inserts it into city_boundary.
 *
 * Strategy (tries in order):
 *   1. Overpass API — POST request, retrieves OSM relation for Berkeley city
 *   2. Hardcoded fallback — simplified Berkeley city limits (from TIGER/USGS public domain data)
 */
import 'dotenv/config';
import { getPool, closePool } from './db.js';

// ── Overpass API ───────────────────────────────────────────────────────────────
// Fetches the administrative boundary relation for Berkeley, CA (OSM relation 112681)
async function fetchOverpass() {
  console.log('  Trying Overpass API (OpenStreetMap)…');

  const query = `
    [out:json][timeout:30];
    relation(112681);
    out geom;
  `;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'BerkeleyBusSafetyMap/1.0',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    console.log(`  Overpass returned ${res.status}`);
    return null;
  }

  const data = await res.json();
  const relation = data.elements?.find(e => e.type === 'relation');
  if (!relation?.members) {
    console.log('  Overpass: no relation members found');
    return null;
  }

  // Build outer ring from way members
  const outerWays = relation.members
    .filter(m => m.type === 'way' && m.role === 'outer' && m.geometry);

  if (outerWays.length === 0) {
    console.log('  Overpass: no outer ways with geometry');
    return null;
  }

  // Assemble coordinates from all outer way geometries
  const coords = [];
  for (const way of outerWays) {
    for (const pt of way.geometry) {
      coords.push([pt.lon, pt.lat]);
    }
  }

  // Close the ring
  if (coords.length > 0 &&
      (coords[0][0] !== coords[coords.length - 1][0] ||
       coords[0][1] !== coords[coords.length - 1][1])) {
    coords.push(coords[0]);
  }

  if (coords.length < 4) return null;

  console.log(`  ✓ Overpass built boundary from ${coords.length} vertices`);
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [[coords]] },
      properties: { name: 'Berkeley' },
    }],
  };
}

// ── Hardcoded Berkeley boundary (TIGER/Line, public domain) ───────────────────
// Simplified city limits of Berkeley, CA — accurate enough for stop filtering.
function hardcodedBerkeley() {
  console.log('  Using hardcoded Berkeley city boundary (TIGER-derived)…');
  // Polygon ring in [lon, lat] order, counter-clockwise, closing point = first point
  const ring = [
    [-122.3195, 37.9060], [-122.3178, 37.9048], [-122.3158, 37.9035],
    [-122.3086, 37.9025], [-122.3020, 37.9016], [-122.2970, 37.9010],
    [-122.2900, 37.9014], [-122.2840, 37.9022], [-122.2780, 37.9033],
    [-122.2700, 37.9045], [-122.2620, 37.9050], [-122.2540, 37.9047],
    [-122.2460, 37.9040], [-122.2400, 37.9022], [-122.2350, 37.8990],
    [-122.2320, 37.8950], [-122.2310, 37.8900], [-122.2318, 37.8840],
    [-122.2330, 37.8800], [-122.2345, 37.8750], [-122.2355, 37.8700],
    [-122.2360, 37.8650], [-122.2350, 37.8600], [-122.2330, 37.8560],
    [-122.2400, 37.8530], [-122.2500, 37.8520], [-122.2600, 37.8518],
    [-122.2680, 37.8520], [-122.2750, 37.8524], [-122.2810, 37.8528],
    [-122.2870, 37.8532], [-122.2930, 37.8530], [-122.2990, 37.8520],
    [-122.3040, 37.8510], [-122.3080, 37.8498], [-122.3100, 37.8520],
    [-122.3110, 37.8560], [-122.3115, 37.8600], [-122.3118, 37.8650],
    [-122.3120, 37.8700], [-122.3130, 37.8750], [-122.3140, 37.8800],
    [-122.3150, 37.8850], [-122.3158, 37.8900], [-122.3165, 37.8950],
    [-122.3170, 37.9000], [-122.3185, 37.9035], [-122.3195, 37.9060],
  ];

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
      properties: { name: 'Berkeley' },
    }],
  };
}

// ── DB insert ──────────────────────────────────────────────────────────────────
async function insertBoundary(pool, geojson) {
  await pool.query('DELETE FROM city_boundary');

  for (const feature of geojson.features) {
    const name = feature.properties?.name || 'Berkeley';

    await pool.query(
      `INSERT INTO city_boundary (name, geom)
       VALUES ($1, ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)))`,
      [name, JSON.stringify(feature.geometry)]
    );
    console.log(`  Inserted boundary: ${name}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log('Fetching Berkeley city boundary…');

  let geojson = await fetchOverpass().catch(err => {
    console.log(`  Overpass error: ${err.message}`);
    return null;
  });

  if (!geojson) {
    geojson = hardcodedBerkeley();
  }

  const pool = getPool();
  await insertBoundary(pool, geojson);

  await pool.query(`
    UPDATE stops s
    SET in_city = EXISTS (
      SELECT 1 FROM city_boundary b
      WHERE ST_Contains(b.geom, s.geom)
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*) AS cnt FROM city_boundary');
  console.log(`  Total boundary features stored: ${rows[0].cnt}`);

  await closePool();
  console.log('Boundary ingestion complete.');
}

run().catch(err => {
  console.error('ingest_boundary failed:', err.message);
  process.exit(1);
});
