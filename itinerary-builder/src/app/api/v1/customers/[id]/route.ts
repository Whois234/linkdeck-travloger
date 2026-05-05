import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) return notFound('Customer');

  const quotes = await prisma.quote.findMany({
    where: { customer_id: params.id },
    include: {
      state: { select: { name: true } },
      quote_options: { select: { final_price: true, is_most_popular: true }, orderBy: { display_order: 'asc' } },
      assigned_agent: { select: { name: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  // Attach creator names
  const creatorIds = Array.from(new Set(quotes.map(q => q.created_by).filter(Boolean)));
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
    : [];
  const nameMap = Object.fromEntries(creators.map(u => [u.id, u.name]));
  const enriched = quotes.map(q => ({ ...q, created_by_name: nameMap[q.created_by] ?? null }));

  return ok({ customer, quotes: enriched });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const body = await req.json();
  const record = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Customer');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.whatsapp !== undefined) data.whatsapp = body.whatsapp;
    if (body.email !== undefined) data.email = body.email;
    if (body.city !== undefined) data.city = body.city;
    if (body.nationality !== undefined) data.nationality = body.nationality;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status !== undefined) data.status = body.status;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.customer.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Customer');

  await prisma.customer.delete({ where: { id: params.id } });
  return ok({ message: 'Customer deleted' });
}
