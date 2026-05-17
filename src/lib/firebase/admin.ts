/**
 * Firebase Admin SDK — server only.
 * Singleton init: safe to import from multiple API routes.
 */
import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';
import { prisma } from '@/lib/prisma';

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set');
  }

  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/**
 * Sends a push notification to a single FCM token.
 * Returns true on success, false on failure.
 */
export async function sendNotification(
  token:  string,
  title:  string,
  body:   string,
  data?:  Record<string, string>,
): Promise<boolean> {
  try {
    await getAdminApp().messaging().send({
      token,
      notification: { title, body },
      data:         data ?? {},
      webpush: {
        notification: {
          icon:  '/travloger-logo-icon.jpeg',
          badge: '/travloger-logo-icon.jpeg',
          requireInteraction: false,
        },
        fcmOptions: { link: data?.url ?? '/' },
      },
    });
    return true;
  } catch (err) {
    console.error('[FCM] sendNotification error:', err);
    return false;
  }
}

/**
 * Sends a push notification to multiple FCM tokens (multicast).
 * Returns the list of tokens that FCM rejected as invalid/unregistered.
 */
export async function sendNotificationToMultiple(
  tokens:  string[],
  title:   string,
  body:    string,
  data?:   Record<string, string>,
): Promise<{ successCount: number; failedCount: number; invalidTokens: string[] }> {
  if (!tokens.length) return { successCount: 0, failedCount: 0, invalidTokens: [] };

  const messaging = getAdminApp().messaging();
  const invalidTokens: string[] = [];
  let successCount = 0;

  // sendEachForMulticast supports up to 500 tokens at once
  const BATCH = 500;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: { ...(data ?? {}), title, body },  // duplicate into data so SW can read even if notification block is stripped
        webpush: {
          headers: {
            Urgency: 'high',   // tells APNs/Safari Push Service to deliver immediately
            TTL:     '86400',  // keep in queue for up to 24h if device is offline
          },
          notification: {
            title,
            body,
            icon:  '/travloger-logo-icon.jpeg',
            badge: '/travloger-logo-icon.jpeg',
            requireInteraction: false,
            tag:   data?.url ?? 'travloger-notif',  // collapse duplicate notifications
          },
          fcmOptions: { link: data?.url ?? '/' },
        },
      });

      successCount += response.successCount;

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(batch[idx]);
          }
        }
      });
    } catch (err) {
      console.error('[FCM] sendEachForMulticast batch error:', err);
    }
  }

  return { successCount, failedCount: tokens.length - successCount, invalidTokens };
}

// ─── Smart send with rules ────────────────────────────────────────────────────

/**
 * Checks whether the current server time falls inside a quiet window.
 * Handles windows that span midnight (e.g. 22:00 → 08:00).
 *
 * @param nowMinutes   Current time in minutes since midnight (in the target TZ)
 * @param startStr     "HH:mm" quiet-start
 * @param endStr       "HH:mm" quiet-end
 */
function isQuietNow(nowMinutes: number, startStr: string, endStr: string): boolean {
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;

  if (start <= end) {
    // same-day window (e.g. 01:00 → 06:00)
    return nowMinutes >= start && nowMinutes < end;
  } else {
    // midnight-spanning window (e.g. 22:00 → 08:00)
    return nowMinutes >= start || nowMinutes < end;
  }
}

function localMinutesInTZ(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour:   'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(new Date());

    const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + m;
  } catch {
    return new Date().getHours() * 60 + new Date().getMinutes();
  }
}

// ─── Module-level caches (survive warm lambda restarts) ──────────────────────

type CachedSettings = {
  event_type: string; enabled: boolean; recipient_rule: string;
  quiet_hours_mode: string; quiet_start: string | null;
  quiet_end: string | null; quiet_timezone: string;
};

let _settingsCache: CachedSettings[] | null = null;
let _settingsCacheExpiry = 0;

async function getCachedSettings(): Promise<CachedSettings[]> {
  if (_settingsCache && Date.now() < _settingsCacheExpiry) return _settingsCache;
  // Guard: if table doesn't exist yet (pre-migration), return [] so callers
  // skip gracefully instead of hammering the DB with failing queries.
  const rows = await (prisma.notificationSettings.findMany() as Promise<CachedSettings[]>).catch(() => [] as CachedSettings[]);
  _settingsCache = rows;
  // On error (empty result from catch), use a short 5s TTL so we retry soon
  // but don't hammer the DB on every request.
  _settingsCacheExpiry = Date.now() + (rows.length === 0 ? 5_000 : 60_000);
  return _settingsCache;
}

let _adminIdsCache: string[] | null = null;
let _adminIdsCacheExpiry = 0;

