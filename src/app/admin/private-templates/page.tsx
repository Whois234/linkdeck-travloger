'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import MultiStateSelect from '@/components/MultiStateSelect';
import { Plus, Search, Pencil, Trash2, FileText, Map, ChevronRight, LayoutGrid, List, ArrowUpDown, CheckCircle2, SlidersHorizontal, X, Copy, RotateCcw, AlertTriangle, Eye } from 'lucide-react';

type SortKey = 'name_asc' | 'name_desc' | 'state_asc' | 'nights_asc' | 'nights_desc' | 'days_desc' | 'newest' | 'oldest';
type StatusTab = 'all' | 'live' | 'draft' | 'deleted';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'oldest',     label: 'Oldest First' },
  { value: 'name_asc',   label: 'Name A → Z' },
  { value: 'name_desc',  label: 'Name Z → A' },
  { value: 'state_asc',  label: 'Destination A → Z' },
  { value: 'nights_asc', label: 'Nights (Short first)' },
  { value: 'nights_desc',label: 'Nights (Long first)' },
  { value: 'days_desc',  label: 'Most Day Plans' },
];

interface State { id: string; name: string; code: string }
interface Dest  { id: string; name: string; state_id: string; hero_image?: string | null }
interface PT {
  id: string; template_name: string; duration_days: number; duration_nights: number;
  theme?: string | null; start_city?: string | null; end_city?: string | null;
  state: { name: string }; state_id: string; template_days: { id: string }[];
  hero_image?: string | null; status: boolean;
  created_by?: string | null; created_at: string; deleted_at?: string | null;
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

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-8 px-2 pr-6 rounded-lg border text-xs focus:outline-none bg-white appearance-none" style={inpSt}>
        <option value="">All</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function PrivateTemplatesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justPublished = searchParams.get('published') === '1';
  const [rows, setRows]       = useState<PT[]>([]);
  const [states, setStates]   = useState<State[]>([]);
  const [dests, setDests]     = useState<Dest[]>([]);
  const [cities, setCities]   = useState<{ id: string; name: string; state_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]     = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [filterTheme, setFilterTheme] = useState('');
  const [filterNights, setFilterNights] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey]   = useState<SortKey>('newest');
  const [viewMode, setViewMode] = useState<'grid'|'list'>('list');
  const [showSetup, setShowSetup] = useState(false);
  const [step, setStep]       = useState(1);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [restoring, setRestoring]   = useState<string | null>(null);
  const [permDeleting, setPermDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [setup, setSetup] = useState({
    template_name: '', state_ids: [] as string[], duration_nights: '4', duration_days: '5',
    pax_count: '2', start_city: '', end_city: '', theme: '', tab_title: '',
    destination_ids: [] as string[],
  });
  const setupStateId = setup.state_ids[0] ?? '';

  async function load(tab?: StatusTab) {
    setLoading(true);
    const activeTab = tab ?? statusTab;
    const statusParam = activeTab === 'deleted' ? '?status=deleted' : '';
    const [tr, sr, dr, cr] = await Promise.all([
      fetch(`/api/v1/private-templates${statusParam}`),
      fetch('/api/v1/states'),
      fetch('/api/v1/destinations'),
      fetch('/api/v1/cities'),
    ]);
    const [td, sd, dd, cd] = await Promise.all([tr.json(), sr.json(), dr.json(), cr.json()]);
    if (td.success) setRows(td.data);
    if (sd.success) setStates(sd.data);
    if (dd.success) setDests(dd.data);
    if (cd.success) setCities(cd.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filteredDests = dests.filter(d => !setup.state_ids.length || setup.state_ids.includes(d.state_id));

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
      pax_count: Number(setup.pax_count) || 2,
      tab_title: setup.tab_title.trim() || null,
      hero_heading: setup.template_name,
      hero_subheading: '',
      hero_tags: setup.destination_ids
        .map(id => dests.find(d => d.id === id)?.name)
        .filter(Boolean),
      destination_cards: setup.destination_ids.map(id => {
        const dest = dests.find(d => d.id === id);
        return { destination_id: id, custom_name: null, description: '', image_url: dest?.hero_image ?? '' };
      }),
      package_options: DEFAULT_OPTIONS,
      why_choose: ['Ranked Professionals', 'Best Prices Guaranteed', 'Top-tier Standards', '24×7 Monitoring', 'On-ground Support'],
      faqs_enabled: false,
      custom_faqs: [] as { question: string; answer: string }[],
    };

    const res = await fetch('/api/v1/private-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_name: setup.template_name,
        state_id: setupStateId,
        state_ids: setup.state_ids,
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function del(id: string) {
    if (!confirm('Move this template to trash? You can restore it within 30 days.')) return;
    setDeleting(id);
    const res = await fetch(`/api/v1/private-templates/${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (res.ok) {
      setRows(prev => prev.filter(r => r.id !== id));
      showToast('Moved to Recently Deleted');
    } else {
      alert('Delete failed. Please try again.');
    }
  }

  async function restore(id: string) {
    setRestoring(id);
    const res = await fetch(`/api/v1/private-templates/${id}/restore`, { method: 'POST' });
    setRestoring(null);
    if (res.ok) {
      setRows(prev => prev.filter(r => r.id !== id));
      showToast('Template restored to Draft');
    } else {
      alert('Restore failed.');
    }
  }

  async function permanentDelete(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? This CANNOT be undone.`)) return;
    setPermDeleting(id);
    const res = await fetch(`/api/v1/private-templates/${id}?permanent=1`, { method: 'DELETE' });
    setPermDeleting(null);
    if (res.ok) {
      setRows(prev => prev.filter(r => r.id !== id));
      showToast('Permanently deleted');
    } else {
      alert('Delete failed.');
    }
  }

  async function duplicate(id: string, name: string) {
    if (!confirm(`Duplicate "${name}"? A copy will be created as a Draft.`)) return;
    setDuplicating(id);
    const res  = await fetch(`/api/v1/private-templates/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    setDuplicating(null);
    if (res.ok && data.data?.id) {
      router.push(`/admin/private-templates/${data.data.id}/edit`);
    } else {
      alert('Duplication failed: ' + (data.error ?? 'Unknown error'));
      load();
    }
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    const isDeletedTab = statusTab === 'deleted';
    const msg = isDeletedTab
      ? `Permanently delete ${selected.size} template${selected.size !== 1 ? 's' : ''}? This CANNOT be undone.`
      : `Move ${selected.size} template${selected.size !== 1 ? 's' : ''} to trash?`;
    if (!confirm(msg)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const url = (id: string) => isDeletedTab
      ? `/api/v1/private-templates/${id}?permanent=1`
      : `/api/v1/private-templates/${id}`;
    await Promise.all(ids.map(id => fetch(url(id), { method: 'DELETE' })));
    setBulkDeleting(false);
    setSelected(new Set());
    setRows(prev => prev.filter(r => !ids.includes(r.id)));
    showToast(isDeletedTab
      ? `${ids.length} template${ids.length !== 1 ? 's' : ''} permanently deleted`
      : `${ids.length} template${ids.length !== 1 ? 's' : ''} moved to trash`);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Filter option lists
  const themeOptions = useMemo(() =>
    Array.from(new Set(rows.map(r => r.theme).filter(Boolean) as string[])).sort()
      .map(t => ({ value: t, label: t }))
  , [rows]);

  const nightsOptions = useMemo(() =>
    Array.from(new Set(rows.map(r => r.duration_nights))).sort((a, b) => a - b)
      .map(n => ({ value: String(n), label: `${n} Nights` }))
  , [rows]);

  const filtered = useMemo(() => {
    const f = rows.filter(r => {
      if (statusTab === 'deleted') {
        // deleted tab: only show items with deleted_at set, apply search/state filter only
        const q = !search || r.template_name.toLowerCase().includes(search.toLowerCase()) || r.state.name.toLowerCase().includes(search.toLowerCase());
        const s = !stateFilter || r.state_id === stateFilter;
        return q && s;
      }
      const q = !search || r.template_name.toLowerCase().includes(search.toLowerCase()) || r.state.name.toLowerCase().includes(search.toLowerCase());
      const s = !stateFilter || r.state_id === stateFilter;
      const th = !filterTheme || (r.theme ?? '') === filterTheme;
      const ni = !filterNights || r.duration_nights === Number(filterNights);
      const st = !filterStatus || (filterStatus === 'active' ? r.status : !r.status);
      const tab = statusTab === 'all' || (statusTab === 'live' ? r.status : !r.status);
      return q && s && th && ni && st && tab;
    });
    return [...f].sort((a, b) => {
      switch (sortKey) {
        case 'newest':      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name_asc':    return a.template_name.localeCompare(b.template_name);
        case 'name_desc':   return b.template_name.localeCompare(a.template_name);
        case 'state_asc':   return a.state.name.localeCompare(b.state.name);
        case 'nights_asc':  return a.duration_nights - b.duration_nights;
        case 'nights_desc': return b.duration_nights - a.duration_nights;
        case 'days_desc':   return b.template_days.length - a.template_days.length;
        default: return 0;
      }
    });
  }, [rows, search, stateFilter, filterTheme, filterNights, filterStatus, statusTab, sortKey]);

  const liveCount  = useMemo(() => rows.filter(r => r.status).length, [rows]);
  const draftCount = useMemo(() => rows.filter(r => !r.status).length, [rows]);
  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(r => next.delete(r.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(r => next.add(r.id)); return next; });
    }
  }

  function clearFilters() { setStateFilter(''); setFilterTheme(''); setFilterNights(''); setFilterStatus(''); setSearch(''); }
  const activeFilterCount = [stateFilter, filterTheme, filterNights, filterStatus].filter(Boolean).length;

  return (
    <div className="max-w-[1400px]">
      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold animate-fade-in-up"
          style={{ backgroundColor: '#134956', color: 'white', minWidth: 260 }}>
          <CheckCircle2 className="w-4 h-4 text-green-300 flex-shrink-0" />
          {toast}
          <button onClick={() => setToast(null)} className="ml-auto opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <PageHeader
        title="Private Templates"
        subtitle="Build and manage itinerary templates for private tours"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Private Templates' }]}
        action={
          <button onClick={() => { setSetup({ template_name:'', state_ids:[], duration_nights:'4', duration_days:'5', pax_count:'2', start_city:'', end_city:'', theme:'', tab_title:'', destination_ids:[] }); setErr(''); setStep(1); setShowSetup(true); }}
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

      {/* All / Live / Draft / Recently Deleted tabs */}
      <div className="flex items-center gap-1 mb-4 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F1F5F9' }}>
        {([
          { key: 'all',     label: 'All',              count: rows.length, activeBg: '#E2E8F0',  activeColor: '#64748B' },
          { key: 'live',    label: 'Live',             count: liveCount,   activeBg: '#DCFCE7',  activeColor: '#16A34A' },
          { key: 'draft',   label: 'Draft',            count: draftCount,  activeBg: '#FEF9C3',  activeColor: '#A16207' },
          { key: 'deleted', label: 'Recently Deleted', count: statusTab === 'deleted' ? rows.length : null,
            activeBg: '#FEE2E2', activeColor: '#DC2626' },
        ] as { key: StatusTab; label: string; count: number | null; activeBg: string; activeColor: string }[]).map(tab => (
          <button key={tab.key} onClick={() => {
            setStatusTab(tab.key);
            setRows([]);
            load(tab.key);
          }}
            className="flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-semibold transition-all"
            style={statusTab === tab.key
              ? { backgroundColor: 'white', color: tab.key === 'deleted' ? '#DC2626' : T, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: tab.key === 'deleted' ? '#EF4444' : '#64748B' }}>
            {tab.key === 'deleted' && <Trash2 className="w-3 h-3" />}
            {tab.label}
            {tab.count !== null && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
                style={statusTab === tab.key
                  ? { backgroundColor: tab.activeBg, color: tab.activeColor }
                  : { backgroundColor: '#E2E8F0', color: '#94A3B8' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Recently Deleted info banner */}
      {statusTab === 'deleted' && (
        <div className="flex items-start gap-3 mb-4 px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', color: '#C2410C' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Templates in trash are <strong>permanently deleted after 30 days</strong>. Restore a template to move it back to Draft.</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Select-all checkbox */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
            className="w-4 h-4 rounded accent-[#134956]" />
          <span className="text-sm text-[#64748B]">
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </span>
        </label>

        {/* Bulk delete */}
        {selected.size > 0 && (
          <button onClick={handleBulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}>
            <Trash2 className="w-3.5 h-3.5" />
            {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
          </button>
        )}

        <div className="relative ml-1">
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

        {/* Filters toggle */}
        <button onClick={() => setShowFilters(p => !p)}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium relative"
          style={{ borderColor: activeFilterCount ? T : '#E2E8F0', color: activeFilterCount ? T : '#64748B', backgroundColor: activeFilterCount ? '#EEF7F9' : 'white' }}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: T }}>{activeFilterCount}</span>
          )}
        </button>

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

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-end gap-4 flex-wrap mb-4 px-4 py-3 rounded-xl" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <FilterSelect label="Theme" value={filterTheme} onChange={setFilterTheme} options={themeOptions} />
          <FilterSelect label="Duration" value={filterNights} onChange={setFilterNights} options={nightsOptions} />
          <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#E2E8F0] self-end">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: T }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
          <FileText className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-semibold text-sm text-[#0F172A]">No templates yet</p>
          <p className="text-sm mt-1 text-[#64748B]">{search || stateFilter || filterTheme || filterNights || filterStatus ? 'Try a different filter' : 'Create your first private template'}</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-[#134956]" />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Template</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Destination</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Theme</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Days</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Created By</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Created</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const isSelected = selected.has(r.id);
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : undefined, backgroundColor: isSelected ? '#EEF7F9' : undefined }}
                    onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}>
                    <td className="px-4 py-3.5" onClick={e => { e.stopPropagation(); toggleSelect(r.id); }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} className="w-4 h-4 rounded accent-[#134956]" />
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-[#0F172A]">{r.template_name}</td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold"
                        style={r.status
                          ? { backgroundColor: '#DCFCE7', color: '#16A34A' }
                          : { backgroundColor: '#FEF9C3', color: '#A16207' }}>
                        {r.status ? 'Live' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ backgroundColor: '#CCFBF1', color: '#0F766E' }}>{r.state.name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-[#64748B]">{r.duration_nights}N/{r.duration_days}D</td>
                    <td className="px-4 py-3.5 text-[#64748B]">{r.theme ?? '—'}</td>
                    <td className="px-4 py-3.5 text-[#64748B]">{r.template_days.length}</td>
                    <td className="px-4 py-3.5 text-[#64748B] whitespace-nowrap">{r.created_by ?? '—'}</td>
                    <td className="px-4 py-3.5 text-[#64748B] whitespace-nowrap text-xs">
                      {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span className="block text-[10px] text-[#94A3B8]">
                        {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {statusTab === 'deleted' ? (<>
                          {/* Restore */}
                          <button onClick={() => restore(r.id)} disabled={restoring === r.id}
                            title="Restore to Draft"
                            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                            style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>
                            <RotateCcw className="w-3 h-3" /> Restore
                          </button>
                          {/* Permanent delete */}
                          <button onClick={() => permanentDelete(r.id, r.template_name)} disabled={permDeleting === r.id}
                            title="Delete permanently"
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-40"
                            style={{ color: '#94A3B8' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {/* Days until auto-delete */}
                          {r.deleted_at && (() => {
                            const days = 30 - Math.floor((Date.now() - new Date(r.deleted_at!).getTime()) / 86400000);
                            return <span className="text-[10px] font-semibold ml-1" style={{ color: days <= 7 ? '#DC2626' : '#94A3B8' }}>{days}d left</span>;
                          })()}
                        </>) : (<>
                          <button onClick={() => window.open(`/admin/private-templates/${r.id}/preview`, '_blank')}
                            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors hover:opacity-90"
                            style={{ borderColor: '#2563EB', color: '#2563EB', backgroundColor: '#EFF6FF' }}>
                            <Eye className="w-3 h-3" />Preview
                          </button>
                          <button onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}
                            title="Edit"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#134956]">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => duplicate(r.id, r.template_name)} disabled={duplicating === r.id}
                            title="Duplicate"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#EEF7F9] hover:text-[#134956] disabled:opacity-40">
                            {duplicating === r.id
                              ? <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:'#134956'}} />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => del(r.id)} disabled={deleting === r.id}
                            title="Move to trash"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-40">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => {
            const isSelected = selected.has(r.id);
            return (
              <div key={r.id} className="bg-white rounded-2xl overflow-hidden group cursor-pointer hover:-translate-y-0.5 transition-all relative"
                style={{ border: isSelected ? `2px solid ${T}` : '1px solid #E2E8F0', boxShadow: isSelected ? `0 0 0 3px ${T}22` : '0 1px 3px rgba(0,0,0,0.06)' }}
                onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}>
                {/* Checkbox overlay */}
                <div className="absolute top-2 left-2 z-10" onClick={e => { e.stopPropagation(); toggleSelect(r.id); }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)}
                    className="w-4 h-4 rounded accent-[#134956] cursor-pointer" />
                </div>
                <div className="aspect-video bg-gradient-to-br from-[#134956]/10 to-[#134956]/20 relative overflow-hidden">
                  {r.hero_image ? (
                    <Image src={r.hero_image} alt={r.template_name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Map className="w-8 h-8" style={{ color: T, opacity: 0.3 }} />
                    </div>
                  )}
                  <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#CCFBF1', color: '#0F766E' }}>{r.state.name}</span>
                  <span className="absolute top-2 left-8 text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={r.status
                      ? { backgroundColor: '#DCFCE7', color: '#16A34A' }
                      : { backgroundColor: '#FEF9C3', color: '#A16207' }}>
                    {r.status ? 'Live' : 'Draft'}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm text-[#0F172A] leading-tight">{r.template_name}</p>
                    <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#134956] transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                  <p className="text-xs text-[#94A3B8] mb-1">{r.duration_nights}N/{r.duration_days}D · {r.theme ?? 'Custom'}{r.start_city ? ` · ${r.start_city}` : ''}</p>
                  <p className="text-[10px] text-[#B0BFCC] mb-3">
                    {r.created_by ? `By ${r.created_by} · ` : ''}{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#64748B]">{r.template_days.length} day plan{r.template_days.length !== 1 ? 's' : ''}</span>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {statusTab === 'deleted' ? (<>
                        <button onClick={() => restore(r.id)} disabled={restoring === r.id}
                          className="flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                          style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>
                          <RotateCcw className="w-3 h-3" /> Restore
                        </button>
                        <button onClick={() => permanentDelete(r.id, r.template_name)} disabled={permDeleting === r.id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-40"
                          style={{ color: '#94A3B8' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>) : (<>
                        <button onClick={() => window.open(`/admin/private-templates/${r.id}/preview`, '_blank')}
                          className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors hover:opacity-90"
                          style={{ borderColor: '#2563EB', color: '#2563EB', backgroundColor: '#EFF6FF' }}>
                          <Eye className="w-3 h-3" />Preview
                        </button>
                        <button onClick={() => router.push(`/admin/private-templates/${r.id}/edit`)}
                          title="Edit"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#134956]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => duplicate(r.id, r.template_name)} disabled={duplicating === r.id}
                          title="Duplicate"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#EEF7F9] hover:text-[#134956] disabled:opacity-40">
                          {duplicating === r.id
                            ? <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:'#134956'}} />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => del(r.id)} disabled={deleting === r.id}
                          title="Move to trash"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-40">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
          <div>
            <label className={lbl}>Browser Tab Title <span className="text-[#94A3B8] font-normal normal-case text-[10px]">(optional — shows in browser tab when customer opens quote)</span></label>
            <input className={inp} style={inpSt} value={setup.tab_title} onChange={e => setSetup(p => ({ ...p, tab_title: e.target.value }))} placeholder="e.g. Gokarna & Dandeli Trip" />
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
              <select className={inp + ' appearance-none'} style={inpSt} value={setup.start_city} onChange={e => setSetup(p => ({ ...p, start_city: e.target.value }))}>
                <option value="">Select city…</option>
                {(setup.state_ids.length ? cities.filter(c => setup.state_ids.includes(c.state_id)) : cities).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>End City</label>
              <select className={inp + ' appearance-none'} style={inpSt} value={setup.end_city} onChange={e => setSetup(p => ({ ...p, end_city: e.target.value }))}>
                <option value="">Select city…</option>
                {(setup.state_ids.length ? cities.filter(c => setup.state_ids.includes(c.state_id)) : cities).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>State / Region <span className="text-red-500">*</span></label>
            <MultiStateSelect
              states={states}
              selected={setup.state_ids}
              onChange={ids => setSetup(p => ({ ...p, state_ids: ids, destination_ids: [] }))}
              placeholder="Select states (e.g. Karnataka + Tamil Nadu)…"
            />
          </div>
          {setup.state_ids.length > 0 && (
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
                {filteredDests.length === 0 && <p className="text-xs text-[#94A3B8]">No destinations found for selected states</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowSetup(false)} className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={createTemplate} disabled={saving || !setup.template_name || !setup.state_ids.length}
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
