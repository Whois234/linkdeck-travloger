import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'date', 'select', 'multiselect', 'textarea', 'url'] as const;

const createSchema = z.object({
  key:         z.string().min(1).regex(/^[a-z0-9_]+$/i, 'Use letters, digits and underscores only'),
  label:       z.string().min(1),
  type:        z.enum(FIELD_TYPES).default('text'),
  required:    z.boolean().optional().default(false),
  options:     z.array(z.string()).optional(),
  placeholder: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const fields = await prisma.contactField.findMany({
    where: { status: true },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
  });
  return ok(fields);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const existing = await prisma.contactField.findUnique({ where: { key: parsed.data.key } });
  if (existing) return err(`A contact field with key "${parsed.data.key}" already exists.`, 409);

  const lastOrder = await prisma.contactField.findFirst({ orderBy: { sort_order: 'desc' }, select: { sort_order: true } });

  const field = await prisma.contactField.create({
    data: {
      key:         parsed.data.key,
      label:       parsed.data.label,
      type:        parsed.data.type,
      required:    parsed.data.required ?? false,
      options:     parsed.data.options ? (parsed.data.options as unknown as object) : undefined,
      placeholder: parsed.data.placeholder ?? null,
      sort_order:  (lastOrder?.sort_order ?? 0) + 10,
      is_system:   false,
    },
  });
  return created(field);
}
