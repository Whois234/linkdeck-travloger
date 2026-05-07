import { McpServer } from '@/lib/mcp/mcp-server-shim';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { SupplierType, HotelType, HotelCategory, ActivityRateType } from '@prisma/client';

function text(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] };
}
function errText(msg: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
}

export function registerMasterTools(server: McpServer) {

  // ── States ────────────────────────────────────────────────────────────────

  server.tool('get_states', 'List all active states', {}, async () => {
    try {
      const states = await prisma.state.findMany({
        where: { status: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, country: true, trip_id_prefix: true },
      });
      return text({ count: states.length, states });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_state', 'Add a new state', {
    name:           z.string().min(1).describe('State name e.g. Goa'),
    code:           z.string().min(2).max(10).describe('Unique code e.g. GOA'),
    trip_id_prefix: z.string().min(1).describe('Prefix used in quote numbers e.g. GD'),
    country:        z.string().optional().describe('Country name, default India'),
    description:    z.string().optional().describe('Optional description'),
  }, async ({ name, code, trip_id_prefix, country, description }) => {
    try {
      const state = await prisma.state.create({
        data: { name, code: code.toUpperCase(), trip_id_prefix, country: country ?? 'India', description: description ?? null },
      });
      return text({ success: true, state });
    } catch (e) { return errText(String(e)); }
  });

  // ── Destinations ─────────────────────────────────────────────────────────

  server.tool('get_destinations', 'List all active destinations', {
    state_id: z.string().optional().describe('Filter by state ID'),
  }, async ({ state_id }) => {
    try {
      const destinations = await prisma.destination.findMany({
        where: { status: true, ...(state_id ? { state_id } : {}) },
        orderBy: { name: 'asc' },
        include: { state: { select: { name: true, code: true } } },
      });
      return text({ count: destinations.length, destinations });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_destination', 'Add a new destination', {
    state_id:          z.string().describe('State ID this destination belongs to'),
    name:              z.string().min(1).describe('Destination name e.g. Gokarna'),
    country:           z.string().optional().default('India').describe('Country name, default India'),
    short_description: z.string().optional().describe('One-line description'),
    long_description:  z.string().optional().describe('Full description'),
    best_season:       z.string().optional().describe('Best time to visit'),
    ideal_nights:      z.number().int().min(1).optional().describe('Recommended nights'),
    hero_image:        z.string().url().optional().describe('Hero image URL'),
    gallery_images:    z.array(z.string().url()).optional().describe('Gallery image URLs'),
    tags:              z.array(z.string()).optional().describe('Tags e.g. ["beach","adventure"]'),
  }, async ({ state_id, name, country, short_description, long_description, best_season, ideal_nights, hero_image, gallery_images, tags }) => {
    try {
      const dest = await prisma.destination.create({
        data: {
          state_id, name,
          country: country ?? 'India',
          short_description: short_description ?? null,
          long_description: long_description ?? null,
          best_season: best_season ?? null,
          ideal_nights: ideal_nights ?? null,
          hero_image: hero_image ?? null,
          gallery_images: gallery_images ?? [],
          tags: tags ?? [],
        },
      });
      return text({ success: true, destination: dest });
    } catch (e) { return errText(String(e)); }
  });

  // ── Suppliers ─────────────────────────────────────────────────────────────

  server.tool('get_suppliers', 'List all active suppliers', {
    type: z.enum(['HOTEL', 'VEHICLE', 'ACTIVITY', 'DMC', 'OTHER']).optional().describe('Filter by supplier type'),
  }, async ({ type }) => {
    try {
      const suppliers = await prisma.supplier.findMany({
        where: { status: true, ...(type ? { supplier_type: type as SupplierType } : {}) },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, supplier_type: true, contact_person: true, phone: true, email: true },
      });
      return text({ count: suppliers.length, suppliers });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_supplier', 'Add a new supplier', {
    name:            z.string().min(1).describe('Supplier / vendor name'),
    supplier_type:   z.enum(['HOTEL', 'VEHICLE', 'ACTIVITY', 'DMC', 'OTHER']).describe('Supplier type'),
    contact_person:  z.string().optional().describe('Contact person name'),
    phone:           z.string().optional().describe('Phone number'),
    whatsapp:        z.string().optional().describe('WhatsApp number'),
    email:           z.string().email().optional().describe('Email address'),
    address:         z.string().optional().describe('Full address'),
    gst_number:      z.string().optional().describe('GST registration number'),
    payment_terms:   z.string().optional().describe('Payment terms e.g. "50% advance"'),
    notes:           z.string().optional().describe('Internal notes'),
  }, async ({ name, supplier_type, contact_person, phone, whatsapp, email, address, gst_number, payment_terms, notes }) => {
    try {
      const supplier = await prisma.supplier.create({
        data: {
          name, supplier_type: supplier_type as SupplierType,
          contact_person: contact_person ?? null, phone: phone ?? null,
          whatsapp: whatsapp ?? null, email: email ?? null,
          address: address ?? null, gst_number: gst_number ?? null,
          payment_terms: payment_terms ?? null, notes: notes ?? null,
        },
      });
      return text({ success: true, supplier });
    } catch (e) { return errText(String(e)); }
  });

  // ── Hotels ────────────────────────────────────────────────────────────────

  server.tool('get_hotels', 'List hotels, optionally filter by destination', {
    destination_id: z.string().optional().describe('Destination ID to filter'),
    star_rating:    z.number().int().min(1).max(5).optional().describe('Filter by star rating'),
  }, async ({ destination_id, star_rating }) => {
    try {
      const hotels = await prisma.hotel.findMany({
        where: {
          status: true,
          ...(destination_id ? { destination_id } : {}),
          ...(star_rating !== undefined ? { star_rating } : {}),
        },
        orderBy: { hotel_name: 'asc' },
        include: {
          destination: { select: { name: true } },
          supplier: { select: { name: true } },
          room_categories: { select: { id: true, room_category_name: true, max_adults: true } },
        },
      });
      return text({ count: hotels.length, hotels });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_hotel', 'Add a new hotel', {
    destination_id:   z.string().describe('Destination ID'),
    hotel_name:       z.string().min(1).describe('Hotel name'),
    hotel_type:       z.enum(['HOTEL', 'RESORT', 'VILLA', 'HOMESTAY', 'HOUSEBOAT']).describe('Property type'),
    star_rating:      z.number().int().min(1).max(5).optional().describe('Star rating 1–5'),
    category_label:   z.enum(['BUDGET', 'STANDARD', 'DELUXE', 'PREMIUM', 'LUXURY']).optional(),
    hotel_description: z.string().optional().describe('Description'),
    address:          z.string().optional().describe('Full address'),
    phone:            z.string().optional().describe('Hotel phone'),
    email:            z.string().email().optional().describe('Hotel email'),
    supplier_id:      z.string().optional().describe('Linked supplier ID'),
    check_in_time:    z.string().optional().describe('e.g. 14:00'),
    check_out_time:   z.string().optional().describe('e.g. 11:00'),
    images:           z.array(z.string().url()).optional().describe('Image URLs'),
  }, async ({ destination_id, hotel_name, hotel_type, star_rating, category_label, hotel_description, address, phone, email, supplier_id, check_in_time, check_out_time, images }) => {
    try {
      const hotel = await prisma.hotel.create({
        data: {
          destination_id, hotel_name,
          hotel_type: hotel_type as HotelType,
          star_rating: star_rating ?? null,
          category_label: (category_label as HotelCategory) ?? null,
          hotel_description: hotel_description ?? null,
          address: address ?? null, phone: phone ?? null, email: email ?? null,
          supplier_id: supplier_id ?? null,
          check_in_time: check_in_time ?? null, check_out_time: check_out_time ?? null,
          images: images ?? [],
        },
      });
      return text({ success: true, hotel });
    } catch (e) { return errText(String(e)); }
  });

  // ── Hotel Rooms ───────────────────────────────────────────────────────────

  server.tool('get_hotel_rooms', 'Get room categories for a hotel', {
    hotel_id: z.string().describe('Hotel ID'),
  }, async ({ hotel_id }) => {
    try {
      const rooms = await prisma.roomCategory.findMany({
        where: { hotel_id, status: true },
        include: {
          hotel_rates: {
            where: { status: true },
            include: { meal_plan: { select: { code: true, name: true } } },
            orderBy: { valid_from: 'asc' },
          },
        },
      });
      return text({ count: rooms.length, rooms });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_hotel_room', 'Add a room category with B2B pricing', {
    hotel_id:            z.string().describe('Hotel ID'),
    room_category_name:  z.string().min(1).describe('Room type name e.g. Deluxe Sea View'),
    description:         z.string().optional(),
    max_adults:          z.number().int().min(1).default(2),
    max_children:        z.number().int().min(0).default(1),
    max_total_occupancy: z.number().int().min(1).optional().describe('Max total occupancy (defaults to max_adults + max_children)'),
    bed_type:            z.string().optional().describe('e.g. King, Twin'),
    extra_bed_allowed:   z.boolean().default(false),
    // Rates (at least one meal plan required)
    rates: z.array(z.object({
      meal_plan_code: z.enum(['EP', 'CP', 'MAP', 'AP']).describe('EP=Room only, CP=+Breakfast, MAP=+Breakfast+Dinner, AP=All meals'),
      season_name:    z.string().default('Standard'),
      valid_from:     z.string().describe('ISO date e.g. 2025-01-01'),
      valid_to:       z.string().describe('ISO date e.g. 2025-12-31'),
      double_occupancy_cost: z.number().min(0).describe('B2B rate per night double occupancy'),
      single_occupancy_cost: z.number().min(0).optional().describe('Single occupancy rate'),
      extra_adult_cost:      z.number().min(0).optional().describe('Extra adult cost'),
      child_with_bed_cost:   z.number().min(0).optional().describe('Child with extra bed'),
      child_without_bed_cost:z.number().min(0).optional().describe('Child without bed'),
      tax_included:          z.boolean().default(false),
      supplier_gst_percent:  z.number().min(0).default(0),
    })).min(1).describe('Rate plans for this room'),
  }, async ({ hotel_id, room_category_name, description, max_adults, max_children, max_total_occupancy, bed_type, extra_bed_allowed, rates }) => {
    try {
      const room = await prisma.roomCategory.create({
        data: {
          hotel_id, room_category_name,
          description: description ?? null,
          max_adults, max_children,
          max_total_occupancy: max_total_occupancy ?? (max_adults + max_children),
          bed_type: bed_type ?? null,
          extra_bed_allowed,
        },
      });

      // Create hotel rates for each meal plan
      const createdRates = await Promise.all((rates as Array<{
        meal_plan_code: string; season_name: string;
        valid_from: string; valid_to: string;
        double_occupancy_cost: number; single_occupancy_cost?: number;
        extra_adult_cost?: number; child_with_bed_cost?: number;
        child_without_bed_cost?: number; tax_included: boolean;
        supplier_gst_percent: number;
      }>).map(async (r) => {
        const mealPlan = await prisma.mealPlan.findUnique({ where: { code: r.meal_plan_code as import('@prisma/client').MealPlanCode } });
        if (!mealPlan) throw new Error(`Meal plan ${r.meal_plan_code} not found`);
        return prisma.hotelRate.create({
          data: {
            hotel_id, room_category_id: room.id, meal_plan_id: mealPlan.id,
            season_name: r.season_name,
            valid_from: new Date(r.valid_from), valid_to: new Date(r.valid_to),
            double_occupancy_cost: r.double_occupancy_cost,
            single_occupancy_cost: r.single_occupancy_cost ?? r.double_occupancy_cost,
            extra_adult_cost: r.extra_adult_cost ?? 0,
            child_with_bed_cost: r.child_with_bed_cost ?? 0,
            child_without_bed_cost: r.child_without_bed_cost ?? 0,
            tax_included: r.tax_included,
            supplier_gst_percent: r.supplier_gst_percent,
          },
        });
      }));

      return text({ success: true, room, rates_created: createdRates.length });
    } catch (e) { return errText(String(e)); }
  });

  // ── Vehicle Types ─────────────────────────────────────────────────────────

  server.tool('get_vehicle_types', 'List all active vehicle types', {}, async () => {
    try {
      const types = await prisma.vehicleType.findMany({
        where: { status: true },
        orderBy: { vehicle_type: 'asc' },
        select: { id: true, vehicle_type: true, display_name: true, capacity: true, ac_available: true },
      });
      return text({ count: types.length, vehicle_types: types });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_vehicle_type', 'Add a new vehicle type', {
    vehicle_type:     z.string().min(1).describe('Internal type key e.g. TEMPO_TRAVELLER_12'),
    display_name:     z.string().min(1).describe('Display name e.g. Tempo Traveller 12 Seater'),
    capacity:         z.number().int().min(1).describe('Seating capacity'),
    luggage_capacity: z.number().int().min(0).optional().describe('Luggage count'),
    ac_available:     z.boolean().default(true).describe('Air-conditioned?'),
    description:      z.string().optional(),
  }, async ({ vehicle_type, display_name, capacity, luggage_capacity, ac_available, description }) => {
    try {
      const vt = await prisma.vehicleType.create({
        data: {
          vehicle_type, display_name, capacity,
          luggage_capacity: luggage_capacity ?? null,
          ac_available, description: description ?? null,
        },
      });
      return text({ success: true, vehicle_type: vt });
    } catch (e) { return errText(String(e)); }
  });

  // ── Vehicle Rates ─────────────────────────────────────────────────────────

  server.tool('get_vehicle_rates', 'Get vehicle package rates', {
    state_id:        z.string().optional().describe('Filter by state ID'),
    vehicle_type_id: z.string().optional().describe('Filter by vehicle type ID'),
  }, async ({ state_id, vehicle_type_id }) => {
    try {
      const rates = await prisma.vehiclePackageRate.findMany({
        where: {
          status: true,
          ...(state_id ? { state_id } : {}),
          ...(vehicle_type_id ? { vehicle_type_id } : {}),
        },
        include: {
          vehicle_type: { select: { display_name: true, capacity: true } },
          state: { select: { name: true } },
        },
        orderBy: { route_name: 'asc' },
      });
      return text({ count: rates.length, rates });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_vehicle_rate', 'Add a vehicle package rate for a route', {
    route_name:            z.string().min(1).describe('Route name e.g. Gokarna 3N4D Package'),
    state_id:              z.string().describe('State ID'),
    vehicle_type_id:       z.string().describe('Vehicle type ID'),
    start_city:            z.string().describe('Starting city'),
    end_city:              z.string().describe('Ending city'),
    duration_days:         z.number().int().min(1).describe('Package duration days'),
    duration_nights:       z.number().int().min(0).describe('Package duration nights'),
    base_cost:             z.number().min(0).describe('Base package cost in INR'),
    extra_day_cost:        z.number().min(0).optional().describe('Cost per extra day'),
    supplier_id:           z.string().optional().describe('Linked supplier ID'),
    valid_from:            z.string().describe('ISO date'),
    valid_to:              z.string().describe('ISO date'),
    destinations_covered:  z.array(z.string()).optional().describe('Destination IDs covered'),
    driver_bata_included:  z.boolean().default(true),
    toll_parking_included: z.boolean().default(false),
  }, async ({ route_name, state_id, vehicle_type_id, start_city, end_city, duration_days, duration_nights, base_cost, extra_day_cost, supplier_id, valid_from, valid_to, destinations_covered, driver_bata_included, toll_parking_included }) => {
    try {
      const rate = await prisma.vehiclePackageRate.create({
        data: {
          route_name, state_id, vehicle_type_id, start_city, end_city,
          duration_days, duration_nights, base_cost,
          extra_day_cost: extra_day_cost ?? 0,
          supplier_id: supplier_id ?? null,
          valid_from: new Date(valid_from), valid_to: new Date(valid_to),
          destinations_covered: destinations_covered ?? [],
          driver_bata_included, toll_parking_included,
        },
      });
      return text({ success: true, vehicle_rate: rate });
    } catch (e) { return errText(String(e)); }
  });

  // ── Activities ────────────────────────────────────────────────────────────

  server.tool('get_activities', 'List activities, optionally filter by destination', {
    destination_id: z.string().optional().describe('Destination ID'),
  }, async ({ destination_id }) => {
    try {
      const activities = await prisma.activity.findMany({
        where: { status: true, ...(destination_id ? { destination_id } : {}) },
        include: { destination: { select: { name: true } } },
        orderBy: { activity_name: 'asc' },
      });
      return text({ count: activities.length, activities });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_activity', 'Add a new activity', {
    destination_id: z.string().describe('Destination ID'),
    activity_name:  z.string().min(1).describe('Activity name'),
    activity_type:  z.string().optional().describe('e.g. Adventure, Cultural, Sightseeing'),
    duration:       z.string().optional().describe('e.g. 2 hours, Half day'),
    description:    z.string().optional(),
    adult_cost:     z.number().min(0).describe('Cost per adult in INR'),
    child_cost:     z.number().min(0).optional().describe('Cost per child'),
    rate_type:      z.enum(['PER_PERSON', 'PER_GROUP']).default('PER_PERSON'),
    supplier_id:    z.string().optional().describe('Linked supplier ID'),
    inclusions:     z.string().optional().describe('What is included'),
    exclusions:     z.string().optional().describe('What is excluded'),
  }, async ({ destination_id, activity_name, activity_type, duration, description, adult_cost, child_cost, rate_type, supplier_id, inclusions, exclusions }) => {
    try {
      const activity = await prisma.activity.create({
        data: {
          destination_id, activity_name,
          activity_type: activity_type ?? null,
          duration: duration ?? null,
          description: description ?? null,
          adult_cost, child_cost: child_cost ?? 0,
          rate_type: rate_type as ActivityRateType,
          supplier_id: supplier_id ?? null,
          inclusions: inclusions ?? null,
          exclusions: exclusions ?? null,
        },
      });
      return text({ success: true, activity });
    } catch (e) { return errText(String(e)); }
  });

  // ── Day Plans ─────────────────────────────────────────────────────────────

  server.tool('get_day_plans', 'List day plans, optionally by destination', {
    destination_id: z.string().optional().describe('Destination ID'),
  }, async ({ destination_id }) => {
    try {
      const plans = await prisma.dayPlan.findMany({
        where: { status: true, ...(destination_id ? { destination_id } : {}) },
        include: { destination: { select: { name: true } } },
        orderBy: { title: 'asc' },
      });
      return text({ count: plans.length, day_plans: plans });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_day_plan', 'Add a day plan with title, description, activities, meals', {
    destination_id:  z.string().describe('Destination ID'),
    title:           z.string().min(1).describe('Day plan title e.g. Gokarna Beach Day'),
    description:     z.string().optional().describe('Full description of the day'),
    short_description: z.string().optional().describe('One-line summary'),
    duration_label:  z.string().optional().describe('e.g. Full Day, Half Day'),
    linked_activities: z.array(z.string()).optional().describe('Activity IDs to link'),
    meals_included:  z.object({
      breakfast: z.boolean().optional(),
      lunch: z.boolean().optional(),
      dinner: z.boolean().optional(),
    }).optional().describe('Meals included'),
    internal_notes:  z.string().optional(),
    tags:            z.array(z.string()).optional().describe('Tags e.g. ["beach","relaxing"]'),
    default_image:   z.string().url().optional().describe('Default image URL'),
  }, async ({ destination_id, title, description, short_description, duration_label, linked_activities, meals_included, internal_notes, tags, default_image }) => {
    try {
      const plan = await prisma.dayPlan.create({
        data: {
          destination_id, title,
          description: description ?? null,
          short_description: short_description ?? null,
          duration_label: duration_label ?? null,
          linked_activities: linked_activities ?? [],
          meals_included: meals_included ?? {},
          internal_notes: internal_notes ?? null,
          tags: tags ?? [],
          default_image: default_image ?? null,
        },
      });
      return text({ success: true, day_plan: plan });
    } catch (e) { return errText(String(e)); }
  });

  // ── Inclusions & Exclusions ───────────────────────────────────────────────

  server.tool('get_inclusions', 'List all inclusion items', {
    destination_id: z.string().optional().describe('Filter by destination'),
  }, async ({ destination_id }) => {
    try {
      const items = await prisma.inclusionExclusion.findMany({
        where: { type: 'INCLUSION', status: true, ...(destination_id ? { destination_id } : {}) },
        orderBy: { text: 'asc' },
      });
      return text({ count: items.length, inclusions: items });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_inclusion', 'Add an inclusion item', {
    text:           z.string().min(1).describe('Inclusion text e.g. "All hotel taxes included"'),
    category:       z.enum(['HOTEL', 'TRANSFER', 'ACTIVITY', 'TAX', 'GENERAL']).default('GENERAL'),
    destination_id: z.string().optional().describe('Link to a specific destination'),
  }, async ({ text: itemText, category, destination_id }) => {
    try {
      const item = await prisma.inclusionExclusion.create({
        data: { type: 'INCLUSION', text: itemText, category, destination_id: destination_id ?? null },
      });
      return text({ success: true, inclusion: item });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('get_exclusions', 'List all exclusion items', {
    destination_id: z.string().optional().describe('Filter by destination'),
  }, async ({ destination_id }) => {
    try {
      const items = await prisma.inclusionExclusion.findMany({
        where: { type: 'EXCLUSION', status: true, ...(destination_id ? { destination_id } : {}) },
        orderBy: { text: 'asc' },
      });
      return text({ count: items.length, exclusions: items });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_exclusion', 'Add an exclusion item', {
    text:           z.string().min(1).describe('Exclusion text e.g. "Air tickets not included"'),
    category:       z.enum(['HOTEL', 'TRANSFER', 'ACTIVITY', 'TAX', 'GENERAL']).default('GENERAL'),
    destination_id: z.string().optional().describe('Link to a specific destination'),
  }, async ({ text: itemText, category, destination_id }) => {
    try {
      const item = await prisma.inclusionExclusion.create({
        data: { type: 'EXCLUSION', text: itemText, category, destination_id: destination_id ?? null },
      });
      return text({ success: true, exclusion: item });
    } catch (e) { return errText(String(e)); }
  });

  // ── Policies ──────────────────────────────────────────────────────────────

  server.tool('get_policies', 'List all active policies', {
    state_id:    z.string().optional().describe('Filter by state'),
    policy_type: z.enum(['PAYMENT', 'CANCELLATION', 'TERMS', 'FAQ', 'IMPORTANT_NOTE']).optional(),
  }, async ({ state_id, policy_type }) => {
    try {
      const policies = await prisma.policy.findMany({
        where: {
          status: true,
          ...(state_id ? { state_id } : {}),
          ...(policy_type ? { policy_type } : {}),
        },
        orderBy: { title: 'asc' },
      });
      return text({ count: policies.length, policies });
    } catch (e) { return errText(String(e)); }
  });

  server.tool('create_policy', 'Add a new policy', {
    title:       z.string().min(1).describe('Policy title'),
    content:     z.string().min(1).describe('Policy content / text'),
    policy_type: z.enum(['PAYMENT', 'CANCELLATION', 'TERMS', 'FAQ', 'IMPORTANT_NOTE']),
    applies_to:  z.enum(['GROUP', 'PRIVATE', 'BOTH']).default('BOTH'),
    state_id:    z.string().optional().describe('Restrict to a state'),
    destination_id: z.string().optional().describe('Restrict to a destination'),
  }, async ({ title, content, policy_type, applies_to, state_id, destination_id }) => {
    try {
      const policy = await prisma.policy.create({
        data: {
          title, content, policy_type,
          applies_to,
          state_id: state_id ?? null,
          destination_id: destination_id ?? null,
        },
      });
      return text({ success: true, policy });
    } catch (e) { return errText(String(e)); }
  });
}
