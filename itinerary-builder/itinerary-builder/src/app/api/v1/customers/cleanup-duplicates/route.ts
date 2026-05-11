/**
 * POST /api/v1/customers/cleanup-duplicates
 *
 * Dedicated endpoint for the Duplicate Cleanup flow. Takes a `keep_id` and a
 * list of `delete_ids`, reassigns any quotes attached to the delete-targets
 * onto the kept record, then deletes them — all inside a single transaction
 * per row so a partial failure doesn't leave orphaned data.
 *
 * Returns a per-row result so the UI can show exactly what worked and what didn't.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Body = z.object({
  keep_id:    z.string().min(1),
  delete_ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());
  const { keep_id, delete_ids } = parsed.data;

  if (delete_ids.includes(keep_id)) {
    return err('keep_id cannot be in delete_ids', 400);
  }

  const keep = await prisma.customer.findUnique({ where: { id: keep_id }, select: { id: true } });
  if (!keep) return err('Keep target not found', 404);

  type RowResult = { id: string; ok: boolean; merged_quotes: number; error?: string };
  const results: RowResult[] = [];

  for (const id of delete_ids) {
    try {
      const merged = await prisma.$transaction(async (tx) => {
        const upd = await tx.quote.updateMany({
          where: { customer_id: id },
          data:  { customer_id: keep_id },
        });
        await tx.customer.delete({ where: { id } });
        return upd.count;
      });
      results.push({ id, ok: true, merged_quotes: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      // eslint-disable-next-line no-console
      console.error(`[cleanup-duplicates] id=${id} keep_id=${keep_id} failed:`, e);
      results.push({ id, ok: false, merged_quotes: 0, error: msg });
    }
  }

  const success = results.filter(r => r.ok).length;
  const failed  = results.length - success;
  return ok({
    keep_id,
    total: results.length,
    success,
    failed,
    results,
  });
}
