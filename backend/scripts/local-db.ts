/**
 * Starts a real PostgreSQL 17 server for local development without installing Postgres or Docker.
 * Data persists in ./.pgdata. Leave this running in its own terminal; Ctrl+C stops it.
 *
 *   npm run db:local      -> postgres://postgres:postgres@localhost:5433/smart_tuition
 */
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
// Run via `npm run db:local` from the backend folder.
const dataDir = path.resolve(process.cwd(), '.pgdata');

async function main() {
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
  });
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) {
    await pg.createDatabase('smart_tuition');
    console.log('Created database smart_tuition');
  }
  console.log(`PostgreSQL running: postgres://postgres:postgres@localhost:${PORT}/smart_tuition`);
  console.log('Press Ctrl+C to stop.');

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
