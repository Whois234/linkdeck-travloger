import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, SupplierType } from '@prisma/client';

const SupplierSchema = z.object({
  supplier_type: z.nativeEnum(SupplierType),
  name: z.string().min(1),
  contact_person: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  gst_number: z.string().optional().nullable(),
  pan_number: z.string().optional().nullable(),
  bank_details: z.record(z.unknown()).optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  contract_start_date: z.string().datetime().optional().nullable(),
  contract_end_date: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as SupplierType | null;

  const suppliers = await prisma.supplier.findMany({
    where: { status: true, ...(type ? { supplier_type: type } : {}) },
    orderBy: { name: 'asc' },
  });
  return ok(suppliers);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = SupplierSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const supplier = await prisma.supplier.create({ data: parsed.data as Parameters<typeof prisma.supplier.create>[0]['data'] });
  return created(supplier);
}