async function getCachedAdminIds(): Promise<string[]> {
  if (_adminIdsCache && Date.now() < _adminIdsCacheExpiry) return _adminIdsCache;
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: true },
    select: { id: true },
  });
  _adminIdsCache = admins.map(a => a.id);
  _adminIdsCacheExpiry = Date.now() + 60_000;
  return _adminIdsCache;
}

/**
 * Resolve a recipient_rule to concrete user IDs.
 * Uses cached admin list so repeated calls don't hit the DB.
 */
export async function getRecipientUserIds(
  rule: string,
  assigneeId: string | null,
): Promise<string[]> {
  const ids = new Set<string>();

  if ((rule === 'assignee' || rule === 'both') && assigneeId) {
    ids.add(assigneeId);
  }

  if (rule === 'all_admins' || rule === 'both') {
    const adminIds = await getCachedAdminIds();
    adminIds.forEach(id => ids.add(id));
  }

  return Array.from(ids);
}

/**
 * High-level send function that:
 *   1. Checks global NotificationSettings (enabled, recipient_rule, quiet hours)
 *   2. Checks per-user UserNotificationPreferences
 *   3. Fetches UserDevice FCM tokens
 *   4. Sends the notification
 *   5. Cleans invalid tokens from DB
 *   6. Writes a NotificationLog row
 *
 * Never throws — all errors are caught and logged.
 *
 * @param assigneeId   The "primary" user involved (e.g. lead assignee). May be null.
 * @param eventType    One of: 'new_lead' | 'customer_reply' | 'quote_viewed' | 'stage_changed' | 'test'
 * @param title        Notification title
 * @param body         Notification body
 * @param data         Optional click URL and other data
 */
