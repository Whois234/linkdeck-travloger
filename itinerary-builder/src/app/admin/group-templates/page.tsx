'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search, Users, ChevronRight, LayoutGrid, List, ArrowUpDown, CheckCircle2, SlidersHorizontal, X } from 'lucide-react';

type SortKey = 'name_asc' | 'name_desc' | 'nights_asc' | 'nights_desc' | 'batches_desc' | 'state_asc';
type StatusTab = 'all' | 'live' | 'draft';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name_asc',     label: 'Name A → Z' },
  { value: 'name_desc',    label: 'Name Z → A' },
  { value: 'state_asc',    label: 'State A → Z' },
  { value: 'nights_asc',   label: 'Nights: Low → High' },
  { value: 'nights_desc',  label: 'Nights: High → Low' },
  { value: 'batches_desc', label: 'Most Departures' },
];

interface State { id: string; name: string }
interface Dest  { id: string; name: string; state_id: string; hero_image?: string | null }
interface GT {
  id: string; group_template_name: string; duration_days: number; duration_nights: number;
  theme?: string | null; start_city?: string | null;
  state: { name: string }; state_id: string;
  group_template_days: { id: string }[];
  group_batches: { id: string }[];
  hero_image?: string | null; status: boolean;
  created_at: string;
  created_by_name?: string | null;
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
  const [filterTheme, setFilterTheme] = useState('');
  const [filterNights, setFilterNights] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [sortKey, setSortKey]   = useState<SortKey>('name_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [setup, setSetup] = useState({
    group_template_name: '', state_id: '', duration_nights: '4', duration_days: '5',
    min_pax: '10', max_pax: '25', start_city: '', end_city: '', theme: '', tab_title: '',
    destination_ids: [] as string[],
  });

  async function load() {
    setLoading(true);
    const [tr, sr, dr] = await Promise.all([
      fetch('/api/v1/group-templates'),  // no status param = all (live + draft); tabs filter client-side
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
      tab_title: setup.tab_title.trim() || null,
      hero_heading: setup.group_template_name,
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function del(id: string) {
    if (!confirm('Delete this group template?')) return;
    setDeleting(id);
    const res = await fetch(`/api/v1/group-templates/${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (res.ok) {
      setRows(prev => prev.filter(r => r.id !== id));
      showToast('Template deleted successfully');
    } else {
      alert('Delete failed. Please try again.');
    }
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} template${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    await Promise.all(ids.map(id => fetch(`/api/v1/group-templates/${id}`, { method: 'DELETE' })));
    setBulkDeleting(false);
    setSelected(new Set());
    setRows(prev => prev.filter(r => !ids.includes(r.id)));
    showToast(`${ids.length} template${ids.length !== 1 ? 's' : ''} deleted successfully`);
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // Filter option lists derived from data
  const themeOptions = useMemo(() =>
    Array.from(new Set(rows.map(r => r.theme).filter(Boolean) as string[])).sort()
      .map(t => ({ value: t, label: t }))
  , [rows]);

  const nightsOptions = useMemo(() =>
    Array.from(new Set(rows.map(r => r.duration_nights))).sort((a, b) => a - b)
      .map(n => ({ value: String(n), label: `${n} Nights` }))
  , [rows]);

  const liveCount  = useMemo(() => rows.filter(r => r.status).length,  [rows]);
  const draftCount = useMemo(() => rows.filter(r => !r.status).length, [rows]);

  const filtered = useMemo(() => {
    let list = rows.filter(r => {
      const q = search.toLowerCase();
      if (q && !r.group_template_name.toLowerCase().includes(q) && !r.state.name.toLowerCase().includes(q) && !(r.theme ?? '').toLowerCase().includes(q)) return false;
      if (stateFilter && r.state_id !== stateFilter) return false;
      if (filterTheme && (r.theme ?? '') !== filterTheme) return false;
      if (filterNights && r.duration_nights !== Number(filterNights)) return false;
      if (filterStatus && (filterStatus === 'active' ? !r.status : r.status)) return false;
      const tab = statusTab === 'all' || (statusTab === 'live' ? r.status : !r.status);
      if (!tab) return false;
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
  }, [rows, search, stateFilter, filterTheme, filterNights, filterStatus, statusTab, sortKey]);

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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold"
          style={{ backgroundColor: '#134956', color: 'white', minWidth: 260 }}>
          <CheckCircle2 className="w-4 h-4 text-green-300 flex-shrink-0" />
          {toast}
          <button onClick={() => setToast(null)} className="ml-auto opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <PageHeader
        title="Group Templates"
        subtitle="Build and manage itinerary templates for fixed-departure group tours"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Group Templates' }]}
        action={
          <button onClick={() => { setSetup({ group_template_name:'', state_id:'', duration_nights:'4', duration_days:'5', min_pax:'10', max_pax:'25', start_city:'', end_city:'', theme:'', tab_title:'', destination_ids:[] }); setErr(''); setShowSetup(true); }}
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

      {/* All / Live / Draft tabs */}
      <div className="flex items-center gap-1 mb-4 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F1F5F9' }}>
        {([
          { key: 'all',   label: 'All',   count: rows.length },
          { key: 'live',  label: 'Live',  count: liveCount   },
          { key: 'draft', label: 'Draft', count: draftCount  },
        ] as { key: StatusTab; label: string; count: number }[]).map(tab => (
          <button key={tab.key} onClick={() => setStatusTab(tab.key)}
            className="flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-semibold transition-all"
            style={statusTab === tab.key
              ? { backgroundColor: 'white', color: T, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: '#64748B' }}>
            {tab.label}
            <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold"
              style={statusTab === tab.key
                ? { backgroundColor: tab.key === 'live' ? '#DCFCE7' : tab.key === 'draft' ? '#FEF9C3' : '#E2E8F0',
                    color: tab.key === 'live' ? '#16A34A' : tab.key === 'draft' ? '#A16207' : '#64748B' }
                : { backgroundColor: '#E2E8F0', color: '#94A3B8' }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
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

        {/* Search */}
        <div className="relative ml-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
            className="w-52 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none bg-white" style={inpSt} />
        </div>

        {/* State filter */}
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
          className="h-9 px-3 pr-8 rounded-lg border text-sm focus:outline-none bg-white appearance-none" style={inpSt}>
          <option value="">All States</option>
          {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Sort */}
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

        {/* View toggle */}
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
          <Users className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-semibold text-sm text-[#0F172A]">No group templates yet</p>
          <p className="text-sm mt-1 text-[#64748B]">{search || stateFilter || filterTheme || filterNights || filterStatus ? 'Try a different filter' : 'Create your first group template to start managing departures'}</p>
        </div>
      ) : viewMode === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-[#134956]" />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Template</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">State</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Theme</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Days</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Departures</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Created By</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Created At</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const isSelected = selected.has(r.id);
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : undefined, backgroundColor: isSelected ? '#EEF7F9' : undefined }}
                    onClick={() => router.push(`/admin/group-templates/${r.id}/edit`)}>
                    <td className="px-4 py-3.5" onClick={e => { e.stopPropagation(); toggleSelect(r.id); }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} className="w-4 h-4 rounded accent-[#134956]" />
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-[#0F172A]">{r.group_template_name}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#FEF9C3', color: '#854D0E' }}>{r.state.name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-[#64748B]">{r.duration_nights}N / {r.duration_days}D</td>
                    <td className="px-4 py-3.5 text-[#64748B]">{r.theme ?? '—'}</td>
                    <td className="px-4 py-3.5 text-[#64748B]">{r.group_template_days.length}</td>
                    <td className="px-4 py-3.5">
                      {(r.group_batches?.length ?? 0) > 0
                        ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#DCFCE7', color: '#166634' }}>{r.group_batches.length} batch{r.group_batches.length !== 1 ? 'es' : ''}</span>
                        : <span className="text-[#CBD5E1] text-xs">—</span>}
                    </td>
                    {/* Created By */}
                    <td className="px-4 py-3.5">
                      {r.created_by_name ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                            {r.created_by_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-[#0F172A]">{r.created_by_name}</span>
                        </div>
                      ) : <span className="text-xs text-[#CBD5E1]">—</span>}
                    </td>
                    {/* Created At */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="text-xs font-medium text-[#0F172A]">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </div>
                      {r.created_at && (
                        <div className="text-[10px] text-[#94A3B8] mt-0.5">
                          {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
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
                );
              })}
            </tbody>
          </table></div>
        </div>
      ) : (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => {
            const isSelected = selected.has(r.id);
            return (
              <div key={r.id} className="bg-white rounded-2xl overflow-hidden group cursor-pointer hover:-translate-y-0.5 transition-all relative"
                style={{ border: isSelected ? `2px solid ${T}` : '1px solid #E2E8F0', boxShadow: isSelected ? `0 0 0 3px ${T}22` : '0 1px 3px rgba(0,0,0,0.06)' }}
                onClick={() => router.push(`/admin/group-templates/${r.id}/edit`)}>
                {/* Checkbox overlay */}
                <div className="absolute top-2 left-2 z-10" onClick={e => { e.stopPropagation(); toggleSelect(r.id); }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)}
                    className="w-4 h-4 rounded accent-[#134956] cursor-pointer" />
                </div>
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
                    <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>
                      {r.group_batches.length} batch{r.group_batches.length !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm text-[#0F172A] leading-tight">{r.group_template_name}</p>
                    <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#134956] transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                  <p className="text-xs text-[#94A3B8] mb-2">{r.duration_nights}N/{r.duration_days}D · {r.theme ?? 'Group Tour'}{r.start_city ? ` · ${r.start_city}` : ''}</p>
                  {(r.created_by_name || r.created_at) && (
                    <p className="text-[10px] text-[#CBD5E1] mb-2">
                      {r.created_by_name ? `By ${r.created_by_name}` : ''}
                      {r.created_by_name && r.created_at ? ' · ' : ''}
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </p>
                  )}
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
            );
          })}
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
          <div>
            <label className={lbl}>Browser Tab Title <span className="text-[#94A3B8] font-normal normal-case text-[10px]">(optional — shows in browser tab when customer opens quote)</span></label>
            <input className={inp} style={inpSt} value={setup.tab_title} onChange={e => setSetup(p => ({ ...p, tab_title: e.target.value }))} placeholder="e.g. Gokarna & Dandeli Group Tour" />
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
