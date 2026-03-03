/**
 * run_all.js
 *
 * Orchestrates the full data pipeline in order:
 *   1. Migrations
 *   2. Boundary ingestion
 *   3. GTFS stops ingestion
 *   4. Calls-for-service ingestion
 *   5. Stop summary computation
 *   6. Link refresh (GDELT)
 */
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function runScript(name) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`▶  ${name}`);
    console.log('═'.repeat(60));

    const child = spawn('node', [join(__dirname, name)], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', code => {
      if (code !== 0) reject(new Error(`${name} exited with code ${code}`));
      else resolve();
    });
  });
}

async function main() {
  const steps = [
    'run_migrations.js',
    'ingest_boundary.js',
    'ingest_gtfs_stops.js',
    'ingest_calls_for_service.js',
    'compute_stop_summary.js',
    'refresh_stop_links.js',
  ];

  for (const step of steps) {
    await runScript(step);
  }

  console.log('\n✅  Full pipeline complete!');
}

main().catch(err => {
  console.error('\n❌  Pipeline failed:', err.message);
  process.exit(1);
});
