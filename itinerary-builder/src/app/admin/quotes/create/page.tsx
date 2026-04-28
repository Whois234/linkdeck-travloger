'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import {
  Users, MapPin, LayoutList, DollarSign, FileText, Link2,
  Search, Plus, ChevronRight, Check, Copy, ExternalLink,
  Trash2, ChevronDown,
} from 'lucide-react';

/* ── Style tokens ── */
const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const ta    = 'w-full px-3 py-2 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white resize-none';
const inpSt = { borderColor: '#E2E8F0' };
const T     = '#134956';
const card  = { border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

/* ── Types ── */
interface Customer  { id: string; name: string; phone: string; email?: string | null; city?: string | null }
interface State     { id: string; name: string; code: string }
interface Agent     { id: string; name: string; role: string }
interface PT        { id: string; template_name: string; duration_days: number; duration_nights: number; state_id: string; hero_image?: string | null; theme?: string | null; destinations: string[]; template_hotel_tiers: HTier[]; template_days: TDay[]; cms_data: CMSData | null }
interface GT        { id: string; group_template_name: string; duration_days: number; duration_nights: number; state_id: string; hero_image?: string | null; theme?: string | null; group_batches: Batch[] }
interface Batch     { id: string; batch_name: string; start_date: string; end_date: string; total_seats: number; available_seats: number; adult_price: number; child_5_12_price: number; child_below_5_price: number; gst_percent: number; booking_status: string }
interface Dest      { id: string; name: string }
interface Hotel     { id: string; hotel_name: string; destination_id: string; room_categories: { id: string; room_category_name: string }[] }
interface MealPlan  { id: string; code: string; name: string }
interface VehicleType { id: string; display_name: string; capacity: number }
interface HTier     { tier_name: string; destination_id: string; default_hotel_id: string | null; default_room_category_id: string | null; default_meal_plan_id: string | null; nights: number }
interface TDay      { id?: string; day_number: number; destination_id: string; title: string; description_override?: string | null; image_override?: string | null; meals?: Record<string, boolean> | null }
interface CMSData   { package_options?: Array<{ tier_name: string; is_most_popular: boolean; inclusions: string[] }> }

interface HotelSel  {
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
  manual_cost_override: number | null;
}
interface PricingOpt {
  option_name: string;
  display_order: number;
  is_most_popular: boolean;
  vehicle_type_id: string;
  vehicle_cost: number;
  activity_cost: number;
  transfer_cost: number;
  misc_cost: number;
  profit_type: 'FLAT' | 'PERCENTAGE';
  profit_value: number;
  discount_amount: number;
  gst_percent: number;
  rounding_rule: 'NONE' | 'NEAREST_99' | 'NEAREST_500' | 'NEAREST_1000';
  internal_notes: string;
  hotels: HotelSel[];
}

const PRIVATE_STEPS = [
  { id: 1, label: 'Customer',    icon: Users      },
  { id: 2, label: 'Template',    icon: LayoutList },
  { id: 3, label: 'Rooms',       icon: MapPin     },
  { id: 4, label: 'Pricing',     icon: DollarSign },
  { id: 5, label: 'Review',      icon: FileText   },
  { id: 6, label: 'Share',       icon: Link2      },
];
const GROUP_STEPS = [
  { id: 1, label: 'Customer',    icon: Users      },
  { id: 2, label: 'Tour',        icon: LayoutList },
  { id: 3, label: 'Review',      icon: FileText   },
  { id: 4, label: 'Share',       icon: Link2      },
];

const ROUNDING_OPTIONS = [
  { value: 'NONE',         label: 'No rounding' },
  { value: 'NEAREST_99',   label: 'Round to …99' },
  { value: 'NEAREST_500',  label: 'Round to nearest 500' },
  { value: 'NEAREST_1000', label: 'Round to nearest 1000' },
];

/* ════════════════════════════════════════════════════ */
export default function CreateQuotePage() {
  const router = useRouter();

  /* ── Global state ── */
  const [step, setStep]             = useState(1);
  const [quoteType, setQuoteType]   = useState<'PRIVATE' | 'GROUP'>('PRIVATE');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const [createdQuote, setCreatedQuote] = useState<{ id: string; quote_number: string; public_token: string } | null>(null);
  const [copied, setCopied]         = useState(false);

  /* ── Step 1: Customer ── */
  const [customer, setCustomer]           = useState<Customer | null>(null);
  const [custSearch, setCustSearch]       = useState('');
  const [custResults, setCustResults]     = useState<Customer[]>([]);
  const [showAddCust, setShowAddCust]     = useState(false);
  const [newCust, setNewCust]             = useState({ name: '', phone: '', email: '', city: '' });
  const [addingCust, setAddingCust]       = useState(false);
  const [basics, setBasics] = useState({
    state_id: '', start_date: '', end_date: '',
    adults: 2, children_5_12: 0, children_below_5: 0, infants: 0,
    pickup_point: '', drop_point: '',
    assigned_agent_id: '', expiry_date: '',
  });

  /* ── Step 2: Template ── */
  const [privateTpls,  setPrivateTpls]  = useState<PT[]>([]);
  const [groupTpls,    setGroupTpls]    = useState<GT[]>([]);
  const [selectedPT,   setSelectedPT]   = useState<PT | null>(null);
  const [selectedGT,   setSelectedGT]   = useState<GT | null>(null);
  const [selectedBatch,setSelectedBatch]= useState<Batch | null>(null);

  /* ── Step 3: Hotel selections per option ── */
  const [pricingOptions, setPricingOptions] = useState<PricingOpt[]>([]);

  /* ── Step 4: Calculated results ── */
  const [calcResults, setCalcResults] = useState<Record<string, number>>({});
  const [calculating, setCalculating] = useState(false);

  /* ── Reference data ── */
  const [states,    setStates]    = useState<State[]>([]);
  const [agents,    setAgents]    = useState<Agent[]>([]);
  const [dests,     setDests]     = useState<Dest[]>([]);
  const [hotels,    setHotels]    = useState<Hotel[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [vehTypes,  setVehTypes]  = useState<VehicleType[]>([]);

  const steps = quoteType === 'PRIVATE' ? PRIVATE_STEPS : GROUP_STEPS;
  const totalSteps = steps.length;

  /* ── Load reference data ── */
  useEffect(() => {
    Promise.all([
      fetch('/api/v1/states').then(r => r.json()),
      fetch('/api/v1/agents').then(r => r.json()),
      fetch('/api/v1/destinations').then(r => r.json()),
      fetch('/api/v1/meal-plans').then(r => r.json()),
      fetch('/api/v1/vehicle-types').then(r => r.json()),
    ]).then(([sd, ad, dd, md, vd]) => {
      if (sd.success) setStates(sd.data);
      if (ad.success) setAgents(ad.data);
      if (dd.success) setDests(dd.data);
      if (md.success) setMealPlans(md.data);
      if (vd.success) setVehTypes(vd.data);
    });
  }, []);

  /* ── Customer search ── */
  useEffect(() => {
    if (custSearch.length < 2) { setCustResults([]); return; }
    fetch(`/api/v1/customers?q=${encodeURIComponent(custSearch)}`)
      .then(r => r.json()).then(d => { if (d.success) setCustResults(d.data); });
  }, [custSearch]);

  /* ── Load hotels when state changes ── */
  useEffect(() => {
    if (!basics.state_id) return;
    fetch('/api/v1/hotels').then(r => r.json()).then(d => { if (d.success) setHotels(d.data); });
  }, [basics.state_id]);

  /* ── Load templates when moving to step 2 ── */
  useEffect(() => {
    if (step !== 2 || !basics.state_id) return;
    if (quoteType === 'PRIVATE') {
      fetch(`/api/v1/private-templates?state_id=${basics.state_id}`).then(r => r.json()).then(d => { if (d.success) setPrivateTpls(d.data); });
    } else {
      fetch(`/api/v1/group-templates?state_id=${basics.state_id}`).then(r => r.json()).then(d => { if (d.success) setGroupTpls(d.data); });
    }
  }, [step, basics.state_id, quoteType]);

  /* ── Auto-dates from batch ── */
  useEffect(() => {
    if (!selectedBatch) return;
    setBasics(p => ({
      ...p,
      start_date: selectedBatch.start_date?.slice(0, 10) ?? p.start_date,
      end_date:   selectedBatch.end_date?.slice(0, 10)   ?? p.end_date,
    }));
  }, [selectedBatch]);

  /* ── Auto-populate pricing options when template selected ── */
  const scaffoldPricingOptions = useCallback((tpl: PT) => {
    const options = tpl.cms_data?.package_options ?? [
      { tier_name: 'Standard', is_most_popular: false, inclusions: [] },
      { tier_name: 'Deluxe',   is_most_popular: true,  inclusions: [] },
    ];
    const nights = tpl.duration_nights;
    const destList = (tpl.destinations ?? []) as string[];

    const newOpts: PricingOpt[] = options.map((opt, oi) => {
      const hotels: HotelSel[] = destList.map(did => {
        const tier = tpl.template_hotel_tiers?.find(t => t.tier_name === opt.tier_name && t.destination_id === did);
        // Suggest check-in/out from start_date + cumulative nights
        const startMs = basics.start_date ? new Date(basics.start_date).getTime() : Date.now();
        const tierNights = tier?.nights ?? Math.max(1, Math.floor(nights / destList.length));
        const checkIn = new Date(startMs).toISOString().slice(0, 10);
        const checkOut = new Date(startMs + tierNights * 86400000).toISOString().slice(0, 10);
        return {
          destination_id: did,
          hotel_id: tier?.default_hotel_id ?? '',
          room_category_id: tier?.default_room_category_id ?? '',
          meal_plan_id: tier?.default_meal_plan_id ?? '',
          check_in_date: checkIn,
          check_out_date: checkOut,
          nights: tierNights,
          rooms: Math.ceil(basics.adults / 2),
          adults_per_room: 2,
          cwb: basics.children_5_12,
          cwob: basics.children_below_5,
          manual_cost_override: null,
        };
      });
      return {
        option_name: opt.tier_name,
        display_order: oi + 1,
        is_most_popular: opt.is_most_popular,
        vehicle_type_id: '',
        vehicle_cost: 0,
        activity_cost: 0,
        transfer_cost: 0,
        misc_cost: 0,
        profit_type: 'PERCENTAGE',
        profit_value: 15,
        discount_amount: 0,
        gst_percent: 5,
        rounding_rule: 'NEAREST_500',
        internal_notes: '',
        hotels,
      };
    });
    setPricingOptions(newOpts);
  }, [basics.start_date, basics.adults, basics.children_5_12, basics.children_below_5]);

  useEffect(() => {
    if (selectedPT) scaffoldPricingOptions(selectedPT);
  }, [selectedPT, scaffoldPricingOptions]);

  /* ── Helpers ── */
  const nights = basics.start_date && basics.end_date
    ? Math.max(0, Math.round((new Date(basics.end_date).getTime() - new Date(basics.start_date).getTime()) / 86400000))
    : (selectedPT?.duration_nights ?? selectedGT?.duration_nights ?? 0);
  const days = nights + 1;

  function hotelsForDest(destId: string) { return hotels.filter(h => h.destination_id === destId); }
  function roomsForHotel(hotelId: string) { return hotels.find(h => h.id === hotelId)?.room_categories ?? []; }

  function updOpt(oi: number, patch: Partial<PricingOpt>) {
    setPricingOptions(p => p.map((o, i) => i === oi ? { ...o, ...patch } : o));
  }
  function updHotelSel(oi: number, hi: number, patch: Partial<HotelSel>) {
    setPricingOptions(p => p.map((o, i) => {
      if (i !== oi) return o;
      return { ...o, hotels: o.hotels.map((h, j) => j === hi ? { ...h, ...patch } : h) };
    }));
  }

  /* ── Add new customer ── */
  async function addCustomer() {
    if (!newCust.name || !newCust.phone) return;
    setAddingCust(true);
    const res = await fetch('/api/v1/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCust.name, phone: newCust.phone, email: newCust.email || null, city: newCust.city || null }),
    });
    const d = await res.json();
    if (d.success) {
      setCustomer(d.data);
      setShowAddCust(false);
      setNewCust({ name: '', phone: '', email: '', city: '' });
    }
    setAddingCust(false);
  }

  /* ── Create quote (called at Review step) ── */
  async function createQuote() {
    if (!customer) return;
    setSaving(true); setErr('');
    const payload = {
      quote_type: quoteType,
      customer_id: customer.id,
      state_id: basics.state_id,
      start_date: new Date(basics.start_date).toISOString(),
      end_date: new Date(basics.end_date).toISOString(),
      duration_days: days,
      duration_nights: nights,
      adults: basics.adults,
      children_5_12: basics.children_5_12,
      children_below_5: basics.children_below_5,
      infants: basics.infants,
      pickup_point: basics.pickup_point || null,
      drop_point: basics.drop_point || null,
      assigned_agent_id: basics.assigned_agent_id || null,
      expiry_date: basics.expiry_date ? new Date(basics.expiry_date).toISOString() : null,
      private_template_id: selectedPT?.id ?? null,
      group_template_id: selectedGT?.id ?? null,
      group_batch_id: selectedBatch?.id ?? null,
    };
    const res = await fetch('/api/v1/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? 'Failed to create'); setSaving(false); return; }
    setCreatedQuote(d.data);
    setSaving(false);
    return d.data;
  }

  /* ── Calculate pricing (Step 4) ── */
  async function calculatePricing(quoteId: string) {
    setCalculating(true); setErr('');
    const payload = {
      options: pricingOptions.map(opt => ({
        option_name: opt.option_name,
        display_order: opt.display_order,
        is_most_popular: opt.is_most_popular,
        vehicle_type_id: opt.vehicle_type_id || null,
        vehicle_cost: opt.vehicle_cost,
        activity_cost: opt.activity_cost,
        transfer_cost: opt.transfer_cost,
        misc_cost: opt.misc_cost,
        profit_type: opt.profit_type,
        profit_value: opt.profit_value,
        discount_amount: opt.discount_amount,
        gst_percent: opt.gst_percent,
        rounding_rule: opt.rounding_rule,
        internal_notes: opt.internal_notes || null,
        customer_visible_notes: null,
        hotels: opt.hotels.filter(h => h.hotel_id).map(h => ({
          destination_id: h.destination_id,
          hotel_id: h.hotel_id,
          room_category_id: h.room_category_id,
          meal_plan_id: h.meal_plan_id,
          check_in_date: new Date(h.check_in_date).toISOString(),
          check_out_date: new Date(h.check_out_date).toISOString(),
          rooming_json: {
            rooms: [{ type: 'Double', count: h.rooms, adults: h.adults_per_room, children_with_bed: h.cwb, children_without_bed: h.cwob }],
          },
          manual_cost_override: h.manual_cost_override,
          override_reason: null,
        })),
      })),
    };
    const res = await fetch(`/api/v1/quotes/${quoteId}/calculate-pricing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? 'Pricing calculation failed'); setCalculating(false); return; }
    const results: Record<string, number> = {};
    (d.data ?? []).forEach((o: { option_name: string; final_price: number }) => { results[o.option_name] = o.final_price; });
    setCalcResults(results);
    setCalculating(false);
  }

  /* ── Publish quote ── */
  async function publishQuote(quoteId: string) {
    setSaving(true);
    await fetch(`/api/v1/quotes/${quoteId}/publish`, { method: 'POST' });
    setSaving(false);
  }

  /* ── Next / Back ── */
  async function goNext() {
    setErr('');
    if (step === 1) {
      if (!customer) { setErr('Please select or add a customer'); return; }
      if (!basics.state_id) { setErr('Please select a state/region'); return; }
      if (!basics.start_date || !basics.end_date) { setErr('Please enter travel dates'); return; }
      setStep(2);
    } else if (step === 2) {
      if (quoteType === 'PRIVATE' && !selectedPT) { setErr('Please select a template'); return; }
      if (quoteType === 'GROUP' && (!selectedGT || !selectedBatch)) { setErr('Please select a group tour and batch'); return; }
      setStep(3);
    } else if (step === 3) {
      if (quoteType === 'GROUP') {
        // For group: step 3 is Review — create quote here
        const q = await createQuote();
        if (q) setStep(4);
      } else {
        // PRIVATE: step 3 is Rooms — go to Pricing
        setStep(4);
      }
    } else if (step === 4) {
      if (quoteType === 'PRIVATE') {
        // Create quote then calculate pricing
        let q = createdQuote;
        if (!q) { q = await createQuote(); }
        if (q) {
          await calculatePricing(q.id);
          if (!err) setStep(5);
        }
      } else {
        // GROUP: step 4 is Share — do nothing, already created
        setStep(4);
      }
    } else if (step === 5 && quoteType === 'PRIVATE') {
      // Review → Share: publish
      if (createdQuote) {
        await publishQuote(createdQuote.id);
        setStep(6);
      }
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

  /* ═══ RENDER ═══ */
  const currentStepLabel = steps.find(s => s.id === step)?.label ?? '';

  return (
    <div className="max-w-[860px]">
      <PageHeader
        title="New Quote"
        subtitle={`Step ${step} of ${totalSteps} — ${currentStepLabel}`}
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Quotes', href: '/admin/quotes' }, { label: 'New Quote' }]}
      />

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6 bg-white rounded-2xl px-5 py-4" style={card}>
        {steps.map((s, i) => {
          const Icon = s.icon;
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

      {err && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{err}</div>}

      {/* ══════════ STEP 1 — CUSTOMER & BASICS ══════════ */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          {/* Quote type toggle */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className={lbl}>Quote Type</p>
            <div className="flex gap-3 mt-2">
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
            <p className="text-sm font-bold text-[#0F172A] mb-3">Customer</p>
            {customer ? (
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: T }}>{customer.name[0].toUpperCase()}</div>
                  <div>
                    <p className="font-semibold text-sm text-[#0F172A]">{customer.name}</p>
                    <p className="text-xs text-[#94A3B8] font-mono">{customer.phone}{customer.city ? ` · ${customer.city}` : ''}</p>
                  </div>
                </div>
                <button onClick={() => setCustomer(null)} className="h-8 px-3 rounded-lg text-xs font-semibold text-[#64748B] hover:bg-[#F1F5F9]" style={{ border: '1px solid #E2E8F0' }}>Change</button>
              </div>
            ) : showAddCust ? (
              <div className="rounded-xl p-4" style={{ border: '1px solid #E2E8F0' }}>
                <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">New Customer</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Name <span className="text-red-500">*</span></label><input className={inp} style={inpSt} value={newCust.name} onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))} placeholder="Rajan Kumar" /></div>
                  <div><label className={lbl}>Phone <span className="text-red-500">*</span></label><input className={inp} style={inpSt} value={newCust.phone} onChange={e => setNewCust(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
                  <div><label className={lbl}>Email</label><input className={inp} style={inpSt} value={newCust.email} onChange={e => setNewCust(p => ({ ...p, email: e.target.value }))} placeholder="optional" /></div>
                  <div><label className={lbl}>City</label><input className={inp} style={inpSt} value={newCust.city} onChange={e => setNewCust(p => ({ ...p, city: e.target.value }))} placeholder="Chennai" /></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setShowAddCust(false)} className="h-8 px-3 rounded-lg text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0' }}>Cancel</button>
                  <button onClick={addCustomer} disabled={addingCust || !newCust.name || !newCust.phone}
                    className="h-8 px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: T }}>
                    {addingCust ? 'Adding…' : 'Add Customer'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search by name or phone…"
                    className="w-full h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none bg-white" style={inpSt} />
                </div>
                {custResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                    {custResults.map(c => (
                      <button key={c.id} onClick={() => { setCustomer(c); setCustSearch(''); setCustResults([]); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#F8FAFC] flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <span className="text-sm font-semibold text-[#0F172A]">{c.name}</span>
                        <span className="text-xs text-[#94A3B8] font-mono">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowAddCust(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold mt-2" style={{ color: T }}>
                  <Plus className="w-3.5 h-3.5" /> Add new customer
                </button>
              </div>
            )}
          </div>

          {/* Basics */}
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-4">Travel Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={lbl}>State / Region <span className="text-red-500">*</span></label>
                <select className={sel} style={inpSt} value={basics.state_id} onChange={e => setBasics(p => ({ ...p, state_id: e.target.value }))}>
                  <option value="">Select state…</option>
                  {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Start Date <span className="text-red-500">*</span></label>
                <input type="date" className={inp} style={inpSt} value={basics.start_date} onChange={e => setBasics(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>End Date <span className="text-red-500">*</span></label>
                <input type="date" className={inp} style={inpSt} value={basics.end_date} onChange={e => setBasics(p => ({ ...p, end_date: e.target.value }))} />
              </div>
              {basics.start_date && basics.end_date && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-[#64748B]">Duration: <span style={{ color: T }}>{nights}N / {days}D</span></p>
                </div>
              )}
              <div><label className={lbl}>Adults <span className="text-red-500">*</span></label><input type="number" min="1" className={inp} style={inpSt} value={basics.adults} onChange={e => setBasics(p => ({ ...p, adults: Number(e.target.value) }))} /></div>
              <div><label className={lbl}>Children (5–12)</label><input type="number" min="0" className={inp} style={inpSt} value={basics.children_5_12} onChange={e => setBasics(p => ({ ...p, children_5_12: Number(e.target.value) }))} /></div>
              <div><label className={lbl}>Children (&lt;5)</label><input type="number" min="0" className={inp} style={inpSt} value={basics.children_below_5} onChange={e => setBasics(p => ({ ...p, children_below_5: Number(e.target.value) }))} /></div>
              <div><label className={lbl}>Infants</label><input type="number" min="0" className={inp} style={inpSt} value={basics.infants} onChange={e => setBasics(p => ({ ...p, infants: Number(e.target.value) }))} /></div>
              <div><label className={lbl}>Pickup Point</label><input className={inp} style={inpSt} value={basics.pickup_point} onChange={e => setBasics(p => ({ ...p, pickup_point: e.target.value }))} placeholder="Cochin Airport" /></div>
              <div><label className={lbl}>Drop Point</label><input className={inp} style={inpSt} value={basics.drop_point} onChange={e => setBasics(p => ({ ...p, drop_point: e.target.value }))} placeholder="Trivandrum Airport" /></div>
              <div>
                <label className={lbl}>Assigned Agent</label>
                <select className={sel} style={inpSt} value={basics.assigned_agent_id} onChange={e => setBasics(p => ({ ...p, assigned_agent_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                </select>
              </div>
              <div><label className={lbl}>Quote Expiry</label><input type="date" className={inp} style={inpSt} value={basics.expiry_date} onChange={e => setBasics(p => ({ ...p, expiry_date: e.target.value }))} /></div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ STEP 2 — TEMPLATE SELECTION ══════════ */}
      {step === 2 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Select Itinerary Template</p>
            <p className="text-xs text-[#94A3B8]">Templates for {states.find(s => s.id === basics.state_id)?.name}</p>
          </div>
          {privateTpls.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl" style={card}>
              <p className="text-sm text-[#64748B]">No private templates found for this state.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {privateTpls.map(tpl => (
                <div key={tpl.id} onClick={() => setSelectedPT(tpl)} className="bg-white rounded-2xl overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-all"
                  style={{ border: `2px solid ${selectedPT?.id === tpl.id ? T : '#E2E8F0'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div className="h-28 bg-gradient-to-br from-[#134956]/10 to-[#134956]/20 relative overflow-hidden">
                    {tpl.hero_image && <img src={tpl.hero_image} alt={tpl.template_name} className="w-full h-full object-cover" />}
                    {selectedPT?.id === tpl.id && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `${T}88` }}>
                        <Check className="w-8 h-8 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm text-[#0F172A]">{tpl.template_name}</p>
                    <p className="text-xs text-[#94A3B8] mt-0.5">{tpl.duration_nights}N/{tpl.duration_days}D · {tpl.theme ?? 'Custom'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && quoteType === 'GROUP' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Select Group Tour</p>
            <p className="text-xs text-[#94A3B8]">Group departures for {states.find(s => s.id === basics.state_id)?.name}</p>
          </div>
          {groupTpls.map(gt => (
            <div key={gt.id} className="bg-white rounded-2xl p-4" style={{ ...card, border: `2px solid ${selectedGT?.id === gt.id ? T : '#E2E8F0'}` }}>
              <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setSelectedGT(gt.id === selectedGT?.id ? null : gt)}>
                <div>
                  <p className="font-semibold text-sm text-[#0F172A]">{gt.group_template_name}</p>
                  <p className="text-xs text-[#94A3B8]">{gt.duration_nights}N/{gt.duration_days}D · {gt.theme ?? 'Group Tour'}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-[#94A3B8] transition-transform ${selectedGT?.id === gt.id ? 'rotate-180' : ''}`} />
              </div>
              {selectedGT?.id === gt.id && (
                <div className="flex flex-col gap-2">
                  {gt.group_batches.filter(b => b.booking_status !== 'CANCELLED' && b.booking_status !== 'CLOSED').map(b => {
                    const start = new Date(b.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                    const end   = new Date(b.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    return (
                      <div key={b.id} onClick={() => setSelectedBatch(b.id === selectedBatch?.id ? null : b)}
                        className="rounded-xl p-3 cursor-pointer transition-colors"
                        style={{ border: `1px solid ${selectedBatch?.id === b.id ? T : '#E2E8F0'}`, backgroundColor: selectedBatch?.id === b.id ? `${T}08` : '#F8FAFC' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-[#0F172A]">{b.batch_name}</p>
                            <p className="text-xs text-[#64748B]">{start} → {end}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-[#0F172A]">₹{Number(b.adult_price).toLocaleString('en-IN')}</p>
                            <p className="text-xs text-[#94A3B8]">{b.available_seats} seats left</p>
                          </div>
                        </div>
                        {selectedBatch?.id === b.id && <div className="mt-1 flex items-center gap-1 text-xs font-semibold" style={{ color: T }}><Check className="w-3 h-3" /> Selected</div>}
                      </div>
                    );
                  })}
                  {gt.group_batches.filter(b => b.booking_status !== 'CANCELLED').length === 0 && (
                    <p className="text-xs text-[#94A3B8] text-center py-3">No open batches available</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════════ STEP 3 — ROOMS (PRIVATE) / REVIEW (GROUP) ══════════ */}
      {step === 3 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Hotel & Room Configuration</p>
            <p className="text-xs text-[#94A3B8]">Set hotels and rooms for each option. Pre-filled from template defaults.</p>
          </div>
          {pricingOptions.map((opt, oi) => (
            <div key={oi} className="bg-white rounded-2xl p-5" style={card}>
              <p className="text-sm font-bold mb-4" style={{ color: T }}>{opt.option_name} — Hotels</p>
              {opt.hotels.map((hs, hi) => {
                const dest = dests.find(d => d.id === hs.destination_id);
                const destHotels = hotelsForDest(hs.destination_id);
                const rooms = roomsForHotel(hs.hotel_id);
                return (
                  <div key={hi} className="mb-5 pb-5" style={{ borderBottom: hi < opt.hotels.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-3">{dest?.name ?? hs.destination_id}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <label className={lbl}>Hotel</label>
                        <select className={sel} style={inpSt} value={hs.hotel_id}
                          onChange={e => updHotelSel(oi, hi, { hotel_id: e.target.value, room_category_id: '' })}>
                          <option value="">Select hotel…</option>
                          {destHotels.map(h => <option key={h.id} value={h.id}>{h.hotel_name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Room Type</label>
                        <select className={sel} style={inpSt} value={hs.room_category_id}
                          onChange={e => updHotelSel(oi, hi, { room_category_id: e.target.value })} disabled={!hs.hotel_id}>
                          <option value="">Select…</option>
                          {rooms.map(r => <option key={r.id} value={r.id}>{r.room_category_name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Meal Plan</label>
                        <select className={sel} style={inpSt} value={hs.meal_plan_id}
                          onChange={e => updHotelSel(oi, hi, { meal_plan_id: e.target.value })}>
                          <option value="">Select…</option>
                          {mealPlans.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Check-in</label>
                        <input type="date" className={inp} style={inpSt} value={hs.check_in_date}
                          onChange={e => updHotelSel(oi, hi, { check_in_date: e.target.value })} />
                      </div>
                      <div>
                        <label className={lbl}>Check-out</label>
                        <input type="date" className={inp} style={inpSt} value={hs.check_out_date}
                          onChange={e => updHotelSel(oi, hi, { check_out_date: e.target.value })} />
                      </div>
                      <div>
                        <label className={lbl}>Rooms</label>
                        <input type="number" min="1" className={inp} style={inpSt} value={hs.rooms}
                          onChange={e => updHotelSel(oi, hi, { rooms: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className={lbl}>Adults/Room</label>
                        <input type="number" min="1" max="4" className={inp} style={inpSt} value={hs.adults_per_room}
                          onChange={e => updHotelSel(oi, hi, { adults_per_room: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className={lbl}>CWB</label>
                        <input type="number" min="0" className={inp} style={inpSt} value={hs.cwb}
                          onChange={e => updHotelSel(oi, hi, { cwb: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className={lbl}>CWOB</label>
                        <input type="number" min="0" className={inp} style={inpSt} value={hs.cwob}
                          onChange={e => updHotelSel(oi, hi, { cwob: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className={lbl}>Manual Cost Override (₹)</label>
                        <input type="number" min="0" className={inp} style={inpSt}
                          value={hs.manual_cost_override ?? ''}
                          onChange={e => updHotelSel(oi, hi, { manual_cost_override: e.target.value ? Number(e.target.value) : null })}
                          placeholder="Leave blank to calculate" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {step === 3 && quoteType === 'GROUP' && selectedGT && selectedBatch && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-4">Review Booking</p>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <span className="text-[#94A3B8]">Customer</span><span className="font-semibold text-[#0F172A]">{customer?.name}</span>
              <span className="text-[#94A3B8]">Tour</span><span className="font-semibold text-[#0F172A]">{selectedGT.group_template_name}</span>
              <span className="text-[#94A3B8]">Batch</span><span className="font-semibold text-[#0F172A]">{selectedBatch.batch_name}</span>
              <span className="text-[#94A3B8]">Dates</span><span className="font-semibold text-[#0F172A]">{new Date(selectedBatch.start_date).toLocaleDateString('en-IN', { day:'numeric',month:'short',year:'numeric' })} → {new Date(selectedBatch.end_date).toLocaleDateString('en-IN', { day:'numeric',month:'short',year:'numeric' })}</span>
              <span className="text-[#94A3B8]">Pax</span><span className="font-semibold text-[#0F172A]">{basics.adults} adult{basics.adults !== 1 ? 's' : ''}{basics.children_5_12 ? `, ${basics.children_5_12} child` : ''}</span>
              <span className="text-[#94A3B8]">Adult Price</span><span className="font-bold text-lg" style={{ color: T }}>₹{Number(selectedBatch.adult_price).toLocaleString('en-IN')}</span>
              <span className="text-[#94A3B8]">Seats left</span><span className="font-semibold text-[#0F172A]">{selectedBatch.available_seats}</span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ STEP 4 — PRICING (PRIVATE) ══════════ */}
      {step === 4 && quoteType === 'PRIVATE' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <p className="text-sm font-bold text-[#0F172A] mb-1">Pricing Configuration</p>
            <p className="text-xs text-[#94A3B8]">Set vehicle cost, profit margins, and GST for each package option.</p>
          </div>
          {pricingOptions.map((opt, oi) => (
            <div key={oi} className="bg-white rounded-2xl p-5" style={{ ...card, border: `2px solid ${opt.is_most_popular ? T : '#E2E8F0'}` }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[#0F172A]">{opt.option_name}</p>
                <div className="flex items-center gap-2">
                  {opt.is_most_popular && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: T }}>Most Popular</span>}
                  {Object.keys(calcResults).length > 0 && calcResults[opt.option_name] && (
                    <span className="text-sm font-bold" style={{ color: '#22c55e' }}>₹{calcResults[opt.option_name]?.toLocaleString('en-IN')}</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Vehicle Type</label>
                  <select className={sel} style={inpSt} value={opt.vehicle_type_id}
                    onChange={e => updOpt(oi, { vehicle_type_id: e.target.value })}>
                    <option value="">None</option>
                    {vehTypes.map(v => <option key={v.id} value={v.id}>{v.display_name} ({v.capacity} pax)</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Vehicle Cost (₹)</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={opt.vehicle_cost}
                    onChange={e => updOpt(oi, { vehicle_cost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={lbl}>Activity Cost (₹)</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={opt.activity_cost}
                    onChange={e => updOpt(oi, { activity_cost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={lbl}>Transfer Cost (₹)</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={opt.transfer_cost}
                    onChange={e => updOpt(oi, { transfer_cost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={lbl}>Misc Cost (₹)</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={opt.misc_cost}
                    onChange={e => updOpt(oi, { misc_cost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={lbl}>Discount (₹)</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={opt.discount_amount}
                    onChange={e => updOpt(oi, { discount_amount: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={lbl}>Profit Type</label>
                  <select className={sel} style={inpSt} value={opt.profit_type}
                    onChange={e => updOpt(oi, { profit_type: e.target.value as 'FLAT' | 'PERCENTAGE' })}>
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FLAT">Flat (₹)</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Profit Value {opt.profit_type === 'PERCENTAGE' ? '(%)' : '(₹)'}</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={opt.profit_value}
                    onChange={e => updOpt(oi, { profit_value: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={lbl}>GST %</label>
                  <input type="number" min="0" max="100" className={inp} style={inpSt} value={opt.gst_percent}
                    onChange={e => updOpt(oi, { gst_percent: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={lbl}>Rounding</label>
                  <select className={sel} style={inpSt} value={opt.rounding_rule}
                    onChange={e => updOpt(oi, { rounding_rule: e.target.value as PricingOpt['rounding_rule'] })}>
                    {ROUNDING_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={lbl}>Internal Notes</label>
                  <textarea className={ta} style={inpSt} rows={2} value={opt.internal_notes}
                    onChange={e => updOpt(oi, { internal_notes: e.target.value })} placeholder="Cost breakdown notes…" />
                </div>
              </div>
            </div>
          ))}
          {Object.keys(calcResults).length > 0 && (
            <div className="bg-white rounded-2xl p-5" style={card}>
              <p className="text-sm font-bold text-[#0F172A] mb-3">Calculated Final Prices</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pricingOptions.map(opt => (
                  <div key={opt.option_name} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <p className="text-xs text-[#94A3B8] mb-1">{opt.option_name}</p>
                    <p className="text-xl font-bold" style={{ color: T }}>₹{(calcResults[opt.option_name] ?? 0).toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">per person</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ STEP 5 — REVIEW ITINERARY (PRIVATE) ══════════ */}
      {step === 5 && quoteType === 'PRIVATE' && selectedPT && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl p-5" style={card}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Review Itinerary</p>
                <p className="text-xs text-[#94A3B8] mt-0.5">{selectedPT.template_name} · {selectedPT.duration_nights}N/{selectedPT.duration_days}D</p>
              </div>
              {createdQuote && (
                <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: `${T}12`, color: T }}>{createdQuote.quote_number}</span>
              )}
            </div>
          </div>
          {selectedPT.template_days.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl text-sm text-[#64748B]" style={card}>No day plans in this template.</div>
          ) : (
            selectedPT.template_days.map((day, i) => {
              const dest = dests.find(d => d.id === day.destination_id);
              return (
                <div key={i} className="bg-white rounded-2xl p-4" style={card}>
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: T }}>{day.day_number}</div>
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">{day.title}</p>
                      <p className="text-xs text-[#94A3B8]">{dest?.name ?? '—'}</p>
                    </div>
                  </div>
                  {day.description_override && <p className="text-xs text-[#64748B] mt-2 line-clamp-2">{day.description_override}</p>}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ══════════ STEP 6 / LAST — SHARE LINK ══════════ */}
      {((step === 6 && quoteType === 'PRIVATE') || (step === 4 && quoteType === 'GROUP')) && createdQuote && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-6 text-center" style={card}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#DCFCE7' }}>
              <Check className="w-7 h-7" style={{ color: '#16a34a' }} />
            </div>
            <p className="text-base font-bold text-[#0F172A] mb-1">Quote Created!</p>
            <p className="text-sm text-[#64748B] mb-4">Quote number: <span className="font-bold" style={{ color: T }}>{createdQuote.quote_number}</span></p>
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <code className="flex-1 text-xs text-[#64748B] text-left truncate">{typeof window !== 'undefined' ? `${window.location.origin}/quotations/${createdQuote.public_token}` : `/quotations/${createdQuote.public_token}`}</code>
              <button onClick={copyLink}
                className="h-7 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 text-white"
                style={{ backgroundColor: copied ? '#22c55e' : T }}>
                {copied ? <><Check className="w-3 h-3" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
              </button>
            </div>
            <div className="flex gap-3 justify-center">
              <a href={`https://wa.me/?text=${encodeURIComponent(`Hi! Here is your tour quotation: ${typeof window !== 'undefined' ? window.location.origin : ''}/quotations/${createdQuote.public_token}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: '#25D366' }}>
                <ExternalLink className="w-4 h-4" /> Share on WhatsApp
              </a>
              <button onClick={() => router.push(`/admin/quotes/${createdQuote.id}`)}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
                View Quote →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ NAV BUTTONS ══════════ */}
      {step < (quoteType === 'PRIVATE' ? 6 : 4) && (
        <div className="flex items-center justify-between mt-6 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={goBack} disabled={step === 1}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-30" style={{ border: '1px solid #E2E8F0' }}>
            ← Back
          </button>
          <button onClick={goNext} disabled={saving || calculating}
            className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: T }}>
            {saving ? 'Creating…' : calculating ? 'Calculating…' : step === (quoteType === 'PRIVATE' ? 5 : 3) ? 'Publish & Generate Link' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}
