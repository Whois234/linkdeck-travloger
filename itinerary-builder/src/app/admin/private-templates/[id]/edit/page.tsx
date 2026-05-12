'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import {
  ChevronDown, ChevronRight, Plus, Trash2, Check,
  Save, Star, Image as ImgIcon, FileText, LayoutList,
  MapPin, Shield, HelpCircle, BookOpen, ListPlus, Settings, GripVertical,
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
interface Dest   { id: string; name: string; state_id: string }
interface Hotel  { id: string; hotel_name: string; destination_id: string; room_categories: { id: string; room_category_name: string }[] }
interface MealPlan { id: string; code: string; name: string }
interface DayPlan  { id: string; title: string; destination_id: string; description?: string | null }
interface Policy   { id: string; title: string; policy_type: string; content: string }
interface StateItem { id: string; name: string }
interface City { id: string; name: string; state_id: string }

interface CmsOption {
  tier_name: string;
  display_order: number;
  is_most_popular: boolean;
  inclusions: string[];
}
interface WhyItem { title: string; description: string; icon?: string }
interface CmsData {
  pax_count: number;
  hero_heading: string;
  hero_subheading: string;
  hero_tags: string[];
  hero_images: string[];
  state_gallery_image: string;
  state_gallery_hidden?: boolean;
  state_gallery_custom_name?: string | null;
  destination_cards: Array<{ destination_id: string; custom_name: string | null; description: string; image_url: string; hidden?: boolean }>;
  package_options: CmsOption[];
  why_choose: (string | WhyItem)[];
  inclusions?: string[];
  exclusions?: string[];
  faqs_enabled: boolean;
  custom_faqs: Array<{ question: string; answer: string }>;
}

// Normalise legacy string[] entries to WhyItem objects
function normaliseWhy(items: (string | WhyItem)[]): WhyItem[] {
  return items.map(i => typeof i === 'string' ? { title: i, description: '', icon: 'star' } : { icon: 'star', ...i });
}

const ICON_OPTS = [
  { key: 'star',   label: '★' },
  { key: 'dollar', label: '$' },
  { key: 'shield', label: '✓' },
  { key: 'clock',  label: '⏱' },
  { key: 'heart',  label: '♥' },
  { key: 'pin',    label: '📍' },
] as const;
interface TDay {
  id?: string; day_number: number; destination_id: string; title: string;
  description_override: string | null; image_override: string | null;
  gallery_images: string[] | null;
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
  hero_tags: [], hero_images: [], state_gallery_image: '', destination_cards: [], package_options: [
    { tier_name: 'Standard', display_order: 1, is_most_popular: false, inclusions: [] },
    { tier_name: 'Deluxe',   display_order: 2, is_most_popular: true,  inclusions: [] },
  ],
  why_choose: [
    { title: 'Ranked Professionals',    description: 'Expert travel consultants with years of on-ground experience.',  icon: 'star'   },
    { title: 'Best Prices Guaranteed',  description: 'Competitive rates with no hidden charges — ever.',                icon: 'dollar' },
    { title: 'Top-tier Standards',      description: 'Carefully vetted hotels, vehicles and activity partners.',        icon: 'shield' },
    { title: '24×7 Monitoring',         description: 'Round-the-clock support throughout your journey.',               icon: 'clock'  },
    { title: 'On-ground Support',       description: 'Local guides and coordinators at every destination.',             icon: 'pin'    },
  ],
  inclusions: [], exclusions: [],
  faqs_enabled: false, custom_faqs: [],
};

