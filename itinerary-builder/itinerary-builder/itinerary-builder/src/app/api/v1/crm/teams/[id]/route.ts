import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const membersSchema = z.object({
  user_ids: z.array(z.string()).min(0),
});

/** PATCH /api/v1/crm/teams/[id]  — replace the team's member list */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const team = await prisma.crmTeam.findUnique({ where: { id: params.id } });
  if (!team) return notFound('Team');

  const body = await req.json().catch(() => ({}));
  const parsed = membersSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Replace all members in a transaction
  await prisma.$transaction([
    prisma.crmTeamMember.deleteMany({ where: { team_id: params.id } }),
    ...parsed.data.user_ids.map(uid =>
      prisma.crmTeamMember.create({ data: { team_id: params.id, user_id: uid } })
    ),
  ]);

  const updated = await prisma.crmTeam.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });

  return ok(updated);
}

/** DELETE /api/v1/crm/teams/[id] */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const team = await prisma.crmTeam.findUnique({ where: { id: params.id } });
  if (!team) return notFound('Team');

  await prisma.crmTeam.delete({ where: { id: params.id } });
  return ok({ deleted: true });
}
