'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { ImageUploader } from '@/components/admin/ImageUploader';
import {
  ChevronDown, ChevronRight, Plus, Trash2, Check,
  Save, Star, Image as ImgIcon, FileText, LayoutList,
  MapPin, Shield, HelpCircle, BookOpen,
} from 'lucide-react';

/* ── Shared style tokens ── */
const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const ta    = 'w-full px-3 py-2 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white resize-none';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor: '#E2E8F0' };
const T     = '#134956';
const card  = { border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

/* ── Types ── */
interface Dest   { id: string; name: string }
interface Hotel  { id: string; hotel_name: string; destination_id: string; room_categories: { id: string; room_category_name: string }[] }
interface MealPlan { id: string; code: string; name: string }
interface DayPlan  { id: string; title: string; destination_id: string; description?: string | null }
interface Policy   { id: string; title: string; policy_type: string; content: string }

interface CmsOption {
  tier_name: string;
  display_order: number;
  is_most_popular: boolean;
  inclusions: string[];
}
interface WhyItem { title: string; description: string }
interface CmsData {
  pax_count: number;
  hero_heading: string;
  hero_subheading: string;
  hero_tags: string[];
  destination_cards: Array<{ destination_id: string; custom_name: string | null; description: string; image_url: string }>;
  package_options: CmsOption[];
  why_choose: (string | WhyItem)[];
  faqs_enabled: boolean;
  custom_faqs: Array<{ question: string; answer: string }>;
}

// Normalise legacy string[] entries to WhyItem objects
function normaliseWhy(items: (string | WhyItem)[]): WhyItem[] {
  return items.map(i => typeof i === 'string' ? { title: i, description: '' } : i);
}
interface TDay {
  id?: string; day_number: number; destination_id: string; title: string;
  description_override: string | null; image_override: string | null;
  day_plan_id: string | null; meals: Record<string, boolean> | null; sort_order: number;
}
interface HTier {
  tier_name: string; destination_id: string;
  default_hotel_id: string | null; default_room_category_id: string | null;
  default_meal_plan_id: string | null; nights: number; sort_order: number;
}
interface Template {
  id: string; template_name: string; duration_days: number; duration_nights: number;
  theme: string | null; start_city: string | null; end_city: string | null; hero_image: string | null;
  destinations: string[]; state_id: string; state: { id: string; name: string };
  cms_data: CmsData | null;
  template_days: TDay[];
  template_hotel_tiers: HTier[];
}

const DEFAULT_CMS: CmsData = {
  pax_count: 2, hero_heading: '', hero_subheading: '',
  hero_tags: [], destination_cards: [], package_options: [
    { tier_name: 'Standard', display_order: 1, is_most_popular: false, inclusions: [] },
    { tier_name: 'Deluxe',   display_order: 2, is_most_popular: true,  inclusions: [] },
  ],
  why_choose: [
    { title: 'Ranked Professionals',    description: 'Expert travel consultants with years of on-ground experience.' },
    { title: 'Best Prices Guaranteed',  description: 'Competitive rates with no hidden charges — ever.' },
    { title: 'Top-tier Standards',      description: 'Carefully vetted hotels, vehicles and activity partners.' },
    { title: '24×7 Monitoring',         description: 'Round-the-clock support throughout your journey.' },
    { title: 'On-ground Support',       description: 'Local guides and coordinators at every destination.' },
  ],
  faqs_enabled: false, custom_faqs: [],
};

const SECTIONS = [
  { id: 'hero',    label: 'Hero',              icon: ImgIcon     },
  { id: 'dests',   label: 'Destination Cards', icon: MapPin      },
  { id: 'options', label: 'Package Options',   icon: LayoutList  },
  { id: 'days',    label: 'Day Itinerary',      icon: FileText    },
  { id: 'why',     label: 'Why Choose',        icon: Star        },
  { id: 'policy',  label: 'Policies',          icon: Shield      },
  { id: 'faq',     label: 'FAQs',              icon: HelpCircle  },
  { id: 'terms',   label: 'Terms',             icon: BookOpen    },
];

/* ════════════════════════════════════════════════════ */
export default function TemplateEditPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [tpl,      setTpl]      = useState<Template | null>(null);
  const [cms,      setCms]      = useState<CmsData>(DEFAULT_CMS);
  const [days,     setDays]     = useState<TDay[]>([]);
  const [tiers,    setTiers]    = useState<HTier[]>([]);
  const [dests,    setDests]    = useState<Dest[]>([]);
  const [hotels,   setHotels]   = useState<Hotel[]>([]);
  const [mealPlans,setMealPlans] = useState<MealPlan[]>([]);
  const [dayPlans, setDayPlans]  = useState<DayPlan[]>([]);
  const [policies, setPolicies]  = useState<Policy[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [expandedDays, setExpandedDays]   = useState<Set<number>>(new Set([1]));
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [tr, dr, hr, mr, dpr, pr] = await Promise.all([
      fetch(`/api/v1/private-templates/${id}`),
      fetch('/api/v1/destinations'),
      fetch('/api/v1/hotels'),
      fetch('/api/v1/meal-plans'),
      fetch('/api/v1/day-plans'),
      fetch('/api/v1/policies'),
    ]);
    const [td, dd, hd, md, dpd, pd] = await Promise.all([tr.json(), dr.json(), hr.json(), mr.json(), dpr.json(), pr.json()]);
    if (td.success) {
      const t: Template = td.data;
      setTpl(t);
      const c: CmsData = t.cms_data ?? { ...DEFAULT_CMS };
      // Ensure destination_cards are in sync with template destinations
      if (c.destination_cards.length === 0 && t.destinations?.length) {
        c.destination_cards = (t.destinations as string[]).map((did: string) => ({
          destination_id: did, custom_name: null, description: '', image_url: '',
        }));
      }
      setCms(c);
      setDays(t.template_days.map(d => ({ ...d, description_override: d.description_override ?? null, image_override: d.image_override ?? null, day_plan_id: d.day_plan_id ?? null, meals: d.meals as Record<string,boolean> | null ?? null })));
      setTiers(t.template_hotel_tiers);
      setSelectedPolicies((t as unknown as { default_policy_ids?: string[] }).default_policy_ids ?? []);
    }
    if (dd.success) setDests(dd.data);
    if (hd.success) setHotels(hd.data);
    if (md.success) setMealPlans(md.data);
    if (dpd.success) setDayPlans(dpd.data);
    if (pd.success) setPolicies(pd.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* ── Auto-scaffold days when template is loaded ── */
  useEffect(() => {
    if (!tpl || days.length > 0) return;
    const nights = tpl.duration_nights;
    const destList = (tpl.destinations ?? []) as string[];
    const newDays: TDay[] = Array.from({ length: nights + 1 }, (_, i) => ({
      day_number: i + 1,
      destination_id: destList[0] ?? '',
      title: `Day ${i + 1}`,
      description_override: null,
      image_override: null,
      day_plan_id: null,
      meals: null,
      sort_order: i + 1,
    }));
    setDays(newDays);
  }, [tpl, days.length]);

  /* ── Auto-scaffold hotel tiers ── */
  useEffect(() => {
    if (!tpl || tiers.length > 0) return;
    const destList = (tpl.destinations ?? []) as string[];
    const optNames = cms.package_options.map(o => o.tier_name);
    const newTiers: HTier[] = [];
    let so = 0;
    for (const opt of optNames) {
      for (const did of destList) {
        newTiers.push({ tier_name: opt, destination_id: did, default_hotel_id: null, default_room_category_id: null, default_meal_plan_id: null, nights: 1, sort_order: ++so });
      }
    }
    setTiers(newTiers);
  }, [tpl, tiers.length, cms.package_options]);

  /* ── Save ── */
  const save = useCallback(async (publish = false) => {
    setSaving(true);
    try {
      await Promise.all([
        fetch(`/api/v1/private-templates/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cms_data: cms,
            hero_image: cms.hero_tags[0] ?? null,
            default_policy_ids: selectedPolicies,
            status: publish ? true : undefined,
          }),
        }),
        fetch(`/api/v1/private-templates/${id}/days`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(days),
        }),
        fetch(`/api/v1/private-templates/${id}/hotel-tiers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tiers),
        }),
      ]);
      if (publish) {
        // Redirect back to list with success banner
        router.push('/admin/private-templates?published=1');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }, [id, cms, days, tiers, selectedPolicies, router]);

  /* ── Helpers ── */
  function updCms<K extends keyof CmsData>(key: K, val: CmsData[K]) {
    setCms(p => ({ ...p, [key]: val }));
  }
  function toggleDay(n: number) {
    setExpandedDays(prev => {
      const s = new Set(prev);
      if (s.has(n)) s.delete(n); else s.add(n);
      return s;
    });
  }
  function updDay(idx: number, patch: Partial<TDay>) {
    setDays(p => p.map((d, i) => i === idx ? { ...d, ...patch } : d));
  }
  function updTier(tierName: string, destId: string, patch: Partial<HTier>) {
    setTiers(p => p.map(t => t.tier_name === tierName && t.destination_id === destId ? { ...t, ...patch } : t));
  }
  function tiersForOption(optName: string) {
    return tiers.filter(t => t.tier_name === optName);
  }
  function hotelsForDest(destId: string) {
    return hotels.filter(h => h.destination_id === destId);
  }
  function roomsForHotel(hotelId: string) {
    return hotels.find(h => h.id === hotelId)?.room_categories ?? [];
  }
  function dayPlansForDest(destId: string) {
    return dayPlans.filter(dp => dp.destination_id === destId);
  }
  function togglePolicy(pid: string) {
    setSelectedPolicies(p => p.includes(pid) ? p.filter(x => x !== pid) : [...p, pid]);
  }

  /* ═══ RENDER ═══ */
  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: T }} />
    </div>
  );
  if (!tpl) return <div className="py-20 text-center text-sm text-[#64748B]">Template not found.</div>;

  const destList = (tpl.destinations ?? []) as string[];

  return (
    <div className="max-w-[1200px]">
      <PageHeader
        title={tpl.template_name}
        subtitle={`${tpl.duration_nights}N/${tpl.duration_days}D · ${tpl.state.name}${tpl.theme ? ` · ${tpl.theme}` : ''}`}
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Private Templates', href: '/admin/private-templates' }, { label: 'Edit' }]}
        action={
          <div className="flex gap-2">
            <button onClick={() => save(false)} disabled={saving}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: saved ? '#22c55e' : T, color: 'white' }}>
              {saved ? <><Check className="w-4 h-4" /> Saved!</> : saving ? 'Saving…' : <><Save className="w-4 h-4" /> Save Draft</>}
            </button>
            <button onClick={() => save(true)} disabled={saving}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: '#16a34a' }}>
              Publish
            </button>
          </div>
        }
      />

      <div className="flex gap-6">
        {/* ── SIDEBAR nav ── */}
        <nav className="w-44 flex-shrink-0">
          <div className="sticky top-4 bg-white rounded-2xl overflow-hidden py-2" style={card}>
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <button key={s.id} onClick={() => setActiveSection(s.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors"
                  style={active ? { backgroundColor: `${T}12`, color: T } : { color: '#64748B' }}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {s.label}
                  {active && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── MAIN content ── */}
        <div className="flex-1 min-w-0">

          {/* ═══ HERO ═══ */}
          {activeSection === 'hero' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Hero Section" desc="The full-width banner customers see first." />
              <div className="grid gap-4">
                <div>
                  <ImageUploader
                    label="Hero Image"
                    folder="templates/hero"
                    value={cms.hero_tags[0] ?? null}
                    onChange={url => updCms('hero_tags', url ? [url, ...cms.hero_tags.slice(1)] : cms.hero_tags.slice(1))}
                    placeholder="Upload hero banner image"
                    sizeHint="1200 × 630 px (landscape 16:9)"
                  />
                </div>
                <div>
                  <label className={lbl}>Main Heading</label>
                  <input className={inp} style={inpSt} value={cms.hero_heading}
                    onChange={e => updCms('hero_heading', e.target.value)} placeholder="God's Own Country" />
                </div>
                <div>
                  <label className={lbl}>Subheading / Tagline</label>
                  <input className={inp} style={inpSt} value={cms.hero_subheading}
                    onChange={e => updCms('hero_subheading', e.target.value)} placeholder="Kerala — Where Nature Meets Soul" />
                </div>
                <div>
                  <label className={lbl}>Destination Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {(cms.hero_tags.slice(1) ?? []).map((tag, i) => (
                      <span key={i} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>
                        {tag}
                        <button onClick={() => {
                          const t = [...cms.hero_tags]; t.splice(i + 1, 1); updCms('hero_tags', t);
                        }} className="ml-1 text-[#94A3B8] hover:text-red-500">×</button>
                      </span>
                    ))}
                    <TagInput onAdd={t => updCms('hero_tags', [...cms.hero_tags, t])} />
                  </div>
                  <p className="text-[11px] text-[#94A3B8] mt-1">Shown as chips on the hero banner</p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ DESTINATION CARDS ═══ */}
          {activeSection === 'dests' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Destination Cards" desc="One card per destination shown in the gallery grid." />
              <div className="flex flex-col gap-4">
                {cms.destination_cards.map((dc, i) => {
                  const dest = dests.find(d => d.id === dc.destination_id);
                  return (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #E2E8F0' }}>
                      <p className="text-sm font-semibold text-[#0F172A] mb-3">{dest?.name ?? dc.destination_id}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <ImageUploader
                            label="Destination Photo"
                            folder="templates/destinations"
                            value={dc.image_url || null}
                            onChange={url => { const c = [...cms.destination_cards]; c[i] = { ...c[i], image_url: url ?? '' }; updCms('destination_cards', c); }}
                            placeholder="Upload destination photo"
                            sizeHint="800 × 600 px (4:3)"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className={lbl}>Short Description</label>
                          <textarea className={ta} style={inpSt} rows={2} value={dc.description}
                            onChange={e => { const c = [...cms.destination_cards]; c[i] = { ...c[i], description: e.target.value }; updCms('destination_cards', c); }}
                            placeholder="Venice of the East…" />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {destList.length > 0 && cms.destination_cards.length === 0 && (
                  <button onClick={() => updCms('destination_cards', destList.map(did => ({ destination_id: did, custom_name: null, description: '', image_url: '' })))}
                    className="h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
                    Auto-generate from destinations
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ═══ PACKAGE OPTIONS ═══ */}
          {activeSection === 'options' && (
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl p-6" style={card}>
                <SectionHeader title="Package Options" desc="Define 1–3 options (Standard / Deluxe / Premium). Pricing is calculated at quote time." />
                <div className="flex gap-2 mb-4 flex-wrap">
                  {cms.package_options.map((opt, oi) => (
                    <div key={oi} className="flex-1 min-w-[160px] rounded-xl p-4" style={{ border: `2px solid ${opt.is_most_popular ? T : '#E2E8F0'}` }}>
                      <div className="flex items-center justify-between mb-3">
                        <input className="font-bold text-sm bg-transparent border-0 outline-none text-[#0F172A] w-full"
                          value={opt.tier_name}
                          onChange={e => { const o = [...cms.package_options]; o[oi] = { ...o[oi], tier_name: e.target.value }; updCms('package_options', o); }} />
                        {cms.package_options.length > 1 && (
                          <button onClick={() => {
                            const o = cms.package_options.filter((_, i) => i !== oi).map((x, i) => ({ ...x, display_order: i + 1 }));
                            updCms('package_options', o);
                          }} className="text-[#94A3B8] hover:text-red-500 ml-2 flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input type="checkbox" checked={opt.is_most_popular}
                          onChange={() => {
                            const o = cms.package_options.map((x, i) => ({ ...x, is_most_popular: i === oi }));
                            updCms('package_options', o);
                          }} />
                        <span className="text-xs text-[#64748B]">Most Popular</span>
                      </label>
                      <p className={lbl}>Inclusions</p>
                      <div className="flex flex-col gap-1">
                        {opt.inclusions.map((inc, ii) => (
                          <div key={ii} className="flex items-center gap-1">
                            <input className="flex-1 h-7 px-2 rounded border text-xs focus:outline-none" style={inpSt}
                              value={inc} onChange={e => { const o = [...cms.package_options]; o[oi] = { ...o[oi], inclusions: o[oi].inclusions.map((x, j) => j === ii ? e.target.value : x) }; updCms('package_options', o); }} />
                            <button onClick={() => { const o = [...cms.package_options]; o[oi] = { ...o[oi], inclusions: o[oi].inclusions.filter((_, j) => j !== ii) }; updCms('package_options', o); }}
                              className="text-[#94A3B8] hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        ))}
                        <button onClick={() => { const o = [...cms.package_options]; o[oi] = { ...o[oi], inclusions: [...o[oi].inclusions, ''] }; updCms('package_options', o); }}
                          className="text-xs font-semibold flex items-center gap-1 mt-1" style={{ color: T }}>
                          <Plus className="w-3 h-3" /> Add inclusion
                        </button>
                      </div>
                    </div>
                  ))}
                  {cms.package_options.length < 3 && (
                    <button onClick={() => updCms('package_options', [...cms.package_options, { tier_name: `Option ${cms.package_options.length + 1}`, display_order: cms.package_options.length + 1, is_most_popular: false, inclusions: [] }])}
                      className="flex-shrink-0 w-12 rounded-xl flex items-center justify-center" style={{ border: '2px dashed #E2E8F0' }}>
                      <Plus className="w-5 h-5 text-[#CBD5E1]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Hotel selections per option per destination */}
              {cms.package_options.map((opt, oi) => (
                <div key={oi} className="bg-white rounded-2xl p-6" style={card}>
                  <p className="text-sm font-bold text-[#0F172A] mb-4">{opt.tier_name} — Hotel Selections</p>
                  {destList.map(did => {
                    const dest = dests.find(d => d.id === did);
                    const tier = tiersForOption(opt.tier_name).find(t => t.destination_id === did) ?? { tier_name: opt.tier_name, destination_id: did, default_hotel_id: null, default_room_category_id: null, default_meal_plan_id: null, nights: 1, sort_order: 0 };
                    const destHotels = hotelsForDest(did);
                    const rooms = roomsForHotel(tier.default_hotel_id ?? '');
                    return (
                      <div key={did} className="mb-4 pb-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-2">{dest?.name}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className={lbl}>Hotel</label>
                            <select className={sel} style={inpSt} value={tier.default_hotel_id ?? ''}
                              onChange={e => updTier(opt.tier_name, did, { default_hotel_id: e.target.value || null, default_room_category_id: null })}>
                              <option value="">Select…</option>
                              {destHotels.map(h => <option key={h.id} value={h.id}>{h.hotel_name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Room</label>
                            <select className={sel} style={inpSt} value={tier.default_room_category_id ?? ''}
                              onChange={e => updTier(opt.tier_name, did, { default_room_category_id: e.target.value || null })}
                              disabled={!tier.default_hotel_id}>
                              <option value="">Select…</option>
                              {rooms.map(r => <option key={r.id} value={r.id}>{r.room_category_name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Meal Plan</label>
                            <select className={sel} style={inpSt} value={tier.default_meal_plan_id ?? ''}
                              onChange={e => updTier(opt.tier_name, did, { default_meal_plan_id: e.target.value || null })}>
                              <option value="">Select…</option>
                              {mealPlans.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Nights</label>
                            <input type="number" min="0" className={inp} style={inpSt} value={tier.nights}
                              onChange={e => updTier(opt.tier_name, did, { nights: Number(e.target.value) })} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ═══ DAY ITINERARY ═══ */}
          {activeSection === 'days' && (
            <div className="flex flex-col gap-3">
              <div className="bg-white rounded-2xl p-5" style={card}>
                <SectionHeader title="Day-wise Itinerary" desc={`${tpl.duration_nights + 1} days · Fill in titles, descriptions and images.`} />
              </div>
              {days.map((day, i) => {
                const isOpen = expandedDays.has(day.day_number);
                const dps    = dayPlansForDest(day.destination_id);
                return (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden" style={card}>
                    <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer" onClick={() => toggleDay(day.day_number)}>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-[#94A3B8]" /> : <ChevronRight className="w-4 h-4 text-[#94A3B8]" />}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: T }}>
                        {day.day_number}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#0F172A]">{day.title || `Day ${day.day_number}`}</p>
                        <p className="text-xs text-[#94A3B8]">{dests.find(d => d.id === day.destination_id)?.name ?? '—'}</p>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid #F1F5F9' }}>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={lbl}>Destination for this day</label>
                            <select className={sel} style={inpSt} value={day.destination_id}
                              onChange={e => updDay(i, { destination_id: e.target.value, day_plan_id: null })}>
                              <option value="">Select…</option>
                              {dests.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>Day Plan Library (optional)</label>
                            <select className={sel} style={inpSt} value={day.day_plan_id ?? ''}
                              onChange={e => {
                                const dp = dayPlans.find(x => x.id === e.target.value);
                                updDay(i, { day_plan_id: e.target.value || null, title: dp?.title ?? day.title, description_override: dp?.description ?? day.description_override });
                              }}>
                              <option value="">None — write manually</option>
                              {dps.map(dp => <option key={dp.id} value={dp.id}>{dp.title}</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className={lbl}>Day Title <span className="text-red-500">*</span></label>
                            <input className={inp} style={inpSt} value={day.title}
                              onChange={e => updDay(i, { title: e.target.value })} placeholder={`Day ${day.day_number} — Arrival`} />
                          </div>
                          <div className="col-span-2">
                            <label className={lbl}>Description</label>
                            <textarea className={ta} style={inpSt} rows={4} value={day.description_override ?? ''}
                              onChange={e => updDay(i, { description_override: e.target.value || null })}
                              placeholder="Describe the day's activities and experiences…" />
                          </div>
                          <div className="col-span-2">
                            <ImageUploader
                              label="Day Image"
                              folder="templates/days"
                              value={day.image_override ?? null}
                              onChange={url => updDay(i, { image_override: url })}
                              placeholder="Upload day image"
                              sizeHint="1200 × 800 px (3:2) — shown full-width in itinerary"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className={lbl}>Meals included</label>
                            <div className="flex gap-3">
                              {(['B', 'L', 'D'] as const).map(meal => (
                                <label key={meal} className="flex items-center gap-1.5 cursor-pointer">
                                  <input type="checkbox"
                                    checked={!!(day.meals as Record<string, boolean> | null)?.[meal]}
                                    onChange={e => updDay(i, { meals: { ...(day.meals ?? {}), [meal]: e.target.checked } })} />
                                  <span className="text-sm text-[#334155]">{{ B: 'Breakfast', L: 'Lunch', D: 'Dinner' }[meal]}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══ WHY CHOOSE ═══ */}
          {activeSection === 'why' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Why Choose Travloger" desc="Add trust points with titles and descriptions shown on the customer quotation page." />
              <div className="flex flex-col gap-3">
                {normaliseWhy(cms.why_choose).map((item, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: T }}>{i + 1}</div>
                      <input
                        className="flex-1 h-9 px-3 rounded-lg border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={inpSt}
                        placeholder="Point title (e.g. Best Prices Guaranteed)"
                        value={item.title}
                        onChange={e => {
                          const w = normaliseWhy(cms.why_choose);
                          w[i] = { ...w[i], title: e.target.value };
                          updCms('why_choose', w);
                        }} />
                      <button onClick={() => updCms('why_choose', normaliseWhy(cms.why_choose).filter((_, j) => j !== i))}
                        className="text-[#94A3B8] hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <textarea
                      className={ta} style={inpSt} rows={2}
                      placeholder="Short description shown below the title (optional)"
                      value={item.description}
                      onChange={e => {
                        const w = normaliseWhy(cms.why_choose);
                        w[i] = { ...w[i], description: e.target.value };
                        updCms('why_choose', w);
                      }} />
                  </div>
                ))}
                <button onClick={() => updCms('why_choose', [...normaliseWhy(cms.why_choose), { title: '', description: '' }])}
                  className="flex items-center gap-2 text-sm font-semibold mt-1" style={{ color: T }}>
                  <Plus className="w-4 h-4" /> Add Point
                </button>
              </div>
            </div>
          )}

          {/* ═══ POLICIES ═══ */}
          {activeSection === 'policy' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Policies" desc="Toggle which policies to include. Content is managed in the Policies master." />
              <div className="flex flex-col gap-3">
                {['PAYMENT', 'CANCELLATION', 'IMPORTANT_NOTE'].map(type => {
                  const typePolicies = policies.filter(p => p.policy_type === type);
                  if (!typePolicies.length) return null;
                  return (
                    <div key={type}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] mb-2">{type.replace('_', ' ')}</p>
                      {typePolicies.map(p => (
                        <label key={p.id} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-[#F8FAFC] mb-1" style={{ border: `1px solid ${selectedPolicies.includes(p.id) ? T : '#E2E8F0'}` }}>
                          <input type="checkbox" checked={selectedPolicies.includes(p.id)} onChange={() => togglePolicy(p.id)} className="mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-[#0F172A]">{p.title}</p>
                            <p className="text-xs text-[#94A3B8] mt-0.5 line-clamp-1">{p.content.slice(0, 80)}…</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ FAQs ═══ */}
          {activeSection === 'faq' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="FAQs" desc="Toggle FAQ section on/off. Add or edit custom questions." />
              <label className="flex items-center gap-3 cursor-pointer mb-6 p-3 rounded-xl" style={{ border: '1px solid #E2E8F0', backgroundColor: cms.faqs_enabled ? `${T}08` : '#F8FAFC' }}>
                <div onClick={() => updCms('faqs_enabled', !cms.faqs_enabled)}
                  className="w-10 h-6 rounded-full transition-colors relative flex-shrink-0 cursor-pointer"
                  style={{ backgroundColor: cms.faqs_enabled ? T : '#CBD5E1' }}>
                  <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: cms.faqs_enabled ? '22px' : '4px' }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: cms.faqs_enabled ? T : '#64748B' }}>
                  {cms.faqs_enabled ? 'FAQs enabled' : 'FAQs disabled'}
                </span>
              </label>
              {cms.faqs_enabled && (
                <div className="flex flex-col gap-3">
                  {cms.custom_faqs.map((faq, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #E2E8F0' }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Q{i + 1}</p>
                        <button onClick={() => updCms('custom_faqs', cms.custom_faqs.filter((_, j) => j !== i))}
                          className="text-[#94A3B8] hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <input className={`${inp} mb-2`} style={inpSt} value={faq.question}
                        onChange={e => { const f = [...cms.custom_faqs]; f[i] = { ...f[i], question: e.target.value }; updCms('custom_faqs', f); }}
                        placeholder="What is included in the package?" />
                      <textarea className={ta} style={inpSt} rows={2} value={faq.answer}
                        onChange={e => { const f = [...cms.custom_faqs]; f[i] = { ...f[i], answer: e.target.value }; updCms('custom_faqs', f); }}
                        placeholder="Answer…" />
                    </div>
                  ))}
                  <button onClick={() => updCms('custom_faqs', [...cms.custom_faqs, { question: '', answer: '' }])}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
                    <Plus className="w-4 h-4" /> Add FAQ
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ TERMS ═══ */}
          {activeSection === 'terms' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Terms & Conditions" desc="Select which terms to include from the master list." />
              <div className="flex flex-col gap-2">
                {policies.filter(p => p.policy_type === 'TERMS').map(p => (
                  <label key={p.id} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-[#F8FAFC]" style={{ border: `1px solid ${selectedPolicies.includes(p.id) ? T : '#E2E8F0'}` }}>
                    <input type="checkbox" checked={selectedPolicies.includes(p.id)} onChange={() => togglePolicy(p.id)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">{p.title}</p>
                      <p className="text-xs text-[#94A3B8] mt-0.5 line-clamp-2">{p.content.slice(0, 100)}…</p>
                    </div>
                  </label>
                ))}
                {policies.filter(p => p.policy_type === 'TERMS').length === 0 && (
                  <p className="text-sm text-[#94A3B8] text-center py-8">No terms policies found. Add them in the Policies master.</p>
                )}
              </div>
            </div>
          )}

        </div>{/* end main content */}
      </div>{/* end flex */}
    </div>
  );
}

/* ── Sub-components ── */
function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-[#0F172A] mb-1">{title}</h2>
      <p className="text-sm text-[#64748B]">{desc}</p>
    </div>
  );
}

function TagInput({ onAdd }: { onAdd: (t: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div className="flex gap-1">
      <input className="h-7 px-2 rounded border text-xs focus:outline-none w-28" style={{ borderColor: '#E2E8F0' }}
        value={val} onChange={e => setVal(e.target.value)} placeholder="Add tag…"
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); } }} />
      <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(''); } }}
        className="h-7 w-7 rounded flex items-center justify-center text-white flex-shrink-0"
        style={{ backgroundColor: '#134956' }}>
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}
