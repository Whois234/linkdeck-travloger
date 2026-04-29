import { prisma } from '@/lib/prisma';

export async function generateQuoteSnapshot(quote_id: string, published_by: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quote_id },
    include: {
      customer: true,
      state: true,
      assigned_agent: true,
      quote_options: {
        include: {
          vehicle_type: true,
          option_hotels: true,
        },
        orderBy: { display_order: 'asc' },
      },
      day_snapshots: { orderBy: { day_number: 'asc' } },
    },
  });

  if (!quote) throw new Error(`Quote ${quote_id} not found`);

  // For group quotes: fetch the group template for name + hero image
  let groupTemplate: { group_template_name: string; hero_image: string | null; cms_data: unknown } | null = null;
  if (quote.group_template_id) {
    groupTemplate = await prisma.groupTemplate.findUnique({
      where: { id: quote.group_template_id },
      select: { group_template_name: true, hero_image: true, cms_data: true },
    });
  }

  // Fetch private template: hero_image + default_policy_ids + cms_data (for FAQs)
  let privateTemplateHero: string | null = null;
  let templatePolicyIds: string[] | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let templateCmsData: any = null;
  if (quote.private_template_id) {
    const pt = await prisma.privateTemplate.findUnique({
      where: { id: quote.private_template_id },
      select: { hero_image: true, default_policy_ids: true, cms_data: true },
    });
    privateTemplateHero = pt?.hero_image ?? null;
    templatePolicyIds = Array.isArray(pt?.default_policy_ids) ? (pt.default_policy_ids as string[]) : null;
    templateCmsData = pt?.cms_data ?? null;
  }

  // If no QuoteDaySnapshot records exist yet (quote created via wizard),
  // fall back to the linked private template's template_days
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

    resolvedDaySnapshots = templateDays.map((td) => {
      const dayDate = quote.start_date
        ? new Date(new Date(quote.start_date).getTime() + (td.day_number - 1) * 86400000).toISOString()
        : new Date().toISOString();
      return {
        day_number: td.day_number,
        date: dayDate,
        destination_id: td.destination_id,
        title: td.title,
        description: td.description_override ?? null,
        image_url: td.image_override ?? null,
        tags: null,
        transfers: td.transfers ?? null,
      };
    });
  } else if (quote.group_template_id) {
    const groupDays = await prisma.groupTemplateDay.findMany({
      where: { group_template_id: quote.group_template_id },
      orderBy: { day_number: 'asc' },
    });

    resolvedDaySnapshots = groupDays.map((gd) => {
      const dayDate = quote.start_date
        ? new Date(new Date(quote.start_date).getTime() + (gd.day_number - 1) * 86400000).toISOString()
        : new Date().toISOString();
      return {
        day_number: gd.day_number,
        date: dayDate,
        destination_id: gd.destination_id,
        title: gd.title,
        description: gd.description_override ?? null,
        image_url: gd.image_override ?? null,
        tags: null,
        transfers: gd.transfers ?? null,
      };
    });
  } else {
    resolvedDaySnapshots = [];
  }

  // Resolve inclusions, exclusions, and policies
  // Policies: if template has selected policy IDs, use only those; otherwise all global + state policies
  const [inclusions, exclusions, rawPolicies] = await Promise.all([
    prisma.inclusionExclusion.findMany({
      where: { type: 'INCLUSION', destination_id: quote.state_id, status: true },
    }),
    prisma.inclusionExclusion.findMany({
      where: { type: 'EXCLUSION', destination_id: quote.state_id, status: true },
    }),
    templatePolicyIds && templatePolicyIds.length > 0
      ? prisma.policy.findMany({
          where: { id: { in: templatePolicyIds }, status: true },
          orderBy: [{ policy_type: 'asc' }],
        })
      : prisma.policy.findMany({
          where: {
            status: true,
            OR: [
              { state_id: quote.state_id },
              { state_id: null },
            ],
          },
          orderBy: [{ policy_type: 'asc' }],
        }),
  ]);

  // Append custom FAQs from private template cms_data as FAQ policy records
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customFaqs: any[] = [];
  if (
    templateCmsData?.faqs_enabled &&
    Array.isArray(templateCmsData?.custom_faqs) &&
    templateCmsData.custom_faqs.length > 0
  ) {
    templateCmsData.custom_faqs.forEach((faq: { question: string; answer: string }, i: number) => {
      if (faq.question?.trim()) {
        customFaqs.push({
          id: `faq-${i}`,
          policy_type: 'FAQ',
          title: faq.question,
          content: faq.answer ?? '',
          status: true,
          state_id: null,
          destination_id: null,
          applies_to: 'BOTH',
        });
      }
    });
  }

  const policies = [...rawPolicies, ...customFaqs];

  // Enrich day snapshots with destination name + hero_image
  const allDestIds = resolvedDaySnapshots.map((d: { destination_id: string }) => d.destination_id).filter(Boolean) as string[];
  const uniqueDestIds = Array.from(new Set(allDestIds));
  const destRecords = await prisma.destination.findMany({
    where: { id: { in: uniqueDestIds } },
    select: { id: true, name: true, hero_image: true },
  });
  const destMap: Record<string, { name: string; hero_image: string | null }> = {};
  destRecords.forEach((d) => { destMap[d.id] = { name: d.name, hero_image: d.hero_image }; });

  const enrichedDaySnapshots = resolvedDaySnapshots.map((d: { destination_id: string }) => ({
    ...d,
    destination_name: destMap[d.destination_id]?.name ?? null,
    destination_hero_image: destMap[d.destination_id]?.hero_image ?? null,
  }));

  // Derive hero image: state > group template > private template > first destination
  const firstDestHero = enrichedDaySnapshots.find((d: { destination_hero_image: string | null }) => d.destination_hero_image)?.destination_hero_image ?? null;

  // Enrich option hotels with hotel/room/meal names
  const enrichedOptions = await Promise.all(
    quote.quote_options.map(async (option) => {
      const enrichedHotels = await Promise.all(
        option.option_hotels.map(async (oh) => {
          const [hotel, room, meal, dest] = await Promise.all([
            prisma.hotel.findUnique({ where: { id: oh.hotel_id }, select: { hotel_name: true, category_label: true, star_rating: true, images: true } }),
            prisma.roomCategory.findUnique({ where: { id: oh.room_category_id }, select: { room_category_name: true } }),
            prisma.mealPlan.findUnique({ where: { id: oh.meal_plan_id }, select: { code: true, name: true } }),
            prisma.destination.findUnique({ where: { id: oh.destination_id }, select: { name: true } }),
          ]);
          return { ...oh, hotel, room_category: room, meal_plan: meal, destination: dest };
        })
      );
      return { ...option, option_hotels: enrichedHotels };
    })
  );

  const snapshot_json = {
    generated_at: new Date().toISOString(),
    quote: {
      id: quote.id,
      quote_number: quote.quote_number,
      quote_name: quote.quote_name ?? groupTemplate?.group_template_name ?? null,
      quote_type: quote.quote_type,
      status: quote.status,
      start_date: quote.start_date,
      end_date: quote.end_date,
      duration_days: quote.duration_days,
      duration_nights: quote.duration_nights,
      adults: quote.adults,
      children_below_5: quote.children_below_5,
      children_5_12: quote.children_5_12,
      infants: quote.infants,
      pickup_point: quote.pickup_point,
      drop_point: quote.drop_point,
      expiry_date: quote.expiry_date,
    },
    customer: quote.customer,
    agent: quote.assigned_agent,
    // state hero_image: state > group template > private template hero > first destination hero
    state: {
      ...quote.state,
      hero_image: quote.state.hero_image ?? groupTemplate?.hero_image ?? privateTemplateHero ?? firstDestHero ?? null,
    },
    quote_options: enrichedOptions,
    day_snapshots: enrichedDaySnapshots,
    inclusions,
    exclusions,
    policies,
  };

  // Deactivate current snapshot
  await prisma.quoteSnapshot.updateMany({
    where: { quote_id, is_current: true },
    data: { is_current: false },
  });

  // Get next version number
  const lastSnapshot = await prisma.quoteSnapshot.findFirst({
    where: { quote_id },
    orderBy: { version_number: 'desc' },
  });
  const version_number = (lastSnapshot?.version_number ?? 0) + 1;

  const newSnapshot = await prisma.quoteSnapshot.create({
    data: {
      quote_id,
      version_number,
      snapshot_json,
      published_at: new Date(),
      published_by,
      is_current: true,
    },
  });

  return newSnapshot;
}
