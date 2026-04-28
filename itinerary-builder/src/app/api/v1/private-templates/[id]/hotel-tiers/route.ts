import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const tiers = await prisma.templateHotelTier.findMany({
    where: { template_id: params.id },
    orderBy: [{ tier_name: 'asc' }, { sort_order: 'asc' }],
  });
  return ok(tiers);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  // Bulk-replace all hotel tiers for a template
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const tpl = await prisma.privateTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) return notFound('Template');

  const body: Array<Record<string, unknown>> = await req.json();
  if (!Array.isArray(body)) return err('Expected array of hotel tiers', 400);

  await prisma.$transaction([
    prisma.templateHotelTier.deleteMany({ where: { template_id: params.id } }),
    ...body.map((t, i) =>
      prisma.templateHotelTier.create({
        data: {
          template_id: params.id,
          tier_name: (t.tier_name as string) || 'Standard',
          destination_id: t.destination_id as string,
          default_hotel_id: (t.default_hotel_id as string) ?? null,
          default_room_category_id: (t.default_room_category_id as string) ?? null,
          default_meal_plan_id: (t.default_meal_plan_id as string) ?? null,
          nights: Number(t.nights) || 1,
          sort_order: Number(t.sort_order) || i + 1,
        },
      })
    ),
  ]);

  const tiers = await prisma.templateHotelTier.findMany({ where: { template_id: params.id }, orderBy: [{ tier_name: 'asc' }, { sort_order: 'asc' }] });
  return ok(tiers);
}
