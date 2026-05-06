import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const schema = z.object({
  name:       z.string().min(1),
  module:     z.enum(['contacts', 'deals']),
  trigger:    z.enum(['on_create', 'on_stage_change', 'on_update']),
  conditions: z.record(z.unknown()).optional().nullable(),
  actions:    z.array(z.record(z.unknown())),
  is_active:  z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const workflows = await prisma.crmWorkflow.findMany({ orderBy: { created_at: 'desc' } });
  return ok(workflows);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());
  const wf = await prisma.crmWorkflow.create({ data: parsed.data as Parameters<typeof prisma.crmWorkflow.create>[0]['data'] });
  return created(wf);
}
