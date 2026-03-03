/**
 * process-csvs.js
 *
 * Standalone pipeline: reads the 3 Berkeley CSV files and outputs
 * pre-computed static JSON files for the frontend.
 *
 * Inputs (DATA_DIR, default: data-pipeline/data/):
 *   berkeleyuniquestops.csv   — AC Transit stops
 *   collisiondata.csv         — Traffic collisions (EPSG:3857 x/y)
 *
 * Outputs (apps/web/public/data/):
 *   stops.json          — stops with lat/lon + collision severity + ZIP
 *   stop-details.json   — per-stop collision list (within radius) w/ lat/lon
 *   clusters.json       — 6 k-means clusters with dominant collision category
 *   data-quality.json   — row counts, dropped counts, processing time
 */

import { createReadStream } from 'fs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────
const DATA_DIR   = process.env.DATA_DIR  ?? join(__dirname, '..', 'data');
const OUT_DIR    = process.env.OUT_DIR   ?? join(__dirname, '..', '..', 'apps', 'web', 'public', 'data');
const RADIUS_MI  = parseFloat(process.env.RADIUS_MI  ?? '0.05');
const K_CLUSTERS = parseInt(process.env.K_CLUSTERS ?? '6', 10);

// Column name mappings (resilient to slight differences)
const COL = {
  stops: {
    id:   ['stp_identi', 'stop_id', 'STOP_ID'],
    name: ['stp_descri', 'stop_name', 'STOP_NAME'],
    lat:  ['latitude',   'lat',      'LAT'],
    lon:  ['longitude',  'lon',      'LON'],
    route:['route',      'routes',   'ROUTE'],
  },
  collisions: {
    id:       ['ObjectId', 'objectid', 'OBJECTID'],
    datetime: ['DateTime', 'datetime', 'DATETIME'],
    location: ['Accident Location', 'accident_location', 'ACCIDENT_LOCATION'],
    category: ['PCF Category',      'pcf_category',      'PCF_CATEGORY'],
    desc:     ['PCF Description',   'pcf_description',   'PCF_DESCRIPTION'],
    severity: ['Injury Severity',   'injury_severity',   'INJURY_SEVERITY'],
    involved: ['Involved Objects',  'involved_objects',  'INVOLVED_OBJECTS'],
    x:        ['x', 'X'],
    y:        ['y', 'Y'],
  },
};

// ── Berkeley ZIP code bounding boxes ───────────────────────────────────────
const ZIP_BOUNDS = {
  '94701': { latMin: 37.848, latMax: 37.880, lonMin: -122.320, lonMax: -122.283 },
  '94702': { latMin: 37.848, latMax: 37.875, lonMin: -122.295, lonMax: -122.260 },
  '94703': { latMin: 37.853, latMax: 37.880, lonMin: -122.285, lonMax: -122.253 },
  '94704': { latMin: 37.849, latMax: 37.872, lonMin: -122.272, lonMax: -122.238 },
  '94705': { latMin: 37.840, latMax: 37.870, lonMin: -122.262, lonMax: -122.225 },
  '94706': { latMin: 37.880, latMax: 37.925, lonMin: -122.325, lonMax: -122.275 },
  '94707': { latMin: 37.878, latMax: 37.915, lonMin: -122.295, lonMax: -122.258 },
  '94708': { latMin: 37.870, latMax: 37.915, lonMin: -122.278, lonMax: -122.232 },
  '94709': { latMin: 37.866, latMax: 37.898, lonMin: -122.290, lonMax: -122.253 },
  '94710': { latMin: 37.853, latMax: 37.887, lonMin: -122.325, lonMax: -122.290 },
  '94712': { latMin: 37.858, latMax: 37.888, lonMin: -122.292, lonMax: -122.258 },
  '94720': { latMin: 37.864, latMax: 37.887, lonMin: -122.278, lonMax: -122.248 },
};

// ── Utilities ────────────────────────────────────────────────────────────────

/** Find a column value by trying multiple possible header names. */
function getCol(row, candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== '') return row[c];
  }
  return null;
}