export async function sendNotificationToUserWithRules(
  assigneeId: string | null,
  eventType:  string,
  title:      string,
  body:       string,
  data?:      Record<string, string>,
): Promise<void> {
  const _fnStart = Date.now();
  console.log('[NOTIF TIMING] fn_start', new Date().toISOString(), '| eventType:', eventType, '| assigneeId:', assigneeId);

  try {
    // ── BATCH 1: settings (cached) + admin IDs (cached) in parallel ──────────
    const [allSettings, adminIds] = await Promise.all([
      getCachedSettings(),
      getCachedAdminIds(),
    ]);
    const settings = allSettings.find(s => s.event_type === eventType) ?? null;
    console.log('[NOTIF TIMING] after_settings+admins_fetch', `+${Date.now() - _fnStart}ms`,
      '| cached_settings:', _settingsCacheExpiry > Date.now() + 59_000 ? 'MISS' : 'HIT',
      '| enabled:', settings?.enabled ?? '(no row=default enabled)',
      '| rule:', settings?.recipient_rule ?? 'assignee',
      '| adminCount:', adminIds.length);

    if (settings && !settings.enabled) {
      await prisma.notificationLog.create({
        data: { user_id: assigneeId ?? 'system', event_type: eventType, title, body, status: 'skipped_disabled', meta: { reason: 'global setting disabled' } },
      }).catch(() => {});
      console.log('[NOTIF TIMING] exit_disabled', `+${Date.now() - _fnStart}ms`);
      return;
    }

    const recipientRule  = settings?.recipient_rule   ?? 'assignee';
    const quietHoursMode = settings?.quiet_hours_mode ?? 'none';

    // Resolve recipients using already-fetched admin list (no extra DB call)
    const ids = new Set<string>();
    if ((recipientRule === 'assignee' || recipientRule === 'both') && assigneeId) ids.add(assigneeId);
    if (recipientRule === 'all_admins' || recipientRule === 'both') adminIds.forEach(id => ids.add(id));
    const userIds = Array.from(ids);
    console.log('[NOTIF TIMING] recipients_resolved', `+${Date.now() - _fnStart}ms`, '| count:', userIds.length, '| rule:', recipientRule);

    if (!userIds.length) {
      await prisma.notificationLog.create({
        data: { user_id: assigneeId ?? 'system', event_type: eventType, title, body, status: 'skipped_no_devices', meta: { reason: 'no recipients resolved' } },
      }).catch(() => {});
      console.log('[NOTIF TIMING] exit_no_recipients', `+${Date.now() - _fnStart}ms`);
      return;
    }

    // ── BATCH 2: prefs + devices for ALL recipients in parallel ──────────────
    const [allPrefs, allDevices] = await Promise.all([
      prisma.userNotificationPreferences.findMany({ where: { user_id: { in: userIds } } }).catch(() => []),
      prisma.userDevice.findMany({
        where:  { user_id: { in: userIds } },
        select: { user_id: true, fcm_token: true },
      }).catch(() => []),
    ]);
    console.log('[NOTIF TIMING] after_prefs+devices_fetch', `+${Date.now() - _fnStart}ms`,
      '| prefsRows:', allPrefs.length, '| deviceRows:', allDevices.length);

    // Build lookup maps — O(1) per user from here on
    const prefsByUser = Object.fromEntries(allPrefs.map(p => [p.user_id, p]));
    const devicesByUser: Record<string, string[]> = {};
    for (const d of allDevices) {
      (devicesByUser[d.user_id] ??= []).push(d.fcm_token);
    }

    // ── Process each recipient — all data already in memory, no more DB per user
    const allInvalidTokens: string[] = [];

    for (const userId of userIds) {
      const _userStart = Date.now();
      const prefs   = prefsByUser[userId] ?? null;
      const tokens  = devicesByUser[userId] ?? [];

      // Check user pref opt-out
      if (prefs) {
        const prefKey = eventType as keyof typeof prefs;
        if (prefKey in prefs && prefs[prefKey] === false) {
          await prisma.notificationLog.create({
            data: { user_id: userId, event_type: eventType, title, body, status: 'skipped_disabled', meta: { reason: 'user pref disabled' } },
          }).catch(() => {});
          console.log('[NOTIF TIMING] skip_user_pref', `+${Date.now() - _fnStart}ms`, '| userId:', userId);
          continue;
        }
      }

      // Check quiet hours
      if (quietHoursMode === 'global' && settings?.quiet_start && settings?.quiet_end) {
        const tz = settings.quiet_timezone ?? 'Asia/Kolkata';
        if (isQuietNow(localMinutesInTZ(tz), settings.quiet_start, settings.quiet_end)) {
          await prisma.notificationLog.create({
            data: { user_id: userId, event_type: eventType, title, body, status: 'skipped_quiet', meta: { reason: 'global quiet hours', tz } },
          }).catch(() => {});
          console.log('[NOTIF TIMING] skip_quiet_global', `+${Date.now() - _fnStart}ms`, '| userId:', userId);
          continue;
        }
      } else if (quietHoursMode === 'per_user' && prefs?.quiet_start && prefs?.quiet_end) {
        const tz = prefs.timezone ?? 'Asia/Kolkata';
        if (isQuietNow(localMinutesInTZ(tz), prefs.quiet_start, prefs.quiet_end)) {
          await prisma.notificationLog.create({
            data: { user_id: userId, event_type: eventType, title, body, status: 'skipped_quiet', meta: { reason: 'user quiet hours', tz } },
          }).catch(() => {});
          console.log('[NOTIF TIMING] skip_quiet_user', `+${Date.now() - _fnStart}ms`, '| userId:', userId);
          continue;
        }
      }

      // No devices
      if (!tokens.length) {
        await prisma.notificationLog.create({
          data: { user_id: userId, event_type: eventType, title, body, status: 'skipped_no_devices', meta: { reason: 'no registered devices' } },
        }).catch(() => {});
        console.log('[NOTIF TIMING] skip_no_devices', `+${Date.now() - _fnStart}ms`, '| userId:', userId);
        continue;
      }

      // Send
      console.log('[NOTIF TIMING] before_fcm_send', `+${Date.now() - _fnStart}ms`, '| userId:', userId, '| tokenCount:', tokens.length);
      const _fcmStart = Date.now();
      const result = await sendNotificationToMultiple(tokens, title, body, data);
      console.log('[NOTIF TIMING] after_fcm_send', `+${Date.now() - _fnStart}ms`,
        '| fcm_duration:', `${Date.now() - _fcmStart}ms`,
        '| sent:', result.successCount, '| failed:', result.failedCount,
        '| invalidTokens:', result.invalidTokens.length);
      allInvalidTokens.push(...result.invalidTokens);

      const status = result.successCount > 0 ? 'sent' : 'failed';
      const _logStart = Date.now();
      await prisma.notificationLog.create({
        data: {
          user_id: userId, event_type: eventType, title, body, status,
          meta: { sent: result.successCount, failed: result.failedCount, total: tokens.length },
        },
      }).catch(() => {});
      console.log('[NOTIF TIMING] after_log_insert', `+${Date.now() - _fnStart}ms`,
        '| log_duration:', `${Date.now() - _logStart}ms`, '| status:', status,
        '| user_total:', `${Date.now() - _userStart}ms`);
    }

    // Clean up invalid tokens
    if (allInvalidTokens.length) {
      await prisma.userDevice.deleteMany({ where: { fcm_token: { in: allInvalidTokens } } }).catch(() => {});
      console.log('[NOTIF TIMING] cleaned_invalid_tokens:', allInvalidTokens.length);
    }

    console.log('[NOTIF TIMING] fn_complete', `+${Date.now() - _fnStart}ms`, '| eventType:', eventType);
  } catch (err) {
    console.error('[NOTIF TIMING] fn_error', `+${Date.now() - _fnStart}ms`, '| eventType:', eventType, '| err:', err);
    console.error('[FCM] sendNotificationToUserWithRules error:', err);
  }
}
