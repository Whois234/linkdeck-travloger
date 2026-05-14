/**
 * GET  /api/v1/app-settings          — returns all settings (public values only; channel IDs are non-secret)
 * PATCH /api/v1/app-settings         — upsert one or more settings (ADMIN only)
 *
 * Env-var fallbacks: if gallabox_channel_id is not in DB, falls back to process.env.GALLABOX_CHANNEL_ID
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ENV_FALLBACKS: Record<string, string | undefined> = {
  gallabox_channel_id: process.env.GALLABOX_CHANNEL_ID,
  gallabox_api_key:    process.env.GALLABOX_API_KEY,
};

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.appSetting.findMany();
  const map: Record<string, string> = {};

  // Apply DB values
  for (const row of rows) map[row.key] = row.value;

  // Apply env-var fallbacks for keys not in DB
  for (const [key, envVal] of Object.entries(ENV_FALLBACKS)) {
    if (!map[key] && envVal) map[key] = envVal;
  }

  return NextResponse.json({ ok: true, data: map });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(user, UserRole.ADMIN)) {
    return NextResponse.json({ ok: false, error: 'Forbidden — Admin only' }, { status: 403 });
  }

  const body = await req.json() as Record<string, string>;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Body must be an object of key:value pairs' }, { status: 400 });
  }

  // Upsert each key
  const ops = Object.entries(body).map(([key, value]) =>
    prisma.appSetting.upsert({
      where:  { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    }),
  );
  await Promise.all(ops);

  return NextResponse.json({ ok: true });
}
