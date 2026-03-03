import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { boundaryRoutes } from './routes/boundary.js';
import { stopsRoutes } from './routes/stops.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
});

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? '*',
});

// Health check
app.get('/api/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// Routes
await app.register(boundaryRoutes);
await app.register(stopsRoutes);

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`\n🚌  Berkeley Stop Safety API running at http://localhost:${PORT}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
