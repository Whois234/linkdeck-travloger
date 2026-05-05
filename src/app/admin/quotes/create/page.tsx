'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import {
  Users, MapPin, LayoutList, DollarSign, FileText, Link2,
  Check, Copy, ExternalLink, ChevronRight, Plus, Minus,
  Star, Car, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';

/* ─── Style tokens ─── */
const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor: '#E2E8F0' };
const T     = '#134956';
const card  = { border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

/* ─── Types ─── */
interface State        { id: string; name: string; code: string }
interface VehicleType  { id: string; display_name: string; capacity: number }
interface VehRate      { id: string; route_name: string; vehicle_type_id: string; duration_days: number; base_cost: number; state_id: string }
interface MealPlan     { id: string; code: string; name: string }
interface Hotel        { id: string; hotel_name: string; destination_id: string; star_rating: number | null; category_label: string; room_categories: { id: string; room_category_name: string }[] }
interface PT           { id: string; template_name: string; duration_days: number; duration_nights: number; state_id: string; hero_image?: string | null; theme?: string | null; destinations: string[]; template_hotel_tiers: HTier[]; template_days: TDay[]; cms_data: CMSData | null }
interface GT           { id: string; group_template_name: string; duration_days: number; duration_nights: number; state_id: string; hero_image?: string | null; group_batches: GBatch[] }
interface GBatch       { id: string; batch_name: string; start_date: string; end_date: string; total_seats: number; available_seats: number; adult_price: number; booking_status: string }
interface HTier        { tier_name: string; destination_id: string; default_hotel_id: string | null; default_room_category_id: string | null; default_meal_plan_id: string | null; nights: number }
interface TDay         { day_number: number; destination_id: string; title: string }
interface CMSData      { package_options?: Array<{ tier_name: string; is_most_popular: boolean }> }
interface Dest         { id: string; name: string }

interface HotelRow {
  destination_id: string;
  hotel_id: string;
  room_category_id: string;
  meal_plan_id: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  rooms: number;
  adults_per_room: number;
  cwb: number;
  cwob: number;
  fetched_price: number | null;
  fetching: boolean;
  fetch_error: string | null;   // error message from rate lookup
  manual_cost: number | null;   // agent-entered fallback when no rate exists
}

interface OptionDraft {
  name: string;
  is_most_popular: boolean;
  hotels: HotelRow[];
}

const STAR_OPTIONS = [3, 4, 5] as const;
type StarRating = typeof STAR_OPTIONS[number];

const PRIVATE_STEPS = [
  { id: 1, label: 'Basics',    icon: Users      },
  { id: 2, label: 'Package',   icon: LayoutList },
  { id: 3, label: 'Hotels',    icon: MapPin     },
  { id: 4, label: 'Vehicle',   icon: Car        },
  { id: 5, label: 'Summary',   icon: DollarSign },
  { id: 6, label: 'Share',     icon: Link2      },
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

  /* ─── Global ─── */
  const [step, setStep]           = useState(1);
  const [quoteType, setQuoteType] = useState<'PRIVATE' | 'GROUP'>('PRIVATE');
  const [saving, setSaving]       = useState(false);
  const [errMsg, setErrMsg]       = useState('');
  const [copied, setCopied]       = useState(false);
  const [createdQuote, setCreatedQuote] = useState<{ id: string; quote_number: string; public_token: string } | null>(null);

  /* ─── Step 1 fields ─── */
  const [quoteName, setQuoteName]     = useState('');
  const [custName, setCustName]       = useState('');
  const [custMobile, setCustMobile]   = useState('');
  const [custEmail, setCustEmail]     = useState('');
  const [stateId, setStateId]         = useState('');
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

  /* ─── Step 3 ─── */
  const [options, setOptions]         = useState<OptionDraft[]>([]);
  const [expandedOpt, setExpandedOpt] = useState<number>(0);

  /* ─── Step 4 ─── */
  const [vehicleTypeId, setVehicleTypeId] = useState('');
  const [vehicleCost, setVehicleCost]     = useState(0);

  /* ─── Step 5 margins ─── */
  const [profitType, setProfitType]   = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [profitValue, setProfitValue] = useState(30);
  const [gstPercent, setGstPercent]   = useState(5);
  const [calcResults, setCalcResults] = useState<Record<string, { final_price: number; hotel_cost: number; base_cost: number; profit_amount: number; gst_amount: number; selling_before_gst: number }>>({});
  const [calculating, setCalculating] = useState(false);

  /* ─── Reference data ─── */
  const [states,    setStates]    = useState<State[]>([]);
  const [dests,     setDests]     = useState<Dest[]>([]);
  const [hotels,    setHotels]    = useState<Hotel[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [vehTypes,  setVehTypes]  = useState<VehicleType[]>([]);
  const [vehRates,  setVehRates]  = useState<VehRate[]>([]);

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

  /* ─── Load hotels + veh rates when state changes ─── */
  useEffect(() => {
    if (!stateId) return;
    Promise.all([
      fetch(`/api/v1/hotels?state_id=${stateId}`).then(r => r.json()),
      fetch(`/api/v1/vehicle-package-rates?state_id=${stateId}`).then(r => r.json()),
    ]).then(([hd, vd]) => {
      if (hd.success) setHotels(hd.data);
      if (vd.success) setVehRates(vd.data);
    });
  }, [stateId]);

  /* ─── Load templates when step 2 is reached ─── */
  useEffect(() => {
    if (step !== 2 || !stateId) return;
    if (quoteType === 'PRIVATE') {
      fetch(`/api/v1/private-templates?state_id=${stateId}`).then(r => r.json()).then(d => { if (d.success) setPrivateTpls(d.data); });
    } else {
      fetch(`/api/v1/group-templates?state_id=${stateId}`).then(r => r.json()).then(d => { if (d.success) setGroupTpls(d.data); });
    }
  }, [step, stateId, quoteType]);

  /* ─── Scaffold options when template selected ─── */
  const scaffoldOptions = useCallback((tpl: PT) => {
    const pkgOptions = tpl.cms_data?.package_options ?? [
      { tier_name: 'Standard', is_most_popular: false },
      { tier_name: 'Deluxe',   is_most_popular: true  },
    ];
    const destList = tpl.destinations as string[];
    const nightsTotal = tpl.duration_nights || durationNights;

    const newOpts: OptionDraft[] = pkgOptions.slice(0, 3).map((pkg, oi) => {
      let cursorMs = startDate ? new Date(startDate).getTime() : Date.now();
      const hotels: HotelRow[] = destList.map(did => {
        const tier = tpl.template_hotel_tiers?.find(t => t.tier_name === pkg.tier_name && t.destination_id === did);
        const n    = tier?.nights ?? Math.max(1, Math.floor(nightsTotal / Math.max(1, destList.length)));

        // Skip destinations with 0 nights (transit stops / no accommodation needed)
        if (n === 0) return null;

        const checkIn  = new Date(cursorMs).toISOString().slice(0, 10);
        cursorMs += n * 86400000;
        const checkOut = new Date(cursorMs).toISOString().slice(0, 10);
        return {
          destination_id: did,
          hotel_id: tier?.default_hotel_id ?? '',
          room_category_id: tier?.default_room_category_id ?? '',
          meal_plan_id: tier?.default_meal_plan_id ?? '',
          check_in_date: checkIn,
          check_out_date: checkOut,
          nights: n,
          rooms: Math.max(1, Math.ceil(adults / 2)),
          adults_per_room: 2,
          cwb: children512,
          cwob: childrenBelow5,
          fetched_price: null,
          fetching: false,
          fetch_error: null,
          manual_cost: null,
        };
      }).filter(Boolean) as HotelRow[];
      return { name: OPTION_NAMES[oi] ?? `Option ${oi + 1}`, is_most_popular: pkg.is_most_popular, hotels };
    });
    setOptions(newOpts);
    setExpandedOpt(0);
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
  }, [options.map(o => o.hotels.map(h => `${h.hotel_id}|${h.room_category_id}|${h.meal_plan_id}|${h.check_in_date}|${h.check_out_date}|${h.rooms}`).join(',')).join(';')]);

  /* ─── Auto-fill vehicle cost ─── */
  function autoFillVehicle(vtId: string) {
    setVehicleTypeId(vtId);
    if (!vtId) { setVehicleCost(0); return; }
    const matching = vehRates.filter(r => r.vehicle_type_id === vtId)
      .sort((a, b) => Math.abs(a.duration_days - durationDays) - Math.abs(b.duration_days - durationDays));
    setVehicleCost(matching[0]?.base_cost ?? 0);
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
            rooms: row.rooms, adults_per_room: row.adults_per_room, cwb: row.cwb, cwob: row.cwob,
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
  function liveCalc(opt: OptionDraft) {
    const hotelTotal = opt.hotels.reduce((s, h) => s + effectivePrice(h), 0);
    const baseCost   = hotelTotal + vehicleCost;
    const profitAmt  = profitType === 'PERCENTAGE' ? baseCost * profitValue / 100 : profitValue;
    const beforeGst  = Math.max(0, baseCost + profitAmt);
    const gstAmt     = beforeGst * gstPercent / 100;
    return { hotelTotal, baseCost, profitAmt, beforeGst, gstAmt, total: beforeGst + gstAmt };
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
        state_id: stateId,
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
          activity_cost: 0, transfer_cost: 0, misc_cost: 0,
          profit_type: profitType,
          profit_value: profitValue,
          discount_amount: 0,
          gst_percent: gstPercent,
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
            rooming_json: { rooms: [{ type: 'Double', count: h.rooms, adults: h.adults_per_room, children_with_bed: h.cwb, children_without_bed: h.cwob }] },
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

      // 4. Publish
      const pRes = await fetch(`/api/v1/quotes/${quoteId}/publish`, { method: 'POST' });
      const pData = await pRes.json();
      if (!pRes.ok) { setErrMsg(pData.error ?? 'Failed to publish quote'); return; }

      setCreatedQuote({ id: quoteId, quote_number: qData.data.quote_number, public_token: pData.data.public_token ?? qData.data.public_token });
      setStep(quoteType === 'PRIVATE' ? 6 : 3);
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
      setCreatedQuote({ id: quoteId, quote_number: qData.data.quote_number, public_token: pData.data.public_token ?? qData.data.public_token });
      setStep(3);
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
      if (!stateId) { setErrMsg('Please select a state'); return; }
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

  const shareUrl = createdQuote ? `${typeof window !== 'undefined' ? window.location.origin : ''}/quotations/${createdQuote.public_token}` : '';
  const waText   = createdQuote
    ? `Hi ${custName}, here is your ${selectedPT?.template_name ?? selectedGT?.group_template_name ?? 'tour'} quote: ${shareUrl}`
    : '';

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
                <input className={inp} style={inpSt} value={custMobile} onChange={e => setCustMobile(e.target.value)} placeholder="+91 98765 43210" />
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
                <select className={sel} style={inpSt} value={stateId} onChange={e => setStateId(e.target.value)}>
                  <option value="">Select state…</option>
                  {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
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
            <p className="text-xs text-[#94A3B8]">{states.find(s => s.id === stateId)?.name} · {durationDays}D / {durationNights}N · {adults} adult{adults !== 1 ? 's' : ''}</p>
          </div>
          {privateTpls.length === 0 ? (
            <div className="py-14 text-center bg-white rounded-2xl" style={card}>
              <p className="text-sm text-[#64748B]">No packages found for this state.</p>
              <p className="text-xs text-[#94A3B8] mt-1">Add packages via Admin → Private Templates.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {privateTpls.map(tpl => {
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
          )}
        </div>
      )}

      {step === 2 && quoteType === 'GROUP' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Select Group Tour &amp; Batch</p>
            <p className="text-xs text-[#94A3B8]">{states.find(s => s.id === stateId)?.name} · Select a departure date below</p>
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
                    {gt.group_batches.filter(b => b.booking_status === 'OPEN').map(b => {
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
                              <p className="text-sm font-bold text-[#0F172A]">₹{Number(b.adult_price).toLocaleString('en-IN')}/adult</p>
                              <p className="text-xs text-[#94A3B8]">{b.available_seats} seats left</p>
                            </div>
                          </div>
                          {isSel && <div className="mt-1 flex items-center gap-1 text-xs font-semibold" style={{ color: T }}><Check className="w-3 h-3" /> Selected</div>}
                        </div>
                      );
                    })}
                    {gt.group_batches.filter(b => b.booking_status === 'OPEN').length === 0 && (
                      <p className="text-xs text-[#94A3B8] text-center py-3">No open batches available</p>
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
                ? `₹${Number(selectedBatch.adult_price).toLocaleString('en-IN')}/adult · ${adults > 0 ? `Est. total: ₹${(Number(selectedBatch.adult_price) * adults).toLocaleString('en-IN')}` : 'enter count to see total'}`
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
                    return { destination_id: did, hotel_id: '', room_category_id: '', meal_plan_id: '', check_in_date: checkIn, check_out_date: new Date(cursorMs).toISOString().slice(0, 10), nights: n, rooms: Math.max(1, Math.ceil(adults / 2)), adults_per_room: 2, cwb: children512, cwob: childrenBelow5, fetched_price: null, fetching: false, fetch_error: null, manual_cost: null };
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
                      <p className="text-xs text-[#94A3B8]">{optionTotal > 0 ? `Hotel Total: ₹${optionTotal.toLocaleString('en-IN')}` : 'Select hotels to see price'}</p>
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
                      const dest       = dests.find(d => d.id === h.destination_id);
                      const destHotels = hotels.filter(ht => ht.destination_id === h.destination_id);
                      const roomCats   = hotels.find(ht => ht.id === h.hotel_id)?.room_categories ?? [];
                      const pax        = adults + children512 + childrenBelow5;
                      return (
                        <div key={hi} className="pt-4" style={{ borderTop: hi > 0 ? '1px dashed #E2E8F0' : 'none', marginTop: hi > 0 ? 16 : 8 }}>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T }}>{dest?.name ?? h.destination_id}</p>
                            <div className="flex items-center gap-2 text-xs text-[#64748B]">
                              <span>{h.nights}N</span>
                              <span>·</span>
                              <span>{h.rooms} rm</span>
                              <span>·</span>
                              <span>{pax} pax</span>
                              {h.fetching && <Loader2 className="w-3 h-3 animate-spin text-[#94A3B8]" />}
                              {!h.fetching && h.fetched_price !== null && (
                                <span className="font-bold" style={{ color: T }}>₹{h.fetched_price.toLocaleString('en-IN')}</span>
                              )}
                              {!h.fetching && h.fetched_price === null && h.manual_cost !== null && (
                                <span className="font-bold" style={{ color: '#F59E0B' }}>₹{h.manual_cost.toLocaleString('en-IN')} <span className="font-normal text-[#94A3B8]">(manual)</span></span>
                              )}
                              {!h.fetching && h.fetch_error && h.fetched_price === null && h.manual_cost === null && (
                                <span className="text-[#EF4444] font-medium">No rate</span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="col-span-2 sm:col-span-1">
                              <label className={lbl}>Hotel</label>
                              <select className={sel} style={inpSt} value={h.hotel_id}
                                onChange={e => updHotelAndFetch(oi, hi, { hotel_id: e.target.value, room_category_id: '', fetched_price: null })}>
                                <option value="">{destHotels.length === 0 ? '⚠ No hotels for this destination' : 'Select hotel…'}</option>
                                {destHotels.map(ht => <option key={ht.id} value={ht.id}>{ht.hotel_name}{ht.star_rating ? ` (${ht.star_rating}★)` : ''}</option>)}
                              </select>
                              {destHotels.length === 0 && (
                                <p className="text-[11px] mt-1" style={{ color: '#F59E0B' }}>
                                  Add hotels for <strong>{dest?.name}</strong> in Hotels module first.
                                </p>
                              )}
                            </div>
                            <div>
                              <label className={lbl}>Room Type</label>
                              <select className={sel} style={inpSt} value={h.room_category_id} disabled={!h.hotel_id}
                                onChange={e => updHotelAndFetch(oi, hi, { room_category_id: e.target.value })}>
                                <option value="">Select…</option>
                                {roomCats.map(r => <option key={r.id} value={r.id}>{r.room_category_name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={lbl}>Meal Plan</label>
                              <select className={sel} style={inpSt} value={h.meal_plan_id}
                                onChange={e => updHotelAndFetch(oi, hi, { meal_plan_id: e.target.value })}>
                                <option value="">Select…</option>
                                {mealPlans.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={lbl}>Check-in</label>
                              <input type="date" className={inp} style={inpSt} value={h.check_in_date}
                                onChange={e => {
                                  const newIn = e.target.value;
                                  const newOut = new Date(new Date(newIn).getTime() + h.nights * 86400000).toISOString().slice(0, 10);
                                  updHotelAndFetch(oi, hi, { check_in_date: newIn, check_out_date: newOut });
                                }} />
                            </div>
                            <div>
                              <label className={lbl}>Check-out</label>
                              <input type="date" className={inp} style={inpSt} value={h.check_out_date}
                                onChange={e => {
                                  const nights = Math.max(1, Math.round((new Date(e.target.value).getTime() - new Date(h.check_in_date).getTime()) / 86400000));
                                  updHotelAndFetch(oi, hi, { check_out_date: e.target.value, nights });
                                }} />
                            </div>
                            <div>
                              <label className={lbl}>Rooms</label>
                              <input type="number" min="1" className={inp} style={inpSt} value={h.rooms}
                                onChange={e => updHotelAndFetch(oi, hi, { rooms: Number(e.target.value) })} />
                            </div>
                          </div>

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
                        <span className="text-sm font-bold" style={{ color: T }}>₹{optionTotal.toLocaleString('en-IN')}</span>
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

            {/* Rate chips */}
            {vehicleTypeId && vehRates.filter(r => r.vehicle_type_id === vehicleTypeId).length > 0 && (
              <div className="mt-4">
                <p className={lbl}>Available Rates — Click to Apply</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {vehRates.filter(r => r.vehicle_type_id === vehicleTypeId).map(r => (
                    <button key={r.id} type="button" onClick={() => setVehicleCost(r.base_cost)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                      style={vehicleCost === r.base_cost ? { backgroundColor: `${T}15`, borderColor: T, color: T } : { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', color: '#64748B' }}>
                      {r.route_name} · {r.duration_days}D · ₹{r.base_cost.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                        <span className="text-[#64748B]">Hotel ₹{hotelTotal.toLocaleString('en-IN')} + Vehicle ₹{vehicleCost.toLocaleString('en-IN')} = <span className="font-bold text-[#0F172A]">₹{(hotelTotal + vehicleCost).toLocaleString('en-IN')}</span></span>
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
      {/* STEP 5 — PROFIT MARGIN & SUMMARY                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {step === 5 && quoteType === 'PRIVATE' && (
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
                <label className={lbl}>GST (%)</label>
                <div className="flex gap-2">
                  {[0, 5, 12].map(g => (
                    <button key={g} type="button" onClick={() => setGstPercent(g)}
                      className="flex-1 h-9 rounded-lg text-xs font-bold border-2 transition-all"
                      style={gstPercent === g ? { backgroundColor: T, borderColor: T, color: 'white' } : { borderColor: '#E2E8F0', color: '#64748B' }}>
                      {g}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
                    { label: 'Hotel B2B', key: 'hotelTotal' as const },
                    { label: `Vehicle`, key: 'baseCost' as const, isVehicle: true },
                    { label: 'B2B Subtotal', key: 'baseCost' as const, bold: true },
                    { label: `Profit ${profitType === 'PERCENTAGE' ? `(${profitValue}%)` : '(flat)'}`, key: 'profitAmt' as const, green: true },
                    { label: 'Before GST', key: 'beforeGst' as const },
                    { label: `GST (${gstPercent}%)`, key: 'gstAmt' as const },
                    { label: 'NET TOTAL', key: 'total' as const, bold: true, large: true },
                  ].map((row, ri) => (
                    <tr key={ri} style={{ borderTop: '1px solid #F1F5F9', backgroundColor: row.bold ? '#F8FAFC' : 'white' }}>
                      <td className="px-4 py-2.5 text-xs text-[#64748B]" style={{ fontWeight: row.bold ? 700 : 400 }}>{row.label}</td>
                      {options.map((opt, oi) => {
                        const c = liveCalc(opt);
                        let val = 0;
                        if (row.isVehicle) val = vehicleCost;
                        else if (row.key === 'hotelTotal') val = c.hotelTotal;
                        else if (row.key === 'baseCost') val = row.isVehicle ? vehicleCost : c.baseCost;
                        else if (row.key === 'profitAmt') val = c.profitAmt;
                        else if (row.key === 'beforeGst') val = c.beforeGst;
                        else if (row.key === 'gstAmt') val = c.gstAmt;
                        else if (row.key === 'total') val = c.total;
                        return (
                          <td key={oi} className="px-4 py-2.5 text-right font-semibold"
                            style={{ color: row.large ? T : row.green ? '#16a34a' : '#0F172A', fontSize: row.large ? 15 : 12, fontWeight: row.bold ? 700 : 500 }}>
                            ₹{Math.round(val).toLocaleString('en-IN')}
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
                  const c = liveCalc(opt);
                  return (
                    <div key={oi} className="flex-1 p-3 rounded-xl text-center" style={{ backgroundColor: `${T}08`, border: `1px solid ${T}20` }}>
                      <p className="text-[10px] font-bold text-[#64748B]">{opt.name}</p>
                      <p className="text-lg font-bold mt-1" style={{ color: T }}>₹{Math.round(c.total / adults).toLocaleString('en-IN')}</p>
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
      {((step === 6 && quoteType === 'PRIVATE') || (step === 3 && quoteType === 'GROUP')) && createdQuote && (
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
                        <p className="text-base font-bold mt-1" style={{ color: T }}>₹{Math.round(r.final_price).toLocaleString('en-IN')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href={`https://wa.me/91${custMobile.replace(/\D/g, '')}?text=${encodeURIComponent(waText)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: '#25D366' }}>
                <ExternalLink className="w-4 h-4" /> Send on WhatsApp
              </a>
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
      {step < (quoteType === 'PRIVATE' ? 6 : 3) && (
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
              : step === 5 || (quoteType === 'GROUP' && step === 2)
                ? 'Publish & Generate Link'
                : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}
