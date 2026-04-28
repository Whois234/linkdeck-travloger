'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import {
  ChevronDown, ChevronRight, Plus, Trash2, Check,
  Save, Star, Image as ImgIcon, FileText, LayoutList,
  MapPin, Shield, HelpCircle, BookOpen, Calendar,
  Users, X,
} from 'lucide-react';

/* ── Style tokens ── */
const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const ta    = 'w-full px-3 py-2 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white resize-none';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor: '#E2E8F0' };
const T     = '#134956';
const card  = { border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

/* ── Types ── */
interface Dest    { id: string; name: string }
interface DayPlan { id: string; title: string; destination_id: string; description?: string | null }
interface Policy  { id: string; title: string; policy_type: string; content: string }
interface WhyItem { title: string; description: string }

function normaliseWhy(arr: (string | WhyItem)[]): WhyItem[] {
  return arr.map(item =>
    typeof item === 'string'
      ? { title: item, description: '' }
      : item
  );
}

interface CmsOption {
  tier_name: string;
  display_order: number;
  is_most_popular: boolean;
  inclusions: string[];
  adult_price: number;
  child_price: number;
}
interface CmsData {
  min_pax: number;
  max_pax: number;
  hero_heading: string;
  hero_subheading: string;
  hero_tags: string[];
  destination_cards: Array<{ destination_id: string; custom_name: string | null; description: string; image_url: string }>;
  package_options: CmsOption[];
  why_choose: (string | WhyItem)[];
  faqs_enabled: boolean;
  custom_faqs: Array<{ question: string; answer: string }>;
}
interface GDay {
  id?: string; day_number: number; destination_id: string; title: string;
  description_override: string | null; image_override: string | null;
  day_plan_id: string | null; meals: Record<string, boolean> | null; sort_order: number;
}
interface Batch {
  id?: string;
  batch_name: string;
  start_date: string;
  end_date: string;
  total_seats: number;
  available_seats: number;
  adult_price: number;
  child_5_12_price: number;
  child_below_5_price: number;
  single_supplement: number | null;
  gst_percent: number;
  booking_status: string;
  assigned_agent_id: string | null;
}
interface Template {
  id: string; group_template_name: string; duration_days: number; duration_nights: number;
  theme: string | null; start_city: string | null; end_city: string | null; hero_image: string | null;
  destinations: string[]; state_id: string; state: { id: string; name: string };
  cms_data: CmsData | null;
  group_template_days: GDay[];
  group_batches: Batch[];
}

const DEFAULT_CMS: CmsData = {
  min_pax: 10, max_pax: 25,
  hero_heading: '', hero_subheading: '',
  hero_tags: [], destination_cards: [],
  package_options: [
    { tier_name: 'Standard', display_order: 1, is_most_popular: false, inclusions: [], adult_price: 0, child_price: 0 },
    { tier_name: 'Deluxe',   display_order: 2, is_most_popular: true,  inclusions: [], adult_price: 0, child_price: 0 },
  ],
  why_choose: [
    { title: 'Ranked Professionals', description: 'Our certified travel experts craft every detail of your journey.' },
    { title: 'Best Prices Guaranteed', description: 'We match or beat any comparable package price, no questions asked.' },
    { title: 'Top-tier Standards', description: 'Only hand-picked hotels, guides, and transport providers.' },
    { title: '24×7 Monitoring', description: 'Round-the-clock support for every traveller on every tour.' },
    { title: 'On-ground Support', description: 'Dedicated local contacts available throughout your trip.' },
  ],
  faqs_enabled: false, custom_faqs: [],
};

const EMPTY_BATCH: Batch = {
  batch_name: '', start_date: '', end_date: '',
  total_seats: 20, available_seats: 20,
  adult_price: 0, child_5_12_price: 0, child_below_5_price: 0,
  single_supplement: null, gst_percent: 5,
  booking_status: 'OPEN', assigned_agent_id: null,
};

const SECTIONS = [
  { id: 'hero',    label: 'Hero',              icon: ImgIcon    },
  { id: 'dests',   label: 'Destination Cards', icon: MapPin     },
  { id: 'options', label: 'Package Options',   icon: LayoutList },
  { id: 'days',    label: 'Day Itinerary',     icon: FileText   },
  { id: 'batches', label: 'Batches',           icon: Calendar   },
  { id: 'why',     label: 'Why Choose',        icon: Star       },
  { id: 'policy',  label: 'Policies',          icon: Shield     },
  { id: 'faq',     label: 'FAQs',              icon: HelpCircle },
  { id: 'terms',   label: 'Terms',             icon: BookOpen   },
];

const BOOKING_STATUSES = ['OPEN', 'FILLING_FAST', 'ALMOST_FULL', 'FULL', 'CLOSED', 'CANCELLED'];

/* ════════════════════════════════════════════════════ */
export default function GroupTemplateEditPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [tpl,      setTpl]      = useState<Template | null>(null);
  const [cms,      setCms]      = useState<CmsData>(DEFAULT_CMS);
  const [days,     setDays]     = useState<GDay[]>([]);
  const [batches,  setBatches]  = useState<Batch[]>([]);
  const [dests,    setDests]    = useState<Dest[]>([]);
  const [dayPlans, setDayPlans] = useState<DayPlan[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [expandedDays, setExpandedDays]   = useState<Set<number>>(new Set([1]));
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);

  /* Batch modal state */
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingBatch, setEditingBatch]     = useState<Batch & { _idx?: number } | null>(null);
  const [batchSaving, setBatchSaving]       = useState(false);
  const [batchErr, setBatchErr]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [tr, dr, dpr, pr] = await Promise.all([
      fetch(`/api/v1/group-templates/${id}`),
      fetch('/api/v1/destinations'),
      fetch('/api/v1/day-plans'),
      fetch('/api/v1/policies'),
    ]);
    const [td, dd, dpd, pd] = await Promise.all([tr.json(), dr.json(), dpr.json(), pr.json()]);
    if (td.success) {
      const t: Template = td.data;
      setTpl(t);
      const c: CmsData = (t.cms_data as CmsData) ?? { ...DEFAULT_CMS };
      if (c.destination_cards.length === 0 && t.destinations?.length) {
        c.destination_cards = (t.destinations as string[]).map((did: string) => ({
          destination_id: did, custom_name: null, description: '', image_url: '',
        }));
      }
      setCms(c);
      setDays(t.group_template_days.map(d => ({
        ...d,
        description_override: d.description_override ?? null,
        image_override: d.image_override ?? null,
        day_plan_id: d.day_plan_id ?? null,
        meals: (d.meals as Record<string,boolean> | null) ?? null,
      })));
      setBatches(t.group_batches.map(b => ({
        ...b,
        start_date: b.start_date ? new Date(b.start_date as unknown as string).toISOString().slice(0, 10) : '',
        end_date:   b.end_date   ? new Date(b.end_date   as unknown as string).toISOString().slice(0, 10) : '',
        single_supplement: b.single_supplement ?? null,
        assigned_agent_id: b.assigned_agent_id ?? null,
      })));
      setSelectedPolicies((t as unknown as { default_policy_ids?: string[] }).default_policy_ids ?? []);
    }
    if (dd.success) setDests(dd.data);
    if (dpd.success) setDayPlans(dpd.data);
    if (pd.success) setPolicies(pd.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* Auto-scaffold days */
  useEffect(() => {
    if (!tpl || days.length > 0) return;
    const destList = (tpl.destinations ?? []) as string[];
    const newDays: GDay[] = Array.from({ length: tpl.duration_nights + 1 }, (_, i) => ({
      day_number: i + 1,
      destination_id: destList[0] ?? '',
      title: `Day ${i + 1}`,
      description_override: null, image_override: null,
      day_plan_id: null, meals: null, sort_order: i + 1,
    }));
    setDays(newDays);
  }, [tpl, days.length]);

  /* ── Save CMS + Days ── */
  const save = useCallback(async (publish = false) => {
    setSaving(true);
    try {
      await Promise.all([
        fetch(`/api/v1/group-templates/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cms_data: cms,
            hero_image: cms.hero_tags[0] ?? null,
            default_policy_ids: selectedPolicies,
            status: publish ? true : undefined,
          }),
        }),
        fetch(`/api/v1/group-templates/${id}/days`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(days),
        }),
      ]);
      if (publish) {
        router.push('/admin/group-templates?published=1');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }, [id, cms, days, selectedPolicies, router]);

  /* ── Batch save/delete ── */
  async function saveBatch() {
    if (!editingBatch) return;
    setBatchSaving(true); setBatchErr('');
    const { _idx, id: batchId, ...payload } = editingBatch as Batch & { _idx?: number };
    try {
      if (batchId) {
        // Update existing
        const res = await fetch(`/api/v1/group-templates/${id}/batches/${batchId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload }),
        });
        if (!res.ok) { const d = await res.json(); setBatchErr(d.error ?? 'Failed'); return; }
        setBatches(p => p.map((b, i) => i === _idx ? { ...editingBatch } : b));
      } else {
        // Create new
        const res = await fetch(`/api/v1/group-templates/${id}/batches`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            total_seats: Number(payload.total_seats),
            available_seats: Number(payload.available_seats),
            adult_price: Number(payload.adult_price),
            child_5_12_price: Number(payload.child_5_12_price),
            child_below_5_price: Number(payload.child_below_5_price),
            gst_percent: Number(payload.gst_percent),
            single_supplement: payload.single_supplement ? Number(payload.single_supplement) : null,
          }),
        });
        if (!res.ok) { const d = await res.json(); setBatchErr(d.error ?? 'Failed'); return; }
        const d = await res.json();
        setBatches(p => [...p, { ...d.data, start_date: d.data.start_date?.slice(0,10) ?? '', end_date: d.data.end_date?.slice(0,10) ?? '' }]);
      }
      setShowBatchModal(false);
    } finally {
      setBatchSaving(false);
    }
  }

  async function deleteBatch(batchId: string, idx: number) {
    if (!confirm('Deactivate this batch?')) return;
    await fetch(`/api/v1/group-templates/${id}/batches/${batchId}`, { method: 'DELETE' });
    setBatches(p => p.filter((_, i) => i !== idx));
  }

  /* ── Helpers ── */
  function updCms<K extends keyof CmsData>(key: K, val: CmsData[K]) {
    setCms(p => ({ ...p, [key]: val }));
  }
  function toggleDay(n: number) {
    setExpandedDays(prev => { const s = new Set(prev); if (s.has(n)) s.delete(n); else s.add(n); return s; });
  }
  function updDay(idx: number, patch: Partial<GDay>) {
    setDays(p => p.map((d, i) => i === idx ? { ...d, ...patch } : d));
  }
  function dayPlansForDest(destId: string) {
    return dayPlans.filter(dp => dp.destination_id === destId);
  }
  function togglePolicy(pid: string) {
    setSelectedPolicies(p => p.includes(pid) ? p.filter(x => x !== pid) : [...p, pid]);
  }
  function openNewBatch() {
    setEditingBatch({ ...EMPTY_BATCH });
    setBatchErr(''); setShowBatchModal(true);
  }
  function openEditBatch(b: Batch, idx: number) {
    setEditingBatch({ ...b, _idx: idx } as Batch & { _idx: number });
    setBatchErr(''); setShowBatchModal(true);
  }
  function updBatch<K extends keyof Batch>(key: K, val: Batch[K]) {
    setEditingBatch(p => p ? { ...p, [key]: val } : p);
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    OPEN:         { bg: '#DCFCE7', color: '#166534' },
    FILLING_FAST: { bg: '#FEF3C7', color: '#92400E' },
    ALMOST_FULL:  { bg: '#FFEDD5', color: '#9A3412' },
    FULL:         { bg: '#FEE2E2', color: '#991B1B' },
    CLOSED:       { bg: '#F1F5F9', color: '#475569' },
    CANCELLED:    { bg: '#F1F5F9', color: '#94A3B8' },
  };

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
        title={tpl.group_template_name}
        subtitle={`${tpl.duration_nights}N/${tpl.duration_days}D · ${tpl.state.name}${tpl.theme ? ` · ${tpl.theme}` : ''} · Group Tour`}
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Group Templates', href: '/admin/group-templates' }, { label: 'Edit' }]}
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
        {/* ── SIDEBAR ── */}
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
                  {s.id === 'batches' && batches.length > 0 && (
                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: T, color: 'white' }}>{batches.length}</span>
                  )}
                  {active && s.id !== 'batches' && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 min-w-0">

          {/* ═══ HERO ═══ */}
          {activeSection === 'hero' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Hero Section" desc="The full-width banner customers see first." />
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Min Pax</label>
                    <input type="number" min="1" className={inp} style={inpSt} value={cms.min_pax}
                      onChange={e => updCms('min_pax', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={lbl}>Max Pax</label>
                    <input type="number" min="1" className={inp} style={inpSt} value={cms.max_pax}
                      onChange={e => updCms('max_pax', Number(e.target.value))} />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Hero Image URL</label>
                  <input className={inp} style={inpSt} value={cms.hero_tags[0] ?? ''} placeholder="https://…"
                    onChange={e => updCms('hero_tags', e.target.value ? [e.target.value, ...cms.hero_tags.slice(1)] : cms.hero_tags.slice(1))} />
                  {cms.hero_tags[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cms.hero_tags[0]} alt="Hero preview" className="mt-2 w-full h-40 object-cover rounded-xl" />
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
                        <button onClick={() => { const t = [...cms.hero_tags]; t.splice(i + 1, 1); updCms('hero_tags', t); }} className="ml-1 text-[#94A3B8] hover:text-red-500">×</button>
                      </span>
                    ))}
                    <TagInput onAdd={t => updCms('hero_tags', [...cms.hero_tags, t])} />
                  </div>
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
                          <label className={lbl}>Photo URL</label>
                          <input className={inp} style={inpSt} value={dc.image_url}
                            onChange={e => { const c = [...cms.destination_cards]; c[i] = { ...c[i], image_url: e.target.value }; updCms('destination_cards', c); }}
                            placeholder="https://…" />
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
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Package Options" desc="Define 1–3 options with direct pricing. Each option can have its own adult/child price." />
              <div className="flex gap-3 mb-2 flex-wrap">
                {cms.package_options.map((opt, oi) => (
                  <div key={oi} className="flex-1 min-w-[180px] rounded-xl p-4" style={{ border: `2px solid ${opt.is_most_popular ? T : '#E2E8F0'}` }}>
                    <div className="flex items-center justify-between mb-3">
                      <input className="font-bold text-sm bg-transparent border-0 outline-none text-[#0F172A] w-full"
                        value={opt.tier_name}
                        onChange={e => { const o = [...cms.package_options]; o[oi] = { ...o[oi], tier_name: e.target.value }; updCms('package_options', o); }} />
                      {cms.package_options.length > 1 && (
                        <button onClick={() => { const o = cms.package_options.filter((_, i) => i !== oi).map((x, i) => ({ ...x, display_order: i + 1 })); updCms('package_options', o); }}
                          className="text-[#94A3B8] hover:text-red-500 ml-2 flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Most popular toggle */}
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={opt.is_most_popular}
                        onChange={() => { const o = cms.package_options.map((x, i) => ({ ...x, is_most_popular: i === oi })); updCms('package_options', o); }} />
                      <span className="text-xs text-[#64748B]">Most Popular</span>
                    </label>

                    {/* Direct pricing */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1 text-[#94A3B8]">Adult Price (₹)</label>
                        <input type="number" min="0" className="w-full h-8 px-2 rounded-lg border text-sm focus:outline-none" style={inpSt}
                          value={opt.adult_price}
                          onChange={e => { const o = [...cms.package_options]; o[oi] = { ...o[oi], adult_price: Number(e.target.value) }; updCms('package_options', o); }} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1 text-[#94A3B8]">Child Price (₹)</label>
                        <input type="number" min="0" className="w-full h-8 px-2 rounded-lg border text-sm focus:outline-none" style={inpSt}
                          value={opt.child_price}
                          onChange={e => { const o = [...cms.package_options]; o[oi] = { ...o[oi], child_price: Number(e.target.value) }; updCms('package_options', o); }} />
                      </div>
                    </div>

                    {/* Inclusions */}
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
                  <button onClick={() => updCms('package_options', [...cms.package_options, { tier_name: `Option ${cms.package_options.length + 1}`, display_order: cms.package_options.length + 1, is_most_popular: false, inclusions: [], adult_price: 0, child_price: 0 }])}
                    className="flex-shrink-0 w-12 rounded-xl flex items-center justify-center" style={{ border: '2px dashed #E2E8F0' }}>
                    <Plus className="w-5 h-5 text-[#CBD5E1]" />
                  </button>
                )}
              </div>
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
                              placeholder="Describe the day's activities…" />
                          </div>
                          <div className="col-span-2">
                            <label className={lbl}>Day Image URL</label>
                            <input className={inp} style={inpSt} value={day.image_override ?? ''}
                              onChange={e => updDay(i, { image_override: e.target.value || null })} placeholder="https://…" />
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

          {/* ═══ BATCHES ═══ */}
          {activeSection === 'batches' && (
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl p-5" style={card}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A]">Departure Batches</h2>
                    <p className="text-sm text-[#64748B] mt-0.5">Manage fixed departure dates, seats, and per-batch pricing.</p>
                  </div>
                  <button onClick={openNewBatch}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
                    <Plus className="w-4 h-4" /> Add Batch
                  </button>
                </div>
              </div>

              {batches.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-2xl" style={card}>
                  <Calendar className="w-8 h-8 mx-auto mb-3 text-[#CBD5E1]" />
                  <p className="font-semibold text-sm text-[#0F172A]">No batches yet</p>
                  <p className="text-sm mt-1 text-[#64748B] mb-4">Add your first departure batch to open bookings</p>
                  <button onClick={openNewBatch} className="h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
                    <Plus className="w-4 h-4 inline mr-1.5" />Add Batch
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {batches.map((b, idx) => {
                    const sc = statusColors[b.booking_status] ?? statusColors['CLOSED'];
                    const start = b.start_date ? new Date(b.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                    const end   = b.end_date   ? new Date(b.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                    const pctFull = b.total_seats > 0 ? Math.round((1 - b.available_seats / b.total_seats) * 100) : 0;
                    return (
                      <div key={idx} className="bg-white rounded-2xl p-5" style={card}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-sm text-[#0F172A]">{b.batch_name || `Batch ${idx + 1}`}</p>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={sc}>{b.booking_status}</span>
                            </div>
                            <p className="text-xs text-[#64748B]">{start} → {end}</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => openEditBatch(b, idx)}
                              className="h-8 px-3 rounded-lg text-xs font-semibold hover:opacity-80"
                              style={{ backgroundColor: `${T}12`, color: T }}>Edit</button>
                            {b.id && (
                              <button onClick={() => deleteBatch(b.id!, idx)}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626]">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Seats bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-[#94A3B8] mb-1">
                            <span>{b.available_seats} seats left</span>
                            <span>{pctFull}% filled</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pctFull}%`, backgroundColor: pctFull >= 90 ? '#DC2626' : pctFull >= 70 ? '#F59E0B' : '#22c55e' }} />
                          </div>
                        </div>

                        {/* Pricing row */}
                        <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                          <div>
                            <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-0.5">Adult</p>
                            <p className="text-sm font-bold text-[#0F172A]">₹{Number(b.adult_price).toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-0.5">Child (5–12)</p>
                            <p className="text-sm font-bold text-[#0F172A]">₹{Number(b.child_5_12_price).toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-0.5">Child (&lt;5)</p>
                            <p className="text-sm font-bold text-[#0F172A]">₹{Number(b.child_below_5_price).toLocaleString('en-IN')}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ WHY CHOOSE ═══ */}
          {activeSection === 'why' && (
            <div className="bg-white rounded-2xl p-6" style={card}>
              <SectionHeader title="Why Choose Travloger" desc="Pre-filled trust points shown to customers. Each can have a title and short description." />
              <div className="flex flex-col gap-3">
                {normaliseWhy(cms.why_choose).map((item, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #E2E8F0' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold mt-1" style={{ backgroundColor: T }}>{i + 1}</div>
                      <div className="flex-1 flex flex-col gap-2">
                        <input
                          className="w-full h-9 px-3 rounded-lg border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                          style={inpSt} placeholder="Title e.g. Best Prices Guaranteed"
                          value={item.title}
                          onChange={e => {
                            const w = normaliseWhy(cms.why_choose);
                            w[i] = { ...w[i], title: e.target.value };
                            updCms('why_choose', w);
                          }} />
                        <textarea
                          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white resize-none"
                          style={inpSt} rows={2} placeholder="Short description (optional)"
                          value={item.description}
                          onChange={e => {
                            const w = normaliseWhy(cms.why_choose);
                            w[i] = { ...w[i], description: e.target.value };
                            updCms('why_choose', w);
                          }} />
                      </div>
                      <button onClick={() => updCms('why_choose', normaliseWhy(cms.why_choose).filter((_, j) => j !== i))}
                        className="text-[#94A3B8] hover:text-red-500 mt-1 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
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
              <SectionHeader title="Policies" desc="Toggle which policies to include in the customer view." />
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
                  <p className="text-sm text-[#94A3B8] text-center py-8">No terms found. Add them in the Policies master.</p>
                )}
              </div>
            </div>
          )}

        </div>{/* end main content */}
      </div>{/* end flex */}

      {/* ═══ BATCH MODAL ═══ */}
      <Modal open={showBatchModal} onClose={() => setShowBatchModal(false)}
        title={editingBatch?.id ? 'Edit Batch' : 'Add Departure Batch'}
        subtitle="Set dates, seats, and pricing for this departure"
        maxWidth="max-w-xl">
        {batchErr && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{batchErr}</div>}
        {editingBatch && (
          <div className="flex flex-col gap-4">
            <div>
              <label className={lbl}>Batch Name <span className="text-red-500">*</span></label>
              <input className={inp} style={inpSt} value={editingBatch.batch_name}
                onChange={e => updBatch('batch_name', e.target.value)} placeholder="Summer Departure — Jun 2025" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Start Date <span className="text-red-500">*</span></label>
                <input type="date" className={inp} style={inpSt} value={editingBatch.start_date}
                  onChange={e => updBatch('start_date', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>End Date <span className="text-red-500">*</span></label>
                <input type="date" className={inp} style={inpSt} value={editingBatch.end_date}
                  onChange={e => updBatch('end_date', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Total Seats</label>
                <input type="number" min="1" className={inp} style={inpSt} value={editingBatch.total_seats}
                  onChange={e => updBatch('total_seats', Number(e.target.value))} />
              </div>
              <div>
                <label className={lbl}>Available Seats</label>
                <input type="number" min="0" className={inp} style={inpSt} value={editingBatch.available_seats}
                  onChange={e => updBatch('available_seats', Number(e.target.value))} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
              <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">Pricing (₹ per person)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Adult</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={editingBatch.adult_price}
                    onChange={e => updBatch('adult_price', Number(e.target.value))} />
                </div>
                <div>
                  <label className={lbl}>Child 5–12</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={editingBatch.child_5_12_price}
                    onChange={e => updBatch('child_5_12_price', Number(e.target.value))} />
                </div>
                <div>
                  <label className={lbl}>Child &lt;5</label>
                  <input type="number" min="0" className={inp} style={inpSt} value={editingBatch.child_below_5_price}
                    onChange={e => updBatch('child_below_5_price', Number(e.target.value))} />
                </div>
                <div>
                  <label className={lbl}>Single Supplement</label>
                  <input type="number" min="0" className={inp} style={inpSt}
                    value={editingBatch.single_supplement ?? ''}
                    onChange={e => updBatch('single_supplement', e.target.value ? Number(e.target.value) : null)}
                    placeholder="Optional" />
                </div>
                <div>
                  <label className={lbl}>GST %</label>
                  <input type="number" min="0" max="100" className={inp} style={inpSt} value={editingBatch.gst_percent}
                    onChange={e => updBatch('gst_percent', Number(e.target.value))} />
                </div>
                <div>
                  <label className={lbl}>Status</label>
                  <select className={sel} style={inpSt} value={editingBatch.booking_status}
                    onChange={e => updBatch('booking_status', e.target.value)}>
                    {BOOKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowBatchModal(false)} className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={saveBatch} disabled={batchSaving || !editingBatch?.batch_name || !editingBatch?.start_date || !editingBatch?.end_date}
            className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: T }}>
            {batchSaving ? 'Saving…' : editingBatch?.id ? 'Update Batch' : 'Add Batch'}
          </button>
        </div>
      </Modal>

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
