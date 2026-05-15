import { NextRequest } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { generateQuoteSnapshot } from '@/lib/pricing/generateQuoteSnapshot';

/**
 * POST /api/v1/quotes/:id/snapshot
 *
 * Generates (or regenerates) the quote snapshot JSON used by the public itinerary page.
 * Called by the client immediately after /publish — runs in the background so the
 * user sees the link instantly while the snapshot is being built.
 *
 * Also used by Re-publish to refresh the snapshot after edits.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const t0 = Date.now();
  console.log('[snapshot] Step 1 - start', t0, 'quote:', params.id);

  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const t1 = Date.now();
  console.log('[snapshot] Step 2 - auth done', t1, `(${t1 - t0}ms)`);

  try {
    const snapshot = await generateQuoteSnapshot(params.id, user.sub);
    const t2 = Date.now();
    console.log('[snapshot] Step 3 - done', t2, `total: ${t2 - t0}ms`);
    return ok({ version: snapshot.version_number, generated_ms: t2 - t0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[snapshot] Failed:', msg);
    return err(`Snapshot generation failed: ${msg}`, 500);
  }
}
