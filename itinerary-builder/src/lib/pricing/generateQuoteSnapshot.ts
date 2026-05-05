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

  // If no agent assigned to the quote, look up the Agent linked to the user who created this quote
  let resolvedAgent = quote.assigned_agent;
  if (!resolvedAgent && quote.created_by) {
    // First try Agent.user_account_id = created_by
    const linkedAgent = await prisma.agent.findFirst({
      where: { user_account_id: quote.created_by, status: true },
    });
    if (linkedAgent) {
      resolvedAgent = linkedAgent;
    } else {
      // Fall back: find the User's phone and use it to build a minimal agent stub
      const creatorUser = await prisma.user.findUnique({
        where: { id: quote.created_by },
        select: { id: true, name: true, phone: true },
      });
      if (creatorUser) {
        resolvedAgent = {
          id: creatorUser.id,
          user_account_id: creatorUser.id,
          name: creatorUser.name,
          role: 'Travel Expert',
          phone: creatorUser.phone ?? null,
          whatsapp: creatorUser.phone ?? null,
          email: null,
          photo: null,
          designation: 'Travel Consultant',
          rating: null,
          years_experience: null,
          speciality: null,
          available_hours: null,
          status: true,
          created_at: new Date(),
          updated_at: new Date(),
        };
      }
    }
  }

  // For group quotes: fetch the group template for name + hero image + policy IDs + cms_data inclusions
  let groupTemplate: {
    group_template_name: string;
    hero_image: string | null;
    cms_data: unknown;
    default_policy_ids: unknown;
  } | null = null;
  if (quote.group_template_id) {
    groupTemplate = await prisma.groupTemplate.findUnique({
      where: { id: quote.group_template_id },
      select: { group_template_name: true, hero_image: true, cms_data: true, default_policy_ids: true },
    });
  }

  // Fetch private template: hero_image + default_policy_ids + cms_data (for FAQs)
  let privateTemplateHero: string | null = null;
  let templatePolicyIds: string[] | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let templateCmsData: any = null;
  let templateInclusionIds: string[] | null = null;
  let templateExclusionIds: string[] | null = null;
  if (quote.private_template_id) {
    const pt = await prisma.privateTemplate.findUnique({
      where: { id: quote.private_template_id },
      select: { hero_image: true, default_policy_ids: true, cms_data: true, default_inclusion_ids: true, default_exclusion_ids: true },
    });
    privateTemplateHero = pt?.hero_image ?? null;
    templatePolicyIds    = Array.isArray(pt?.default_policy_ids)  ? (pt.default_policy_ids  as string[]) : null;
    templateInclusionIds = Array.isArray(pt?.default_inclusion_ids) ? (pt.default_inclusion_ids as string[]) : null;
    templateExclusionIds = Array.isArray(pt?.default_exclusion_ids) ? (pt.default_exclusion_ids as string[]) : null;
    templateCmsData      = pt?.cms_data ?? null;
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
        gallery_images: Array.isArray((td as unknown as { gallery_images?: string[] }).gallery_images)
          ? (td as unknown as { gallery_images: string[] }).gallery_images
          : null,
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
        gallery_images: Array.isArray((gd as unknown as { gallery_images?: string[] }).gallery_images)
          ? (gd as unknown as { gallery_images: string[] }).gallery_images
          : null,
        tags: null,
        transfers: gd.transfers ?? null,
      };
    });
  } else {
    resolvedDaySnapshots = [];
  }

  // For GROUP quotes: use group template's default_policy_ids if available
  const groupTemplatePolicyIds = Array.isArray(groupTemplate?.default_policy_ids)
    ? (groupTemplate!.default_policy_ids as string[])
    : null;
  const effectivePolicyIds = templatePolicyIds ?? groupTemplatePolicyIds;

  // For GROUP quotes: use cms_data inclusions/exclusions if defined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupCms = groupTemplate?.cms_data as any;
  const groupCmsInclusions: Array<{ id: string; text: string }> | null =
    Array.isArray(groupCms?.inclusions) && groupCms.inclusions.length > 0
      ? (groupCms.inclusions as string[]).map((text: string, i: number) => ({ id: `inc-${i}`, text }))
      : null;
  const groupCmsExclusions: Array<{ id: string; text: string }> | null =
    Array.isArray(groupCms?.exclusions) && groupCms.exclusions.length > 0
      ? (groupCms.exclusions as string[]).map((text: string, i: number) => ({ id: `exc-${i}`, text }))
      : null;

  // Destination IDs present in this quote's itinerary (used for destination-scoped inc/exc)
  const itineraryDestIds = Array.from(new Set(
    resolvedDaySnapshots
      .map((d: { destination_id?: string }) => d.destination_id)
      .filter(Boolean) as string[]
  ));

  // Helper: build the OR filter for inclusions/exclusions —
  //   rows where destination_id is NULL (global) OR matches a destination in the itinerary
  const incExcDestFilter = itineraryDestIds.length > 0
    ? { OR: [{ destination_id: null }, { destination_id: { in: itineraryDestIds } }] }
    : { destination_id: null };

  // Resolve inclusions, exclusions, and policies.
  // Priority for inclusions/exclusions:
  //   GROUP  → cms_data arrays (above)
  //   PRIVATE → template's default_inclusion/exclusion_ids list
  //   Fallback → global + destination-scoped rows from InclusionExclusion table
  const [dbInclusions, dbExclusions, rawPolicies] = await Promise.all([
    // Inclusions ─────────────────────────────────────────────────────────────
    groupCmsInclusions
      ? Promise.resolve([])                                     // GROUP: use cms_data
      : templateInclusionIds && templateInclusionIds.length > 0
        ? prisma.inclusionExclusion.findMany({                  // PRIVATE: template's explicit list
            where: { id: { in: templateInclusionIds }, status: true },
            orderBy: [{ category: 'asc' }],
          })
        : prisma.inclusionExclusion.findMany({                  // Fallback: global + itinerary dests
            where: { type: 'INCLUSION', status: true, ...incExcDestFilter },
            orderBy: [{ category: 'asc' }],
          }),

    // Exclusions ─────────────────────────────────────────────────────────────
    groupCmsExclusions
      ? Promise.resolve([])                                     // GROUP: use cms_data
      : templateExclusionIds && templateExclusionIds.length > 0
        ? prisma.inclusionExclusion.findMany({                  // PRIVATE: template's explicit list
            where: { id: { in: templateExclusionIds }, status: true },
            orderBy: [{ category: 'asc' }],
          })
        : prisma.inclusionExclusion.findMany({                  // Fallback: global + itinerary dests
            where: { type: 'EXCLUSION', status: true, ...incExcDestFilter },
            orderBy: [{ category: 'asc' }],
          }),

    // Policies ────────────────────────────────────────────────────────────────
    effectivePolicyIds && effectivePolicyIds.length > 0
      ? prisma.policy.findMany({
          where: { id: { in: effectivePolicyIds }, status: true },
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

  const inclusions = groupCmsInclusions ?? dbInclusions;
  const exclusions = groupCmsExclusions ?? dbExclusions;

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

  // Append custom FAQs from GROUP template cms_data
  if (
    groupCms?.faqs_enabled &&
    Array.isArray(groupCms?.custom_faqs) &&
    groupCms.custom_faqs.length > 0
  ) {
    groupCms.custom_faqs.forEach((faq: { question: string; answer: string }, i: number) => {
      if (faq.question?.trim()) {
        customFaqs.push({
          id: `grp-faq-${i}`,
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

  // Group package tier options (Standard / Deluxe etc.) from cms_data
  const groupPackageOptions: Array<{
    tier_name: string;
    is_most_popular: boolean;
    inclusions: string[];
    adult_price: number;
    child_price: number;
  }> = Array.isArray(groupCms?.package_options) ? groupCms.package_options : [];

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
      quote_name: quote.quote_name ?? (templateCmsData as Record<string,unknown>)?.tab_title as string | null ?? (groupCms as Record<string,unknown>)?.tab_title as string | null ?? groupTemplate?.group_template_name ?? null,
      quote_type: quote.quote_type,
      group_template_id: quote.group_template_id ?? null,
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
    agent: resolvedAgent,
    // state hero_image priority: cms state_gallery_image > template hero > state entity > first destination
    state: {
      ...quote.state,
      hero_image: ((groupCms as Record<string,unknown>)?.state_gallery_image as string | undefined || null)
        ?? ((templateCmsData as Record<string,unknown>)?.state_gallery_image as string | undefined || null)
        ?? groupTemplate?.hero_image ?? privateTemplateHero ?? quote.state.hero_image ?? firstDestHero ?? null,
      hero_images: (Array.isArray((templateCmsData as Record<string,unknown>)?.hero_images) && ((templateCmsData as Record<string,unknown>).hero_images as string[]).filter(Boolean).length > 1)
        ? ((templateCmsData as Record<string,unknown>).hero_images as string[]).filter(Boolean)
        : (Array.isArray((groupCms as Record<string,unknown>)?.hero_images) && ((groupCms as Record<string,unknown>).hero_images as string[]).filter(Boolean).length > 1)
          ? ((groupCms as Record<string,unknown>).hero_images as string[]).filter(Boolean)
          : null,
    },
    quote_options: enrichedOptions,
    group_package_options: groupPackageOptions,
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
