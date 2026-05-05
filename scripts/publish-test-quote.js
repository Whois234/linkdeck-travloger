/**
 * One-off script: publish the test Kerala quote in Supabase
 * Run: node scripts/publish-test-quote.js
 */
const { PrismaClient, QuoteStatus } = require('@prisma/client');
const prisma = new PrismaClient();

const QUOTE_ID = 'cmoh2o6fn0006uxywteg42z9e';

async function main() {
  const quote = await prisma.quote.findUnique({
    where: { id: QUOTE_ID },
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

  if (!quote) throw new Error('Quote not found');
  if (quote.quote_options.length === 0) throw new Error('No quote options — create them first');

  console.log('Quote:', quote.quote_number, '| options:', quote.quote_options.length);

  // State-level inclusions, exclusions, policies
  const [inclusions, exclusions, policies] = await Promise.all([
    prisma.inclusionExclusion.findMany({ where: { type: 'INCLUSION', destination_id: quote.state_id, status: true } }),
    prisma.inclusionExclusion.findMany({ where: { type: 'EXCLUSION', destination_id: quote.state_id, status: true } }),
    prisma.policy.findMany({ where: { state_id: quote.state_id, status: true } }),
  ]);

  // Enrich option hotels with names
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

  // Mark any existing snapshots as non-current
  await prisma.quoteSnapshot.updateMany({
    where: { quote_id: QUOTE_ID },
    data: { is_current: false },
  });

  // Create new snapshot
  const snapshot = await prisma.quoteSnapshot.create({
    data: {
      quote_id: QUOTE_ID,
      version_number: 1,
      snapshot_json,
      published_by: 'system',
      is_current: true,
    },
  });

  // Update quote status to SENT
  const updated = await prisma.quote.update({
    where: { id: QUOTE_ID },
    data: { status: QuoteStatus.SENT },
  });

  console.log('✅ Snapshot created! ID:', snapshot.id);
  console.log('✅ Quote status:', updated.status);
  console.log('✅ Public token:', updated.public_token);
  console.log('');
  console.log('🌐 Test URL: https://travloger-itinerary.vercel.app/itinerary/' + updated.public_token);
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
