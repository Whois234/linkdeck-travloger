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

  // Resolve inclusions, exclusions, policies from state
  const [inclusions, exclusions, policies] = await Promise.all([
    prisma.inclusionExclusion.findMany({
      where: { type: 'INCLUSION', destination_id: quote.state_id, status: true },
    }),
    prisma.inclusionExclusion.findMany({
      where: { type: 'EXCLUSION', destination_id: quote.state_id, status: true },
    }),
    prisma.policy.findMany({
      where: { state_id: quote.state_id, status: true },
    }),
  ]);

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
    state: quote.state,
    quote_options: enrichedOptions,
    day_snapshots: quote.day_snapshots,
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
