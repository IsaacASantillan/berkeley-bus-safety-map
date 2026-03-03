/**
 * ingest_calls_for_service.js
 *
 * Downloads Berkeley PD Calls for Service from the Socrata Open Data API
 * and ingests records into the incidents table.
 *
 * Dataset: https://data.cityofberkeley.info/Public-Safety/Calls-for-Service-2023-2024/k2nh-s5h5
 * Override dataset ID via: BERKELEY_CFS_DATASET_ID env var
 *
 * Records without coordinates are geocoded via Nominatim (rate-limited + cached).
 */
import 'dotenv/config';
import { getPool, closePool } from './db.js';

const DATASET_ID = process.env.BERKELEY_CFS_DATASET_ID || 'k2nh-s5h5';
const SOCRATA_BASE = 'https://data.cityofberkeley.info/resource';
const PAGE_SIZE = 1000;

const GEOCODE_DELAY_MS = 1100; // Nominatim: max 1 req/sec
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

async function geocodeAddress(pool, address) {
  // Check cache first
  const cached = await pool.query(
    'SELECT lat, lon, success FROM geocode_cache WHERE address = $1',
    [address]
  );
  if (cached.rows.length > 0) {
    const r = cached.rows[0];
    return r.success ? { lat: r.lat, lon: r.lon } : null;
  }

  await new Promise(r => setTimeout(r, GEOCODE_DELAY_MS));

  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(address + ', Berkeley, CA')}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BerkeleyBusSafetyMap/1.0 (contact@example.com)' },
    });
    const data = await res.json();

    if (data.length > 0) {
      const { lat, lon } = data[0];
      await pool.query(
        `INSERT INTO geocode_cache (address, lat, lon, success) VALUES ($1, $2, $3, true)
         ON CONFLICT (address) DO UPDATE SET lat=$2, lon=$3, success=true`,
        [address, parseFloat(lat), parseFloat(lon)]
      );
      return { lat: parseFloat(lat), lon: parseFloat(lon) };
    }
  } catch (_) {}

  await pool.query(
    `INSERT INTO geocode_cache (address, success) VALUES ($1, false)
     ON CONFLICT (address) DO UPDATE SET success=false`,
    [address]
  );
  return null;
}

async function run() {
  const pool = getPool();
  let offset = 0;
  let totalInserted = 0;
  let totalGeocoded = 0;
  let totalSkipped = 0;

  console.log(`Ingesting calls for service (dataset: ${DATASET_ID})…`);

  while (true) {
    const url = `${SOCRATA_BASE}/${DATASET_ID}.json?$limit=${PAGE_SIZE}&$offset=${offset}&$order=:id`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching CFS data: ${await res.text()}`);
    }

    const records = await res.json();
    if (records.length === 0) break;

    for (const r of records) {
      // Field names specific to Berkeley CFS dataset (k2nh-s5h5)
      const incidentId = r.caseno || r.incident_number || r.case_number || r.objectid?.toString() || `cfs-${offset}-${Math.random()}`;
      const category = r.cvlegend || r.offense || r.offense_description || r.call_type || null;
      const occurredAt = r.eventdt || r.incident_datetime || r.event_date || null;
      const address = r.blkaddr || r.incident_address || r.address || null;

      // Try to get coordinates — Berkeley dataset nests them in block_location object
      let lat = null;
      let lon = null;

      if (r.block_location?.latitude && r.block_location?.longitude) {
        lat = parseFloat(r.block_location.latitude);
        lon = parseFloat(r.block_location.longitude);
      } else if (r.latitude && r.longitude) {
        lat = parseFloat(r.latitude);
        lon = parseFloat(r.longitude);
      } else if (r.location?.coordinates) {
        [lon, lat] = r.location.coordinates;
      } else if (r.block_location_lat && r.block_location_long) {
        lat = parseFloat(r.block_location_lat);
        lon = parseFloat(r.block_location_long);
      }

      // Geocode if no coords
      if ((lat === null || lon === null) && address) {
        const coords = await geocodeAddress(pool, address);
        if (coords) {
          lat = coords.lat;
          lon = coords.lon;
          totalGeocoded++;
        }
      }

      const geomSql = (lat !== null && lon !== null)
        ? `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`
        : 'NULL';

      try {
        await pool.query(
          `INSERT INTO incidents
             (incident_id, incident_type, category, occurred_at, address, source, geom)
           VALUES ($1, 'CALLS_FOR_SERVICE', $2, $3, $4, 'Berkeley PD', ${geomSql})
           ON CONFLICT DO NOTHING`,
          [incidentId, category, occurredAt || null, address]
        );
        totalInserted++;
      } catch (err) {
        totalSkipped++;
        if (process.env.VERBOSE) console.warn('  Skip:', incidentId, err.message);
      }
    }

    console.log(`  Page offset=${offset}: processed ${records.length} records`);
    offset += PAGE_SIZE;

    if (records.length < PAGE_SIZE) break;
  }

  console.log(`\nDone. Inserted: ${totalInserted}, geocoded: ${totalGeocoded}, skipped: ${totalSkipped}`);
  await closePool();
}

run().catch(err => {
  console.error('ingest_calls_for_service failed:', err.message);
  process.exit(1);
});
