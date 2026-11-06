import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { runMigrations } from '../src/db/migrator';

const PORT = 5434;

/** Boots a throw-away PostgreSQL instance, applies all migrations, and tears it down after the run. */
export default async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-tuition-pg-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('smart_tuition_test');
  await runMigrations(`postgres://postgres:postgres@localhost:${PORT}/smart_tuition_test`, () => {});

  return async () => {
    await pg.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
