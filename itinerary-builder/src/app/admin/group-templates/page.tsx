'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search, Users, ChevronRight, LayoutGrid, List, ArrowUpDown, CheckCircle2 } from 'lucide-react';

type SortKey = 'name_asc' | 'name_desc' | 'nights_asc' | 'nights_desc' | 'batches_desc' | 'state_asc';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name_asc',     label: 'Name A → Z' },
  { value: 'name_desc',    label: 'Name Z → A' },
  { value: 'state_asc',    label: 'State A → Z' },
  { value: 'nights_asc',   label: 'Nights: Low → High' },
  { value: 'nights_desc',  label: 'Nights: High → Low' },
  { value: 'batches_desc', label: 'Most Departures' },
];

interface State { id: string; name: string }
interface Dest  { id: string; name: string; state_id: string }
interface GT {
  id: string; group_template_name: string; duration_days: number; duration_nights: number;
  theme?: string | null; start_city?: string | null;
  state: { name: string }; state_id: string;
  group_template_days: { id: string }[];
  group_batches: { id: string }[];
  hero_image?: string | null; status: boolean;
}

const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor: '#E2E8F0' };
const T     = '#134956';

const DEFAULT_OPTIONS = [
  { tier_name: 'Standard', display_order: 1, is_most_popular: false, inclusions: [], adult_price: 0, child_price: 0 },
  { tier_name: 'Deluxe',   display_order: 2, is_most_popular: true,  inclusions: [], adult_price: 0, child_price: 0 },
];

function GroupTemplatesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justPublished = searchParams.get('published') === '1';
  const [rows, setRows]       = useState<GT[]>([]);
  const [states, setStates]   = useState<State[]>([]);
  const [dests, setDests]     = useState<Dest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]     = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('name_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const [setup, setSetup] = useState({
    group_template_name: '', state_id: '', duration_nights: '4', duration_days: '5',
    min_pax: '10', max_pax: '25', start_city: '', end_city: '', theme: '',
    destination_ids: [] as string[],
  });

  async function load() {
    setLoading(true);
    const [tr, sr, dr] = await Promise.all([
      fetch('/api/v1/group-templates'),
      fetch('/api/v1/states'),
      fetch('/api/v1/destinations'),
    ]);
    const [td, sd, dd] = await Promise.all([tr.json(), sr.json(), dr.json()]);
    if (td.success) setRows(td.data);
    if (sd.success) setStates(sd.data);
    if (dd.success) setDests(dd.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filteredDests = dests.filter(d => !setup.state_id || d.state_id === setup.state_id);

  function toggleDest(id: string) {
    setSetup(p => ({
      ...p,
      destination_ids: p.destination_ids.includes(id)
        ? p.destination_ids.filter(x => x !== id)
        : [...p.destination_ids, id],
    }));
  }

  async function createTemplate() {
    setSaving(true); setErr('');
    const nights = Number(setup.duration_nights);
    const days   = Number(setup.duration_days) || nights + 1;

    const cms_data = {
      min_pax: Number(setup.min_pax) || 10,
      max_pax: Number(setup.max_pax) || 25,
      hero_heading: setup.group_template_name,
      hero_subheading: '',
      hero_tags: setup.destination_ids
        .map(id => dests.find(d => d.id === id)?.name)
        .filter(Boolean),
      destination_cards: setup.destination_ids.map(id => ({
        destination_id: id, custom_name: null, description: '', image_url: '',
      })),
      package_options: DEFAULT_OPTIONS,
      why_choose: ['Ranked Professionals', 'Best Prices Guaranteed', 'Top-tier Standards', '24×7 Monitoring', 'On-ground Support'],
      faqs_enabled: false,
      custom_faqs: [] as { question: string; answer: string }[],
    };

    const res = await fetch('/api/v1/group-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_template_name: setup.group_template_name,
        state_id: setup.state_id,
        destinations: setup.destination_ids,
        duration_days: days, duration_nights: nights,
        start_city: setup.start_city || null,
        end_city: setup.end_city || null,
        theme: setup.theme || null,
        cms_data,
      }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? 'Failed to create'); setSaving(false); return; }
    router.push(`/admin/group-templates/${d.data.id}/edit`);
  }

  async function del(id: string) {
    if (!confirm('Deactivate this group template?')) return;
    setDeleting(id);
    await fetch(`/api/v1/group-templates/${id}`, { method: 'DELETE' });
    setDeleting(null); load();
  }

  const filtered = useMemo(() => {
    let list = rows.filter(r => {
      const q = search.toLowerCase();
      if (q && !r.group_template_name.toLowerCase().includes(q) && !r.state.name.toLowerCase().includes(q) && !(r.theme ?? '').toLowerCase().includes(q)) return false;
      if (stateFilter && r.state_id !== stateFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':     return a.group_template_name.localeCompare(b.group_template_name);
        case 'name_desc':    return b.group_template_name.localeCompare(a.group_template_name);
        case 'state_asc':    return a.state.name.localeCompare(b.state.name);
        case 'nights_asc':   return a.duration_nights - b.duration_nights;
        case 'nights_desc':  return b.duration_nights - a.duration_nights;
        case 'batches_desc': return (b.group_batches?.length ?? 0) - (a.group_batches?.length ?? 0);
        default:             return 0;
      }
    });
    return list;
  }, [rows, search, stateFilter, sortKey]);

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Group Templates"
        subtitle="Build and manage itinerary templates for fixed-departure group tours"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Group Templates' }]}
        action={
          <button onClick={() => { setSetup({ group_template_name:'', state_id:'', duration_nights:'4', duration_days:'5', min_pax:'10', max_pax:'25', start_city:'', end_city:'', theme:'', destination_ids:[] }); setErr(''); setShowSetup(true); }}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
            <Plus className="w-4 h-4" /> Create Group Template
          </button>
        }
      />

      {/* Success banner */}
      {justPublished && (
        <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl text-sm font-medium" style={{ backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0' }}>
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          Group template published successfully!
        </div>
      )}

      {/* Filter / Sort bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
            className="w-56 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none bg-white" style={inpSt} />
        </div>

        {/* State filter */}
        <div className="relative">
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
            className="h-9 pl-3 pr-8 rounded-lg border text-sm focus:outline-none bg-white appearance-none" style={inpSt}>
            <option value="">All States</option>
            {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Sort */}
        <div className="relative flex items-center">
          <ArrowUpDown className="absolute left-2.5 w-3.5 h-3.5 text-[#94A3B8] pointer-events-none" />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="h-9 pl-8 pr-8 rounded-lg border text-sm focus:outline-none bg-white appearance-none" style={inpSt}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden ml-auto" style={{ border: '1px solid #E2E8F0' }}>
          <button onClick={() => setViewMode('grid')}
            className="w-9 h-9 flex items-center justify-center transition-colors"
            style={viewMode === 'grid' ? { backgroundColor: T, color: 'white' } : { backgroundColor: 'white', color: '#94A3B8' }}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')}
            className="w-9 h-9 flex items-center justify-center transition-colors"
            style={viewMode === 'list' ? { backgroundColor: T, color: 'white' } : { backgroundColor: 'white', color: '#94A3B8' }}>
            <List className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[#94A3B8]">{loading ? 'Loading…' : `${filtered.length} template${filtered.length !== 1 ? 's' : ''}`}</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: T }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
          <Users className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-semibold text-sm text-[#0F172A]">No group templates yet</p>
          <p className="text-sm mt-1 text-[#64748B]">Create your first group template to start managing departures</p>
        </div>
      ) : viewMode === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Template</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">State</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Theme</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Days</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Departures</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} onClick={() => router.push(`/admin/group-templates/${r.id}/edit`)}
                  className="cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                  style={i < filtered.length - 1 ? { borderBottom: '1px solid #F1F5F9' } : {}}>
                  <td className="px-4 py-3 font-semibold text-[#0F172A]">{r.group_template_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#FEF9C3', color: '#854D0E' }}>{r.state.name}</span>
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">{r.duration_nights}N / {r.duration_days}D</td>
                  <td className="px-4 py-3 text-[#64748B]">{r.theme ?? '—'}</td>
                  <td className="px-4 py-3 text-[#64748B]">{r.group_template_days.length}</td>
                  <td className="px-4 py-3">
                    {(r.group_batches?.length ?? 0) > 0
                      ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>{r.group_batches.length} batch{r.group_batches.length !== 1 ? 'es' : ''}</span>
                      : <span className="text-[#CBD5E1] text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => router.push(`/admin/group-templates/${r.id}/edit`)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#134956]">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => del(r.id)} disabled={deleting === r.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => (
            <div key={r.id} className="bg-white rounded-2xl overflow-hidden group cursor-pointer hover:-translate-y-0.5 transition-all"
              style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              onClick={() => router.push(`/admin/group-templates/${r.id}/edit`)}>
              <div className="aspect-video bg-gradient-to-br from-[#134956]/10 to-[#134956]/20 relative overflow-hidden">
                {r.hero_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.hero_image} alt={r.group_template_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Users className="w-8 h-8" style={{ color: T, opacity: 0.3 }} />
                  </div>
                )}
                <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#FEF9C3', color: '#854D0E' }}>{r.state.name}</span>
                {r.group_batches?.length > 0 && (
                  <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>
                    {r.group_batches.length} batch{r.group_batches.length !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-sm text-[#0F172A] leading-tight">{r.group_template_name}</p>
                  <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#134956] transition-colors flex-shrink-0 mt-0.5" />
                </div>
                <p className="text-xs text-[#94A3B8] mb-3">{r.duration_nights}N/{r.duration_days}D · {r.theme ?? 'Group Tour'}{r.start_city ? ` · ${r.start_city}` : ''}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#64748B]">
                    {r.group_template_days.length} day{r.group_template_days.length !== 1 ? 's' : ''} · {r.group_batches?.length ?? 0} departure{(r.group_batches?.length ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => router.push(`/admin/group-templates/${r.id}/edit`)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#134956]">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(r.id)} disabled={deleting === r.id}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SETUP MODAL ── */}
      <Modal open={showSetup} onClose={() => setShowSetup(false)} title="Create Group Template" subtitle="Set up your group tour template" maxWidth="max-w-lg">
        {err && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{err}</div>}
        <div className="flex flex-col gap-4">
          <div>
            <label className={lbl}>Template Name <span className="text-red-500">*</span></label>
            <input className={inp} style={inpSt} value={setup.group_template_name} onChange={e => setSetup(p => ({ ...p, group_template_name: e.target.value }))} placeholder="Kerala Group Tour 5D/4N" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Nights <span className="text-red-500">*</span></label>
              <input type="number" min="1" className={inp} style={inpSt} value={setup.duration_nights}
                onChange={e => setSetup(p => ({ ...p, duration_nights: e.target.value, duration_days: String(Number(e.target.value) + 1) }))} />
            </div>
            <div>
              <label className={lbl}>Days</label>
              <input type="number" min="1" className={inp} style={inpSt} value={setup.duration_days}
                onChange={e => setSetup(p => ({ ...p, duration_days: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Min Pax</label>
              <input type="number" min="1" className={inp} style={inpSt} value={setup.min_pax}
                onChange={e => setSetup(p => ({ ...p, min_pax: e.target.value }))} placeholder="10" />
            </div>
            <div>
              <label className={lbl}>Max Pax</label>
              <input type="number" min="1" className={inp} style={inpSt} value={setup.max_pax}
                onChange={e => setSetup(p => ({ ...p, max_pax: e.target.value }))} placeholder="25" />
            </div>
            <div>
              <label className={lbl}>Theme</label>
              <input className={inp} style={inpSt} value={setup.theme} onChange={e => setSetup(p => ({ ...p, theme: e.target.value }))} placeholder="Backwaters, Hill Station…" />
            </div>
            <div>
              <label className={lbl}>Start City</label>
              <input className={inp} style={inpSt} value={setup.start_city} onChange={e => setSetup(p => ({ ...p, start_city: e.target.value }))} placeholder="Cochin" />
            </div>
          </div>
          <div>
            <label className={lbl}>State / Region <span className="text-red-500">*</span></label>
            <select className={sel} style={inpSt} value={setup.state_id} onChange={e => setSetup(p => ({ ...p, state_id: e.target.value, destination_ids: [] }))}>
              <option value="">Select state…</option>
              {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {setup.state_id && (
            <div>
              <label className={lbl}>Destinations <span className="text-[#94A3B8] font-normal normal-case text-[10px]">(select all that apply)</span></label>
              <div className="flex flex-wrap gap-2">
                {filteredDests.map(d => (
                  <button key={d.id} onClick={() => toggleDest(d.id)}
                    className="h-8 px-3 rounded-lg text-xs font-semibold transition-colors"
                    style={setup.destination_ids.includes(d.id)
                      ? { backgroundColor: T, color: 'white', border: `1px solid ${T}` }
                      : { backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                    {d.name}
                  </button>
                ))}
                {filteredDests.length === 0 && <p className="text-xs text-[#94A3B8]">No destinations found for this state</p>}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowSetup(false)} className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={createTemplate} disabled={saving || !setup.group_template_name || !setup.state_id}
            className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: T }}>
            {saving ? 'Creating…' : 'Continue to CMS →'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function GroupTemplatesPage() {
  return (
    <Suspense fallback={<div className="py-20 flex justify-center"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#134956' }} /></div>}>
      <GroupTemplatesPageInner />
    </Suspense>
  );
}
