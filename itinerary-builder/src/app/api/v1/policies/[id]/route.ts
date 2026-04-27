import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const record = await prisma.policy.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Policy');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.policy_type !== undefined) data.policy_type = body.policy_type;
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) data.content = body.content;
    if (body.applies_to !== undefined) data.applies_to = body.applies_to;
    if (body.state_id !== undefined) data.state_id = body.state_id;
    if (body.destination_id !== undefined) data.destination_id = body.destination_id;
    if (body.status !== undefined) data.status = body.status;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.policy.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.policy.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Policy');

  await prisma.policy.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Policy deactivated' });
}
