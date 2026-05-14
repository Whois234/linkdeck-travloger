/**
 * GET /api/gallabox/test
 * Admin-only diagnostic — tests Gallabox API credentials and shows raw responses.
 * Remove this route once credentials are confirmed working.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const BASE_URL   = 'https://server.gallabox.com/devapi';
const API_KEY    = process.env.GALLABOX_API_KEY    ?? '';
const API_SECRET = process.env.GALLABOX_API_SECRET ?? '';
const CHANNEL_ID = process.env.GALLABOX_CHANNEL_ID ?? '';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: Record<string, unknown> = {
    env: {
      GALLABOX_API_KEY:    API_KEY    ? `SET (${API_KEY.length} chars, starts: ${API_KEY.slice(0, 6)}…)` : 'EMPTY ❌',
      GALLABOX_API_SECRET: API_SECRET ? `SET (${API_SECRET.length} chars, starts: ${API_SECRET.slice(0, 6)}…)` : 'EMPTY ❌',
      GALLABOX_CHANNEL_ID: CHANNEL_ID ? `SET = ${CHANNEL_ID}` : 'EMPTY ❌',
    },
  };

  const hdrs = {
    'Content-Type': 'application/json',
    'apiKey':       API_KEY,
    'apiSecret':    API_SECRET,
  };

  // Test 1: list templates
  try {
    const r = await fetch(`${BASE_URL}/whatsappTemplates`, { headers: hdrs, cache: 'no-store' });
    const body = await r.text();
    results.templatesTest = {
      status:    r.status,
      ok:        r.ok,
      bodySlice: body.slice(0, 300),
    };
  } catch (e) {
    results.templatesTest = { error: String(e) };
  }

  // Test 2: send a dummy dry-run (will fail if creds wrong — we just want the status code)
  try {
    const r = await fetch(`${BASE_URL}/messages/whatsapp`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        channelId:   CHANNEL_ID,
        channelType: 'whatsapp',
        recipient:   { phone: '919391203737', name: 'Test' },
        whatsapp:    { type: 'text', text: { body: '__credential_test__' } },
      }),
    });
    const body = await r.text();
    results.sendTest = {
      status:    r.status,
      ok:        r.ok,
      bodySlice: body.slice(0, 300),
    };
  } catch (e) {
    results.sendTest = { error: String(e) };
  }

  return NextResponse.json(results, { status: 200 });
}
