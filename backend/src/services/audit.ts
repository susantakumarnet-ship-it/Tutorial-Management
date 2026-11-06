import type { Db } from '../db/pool';
import { pool } from '../db/pool';

export async function audit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
  db: Db = pool,
) {
  await db.query(
    'INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
    [adminId, action, targetType, targetId, JSON.stringify(details)],
  );
}
