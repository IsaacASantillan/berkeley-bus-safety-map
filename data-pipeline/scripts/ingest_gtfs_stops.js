/**
 * ingest_gtfs_stops.js
 *
 * Loads AC Transit bus stops into the stops table.
 *
 * Strategy (tries in order):
 *   1. GTFS ZIP download from ACTRANSIT_GTFS_URL (if set and accessible)
 *   2. Overpass API — OSM bus stops tagged operator="AC Transit" in Berkeley bbox
 *   3. 511 SF Bay GTFS (if TRANSIT_511_API_KEY is set)
 */
import 'dotenv/config';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { parse } from 'csv-parse/sync';
import { getPool, closePool } from './db.js';
import yauzl from 'yauzl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = join(__dirname, '..', 'downloads');
const ZIP_PATH = join(DOWNLOADS_DIR, 'actransit_gtfs.zip');

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractStopsTxt(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.readEntry();
      zipfile.on('entry', entry => {
        if (entry.fileName === 'stops.txt') {
          zipfile.openReadStream(entry, (err2, stream) => {
            if (err2) return reject(err2);
            const chunks = [];
            stream.on('data', c => chunks.push(c));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            stream.on('error', reject);
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on('end', () => resolve(null));
      zipfile.on('error', reject);
    });
  });
}

function parseGtfsCsv(csv) {
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  return records
    .map(r => ({
      stop_id: r.stop_id,
      stop_name: r.stop_name || null,
      lat: parseFloat(r.stop_lat),
      lon: parseFloat(r.stop_lon),
    }))
    .filter(r => !isNaN(r.lat) && !isNaN(r.lon));
}

// ── Source 1: GTFS ZIP ─────────────────────────────────────────────────────────

async function fromGTFS() {
  const url = process.env.ACTRANSIT_GTFS_URL;
  if (!url) return null;

  console.log(`  Trying GTFS ZIP: ${url}`);
  if (!existsSync(DOWNLOADS_DIR)) mkdirSync(DOWNLOADS_DIR, { recursive: true });

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BerkeleyBusSafetyMap/1.0)',
    },
  });
  if (!res.ok) { console.log(`  GTFS returned ${res.status}`); return null; }

  await pipeline(res.body, createWriteStream(ZIP_PATH));
  const csv = await extractStopsTxt(ZIP_PATH);
  if (!csv) { console.log('  stops.txt not found in ZIP'); return null; }

  const stops = parseGtfsCsv(csv);
  console.log(`  ✓ GTFS: ${stops.length} stops parsed`);
  return stops;
}

// ── Source 2: Overpass API ─────────────────────────────────────────────────────
// Berkeley bounding box: south,west,north,east
const BBOX = '37.84,-122.32,37.91,-122.22';

async function fromOverpass() {
  console.log('  Trying Overpass API (OSM bus stops)…');

  const query = `[out:json][timeout:45];(node["highway"="bus_stop"](${BBOX});node["public_transport"="stop_position"]["operator"~"AC Transit",i](${BBOX}););out body;`;

  const body = new URLSearchParams({ data: query });

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'BerkeleyBusSafetyMap/1.0',
    },
    body: body.toString(),
  });

  if (!res.ok) { console.log(`  Overpass returned ${res.status}`); return null; }

  const data = await res.json();
  if (!data.elements?.length) { console.log('  Overpass: no elements'); return null; }

  const stops = data.elements
    .filter(e => e.type === 'node' && e.lat && e.lon)
    .map((e, i) => ({
      stop_id: `osm-${e.id}`,
      stop_name: e.tags?.name || e.tags?.['ref'] || null,
      lat: e.lat,
      lon: e.lon,
    }));

  console.log(`  ✓ Overpass: ${stops.length} bus stops found`);
  return stops;
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

async function upsertStops(pool, stops) {
  let inserted = 0;
  for (const s of stops) {
    await pool.query(
      `INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon, geom, in_city)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326), false)
       ON CONFLICT (stop_id) DO UPDATE
         SET stop_name = EXCLUDED.stop_name,
             stop_lat   = EXCLUDED.stop_lat,
             stop_lon   = EXCLUDED.stop_lon,
             geom       = EXCLUDED.geom`,
      [s.stop_id, s.stop_name, s.lat, s.lon]
    );
    inserted++;
  }
  return inserted;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('Loading AC Transit bus stops…');

  let stops = await fromGTFS().catch(err => { console.log(`  GTFS error: ${err.message}`); return null; });

  if (!stops) {
    stops = await fromOverpass().catch(err => { console.log(`  Overpass error: ${err.message}`); return null; });
  }

  if (!stops || stops.length === 0) {
    throw new Error(
      'Could not load bus stops from any source.\n' +
      'Set ACTRANSIT_GTFS_URL in data-pipeline/.env to a valid GTFS ZIP URL\n' +
      '(download from https://www.actransit.org/schedule-data or https://511.org)'
    );
  }

  const pool = getPool();
  const inserted = await upsertStops(pool, stops);
  console.log(`  Upserted: ${inserted} stops`);

  await pool.query(`
    UPDATE stops s
    SET in_city = EXISTS (
      SELECT 1 FROM city_boundary b
      WHERE ST_Contains(b.geom, s.geom)
    )
  `);

  const { rows } = await pool.query(`SELECT COUNT(*) AS cnt FROM stops WHERE in_city = true`);
  console.log(`  ${rows[0].cnt} stops are inside Berkeley`);

  await closePool();
  console.log('Stop ingestion complete.');
}

run().catch(err => {
  console.error('ingest_gtfs_stops failed:', err.message);
  process.exit(1);
});
