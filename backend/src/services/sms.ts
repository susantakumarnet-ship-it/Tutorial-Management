import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

/** Development sender: writes the message to the log instead of sending an SMS. */
class ConsoleSmsSender implements SmsSender {
  async send(phone: string, message: string) {
    logger.info({ phone }, `[SMS] ${message}`);
  }
}

/**
 * To go live, implement SmsSender for your provider (MSG91, Twilio, AWS SNS, ...) and select it here,
 * or use Firebase phone authentication on the device (see docs/FIREBASE_SETUP.md).
 */
function createSender(): SmsSender {
  switch (env.SMS_PROVIDER) {
    case 'console':
    default:
      return new ConsoleSmsSender();
  }
}

export const sms: SmsSender = createSender();
