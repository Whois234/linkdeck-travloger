import { prisma } from '@/lib/prisma';

export async function generateQuoteSnapshot(quote_id: string, published_by: string) {
  // ── STEP 1: Single primary read — everything needed to branch logic ──────────
  const quote = await prisma.quote.findUnique({
    where: { id: quote_id },
    include: {
      customer:       true,
      state:          true,
      assigned_agent: true,
      quote_options: {
        include: { vehicle_type: true, option_hotels: true },
        orderBy: { display_order: 'asc' },
      },
      day_snapshots: { orderBy: { day_number: 'asc' } },
    },
  });
  if (!quote) throw new Error(`Quote ${quote_id} not found`);

  // ── STEP 2: All secondary reads in ONE parallel batch ────────────────────────
  const [agentOrUser, groupTemplate, privateTemplate, lastSnapshot] = await Promise.all([
    // Agent resolution — try both lookups together instead of sequential
    quote.assigned_agent
      ? Promise.resolve({ agent: quote.assigned_agent, user: null })
      : quote.created_by
        ? Promise.all([
            prisma.agent.findFirst({ where: { user_account_id: quote.created_by, status: true } }),
            prisma.user.findUnique({ where: { id: quote.created_by }, select: { id: true, name: true, phone: true } }),
          ]).then(([agent, user]) => ({ agent, user }))
        : Promise.resolve({ agent: null, user: null }),

    // Group template
    quote.group_template_id
      ? prisma.groupTemplate.findUnique({
          where: { id: quote.group_template_id },
          select: { group_template_name: true, hero_image: true, cms_data: true, default_policy_ids: true },
        })
      : Promise.resolve(null),

    // Private template
    quote.private_template_id
      ? prisma.privateTemplate.findUnique({
          where: { id: quote.private_template_id },
          select: { hero_image: true, default_policy_ids: true, cms_data: true, default_inclusion_ids: true, default_exclusion_ids: true },
        })
      : Promise.resolve(null),

    // Last snapshot version number (needed for versioning)
    prisma.quoteSnapshot.findFirst({
      where: { quote_id },
      orderBy: { version_number: 'desc' },
      select: { version_number: true },
    }),
  ]);

  // ── Resolve agent ────────────────────────────────────────────────────────────
  let resolvedAgent = quote.assigned_agent;
  if (!resolvedAgent) {
    const { agent, user } = agentOrUser as { agent: typeof quote.assigned_agent | null; user: { id: string; name: string; phone: string | null } | null };
    if (agent) {
      resolvedAgent = agent;
    } else if (user) {
      resolvedAgent = {
        id: user.id, user_account_id: user.id, name: user.name,
        role: 'Travel Expert', phone: user.phone ?? null, whatsapp: user.phone ?? null,
        email: null, photo: null, designation: 'Travel Consultant',
        rating: null, years_experience: null, speciality: null, available_hours: null,
        status: true, created_at: new Date(), updated_at: new Date(),
      };
    }
  }

  // ── Extract template data ────────────────────────────────────────────────────
  const privateTemplateHero   = privateTemplate?.hero_image ?? null;
  const templatePolicyIds     = Array.isArray(privateTemplate?.default_policy_ids)  ? (privateTemplate!.default_policy_ids  as string[]) : null;
  const templateInclusionIds  = Array.isArray(privateTemplate?.default_inclusion_ids) ? (privateTemplate!.default_inclusion_ids as string[]) : null;
  const templateExclusionIds  = Array.isArray(privateTemplate?.default_exclusion_ids) ? (privateTemplate!.default_exclusion_ids as string[]) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templateCmsData: any  = privateTemplate?.cms_data ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupCms: any         = groupTemplate?.cms_data ?? null;

  // ── STEP 3: Resolve day snapshots ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resolvedDaySnapshots: any[];

  if (quote.day_snapshots.length > 0) {
    resolvedDaySnapshots = quote.day_snapshots.map((d) => ({
      ...d,
      date: d.date instanceof Date ? d.date.toISOString() : d.date,
    }));
  } else if (quote.private_template_id) {
    const templateDays = await prisma.templateDay.findMany({
      where: { template_id: quote.private_template_id },
      orderBy: { day_number: 'asc' },
    });
    resolvedDaySnapshots = templateDays.map((td) => ({
      day_number: td.day_number,
      date: quote.start_date
        ? new Date(new Date(quote.start_date).getTime() + (td.day_number - 1) * 86400000).toISOString()
        : new Date().toISOString(),
      destination_id: td.destination_id,
      title: td.title,
      description: td.description_override ?? null,
      image_url: td.image_override ?? null,
      gallery_images: Array.isArray((td as unknown as { gallery_images?: string[] }).gallery_images)
        ? (td as unknown as { gallery_images: string[] }).gallery_images : null,
      tags: null, transfers: td.transfers ?? null,
    }));
  } else if (quote.group_template_id) {
    const groupDays = await prisma.groupTemplateDay.findMany({
      where: { group_template_id: quote.group_template_id },
      orderBy: { day_number: 'asc' },
    });
    resolvedDaySnapshots = groupDays.map((gd) => ({
      day_number: gd.day_number,
      date: quote.start_date
        ? new Date(new Date(quote.start_date).getTime() + (gd.day_number - 1) * 86400000).toISOString()
        : new Date().toISOString(),
      destination_id: gd.destination_id,
      title: gd.title,
      description: gd.description_override ?? null,
      image_url: gd.image_override ?? null,
      gallery_images: Array.isArray((gd as unknown as { gallery_images?: string[] }).gallery_images)
        ? (gd as unknown as { gallery_images: string[] }).gallery_images : null,
      tags: null, transfers: gd.transfers ?? null,
    }));
  } else {
    resolvedDaySnapshots = [];
  }

  // ── STEP 4: Build all ID sets for batch queries ──────────────────────────────
  const itineraryDestIds = Array.from(new Set(
    resolvedDaySnapshots.map((d: { destination_id?: string }) => d.destination_id).filter(Boolean) as string[]
  ));
  const incExcDestFilter = itineraryDestIds.length > 0
    ? { OR: [{ destination_id: null }, { destination_id: { in: itineraryDestIds } }] }
    : { destination_id: null };

  const groupTemplatePolicyIds = Array.isArray(groupTemplate?.default_policy_ids) ? (groupTemplate!.default_policy_ids as string[]) : null;
  const effectivePolicyIds     = templatePolicyIds ?? groupTemplatePolicyIds;

  const groupCmsInclusions: Array<{ id: string; text: string }> | null =
    Array.isArray(groupCms?.inclusions) && groupCms.inclusions.length > 0
      ? (groupCms.inclusions as string[]).map((text: string, i: number) => ({ id: `inc-${i}`, text })) : null;
  const groupCmsExclusions: Array<{ id: string; text: string }> | null =
    Array.isArray(groupCms?.exclusions) && groupCms.exclusions.length > 0
      ? (groupCms.exclusions as string[]).map((text: string, i: number) => ({ id: `exc-${i}`, text })) : null;

  // All hotel-related IDs across all options — for batch lookup
  const allOptionHotels = quote.quote_options.flatMap(o => o.option_hotels);
  const hotelIds       = [...new Set(allOptionHotels.map(h => h.hotel_id).filter(Boolean))];
  const roomIds        = [...new Set(allOptionHotels.map(h => h.room_category_id).filter(Boolean))];
  const mealIds        = [...new Set(allOptionHotels.map(h => h.meal_plan_id).filter(Boolean))];
  const optionDestIds  = [...new Set(allOptionHotels.map(h => h.destination_id).filter(Boolean))];
  const allDestIds     = [...new Set([...itineraryDestIds, ...optionDestIds])];

  // ── STEP 5: ALL remaining DB reads in ONE parallel batch ─────────────────────
  const [
    dbInclusions,
    dbExclusions,
    rawPolicies,
    hotelsRaw,
    roomsRaw,
    mealsRaw,
    destsRaw,
  ] = await Promise.all([
    groupCmsInclusions
      ? Promise.resolve([])
      : templateInclusionIds?.length
        ? prisma.inclusionExclusion.findMany({ where: { id: { in: templateInclusionIds }, status: true }, orderBy: [{ category: 'asc' }] })
        : prisma.inclusionExclusion.findMany({ where: { type: 'INCLUSION', status: true, ...incExcDestFilter }, orderBy: [{ category: 'asc' }] }),

    groupCmsExclusions
      ? Promise.resolve([])
      : templateExclusionIds?.length
        ? prisma.inclusionExclusion.findMany({ where: { id: { in: templateExclusionIds }, status: true }, orderBy: [{ category: 'asc' }] })
        : prisma.inclusionExclusion.findMany({ where: { type: 'EXCLUSION', status: true, ...incExcDestFilter }, orderBy: [{ category: 'asc' }] }),

    effectivePolicyIds?.length
      ? prisma.policy.findMany({ where: { id: { in: effectivePolicyIds }, status: true }, orderBy: [{ policy_type: 'asc' }] })
      : prisma.policy.findMany({ where: { status: true, OR: [{ state_id: quote.state_id }, { state_id: null }] }, orderBy: [{ policy_type: 'asc' }] }),

    // ── N+1 FIX: 1 query per entity type instead of per hotel ──────────────────
    hotelIds.length
      ? prisma.hotel.findMany({ where: { id: { in: hotelIds } }, select: { id: true, hotel_name: true, category_label: true, star_rating: true } })
      : Promise.resolve([]),

    roomIds.length
      ? prisma.roomCategory.findMany({ where: { id: { in: roomIds } }, select: { id: true, room_category_name: true } })
      : Promise.resolve([]),

    mealIds.length
      ? prisma.mealPlan.findMany({ where: { id: { in: mealIds } }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),

    allDestIds.length
      ? prisma.destination.findMany({ where: { id: { in: allDestIds } }, select: { id: true, name: true, hero_image: true } })
      : Promise.resolve([]),
  ]);

  // ── Build lookup maps — O(1) access in enrichment loops ─────────────────────
  const hotelsMap = Object.fromEntries(hotelsRaw.map(r => [r.id, r]));
  const roomsMap  = Object.fromEntries(roomsRaw.map(r => [r.id, r]));
  const mealsMap  = Object.fromEntries(mealsRaw.map(r => [r.id, r]));
  const destsMap  = Object.fromEntries(destsRaw.map(r => [r.id, r]));

  // ── STEP 6: Enrich everything in memory (zero DB calls) ─────────────────────
  const enrichedOptions = quote.quote_options.map(option => ({
    ...option,
    option_hotels: option.option_hotels.map(oh => ({
      ...oh,
      hotel:         hotelsMap[oh.hotel_id]         ?? null,
      room_category: roomsMap[oh.room_category_id]  ?? null,
      meal_plan:     mealsMap[oh.meal_plan_id]       ?? null,
      destination:   destsMap[oh.destination_id]    ? { name: destsMap[oh.destination_id].name } : null,
    })),
  }));

  const enrichedDaySnapshots = resolvedDaySnapshots.map((d: { destination_id: string }) => ({
    ...d,
    destination_name:       destsMap[d.destination_id]?.name       ?? null,
    destination_hero_image: destsMap[d.destination_id]?.hero_image ?? null,
  }));

  const firstDestHero = enrichedDaySnapshots.find(
    (d: { destination_hero_image: string | null }) => d.destination_hero_image
  )?.destination_hero_image ?? null;

  // ── Build inclusions/exclusions/policies ─────────────────────────────────────
  const inclusions = groupCmsInclusions ?? dbInclusions;
  const exclusions = groupCmsExclusions ?? dbExclusions;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customFaqs: any[] = [];
  if (templateCmsData?.faqs_enabled && Array.isArray(templateCmsData?.custom_faqs)) {
    templateCmsData.custom_faqs.forEach((faq: { question: string; answer: string }, i: number) => {
      if (faq.question?.trim()) customFaqs.push({ id: `faq-${i}`, policy_type: 'FAQ', title: faq.question, content: faq.answer ?? '', status: true, state_id: null, destination_id: null, applies_to: 'BOTH' });
    });
  }
  if (groupCms?.faqs_enabled && Array.isArray(groupCms?.custom_faqs)) {
    groupCms.custom_faqs.forEach((faq: { question: string; answer: string }, i: number) => {
      if (faq.question?.trim()) customFaqs.push({ id: `grp-faq-${i}`, policy_type: 'FAQ', title: faq.question, content: faq.answer ?? '', status: true, state_id: null, destination_id: null, applies_to: 'BOTH' });
    });
  }
  const policies = [...rawPolicies, ...customFaqs];

  const groupPackageOptions: Array<{ tier_name: string; is_most_popular: boolean; inclusions: string[]; adult_price: number; child_price: number }> =
    Array.isArray(groupCms?.package_options) ? groupCms.package_options : [];

  // ── STEP 7: Build snapshot JSON ──────────────────────────────────────────────
  const snapshot_json = {
    generated_at: new Date().toISOString(),
    quote: {
      id: quote.id, quote_number: quote.quote_number,
      quote_name: quote.quote_name ?? (templateCmsData as Record<string,unknown>)?.tab_title as string | null ?? (groupCms as Record<string,unknown>)?.tab_title as string | null ?? groupTemplate?.group_template_name ?? null,
      quote_type: quote.quote_type, group_template_id: quote.group_template_id ?? null,
      status: quote.status, start_date: quote.start_date, end_date: quote.end_date,
      duration_days: quote.duration_days, duration_nights: quote.duration_nights,
      adults: quote.adults, children_below_5: quote.children_below_5,
      children_5_12: quote.children_5_12, infants: quote.infants,
      pickup_point: quote.pickup_point, drop_point: quote.drop_point, expiry_date: quote.expiry_date,
    },
    customer: quote.customer,
    agent: resolvedAgent,
    state: {
      ...quote.state,
      hero_image:
        ((groupCms as Record<string,unknown>)?.state_gallery_image as string | undefined || null)
        ?? ((templateCmsData as Record<string,unknown>)?.state_gallery_image as string | undefined || null)
        ?? groupTemplate?.hero_image ?? privateTemplateHero ?? quote.state.hero_image ?? firstDestHero ?? null,
      hero_images:
        (Array.isArray((templateCmsData as Record<string,unknown>)?.hero_images) && ((templateCmsData as Record<string,unknown>).hero_images as string[]).filter(Boolean).length > 1)
          ? ((templateCmsData as Record<string,unknown>).hero_images as string[]).filter(Boolean)
          : (Array.isArray((groupCms as Record<string,unknown>)?.hero_images) && ((groupCms as Record<string,unknown>).hero_images as string[]).filter(Boolean).length > 1)
            ? ((groupCms as Record<string,unknown>).hero_images as string[]).filter(Boolean)
            : null,
    },
    quote_options:         enrichedOptions,
    group_package_options: groupPackageOptions,
    day_snapshots:         enrichedDaySnapshots,
    inclusions, exclusions, policies,
  };

  // ── STEP 8: Write snapshot — parallel deactivate + create ───────────────────
  const version_number = (lastSnapshot?.version_number ?? 0) + 1;

  const [, newSnapshot] = await Promise.all([
    prisma.quoteSnapshot.updateMany({
      where: { quote_id, is_current: true },
      data:  { is_current: false },
    }),
    prisma.quoteSnapshot.create({
      data: { quote_id, version_number, snapshot_json, published_at: new Date(), published_by, is_current: true },
    }),
  ]);

  return newSnapshot;
}
