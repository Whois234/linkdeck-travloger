import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, created, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';
import {
  createContact,
  DuplicatePhoneError,
} from '@/lib/contacts/service';
import {
  LeadStage,
  LeadSource,
  Platform,
  TripType,
  DevicePlatform,
} from '@prisma/client';

// Light-weight sanitisation. We don't render user-supplied content as HTML
// anywhere in the admin, but we strip tags/<script> on the way in as defense
// in depth so a future careless `dangerouslySetInnerHTML` can't be weaponised.
function stripTags(v: string | null | undefined): string {
  if (!v) return '';
  return v
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

const optionalString = (max: number) =>
  z.string().trim().max(max).transform(stripTags).nullable().optional().or(z.literal('').transform(() => null));

const createSchema = z.object({
  // Basic
  name:          z.string().trim().min(1, 'Name is required').max(120).transform(stripTags),
  phone:         z.string().trim().min(7, 'Phone is too short').max(20).regex(/^[0-9+\-\s()]+$/, 'Phone has invalid characters'),
  email:         z.string().trim().email().toLowerCase().nullable().optional().or(z.literal('').transform(() => null)),
  city:          optionalString(80),

  // Travel interest
  interested_destination: optionalString(120),
  number_of_travellers:   z.number().int().min(1).max(999).nullable().optional(),
  trip_type:              z.nativeEnum(TripType).nullable().optional(),
  special_requirements:   optionalString(2000),
  budget_per_person:      z.union([z.number(), z.string()]).nullable().optional(),

  // Lead source & ad attribution
  lead_source:         z.nativeEnum(LeadSource).nullable().optional(),
  platform:            z.nativeEnum(Platform).nullable().optional(),
  campaign_name:       optionalString(200),
  ad_set_name:         optionalString(200),
  ad_name:             optionalString(200),
  other_ad_details:    z.record(z.unknown()).nullable().optional(),
  device_platform:     z.nativeEnum(DevicePlatform).nullable().optional(),
  facebook_click_id:   optionalString(200),
  facebook_browser_id: optionalString(200),
  google_click_id:     optionalString(200),
  platform_lead_id:    optionalString(200),
  gallabox_contact_id: optionalString(200),

  // CRM
  lead_stage:      z.nativeEnum(LeadStage).optional(),
  assigned_to_id:  z.string().nullable().optional(),
  follow_up_date:  z.union([z.string(), z.null()]).optional(),
  booking_value:   z.union([z.number(), z.string()]).nullable().optional(),
  tags:            z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  do_not_contact:  z.boolean().optional(),

  // Legacy compat
  source:        optionalString(60),
  notes:         optionalString(2000),
  custom_fields: z.record(z.unknown()).optional().nullable(),
});

function buildDateFilter(dateRange: string | null, from: string | null, to: string | null) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dateRange === 'today') {
    return { gte: startOfDay(now) };
  }
  if (dateRange === 'yesterday') {
    const yd = new Date(now); yd.setDate(yd.getDate() - 1);
    return { gte: startOfDay(yd), lt: startOfDay(now) };
  }
  if (dateRange === 'this_week') {
    const monday = new Date(now); monday.setDate(monday.getDate() - monday.getDay() + 1);
    return { gte: startOfDay(monday) };
  }
  if (dateRange === 'past_7') {
    const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
    return { gte: startOfDay(d7) };
  }
  if (dateRange === 'custom' && from) {
    const f: Record<string, Date> = { gte: new Date(from) };
    if (to) f.lte = new Date(to + 'T23:59:59');
    return f;
  }
  return undefined;
}

