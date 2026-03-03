/**
 * Runs all SQL migration files in order.
 * Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS patterns).
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPool, closePool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function run() {
  const pool = getPool();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
    console.log(`  ✓ ${file}`);
  }

  console.log('\nAll migrations complete.');
  await closePool();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
