import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const search       = searchParams.get('search') ?? '';
  const converted    = searchParams.get('converted');

  const contacts = await prisma.crmContact.findMany({
    where: {
      ...(search ? {
        OR: [
          { name:  { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(converted === 'true'  ? { is_converted: true  } : {}),
      ...(converted === 'false' ? { is_converted: false } : {}),
    },
    include: {
      leads: {
        include: {
          stage: { select: { id: true, name: true, color: true } },
        },
        orderBy: { created_at: 'desc' },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  // Attach owner name
  const ownerIds = [...new Set(contacts.map(c => c.owner_id))];
  const owners   = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true, email: true },
  });
  const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]));

  const result = contacts.map(c => ({
    ...c,
    owner: ownerMap[c.owner_id] ?? null,
  }));

  return ok(result);
}
