import {
  PrismaClient,
  HotelType,
  HotelCategory,
  MealPlanCode,
  SupplierType,
  ActivityRateType,
  PolicyType,
  PolicyAppliesTo,
  InclusionType,
  InclusionCategory,
  GroupBatchStatus,
  MarkupType,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Travloger Itinerary Builder...');

  // ─── State: Kerala ───────────────────────────────────────────────────────────
  const kerala = await prisma.state.upsert({
    where: { code: 'KER' },
    update: {},
    create: {
      name: 'Kerala',
      country: 'India',
      code: 'KER',
      trip_id_prefix: 'TRV-KER',
      description: 'God\'s Own Country — backwaters, tea estates, beaches, and spice gardens.',
      hero_image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1600',
      status: true,
    },
  });
  console.log('✅ State: Kerala');

  // ─── Destinations ─────────────────────────────────────────────────────────────
  const cochin = await prisma.destination.upsert({
    where: { id: 'dest-cochin' },
    update: {},
    create: {
      id: 'dest-cochin',
      state_id: kerala.id,
      name: 'Cochin',
      country: 'India',
      short_description: 'The Queen of the Arabian Sea',
      long_description: 'Cochin (Kochi) is a major port city on the south-west coast of India known for its well-preserved architecture, Chinese fishing nets, and vibrant arts scene.',
      best_season: 'October to March',
      ideal_nights: 1,
      latitude: 9.9312,
      longitude: 76.2673,
      default_pickup_points: ['Cochin Airport', 'Ernakulam Junction', 'Cochin Harbour Terminus'],
      default_drop_points: ['Cochin Airport', 'Ernakulam Junction'],
      hero_image: 'https://images.unsplash.com/photo-1591018534738-7e2a80dd2e39?w=1600',
      tags: ['Heritage', 'Port City', 'Culture', 'Colonial'],
      status: true,
    },
  });

  const munnar = await prisma.destination.upsert({
    where: { id: 'dest-munnar' },
    update: {},
    create: {
      id: 'dest-munnar',
      state_id: kerala.id,
      name: 'Munnar',
      country: 'India',
      short_description: 'The Tea Garden Paradise',
      long_description: 'Munnar is a hill station nestled in the Western Ghats at 1,600 metres. Famous for its vast tea plantations, rolling hills, and cool climate.',
      best_season: 'September to May',
      ideal_nights: 2,
      latitude: 10.0889,
      longitude: 77.0595,
      hero_image: 'https://images.unsplash.com/photo-1571983823232-c7af87ca0b79?w=1600',
      tags: ['Hill Station', 'Tea Gardens', 'Trekking', 'Nature'],
      status: true,
    },
  });

  const thekkady = await prisma.destination.upsert({
    where: { id: 'dest-thekkady' },
    update: {},
    create: {
      id: 'dest-thekkady',
      state_id: kerala.id,
      name: 'Thekkady',
      country: 'India',
      short_description: 'Spice Gardens and Wildlife',
      long_description: 'Thekkady is home to the Periyar Wildlife Sanctuary, famous for its elephant population, boat rides on Periyar Lake, and aromatic spice plantations.',
      best_season: 'October to June',
      ideal_nights: 1,
      latitude: 9.5994,
      longitude: 77.1700,
      hero_image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=1600',
      tags: ['Wildlife', 'Spice Garden', 'Jungle', 'Eco-tourism'],
      status: true,
    },
  });

  const alleppey = await prisma.destination.upsert({
    where: { id: 'dest-alleppey' },
    update: {},
    create: {
      id: 'dest-alleppey',
      state_id: kerala.id,
      name: 'Alleppey',
      country: 'India',
      short_description: 'The Venice of the East',
      long_description: 'Alleppey (Alappuzha) is synonymous with Kerala backwaters. Famous for houseboat cruises through tranquil canals, lagoons, and paddy fields.',
      best_season: 'November to February',
      ideal_nights: 1,
      latitude: 9.4981,
      longitude: 76.3388,
      hero_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600',
      tags: ['Backwaters', 'Houseboat', 'Canals', 'Beach'],
      status: true,
    },
  });
  console.log('✅ Destinations: Cochin, Munnar, Thekkady, Alleppey');

  // ─── Supplier ─────────────────────────────────────────────────────────────────
  const supplier = await prisma.supplier.upsert({
    where: { id: 'sup-green-valley' },
    update: {},
    create: {
      id: 'sup-green-valley',
      supplier_type: SupplierType.HOTEL,
      name: 'Green Valley Hotels',
      contact_person: 'Suresh Nair',
      phone: '+91-9876543210',
      email: 'contracts@greenvalleyhotels.in',
      gst_number: '32ABCDE1234F1Z5',
      status: true,
    },
  });
  console.log('✅ Supplier: Green Valley Hotels');

  // ─── Meal Plans ──────────────────────────────────────────────────────────────
  const mealPlans: Record<string, { id: string }> = {};
  const mealPlanData = [
    { code: MealPlanCode.EP, name: 'EP – Room Only', description: 'No meals included' },
    { code: MealPlanCode.CP, name: 'CP – Bed & Breakfast', description: 'Breakfast included' },
    { code: MealPlanCode.MAP, name: 'MAP – Half Board', description: 'Breakfast and dinner included' },
    { code: MealPlanCode.AP, name: 'AP – Full Board', description: 'All meals included' },
  ];
  for (const mp of mealPlanData) {
    const rec = await prisma.mealPlan.upsert({
      where: { code: mp.code },
      update: {},
      create: mp,
    });
    mealPlans[mp.code] = { id: rec.id };
  }
  console.log('✅ Meal Plans: EP, CP, MAP, AP');

  // ─── Helper: create hotel + rooms + rates ────────────────────────────────────
  async function createHotel(opts: {
    id: string;
    dest_id: string;
    name: string;
    type: HotelType;
    category: HotelCategory;
    rooms: Array<{
      id: string;
      name: string;
      maxAdults: number;
      maxChildren: number;
      cwb?: boolean;
      cwob?: boolean;
    }>;
    rates: {
      ep: { single: number; double: number; triple?: number; quad?: number };
      cp: { single: number; double: number; triple?: number; quad?: number };
      map: { single: number; double: number; triple?: number; quad?: number };
    };
  }) {
    const hotel = await prisma.hotel.upsert({
      where: { id: opts.id },
      update: {},
      create: {
        id: opts.id,
        destination_id: opts.dest_id,
        supplier_id: supplier.id,
        hotel_name: opts.name,
        hotel_type: opts.type,
        category_label: opts.category,
        check_in_time: '14:00',
        check_out_time: '11:00',
        status: true,
      },
    });

    for (const room of opts.rooms) {
      await prisma.roomCategory.upsert({
        where: { id: room.id },
        update: {},
        create: {
          id: room.id,
          hotel_id: hotel.id,
          room_category_name: room.name,
          max_adults: room.maxAdults,
          max_children: room.maxChildren,
          max_total_occupancy: room.maxAdults + room.maxChildren,
          extra_bed_allowed: true,
          cwb_allowed: room.cwb ?? false,
          cwob_allowed: room.cwob ?? false,
          status: true,
        },
      });

      const rateEntries: Array<[MealPlanCode, { single: number; double: number; triple?: number; quad?: number }]> = [
        [MealPlanCode.EP, opts.rates.ep],
        [MealPlanCode.CP, opts.rates.cp],
        [MealPlanCode.MAP, opts.rates.map],
      ];

      for (const [mpCode, rateValues] of rateEntries) {
        const rateId = `rate-${room.id}-${mpCode}`;
        await prisma.hotelRate.upsert({
          where: { id: rateId },
          update: {},
          create: {
            id: rateId,
            hotel_id: hotel.id,
            room_category_id: room.id,
            meal_plan_id: mealPlans[mpCode].id,
            season_name: 'Peak Season 2025-26',
            valid_from: new Date('2025-01-01'),
            valid_to: new Date('2026-12-31'),
            currency: 'INR',
            single_occupancy_cost: rateValues.single,
            double_occupancy_cost: rateValues.double,
            triple_occupancy_cost: rateValues.triple ?? null,
            quad_occupancy_cost: rateValues.quad ?? null,
            extra_adult_cost: Math.round(rateValues.double * 0.35),
            child_with_bed_cost: Math.round(rateValues.double * 0.25),
            child_without_bed_cost: Math.round(rateValues.double * 0.1),
            weekend_surcharge: Math.round(rateValues.double * 0.1),
            tax_included: false,
            status: true,
          },
        });
      }
    }
    return hotel;
  }

  // ─── Hotels: Munnar ──────────────────────────────────────────────────────────
  const teaValley = await createHotel({
    id: 'hotel-tea-valley',
    dest_id: munnar.id,
    name: 'Tea Valley Resort',
    type: HotelType.RESORT,
    category: HotelCategory.DELUXE,
    rooms: [
      { id: 'rc-tv-deluxe', name: 'Deluxe Room', maxAdults: 2, maxChildren: 1, cwb: true, cwob: true },
      { id: 'rc-tv-premium', name: 'Premium Room', maxAdults: 3, maxChildren: 1, cwb: true, cwob: true },
    ],
    rates: {
      ep: { single: 3500, double: 4500, triple: 5800 },
      cp: { single: 4000, double: 5200, triple: 6600 },
      map: { single: 4800, double: 6200, triple: 7800 },
    },
  });

  const blanketHotel = await createHotel({
    id: 'hotel-blanket',
    dest_id: munnar.id,
    name: 'Blanket Hotel',
    type: HotelType.HOTEL,
    category: HotelCategory.PREMIUM,
    rooms: [
      { id: 'rc-bh-deluxe', name: 'Deluxe Room', maxAdults: 2, maxChildren: 1, cwb: true, cwob: true },
      { id: 'rc-bh-premium', name: 'Premium Room', maxAdults: 3, maxChildren: 1, cwb: true, cwob: true },
    ],
    rates: {
      ep: { single: 5500, double: 7000, triple: 9000 },
      cp: { single: 6200, double: 8000, triple: 10200 },
      map: { single: 7500, double: 9500, triple: 12000 },
    },
  });

  // ─── Hotels: Thekkady ────────────────────────────────────────────────────────
  const spiceVillage = await createHotel({
    id: 'hotel-spice-village',
    dest_id: thekkady.id,
    name: 'Spice Village',
    type: HotelType.RESORT,
    category: HotelCategory.PREMIUM,
    rooms: [
      { id: 'rc-sv-deluxe', name: 'Deluxe Cottage', maxAdults: 2, maxChildren: 1, cwb: true, cwob: true },
      { id: 'rc-sv-premium', name: 'Premium Cottage', maxAdults: 2, maxChildren: 1, cwb: false, cwob: true },
    ],
    rates: {
      ep: { single: 6000, double: 8000 },
      cp: { single: 7000, double: 9500 },
      map: { single: 8500, double: 11500 },
    },
  });

  const elephantCourt = await createHotel({
    id: 'hotel-elephant-court',
    dest_id: thekkady.id,
    name: 'Elephant Court',
    type: HotelType.HOTEL,
    category: HotelCategory.DELUXE,
    rooms: [
      { id: 'rc-ec-deluxe', name: 'Deluxe Room', maxAdults: 2, maxChildren: 1, cwb: true, cwob: true },
      { id: 'rc-ec-premium', name: 'Premium Room', maxAdults: 3, maxChildren: 1, cwb: true, cwob: true },
    ],
    rates: {
      ep: { single: 3800, double: 5000, triple: 6500 },
      cp: { single: 4500, double: 5900, triple: 7600 },
      map: { single: 5500, double: 7200, triple: 9200 },
    },
  });

  // ─── Hotels: Alleppey ────────────────────────────────────────────────────────
  const fragrantNature = await createHotel({
    id: 'hotel-fragrant-nature',
    dest_id: alleppey.id,
    name: 'Fragrant Nature',
    type: HotelType.RESORT,
    category: HotelCategory.DELUXE,
    rooms: [
      { id: 'rc-fn-deluxe', name: 'Deluxe Room', maxAdults: 2, maxChildren: 1, cwb: true, cwob: true },
      { id: 'rc-fn-premium', name: 'Lake View Room', maxAdults: 2, maxChildren: 1, cwob: true },
    ],
    rates: {
      ep: { single: 4000, double: 5500 },
      cp: { single: 4800, double: 6500 },
      map: { single: 5800, double: 7800 },
    },
  });

  const lakePalace = await createHotel({
    id: 'hotel-lake-palace',
    dest_id: alleppey.id,
    name: 'Lake Palace Houseboat',
    type: HotelType.HOUSEBOAT,
    category: HotelCategory.LUXURY,
    rooms: [
      { id: 'rc-lp-deluxe', name: 'AC Bedroom (Houseboat)', maxAdults: 2, maxChildren: 1, cwob: true },
      { id: 'rc-lp-premium', name: 'Premium Suite (Houseboat)', maxAdults: 2, maxChildren: 0 },
    ],
    rates: {
      ep: { single: 9000, double: 12000 },
      cp: { single: 10500, double: 14000 },
      map: { single: 12500, double: 17000 },
    },
  });

  // ─── Hotels: Cochin ──────────────────────────────────────────────────────────
  const bruntonBoatyard = await createHotel({
    id: 'hotel-brunton-boatyard',
    dest_id: cochin.id,
    name: 'Brunton Boatyard',
    type: HotelType.HOTEL,
    category: HotelCategory.LUXURY,
    rooms: [
      { id: 'rc-bb-deluxe', name: 'Deluxe Room', maxAdults: 2, maxChildren: 1, cwob: true },
      { id: 'rc-bb-premium', name: 'Premium Sea View', maxAdults: 2, maxChildren: 0 },
    ],
    rates: {
      ep: { single: 10000, double: 14000 },
      cp: { single: 11500, double: 16000 },
      map: { single: 13500, double: 19000 },
    },
  });

  const fortHouse = await createHotel({
    id: 'hotel-fort-house',
    dest_id: cochin.id,
    name: 'Fort House Hotel',
    type: HotelType.HOTEL,
    category: HotelCategory.DELUXE,
    rooms: [
      { id: 'rc-fh-deluxe', name: 'Deluxe Room', maxAdults: 2, maxChildren: 1, cwb: true, cwob: true },
      { id: 'rc-fh-premium', name: 'Premium Room', maxAdults: 3, maxChildren: 1, cwb: true, cwob: true },
    ],
    rates: {
      ep: { single: 5000, double: 7000, triple: 9000 },
      cp: { single: 5800, double: 8000, triple: 10300 },
      map: { single: 7000, double: 9800, triple: 12500 },
    },
  });
  console.log('✅ Hotels: All 8 Kerala hotels with room categories and rates');

  // ─── Vehicle Types ────────────────────────────────────────────────────────────
  const sedan = await prisma.vehicleType.upsert({
    where: { id: 'vt-sedan' },
    update: {},
    create: {
      id: 'vt-sedan',
      vehicle_type: 'SEDAN',
      display_name: 'Sedan (Dzire / Etios)',
      capacity: 4,
      luggage_capacity: 2,
      ac_available: true,
      status: true,
    },
  });

  const innova = await prisma.vehicleType.upsert({
    where: { id: 'vt-innova' },
    update: {},
    create: {
      id: 'vt-innova',
      vehicle_type: 'SUV',
      display_name: 'Innova Crysta',
      capacity: 6,
      luggage_capacity: 4,
      ac_available: true,
      status: true,
    },
  });

  const tempo = await prisma.vehicleType.upsert({
    where: { id: 'vt-tempo' },
    update: {},
    create: {
      id: 'vt-tempo',
      vehicle_type: 'TEMPO_TRAVELLER',
      display_name: 'Tempo Traveller (12 Seater)',
      capacity: 12,
      luggage_capacity: 8,
      ac_available: true,
      status: true,
    },
  });
  console.log('✅ Vehicle Types: Sedan, Innova Crysta, Tempo Traveller');

  // ─── Vehicle Package Rates ────────────────────────────────────────────────────
  const vehicleRateData = [
    { id: 'vpr-sedan', vt: sedan, cost: 12000, extraDay: 2500 },
    { id: 'vpr-innova', vt: innova, cost: 16000, extraDay: 3500 },
    { id: 'vpr-tempo', vt: tempo, cost: 24000, extraDay: 5000 },
  ];
  for (const vr of vehicleRateData) {
    await prisma.vehiclePackageRate.upsert({
      where: { id: vr.id },
      update: {},
      create: {
        id: vr.id,
        route_name: 'Kerala Classic 5N/6D',
        state_id: kerala.id,
        start_city: 'Cochin',
        end_city: 'Cochin',
        destinations_covered: ['Cochin', 'Munnar', 'Thekkady', 'Alleppey'],
        duration_days: 6,
        duration_nights: 5,
        vehicle_type_id: vr.vt.id,
        base_cost: vr.cost,
        extra_day_cost: vr.extraDay,
        driver_bata_included: true,
        toll_parking_included: false,
        valid_from: new Date('2025-01-01'),
        valid_to: new Date('2026-12-31'),
        status: true,
      },
    });
  }
  console.log('✅ Vehicle Package Rates: Kerala 5N/6D for all vehicle types');

  // ─── Day Plans ────────────────────────────────────────────────────────────────
  const dayPlanData = [
    {
      id: 'dp-cochin-arrival',
      dest_id: cochin.id,
      title: 'Cochin Arrival & Fort Kochi Exploration',
      description: 'Arrive at Cochin International Airport and transfer to your hotel. After check-in, head out for a leisurely walk through the historic Fort Kochi area. Visit the iconic Chinese Fishing Nets, St. Francis Church (the oldest European church in India), and the Mattancherry Dutch Palace. Evening at leisure.',
      short_description: 'Arrival, Fort Kochi walk, Chinese Fishing Nets',
      duration_label: 'Half Day',
      default_image: 'https://images.unsplash.com/photo-1591018534738-7e2a80dd2e39?w=800',
      tags: ['Heritage', 'Arrival', 'Fort Kochi'],
    },
    {
      id: 'dp-munnar-1',
      dest_id: munnar.id,
      title: 'Drive to Munnar – Cheeyappara & Tea Gardens',
      description: 'After breakfast, drive from Cochin to Munnar (approx 130 km / 4 hours). En route, visit Cheeyappara Waterfalls and Valara Waterfalls. Enjoy a stop at a working tea plantation. Arrive Munnar, check in, and explore the local Munnar town market in the evening.',
      short_description: 'Cochin to Munnar drive, waterfalls en-route, tea factory visit',
      duration_label: 'Full Day',
      default_image: 'https://images.unsplash.com/photo-1571983823232-c7af87ca0b79?w=800',
      tags: ['Drive', 'Waterfalls', 'Tea Plantation'],
    },
    {
      id: 'dp-munnar-2',
      dest_id: munnar.id,
      title: 'Munnar Sightseeing – Eravikulam & Photo Point',
      description: 'Full day Munnar sightseeing. Visit Eravikulam National Park (home to the endangered Nilgiri Tahr), Mattupetty Dam, Echo Point, and Kundala Lake. Enjoy a boat ride at Kundala Lake. Visit Top Station for panoramic views.',
      short_description: 'Eravikulam Park, Mattupetty Dam, Echo Point, Top Station',
      duration_label: 'Full Day',
      default_image: 'https://images.unsplash.com/photo-1595655428169-5fa16f578966?w=800',
      tags: ['Wildlife', 'Scenic', 'Boat Ride'],
    },
    {
      id: 'dp-thekkady',
      dest_id: thekkady.id,
      title: 'Thekkady – Periyar Wildlife Sanctuary',
      description: 'Drive from Munnar to Thekkady through spice plantations. Visit a spice garden and learn about Kerala\'s famous cardamom, pepper, and vanilla. Enjoy a 1-hour boat ride on Periyar Lake for elephant and wildlife sightings. Evening cultural Kalaripayattu show.',
      short_description: 'Periyar boat ride, spice garden, Kalaripayattu show',
      duration_label: 'Full Day',
      default_image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800',
      tags: ['Wildlife', 'Spice Garden', 'Culture'],
    },
    {
      id: 'dp-alleppey',
      dest_id: alleppey.id,
      title: 'Alleppey Houseboat Cruise',
      description: 'Drive from Thekkady to Alleppey. Check in to your houseboat / resort. Enjoy a leisurely cruise through the backwater canals. Watch life along the waterways, local fishermen, paddy fields, and coconut groves. Overnight on the houseboat or beach resort.',
      short_description: 'Houseboat check-in, backwater cruise, village views',
      duration_label: 'Full Day',
      default_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
      tags: ['Houseboat', 'Backwaters', 'Sunset'],
    },
    {
      id: 'dp-cochin-departure',
      dest_id: cochin.id,
      title: 'Cochin Departure',
      description: 'After breakfast, drive from Alleppey to Cochin International Airport for your return flight. End of your memorable Kerala holiday.',
      short_description: 'Alleppey to Cochin airport transfer, departure',
      duration_label: 'Half Day',
      default_image: 'https://images.unsplash.com/photo-1591018534738-7e2a80dd2e39?w=800',
      tags: ['Departure'],
    },
  ];

  const dayPlans: Record<string, { id: string }> = {};
  for (const dp of dayPlanData) {
    const rec = await prisma.dayPlan.upsert({
      where: { id: dp.id },
      update: {},
      create: {
        id: dp.id,
        title: dp.title,
        destination_id: dp.dest_id,
        description: dp.description,
        short_description: dp.short_description,
        duration_label: dp.duration_label,
        default_image: dp.default_image,
        tags: dp.tags,
        status: true,
      },
    });
    dayPlans[dp.id] = { id: rec.id };
  }
  console.log('✅ Day Plans: 6 Kerala day plans');

  // ─── Inclusions & Exclusions ─────────────────────────────────────────────────
  const inclusionData = [
    { id: 'inc-accommodation', type: InclusionType.INCLUSION, category: InclusionCategory.HOTEL, text: 'Accommodation on double/triple sharing basis as per selected package' },
    { id: 'inc-breakfast', type: InclusionType.INCLUSION, category: InclusionCategory.HOTEL, text: 'Daily breakfast at hotel' },
    { id: 'inc-vehicle', type: InclusionType.INCLUSION, category: InclusionCategory.TRANSFER, text: 'Entire trip transportation in AC vehicle as per itinerary' },
    { id: 'inc-driver', type: InclusionType.INCLUSION, category: InclusionCategory.TRANSFER, text: 'Driver bata and road expenses included' },
    { id: 'inc-airport', type: InclusionType.INCLUSION, category: InclusionCategory.TRANSFER, text: 'Airport / railway station pick-up and drop' },
    { id: 'inc-boatride', type: InclusionType.INCLUSION, category: InclusionCategory.ACTIVITY, text: 'Periyar Lake boat ride (1 hour shared)' },
    { id: 'inc-houseboat', type: InclusionType.INCLUSION, category: InclusionCategory.ACTIVITY, text: 'Houseboat cruise with all meals (MAP)' },
    { id: 'exc-flights', type: InclusionType.EXCLUSION, category: InclusionCategory.TRANSFER, text: 'Airfare / train fare to and from destination' },
    { id: 'exc-meals', type: InclusionType.EXCLUSION, category: InclusionCategory.HOTEL, text: 'Meals other than specified in the package' },
    { id: 'exc-personal', type: InclusionType.EXCLUSION, category: InclusionCategory.GENERAL, text: 'Personal expenses: tips, laundry, phone calls, shopping' },
    { id: 'exc-entry', type: InclusionType.EXCLUSION, category: InclusionCategory.ACTIVITY, text: 'Monument/park entry fees unless specified' },
    { id: 'exc-gst', type: InclusionType.EXCLUSION, category: InclusionCategory.TAX, text: 'GST applicable as per government norms' },
    { id: 'exc-insurance', type: InclusionType.EXCLUSION, category: InclusionCategory.GENERAL, text: 'Travel insurance' },
    { id: 'exc-porterage', type: InclusionType.EXCLUSION, category: InclusionCategory.GENERAL, text: 'Porterage at hotels and airports' },
  ];

  for (const inc of inclusionData) {
    await prisma.inclusionExclusion.upsert({
      where: { id: inc.id },
      update: {},
      create: { ...inc, destination_id: null, status: true },
    });
  }
  console.log('✅ Inclusions & Exclusions: 14 standard Kerala items');

  // ─── Policies ─────────────────────────────────────────────────────────────────
  const policyData = [
    {
      id: 'pol-payment-kerala',
      policy_type: PolicyType.PAYMENT,
      title: 'Payment Policy',
      applies_to: PolicyAppliesTo.BOTH,
      content: `• 25% advance payment required to confirm booking
• Balance 75% to be paid 7 days before departure
• For peak season (Dec–Jan) bookings: 50% advance required
• Payment accepted via bank transfer / UPI / credit card
• Bank charges for international transfers to be borne by the customer`,
    },
    {
      id: 'pol-cancellation-kerala',
      policy_type: PolicyType.CANCELLATION,
      title: 'Cancellation Policy',
      applies_to: PolicyAppliesTo.BOTH,
      content: `• 30+ days before departure: 10% cancellation charges
• 15–29 days before departure: 25% cancellation charges
• 7–14 days before departure: 50% cancellation charges
• Less than 7 days before departure: 100% no refund
• No-show: 100% no refund
• Cancellations during peak season (Dec 20 – Jan 10): 50% charges applicable from day of booking`,
    },
    {
      id: 'pol-important-kerala',
      policy_type: PolicyType.IMPORTANT_NOTE,
      title: 'Important Notes',
      applies_to: PolicyAppliesTo.BOTH,
      content: `• Check-in time is 2:00 PM and check-out is 11:00 AM at all hotels
• Early check-in and late check-out subject to availability and may incur extra charges
• Hotels reserve the right to substitute properties of equivalent category in case of unavailability
• Vehicle type is subject to availability; an equivalent vehicle may be substituted
• Houseboat check-in is at 12:00 noon and check-out is 9:00 AM
• For Eravikulam National Park, entry is subject to park opening (closed during calving season Feb–Apr)
• All prices are per person on twin/triple sharing basis unless stated otherwise
• Travloger acts as a service coordinator and is not responsible for natural calamities or political disruptions`,
    },
    {
      id: 'pol-terms-kerala',
      policy_type: PolicyType.TERMS,
      title: 'Terms & Conditions',
      applies_to: PolicyAppliesTo.BOTH,
      content: `• This quote is valid for 7 days from the date of issue
• Prices are subject to change based on availability at the time of confirmation
• Travloger reserves the right to alter the itinerary for operational reasons
• The company is not liable for any delays, accidents, or losses during the trip
• All disputes are subject to Kochi jurisdiction`,
    },
  ];

  for (const pol of policyData) {
    await prisma.policy.upsert({
      where: { id: pol.id },
      update: {},
      create: { ...pol, state_id: kerala.id, status: true },
    });
  }
  console.log('✅ Policies: Payment, Cancellation, Important Notes, Terms');

  // ─── Agent ────────────────────────────────────────────────────────────────────
  const agent = await prisma.agent.upsert({
    where: { id: 'agent-rahul' },
    update: {},
    create: {
      id: 'agent-rahul',
      name: 'Rahul Sharma',
      role: 'Sales',
      phone: '+91-9876541234',
      whatsapp: '+91-9876541234',
      email: 'rahul@travloger.com',
      designation: 'Senior Travel Consultant',
      rating: 4.8,
      years_experience: 10,
      speciality: 'Kerala & South India Specialist',
      available_hours: 'Mon–Sat 9AM–7PM',
      status: true,
    },
  });
  console.log('✅ Agent: Rahul Sharma');

  // ─── Private Template: Kerala Classic 5N/6D ──────────────────────────────────
  const privateTemplate = await prisma.privateTemplate.upsert({
    where: { id: 'tmpl-kerala-classic' },
    update: {},
    create: {
      id: 'tmpl-kerala-classic',
      template_name: 'Kerala Classic 5N/6D',
      state_id: kerala.id,
      destinations: ['Cochin', 'Munnar', 'Thekkady', 'Alleppey'],
      duration_days: 6,
      duration_nights: 5,
      start_city: 'Cochin',
      end_city: 'Cochin',
      default_pickup_point: 'Cochin International Airport',
      default_drop_point: 'Cochin International Airport',
      theme: 'Backwaters & Hill Stations',
      default_vehicle_route_id: 'vpr-innova',
      default_inclusion_ids: ['inc-accommodation', 'inc-breakfast', 'inc-vehicle', 'inc-driver', 'inc-airport', 'inc-boatride', 'inc-houseboat'],
      default_exclusion_ids: ['exc-flights', 'exc-meals', 'exc-personal', 'exc-entry', 'exc-gst', 'exc-insurance'],
      default_policy_ids: ['pol-payment-kerala', 'pol-cancellation-kerala', 'pol-important-kerala', 'pol-terms-kerala'],
      hero_image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1600',
      status: true,
    },
  });

  const templateDays = [
    { day: 1, dest: cochin.id, nightDest: cochin.id, title: 'Arrival in Cochin', planId: 'dp-cochin-arrival' },
    { day: 2, dest: munnar.id, nightDest: munnar.id, title: 'Cochin → Munnar Drive', planId: 'dp-munnar-1' },
    { day: 3, dest: munnar.id, nightDest: munnar.id, title: 'Munnar Sightseeing', planId: 'dp-munnar-2' },
    { day: 4, dest: thekkady.id, nightDest: thekkady.id, title: 'Munnar → Thekkady', planId: 'dp-thekkady' },
    { day: 5, dest: alleppey.id, nightDest: alleppey.id, title: 'Thekkady → Alleppey Houseboat', planId: 'dp-alleppey' },
    { day: 6, dest: cochin.id, nightDest: null, title: 'Alleppey → Cochin Departure', planId: 'dp-cochin-departure' },
  ];

  for (const td of templateDays) {
    await prisma.templateDay.upsert({
      where: { id: `td-kerala-${td.day}` },
      update: {},
      create: {
        id: `td-kerala-${td.day}`,
        template_id: privateTemplate.id,
        day_number: td.day,
        destination_id: td.dest,
        night_destination_id: td.nightDest,
        title: td.title,
        day_plan_id: td.planId,
        sort_order: td.day,
      },
    });
  }

  // Hotel tiers: Standard / Deluxe / Premium per destination
  const hotelTierData = [
    // Standard tier
    { id: 'tht-std-munnar', tier: 'Standard', dest: munnar.id, hotel: teaValley.id, rc: 'rc-tv-deluxe', mp: mealPlans[MealPlanCode.CP].id, nights: 2, order: 1 },
    { id: 'tht-std-thekkady', tier: 'Standard', dest: thekkady.id, hotel: elephantCourt.id, rc: 'rc-ec-deluxe', mp: mealPlans[MealPlanCode.CP].id, nights: 1, order: 2 },
    { id: 'tht-std-alleppey', tier: 'Standard', dest: alleppey.id, hotel: fragrantNature.id, rc: 'rc-fn-deluxe', mp: mealPlans[MealPlanCode.MAP].id, nights: 1, order: 3 },
    { id: 'tht-std-cochin', tier: 'Standard', dest: cochin.id, hotel: fortHouse.id, rc: 'rc-fh-deluxe', mp: mealPlans[MealPlanCode.CP].id, nights: 1, order: 4 },
    // Deluxe tier
    { id: 'tht-dlx-munnar', tier: 'Deluxe', dest: munnar.id, hotel: teaValley.id, rc: 'rc-tv-premium', mp: mealPlans[MealPlanCode.MAP].id, nights: 2, order: 1 },
    { id: 'tht-dlx-thekkady', tier: 'Deluxe', dest: thekkady.id, hotel: spiceVillage.id, rc: 'rc-sv-deluxe', mp: mealPlans[MealPlanCode.MAP].id, nights: 1, order: 2 },
    { id: 'tht-dlx-alleppey', tier: 'Deluxe', dest: alleppey.id, hotel: lakePalace.id, rc: 'rc-lp-deluxe', mp: mealPlans[MealPlanCode.MAP].id, nights: 1, order: 3 },
    { id: 'tht-dlx-cochin', tier: 'Deluxe', dest: cochin.id, hotel: fortHouse.id, rc: 'rc-fh-premium', mp: mealPlans[MealPlanCode.MAP].id, nights: 1, order: 4 },
    // Premium tier
    { id: 'tht-prm-munnar', tier: 'Premium', dest: munnar.id, hotel: blanketHotel.id, rc: 'rc-bh-premium', mp: mealPlans[MealPlanCode.MAP].id, nights: 2, order: 1 },
    { id: 'tht-prm-thekkady', tier: 'Premium', dest: thekkady.id, hotel: spiceVillage.id, rc: 'rc-sv-premium', mp: mealPlans[MealPlanCode.MAP].id, nights: 1, order: 2 },
    { id: 'tht-prm-alleppey', tier: 'Premium', dest: alleppey.id, hotel: lakePalace.id, rc: 'rc-lp-premium', mp: mealPlans[MealPlanCode.MAP].id, nights: 1, order: 3 },
    { id: 'tht-prm-cochin', tier: 'Premium', dest: cochin.id, hotel: bruntonBoatyard.id, rc: 'rc-bb-deluxe', mp: mealPlans[MealPlanCode.MAP].id, nights: 1, order: 4 },
  ];

  for (const t of hotelTierData) {
    await prisma.templateHotelTier.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        template_id: privateTemplate.id,
        tier_name: t.tier,
        destination_id: t.dest,
        default_hotel_id: t.hotel,
        default_room_category_id: t.rc,
        default_meal_plan_id: t.mp,
        nights: t.nights,
        sort_order: t.order,
      },
    });
  }
  console.log('✅ Private Template: Kerala Classic 5N/6D with days and hotel tiers');

  // ─── Group Template ───────────────────────────────────────────────────────────
  const groupTemplate = await prisma.groupTemplate.upsert({
    where: { id: 'gtmpl-kerala-classic' },
    update: {},
    create: {
      id: 'gtmpl-kerala-classic',
      group_template_name: 'Kerala Group Classic 5N/6D',
      state_id: kerala.id,
      destinations: ['Cochin', 'Munnar', 'Thekkady', 'Alleppey'],
      duration_days: 6,
      duration_nights: 5,
      hero_image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1600',
      status: true,
    },
  });

  for (const td of templateDays) {
    await prisma.groupTemplateDay.upsert({
      where: { id: `gtd-kerala-${td.day}` },
      update: {},
      create: {
        id: `gtd-kerala-${td.day}`,
        group_template_id: groupTemplate.id,
        day_number: td.day,
        destination_id: td.dest,
        title: td.title,
        day_plan_id: td.planId,
        sort_order: td.day,
      },
    });
  }
  console.log('✅ Group Template: Kerala Group Classic 5N/6D');

  // ─── Group Batch ──────────────────────────────────────────────────────────────
  await prisma.groupBatch.upsert({
    where: { id: 'gbatch-mar-2026' },
    update: {},
    create: {
      id: 'gbatch-mar-2026',
      group_template_id: groupTemplate.id,
      batch_name: 'Kerala March 2026 – Group Departure',
      start_date: new Date('2026-03-15'),
      end_date: new Date('2026-03-20'),
      total_seats: 20,
      available_seats: 20,
      adult_price: 18000,
      child_5_12_price: 12000,
      child_below_5_price: 0,
      single_supplement: 4000,
      gst_percent: 5,
      fixed_inclusions: ['inc-accommodation', 'inc-breakfast', 'inc-vehicle', 'inc-driver', 'inc-boatride', 'inc-houseboat'],
      fixed_exclusions: ['exc-flights', 'exc-meals', 'exc-personal', 'exc-entry', 'exc-gst'],
      fixed_policies: ['pol-payment-kerala', 'pol-cancellation-kerala', 'pol-important-kerala'],
      booking_status: GroupBatchStatus.OPEN,
      assigned_agent_id: agent.id,
      status: true,
    },
  });
  console.log('✅ Group Batch: Kerala March 2026 departure');

  // ─── Users ────────────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Travloger@2026', 12);
  const userAccounts = [
    { id: 'user-admin', email: 'admin@travloger.in', name: 'Admin User', role: UserRole.ADMIN },
    { id: 'user-sales', email: 'sales@travloger.in', name: 'Sales User', role: UserRole.SALES },
    { id: 'user-ops', email: 'ops@travloger.in', name: 'Ops User', role: UserRole.OPS },
  ];

  for (const u of userAccounts) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hashedPassword },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        password: hashedPassword,
        role: u.role,
        status: true,
      },
    });
  }
  console.log('✅ Users: admin@travloger.in, sales@travloger.in, ops@travloger.in (password: Travloger@2026)');

  // ─── Link agent to sales user ─────────────────────────────────────────────────
  await prisma.agent.update({
    where: { id: agent.id },
    data: { user_account_id: 'user-sales' },
  });
  console.log('✅ Agent linked to sales user');

  console.log('\n🎉 Seed complete! Travloger Itinerary Builder is ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
