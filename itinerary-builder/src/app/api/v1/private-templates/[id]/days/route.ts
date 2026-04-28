import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const tpl = await prisma.privateTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) return notFound('Template');
  const days = await prisma.templateDay.findMany({
    where: { template_id: params.id },
    orderBy: { sort_order: 'asc' },
  });
  return ok(days);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const tpl = await prisma.privateTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) return notFound('Template');

  const body = await req.json();
  if (!body.day_number || !body.destination_id || !body.title) {
    return err('day_number, destination_id and title are required', 400);
  }

  const day = await prisma.templateDay.create({
    data: {
      template_id: params.id,
      day_number: body.day_number,
      destination_id: body.destination_id,
      night_destination_id: body.night_destination_id ?? null,
      title: body.title,
      day_plan_id: body.day_plan_id ?? null,
      description_override: body.description_override ?? null,
      image_override: body.image_override ?? null,
      activities: body.activities ?? null,
      transfers: body.transfers ?? null,
      meals: body.meals ?? null,
      sort_order: body.sort_order ?? body.day_number,
    },
  });
  return created(day);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  // Bulk-replace all days for a template
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const tpl = await prisma.privateTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) return notFound('Template');

  const body: Array<Record<string, unknown>> = await req.json();
  if (!Array.isArray(body)) return err('Expected array of days', 400);

  await prisma.$transaction([
    prisma.templateDay.deleteMany({ where: { template_id: params.id } }),
    ...body.map((d, i) =>
      prisma.templateDay.create({
        data: {
          template_id: params.id,
          day_number: Number(d.day_number) || i + 1,
          destination_id: d.destination_id as string,
          night_destination_id: (d.night_destination_id as string) ?? null,
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

  const days = await prisma.templateDay.findMany({ where: { template_id: params.id }, orderBy: { sort_order: 'asc' } });
  return ok(days);
}
