import { Pool, type PoolClient, type QueryResultRow, types } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// NUMERIC -> number (ratings), DATE -> 'YYYY-MM-DD' string, BIGINT (counts) -> number.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

pool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'));

/** Anything that can run a query: the pool or a transaction client. */
export type Db = Pick<PoolClient, 'query'>;

export function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

/** Runs `fn` inside a transaction, committing on success and rolling back on any error. */
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
