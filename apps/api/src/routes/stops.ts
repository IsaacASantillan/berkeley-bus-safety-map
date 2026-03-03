import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from '../db.js';

// ── GET /api/stops ─────────────────────────────────────────────────────────────
// Query params:
//   bbox       = minLon,minLat,maxLon,maxLat   (optional, filter by viewport)
//   q          = text search on stop_name       (optional)
//   minSeverity= GREEN|YELLOW|ORANGE|RED        (optional)
//   timeWindow = 12mo|3yr|all                  (optional)

const SEVERITY_ORDER = ['GRAY', 'GREEN', 'YELLOW', 'ORANGE', 'RED'] as const;

function severityIndex(s: string) {
  return SEVERITY_ORDER.indexOf(s as (typeof SEVERITY_ORDER)[number]);
}

interface StopsQuery {
  bbox?: string;
  q?: string;
  minSeverity?: string;
  timeWindow?: string;
}

export async function stopsRoutes(app: FastifyInstance) {
  // ── List stops ──────────────────────────────────────────────────────────────
  app.get(
    '/api/stops',
    async (req: FastifyRequest<{ Querystring: StopsQuery }>, reply) => {
      const pool = getPool();
      const { bbox, q, minSeverity, timeWindow } = req.query;

      const conditions: string[] = ['s.in_city = true'];
      const params: unknown[] = [];
      let paramIdx = 1;

      // Viewport bbox filter
      if (bbox) {
        const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
        if (!isNaN(minLon) && !isNaN(minLat) && !isNaN(maxLon) && !isNaN(maxLat)) {
          conditions.push(
            `s.geom && ST_MakeEnvelope($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, 4326)`
          );
          params.push(minLon, minLat, maxLon, maxLat);
          paramIdx += 4;
        }
      }

      // Text search
      if (q && q.trim()) {
        conditions.push(`s.stop_name ILIKE $${paramIdx}`);
        params.push(`%${q.trim()}%`);
        paramIdx++;
      }

      // Severity filter
      if (minSeverity && severityIndex(minSeverity) >= 0) {
        const minIdx = severityIndex(minSeverity);
        const allowedColors = SEVERITY_ORDER.slice(minIdx);
        conditions.push(
          `COALESCE(sis.severity_color, 'GRAY') = ANY($${paramIdx}::text[])`
        );
        params.push(allowedColors);
        paramIdx++;
      }

      // Time-window column selection
      const countCol =
        timeWindow === '12mo'
          ? 'COALESCE(sis.incident_count_last_12mo, 0)'
          : 'COALESCE(sis.incident_count_total, 0)';

      const sql = `
        SELECT
          s.stop_id,
          s.stop_name,
          s.stop_lat,
          s.stop_lon,
          ${countCol} AS incident_count,
          COALESCE(sis.incident_count_total, 0)    AS incident_count_total,
          COALESCE(sis.incident_count_last_12mo, 0) AS incident_count_last_12mo,
          COALESCE(sis.severity_color, 'GRAY')      AS severity_color
        FROM stops s
        LEFT JOIN stop_incident_summary sis USING (stop_id)
        WHERE ${conditions.join(' AND ')}
        ORDER BY s.stop_id
        LIMIT 2000
      `;

      const { rows } = await pool.query(sql, params);
      return reply.send({ stops: rows });
    }
  );

  // ── Stop detail ─────────────────────────────────────────────────────────────
  app.get(
    '/api/stops/:stopId',
    async (req: FastifyRequest<{ Params: { stopId: string }; Querystring: { page?: string } }>, reply) => {
      const pool = getPool();
      const { stopId } = req.params;
      const page = parseInt(req.query.page ?? '1', 10);
      const perPage = 20;
      const offset = (page - 1) * perPage;

      // Stop metadata + summary
      const stopRes = await pool.query(
        `SELECT
           s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
           COALESCE(sis.incident_count_total, 0)     AS incident_count_total,
           COALESCE(sis.incident_count_last_12mo, 0)  AS incident_count_last_12mo,
           COALESCE(sis.severity_color, 'GRAY')       AS severity_color,
           sis.updated_at
         FROM stops s
         LEFT JOIN stop_incident_summary sis USING (stop_id)
         WHERE s.stop_id = $1`,
        [stopId]
      );

      if (stopRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Stop not found' });
      }

      const stop = stopRes.rows[0];

      // Nearby incidents (paginated)
      const RADIUS_M = parseInt(process.env.INCIDENT_RADIUS_METERS ?? '50', 10);
      const incidentsRes = await pool.query(
        `SELECT
           i.incident_id,
           i.incident_type,
           i.category,
           i.occurred_at,
           i.address,
           i.source,
           i.source_url
         FROM incidents i
         JOIN stops s ON s.stop_id = $1
         WHERE i.geom IS NOT NULL
           AND ST_DWithin(s.geom::geography, i.geom::geography, $2)
         ORDER BY i.occurred_at DESC NULLS LAST
         LIMIT $3 OFFSET $4`,
        [stopId, RADIUS_M, perPage, offset]
      );

      // Related links
      const linksRes = await pool.query(
        `SELECT url, title, source, published_at, snippet
         FROM stop_links
         WHERE stop_id = $1
         ORDER BY published_at DESC NULLS LAST
         LIMIT 10`,
        [stopId]
      );

      return reply.send({
        ...stop,
        incidents: incidentsRes.rows,
        links: linksRes.rows,
      });
    }
  );

  // ── Admin: trigger refresh ──────────────────────────────────────────────────
  app.post('/api/admin/refresh', async (req, reply) => {
    const token = (req.headers['x-admin-token'] as string) ?? '';
    if (token !== process.env.ADMIN_TOKEN) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    // In production, queue a background job.
    // For MVP, we return a message telling user to run the pipeline script.
    return reply.send({
      message: 'To refresh data, run: pnpm pipeline:run from the repo root.',
    });
  });
}
