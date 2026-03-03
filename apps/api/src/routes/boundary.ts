import type { FastifyInstance } from 'fastify';
import { getPool } from '../db.js';

export async function boundaryRoutes(app: FastifyInstance) {
  app.get('/api/boundary', async (_req, reply) => {
    const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        id,
        name,
        ST_AsGeoJSON(geom)::json AS geometry
      FROM city_boundary
    `);

    const featureCollection = {
      type: 'FeatureCollection',
      features: rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: { id: r.id, name: r.name },
      })),
    };

    return reply.send(featureCollection);
  });
}
