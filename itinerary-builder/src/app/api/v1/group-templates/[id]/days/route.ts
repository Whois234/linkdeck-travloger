import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const days = await prisma.groupTemplateDay.findMany({
    where: { group_template_id: params.id },
    orderBy: { sort_order: 'asc' },
  });
  return ok(days);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const tpl = await prisma.groupTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) return notFound('Group Template');

  const body: Array<Record<string, unknown>> = await req.json();
  if (!Array.isArray(body)) return err('Expected array of days', 400);

  await prisma.$transaction([
    prisma.groupTemplateDay.deleteMany({ where: { group_template_id: params.id } }),
    ...body.map((d, i) =>
      prisma.groupTemplateDay.create({
        data: {
          group_template_id: params.id,
          day_number: Number(d.day_number) || i + 1,
          destination_id: d.destination_id as string,
          title: (d.title as string) || `Day ${i + 1}`,
          day_plan_id: (d.day_plan_id as string) ?? null,
          description_override: (d.description_override as string) ?? null,
          image_override: (d.image_override as string) ?? null,
          activities: (d.activities ?? Prisma.JsonNull) as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue,
          transfers: (d.transfers ?? Prisma.JsonNull) as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue,
          meals: (d.meals ?? Prisma.JsonNull) as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue,
          sort_order: Number(d.sort_order) || i + 1,
        },
      })
    ),
  ]);

  const days = await prisma.groupTemplateDay.findMany({ where: { group_template_id: params.id }, orderBy: { sort_order: 'asc' } });
  return ok(days);
}