/** Web Mercator (EPSG:3857) → WGS84 */
function webMercatorToWGS84(x, y) {
  const lon = (x / 20037508.34) * 180;
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
  return { lat, lon };
}

/** Haversine distance in miles */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Determine Berkeley ZIP code for a lat/lon point */
function getZip(lat, lon) {
  for (const [zip, b] of Object.entries(ZIP_BOUNDS)) {
    if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) {
      return zip;
    }
  }
  return null;
}

/** Fixed count-based severity color (matches legend labels) */
function collisionSeverityColor(count) {
  if (count === 0)  return 'GRAY';
  if (count <= 6)   return 'GREEN';
  if (count <= 12)  return 'YELLOW';
  if (count <= 20)  return 'ORANGE';
  return 'RED';
}

// ── K-means clustering ────────────────────────────────────────────────────────

function kmeans(points, k, maxIterations = 150) {
  const shuffle = [...points];
  for (let i = shuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffle[i], shuffle[j]] = [shuffle[j], shuffle[i]];
  }
  let centroids = shuffle.slice(0, k).map(p => ({ lat: p.lat, lon: p.lon }));
  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d =
          (points[i].lat - centroids[c].lat) ** 2 +
          (points[i].lon - centroids[c].lon) ** 2;
        if (d < bestDist) { bestDist = d; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed && iter > 0) break;

    const sums = Array.from({ length: k }, () => ({ lat: 0, lon: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c].lat += points[i].lat;
      sums[c].lon += points[i].lon;
      sums[c].n++;
    }
    centroids = sums.map((s, c) =>
      s.n > 0 ? { lat: s.lat / s.n, lon: s.lon / s.n } : centroids[c]
    );
  }
  return { centroids, assignments };
}

function stableKmeans(points, k, runs = 5) {
  let best = null, bestInertia = Infinity;
  for (let r = 0; r < runs; r++) {
    const result = kmeans(points, k);
    let inertia = 0;
    for (let i = 0; i < points.length; i++) {
      const c = result.centroids[result.assignments[i]];
      inertia += (points[i].lat - c.lat) ** 2 + (points[i].lon - c.lon) ** 2;
    }
    if (inertia < bestInertia) { bestInertia = inertia; best = result; }
  }
  return best;
}

// ── CSV reading ───────────────────────────────────────────────────────────────

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(parse({
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
      }))
      .on('data', row => rows.push(row))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });
}