const PAGE_LIMIT = 50;

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const search        = searchParams.get('search') ?? '';
  const converted     = searchParams.get('converted');
  const dateRange     = searchParams.get('date_range');
  const dateFrom      = searchParams.get('date_from');
  const dateTo        = searchParams.get('date_to');
  const tagsParam     = searchParams.get('tags'); // comma-separated; contact must have ALL
  const sortBy        = searchParams.get('sort') ?? 'newest';
  const page          = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit         = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10)));

  // New filters (Part 3 spec)
  const leadStage     = searchParams.get('lead_stage');     // single value or comma-separated
  const leadSource    = searchParams.get('lead_source');
  const assignedToId  = searchParams.get('assigned_to_id'); // 'unassigned' = IS NULL
  const destination   = searchParams.get('interested_destination');
  const tripType      = searchParams.get('trip_type');
  const doNotContact  = searchParams.get('do_not_contact'); // 'true' | 'false'
  const includeDeleted = searchParams.get('include_deleted') === 'true';

  const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);
  const tagList    = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : [];

  const enumList = (v: string | null) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
  const stageList  = enumList(leadStage);
  const sourceList = enumList(leadSource);
  const typeList   = enumList(tripType);

  const where = {
    ...(includeDeleted ? {} : { deleted_at: null }),
    ...(search ? {
      OR: [
        { name:  { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(converted === 'true'  ? { is_converted: true  } : {}),
    ...(converted === 'false' ? { is_converted: false } : {}),
    ...(dateFilter ? { created_at: dateFilter } : {}),
    ...(tagList.length ? { tags: { hasEvery: tagList } } : {}),
    ...(stageList.length  ? { lead_stage:  { in: stageList  as LeadStage[]  } } : {}),
    ...(sourceList.length ? { lead_source: { in: sourceList as LeadSource[] } } : {}),
    ...(typeList.length   ? { trip_type:   { in: typeList   as TripType[]   } } : {}),
    ...(assignedToId === 'unassigned' ? { assigned_to_id: null }
       : assignedToId                  ? { assigned_to_id: assignedToId }
       : {}),
    ...(destination ? { interested_destination: { contains: destination, mode: 'insensitive' as const } } : {}),
    ...(doNotContact === 'true'  ? { do_not_contact: true  } : {}),
    ...(doNotContact === 'false' ? { do_not_contact: false } : {}),
  };

  // Sort
  const orderBy =
    sortBy === 'oldest'           ? { created_at: 'asc'  as const } :
    sortBy === 'name'             ? { name:       'asc'  as const } :
    sortBy === 'follow_up_asc'    ? { follow_up_date: 'asc'  as const } :
    sortBy === 'follow_up_desc'   ? { follow_up_date: 'desc' as const } :
    sortBy === 'booking_value_desc' ? { booking_value: 'desc' as const } :
    sortBy === 'booking_value_asc'  ? { booking_value: 'asc'  as const } :
                                    { created_at: 'desc' as const };

  const [total, contacts] = await Promise.all([
    prisma.crmContact.count({ where }),
    prisma.crmContact.findMany({
      where,
      include: {
        owner:       { select: { id: true, name: true, email: true } },
        assigned_to: { select: { id: true, name: true, email: true } },
        leads: {
          select: {
            id: true,
            name: true,
            status: true,
            created_at: true,
            destination_interest: true,
            stage:    { select: { id: true, name: true, color: true } },
            pipeline: { select: { id: true, name: true } },
            _count: { select: { call_logs: true, lead_notes: true } },
          },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Both naming conventions for backward + spec compat.
  return ok({
    items: contacts,
    contacts,
    total,
    totalCount: total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body   = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const normalizedPhone = parsed.data.phone.replace(/[\s\-\(\)]/g, '');

  // Duplicate-phone pre-check so we can record the attempt (audit trail).
  // The service ALSO checks, so this is just for the duplicate-attempts log.
  const existing = await prisma.crmContact.findUnique({ where: { phone: normalizedPhone } });
  if (existing) {
    const ownerUser = await prisma.user.findUnique({ where: { id: existing.owner_id }, select: { name: true } });
    const ownerName = ownerUser?.name ?? 'another team member';
    await prisma.duplicateContactAttempt.create({
      data: { phone: normalizedPhone, attempted_by: user.sub, existing_owner_id: existing.owner_id },
    }).catch(() => {});
    return err(`This contact already exists and is owned by ${ownerName}.`, 409);
  }

  try {
    const contact = await createContact(
      {
        ...parsed.data,
        phone:    normalizedPhone,
        owner_id: user.sub,
      },
      user.sub,
    );
    return created(contact);
  } catch (e) {
    if (e instanceof DuplicatePhoneError) return err(e.message, 409);
    console.error('[contacts/POST]', e);
    const msg = e instanceof Error ? e.message : 'Create failed';
    return err(`Could not create contact: ${msg}`, 500);
  }
}
