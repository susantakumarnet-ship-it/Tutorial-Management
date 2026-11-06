import type { Db } from '../db/pool';
import { pool } from '../db/pool';
import { logger } from '../utils/logger';

export type NotificationType =
  | 'APPLICATION_RECEIVED'
  | 'APPLICATION_ACCEPTED'
  | 'APPLICATION_REJECTED'
  | 'TUITION_REQUEST_RECEIVED'
  | 'TUTOR_APPROVED'
  | 'TUTOR_REJECTED'
  | 'ANNOUNCEMENT';

export interface PushSender {
  send(fcmToken: string, title: string, body: string, data: Record<string, string>): Promise<void>;
}

/** Placeholder push sender. Replaced by the Firebase Cloud Messaging sender in the notifications module. */
let pushSender: PushSender = {
  async send(_token, title) {
    logger.debug({ title }, '[PUSH] (FCM not configured)');
  },
};

export function setPushSender(sender: PushSender) {
  pushSender = sender;
}

/**
 * Stores an in-app notification and fires a push message (best effort - push failures never break the
 * calling request). Pass a transaction client to make the stored notification part of the caller's transaction.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string> = {},
  db: Db = pool,
) {
  await db.query('INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)', [
    userId,
    type,
    title,
    body,
    JSON.stringify({ ...data, type }),
  ]);
  void (async () => {
    try {
      const { rows } = await pool.query<{ fcm_token: string | null }>('SELECT fcm_token FROM users WHERE id = $1', [userId]);
      const token = rows[0]?.fcm_token;
      if (token) await pushSender.send(token, title, body, { ...data, type });
    } catch (err) {
      logger.warn({ err, userId }, 'Push notification failed');
    }
  })();
}
