/**
 * ingest_calls_for_service.js
 *
 * Downloads Berkeley PD Calls for Service from the Berkeley PD ArcGIS
 * FeatureServer (2019–present, updated daily) and ingests records into
 * the incidents table.
 *
 * Service: Calls For Service Complete Public
 * https://services7.arcgis.com/vIHhVXjE1ToSg0Fz/arcgis/rest/services/Calls_For_Service_Complete_Public/FeatureServer/0
 *
 * Field mapping:
 *   Incident_Number  → incident_id
 *   Call_Type        → category
 *   CreateDatetime   → occurred_at  (Unix ms)
 *   extra_str_1      → address      (block-level)
 *   lat / lon        → geom         (no geocoding needed)
 */
import 'dotenv/config';
import { getPool, closePool } from './db.js';

const ARCGIS_URL =
  'https://services7.arcgis.com/vIHhVXjE1ToSg0Fz/arcgis/rest/services' +
  '/Calls_For_Service_Complete_Public/FeatureServer/0/query';

// Berkeley city bounding box (south, west, north, east)
const BBOX_WHERE =
  "lat BETWEEN 37.84 AND 37.91 AND lon BETWEEN -122.32 AND -122.22";

const PAGE_SIZE = 1000;

async function fetchPage(offset) {
  const params = new URLSearchParams({
    where: BBOX_WHERE,
    outFields: 'Incident_Number,Call_Type,CreateDatetime,lat,lon,extra_str_1',
    f: 'json',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    orderByFields: 'ObjectId',
  });

  const res = await fetch(`${ARCGIS_URL}?${params}`, {
    headers: { 'User-Agent': 'BerkeleyBusSafetyMap/1.0' },
  });
  if (!res.ok) throw new Error(`ArcGIS returned ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(`ArcGIS error: ${data.error.message}`);

  return {
    features: data.features ?? [],
    hasMore: data.exceededTransferLimit === true,
  };
}

async function run() {
  const pool = getPool();

  console.log('Clearing existing Berkeley PD incidents…');
  await pool.query(`DELETE FROM incidents WHERE source = 'Berkeley PD'`);

  let offset = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  console.log('Ingesting calls for service from Berkeley PD ArcGIS (2019–present)…');

  while (true) {
    const { features, hasMore } = await fetchPage(offset);
    if (features.length === 0) break;

    for (const f of features) {
      const a = f.attributes;
      const incidentId = a.Incident_Number?.trim();
      if (!incidentId) continue;

      const category   = a.Call_Type   ?? null;
      const occurredAt = a.CreateDatetime != null
        ? new Date(a.CreateDatetime).toISOString()
        : null;
      const address    = a.extra_str_1  ?? null;
      const lat        = a.lat;
      const lon        = a.lon;

      const geomSql = (lat != null && lon != null)
        ? `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`
        : 'NULL';

      try {
        await pool.query(
          `INSERT INTO incidents
             (incident_id, incident_type, category, occurred_at, address, source, geom)
           VALUES ($1, 'CALLS_FOR_SERVICE', $2, $3, $4, 'Berkeley PD', ${geomSql})
           ON CONFLICT DO NOTHING`,
          [incidentId, category, occurredAt, address]
        );
        totalInserted++;
      } catch (err) {
        totalSkipped++;
        if (process.env.VERBOSE) console.warn('  Skip:', incidentId, err.message);
      }
    }

    console.log(`  Offset ${offset}: ${features.length} records (inserted so far: ${totalInserted})`);
    offset += features.length;

    if (!hasMore) break;
  }

  console.log(`\nDone. Inserted: ${totalInserted}, skipped: ${totalSkipped}`);
  await closePool();
}

run().catch(err => {
  console.error('ingest_calls_for_service failed:', err.message);
  process.exit(1);
});
