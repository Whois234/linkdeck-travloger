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
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const record = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Customer');

  // Duplicate-cleanup flow: ?merge_into=<keepId> reassigns this customer's
  // quotes to the kept record before deleting. Without it, the delete fails
  // hard if quotes exist (Prisma FK restrict on Quote.customer_id).
  const { searchParams } = new URL(req.url);
  const mergeInto = searchParams.get('merge_into');

  if (mergeInto) {
    if (mergeInto === params.id) return err('Cannot merge a customer into itself', 400);
    const target = await prisma.customer.findUnique({ where: { id: mergeInto } });
    if (!target) return notFound('Target customer for merge');

    try {
      await prisma.$transaction([
        prisma.quote.updateMany({ where: { customer_id: params.id }, data: { customer_id: mergeInto } }),
        prisma.customer.delete({ where: { id: params.id } }),
      ]);
    } catch (e) {
      console.error(`[customers/DELETE merge] id=${params.id} merge_into=${mergeInto}`, e);
      const msg = e instanceof Error ? e.message : 'Merge failed';
      return err(`Could not merge customer: ${msg}`, 500);
    }
    return ok({ message: 'Customer merged and deleted' });
  }

  // Plain delete: try a straight hard-delete first. If FK blocks (quotes
  // attached), auto-merge into the oldest customer with the same phone — this
  // makes Duplicate Cleanup work even if the client is on stale JS that
  // doesn't pass ?merge_into=.
  try {
    await prisma.customer.delete({ where: { id: params.id } });
    return ok({ message: 'Customer deleted' });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== 'P2003') {
      console.error(`[customers/DELETE] id=${params.id}`, e);
      const msg = e instanceof Error ? e.message : 'Delete failed';
      return err(`Could not delete customer: ${msg}`, 500);
    }
    // P2003 = foreign key constraint failed. Auto-merge into oldest sibling
    // with the same phone, then retry.
    const sibling = await prisma.customer.findFirst({
      where: {
        phone: record.phone,
        id: { not: params.id },
      },
      orderBy: { created_at: 'asc' },
      select: { id: true },
    });
    if (!sibling) {
      return err(
        `This customer has related records (quotes) attached. Cannot delete because there is no other customer with the same phone to merge into. Delete the quotes first.`,
        409,
      );
    }
    try {
      await prisma.$transaction([
        prisma.quote.updateMany({ where: { customer_id: params.id }, data: { customer_id: sibling.id } }),
        prisma.customer.delete({ where: { id: params.id } }),
      ]);
    } catch (e2) {
      console.error(`[customers/DELETE auto-merge] id=${params.id} sibling=${sibling.id}`, e2);
      const msg = e2 instanceof Error ? e2.message : 'Auto-merge failed';
      return err(`Could not delete customer: ${msg}`, 500);
    }
    return ok({ message: `Customer deleted (quotes auto-merged into ${sibling.id})` });
  }
}
