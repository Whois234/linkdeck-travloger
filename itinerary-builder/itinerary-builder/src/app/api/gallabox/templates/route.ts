/**
 * GET /api/gallabox/templates
 * Returns list of APPROVED WhatsApp templates from Gallabox.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listWhatsAppTemplates } from '@/lib/gallabox';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await listWhatsAppTemplates();
  return NextResponse.json({ ok: true, data: templates });
}
