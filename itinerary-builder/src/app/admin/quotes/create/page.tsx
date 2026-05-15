'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import MultiStateSelect from '@/components/MultiStateSelect';
import PhoneInput, { combinePhone, parsePhone } from '@/components/PhoneInput';
import {
  Users, MapPin, LayoutList, DollarSign, FileText, Link2,
  Check, Copy, ExternalLink, ChevronRight, Plus, Minus,
  Star, Car, ChevronDown, ChevronUp, Loader2, GripVertical, Send,
} from 'lucide-react';

/* ─── Style tokens ─── */
const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor: '#E2E8F0' };
const T     = '#134956';
const card  = { border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

/** Distribute `adults` across rooms (max 2 per room), last room gets remainder */
function makeRoomsConfig(adults: number): { pax: number }[] {
  const numRooms = Math.max(1, Math.ceil(adults / 2));
  return Array.from({ length: numRooms }, (_, i) => ({
    pax: i < numRooms - 1 ? 2 : adults - (numRooms - 1) * 2,
  }));
}

/* ─── Types ─── */
interface State        { id: string; name: string; code: string }
interface VehicleType  { id: string; display_name: string; capacity: number }
interface VehRate      { id: string; route_name: string; vehicle_type_id: string; duration_days: number; base_cost: number; state_id: string; start_city: string; end_city: string }
interface MealPlan     { id: string; code: string; name: string }
interface Hotel        { id: string; hotel_name: string; destination_id: string; star_rating: number | null; category_label: string; room_categories: { id: string; room_category_name: string }[] }
interface PT           { id: string; template_name: string; duration_days: number; duration_nights: number; state_id: string; hero_image?: string | null; theme?: string | null; destinations: string[]; template_hotel_tiers: HTier[]; template_days: TDay[]; cms_data: CMSData | null }
interface GT           { id: string; group_template_name: string; duration_days: number; duration_nights: number; state_id: string; hero_image?: string | null; group_batches: GBatch[] }
interface GBatch       { id: string; batch_name: string; start_date: string; end_date: string; total_seats: number; available_seats: number; adult_price: number; booking_status: string }
interface HTier        { tier_name: string; destination_id: string; default_hotel_id: string | null; default_room_category_id: string | null; default_meal_plan_id: string | null; nights: number }
interface TDay         { day_number: number; destination_id: string; title: string }
interface CMSData      { package_options?: Array<{ tier_name: string; is_most_popular: boolean }> }
interface Dest         { id: string; name: string }
interface City         { id: string; name: string; state_id: string }

interface RoomConfig { pax: number }

interface MealOverrideDay { breakfast: boolean; lunch: boolean; dinner: boolean }

interface ActivityOption {
  id: string; activity_name: string; activity_type: string | null;
  duration: string | null; description: string | null;
  adult_cost: number; child_cost: number | null;
  rate_type: string; // 'PER_PERSON' | 'PER_GROUP'
  destination_id: string; destination: { name: string };
}
interface SelectedAct { adults: number; children: number; quantity: number }

interface HotelRow {
  destination_id: string;
  hotel_id: string;
  room_category_id: string;
  meal_plan_id: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  rooms: number;           // kept for API compat — equals rooms_config.length
  rooms_config: RoomConfig[]; // per-room pax split
  adults_per_room: number;
  cwb: number;
  cwob: number;
  fetched_price: number | null;
  fetching: boolean;
  fetch_error: string | null;   // error message from rate lookup
  manual_cost: number | null;   // agent-entered fallback when no rate exists
  meal_overrides: Record<string, MealOverrideDay>; // date → B/L/D override; empty = auto
}

interface OptionDraft {
  name: string;
  is_most_popular: boolean;
  hotels: HotelRow[];
}

const STAR_OPTIONS = [1, 2, 3, 4, 5] as const;
type StarRating = typeof STAR_OPTIONS[number];

const PRIVATE_STEPS = [
  { id: 1, label: 'Basics',     icon: Users      },
  { id: 2, label: 'Package',    icon: LayoutList },
  { id: 3, label: 'Hotels',     icon: MapPin     },
  { id: 4, label: 'Vehicle',    icon: Car        },
  { id: 5, label: 'Activities', icon: Star       },
  { id: 6, label: 'Summary',    icon: DollarSign },
  { id: 7, label: 'Share',      icon: Link2      },
];
const GROUP_STEPS = [
  { id: 1, label: 'Customer',  icon: Users      },
  { id: 2, label: 'Tour',      icon: LayoutList },
  { id: 3, label: 'Share',     icon: Link2      },
];

const OPTION_NAMES = ['Option A', 'Option B', 'Option C'];

/* ════════════════════════════════════════════════════════ */
export default function CreateQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* ─── Global ─── */
  const [step, setStep]           = useState(1);
  const [quoteType, setQuoteType] = useState<'PRIVATE' | 'GROUP'>('PRIVATE');
  const [saving, setSaving]       = useState(false);
  const [errMsg, setErrMsg]       = useState('');
  const [copied, setCopied]       = useState(false);
  const [createdQuote, setCreatedQuote] = useState<{ id: string; quote_number: string; public_token: string } | null>(null);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  /* ─── Step 1 fields ─── */
  const [quoteName, setQuoteName]     = useState('');
  const [custName, setCustName]       = useState(searchParams.get('lead_name') ?? '');
  const _rawPhone = searchParams.get('lead_phone') ?? '';
  const _parsed   = parsePhone(_rawPhone);
  const [phoneCode,  setPhoneCode]  = useState(_parsed.code);
  const [phoneLocal, setPhoneLocal] = useState(_parsed.local || _rawPhone);
  const custMobile = combinePhone(phoneCode, phoneLocal);
  const [custEmail, setCustEmail]     = useState(searchParams.get('lead_email') ?? '');
  const [stateIds, setStateIds]       = useState<string[]>([]);
  const stateId = stateIds[0] ?? ''; // primary state (backward compat)
  const [startDate, setStartDate]     = useState('');
  const [durationDays, setDurationDays] = useState(5);
  const [adults, setAdults]           = useState(2);
  const [children512, setChildren512] = useState(0);
  const [childrenBelow5, setChildrenBelow5] = useState(0);
  const [hotelCategory, setHotelCategory] = useState<StarRating>(3);
  const [expiryDate, setExpiryDate]   = useState('');

  /* ─── Step 2 ─── */
  const [privateTpls, setPrivateTpls] = useState<PT[]>([]);
  const [groupTpls,   setGroupTpls]   = useState<GT[]>([]);
  const [selectedPT,  setSelectedPT]  = useState<PT | null>(null);
  const [selectedGT,  setSelectedGT]  = useState<GT | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<GBatch | null>(null);

  /* ─── Step 1 extra — pickup/drop ─── */
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation]     = useState('');

  /* ─── Step 3 ─── */
  const [options, setOptions]         = useState<OptionDraft[]>([]);
  const [expandedOpt, setExpandedOpt] = useState<number>(0);

  /* ─── Step 3 drag state ─── */
  const dragRef = useRef<{ field: number; fromIndex: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<{ field: number; index: number } | null>(null);

  /* ─── Step 3 meal-override expand state (key = `${oi}-${hi}`) ─── */
  const [expandedMealRows, setExpandedMealRows] = useState<Set<string>>(new Set());

  /* ─── Step 4 ─── */
  const [vehicleTypeId, setVehicleTypeId] = useState('');
  const [vehicleCost, setVehicleCost]     = useState(0);

  /* ─── Step 5 activities ─── */
  const [availableActivities, setAvailableActivities] = useState<ActivityOption[]>([]);
  const [loadingActs, setLoadingActs] = useState(false);
  // optionActs[optionIndex][activityId] = { adults, children, quantity }
  const [optionActs, setOptionActs] = useState<Record<number, Record<string, SelectedAct>>>({});
  const [activeActTab, setActiveActTab] = useState(0);

  /* ─── Step 6 margins ─── */
  const [profitType, setProfitType]   = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [profitValue, setProfitValue] = useState(30);
  const [gstPercent, setGstPercent]   = useState(5);
  const [includeGst, setIncludeGst]   = useState(true);
  const [discountType, setDiscountType]   = useState<'FLAT' | 'PERCENTAGE'>('FLAT');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountValidTill, setDiscountValidTill] = useState('');
  const [discountNote, setDiscountNote]   = useState('');
  const [calcResults, setCalcResults] = useState<Record<string, { final_price: number; hotel_cost: number; base_cost: number; profit_amount: number; gst_amount: number; selling_before_gst: number }>>({});
  const [calculating, setCalculating] = useState(false);

  /* ─── Hotel rates cache: hotel_id → { room_category_id, meal_plan_id }[] ─── */
  const [hotelRatesCache, setHotelRatesCache] = useState<Record<string, { room_category_id: string; meal_plan_id: string }[]>>({});

  /* ─── Reference data ─── */
  const [states,    setStates]    = useState<State[]>([]);
  const [dests,     setDests]     = useState<Dest[]>([]);
  const [hotels,    setHotels]    = useState<Hotel[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [vehTypes,  setVehTypes]  = useState<VehicleType[]>([]);
  const [vehRates,  setVehRates]  = useState<VehRate[]>([]);
  const [cities,    setCities]    = useState<City[]>([]);

  const steps     = quoteType === 'PRIVATE' ? PRIVATE_STEPS : GROUP_STEPS;
  const totalSteps = steps.length;
  const today      = new Date().toISOString().slice(0, 10);

  /* computed end date */
  const endDate = startDate
    ? new Date(new Date(startDate).getTime() + (durationDays - 1) * 86400000).toISOString().slice(0, 10)
    : '';
  const durationNights = durationDays - 1;

  /* ─── Load reference data once ─── */
  useEffect(() => {
    Promise.all([
      fetch('/api/v1/states').then(r => r.json()),
      fetch('/api/v1/destinations').then(r => r.json()),
      fetch('/api/v1/meal-plans').then(r => r.json()),
      fetch('/api/v1/vehicle-types').then(r => r.json()),
    ]).then(([sd, dd, md, vd]) => {
      if (sd.success) setStates(sd.data);
      if (dd.success) setDests(dd.data);
      if (md.success) setMealPlans(md.data);
      if (vd.success) setVehTypes(vd.data);
    });
  }, []);

  /* ─── Load hotels + veh rates + cities when state(s) change ─── */
  useEffect(() => {
    if (!stateIds.length) return;
    const stateParam = stateIds.length === 1 ? `state_id=${stateIds[0]}` : `state_ids=${stateIds.join(',')}`;
    Promise.all([
      fetch(`/api/v1/hotels?${stateParam}`).then(r => r.json()),
      fetch(`/api/v1/vehicle-package-rates?${stateParam}`).then(r => r.json()),
      fetch(`/api/v1/cities?${stateParam}`).then(r => r.json()),
    ]).then(([hd, vd, cd]) => {
      if (hd.success) setHotels(hd.data);
      if (vd.success) setVehRates(vd.data);
      if (cd.success) setCities(cd.data);
    });
  }, [stateIds]);

  /* ─── Load activities when step 5 is reached ─── */
  useEffect(() => {
    if (step !== 5 || availableActivities.length > 0) return;
    setLoadingActs(true);
    // Collect all unique destination_ids from all option hotels
    const destIds = Array.from(new Set(options.flatMap(o => o.hotels.map(h => h.destination_id)).filter(Boolean)));
    const url = destIds.length === 1
      ? `/api/v1/activities?destination_id=${destIds[0]}`
      : '/api/v1/activities';
    fetch(url).then(r => r.json()).then(d => {
      if (d.success) setAvailableActivities(Array.isArray(d.data) ? d.data : []);
    }).finally(() => setLoadingActs(false));
  }, [step]);

  /* ─── Compute total activity cost for an option ─── */
  function computeActivityCost(oi: number): number {
    const acts = optionActs[oi] ?? {};
    return availableActivities.reduce((sum, act) => {
      const sel = acts[act.id];
      if (!sel) return sum;
      if (act.rate_type === 'PER_PERSON') {
        return sum + act.adult_cost * sel.adults + (act.child_cost ?? 0) * sel.children;
      }
      return sum + act.adult_cost * sel.quantity;
    }, 0);
  }

  /* ─── Auto-suggest vehicle when entering step 4 ─── */
  useEffect(() => {
    if (step !== 4 || !vehTypes.length || vehicleTypeId) return;
    const totalPax = adults + children512; // total pax to seat
    // Pick smallest vehicle type whose capacity >= totalPax, else largest available
    const sorted = [...vehTypes].sort((a, b) => a.capacity - b.capacity);
    const fit    = sorted.find(v => v.capacity >= totalPax) ?? sorted[sorted.length - 1];
    if (fit) autoFillVehicle(fit.id);
  }, [step, vehTypes]);

  /* ─── Load templates when step 2 is reached ─── */
  useEffect(() => {
    if (step !== 2 || !stateIds.length) return;
    const stateParam = stateIds.length === 1 ? `state_id=${stateIds[0]}` : `state_ids=${stateIds.join(',')}`;
    if (quoteType === 'PRIVATE') {
      fetch(`/api/v1/private-templates?${stateParam}`).then(r => r.json()).then(d => { if (d.success) setPrivateTpls(Array.isArray(d.data) ? d.data : []); });
    } else {
      fetch(`/api/v1/group-templates?state_id=${stateId}`).then(r => r.json()).then(d => { if (d.success) setGroupTpls(Array.isArray(d.data) ? d.data : []); });
    }
  }, [step, stateIds, quoteType]);

  /* ─── Scaffold options when template selected ─── */
  const scaffoldOptions = useCallback((tpl: PT) => {
    const pkgOptions = tpl.cms_data?.package_options ?? [
      { tier_name: 'Standard', is_most_popular: false },
      { tier_name: 'Deluxe',   is_most_popular: true  },
    ];

    // Sort destinations by their first appearance in template_days (preserves intended itinerary order)
    const rawDests = tpl.destinations as string[];
    const dayOrderMap = new Map<string, number>();
    (tpl.template_days ?? []).forEach(d => {
      if (!dayOrderMap.has(d.destination_id)) dayOrderMap.set(d.destination_id, d.day_number);
    });
    const destList = [...rawDests].sort((a, b) => (dayOrderMap.get(a) ?? 99) - (dayOrderMap.get(b) ?? 99));

    const nightsTotal = tpl.duration_nights || durationNights;

    const newOpts: OptionDraft[] = pkgOptions.slice(0, 3).map((pkg, oi) => {
      let cursorMs = startDate ? new Date(startDate).getTime() : Date.now();

      // Build rows with tier-defined nights
      const rows: ({ did: string; n: number; tier: typeof tpl.template_hotel_tiers[0] | undefined })[] = destList.map(did => {
        const tier = tpl.template_hotel_tiers?.find(t => t.tier_name === pkg.tier_name && t.destination_id === did);
        const n = tier?.nights ?? Math.max(1, Math.floor(nightsTotal / Math.max(1, destList.length)));
        return { did, n, tier };
      }).filter(r => r.n > 0);

      // Fix total night count: if tier nights don't sum to nightsTotal, add remainder to last destination
      const allocatedNights = rows.reduce((s, r) => s + r.n, 0);
      if (allocatedNights < nightsTotal && rows.length > 0) {
        rows[rows.length - 1].n += nightsTotal - allocatedNights;
      }

      const hotels: HotelRow[] = rows.map(({ did, n, tier }) => {
        const checkIn  = new Date(cursorMs).toISOString().slice(0, 10);
        cursorMs += n * 86400000;
        const checkOut = new Date(cursorMs).toISOString().slice(0, 10);
        const defaultRooms = Math.max(1, Math.ceil(adults / 2));
        return {
          destination_id: did,
          hotel_id: tier?.default_hotel_id ?? '',
          room_category_id: tier?.default_room_category_id ?? '',
          meal_plan_id: tier?.default_meal_plan_id ?? '',
          check_in_date: checkIn,
          check_out_date: checkOut,
          nights: n,
          rooms: makeRoomsConfig(adults).length,
          rooms_config: makeRoomsConfig(adults),
          adults_per_room: 2,
          cwb: children512,
          cwob: childrenBelow5,
          fetched_price: null,
          fetching: false,
          fetch_error: null,
          manual_cost: null,
          meal_overrides: {},
        };
      });

      // Pre-fetch rates for any pre-filled hotels
      hotels.forEach(h => { if (h.hotel_id) fetchHotelRates(h.hotel_id); });

      return { name: OPTION_NAMES[oi] ?? `Option ${oi + 1}`, is_most_popular: pkg.is_most_popular, hotels };
    });
    setOptions(newOpts);
    setExpandedOpt(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, adults, children512, childrenBelow5, durationNights]);

  useEffect(() => {
    if (selectedPT) scaffoldOptions(selectedPT);
  }, [selectedPT, scaffoldOptions]);

  /* ─── Auto-fetch prices for fully-configured hotel rows that have no price yet ─── */
  useEffect(() => {
    options.forEach((opt, oi) => {
      opt.hotels.forEach((h, hi) => {
        if (h.hotel_id && h.room_category_id && h.meal_plan_id && h.check_in_date && h.check_out_date
            && h.fetched_price === null && !h.fetching && !h.fetch_error) {
          triggerPriceFetch(oi, hi, h);
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.map(o => o.hotels.map(h => `${h.hotel_id}|${h.room_category_id}|${h.meal_plan_id}|${h.check_in_date}|${h.check_out_date}|${h.rooms_config.length}`).join(',')).join(';')]);

  /* ─── Auto-fill vehicle cost — prefer exact duration match ─── */
  function autoFillVehicle(vtId: string) {
    setVehicleTypeId(vtId);
    if (!vtId) { setVehicleCost(0); return; }
    const pickup = pickupLocation.trim().toLowerCase();
    const drop   = dropLocation.trim().toLowerCase();
    // Prefer city-matched rates, fall back to any rate for this vehicle type
    const cityRates = vehRates.filter(r =>
      r.vehicle_type_id === vtId &&
      (!pickup || r.start_city.trim().toLowerCase() === pickup) &&
      (!drop   || r.end_city.trim().toLowerCase()   === drop)
    );
    const pool = cityRates.length > 0 ? cityRates : vehRates.filter(r => r.vehicle_type_id === vtId);
    // First try exact duration match, then fall back to closest
    const exactMatch = pool.find(r => r.duration_days === durationDays);
    if (exactMatch) { setVehicleCost(exactMatch.base_cost); return; }
    const closest = [...pool].sort((a, b) => Math.abs(a.duration_days - durationDays) - Math.abs(b.duration_days - durationDays));
    setVehicleCost(closest[0]?.base_cost ?? 0);
  }

  /* ─── Helper: all dates in a hotel stay (check-in inclusive, check-out exclusive) ─── */
  function getDatesInRange(checkIn: string, checkOut: string): string[] {
    if (!checkIn || !checkOut) return [];
    const dates: string[] = [];
    let cur = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    while (cur < end) {
      dates.push(new Date(cur).toISOString().slice(0, 10));
      cur += 86400000;
    }
    return dates;
  }

  /* ─── Fetch & cache hotel rates when a hotel is selected ─── */
  async function fetchHotelRates(hotelId: string) {
    if (!hotelId || hotelRatesCache[hotelId]) return;
    try {
      const res = await fetch(`/api/v1/hotels/${hotelId}/rates`);
      const d   = await res.json();
      if (d.success) {
        setHotelRatesCache(prev => ({
          ...prev,
          [hotelId]: (d.data as { room_category_id: string; meal_plan_id: string }[]).map(r => ({
            room_category_id: r.room_category_id,
            meal_plan_id: r.meal_plan_id,
          })),
        }));
      }
    } catch { /* silent */ }
  }

  /* ─── Hotel row updater ─── */
  function updHotel(oi: number, hi: number, patch: Partial<HotelRow>) {
    setOptions(prev => prev.map((o, i) => {
      if (i !== oi) return o;
      return { ...o, hotels: o.hotels.map((h, j) => j === hi ? { ...h, ...patch } : h) };
    }));
  }

  /* ─── Most popular toggle (only one at a time) ─── */
  function toggleMostPopular(oi: number) {
    setOptions(prev => prev.map((o, i) => ({ ...o, is_most_popular: i === oi ? !o.is_most_popular : false })));
  }

  /* ─── Fetch hotel price for a single row ─── */
  const fetchPriceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function triggerPriceFetch(oi: number, hi: number, row: HotelRow) {
    const key = `${oi}-${hi}`;
    clearTimeout(fetchPriceRef.current[key]);
    if (!row.hotel_id || !row.room_category_id || !row.meal_plan_id || !row.check_in_date || !row.check_out_date) return;
    updHotel(oi, hi, { fetching: true, fetched_price: null, fetch_error: null });
    fetchPriceRef.current[key] = setTimeout(async () => {
      try {
        const res = await fetch('/api/v1/hotel-rate-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotel_id: row.hotel_id, room_category_id: row.room_category_id, meal_plan_id: row.meal_plan_id,
            check_in_date: new Date(row.check_in_date).toISOString(),
            check_out_date: new Date(row.check_out_date).toISOString(),
            rooms_config: row.rooms_config, cwb: row.cwb, cwob: row.cwob,
          }),
        });
        const d = await res.json();
        if (res.ok) {
          updHotel(oi, hi, { fetching: false, fetched_price: d.data?.total_cost ?? null, fetch_error: null });
        } else {
          // Rate not found — surface error so agent can enter manually
          updHotel(oi, hi, { fetching: false, fetched_price: null, fetch_error: d.error ?? 'No rate found for selected dates' });
        }
      } catch {
        updHotel(oi, hi, { fetching: false, fetched_price: null, fetch_error: 'Network error' });
      }
    }, 600);
  }

  function updHotelAndFetch(oi: number, hi: number, patch: Partial<HotelRow>) {
    setOptions(prev => {
      const next = prev.map((o, i) => {
        if (i !== oi) return o;
        return { ...o, hotels: o.hotels.map((h, j) => j === hi ? { ...h, ...patch } : h) };
      });
      const updatedRow = next[oi].hotels[hi];
      setTimeout(() => triggerPriceFetch(oi, hi, updatedRow), 0);
      return next;
    });
  }

  /** Effective price for a hotel row — fetched rate if available, else manual override */
  function effectivePrice(h: HotelRow): number {
    return h.fetched_price ?? h.manual_cost ?? 0;
  }

  /* ─── Live comparison calc ─── */
  function liveCalc(opt: OptionDraft, oi: number = 0) {
    const hotelTotal   = opt.hotels.reduce((s, h) => s + effectivePrice(h), 0);
    const activityCost = computeActivityCost(oi);
    const baseCost     = hotelTotal + vehicleCost + activityCost;
    const profitAmt    = profitType === 'PERCENTAGE' ? baseCost * profitValue / 100 : profitValue;
    const beforeGst    = Math.max(0, baseCost + profitAmt);
    const discountAmt  = discountValue > 0
      ? (discountType === 'PERCENTAGE' ? beforeGst * discountValue / 100 : discountValue)
      : 0;
    const afterDiscount  = Math.max(0, beforeGst - discountAmt);
    const effectiveGstPct = includeGst ? gstPercent : 0;
    const gstAmt         = afterDiscount * effectiveGstPct / 100;
    return { hotelTotal, activityCost, baseCost, profitAmt, beforeGst, discountAmt, afterDiscount, gstAmt, total: afterDiscount + gstAmt };
  }

  /* ─── Create/ensure customer ─── */
  async function ensureCustomer(): Promise<string | null> {
    const res = await fetch('/api/v1/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: custName, phone: custMobile, email: custEmail || null }),
    });
    const d = await res.json();
    if (d.success) return d.data.id;
    // May already exist — try searching
    const search = await fetch(`/api/v1/customers?q=${encodeURIComponent(custMobile)}`).then(r => r.json());
    if (search.success && search.data.length > 0) return search.data[0].id;
    return null;
  }

  /* ─── Full publish flow ─── */
  async function publishAndGenerate() {
    setSaving(true); setErrMsg(''); setCalculating(true);
    try {
      // 1. Customer
      const customerId = await ensureCustomer();
      if (!customerId) { setErrMsg('Could not create or find customer. Check mobile number.'); return; }

      // 2. Create quote
      const payload = {
        quote_name: quoteName || selectedGT?.group_template_name || selectedPT?.template_name || null,
        quote_type: quoteType,
        customer_id: customerId,
        lead_id: searchParams.get('lead_id') || null,
        state_id: stateId,
        state_ids: stateIds,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        duration_days: durationDays,
        duration_nights: durationNights,
        adults,
        children_5_12: children512,
        children_below_5: childrenBelow5,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
        private_template_id: selectedPT?.id ?? null,
        group_template_id: selectedGT?.id ?? null,
        group_batch_id: selectedBatch?.id ?? null,
        pickup_point: pickupLocation || null,
        drop_point: dropLocation || null,
      };
      const qRes = await fetch('/api/v1/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const qData = await qRes.json();
      if (!qRes.ok) { setErrMsg(qData.error ?? 'Failed to create quote'); return; }
      const quoteId: string = qData.data.id;

      // 3. Calculate pricing (saves quote_options to DB)
      const calcPayload = {
        options: options.map((opt, oi) => ({
          option_name: opt.name,
          display_order: oi + 1,
          is_most_popular: opt.is_most_popular,
          vehicle_type_id: vehicleTypeId || null,
          vehicle_cost: vehicleCost,
          activity_cost: computeActivityCost(oi), transfer_cost: 0, misc_cost: 0,
          profit_type: profitType,
          profit_value: profitValue,
          discount_type: discountType,
          discount_amount: discountValue,
          discount_valid_till: discountValidTill ? new Date(discountValidTill).toISOString() : null,
          discount_expires_at: discountValidTill ? new Date(discountValidTill).toISOString() : null,
          discount_note: discountNote || null,
          gst_percent: includeGst ? gstPercent : 0,
          rounding_rule: 'NONE',
          internal_notes: null,
          customer_visible_notes: null,
          hotels: opt.hotels.filter(h => h.hotel_id && h.room_category_id && h.meal_plan_id).map(h => ({
            destination_id: h.destination_id,
            hotel_id: h.hotel_id,
            room_category_id: h.room_category_id,
            meal_plan_id: h.meal_plan_id,
            check_in_date: new Date(h.check_in_date).toISOString(),
            check_out_date: new Date(h.check_out_date).toISOString(),
            rooming_json: {
              rooms: h.rooms_config.map((rc, ri) => ({ type: 'Double', count: 1, room_number: ri + 1, adults: rc.pax, children_with_bed: 0, children_without_bed: 0 })),
              ...(h.meal_overrides && Object.keys(h.meal_overrides).length > 0 ? { meal_overrides: h.meal_overrides } : {}),
            },
            manual_cost_override: h.manual_cost ?? null,
            override_reason: h.manual_cost != null ? 'No rate configured for dates' : null,
          })),
        })),
      };
      const cRes = await fetch(`/api/v1/quotes/${quoteId}/calculate-pricing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calcPayload),
      });
      const cData = await cRes.json();
      if (!cRes.ok) { setErrMsg(cData.error ?? 'Pricing calculation failed'); return; }

      // Store results for summary display
      const results: typeof calcResults = {};
      (cData.data ?? []).forEach((o: { option_name: string; pricing: typeof calcResults[string] }) => { results[o.option_name] = o.pricing; });
      setCalcResults(results);

      // 4. Publish — returns token immediately (snapshot runs in background)
      const pRes = await fetch(`/api/v1/quotes/${quoteId}/publish`, { method: 'POST' });
      const pData = await pRes.json();
      if (!pRes.ok) { setErrMsg(pData.error ?? 'Failed to publish quote'); return; }

      // Show success screen immediately — don't wait for snapshot
      setCreatedQuote({ id: quoteId, quote_number: qData.data.quote_number, public_token: pData.data.public_token ?? qData.data.public_token });
      setStep(quoteType === 'PRIVATE' ? 7 : 3);

      // 5. Fire snapshot generation in background — client keeps the request alive
      fetch(`/api/v1/quotes/${quoteId}/snapshot`, { method: 'POST' }).catch(() => {});

    } finally {
      setSaving(false); setCalculating(false);
    }
  }

  /* ─── Group publish ─── */
  async function publishGroup() {
    if (!selectedGT || !selectedBatch) { setErrMsg('Please select a group tour and batch'); return; }
    setSaving(true); setErrMsg('');
    try {
      const customerId = await ensureCustomer();
      if (!customerId) { setErrMsg('Could not create or find customer.'); return; }
      const batchStart = selectedBatch.start_date.slice(0, 10);
      const batchEnd   = selectedBatch.end_date.slice(0, 10);
      const payload = {
        quote_type: 'GROUP',
        customer_id: customerId,
        state_id: stateId,
        start_date: new Date(batchStart).toISOString(),
        end_date: new Date(batchEnd).toISOString(),
        duration_days: selectedGT.duration_days,
        duration_nights: selectedGT.duration_nights,
        adults,
        children_5_12: children512,
        children_below_5: childrenBelow5,
        group_template_id: selectedGT.id,
        group_batch_id: selectedBatch.id,
      };
      const qRes = await fetch('/api/v1/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const qData = await qRes.json();
      if (!qRes.ok) { setErrMsg(qData.error ?? 'Failed to create'); return; }
      const quoteId = qData.data.id;
      const pRes  = await fetch(`/api/v1/quotes/${quoteId}/publish`, { method: 'POST' });
      const pData = await pRes.json();
      if (!pRes.ok) { setErrMsg(pData.error ?? 'Failed to publish'); return; }
      // Show success screen immediately
      setCreatedQuote({ id: quoteId, quote_number: qData.data.quote_number, public_token: pData.data.public_token ?? qData.data.public_token });
      setStep(3);
      // Fire snapshot in background
      fetch(`/api/v1/quotes/${quoteId}/snapshot`, { method: 'POST' }).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  /* ─── Navigation ─── */
  async function goNext() {
    setErrMsg('');
    if (step === 1) {
      if (!custName.trim()) { setErrMsg('Customer name is required'); return; }
      if (!custMobile.trim()) { setErrMsg('Mobile number is required'); return; }
      if (!stateIds.length) { setErrMsg('Please select at least one state'); return; }
      // Travel start date only required for PRIVATE quotes (GROUP gets dates from the batch)
      if (quoteType === 'PRIVATE' && !startDate) { setErrMsg('Please select a start date'); return; }
      setStep(2);
    } else if (step === 2) {
      if (quoteType === 'PRIVATE' && !selectedPT) { setErrMsg('Please select a package'); return; }
      if (quoteType === 'GROUP') {
        if (!selectedGT) { setErrMsg('Please select a group tour'); return; }
        if (!selectedBatch) { setErrMsg('Please select a batch'); return; }
        await publishGroup();
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      setStep(6);
    } else if (step === 6) {
      await publishAndGenerate();
    }
  }
  function goBack() { if (step > 1) setStep(s => s - 1); }

  async function copyLink() {
    if (!createdQuote) return;
    const url = `${window.location.origin}/quotations/${createdQuote.public_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendGallaboxTemplate() {
    if (!createdQuote || sendingTemplate) return;
    setSendingTemplate(true); setTemplateMsg(null);
    try {
      const res = await fetch('/api/gallabox/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:        custMobile,
          contactName:  custName,
          templateName: 'itinerary_ready',
          buttonUrl:    createdQuote.public_token,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) setTemplateMsg({ ok: true,  text: 'Template sent via Gallabox ✅' });
      else         setTemplateMsg({ ok: false, text: data.error ?? 'Failed to send template' });
    } catch { setTemplateMsg({ ok: false, text: 'Network error. Try again.' }); }
    finally { setSendingTemplate(false); setTimeout(() => setTemplateMsg(null), 6000); }
  }

  const shareUrl = createdQuote ? `${typeof window !== 'undefined' ? window.location.origin : ''}/quotations/${createdQuote.public_token}` : '';
  const waText   = createdQuote
    ? `Hi ${custName}, here is your ${selectedPT?.template_name ?? selectedGT?.group_template_name ?? 'tour'} quote: ${shareUrl}`
    : '';
  // Phone for wa.me — custMobile already has country code (e.g. "919391203737"), no extra prefix needed
  const waPhone  = custMobile.replace(/\D/g, '');

  /* ═══ RENDER ═══ */
  return (
    <div className="max-w-[900px]">
      <PageHeader
        title="New Quote"
        subtitle={`Step ${step} of ${totalSteps} — ${steps.find(s => s.id === step)?.label ?? ''}`}
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Quotes', href: '/admin/quotes' }, { label: 'New Quote' }]}
      />

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-1 mb-6 bg-white rounded-2xl px-5 py-4" style={card}>
        {steps.map((s, i) => {
          const Icon   = s.icon;
          const done   = s.id < step;
          const active = s.id === step;
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors"
                  style={done ? { backgroundColor: '#22c55e', color: 'white' } : active ? { backgroundColor: T, color: 'white' } : { backgroundColor: '#F1F5F9', color: '#94A3B8' }}>
                  {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className="text-xs font-semibold hidden sm:block truncate" style={{ color: active ? T : done ? '#22c55e' : '#94A3B8' }}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 mx-1 flex-shrink-0 text-[#E2E8F0]" />}
            </div>
          );
        })}
      </div>

      {errMsg && (
        <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{errMsg}</div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 1 — BASICS                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          {/* Lead pre-fill banner */}
          {searchParams.get('lead_id') && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-medium" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' }}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 flex-shrink-0" />
                Customer details pre-filled from lead. Select quote type, fill trip details and proceed.
              </div>
              <a href="/admin/pipelines"
                className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors hover:bg-green-100"
                style={{ color: '#15803D', border: '1px solid #BBF7D0', whiteSpace: 'nowrap' }}>
                ← Back to Pipeline
              </a>
            </div>
          )}
          {/* Quote type */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className={lbl}>Quote Type</p>
            <div className="flex gap-3">
              {(['PRIVATE', 'GROUP'] as const).map(t => (
                <button key={t} onClick={() => { setQuoteType(t); setSelectedPT(null); setSelectedGT(null); setSelectedBatch(null); }}
                  className="flex-1 h-11 rounded-xl text-sm font-semibold border-2 transition-all"
                  style={quoteType === t ? { backgroundColor: T, borderColor: T, color: 'white' } : { backgroundColor: 'white', borderColor: '#E2E8F0', color: '#64748B' }}>
                  {t === 'PRIVATE' ? '🧳 Private / FIT' : '🚌 Group Departure'}
                </button>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-4">Customer Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={lbl}>Name <span className="text-red-500">*</span></label>
                <input className={inp} style={inpSt} value={custName} onChange={e => setCustName(e.target.value)} placeholder="Rajan Kumar" />
              </div>
              <div>
                <label className={lbl}>Mobile (WhatsApp) <span className="text-red-500">*</span></label>
                <PhoneInput
                  code={phoneCode} local={phoneLocal}
                  onCodeChange={setPhoneCode} onLocalChange={setPhoneLocal}
                  style={inpSt}
                />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input type="email" className={inp} style={inpSt} value={custEmail} onChange={e => setCustEmail(e.target.value)} placeholder="optional" />
              </div>
            </div>
          </div>

          {/* Trip details */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-4">Trip Details</p>
            <div className="grid grid-cols-2 gap-4">
              {quoteType === 'PRIVATE' && (
                <div className="col-span-2">
                  <label className={lbl}>Quote Name (optional)</label>
                  <input className={inp} style={inpSt} value={quoteName} onChange={e => setQuoteName(e.target.value)} placeholder="e.g. Kerala Honeymoon — June 2025" />
                </div>
              )}
              <div className="col-span-2">
                <label className={lbl}>State / Region <span className="text-red-500">*</span></label>
                <MultiStateSelect
                  states={states}
                  selected={stateIds}
                  onChange={setStateIds}
                  placeholder="Select states (e.g. Karnataka + Tamil Nadu)…"
                  error={!stateIds.length && !!errMsg}
                />
                {stateIds.length > 1 && (
                  <p className="text-[11px] mt-1.5" style={{ color: '#64748B' }}>
                    💡 Tip: drag order matters — the first state is the primary region for quote numbering
                  </p>
                )}
              </div>

              {/* Travel dates — PRIVATE only (GROUP dates come from the batch) */}
              {quoteType === 'PRIVATE' && (
                <>
                  <div>
                    <label className={lbl}>Travel Start Date <span className="text-red-500">*</span></label>
                    <input type="date" className={inp} style={inpSt} min={today} value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Number of Days <span className="text-red-500">*</span></label>
                    <input type="number" min="2" max="30" className={inp} style={inpSt} value={durationDays} onChange={e => setDurationDays(Math.max(2, Number(e.target.value)))} />
                  </div>
                  {startDate && (
                    <div className="col-span-2">
                      <p className="text-xs text-[#64748B]">
                        Trip: <span className="font-semibold" style={{ color: T }}>
                          {new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} → {endDate && new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ({durationNights}N / {durationDays}D)
                        </span>
                      </p>
                    </div>
                  )}
                  <div>
                    <label className={lbl}>Pickup City</label>
                    {cities.length > 0 ? (
                      <select className={sel} style={inpSt} value={pickupLocation} onChange={e => setPickupLocation(e.target.value)}>
                        <option value="">Select pickup city…</option>
                        {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    ) : (
                      <input className={inp} style={inpSt} value={pickupLocation} onChange={e => setPickupLocation(e.target.value)} placeholder="e.g. Bangalore Airport" />
                    )}
                  </div>
                  <div>
                    <label className={lbl}>Drop City</label>
                    {cities.length > 0 ? (
                      <select className={sel} style={inpSt} value={dropLocation} onChange={e => setDropLocation(e.target.value)}>
                        <option value="">Select drop city (if different)…</option>
                        {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    ) : (
                      <input className={inp} style={inpSt} value={dropLocation} onChange={e => setDropLocation(e.target.value)} placeholder="e.g. Bangalore Airport" />
                    )}
                  </div>
                </>
              )}

              {/* GROUP info note */}
              {quoteType === 'GROUP' && (
                <div className="col-span-2 flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p className="text-xs" style={{ color: '#0369A1' }}>Departure dates &amp; duration come from the group batch you select in the next step.</p>
                </div>
              )}

              {/* Pax — not mandatory for GROUP (exact count added in Step 2) */}
              <div>
                <label className={lbl}>
                  Adults{quoteType === 'PRIVATE' && <span className="text-red-500"> *</span>}
                  {quoteType === 'GROUP' && <span className="text-[10px] font-normal normal-case tracking-normal ml-1" style={{ color: '#94A3B8' }}>(optional)</span>}
                </label>
                <input type="number" min="0" className={inp} style={inpSt} value={adults}
                  onChange={e => setAdults(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label className={lbl}>Children (5–12)</label>
                <input type="number" min="0" className={inp} style={inpSt} value={children512} onChange={e => setChildren512(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label className={lbl}>Children (&lt;5)</label>
                <input type="number" min="0" className={inp} style={inpSt} value={childrenBelow5} onChange={e => setChildrenBelow5(Math.max(0, Number(e.target.value)))} />
              </div>

              {/* Quote Valid Till — PRIVATE only */}
              {quoteType === 'PRIVATE' && (
                <div>
                  <label className={lbl}>Quote Valid Till</label>
                  <input type="date" className={inp} style={inpSt} min={today} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                </div>
              )}

              {quoteType === 'PRIVATE' && (
                <div className="col-span-2">
                  <label className={lbl}>Hotel Category</label>
                  <div className="flex gap-2">
                    {STAR_OPTIONS.map(star => (
                      <button key={star} type="button" onClick={() => setHotelCategory(star)}
                        className="flex-1 h-10 rounded-xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-1.5"
                        style={hotelCategory === star ? { backgroundColor: T, borderColor: T, color: 'white' } : { backgroundColor: 'white', borderColor: '#E2E8F0', color: '#64748B' }}>
                        <Star className="w-3.5 h-3.5" fill={hotelCategory === star ? 'white' : 'none'} />
                        {star}★
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 2 — PACKAGE SELECTION                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {step === 2 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Select Package</p>
            <p className="text-xs text-[#94A3B8]">{stateIds.map(id => states.find(s => s.id === id)?.name).filter(Boolean).join(" + ")} · {durationDays}D / {durationNights}N · {adults} adult{adults !== 1 ? 's' : ''}</p>
          </div>
          {privateTpls.length === 0 ? (
            <div className="py-14 text-center bg-white rounded-2xl" style={card}>
              <p className="text-sm text-[#64748B]">No packages found for this state.</p>
              <p className="text-xs text-[#94A3B8] mt-1">Add packages via Admin → Private Templates.</p>
            </div>
          ) : (() => {
            const matchingTpls = privateTpls.filter(t => t.duration_days === durationDays);
            const otherTpls    = privateTpls.filter(t => t.duration_days !== durationDays);
            const showOther    = matchingTpls.length === 0; // show all if no exact match
            const tplsToShow   = showOther ? privateTpls : matchingTpls;
            return (
            <>
              {matchingTpls.length === 0 && (
                <div className="px-4 py-2.5 rounded-xl text-xs font-medium" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                  ⚠ No templates for {durationDays}D/{durationNights}N — showing all templates. Consider creating one that matches.
                </div>
              )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tplsToShow.map(tpl => {
                const destNames = ((tpl.destinations ?? []) as string[]).map(did => dests.find(d => d.id === did)?.name).filter(Boolean);
                const isSelected = selectedPT?.id === tpl.id;
                return (
                  <div key={tpl.id} onClick={() => setSelectedPT(tpl)}
                    className="bg-white rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
                    style={{ border: `2px solid ${isSelected ? T : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div className="h-32 relative overflow-hidden" style={{ backgroundColor: '#EFF9FF' }}>
                      {tpl.hero_image && <img src={tpl.hero_image} alt={tpl.template_name} className="w-full h-full object-cover" />}
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `${T}CC` }}>
                          <Check className="w-9 h-9 text-white" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: `${T}CC` }}>
                        {tpl.duration_nights}N/{tpl.duration_days}D
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="font-bold text-sm text-[#0F172A]">{tpl.template_name}</p>
                      {tpl.theme && <p className="text-xs text-[#94A3B8] mt-0.5">{tpl.theme}</p>}
                      {destNames.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {destNames.map((d, i) => (
                            <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0F9FF', color: T }}>{d}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
            );
          })()}
        </div>
      )}

      {step === 2 && quoteType === 'GROUP' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Select Group Tour &amp; Batch</p>
            <p className="text-xs text-[#94A3B8]">{stateIds.map(id => states.find(s => s.id === id)?.name).filter(Boolean).join(" + ")} · Select a departure date below</p>
          </div>
          {groupTpls.length === 0 ? (
            <div className="py-14 text-center bg-white rounded-2xl" style={card}>
              <p className="text-sm text-[#64748B]">No group tours found for this state.</p>
            </div>
          ) : groupTpls.map(gt => {
            const isSelected = selectedGT?.id === gt.id;
            return (
              <div key={gt.id} className="bg-white rounded-2xl p-4" style={{ ...card, border: `2px solid ${isSelected ? T : '#E2E8F0'}` }}>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setSelectedGT(isSelected ? null : gt)}>
                  <div>
                    <p className="font-bold text-sm text-[#0F172A]">{gt.group_template_name}</p>
                    <p className="text-xs text-[#94A3B8]">{gt.duration_nights}N/{gt.duration_days}D</p>
                  </div>
                  {isSelected ? <ChevronUp className="w-4 h-4 text-[#64748B]" /> : <ChevronDown className="w-4 h-4 text-[#64748B]" />}
                </div>
                {isSelected && (
                  <div className="mt-3 flex flex-col gap-2">
                    {gt.group_batches.filter(b => ['OPEN','FILLING_FAST','ALMOST_FULL'].includes(b.booking_status)).map(b => {
                      const start = new Date(b.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                      const end   = new Date(b.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                      const isSel = selectedBatch?.id === b.id;
                      return (
                        <div key={b.id} onClick={() => setSelectedBatch(isSel ? null : b)}
                          className="rounded-xl p-3 cursor-pointer transition-colors"
                          style={{ border: `1px solid ${isSel ? T : '#E2E8F0'}`, backgroundColor: isSel ? `${T}08` : '#F8FAFC' }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-[#0F172A]">{b.batch_name}</p>
                              <p className="text-xs text-[#64748B]">{start} → {end}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-[#0F172A]">₹{Number(Math.round(b.adult_price)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}/adult</p>
                              <p className="text-xs text-[#94A3B8]">{b.available_seats} seats left</p>
                            </div>
                          </div>
                          {isSel && <div className="mt-1 flex items-center gap-1 text-xs font-semibold" style={{ color: T }}><Check className="w-3 h-3" /> Selected</div>}
                        </div>
                      );
                    })}
                    {gt.group_batches.filter(b => ['OPEN','FILLING_FAST','ALMOST_FULL'].includes(b.booking_status)).length === 0 && (
                      <p className="text-xs text-[#94A3B8] text-center py-3">No available batches for this tour</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Traveller Count ── shown below the batch list */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Traveller Count</p>
            <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
              {selectedBatch
                ? `₹${Number(Math.round(selectedBatch.adult_price)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}/adult · ${adults > 0 ? `Est. total: ₹${(Number(selectedBatch.adult_price) * Math.round(adults)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'enter count to see total'}`
                : 'Optional — enter the number of travellers for this booking'}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Adults</label>
                <input type="number" min="0" className={inp} style={inpSt} value={adults}
                  onChange={e => setAdults(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label className={lbl}>Children (5–12)</label>
                <input type="number" min="0" className={inp} style={inpSt} value={children512}
                  onChange={e => setChildren512(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label className={lbl}>Children (&lt;5)</label>
                <input type="number" min="0" className={inp} style={inpSt} value={childrenBelow5}
                  onChange={e => setChildrenBelow5(Math.max(0, Number(e.target.value)))} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 3 — HOTEL SELECTION                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {step === 3 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Hotel Selection</p>
                <p className="text-xs text-[#94A3B8] mt-0.5">{selectedPT?.template_name} · {hotels.length} hotels loaded</p>
              </div>
              {options.length < 3 && (
                <button type="button" onClick={() => {
                  const ni = options.length;
                  const tpl = selectedPT!;
                  const destList = (tpl.destinations ?? []) as string[];
                  let cursorMs = startDate ? new Date(startDate).getTime() : Date.now();
                  const hotels: HotelRow[] = destList.map(did => {
                    // Prioritise Standard tier so 0-night transit destinations are respected
                    const tier = tpl.template_hotel_tiers?.find(t => t.tier_name === 'Standard' && t.destination_id === did)
                      ?? tpl.template_hotel_tiers?.find(t => t.destination_id === did);
                    const n = tier?.nights ?? Math.max(1, Math.floor(durationNights / Math.max(1, destList.length)));
                    if (n === 0) return null;
                    const checkIn  = new Date(cursorMs).toISOString().slice(0, 10);
                    cursorMs += n * 86400000;
                    const roomsCfg = makeRoomsConfig(adults);
                    return { destination_id: did, hotel_id: '', room_category_id: '', meal_plan_id: '', check_in_date: checkIn, check_out_date: new Date(cursorMs).toISOString().slice(0, 10), nights: n, rooms: roomsCfg.length, rooms_config: roomsCfg, adults_per_room: 2, cwb: children512, cwob: childrenBelow5, fetched_price: null, fetching: false, fetch_error: null, manual_cost: null, meal_overrides: {} };
                  }).filter(Boolean) as HotelRow[];
                  setOptions(p => [...p, { name: OPTION_NAMES[ni], is_most_popular: false, hotels }]);
                  setExpandedOpt(ni);
                }}
                  className="flex items-center gap-1.5 text-xs font-semibold h-8 px-3 rounded-lg" style={{ border: `1px solid ${T}`, color: T }}>
                  <Plus className="w-3.5 h-3.5" /> Add Option
                </button>
              )}
            </div>
          </div>

          {options.map((opt, oi) => {
            const optionTotal = opt.hotels.reduce((s, h) => s + effectivePrice(h), 0);
            const isOpen      = expandedOpt === oi;
            return (
              <div key={oi} className="bg-white rounded-2xl overflow-hidden" style={{ ...card, border: `2px solid ${opt.is_most_popular ? T : '#E2E8F0'}` }}>
                {/* Accordion header */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: `${T}15`, color: T }}>
                      {String.fromCharCode(65 + oi)}
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => setExpandedOpt(isOpen ? -1 : oi)}>
                      <input
                        className="text-sm font-bold bg-transparent border-0 border-b-2 border-transparent focus:outline-none focus:border-[#134956] w-full transition-colors"
                        style={{ color: '#0F172A' }}
                        value={opt.name}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setOptions(prev => prev.map((o, i) => i === oi ? { ...o, name: e.target.value } : o))}
                        placeholder="Option name…"
                      />
                      <p className="text-xs text-[#94A3B8]">{optionTotal > 0 ? `Hotel Total: ₹${Math.round(optionTotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'Select hotels to see price'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={e => { e.stopPropagation(); toggleMostPopular(oi); }}
                      className="text-[10px] font-bold px-2 py-1 rounded-full border transition-colors"
                      style={opt.is_most_popular ? { backgroundColor: T, borderColor: T, color: 'white' } : { borderColor: '#E2E8F0', color: '#94A3B8' }}>
                      ⭐ Most Popular
                    </button>
                    {options.length > 1 && (
                      <button type="button" onClick={e => { e.stopPropagation(); setOptions(p => p.filter((_, i) => i !== oi)); if (expandedOpt === oi) setExpandedOpt(0); }}
                        className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                        <Minus className="w-3 h-3" />
                      </button>
                    )}
                    <button type="button" onClick={() => setExpandedOpt(isOpen ? -1 : oi)} className="p-1 rounded hover:bg-[#F1F5F9] transition-colors">
                      {isOpen ? <ChevronUp className="w-4 h-4 text-[#94A3B8]" /> : <ChevronDown className="w-4 h-4 text-[#94A3B8]" />}
                    </button>
                  </div>
                </div>

                {/* Accordion body */}
                {isOpen && (
                  <div className="border-t px-4 pb-4" style={{ borderColor: '#F1F5F9' }}>
                    {opt.hotels.map((h, hi) => {
                      const dest     = dests.find(d => d.id === h.destination_id);
                      const roomCats = hotels.find(ht => ht.id === h.hotel_id)?.room_categories ?? [];
                      const totalPax = h.rooms_config.reduce((s, r) => s + r.pax, 0);
                      // Star-rating filter
                      const allDestHotels    = hotels.filter(ht => ht.destination_id === h.destination_id);
                      const starFiltered     = allDestHotels.filter(ht => ht.star_rating === hotelCategory);
                      const hotelList        = starFiltered.length > 0 ? starFiltered : allDestHotels;
                      const otherStarHotels  = starFiltered.length > 0 ? allDestHotels.filter(ht => ht.star_rating !== hotelCategory) : [];
                      // Meal-plan filter by room-category rates
                      const cachedRates      = hotelRatesCache[h.hotel_id] ?? [];
                      const availMpIds       = h.room_category_id
                        ? new Set(cachedRates.filter(r => r.room_category_id === h.room_category_id).map(r => r.meal_plan_id))
                        : null;
                      const filteredMealPlans = availMpIds ? mealPlans.filter(m => availMpIds.has(m.id)) : mealPlans;
                      const isDragOver = dragOverIndex?.field === oi && dragOverIndex?.index === hi;
                      return (
                        <div
                          key={hi}
                          draggable
                          onDragStart={() => { dragRef.current = { field: oi, fromIndex: hi }; }}
                          onDragEnd={() => { dragRef.current = null; setDragOverIndex(null); }}
                          onDragOver={e => { e.preventDefault(); setDragOverIndex({ field: oi, index: hi }); }}
                          onDrop={e => {
                            e.preventDefault();
                            if (!dragRef.current || dragRef.current.field !== oi) return;
                            const from = dragRef.current.fromIndex;
                            if (from === hi) return;
                            setOptions(prev => prev.map((o, i) => {
                              if (i !== oi) return o;
                              const next = [...o.hotels];
                              const [moved] = next.splice(from, 1);
                              next.splice(hi, 0, moved);
                              return { ...o, hotels: next };
                            }));
                            setDragOverIndex(null);
                          }}
                          className="pt-4 transition-all"
                          style={{
                            borderTop: hi > 0 ? '1px dashed #E2E8F0' : 'none',
                            marginTop: hi > 0 ? 16 : 8,
                            opacity: dragRef.current?.field === oi && dragRef.current?.fromIndex === hi ? 0.4 : 1,
                            border: isDragOver ? `2px solid ${T}` : undefined,
                            borderRadius: isDragOver ? 12 : undefined,
                            transform: isDragOver ? 'scale(1.01)' : undefined,
                            padding: isDragOver ? '12px 8px' : undefined,
                          }}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <GripVertical className="w-4 h-4 text-[#CBD5E1] cursor-grab active:cursor-grabbing flex-shrink-0" />
                              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T }}>{dest?.name ?? h.destination_id}</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[#64748B]">
                              <span>{h.nights}N</span>
                              <span>·</span>
                              <span className="font-semibold">{h.rooms_config.length} rm · {totalPax} pax</span>
                              {h.fetching && <Loader2 className="w-3 h-3 animate-spin text-[#94A3B8]" />}
                              {!h.fetching && h.fetched_price !== null && (
                                <span className="font-bold" style={{ color: T }}>₹{Math.round(h.fetched_price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              )}
                              {!h.fetching && h.fetched_price === null && h.manual_cost !== null && (
                                <span className="font-bold" style={{ color: '#F59E0B' }}>₹{Math.round(h.manual_cost).toLocaleString('en-IN', { maximumFractionDigits: 0 })} <span className="font-normal text-[#94A3B8]">(manual)</span></span>
                              )}
                              {!h.fetching && h.fetch_error && h.fetched_price === null && h.manual_cost === null && (
                                <span className="text-[#EF4444] font-medium">No rate</span>
                              )}
                            </div>
                          </div>
                          {/* ─── All 5 fields + room config ─── */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {/* Hotel */}
                            <div className="col-span-2 sm:col-span-1">
                              <label className={lbl}>
                                Hotel {starFiltered.length > 0 && <span className="text-[10px] font-normal text-[#22c55e]">{starFiltered.length} {hotelCategory}★ match{starFiltered.length !== 1 ? 'es' : ''}</span>}
                              </label>
                              <select className={sel} style={inpSt} value={h.hotel_id}
                                onChange={e => {
                                  const newId = e.target.value;
                                  updHotelAndFetch(oi, hi, { hotel_id: newId, room_category_id: '', meal_plan_id: '', fetched_price: null });
                                  if (newId) fetchHotelRates(newId);
                                }}>
                                <option value="">{hotelList.length === 0 ? '⚠ No hotels for this destination' : 'Select hotel…'}</option>
                                {hotelList.map(ht => <option key={ht.id} value={ht.id}>{ht.hotel_name}{ht.star_rating ? ` (${ht.star_rating}★)` : ''}</option>)}
                                {otherStarHotels.length > 0 && <option disabled>── Other star ratings ──</option>}
                                {otherStarHotels.map(ht => <option key={`o-${ht.id}`} value={ht.id}>{ht.hotel_name}{ht.star_rating ? ` (${ht.star_rating}★)` : ''}</option>)}
                              </select>
                              {hotelList.length === 0 && (
                                <p className="text-[11px] mt-1" style={{ color: '#F59E0B' }}>
                                  Add hotels for <strong>{dest?.name}</strong> in Hotels module first.
                                </p>
                              )}
                            </div>
                            {/* Room Type */}
                            <div>
                              <label className={lbl}>Room Type</label>
                              <select className={sel} style={inpSt} value={h.room_category_id} disabled={!h.hotel_id}
                                onChange={e => updHotelAndFetch(oi, hi, { room_category_id: e.target.value, meal_plan_id: '' })}>
                                <option value="">Select…</option>
                                {roomCats.map(r => <option key={r.id} value={r.id}>{r.room_category_name}</option>)}
                              </select>
                            </div>
                            {/* Meal Plan */}
                            <div>
                              <label className={lbl}>
                                Meal Plan {availMpIds && availMpIds.size === 0 && h.room_category_id && <span className="text-[10px] text-red-400">No rates</span>}
                              </label>
                              <select className={sel} style={inpSt} value={h.meal_plan_id} disabled={!h.room_category_id}
                                onChange={e => updHotelAndFetch(oi, hi, { meal_plan_id: e.target.value })}>
                                <option value="">Select…</option>
                                {filteredMealPlans.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                                {availMpIds && availMpIds.size === 0 && h.room_category_id && (
                                  <option disabled>No rates configured for this room</option>
                                )}
                              </select>
                              {availMpIds && availMpIds.size === 0 && h.room_category_id && (
                                <p className="text-[11px] mt-1 text-red-400">Add rates in Hotels → Rates tab first.</p>
                              )}
                            </div>
                            {/* Check-in */}
                            <div>
                              <label className={lbl}>Check-in</label>
                              <input type="date" className={inp} style={inpSt} value={h.check_in_date}
                                onChange={e => {
                                  const newIn = e.target.value;
                                  const newOut = new Date(new Date(newIn).getTime() + h.nights * 86400000).toISOString().slice(0, 10);
                                  updHotelAndFetch(oi, hi, { check_in_date: newIn, check_out_date: newOut });
                                }} />
                            </div>
                            {/* Check-out */}
                            <div>
                              <label className={lbl}>Check-out</label>
                              <input type="date" className={inp} style={inpSt} value={h.check_out_date}
                                onChange={e => {
                                  const nights = Math.max(1, Math.round((new Date(e.target.value).getTime() - new Date(h.check_in_date).getTime()) / 86400000));
                                  updHotelAndFetch(oi, hi, { check_out_date: e.target.value, nights });
                                }} />
                            </div>
                          </div>

                          {/* ─── Per-room pax config ─── */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-2">
                              <label className={lbl} style={{ marginBottom: 0 }}>
                                Rooms · {h.rooms_config.length} room{h.rooms_config.length !== 1 ? 's' : ''} · {totalPax} pax total
                              </label>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {h.rooms_config.map((rc, ri) => (
                                <div key={ri} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                  <span className="text-xs text-[#64748B] w-16 flex-shrink-0">Room {ri + 1}</span>
                                  <button type="button"
                                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: '#E2E8F0', color: '#64748B' }}
                                    onClick={() => {
                                      const next = [...h.rooms_config];
                                      next[ri] = { pax: Math.max(1, rc.pax - 1) };
                                      updHotelAndFetch(oi, hi, { rooms_config: next, rooms: next.length });
                                    }}>
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="text-xs font-bold w-8 text-center" style={{ color: T }}>{rc.pax} pax</span>
                                  <button type="button"
                                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: '#E2E8F0', color: '#64748B' }}
                                    onClick={() => {
                                      const next = [...h.rooms_config];
                                      next[ri] = { pax: rc.pax + 1 };
                                      updHotelAndFetch(oi, hi, { rooms_config: next, rooms: next.length });
                                    }}>
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  {h.rooms_config.length > 1 && (
                                    <button type="button"
                                      className="ml-auto w-5 h-5 rounded-full flex items-center justify-center"
                                      style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}
                                      onClick={() => {
                                        const next = h.rooms_config.filter((_, i) => i !== ri);
                                        updHotelAndFetch(oi, hi, { rooms_config: next, rooms: next.length });
                                      }}>
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                            <button type="button"
                              className="mt-2 flex items-center gap-1.5 text-xs font-semibold h-7 px-3 rounded-lg"
                              style={{ border: `1px dashed ${T}`, color: T }}
                              onClick={() => {
                                const next = [...h.rooms_config, { pax: 1 }];
                                updHotelAndFetch(oi, hi, { rooms_config: next, rooms: next.length });
                              }}>
                              <Plus className="w-3 h-3" /> Add Room
                            </button>
                          </div>

                          {/* ─── Meal Schedule Override ─── */}
                          {(() => {
                            const mealKey = `${oi}-${hi}`;
                            const isOpen  = expandedMealRows.has(mealKey);
                            const stayDates = getDatesInRange(h.check_in_date, h.check_out_date);
                            const hasOverrides = Object.keys(h.meal_overrides ?? {}).length > 0;
                            return (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => setExpandedMealRows(prev => {
                                    const next = new Set(prev);
                                    if (next.has(mealKey)) next.delete(mealKey); else next.add(mealKey);
                                    return next;
                                  })}
                                  className="flex items-center gap-2 text-xs font-semibold h-7 px-3 rounded-lg transition-colors"
                                  style={{
                                    border: `1px solid ${hasOverrides ? T : '#E2E8F0'}`,
                                    color: hasOverrides ? T : '#94A3B8',
                                    backgroundColor: hasOverrides ? `${T}08` : 'transparent',
                                  }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>
                                  </svg>
                                  {hasOverrides ? 'Meals customised' : 'Customize Meals'}
                                  {isOpen
                                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                                  }
                                </button>

                                {isOpen && stayDates.length > 0 && (
                                  <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                                    {/* Header row */}
                                    <div className="grid items-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: '#F8FAFC', color: '#94A3B8', gridTemplateColumns: '1fr 56px 56px 56px 56px' }}>
                                      <span>Date</span>
                                      <span className="text-center">🌅 B</span>
                                      <span className="text-center">☀️ L</span>
                                      <span className="text-center">🌙 D</span>
                                      <span className="text-center">Auto</span>
                                    </div>
                                    {stayDates.map((date, di) => {
                                      const ov = h.meal_overrides?.[date];
                                      const isAuto = ov === undefined;
                                      const fmt = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                                      const isIn  = di === 0;
                                      const isOut = di === stayDates.length - 1;

                                      function toggleMeal(meal: 'breakfast' | 'lunch' | 'dinner') {
                                        const current = ov ?? { breakfast: false, lunch: false, dinner: false };
                                        const updated = { ...current, [meal]: !current[meal] };
                                        // If all false, remove the override (revert to auto)
                                        if (!updated.breakfast && !updated.lunch && !updated.dinner) {
                                          const next = { ...h.meal_overrides };
                                          delete next[date];
                                          updHotel(oi, hi, { meal_overrides: next });
                                        } else {
                                          updHotel(oi, hi, { meal_overrides: { ...h.meal_overrides, [date]: updated } });
                                        }
                                      }

                                      function setAuto() {
                                        const next = { ...h.meal_overrides };
                                        delete next[date];
                                        updHotel(oi, hi, { meal_overrides: next });
                                      }

                                      function setManual() {
                                        // Default manual: check-in=dinner only, check-out=breakfast+lunch, mid=all 3
                                        const def = isIn
                                          ? { breakfast: false, lunch: false, dinner: true }
                                          : isOut
                                            ? { breakfast: true, lunch: true, dinner: false }
                                            : { breakfast: true, lunch: true, dinner: true };
                                        updHotel(oi, hi, { meal_overrides: { ...h.meal_overrides, [date]: def } });
                                      }

                                      const MealBox = ({ meal, checked }: { meal: 'breakfast' | 'lunch' | 'dinner'; checked: boolean }) => (
                                        <button
                                          type="button"
                                          onClick={() => { if (isAuto) setManual(); else toggleMeal(meal); }}
                                          className="w-full flex items-center justify-center h-7 rounded-md transition-all text-xs font-bold"
                                          style={{
                                            backgroundColor: !isAuto && checked
                                              ? meal === 'breakfast' ? '#FEF3C7' : meal === 'lunch' ? '#DCFCE7' : '#EEF2FF'
                                              : '#F1F5F9',
                                            color: !isAuto && checked
                                              ? meal === 'breakfast' ? '#D97706' : meal === 'lunch' ? '#16A34A' : '#4338CA'
                                              : '#CBD5E1',
                                            border: !isAuto && checked
                                              ? `1px solid ${meal === 'breakfast' ? '#FDE68A' : meal === 'lunch' ? '#86EFAC' : '#A5B4FC'}`
                                              : '1px solid #E2E8F0',
                                          }}
                                        >
                                          {!isAuto && checked ? '✓' : '–'}
                                        </button>
                                      );

                                      return (
                                        <div
                                          key={date}
                                          className="grid items-center px-3 py-1.5"
                                          style={{
                                            gridTemplateColumns: '1fr 56px 56px 56px 56px',
                                            borderTop: di > 0 ? '1px solid #F1F5F9' : undefined,
                                            backgroundColor: isAuto ? 'white' : `${T}04`,
                                          }}
                                        >
                                          <div>
                                            <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{fmt}</span>
                                            {isIn && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>IN</span>}
                                            {isOut && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: '#FCE7F3', color: '#BE185D' }}>OUT</span>}
                                          </div>
                                          <div className="px-1"><MealBox meal="breakfast" checked={ov?.breakfast ?? false} /></div>
                                          <div className="px-1"><MealBox meal="lunch"     checked={ov?.lunch     ?? false} /></div>
                                          <div className="px-1"><MealBox meal="dinner"    checked={ov?.dinner    ?? false} /></div>
                                          <div className="px-1">
                                            <button
                                              type="button"
                                              onClick={() => isAuto ? setManual() : setAuto()}
                                              className="w-full h-7 rounded-md text-[10px] font-bold transition-all"
                                              style={{
                                                backgroundColor: isAuto ? `${T}15` : '#F1F5F9',
                                                color: isAuto ? T : '#CBD5E1',
                                                border: `1px solid ${isAuto ? T + '40' : '#E2E8F0'}`,
                                              }}
                                            >
                                              {isAuto ? 'Auto' : 'Auto'}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {/* Reset all button */}
                                    {hasOverrides && (
                                      <div className="px-3 py-2 flex justify-end" style={{ borderTop: '1px solid #F1F5F9' }}>
                                        <button
                                          type="button"
                                          onClick={() => updHotel(oi, hi, { meal_overrides: {} })}
                                          className="text-[10px] font-semibold px-2 py-1 rounded-md"
                                          style={{ color: '#94A3B8', border: '1px solid #E2E8F0' }}
                                        >
                                          Reset all to Auto
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Manual cost fallback — shown when rate lookup fails */}
                          {h.fetch_error && h.fetched_price === null && h.hotel_id && h.room_category_id && h.meal_plan_id && (
                            <div className="mt-3 p-3 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                              <p className="text-[11px] font-semibold mb-2" style={{ color: '#92400E' }}>
                                ⚠ No rate found for these dates — enter cost manually
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold" style={{ color: '#64748B' }}>₹</span>
                                <input
                                  type="number" min="0" placeholder="Enter total hotel cost"
                                  className={inp} style={{ ...inpSt, borderColor: '#FCD34D' }}
                                  value={h.manual_cost ?? ''}
                                  onChange={e => updHotel(oi, hi, { manual_cost: e.target.value ? Number(e.target.value) : null })}
                                />
                                <span className="text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>for {h.nights}N</span>
                              </div>
                              <p className="text-[10px] mt-1.5" style={{ color: '#B45309' }}>
                                Tip: Add hotel rates in <strong>Hotels → Rates</strong> tab to auto-calculate.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Option total */}
                    {optionTotal > 0 && (
                      <div className="mt-4 p-3 rounded-xl flex items-center justify-between" style={{ backgroundColor: '#F0F9FF', border: `1px solid ${T}30` }}>
                        <span className="text-xs font-bold text-[#64748B]">Hotel B2B Total ({opt.name})</span>
                        <span className="text-sm font-bold" style={{ color: T }}>₹{Math.round(optionTotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 4 — VEHICLE                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {step === 4 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Vehicle Selection</p>
            <p className="text-xs text-[#94A3B8]">One vehicle applies to all package options · {durationDays}D trip</p>
            {/* Auto-suggest badge */}
            {(() => {
              const totalPax = adults + children512;
              const sorted   = [...vehTypes].sort((a, b) => a.capacity - b.capacity);
              const fit      = sorted.find(v => v.capacity >= totalPax) ?? sorted[sorted.length - 1];
              return fit ? (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: `${T}12`, color: T }}>
                  <Users className="w-3 h-3" />
                  {totalPax} pax → {fit.display_name} ({fit.capacity} seats) suggested
                </div>
              ) : null;
            })()}
            {(pickupLocation || dropLocation) && (
              <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: '#64748B' }}>
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: T }} />
                <span>
                  {pickupLocation && <><span className="font-semibold">Pickup:</span> {pickupLocation}</>}
                  {pickupLocation && dropLocation && ' → '}
                  {dropLocation && <><span className="font-semibold">Drop:</span> {dropLocation}</>}
                </span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl p-5" style={card}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Vehicle Type</label>
                <select className={sel} style={inpSt} value={vehicleTypeId} onChange={e => autoFillVehicle(e.target.value)}>
                  <option value="">None / No Vehicle</option>
                  {vehTypes.map(v => <option key={v.id} value={v.id}>{v.display_name} ({v.capacity} pax)</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Vehicle Cost (₹)</label>
                <input type="number" min="0" className={inp} style={inpSt} value={vehicleCost} onChange={e => setVehicleCost(Number(e.target.value))} />
              </div>
            </div>

            {/* Rate chips — filtered to relevant routes for current state/destinations */}
            {vehicleTypeId && (() => {
              // Filter to rates for selected states; further filter by duration for primary vs other
              const stateFilteredRates = vehRates.filter(r =>
                r.vehicle_type_id === vehicleTypeId &&
                (stateIds.length === 0 || stateIds.includes(r.state_id))
              );
              // Further narrow by pickup → drop city if both are set
              const pickup = pickupLocation.trim().toLowerCase();
              const drop   = dropLocation.trim().toLowerCase();
              const cityFiltered = (pickup || drop)
                ? stateFilteredRates.filter(r =>
                    (!pickup || r.start_city.trim().toLowerCase() === pickup) &&
                    (!drop   || r.end_city.trim().toLowerCase()   === drop)
                  )
                : stateFilteredRates;
              const useCityFilter = (pickup || drop) && cityFiltered.length > 0;
              const baseRates   = useCityFilter ? cityFiltered : stateFilteredRates;
              const exactRates  = baseRates.filter(r => r.duration_days === durationDays);
              const otherRates  = baseRates.filter(r => r.duration_days !== durationDays);
              if (exactRates.length === 0 && otherRates.length === 0) return null;
              return (
                <div className="mt-4">
                  <p className={lbl}>Available Rates — Click to Apply</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {exactRates.map(r => (
                      <button key={r.id} type="button" onClick={() => setVehicleCost(r.base_cost)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                        style={vehicleCost === r.base_cost ? { backgroundColor: `${T}15`, borderColor: T, color: T } : { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', color: '#64748B' }}>
                        {r.route_name} · {r.duration_days}D · ₹{Math.round(r.base_cost).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </button>
                    ))}
                    {exactRates.length === 0 && <p className="text-xs text-[#94A3B8]">No rates for {durationDays}D — showing others below</p>}
                    {otherRates.length > 0 && (
                      <details className="w-full">
                        <summary className="text-xs text-[#94A3B8] cursor-pointer mt-1">Other durations ({otherRates.length})</summary>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {otherRates.map(r => (
                            <button key={r.id} type="button" onClick={() => setVehicleCost(r.base_cost)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                              style={vehicleCost === r.base_cost
                                ? { backgroundColor: `${T}15`, borderColor: T, color: T }
                                : { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', color: '#92400E' }}>
                              {r.route_name} · {r.duration_days}D · ₹{Math.round(r.base_cost).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Preview per option */}
            {options.length > 0 && vehicleCost > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid #F1F5F9' }}>
                <p className={lbl}>Cost Preview (per option)</p>
                <div className="flex flex-col gap-2 mt-1">
                  {options.map((opt, oi) => {
                    const hotelTotal = opt.hotels.reduce((s, h) => s + (h.fetched_price ?? 0), 0);
                    return (
                      <div key={oi} className="flex items-center justify-between text-xs p-2.5 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <span className="font-semibold text-[#0F172A]">{opt.name}</span>
                        <span className="text-[#64748B]">Hotel ₹{Math.round(hotelTotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })} + Vehicle ₹{Math.round(vehicleCost).toLocaleString('en-IN', { maximumFractionDigits: 0 })} = <span className="font-bold text-[#0F172A]">₹{(hotelTotal + Math.round(vehicleCost)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 5 — ACTIVITIES                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {step === 5 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Activities</p>
            <p className="text-xs text-[#94A3B8]">Select optional activities for each package option — costs are added to the final price</p>
          </div>

          {/* Option tabs */}
          {options.length > 1 && (
            <div className="flex gap-2">
              {options.map((opt, oi) => (
                <button key={oi} onClick={() => setActiveActTab(oi)}
                  className="h-8 px-4 rounded-lg text-xs font-semibold border transition-all"
                  style={activeActTab === oi
                    ? { backgroundColor: T, borderColor: T, color: 'white' }
                    : { backgroundColor: 'white', borderColor: '#E2E8F0', color: '#64748B' }}>
                  {opt.name}
                </button>
              ))}
            </div>
          )}

          {/* Activity list */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            {loadingActs ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 border-[#134956] border-t-transparent animate-spin" />
              </div>
            ) : availableActivities.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm font-semibold text-[#0F172A]">No activities found</p>
                <p className="text-xs text-[#94A3B8] mt-1">Add activities in Masters → Activities, then they'll appear here</p>
              </div>
            ) : (() => {
              const oi = options.length > 1 ? activeActTab : 0;
              const optDests = new Set(options[oi]?.hotels.map(h => h.destination_id).filter(Boolean) ?? []);
              // Show activities matching this option's destinations first, then others
              const matched   = availableActivities.filter(a => optDests.has(a.destination_id));
              const unmatched = availableActivities.filter(a => !optDests.has(a.destination_id));
              const grouped   = [...matched, ...unmatched];
              // Group by destination
              const byDest = grouped.reduce<Record<string, ActivityOption[]>>((acc, a) => {
                const key = a.destination?.name ?? 'Other';
                (acc[key] ??= []).push(a);
                return acc;
              }, {});

              return (
                <div className="flex flex-col gap-5">
                  {Object.entries(byDest).map(([destName, acts]) => (
                    <div key={destName}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>{destName}</p>
                      <div className="flex flex-col gap-2">
                        {acts.map(act => {
                          const sel = optionActs[oi]?.[act.id];
                          const isSelected = !!sel;
                          const actCost = isSelected
                            ? act.rate_type === 'PER_PERSON'
                              ? act.adult_cost * sel.adults + (act.child_cost ?? 0) * sel.children
                              : act.adult_cost * sel.quantity
                            : 0;

                          return (
                            <div key={act.id} className="rounded-xl p-3.5 border transition-all"
                              style={isSelected
                                ? { borderColor: T, backgroundColor: `${T}08` }
                                : { borderColor: '#E2E8F0', backgroundColor: '#FAFBFC' }}>
                              <div className="flex items-start gap-3">
                                {/* Checkbox */}
                                <button onClick={() => {
                                  setOptionActs(prev => {
                                    const cur = { ...(prev[oi] ?? {}) };
                                    if (cur[act.id]) {
                                      delete cur[act.id];
                                    } else {
                                      cur[act.id] = act.rate_type === 'PER_PERSON'
                                        ? { adults, children: children512, quantity: 1 }
                                        : { adults: 0, children: 0, quantity: 1 };
                                    }
                                    return { ...prev, [oi]: cur };
                                  });
                                }}
                                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-all"
                                  style={isSelected ? { backgroundColor: T, borderColor: T } : { borderColor: '#CBD5E1', backgroundColor: 'white' }}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </button>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-[#0F172A]">{act.activity_name}</p>
                                    {isSelected && (
                                      <span className="text-sm font-bold flex-shrink-0" style={{ color: T }}>
                                        ₹{Math.round(actCost).toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                    {act.activity_type && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{act.activity_type}</span>}
                                    {act.duration && <span className="text-xs text-[#94A3B8]">⏱ {act.duration}</span>}
                                    <span className="text-xs" style={{ color: '#64748B' }}>
                                      {act.rate_type === 'PER_PERSON'
                                        ? <>₹{Math.round(act.adult_cost).toLocaleString('en-IN')}/adult{act.child_cost ? ` · ₹${Math.round(act.child_cost).toLocaleString('en-IN')}/child` : ''}</>
                                        : <>₹{Math.round(act.adult_cost).toLocaleString('en-IN')}/group</>}
                                    </span>
                                  </div>
                                  {act.description && <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{act.description}</p>}

                                  {/* Qty controls — shown only when selected */}
                                  {isSelected && (
                                    <div className="flex items-center gap-4 mt-2.5 pt-2.5" style={{ borderTop: '1px solid #E2E8F0' }}>
                                      {act.rate_type === 'PER_PERSON' ? (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Adults</span>
                                            <div className="flex items-center gap-1">
                                              <button onClick={() => setOptionActs(prev => { const c = { ...prev[oi] }; c[act.id] = { ...c[act.id], adults: Math.max(0, c[act.id].adults - 1) }; return { ...prev, [oi]: c }; })}
                                                className="w-6 h-6 rounded-md flex items-center justify-center border text-[#64748B] hover:bg-[#F1F5F9]" style={{ borderColor: '#E2E8F0' }}><Minus className="w-3 h-3" /></button>
                                              <span className="w-6 text-center text-sm font-semibold text-[#0F172A]">{sel.adults}</span>
                                              <button onClick={() => setOptionActs(prev => { const c = { ...prev[oi] }; c[act.id] = { ...c[act.id], adults: c[act.id].adults + 1 }; return { ...prev, [oi]: c }; })}
                                                className="w-6 h-6 rounded-md flex items-center justify-center border text-[#64748B] hover:bg-[#F1F5F9]" style={{ borderColor: '#E2E8F0' }}><Plus className="w-3 h-3" /></button>
                                            </div>
                                          </div>
                                          {(act.child_cost ?? 0) > 0 && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Children</span>
                                              <div className="flex items-center gap-1">
                                                <button onClick={() => setOptionActs(prev => { const c = { ...prev[oi] }; c[act.id] = { ...c[act.id], children: Math.max(0, c[act.id].children - 1) }; return { ...prev, [oi]: c }; })}
                                                  className="w-6 h-6 rounded-md flex items-center justify-center border text-[#64748B] hover:bg-[#F1F5F9]" style={{ borderColor: '#E2E8F0' }}><Minus className="w-3 h-3" /></button>
                                                <span className="w-6 text-center text-sm font-semibold text-[#0F172A]">{sel.children}</span>
                                                <button onClick={() => setOptionActs(prev => { const c = { ...prev[oi] }; c[act.id] = { ...c[act.id], children: c[act.id].children + 1 }; return { ...prev, [oi]: c }; })}
                                                  className="w-6 h-6 rounded-md flex items-center justify-center border text-[#64748B] hover:bg-[#F1F5F9]" style={{ borderColor: '#E2E8F0' }}><Plus className="w-3 h-3" /></button>
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Groups</span>
                                          <div className="flex items-center gap-1">
                                            <button onClick={() => setOptionActs(prev => { const c = { ...prev[oi] }; c[act.id] = { ...c[act.id], quantity: Math.max(1, c[act.id].quantity - 1) }; return { ...prev, [oi]: c }; })}
                                              className="w-6 h-6 rounded-md flex items-center justify-center border text-[#64748B] hover:bg-[#F1F5F9]" style={{ borderColor: '#E2E8F0' }}><Minus className="w-3 h-3" /></button>
                                            <span className="w-6 text-center text-sm font-semibold text-[#0F172A]">{sel.quantity}</span>
                                            <button onClick={() => setOptionActs(prev => { const c = { ...prev[oi] }; c[act.id] = { ...c[act.id], quantity: c[act.id].quantity + 1 }; return { ...prev, [oi]: c }; })}
                                              className="w-6 h-6 rounded-md flex items-center justify-center border text-[#64748B] hover:bg-[#F1F5F9]" style={{ borderColor: '#E2E8F0' }}><Plus className="w-3 h-3" /></button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Per-option activity cost summary */}
          {options.length > 0 && (
            <div className="bg-white rounded-2xl p-5" style={card}>
              <p className={lbl}>Activity Cost Summary</p>
              <div className="flex flex-col gap-2 mt-1">
                {options.map((opt, oi) => {
                  const actCost  = computeActivityCost(oi);
                  const hotelTotal = opt.hotels.reduce((s, h) => s + (h.fetched_price ?? 0), 0);
                  const selCount = Object.keys(optionActs[oi] ?? {}).length;
                  return (
                    <div key={oi} className="flex items-center justify-between text-xs p-2.5 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <span className="font-semibold text-[#0F172A]">{opt.name}</span>
                      <span className="text-[#64748B]">
                        {selCount > 0
                          ? <>Hotel ₹{Math.round(hotelTotal).toLocaleString('en-IN')} + Vehicle ₹{Math.round(vehicleCost).toLocaleString('en-IN')} + Activities ₹{Math.round(actCost).toLocaleString('en-IN')} = <span className="font-bold text-[#0F172A]">₹{Math.round(hotelTotal + vehicleCost + actCost).toLocaleString('en-IN')}</span></>
                          : <span className="text-[#94A3B8]">No activities selected — <button className="underline" style={{ color: T }} onClick={() => setActiveActTab(oi)}>add for {opt.name}</button></span>
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 6 — PROFIT MARGIN & SUMMARY                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {step === 6 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Profit & GST</p>
            <p className="text-xs text-[#94A3B8]">Live comparison table updates as you change margins</p>
          </div>

          {/* Margin controls */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Profit Type</label>
                <div className="flex gap-2">
                  {(['PERCENTAGE', 'FLAT'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setProfitType(t)}
                      className="flex-1 h-9 rounded-lg text-xs font-bold border-2 transition-all"
                      style={profitType === t ? { backgroundColor: T, borderColor: T, color: 'white' } : { borderColor: '#E2E8F0', color: '#64748B' }}>
                      {t === 'PERCENTAGE' ? '% Margin' : '₹ Flat'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={lbl}>Profit Value {profitType === 'PERCENTAGE' ? '(%)' : '(₹)'}</label>
                <input type="number" min="0" className={inp} style={inpSt} value={profitValue} onChange={e => setProfitValue(Number(e.target.value))} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={lbl} style={{ marginBottom: 0 }}>GST (%)</label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={includeGst} onChange={e => setIncludeGst(e.target.checked)} className="w-3.5 h-3.5 accent-[#134956]" />
                    <span className="text-[11px] font-semibold" style={{ color: includeGst ? T : '#94A3B8' }}>Include GST</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  {[0, 5, 12].map(g => (
                    <button key={g} type="button" onClick={() => { setGstPercent(g); if (g > 0) setIncludeGst(true); }}
                      disabled={!includeGst}
                      className="flex-1 h-9 rounded-lg text-xs font-bold border-2 transition-all disabled:opacity-40"
                      style={includeGst && gstPercent === g ? { backgroundColor: T, borderColor: T, color: 'white' } : { borderColor: '#E2E8F0', color: '#64748B' }}>
                      {g}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Discount */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-4">Discount <span className="text-xs font-normal text-[#94A3B8]">(optional)</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={lbl}>Discount Type</label>
                <div className="flex gap-2">
                  {(['FLAT', 'PERCENTAGE'] as const).map(t => (
                    <button key={t} type="button" onClick={() => { setDiscountType(t); setDiscountValue(0); }}
                      className="flex-1 h-9 rounded-lg text-xs font-bold border-2 transition-all"
                      style={discountType === t ? { backgroundColor: '#DC2626', borderColor: '#DC2626', color: 'white' } : { borderColor: '#E2E8F0', color: '#64748B' }}>
                      {t === 'FLAT' ? '₹ Flat' : '% Off'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={lbl}>Discount {discountType === 'FLAT' ? '(₹)' : '(%)'}</label>
                <input type="number" min="0" className={inp} style={inpSt} value={discountValue || ''}
                  onChange={e => setDiscountValue(Number(e.target.value))} placeholder="0" />
              </div>
              <div>
                <label className={lbl}>Valid Till (date &amp; time)</label>
                <input type="datetime-local" className={inp} style={inpSt} value={discountValidTill}
                  onChange={e => setDiscountValidTill(e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Discount Note</label>
                <input className={inp} style={inpSt} value={discountNote}
                  onChange={e => setDiscountNote(e.target.value)} placeholder="e.g. Early bird offer" />
              </div>
            </div>
            {discountValue > 0 && (
              <p className="mt-2 text-xs font-medium" style={{ color: '#DC2626' }}>
                🏷 {discountType === 'FLAT' ? `₹${Math.round(discountValue).toLocaleString('en-IN', { maximumFractionDigits: 0 })} off` : `${discountValue}% off`}
                {discountValidTill ? ` · Valid till ${new Date(discountValidTill).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            )}
          </div>

          {/* Comparison table */}
          <div className="bg-white rounded-2xl overflow-hidden" style={card}>
            <div className="p-4 border-b" style={{ borderColor: '#F1F5F9' }}>
              <p className="text-sm font-bold text-[#0F172A]">Package Comparison</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC' }}>
                    <th className="text-left px-4 py-3 text-xs font-bold text-[#64748B] w-40">Item</th>
                    {options.map((opt, oi) => (
                      <th key={oi} className="text-right px-4 py-3 text-xs font-bold" style={{ color: opt.is_most_popular ? T : '#0F172A' }}>
                        {opt.name} {opt.is_most_popular && '⭐'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Hotel B2B',   fn: (c: ReturnType<typeof liveCalc>) => c.hotelTotal },
                    { label: 'Vehicle',     fn: () => vehicleCost },
                    { label: 'Activities',  fn: (c: ReturnType<typeof liveCalc>) => c.activityCost },
                    { label: 'B2B Subtotal',fn: (c: ReturnType<typeof liveCalc>) => c.baseCost,   bold: true },
                    { label: `Profit ${profitType === 'PERCENTAGE' ? `(${profitValue}%)` : '(flat)'}`, fn: (c: ReturnType<typeof liveCalc>) => c.profitAmt, green: true },
                    { label: 'Before Discount', fn: (c: ReturnType<typeof liveCalc>) => c.beforeGst },
                    ...(discountValue > 0 ? [{ label: `Discount ${discountType === 'FLAT' ? `(₹${discountValue})` : `(${discountValue}%)`}`, fn: (c: ReturnType<typeof liveCalc>) => -c.discountAmt, red: true }] : []),
                    { label: 'After Discount', fn: (c: ReturnType<typeof liveCalc>) => c.afterDiscount, bold: discountValue > 0 },
                    ...(includeGst ? [{ label: `GST (${gstPercent}%)`, fn: (c: ReturnType<typeof liveCalc>) => c.gstAmt }] : []),
                    { label: 'NET TOTAL',  fn: (c: ReturnType<typeof liveCalc>) => c.total, bold: true, large: true },
                  ].map((row, ri) => (
                    <tr key={ri} style={{ borderTop: '1px solid #F1F5F9', backgroundColor: row.bold ? '#F8FAFC' : 'white' }}>
                      <td className="px-4 py-2.5 text-xs text-[#64748B]" style={{ fontWeight: row.bold ? 700 : 400 }}>{row.label}</td>
                      {options.map((opt, oi) => {
                        const c   = liveCalc(opt, oi);
                        const val = row.fn(c);
                        const isNeg = val < 0;
                        return (
                          <td key={oi} className="px-4 py-2.5 text-right font-semibold"
                            style={{ color: (row as {large?: boolean; green?: boolean; red?: boolean}).large ? T : (row as {large?: boolean; green?: boolean; red?: boolean}).green ? '#16a34a' : (row as {large?: boolean; green?: boolean; red?: boolean}).red ? '#DC2626' : '#0F172A', fontSize: (row as {large?: boolean}).large ? 15 : 12, fontWeight: row.bold ? 700 : 500 }}>
                            {isNeg ? '−' : ''}₹{Math.round(Math.abs(Math.round(val))).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-adult price */}
          {adults > 0 && (
            <div className="bg-white rounded-2xl p-4" style={card}>
              <p className="text-xs font-bold text-[#64748B] mb-2">Price Per Adult</p>
              <div className="flex gap-3">
                {options.map((opt, oi) => {
                  const c = liveCalc(opt, oi);
                  return (
                    <div key={oi} className="flex-1 p-3 rounded-xl text-center" style={{ backgroundColor: `${T}08`, border: `1px solid ${T}20` }}>
                      <p className="text-[10px] font-bold text-[#64748B]">{opt.name}</p>
                      <p className="text-lg font-bold mt-1" style={{ color: T }}>₹{Math.round(c.total / Math.round(adults)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                      <p className="text-[10px] text-[#94A3B8]">per adult</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-[#94A3B8] text-center px-4">
            These are estimated prices. Hotel rates are confirmed from DB when you click Publish.
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* STEP 6 / SHARE — SUCCESS SCREEN                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {((step === 7 && quoteType === 'PRIVATE') || (step === 3 && quoteType === 'GROUP')) && createdQuote && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-8 text-center" style={card}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#DCFCE7' }}>
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-bold text-[#0F172A]">Quote Published!</p>
            <p className="text-sm text-[#64748B] mt-1 mb-6">
              {createdQuote.quote_number} · Share the link below with <span className="font-semibold" style={{ color: T }}>{custName}</span>
            </p>

            {/* Link box */}
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-left" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <FileText className="w-4 h-4 flex-shrink-0 text-[#94A3B8]" />
              <code className="flex-1 text-xs text-[#64748B] truncate">{shareUrl}</code>
              <button onClick={copyLink}
                className="h-7 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 flex-shrink-0 text-white transition-colors"
                style={{ backgroundColor: copied ? '#22c55e' : T }}>
                {copied ? <><Check className="w-3 h-3" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
              </button>
            </div>

            {/* Pricing summary */}
            {Object.keys(calcResults).length > 0 && (
              <div className="text-left mb-6">
                <p className="text-xs font-bold text-[#64748B] mb-2">Final Prices</p>
                <div className="flex gap-2">
                  {options.map((opt, oi) => {
                    const r = calcResults[opt.name];
                    if (!r) return null;
                    return (
                      <div key={oi} className="flex-1 p-3 rounded-xl" style={{ backgroundColor: `${T}08`, border: `1px solid ${T}20` }}>
                        <p className="text-[10px] font-bold text-[#64748B]">{opt.name}</p>
                        <p className="text-base font-bold mt-1" style={{ color: T }}>₹{Math.round(Math.round(r.final_price)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Template send feedback */}
            {templateMsg && (
              <div className="mb-3 px-4 py-2 rounded-xl text-sm font-medium text-center"
                style={templateMsg.ok ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                {templateMsg.text}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: '#25D366' }}>
                <ExternalLink className="w-4 h-4" /> Send on WhatsApp
              </a>
              <button onClick={sendGallaboxTemplate} disabled={sendingTemplate}
                className="flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#128C7E' }}>
                <Send className={`w-4 h-4 ${sendingTemplate ? 'animate-pulse' : ''}`} />
                {sendingTemplate ? 'Sending…' : 'Send Itinerary Template'}
              </button>
              <button onClick={() => router.push(`/admin/quotes/${createdQuote.id}`)}
                className="flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: T }}>
                View Quote →
              </button>
              <button onClick={() => router.push('/admin/quotes')}
                className="flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-[#64748B]"
                style={{ border: '1px solid #E2E8F0' }}>
                All Quotes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation buttons ── */}
      {step < (quoteType === 'PRIVATE' ? 7 : 3) && (
        <div className="flex items-center justify-between mt-6 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={goBack} disabled={step === 1}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-30"
            style={{ border: '1px solid #E2E8F0' }}>
            ← Back
          </button>
          <button onClick={goNext} disabled={saving || calculating}
            className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: T }}>
            {saving || calculating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {calculating ? 'Calculating…' : 'Publishing…'}</>
              : step === 6 || (quoteType === 'GROUP' && step === 2)
                ? 'Publish & Generate Link'
                : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}