function write(filename, data) {
  const path = join(OUT_DIR, filename);
  const json = JSON.stringify(data);
  writeFileSync(path, json);
  console.log(`  ✓ ${filename}  (${(Buffer.byteLength(json) / 1024).toFixed(0)} KB)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  mkdirSync(OUT_DIR, { recursive: true });

  const ROOT = resolve(__dirname, '..', '..');
  function csvPath(name) {
    const candidates = [join(DATA_DIR, name), join(ROOT, name)];
    for (const p of candidates) {
      if (existsSync(p)) { console.log(`  Found: ${p}`); return p; }
    }
    throw new Error(`CSV not found: ${name}\nLooked in:\n  ${candidates.join('\n  ')}`);
  }

  // ── 1. STOPS ──────────────────────────────────────────────────────────────
  console.log('\n📍 Processing stops…');
  const rawStops = await readCSV(csvPath('berkeleyuniquestops.csv'));
  const stops = [];
  let stopsDropped = 0;
  let stopsDuplicate = 0;
  const seenStopIds   = new Set();
  const seenCoordKeys = new Set();

  for (const row of rawStops) {
    const lat = parseFloat(getCol(row, COL.stops.lat));
    const lon = parseFloat(getCol(row, COL.stops.lon));
    if (!isFinite(lat) || !isFinite(lon)) { stopsDropped++; continue; }

    const stop_id  = getCol(row, COL.stops.id) ?? String(row.OBJECTID ?? (stops.length + stopsDuplicate));
    // Round to ~11m precision to catch co-located stops
    const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;

    if (seenStopIds.has(stop_id) || seenCoordKeys.has(coordKey)) {
      stopsDuplicate++;
      continue;
    }
    seenStopIds.add(stop_id);
    seenCoordKeys.add(coordKey);

    stops.push({
      stop_id,
      stop_name: getCol(row, COL.stops.name) ?? 'Unknown Stop',
      lat, lon,
      route: getCol(row, COL.stops.route) ?? '',
      zip:              null,
      collision_count:  0,
      collision_severity: 'GRAY',
      cluster_id:       null,
    });
  }
  console.log(`  Loaded: ${stops.length}  Dropped (no coords): ${stopsDropped}  Duplicates removed: ${stopsDuplicate}`);

  // ── 2. COLLISIONS ─────────────────────────────────────────────────────────
  console.log('\n🚗 Processing collisions…');
  const rawCollisions = await readCSV(csvPath('collisiondata.csv'));

  const collisions = [];
  let collDropped = 0;

  for (const row of rawCollisions) {
    const x = parseFloat(getCol(row, COL.collisions.x));
    const y = parseFloat(getCol(row, COL.collisions.y));
    if (!isFinite(x) || !isFinite(y)) { collDropped++; continue; }

    const { lat, lon } = webMercatorToWGS84(x, y);
    if (lat < 37.5 || lat > 38.2 || lon < -122.6 || lon > -122.0) {
      collDropped++;
      continue;
    }

    const rawDt = getCol(row, COL.collisions.datetime) ?? '';
    let datetime = null;
    try { datetime = new Date(rawDt).toISOString(); } catch(_) {}

    collisions.push({
      id:          String(getCol(row, COL.collisions.id) ?? collisions.length + 1),
      datetime,
      category:    getCol(row, COL.collisions.category) ?? 'Unknown',
      description: getCol(row, COL.collisions.desc) ?? '',
      location:    getCol(row, COL.collisions.location) ?? '',
      severity:    getCol(row, COL.collisions.severity) ?? '',
      involved:    getCol(row, COL.collisions.involved) ?? '',
      lat, lon,
    });
  }
  console.log(`  Loaded: ${collisions.length}  Dropped (no/bad coords): ${collDropped}`);

  // ── 3. SPATIAL JOIN: stops ↔ collisions ───────────────────────────────────
  console.log(`\n🔗 Spatial join: stops ↔ collisions (r = ${RADIUS_MI} mi)…`);

  for (const stop of stops) {
    stop.zip = getZip(stop.lat, stop.lon);
  }

  const stopDetails = {};
  for (const stop of stops) {
    stopDetails[stop.stop_id] = { collisions: [] };
  }

  for (const coll of collisions) {
    for (const stop of stops) {
      const d = haversine(stop.lat, stop.lon, coll.lat, coll.lon);
      if (d <= RADIUS_MI) {
        stopDetails[stop.stop_id].collisions.push({ ...coll, distance_mi: parseFloat(d.toFixed(3)) });
        stop.collision_count++;
      }
    }
  }
  console.log('  Done.');

  // Assign fixed-range severity colors based on raw collision_count
  for (const stop of stops) {
    stop.collision_severity = collisionSeverityColor(stop.collision_count);

    stopDetails[stop.stop_id].collisions.sort((a, b) =>
      (b.datetime ?? '').localeCompare(a.datetime ?? '')
    );
  }
  console.log('  Color distribution: ' +
    ['GRAY','GREEN','YELLOW','ORANGE','RED'].map(c =>
      `${c}=${stops.filter(s => s.collision_severity === c).length}`
    ).join(' ')
  );

  // ── 4. K-MEANS CLUSTERING ─────────────────────────────────────────────────
  console.log(`\n📊 K-means clustering (k=${K_CLUSTERS})…`);

  const clusterInput = stops.map(s => ({ lat: s.lat, lon: s.lon, stop_id: s.stop_id }));
  const { centroids, assignments } = stableKmeans(clusterInput, K_CLUSTERS);

  for (let i = 0; i < stops.length; i++) {
    stops[i].cluster_id = assignments[i];
  }

  const usedLabels = new Set();
  const clusters = centroids.map((centroid, ci) => {
    const memberStops = stops.filter((_, i) => assignments[i] === ci);

    let radiusMiles = 0.3;
    for (const s of memberStops) {
      const d = haversine(centroid.lat, centroid.lon, s.lat, s.lon);
      if (d + 0.15 > radiusMiles) radiusMiles = d + 0.15;
    }
    radiusMiles = Math.min(radiusMiles, 2.5);

    const clusterCollisions = collisions.filter(c =>
      haversine(centroid.lat, centroid.lon, c.lat, c.lon) <= radiusMiles
    );

    const catCounts = {};
    for (const c of clusterCollisions) {
      catCounts[c.category] = (catCounts[c.category] ?? 0) + 1;
    }

    const topCategories = Object.entries(catCounts)
      .map(([category, count]) => ({ category, count, source: 'COLLISION' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const dominantCategory = topCategories[0]?.category ?? 'Unknown';
    const memberZips = [...new Set(memberStops.map(s => s.zip).filter(Boolean))];
    const label = clusterLabel(centroid.lat, centroid.lon, ci, usedLabels);

    return {
      id: ci,
      label,
      centroid,
      radius_miles:       parseFloat(radiusMiles.toFixed(2)),
      dominant_category:  dominantCategory,
      top_categories:     topCategories,
      total_collisions:   clusterCollisions.length,
      stop_count:         memberStops.length,
      member_zips:        memberZips,
    };
  });

  console.log('  Clusters:');
  clusters.forEach(c =>
    console.log(`    Cluster ${c.id} "${c.label}": ${c.stop_count} stops, ` +
      `${c.total_collisions} collisions, dominant="${c.dominant_category}"`)
  );

  // ── 5. OUTPUT ─────────────────────────────────────────────────────────────
  console.log('\n💾 Writing output files…');

  write('stops.json', {
    generated_at: new Date().toISOString(),
    stops: stops.map(s => ({
      stop_id:            s.stop_id,
      stop_name:          s.stop_name,
      lat:                s.lat,
      lon:                s.lon,
      route:              s.route,
      zip:                s.zip,
      cluster_id:         s.cluster_id,
      collision_count:    s.collision_count,
      collision_severity: s.collision_severity,
    })),
  });

  write('stop-details.json', stopDetails);
  write('clusters.json', { clusters });

  const elapsed = Date.now() - t0;
  write('data-quality.json', {
    generated_at:       new Date().toISOString(),
    processing_time_ms: elapsed,
    radius_miles:       RADIUS_MI,
    k_clusters:         K_CLUSTERS,
    stops: {
      total_in_csv:      rawStops.length,
      loaded:            stops.length,
      dropped_no_coords: stopsDropped,
    },
    collisions: {
      total_in_csv:      rawCollisions.length,
      loaded:            collisions.length,
      dropped_no_coords: collDropped,
      note: 'x/y converted from EPSG:3857 (Web Mercator) to WGS84.',
    },
  });

  console.log(`\n✅ Done in ${(elapsed / 1000).toFixed(1)}s. Files written to:\n  ${OUT_DIR}`);
}

/** Rough neighborhood label based on centroid position in Berkeley */
function clusterLabel(lat, lon, id, usedLabels) {
  const CANDIDATES = [
    { test: () => lon < -122.300,                  label: 'West Berkeley'     },
    { test: () => lat > 37.893,                    label: 'North Berkeley'    },
    { test: () => lat < 37.856 && lon > -122.285,  label: 'South Berkeley'   },
    { test: () => lat < 37.856,                    label: 'SW Berkeley'       },
    { test: () => lon > -122.255,                  label: 'Elmwood / Hills'   },
    { test: () => lat > 37.875 && lon < -122.268,  label: 'Downtown / Center' },
    { test: () => lat > 37.870,                    label: 'UC / Northside'    },
    { test: () => true,                            label: 'Central Berkeley'  },
  ];

  for (const { test, label } of CANDIDATES) {
    if (test() && !usedLabels.has(label)) {
      usedLabels.add(label);
      return label;
    }
  }
  const fb = `Area ${id + 1}`;
  usedLabels.add(fb);
  return fb;
}

main().catch(err => {
  console.error('\n❌ Pipeline failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
