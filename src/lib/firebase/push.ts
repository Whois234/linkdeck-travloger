/**
 * push.ts — high-level helper used by API routes to send push notifications.
 *
 * sendPushToUser():
 *  1. Fetches all FCM tokens registered for that user
 *  2. Sends notification via Firebase Admin multicast
 *  3. Auto-removes tokens FCM marks as invalid/unregistered
 *
 * Always fire-and-forget (.catch(() => {})) from API routes — push failures
 * must never crash the main request.
 */
import { prisma } from '@/lib/prisma';
import { sendNotificationToMultiple } from './admin';

export async function sendPushToUser(
  userId:  string,
  title:   string,
  body:    string,
  data?:   Record<string, string>,
): Promise<void> {
  // 1. Look up registered device tokens for this user
  const devices = await prisma.userDevice.findMany({
    where:  { user_id: userId },
    select: { id: true, fcm_token: true },
  });

  if (!devices.length) return;

  const tokens = devices.map(d => d.fcm_token);

  // 2. Send multicast
  const { invalidTokens } = await sendNotificationToMultiple(tokens, title, body, data);

  // 3. Clean up invalid/unregistered tokens so we don't keep hitting them
  if (invalidTokens.length > 0) {
    await prisma.userDevice.deleteMany({
      where: { fcm_token: { in: invalidTokens } },
    }).catch(() => {});
  }
}
