'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Search, Pencil, Trash2, FileText, Map, ChevronRight, LayoutGrid, List, ArrowUpDown, CheckCircle2 } from 'lucide-react';

type SortKey = 'name_asc' | 'name_desc' | 'state_asc' | 'nights_asc' | 'nights_desc' | 'days_desc';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name_asc',   label: 'Name A → Z' },
  { value: 'name_desc',  label: 'Name Z → A' },
  { value: 'state_asc',  label: 'Destination A → Z' },
  { value: 'nights_asc', label: 'Nights (Short first)' },
  { value: 'nights_desc',label: 'Nights (Long first)' },
  { value: 'days_desc',  label: 'Most Day Plans' },
];

interface State { id: string; name: string }
interface Dest  { id: string; name: string; state_id: string }
interface PT {
  id: string; template_name: string; duration_days: number; duration_nights: number;
  theme?: string | null; start_city?: string | null; end_city?: string | null;
  state: { name: string }; state_id: string; template_days: { id: string }[];
  hero_image?: string | null; status: boolean;
}

const inp  = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const sel  = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl  = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor: '#E2E8F0' };
const T    = '#134956';

const DEFAULT_OPTIONS = [
  { tier_name: 'Standard', display_order: 1, is_most_popular: false, inclusions: [] },
  { tier_name: 'Deluxe',   display_order: 2, is_most_popular: true,  inclusions: [] },
];

function PrivateTemplatesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justPublished = searchParams.get('published') === '1';
  const [rows, setRows]       = useState<PT[]>([]);
  const [states, setStates]   = useState<State[]>([]);
  const [dests, setDests]     = useState<Dest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]     = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('name_asc');
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [showSetup, setShowSetup] = useState(false);
  const [step, setStep]       = useState(1);  // 1 = setup, saving
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const [setup, setSetup] = useState({
    template_name: '', state_id: '', duration_nights: '4', duration_days: '5',
    pax_count: '2', start_city: '', end_city: '', theme: '',
    destination_ids: [] as string[],
  });

  async function load() {
    setLoading(true);
    const [tr, sr, dr] = await Promise.all([
      fetch('/api/v1/private-templates'),
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

    // Build initial cms_data
    const cms_data = {
      pax_count: Number(setup.pax_count) || 2,
      hero_heading: setup.template_name,
      hero_subheading: '',
      hero_tags: setup.destination_ids
        .map(id => dests.find(d => d.id === id)?.name)
        .filter(Boolean),
      destination_cards: setup.destination_ids.map(id => ({
        destination_id: id,
        custom_name: null,
        description: '',
        image_url: '',
      })),
      package_options: DEFAULT_OPTIONS,
      why_choose: [
        'Ranked Professionals',
        'Best Prices Guaranteed',
        'Top-tier Standards',
        '24×7 Monitoring',
        'On-ground Support',
      ],
      faqs_enabled: false,
      custom_faqs: [] as { question: string; answer: string }[],
    };

    const res = await fetch('/api/v1/private-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_name: setup.template_name,
        state_id: setup.state_id,
        destinations: setup.destination_ids,
        duration_days: days,
        duration_nights: nights,
        start_city: setup.start_city || null,
        end_city: setup.end_city || null,
        theme: setup.theme || null,
        cms_data,
      }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? 'Failed to create'); setSaving(false); return; }
    router.push(`/admin/private-templates/${d.data.id}/edit`);
  }

  async function del(id: string) {
    if (!confirm('Deactivate this template?')) return;
    setDeleting(id);
    await fetch(`/api/v1/private-templates/${id}`, { method: 'DELETE' });
    setDeleting(null);
    load();
  }

  const filtered = useMemo(() => {
    const f = rows.filter(r => {
      const q = !search || r.template_name.toLowerCase().includes(search.toLowerCase()) || r.state.name.toLowerCase().includes(search.toLowerCase());
      const s = !stateFilter || r.state_id === stateFilter;
      return q && s;
    });
    return [...f].sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':    return a.template_name.localeCompare(b.template_name);
        case 'name_desc':   return b.template_name.localeCompare(a.template_name);
        case 'state_asc':   return a.state.name.localeCompare(b.state.name);
        case 'nights_asc':  return a.duration_nights - b.duration_nights;
        case 'nights_desc': return b.duration_nights - a.duration_nights;
        case 'days_desc':   return b.template_days.length - a.template_days.length;
        default: return 0;
      }
    });
  }, [rows, search, stateFilter, sortKey]);

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Private Templates"
        subtitle="Build and manage itinerary templates for private tours"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Private Templates' }]}
        action={
          <button onClick={() => { setSetup({ template_name:'', state_id:'', duration_nights:'4', duration_days:'5', pax_count:'2', start_city:'', end_city:'', theme:'', destination_ids:[] }); setErr(''); setStep(1); setShowSetup(true); }}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
            <Plus className="w-4 h-4" /> Create Template
          </button>
        }
      />

      {/* Published success banner */}
      {justPublished && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl text-sm font-medium" style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Template published successfully! It is now live and available for quote creation.
        </div>
      )}

      {/* Search + Sort + View bar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
            className="w-52 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none bg-white" style={inpSt} />
        </div>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
          className="h-9 px-3 pr-8 rounded-lg border text-sm focus:outline-none bg-white appearance-none" style={inpSt}>
          <option value="">All Destinations</option>
          {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-white text-sm" style={inpSt}>
          <ArrowUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-transparent border-none text-sm focus:outline-none appearance-none pr-4" style={{ color: '#475569' }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center rounded-lg border overflow-hidden ml-auto" style={inpSt}>
          <button onClick={() => setViewMode('grid')}
            className="flex items-center justify-center w-9 h-9 transition-colors"
            style={{ backgroundColor: viewMode === 'grid' ? T : 'white', color: viewMode === 'grid' ? 'white' : '#94A3B8' }}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')}
            className="flex items-center justify-center w-9 h-9 transition-colors"
            style={{ backgroundColor: viewMode === 'list' ? T : 'white', color: viewMode === 'list' ? 'white' : '#94A3B8' }}>
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
          <FileText className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-semibold text-sm text-[#0F172A]">No templates yet</p>
          <p className="text-sm mt-1 text-[#64748B]">{search || stateFilter ? 'Try a different filter' : 'Create your first private template'}</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Template</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Destination</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Theme</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Days</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className="cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : undefined }}
                  onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}>
                  <td className="px-5 py-3.5 font-semibold text-[#0F172A]">{r.template_name}</td>
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ backgroundColor: '#CCFBF1', color: '#0F766E' }}>{r.state.name}</span>
                  </td>
                  <td className="px-4 py-3.5 text-[#64748B]">{r.duration_nights}N/{r.duration_days}D</td>
                  <td className="px-4 py-3.5 text-[#64748B]">{r.theme ?? '—'}</td>
                  <td className="px-4 py-3.5 text-[#64748B]">{r.template_days.length}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => (
            <div key={r.id} className="bg-white rounded-2xl overflow-hidden group cursor-pointer hover:-translate-y-0.5 transition-all"
              style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}>
              <div className="aspect-video bg-gradient-to-br from-[#134956]/10 to-[#134956]/20 relative overflow-hidden">
                {r.hero_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.hero_image} alt={r.template_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Map className="w-8 h-8" style={{ color: T, opacity: 0.3 }} />
                  </div>
                )}
                <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#CCFBF1', color: '#0F766E' }}>{r.state.name}</span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-sm text-[#0F172A] leading-tight">{r.template_name}</p>
                  <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#134956] transition-colors flex-shrink-0 mt-0.5" />
                </div>
                <p className="text-xs text-[#94A3B8] mb-3">{r.duration_nights}N/{r.duration_days}D · {r.theme ?? 'Custom'}{r.start_city ? ` · ${r.start_city}` : ''}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#64748B]">{r.template_days.length} day plan{r.template_days.length !== 1 ? 's' : ''}</span>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}
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
      <Modal open={showSetup} onClose={() => setShowSetup(false)} title="Create New Template" subtitle={`Step ${step} of 1 — Set up your template`} maxWidth="max-w-lg">
        {err && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{err}</div>}

        <div className="flex flex-col gap-4">
          <div>
            <label className={lbl}>Template Name <span className="text-red-500">*</span></label>
            <input className={inp} style={inpSt} value={setup.template_name} onChange={e => setSetup(p => ({ ...p, template_name: e.target.value }))} placeholder="Kerala Backwaters 5D/4N" />
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
              <label className={lbl}>Default Pax</label>
              <input type="number" min="1" max="20" className={inp} style={inpSt} value={setup.pax_count}
                onChange={e => setSetup(p => ({ ...p, pax_count: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Theme</label>
              <input className={inp} style={inpSt} value={setup.theme} onChange={e => setSetup(p => ({ ...p, theme: e.target.value }))} placeholder="Backwaters, Hill Station…" />
            </div>
            <div>
              <label className={lbl}>Start City</label>
              <input className={inp} style={inpSt} value={setup.start_city} onChange={e => setSetup(p => ({ ...p, start_city: e.target.value }))} placeholder="Cochin" />
            </div>
            <div>
              <label className={lbl}>End City</label>
              <input className={inp} style={inpSt} value={setup.end_city} onChange={e => setSetup(p => ({ ...p, end_city: e.target.value }))} placeholder="Trivandrum" />
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
          <button onClick={createTemplate} disabled={saving || !setup.template_name || !setup.state_id}
            className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: T }}>
            {saving ? 'Creating…' : 'Continue to CMS →'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function PrivateTemplatesPage() {
  return (
    <Suspense>
      <PrivateTemplatesPageInner />
    </Suspense>
  );
}