const SECTIONS = [
  { id: 'settings', label: 'Settings',         icon: Settings    },
  { id: 'hero',    label: 'Hero',              icon: ImgIcon     },
  { id: 'dests',   label: 'Destination Cards', icon: MapPin      },
  { id: 'options', label: 'Package Options',   icon: LayoutList  },
  { id: 'days',    label: 'Day Itinerary',      icon: FileText    },
  { id: 'why',      label: 'Why Choose',        icon: Star        },
  { id: 'incl_excl', label: 'Incl / Excl',    icon: ListPlus    },
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
  const [states,   setStates]   = useState<StateItem[]>([]);
  const [cities,   setCities]   = useState<City[]>([]);
  const [hotelRatesCache, setHotelRatesCache] = useState<Record<string, { room_category_id: string; meal_plan_id: string }[]>>({});
  // Ref mirrors the state so fetchHotelRates can check without being in its dep array
  const hotelRatesCacheRef = useRef<typeof hotelRatesCache>({});
  const [editingTitle, setEditingTitle] = useState(false);
  const [destDragIdx, setDestDragIdx] = useState<number | null>(null);
  const [destDragOver, setDestDragOver] = useState<number | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState('settings');
  const [expandedDays, setExpandedDays]   = useState<Set<number>>(new Set([1]));
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [newCardName, setNewCardName]       = useState('');

  // ── Editable template settings (mirrors the create-modal fields) ──
  const [tplSettings, setTplSettings] = useState({
    template_name: '', duration_nights: '4', duration_days: '5',
    theme: '', start_city: '', end_city: '', state_id: '',
    destination_ids: [] as string[],
  });

  const fetchHotelRates = useCallback(async (hotelId: string) => {
    if (!hotelId || hotelRatesCacheRef.current[hotelId]) return;
    try {
      const res = await fetch(`/api/v1/hotels/${hotelId}/rates`);
      const d = await res.json();
      if (d.success) {
        const rates = (d.data as { room_category_id: string; meal_plan_id: string }[]).map(r => ({
          room_category_id: r.room_category_id,
          meal_plan_id: r.meal_plan_id,
        }));
        hotelRatesCacheRef.current = { ...hotelRatesCacheRef.current, [hotelId]: rates };
        setHotelRatesCache(hotelRatesCacheRef.current);
      }
    } catch { /* silent */ }
  }, []); // stable — uses ref for cache check, never recreated

  const load = useCallback(async () => {
    setLoading(true);
    const [tr, dr, hr, mr, dpr, pr, sr, cr] = await Promise.all([
      fetch(`/api/v1/private-templates/${id}`),
      fetch('/api/v1/destinations'),
      fetch('/api/v1/hotels'),
      fetch('/api/v1/meal-plans'),
      fetch('/api/v1/day-plans'),
      fetch('/api/v1/policies'),
      fetch('/api/v1/states'),
      fetch('/api/v1/cities'),
    ]);
    const [td, dd, hd, md, dpd, pd, sd, cd] = await Promise.all([tr.json(), dr.json(), hr.json(), mr.json(), dpr.json(), pr.json(), sr.json(), cr.json()]);
    if (sd.success) setStates(sd.data);
    if (cd.success) setCities(cd.data);
    if (td.success) {
      const t: Template = td.data;
      setTpl(t);
      setTplSettings({
        template_name: t.template_name,
        duration_nights: String(t.duration_nights),
        duration_days: String(t.duration_days),
        theme: t.theme ?? '',
        start_city: t.start_city ?? '',
        end_city: t.end_city ?? '',
        state_id: t.state_id,
        destination_ids: (t.destinations as string[]) ?? [],
      });
      const c: CmsData = t.cms_data ?? { ...DEFAULT_CMS };
      // Backfill any destinations missing from destination_cards
      const existingCardIds = new Set(c.destination_cards.map((dc: { destination_id: string }) => dc.destination_id));
      const missingDests = (t.destinations as string[] ?? []).filter((did: string) => !existingCardIds.has(did));
      if (missingDests.length > 0) {
        c.destination_cards = [
          ...c.destination_cards,
          ...missingDests.map((did: string) => ({ destination_id: did, custom_name: null, description: '', image_url: '' })),
        ];
      }
      if (!Array.isArray(c.hero_images)) c.hero_images = [];
      if (typeof c.state_gallery_image !== 'string') c.state_gallery_image = '';
      setCms(c);
      setDays(t.template_days.map(d => ({ ...d, description_override: d.description_override ?? null, image_override: d.image_override ?? null, gallery_images: (d as unknown as { gallery_images?: string[] | null }).gallery_images ?? null, day_plan_id: d.day_plan_id ?? null, meals: d.meals as Record<string,boolean> | null ?? null })));
      setTiers(t.template_hotel_tiers);
      // Pre-fetch rates for already-selected hotels
      t.template_hotel_tiers.forEach(tier => { if (tier.default_hotel_id) fetchHotelRates(tier.default_hotel_id); });
      setSelectedPolicies((t as unknown as { default_policy_ids?: string[] }).default_policy_ids ?? []);
    }
    if (dd.success) setDests(dd.data);
    if (hd.success) setHotels(hd.data);
    if (md.success) setMealPlans(md.data);
    if (dpd.success) setDayPlans(dpd.data);
    if (pd.success) setPolicies(pd.data);
    setLoading(false);
  }, [id, fetchHotelRates]);

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
      gallery_images: null,
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
            template_name:    tplSettings.template_name || undefined,
            duration_nights:  Number(tplSettings.duration_nights) || undefined,
            duration_days:    Number(tplSettings.duration_days) || undefined,
            theme:            tplSettings.theme || null,
            start_city:       tplSettings.start_city || null,
            end_city:         tplSettings.end_city || null,
            state_id:         tplSettings.state_id || undefined,
            destinations:     tplSettings.destination_ids,
            cms_data: {
              ...cms,
              pax_count: cms.pax_count,
              // Only keep destination_cards for currently-selected destinations
              destination_cards: cms.destination_cards.filter(dc =>
                tplSettings.destination_ids.includes(dc.destination_id)
              ),
            },
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
  }, [id, cms, days, tiers, selectedPolicies, tplSettings, router]);

  async function deleteTemplate() {
    if (!confirm('Move this template to Recently Deleted? You can restore it within 30 days.')) return;
    setDeleting(true);
    try {
      await fetch(`/api/v1/private-templates/${id}`, { method: 'DELETE' });
      router.push('/admin/private-templates');
    } catch {
      setDeleting(false);
    }
  }

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

  /* ── Destination drag-and-drop (hotel selections) ── */
  const dragSrcId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);
  function handleDestDragStart(did: string) { dragSrcId.current = did; }
  function handleDestDragOver(e: React.DragEvent, did: string) {
    e.preventDefault();
    dragOverId.current = did;
  }
  function handleDestDrop() {
    const src = dragSrcId.current;
    const over = dragOverId.current;
    if (!src || !over || src === over) return;
    setTplSettings(p => {
      const ids = [...p.destination_ids];
      const fromIdx = ids.indexOf(src);
      const toIdx   = ids.indexOf(over);
      if (fromIdx === -1 || toIdx === -1) return p;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, src);
      return { ...p, destination_ids: ids };
    });
    dragSrcId.current  = null;
    dragOverId.current = null;
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

  // For hotel sections: only show destinations already saved in the DB, in the current drag order.
  // tplSettings.destination_ids may contain unsaved additions (which would inflate night counts).
  const _savedDestSet = new Set((tpl.destinations as string[]) ?? []);
  const destList = tplSettings.destination_ids.filter(id => _savedDestSet.has(id));

  return (
    <div className="max-w-[1200px]">
      {/* ── Header with inline-editable title ── */}
      <div className="flex items-start justify-between mb-7">
        <div>
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 mb-2">
            {[{ label: 'Admin', href: '/admin' }, { label: 'Private Templates', href: '/admin/private-templates' }, { label: tplSettings.template_name || tpl.template_name || 'Edit' }].map((c, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                {c.href ? (
                  <a href={c.href} className="text-xs font-medium" style={{ color: '#94A3B8' }}>{c.label}</a>
                ) : (
                  <span className="text-xs font-semibold" style={{ color: '#64748B' }}>{c.label}</span>
                )}
                {i < arr.length - 1 && <ChevronRight className="w-3 h-3" style={{ color: '#CBD5E1' }} />}
              </span>
            ))}
          </nav>
          {/* Inline-editable title */}
          {editingTitle ? (
            <input
              autoFocus
              className="text-2xl font-bold tracking-tight bg-transparent border-b-2 outline-none w-full max-w-lg"
              style={{ color: '#0F172A', borderColor: T }}
              value={tplSettings.template_name}
              onChange={e => setTplSettings(p => ({ ...p, template_name: e.target.value }))}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false); }}
            />
          ) : (
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setEditingTitle(true)}>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#0F172A' }}>
                {tplSettings.template_name || tpl.template_name}
              </h1>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2" strokeLinecap="round" className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
          )}
          <p className="text-sm mt-1 font-medium" style={{ color: '#64748B' }}>
            {tplSettings.duration_nights}N/{tplSettings.duration_days}D · {tpl.state.name}{tplSettings.theme ? ` · ${tplSettings.theme}` : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0 ml-4">
          <button onClick={deleteTemplate} disabled={deleting || saving}
            className="flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-colors"
            style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
            title="Move to Recently Deleted">
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
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
      </div>

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

          {/* ═══ SETTINGS ═══ */}
          {activeSection === 'settings' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Template Settings" desc="Edit the basic details you set when creating this template." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Template Name */}
                <div className="sm:col-span-2">
                  <label className={lbl}>Template Name <span className="text-red-500">*</span></label>
                  <input className={inp} style={inpSt}
                    value={tplSettings.template_name}
                    onChange={e => setTplSettings(p => ({ ...p, template_name: e.target.value }))}
                    placeholder="Kerala Backwaters 5D/4N" />
                </div>

                {/* Nights / Days */}
                <div>
                  <label className={lbl}>Nights <span className="text-red-500">*</span></label>
                  <input type="number" min="0" className={inp} style={inpSt}
                    value={tplSettings.duration_nights}
                    onChange={e => {
                      const newNights = Math.max(0, Number(e.target.value) || 0);
                      setTplSettings(p => ({ ...p, duration_nights: String(newNights), duration_days: String(newNights + 1) }));
                      setDays(prevDays => {
                        const target = newNights + 1;
                        if (prevDays.length === target) return prevDays;
                        if (target > prevDays.length) {
                          const destIds = tplSettings.destination_ids;
                          const lastDest = destIds[destIds.length - 1] ?? destIds[0] ?? '';
                          const extra: TDay[] = Array.from({ length: target - prevDays.length }, (_, k) => ({
                            day_number: prevDays.length + k + 1,
                            destination_id: lastDest,
                            title: `Day ${prevDays.length + k + 1}`,
                            description_override: null, image_override: null, gallery_images: null,
                            day_plan_id: null, meals: null, sort_order: prevDays.length + k + 1,
                          }));
                          return [...prevDays, ...extra];
                        }
                        return prevDays.slice(0, target);
                      });
                    }} />
                </div>
                <div>
                  <label className={lbl}>Days</label>
                  <input type="number" min="1" className={inp} style={inpSt}
                    value={tplSettings.duration_days}
                    onChange={e => setTplSettings(p => ({ ...p, duration_days: e.target.value }))} />
                </div>

                {/* Default Pax */}
                <div>
                  <label className={lbl}>Default Pax</label>
                  <input type="number" min="1" className={inp} style={inpSt}
                    value={cms.pax_count}
                    onChange={e => updCms('pax_count', Number(e.target.value) || 2)} />
                </div>

                {/* Theme */}
                <div>
                  <label className={lbl}>Theme</label>
                  <input className={inp} style={inpSt}
                    value={tplSettings.theme}
                    onChange={e => setTplSettings(p => ({ ...p, theme: e.target.value }))}
                    placeholder="Backwaters, Hill Station…" />
                </div>

                {/* Start City */}
                <div>
                  <label className={lbl}>Start City</label>
                  <select className={sel} style={inpSt}
                    value={tplSettings.start_city}
                    onChange={e => setTplSettings(p => ({ ...p, start_city: e.target.value }))}>
                    <option value="">Select city…</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                {/* End City */}
                <div>
                  <label className={lbl}>End City</label>
                  <select className={sel} style={inpSt}
                    value={tplSettings.end_city}
                    onChange={e => setTplSettings(p => ({ ...p, end_city: e.target.value }))}>
                    <option value="">Select city…</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                {/* State */}
                <div className="sm:col-span-2">
                  <label className={lbl}>State / Region <span className="text-red-500">*</span></label>
                  <select className={sel} style={inpSt}
                    value={tplSettings.state_id}
                    onChange={e => setTplSettings(p => ({ ...p, state_id: e.target.value, destination_ids: [] }))}>
                    <option value="">Select state…</option>
                    {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {/* Destinations */}
                {tplSettings.state_id && (
                  <div className="sm:col-span-2">
                    <label className={lbl}>Destinations <span className="text-[#94A3B8] font-normal normal-case text-[10px]">(select all that apply)</span></label>
                    <div className="flex flex-wrap gap-2">
                      {dests.filter(d => d.state_id === tplSettings.state_id).map(d => {
                        const active = tplSettings.destination_ids.includes(d.id);
                        return (
                          <button key={d.id} type="button"
                            onClick={() => setTplSettings(p => ({
                              ...p,
                              destination_ids: active
                                ? p.destination_ids.filter(x => x !== d.id)
                                : [...p.destination_ids, d.id],
                            }))}
                            className="h-8 px-3 rounded-lg text-xs font-semibold transition-colors"
                            style={active
                              ? { backgroundColor: T, color: 'white', border: `1px solid ${T}` }
                              : { backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                            {d.name}
                          </button>
                        );
                      })}
                      {dests.filter(d => d.state_id === tplSettings.state_id).length === 0 && (
                        <p className="text-xs text-[#94A3B8]">No destinations for this state</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-5 text-xs text-[#94A3B8]">
                Click <strong>Save Draft</strong> at the top to apply these changes.
              </p>
            </div>
          )}

          {/* ═══ HERO ═══ */}
          {activeSection === 'hero' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Hero Section" desc="The full-width banner customers see first." />
              <div className="grid gap-4">
                <div>
                  <ImageUploader
                    label="Hero Image (Primary)"
                    folder="templates/hero"
                    value={cms.hero_tags[0] ?? null}
                    onChange={url => {
                      updCms('hero_tags', [url ?? '', ...cms.hero_tags.slice(1)]);
                      // Keep hero_images in sync: replace or set primary slot
                      const imgs = [...(cms.hero_images ?? [])];
                      if (url) { imgs[0] = url; } else { imgs.splice(0, 1); }
                      updCms('hero_images', imgs);
                    }}
                    placeholder="Upload hero banner image"
                    sizeHint="1200 × 630 px (landscape 16:9)"
                  />
                </div>

                {/* Hero Slideshow */}
                <div className="rounded-xl p-4" style={{ border: '1px dashed #CBD5E1', backgroundColor: '#F8FAFC' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className={lbl} style={{ marginBottom: 2 }}>Hero Slideshow Images</p>
                      <p className="text-[11px] text-[#94A3B8]">Add extra slides — they auto-cycle every 5 s in the itinerary. Leave empty for a single static image.</p>
                    </div>
                    <button
                      onClick={() => updCms('hero_images', [...(cms.hero_images ?? []), ''])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 flex-shrink-0"
                      style={{ backgroundColor: T }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Slide
                    </button>
                  </div>
                  {(cms.hero_images ?? []).length === 0 ? (
                    <p className="text-xs text-[#94A3B8] text-center py-3">No slides yet. Click "Add Slide" to build a carousel.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {(cms.hero_images ?? []).map((url, si) => (
                        <div key={si} className="flex items-start gap-2">
                          <div className="flex-1">
                            <ImageUploader
                              label={si === 0 ? 'Slide 1 (Primary)' : `Slide ${si + 1}`}
                              folder="templates/hero"
                              value={url || null}
                              onChange={imgUrl => {
                                const imgs = [...(cms.hero_images ?? [])];
                                imgs[si] = imgUrl ?? '';
                                updCms('hero_images', imgs);
                                if (si === 0) updCms('hero_tags', [imgUrl ?? '', ...cms.hero_tags.slice(1)]);
                              }}
                              placeholder={`Upload slide ${si + 1}`}
                              sizeHint="1200 × 630 px"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const imgs = (cms.hero_images ?? []).filter((_, j) => j !== si);
                              updCms('hero_images', imgs);
                              if (si === 0) updCms('hero_tags', [imgs[0] ?? '', ...cms.hero_tags.slice(1)]);
                            }}
                            className="mt-6 p-1.5 rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
              <SectionHeader title="Destination Cards" desc="One card per destination shown in the gallery grid. Toggle eye icon to hide a card from the itinerary." />
              <div className="flex flex-col gap-4">
                {/* State card — always first in the gallery */}
                {(() => {
                  const stateHidden = !!cms.state_gallery_hidden;
                  return (
                    <div className="rounded-xl overflow-hidden transition-all" style={{
                      border: `1px solid ${stateHidden ? '#E2E8F0' : '#C7D2FE'}`,
                      background: stateHidden ? '#F8FAFC' : '#F5F3FF',
                      opacity: stateHidden ? 0.55 : 1,
                    }}>
                      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                        <input
                          className="flex-1 text-sm font-semibold bg-transparent focus:outline-none rounded px-1 -ml-1 transition-colors"
                          style={{ color: stateHidden ? '#94A3B8' : '#4338CA' }}
                          value={cms.state_gallery_custom_name ?? tpl?.state?.name ?? ''}
                          placeholder={tpl?.state?.name ?? 'State name…'}
                          onChange={e => updCms('state_gallery_custom_name', e.target.value || null)}
                          onFocus={e => (e.currentTarget.style.backgroundColor = '#EEF2FF')}
                          onBlur={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        />
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: stateHidden ? '#F1F5F9' : '#EEF2FF', color: stateHidden ? '#94A3B8' : '#6366F1' }}>Gallery Cover Card</span>
                        <button
                          type="button"
                          onClick={() => updCms('state_gallery_hidden', !stateHidden)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all flex-shrink-0"
                          style={{
                            borderColor: stateHidden ? '#E2E8F0' : T,
                            backgroundColor: stateHidden ? '#F1F5F9' : `${T}12`,
                            color: stateHidden ? '#94A3B8' : T,
                          }}
                        >
                          {stateHidden ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          )}
                          {stateHidden ? 'Hidden' : 'Visible'}
                        </button>
                      </div>
                      <div className="px-4 pb-4" style={{ filter: stateHidden ? 'grayscale(0.4)' : 'none' }}>
                        <ImageUploader
                          label="State Gallery Photo"
                          folder="templates/destinations"
                          value={cms.state_gallery_image || null}
                          onChange={url => updCms('state_gallery_image', url ?? '')}
                          placeholder="Upload photo for state gallery card"
                          sizeHint="800 × 600 px (4:3)"
                        />
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  // filtered list of cards (only those matching selected destinations)
                  const filteredCards = cms.destination_cards.filter(dc => tplSettings.destination_ids.includes(dc.destination_id));
                  return filteredCards.map((dc) => {
                    const dest = dests.find(d => d.id === dc.destination_id);
                    const i = cms.destination_cards.indexOf(dc);
                    // index within the filtered list (for drag tracking)
                    const fi = filteredCards.indexOf(dc);
                    const isHidden = !!dc.hidden;
                    const isDragging = destDragIdx === fi;
                    const isDragTarget = destDragOver === fi && destDragIdx !== fi;

                    return (
                      <div
                        key={dc.destination_id}
                        draggable
                        onDragStart={() => setDestDragIdx(fi)}
                        onDragEnd={() => { setDestDragIdx(null); setDestDragOver(null); }}
                        onDragOver={e => { e.preventDefault(); setDestDragOver(fi); }}
                        onDrop={() => {
                          if (destDragIdx === null || destDragIdx === fi) return;
                          // reorder inside cms.destination_cards
                          const fromId = filteredCards[destDragIdx].destination_id;
                          const toId   = filteredCards[fi].destination_id;
                          const fromFull = cms.destination_cards.findIndex(x => x.destination_id === fromId);
                          const toFull   = cms.destination_cards.findIndex(x => x.destination_id === toId);
                          const reordered = [...cms.destination_cards];
                          const [moved] = reordered.splice(fromFull, 1);
                          reordered.splice(toFull, 0, moved);
                          updCms('destination_cards', reordered);
                          setDestDragIdx(null);
                          setDestDragOver(null);
                        }}
                        className="rounded-xl overflow-hidden transition-all"
                        style={{
                          border: `1px solid ${isDragTarget ? T : '#E2E8F0'}`,
                          opacity: isDragging ? 0.4 : isHidden ? 0.55 : 1,
                          background: isDragTarget ? `${T}08` : isHidden ? '#F8FAFC' : '#fff',
                          cursor: 'grab',
                          transform: isDragTarget ? 'scale(1.01)' : 'none',
                          boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
                        }}
                      >
                        {/* Card header: drag handle + name (editable) + eye toggle + delete */}
                        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                          {/* Drag handle */}
                          <div className="flex-shrink-0 cursor-grab text-[#CBD5E1] hover:text-[#94A3B8]" title="Drag to reorder">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/>
                              <circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>
                              <circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/>
                            </svg>
                          </div>
                          <input
                            className="flex-1 text-sm font-semibold bg-transparent focus:outline-none rounded px-1 -ml-1 transition-colors"
                            style={{ color: isHidden ? '#94A3B8' : '#0F172A' }}
                            value={dc.custom_name ?? dest?.name ?? ''}
                            placeholder={dest?.name ?? 'Card name…'}
                            onChange={e => { const c = [...cms.destination_cards]; c[i] = { ...c[i], custom_name: e.target.value || null }; updCms('destination_cards', c); }}
                            onFocus={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                            onBlur={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          />
                          <button
                            type="button"
                            onClick={() => updCms('destination_cards', cms.destination_cards.filter((_, idx) => idx !== i))}
                            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors hover:bg-red-50"
                            style={{ color: '#CBD5E1' }}
                            title="Remove card"
                            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => { const c = [...cms.destination_cards]; c[i] = { ...c[i], hidden: !isHidden }; updCms('destination_cards', c); }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all flex-shrink-0"
                            style={{
                              borderColor: isHidden ? '#E2E8F0' : T,
                              backgroundColor: isHidden ? '#F1F5F9' : `${T}12`,
                              color: isHidden ? '#94A3B8' : T,
                            }}
                          >
                            {isHidden ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            )}
                            {isHidden ? 'Hidden' : 'Visible'}
                          </button>
                        </div>
                        <div className="px-4 pb-4">
                          <div className="grid grid-cols-2 gap-3" style={{ filter: isHidden ? 'grayscale(0.4)' : 'none' }}>
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
                    </div>
                  );
                }); })()}
                {/* ── Add destination card ── */}
                <div className="pt-2 border-t" style={{ borderColor: '#F1F5F9' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Add Destination Card</p>
                  {/* Quick-add chips: unused destinations from template */}
                  {(() => {
                    const usedIds = new Set(cms.destination_cards.map(dc => dc.destination_id));
                    const unused  = dests.filter(d => !usedIds.has(d.id));
                    return unused.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {unused.map(d => (
                          <button key={d.id} type="button"
                            onClick={() => updCms('destination_cards', [...cms.destination_cards, { destination_id: d.id, custom_name: null, description: '', image_url: '' }])}
                            className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80"
                            style={{ borderColor: `${T}40`, color: T, backgroundColor: `${T}08` }}>
                            + {d.name}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  {/* Custom card: type any name */}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                      style={{ borderColor: '#E2E8F0' }}
                      value={newCardName}
                      onChange={e => setNewCardName(e.target.value)}
                      placeholder="Custom card name (e.g. Coorg Waterfalls)…"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newCardName.trim()) {
                          updCms('destination_cards', [...cms.destination_cards, { destination_id: `custom_${Date.now()}`, custom_name: newCardName.trim(), description: '', image_url: '' }]);
                          setNewCardName('');
                        }
                      }}
                    />
                    <button type="button"
                      disabled={!newCardName.trim()}
                      onClick={() => { updCms('destination_cards', [...cms.destination_cards, { destination_id: `custom_${Date.now()}`, custom_name: newCardName.trim(), description: '', image_url: '' }]); setNewCardName(''); }}
                      className="h-9 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 flex-shrink-0"
                      style={{ backgroundColor: T }}>
                      + Add
                    </button>
                  </div>
                  {destList.length > 0 && cms.destination_cards.length === 0 && (
                    <button type="button" onClick={() => updCms('destination_cards', destList.map(did => ({ destination_id: did, custom_name: null, description: '', image_url: '' })))}
                      className="mt-2 h-8 px-3 rounded-lg text-xs font-semibold border hover:bg-[#F8FAFC] transition-colors"
                      style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
                      Auto-generate from template destinations
                    </button>
                  )}
                </div>
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
              {cms.package_options.map((opt, oi) => {
                const totalPkgNights = Number(tplSettings.duration_nights) || 0;
                const allocatedNights = destList.reduce((sum, did) => {
                  const tier = tiersForOption(opt.tier_name).find(t => t.destination_id === did);
                  return sum + (tier?.nights ?? 1);
                }, 0);
                const nightsOk = allocatedNights === totalPkgNights;
                const nightsOver = allocatedNights > totalPkgNights;
                return (
                <div key={oi} className="bg-white rounded-2xl p-6" style={card}>
                  {/* Header + allocation badge */}
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-[#0F172A]">{opt.tier_name} — Hotel Selections</p>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{
                      backgroundColor: nightsOk ? '#DCFCE7' : nightsOver ? '#FEF2F2' : '#FFF7ED',
                      color: nightsOk ? '#15803D' : nightsOver ? '#DC2626' : '#C2410C',
                    }}>
                      {allocatedNights} / {totalPkgNights} nights allocated
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] mb-4">
                    Set nights per destination — guests can stay all nights in one place or split across locations.
                  </p>

                  {destList.map(did => {
                    const dest = dests.find(d => d.id === did);
                    const tier = tiersForOption(opt.tier_name).find(t => t.destination_id === did) ?? { tier_name: opt.tier_name, destination_id: did, default_hotel_id: null, default_room_category_id: null, default_meal_plan_id: null, nights: 1, sort_order: 0 };
                    const destHotels = hotelsForDest(did);
                    const rooms = roomsForHotel(tier.default_hotel_id ?? '');
                    const skipping = tier.nights === 0;
                    return (
                      <div key={did} className="mb-4 pb-4 group/dest"
                        style={{ borderBottom: '1px solid #F1F5F9' }}
                        draggable
                        onDragStart={() => handleDestDragStart(did)}
                        onDragOver={e => handleDestDragOver(e, did)}
                        onDrop={handleDestDrop}
                        onDragEnd={() => { dragSrcId.current = null; dragOverId.current = null; }}>
                        {/* Destination label + drag handle + nights stepper */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <GripVertical
                              className="w-3.5 h-3.5 cursor-grab active:cursor-grabbing opacity-0 group-hover/dest:opacity-100 transition-opacity flex-shrink-0"
                              style={{ color: '#CBD5E1' }} />
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: dest ? (skipping ? '#CBD5E1' : '#94A3B8') : '#FDA4AF' }}>
                              {dest?.name ?? <span className="normal-case font-medium text-red-400">Unknown destination · <button onClick={() => setTplSettings(p => ({ ...p, destination_ids: p.destination_ids.filter(x => x !== did) }))} className="underline hover:text-red-600">Remove</button></span>}
                              {dest && skipping && <span className="ml-2 normal-case font-medium text-[#CBD5E1]">· Not staying</span>}
                            </p>
                          </div>
                          {/* Nights stepper */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-semibold text-[#94A3B8] mr-1">Nights</span>
                            <button
                              onClick={() => updTier(opt.tier_name, did, { nights: Math.max(0, tier.nights - 1) })}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                              style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>−</button>
                            <span className="w-6 text-center text-sm font-bold" style={{ color: skipping ? '#CBD5E1' : '#0F172A' }}>{tier.nights}</span>
                            <button
                              onClick={() => updTier(opt.tier_name, did, { nights: tier.nights + 1 })}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                              style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>+</button>
                            {/* Quick: all nights here */}
                            {!skipping && totalPkgNights > 0 && tier.nights !== totalPkgNights && (
                              <button
                                onClick={() => {
                                  // Set this dest to all nights, others to 0
                                  destList.forEach(d => updTier(opt.tier_name, d, { nights: d === did ? totalPkgNights : 0 }));
                                }}
                                className="ml-1 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors"
                                style={{ backgroundColor: `${T}15`, color: T }}
                                title="Put all nights here">All here</button>
                            )}
                          </div>
                        </div>

                        {/* Hotel / Room / Meal Plan — collapsed when 0 nights */}
                        {skipping ? (
                          <div className="flex items-center gap-2 py-2 px-3 rounded-xl" style={{ backgroundColor: '#F8FAFC' }}>
                            <span className="text-xs text-[#CBD5E1]">No hotel needed — 0 nights at this destination.</span>
                            <button onClick={() => updTier(opt.tier_name, did, { nights: 1 })}
                              className="text-[11px] font-semibold underline ml-auto" style={{ color: T }}>Add a night</button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className={lbl}>Hotel</label>
                              <select className={sel} style={inpSt} value={tier.default_hotel_id ?? ''}
                                onChange={e => {
                                  const newHotelId = e.target.value || null;
                                  if (newHotelId) fetchHotelRates(newHotelId);
                                  updTier(opt.tier_name, did, { default_hotel_id: newHotelId, default_room_category_id: null, default_meal_plan_id: null });
                                }}>
                                <option value="">Select…</option>
                                {destHotels.map(h => <option key={h.id} value={h.id}>{h.hotel_name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={lbl}>Room</label>
                              <select className={sel} style={inpSt} value={tier.default_room_category_id ?? ''}
                                onChange={e => updTier(opt.tier_name, did, { default_room_category_id: e.target.value || null, default_meal_plan_id: null })}
                                disabled={!tier.default_hotel_id}>
                                <option value="">Select…</option>
                                {rooms.map(r => <option key={r.id} value={r.id}>{r.room_category_name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={lbl}>
                                Meal Plan
                                {(() => { const cr = hotelRatesCache[tier.default_hotel_id ?? ''] ?? []; const ai = tier.default_room_category_id ? new Set(cr.filter(r => r.room_category_id === tier.default_room_category_id).map(r => r.meal_plan_id)) : null; return ai && ai.size === 0 && tier.default_room_category_id ? <span className="text-[10px] text-red-400 ml-1 normal-case">No rates</span> : null; })()}
                              </label>
                              {(() => {
                                const cachedRates = hotelRatesCache[tier.default_hotel_id ?? ''] ?? [];
                                const availMpIds = tier.default_room_category_id
                                  ? new Set(cachedRates.filter(r => r.room_category_id === tier.default_room_category_id).map(r => r.meal_plan_id))
                                  : null;
                                const filteredMealPlans = availMpIds ? mealPlans.filter(m => availMpIds.has(m.id)) : mealPlans;
                                return (
                                  <select className={sel} style={inpSt} value={tier.default_meal_plan_id ?? ''}
                                    onChange={e => updTier(opt.tier_name, did, { default_meal_plan_id: e.target.value || null })}
                                    disabled={!tier.default_hotel_id}>
                                    <option value="">Select…</option>
                                    {filteredMealPlans.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                                  </select>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </div>
          )}

          {/* ═══ DAY ITINERARY ═══ */}
          {activeSection === 'days' && (
            <div className="flex flex-col gap-3">
              <div className="bg-white rounded-2xl p-5" style={card}>
                <SectionHeader title="Day-wise Itinerary" desc={`${days.length} day${days.length !== 1 ? 's' : ''} · Fill in titles, descriptions and images.`} />
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
                            <RichTextEditor
                              value={day.description_override}
                              onChange={html => updDay(i, { description_override: html || null })}
                              placeholder="Describe the day's activities and experiences…"
                              minHeight={130}
                            />
                          </div>
                          <div className="col-span-2">
                            <ImageUploader
                              label="Day Image (Primary)"
                              folder="templates/days"
                              value={day.image_override ?? null}
                              onChange={url => updDay(i, { image_override: url })}
                              placeholder="Upload day image"
                              sizeHint="1200 × 800 px (3:2) — shown full-width in itinerary"
                            />
                          </div>
                          {/* Day Gallery Slideshow */}
                          <div className="col-span-2 rounded-xl p-3" style={{ border: '1px dashed #CBD5E1', backgroundColor: '#F8FAFC' }}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className={lbl} style={{ marginBottom: 1 }}>Day Slideshow Photos</p>
                                <p className="text-[11px] text-[#94A3B8]">Extra images shown as a swipeable gallery on this day card.</p>
                              </div>
                              <button
                                onClick={() => updDay(i, { gallery_images: [...(day.gallery_images ?? []), ''] })}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90 flex-shrink-0"
                                style={{ backgroundColor: T }}
                              >
                                <Plus className="w-3 h-3" /> Add
                              </button>
                            </div>
                            {(day.gallery_images ?? []).length === 0 ? (
                              <p className="text-xs text-[#94A3B8] text-center py-2">No extra photos yet.</p>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {(day.gallery_images ?? []).map((gUrl, gi) => (
                                  <div key={gi} className="flex items-start gap-2">
                                    <div className="flex-1">
                                      <ImageUploader
                                        label={`Photo ${gi + 1}`}
                                        folder="templates/days"
                                        value={gUrl || null}
                                        onChange={imgUrl => {
                                          const g = [...(day.gallery_images ?? [])];
                                          g[gi] = imgUrl ?? '';
                                          updDay(i, { gallery_images: g });
                                        }}
                                        placeholder={`Upload photo ${gi + 1}`}
                                        sizeHint="1200 × 800 px"
                                      />
                                    </div>
                                    <button
                                      onClick={() => updDay(i, { gallery_images: (day.gallery_images ?? []).filter((_, j) => j !== gi) })}
                                      className="mt-6 p-1.5 rounded-lg text-[#94A3B8] hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
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
                    {/* Icon picker */}
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] mr-1">Icon</span>
                      {ICON_OPTS.map(opt => (
                        <button key={opt.key} type="button"
                          onClick={() => {
                            const w = normaliseWhy(cms.why_choose);
                            w[i] = { ...w[i], icon: opt.key };
                            updCms('why_choose', w);
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm border transition-all"
                          style={{
                            borderColor: item.icon === opt.key ? T : '#E2E8F0',
                            backgroundColor: item.icon === opt.key ? `${T}18` : 'white',
                            color: item.icon === opt.key ? T : '#64748B',
                            fontWeight: item.icon === opt.key ? 700 : 400,
                          }}
                          title={opt.key}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
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

          {/* ═══ INCLUSIONS / EXCLUSIONS ═══ */}
          {activeSection === 'incl_excl' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Inclusions & Exclusions" desc="List what is included and excluded in this package." />
              <div className="grid grid-cols-2 gap-6">
                {/* Inclusions */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#15803D' }}>✓ Inclusions</p>
                  <div className="flex flex-col gap-2">
                    {(cms.inclusions ?? []).map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-green-500 flex-shrink-0">•</span>
                        <input
                          className="flex-1 h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                          style={{ borderColor: '#E2E8F0' }}
                          value={item}
                          placeholder="e.g. Accommodation on twin sharing"
                          onChange={e => {
                            const arr = [...(cms.inclusions ?? [])];
                            arr[i] = e.target.value;
                            updCms('inclusions', arr);
                          }} />
                        <button onClick={() => updCms('inclusions', (cms.inclusions ?? []).filter((_, j) => j !== i))}
                          className="text-[#94A3B8] hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => updCms('inclusions', [...(cms.inclusions ?? []), ''])}
                    className="flex items-center gap-2 text-sm font-semibold mt-3" style={{ color: '#15803D' }}>
                    <Plus className="w-4 h-4" /> Add Inclusion
                  </button>
                </div>
                {/* Exclusions */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#DC2626' }}>✕ Exclusions</p>
                  <div className="flex flex-col gap-2">
                    {(cms.exclusions ?? []).map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-red-500 flex-shrink-0">•</span>
                        <input
                          className="flex-1 h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                          style={{ borderColor: '#E2E8F0' }}
                          value={item}
                          placeholder="e.g. Airfare / train tickets"
                          onChange={e => {
                            const arr = [...(cms.exclusions ?? [])];
                            arr[i] = e.target.value;
                            updCms('exclusions', arr);
                          }} />
                        <button onClick={() => updCms('exclusions', (cms.exclusions ?? []).filter((_, j) => j !== i))}
                          className="text-[#94A3B8] hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => updCms('exclusions', [...(cms.exclusions ?? []), ''])}
                    className="flex items-center gap-2 text-sm font-semibold mt-3" style={{ color: '#DC2626' }}>
                    <Plus className="w-4 h-4" /> Add Exclusion
                  </button>
                </div>
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
                            <p className="text-xs text-[#94A3B8] mt-0.5 line-clamp-1">{p.content.replace(/<[^>]+>/g, ' ').slice(0, 80)}…</p>
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
                      <p className="text-xs text-[#94A3B8] mt-0.5 line-clamp-2">{p.content.replace(/<[^>]+>/g, ' ').slice(0, 100)}…</p>
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
