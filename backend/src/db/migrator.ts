import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

/** Applies every *.sql file in /migrations exactly once, in filename order, each in its own transaction. */
export async function runMigrations(databaseUrl: string, log: (m: string) => void = console.log) {
  // Works from src/ (tsx, vitest), dist/ (compiled) and when __dirname is unavailable (ESM loaders).
  const base = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '../..') : process.cwd();
  const dir = path.join(base, 'migrations');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
    );
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}
