import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const schema = z.object({
  // Ordered list of field IDs in their new top-to-bottom order
  ids: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  await prisma.$transaction(
    parsed.data.ids.map((id, idx) =>
      prisma.contactField.update({ where: { id }, data: { sort_order: (idx + 1) * 10 } })
    )
  );

  return ok({ reordered: parsed.data.ids.length });
}
