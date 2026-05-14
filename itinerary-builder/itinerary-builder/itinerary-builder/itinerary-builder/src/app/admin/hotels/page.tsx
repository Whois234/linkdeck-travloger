'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Search, Star, ChevronRight, Building2, LayoutGrid, List, ArrowUpDown, Trash2, SlidersHorizontal, X, AlertTriangle, MapPin } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

const HOTEL_TYPES = ['HOTEL','RESORT','VILLA','HOMESTAY','HOUSEBOAT'];
const HOTEL_CATS  = ['BUDGET','STANDARD','DELUXE','PREMIUM','LUXURY'];

type SortKey = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'dest_asc' | 'dest_desc' | 'state_asc' | 'state_desc' | 'cat_asc' | 'stars_desc' | 'rooms_desc';

interface Dest  { id: string; name: string }
interface State { id: string; name: string }
interface Hotel {
  id: string; hotel_name: string; hotel_type: string; category_label: string;
  star_rating?: number | null;
  destination: { name: string; state: { id: string; name: string } | null };
  destination_id: string;
  status: boolean; address?: string | null; images?: string[] | null;
  room_categories?: { id: string }[]; created_at: string;
}

const EMPTY = { hotel_name:'', destination_id:'', hotel_type:'HOTEL', category_label:'STANDARD', star_rating:'3', address:'', hotel_description:'' };
const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor:'#E2E8F0' };
const T     = '#134956';

const CAT_BADGE: Record<string,{bg:string;text:string}> = {
  BUDGET:   {bg:'#F1F5F9',text:'#475569'}, STANDARD:{bg:'#DBEAFE',text:'#1D4ED8'},
  DELUXE:   {bg:'#CCFBF1',text:'#0F766E'}, PREMIUM: {bg:'#EDE9FE',text:'#6D28D9'},
  LUXURY:   {bg:'#FEF3C7',text:'#B45309'},
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'oldest',     label: 'Oldest First' },
  { value: 'name_asc',   label: 'Name A → Z' },
  { value: 'name_desc',  label: 'Name Z → A' },
  { value: 'dest_asc',   label: 'Destination A → Z' },
  { value: 'dest_desc',  label: 'Destination Z → A' },
  { value: 'state_asc',  label: 'State A → Z' },
  { value: 'state_desc', label: 'State Z → A' },
  { value: 'cat_asc',    label: 'Category (Budget first)' },
  { value: 'stars_desc', label: 'Stars (High → Low)' },
  { value: 'rooms_desc', label: 'Most Room Types' },
];

function sortHotels(hotels: Hotel[], key: SortKey): Hotel[] {
  const CAT_ORDER = ['BUDGET','STANDARD','DELUXE','PREMIUM','LUXURY'];
  return [...hotels].sort((a, b) => {
    switch (key) {
      case 'newest':     return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'oldest':     return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'name_asc':   return a.hotel_name.localeCompare(b.hotel_name);
      case 'name_desc':  return b.hotel_name.localeCompare(a.hotel_name);
      case 'dest_asc':   return a.destination.name.localeCompare(b.destination.name);
      case 'dest_desc':  return b.destination.name.localeCompare(a.destination.name);
      case 'state_asc':  return (a.destination.state?.name ?? '').localeCompare(b.destination.state?.name ?? '');
      case 'state_desc': return (b.destination.state?.name ?? '').localeCompare(a.destination.state?.name ?? '');
      case 'cat_asc':    return CAT_ORDER.indexOf(a.category_label) - CAT_ORDER.indexOf(b.category_label);
      case 'stars_desc': return (b.star_rating ?? 0) - (a.star_rating ?? 0);
      case 'rooms_desc': return (b.room_categories?.length ?? 0) - (a.room_categories?.length ?? 0);
      default: return 0;
    }
  });
}

// Rooms filter options
const ROOM_FILTER_OPTS = [
  { value: '0',   label: '0 rooms (no rooms added)' },
  { value: '1',   label: '1 room type' },
  { value: '2',   label: '2 room types' },
  { value: '3+',  label: '3+ room types' },
];

function matchRoomsFilter(hotel: Hotel, filter: string): boolean {
  if (!filter) return true;
  const n = hotel.room_categories?.length ?? 0;
  if (filter === '0')  return n === 0;
  if (filter === '1')  return n === 1;
  if (filter === '2')  return n === 2;
  if (filter === '3+') return n >= 3;
  return true;
}

export default function HotelsPage() {
  const router  = useRouter();
  const [rows, setRows]         = useState<Hotel[]>([]);
  const [dests, setDests]       = useState<Dest[]>([]);
  const [states, setStates]     = useState<State[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({...EMPTY});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [filterType,   setFilterType]   = useState('');
  const [filterStars,  setFilterStars]  = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRooms,  setFilterRooms]  = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo,   setFilterDateTo]   = useState('');
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [showFilters, setShowFilters]   = useState(false);
  const [sortKey, setSortKey]   = useState<SortKey>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // ── Selection ──
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function load() {
    setLoading(true);
    // Fetch ALL hotels (active + inactive) for admin
    const [hr, dr, sr] = await Promise.all([
      fetch('/api/v1/hotels?status=all'),
      fetch('/api/v1/destinations'),
      fetch('/api/v1/states'),
    ]);
    const [hd, dd, sd] = await Promise.all([hr.json(), dr.json(), sr.json()]);
    if (hd.success) setRows(hd.data);
    if (dd.success) setDests(dd.data);
    if (sd.success) setStates(sd.data);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, star_rating: form.star_rating ? Number(form.star_rating) : null };
    const res  = await fetch('/api/v1/hotels',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); }
    else { setShowForm(false); load(); router.push(`/admin/hotels/${data.data.id}`); }
    setSaving(false);
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} hotel${selected.size !== 1 ? 's' : ''}? Hotels used in quotes will be deactivated instead. This cannot be undone.`)) return;
    setBulkDeleting(true);
    const results = await Promise.all(
      Array.from(selected).map(id => fetch(`/api/v1/hotels/${id}`, { method: 'DELETE' }).then(r => r.json()))
    );
    setBulkDeleting(false);
    setSelected(new Set());
    const softCount = results.filter(r => r.data?.soft).length;
    if (softCount > 0) alert(`${softCount} hotel${softCount !== 1 ? 's were' : ' was'} used in quotes and got deactivated instead of deleted.`);
    load();
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Duplicate detection: same name + destination, protect oldest ──
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, { id: string; created_at: string }[]>();
    rows.forEach(r => {
      const k = `${r.hotel_name.trim().toLowerCase()}||${r.destination_id}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ id: r.id, created_at: r.created_at });
    });
    const ids = new Set<string>();
    groups.forEach(arr => {
      if (arr.length > 1) {
        const sorted = [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        sorted.slice(1).forEach(({ id }) => ids.add(id));
      }
    });
    return ids;
  }, [rows]);

  const displayed = useMemo(() => {
    const f = rows.filter(r => {
      const q  = !search || r.hotel_name.toLowerCase().includes(search.toLowerCase()) || r.destination.name.toLowerCase().includes(search.toLowerCase()) || (r.destination.state?.name ?? '').toLowerCase().includes(search.toLowerCase());
      const c  = !catFilter    || r.category_label === catFilter;
      const d  = !destFilter   || r.destination_id === destFilter;
      const st = !stateFilter  || r.destination.state?.id === stateFilter;
      const t  = !filterType   || r.hotel_type === filterType;
      const s  = !filterStars  || r.star_rating === Number(filterStars);
      const ss = !filterStatus || (filterStatus === 'active' ? r.status : !r.status);
      const rm = matchRoomsFilter(r, filterRooms);
      const df = !filterDateFrom || new Date(r.created_at) >= new Date(filterDateFrom);
      const dt = !filterDateTo   || new Date(r.created_at) <= new Date(filterDateTo + 'T23:59:59');
      const dup = !filterDuplicates || duplicateIds.has(r.id);
      return q && c && d && st && t && s && ss && rm && df && dt && dup;
    });
    return sortHotels(f, sortKey);
  }, [rows, search, catFilter, destFilter, stateFilter, filterType, filterStars, filterStatus, filterRooms, filterDateFrom, filterDateTo, filterDuplicates, duplicateIds, sortKey]);

  // Group by destination for destination-based sorts
  const grouped = useMemo(() => {
    if (sortKey !== 'dest_asc' && sortKey !== 'dest_desc' && sortKey !== 'state_asc' && sortKey !== 'state_desc') return null;
    const isState = sortKey === 'state_asc' || sortKey === 'state_desc';
    const map: Record<string, Hotel[]> = {};
    displayed.forEach(h => {
      const k = isState ? (h.destination.state?.name ?? 'Unknown State') : h.destination.name;
      if (!map[k]) map[k] = [];
      map[k].push(h);
    });
    return { map, isState };
  }, [displayed, sortKey]);

  const allDisplayedIds = displayed.map(h => h.id);
  const allSelected = allDisplayedIds.length > 0 && allDisplayedIds.every(id => selected.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); allDisplayedIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(prev => new Set([...Array.from(prev), ...allDisplayedIds]));
    }
  }

  function clearAllFilters() {
    setCatFilter(''); setFilterType(''); setFilterStars(''); setFilterStatus('');
    setFilterRooms(''); setFilterDateFrom(''); setFilterDateTo('');
    setSelected(new Set());
  }

  const activeFilterCount = [catFilter, filterType, filterStars, filterStatus, filterRooms, filterDateFrom || filterDateTo].filter(Boolean).length;

  // Stats for inline badges
  const activeCount  = rows.filter(r => r.status).length;
  const inactiveCount = rows.filter(r => !r.status).length;
  const zeroRooms    = rows.filter(r => (r.room_categories?.length ?? 0) === 0).length;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Hotels"
        subtitle="Manage hotel inventory, room categories and rates"
        crumbs={[{label:'Admin',href:'/admin'},{label:'Hotels'}]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExcelIO
              moduleName="Hotels"
              columns={[
                { key: 'hotel_name',     label: 'Hotel Name *',                                        example: 'The Windermere Hotel' },
                { key: 'destination',    label: 'Destination Name *',                                  example: 'Munnar' },
                { key: 'hotel_type',     label: 'Hotel Type (HOTEL/RESORT/VILLA/HOMESTAY/HOUSEBOAT)',  example: 'RESORT' },
                { key: 'category_label', label: 'Category (BUDGET/STANDARD/DELUXE/PREMIUM/LUXURY)',   example: 'DELUXE' },
                { key: 'star_rating',    label: 'Star Rating (1-5)',                                   example: '4' },
                { key: 'address',        label: 'Address',                                             example: 'Pothamedu, Munnar' },
              ]}
              rows={rows}
              rowMapper={r => ({
                'Hotel Name *': r.hotel_name,
                'Destination Name *': r.destination.name,
                'Hotel Type (HOTEL/RESORT/VILLA/HOMESTAY/HOUSEBOAT)': r.hotel_type,
                'Category (BUDGET/STANDARD/DELUXE/PREMIUM/LUXURY)': r.category_label,
                'Star Rating (1-5)': r.star_rating ?? '',
                'Address': r.address ?? '',
              })}
              importMapper={r => {
                const dest = dests.find(d => d.name.toLowerCase() === (r['Destination Name *'] ?? '').toLowerCase());
                return {
                  hotel_name: r['Hotel Name *'],
                  destination_id: dest?.id ?? undefined,
                  hotel_type: r['Hotel Type (HOTEL/RESORT/VILLA/HOMESTAY/HOUSEBOAT)'] || 'HOTEL',
                  category_label: r['Category (BUDGET/STANDARD/DELUXE/PREMIUM/LUXURY)'] || 'STANDARD',
                  star_rating: r['Star Rating (1-5)'] ? Number(r['Star Rating (1-5)']) : null,
                  address: r['Address'] || undefined,
                };
              }}
              importUrl="/api/v1/hotels"
              onImportDone={load}
            />
            <button onClick={()=>{ setForm({...EMPTY}); setError(''); setShowForm(true); }}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90"
              style={{backgroundColor:T}}>
              <Plus className="w-4 h-4" /> Add Hotel
            </button>
          </div>
        }
      />

      {/* ── Quick stats bar ── */}
      {!loading && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={() => { setFilterStatus(''); setSelected(new Set()); }}
            className="flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold transition-colors"
            style={{ backgroundColor: filterStatus === '' ? '#134956' : '#F1F5F9', color: filterStatus === '' ? 'white' : '#475569' }}>
            All · {rows.length}
          </button>
          <button onClick={() => { setFilterStatus(filterStatus === 'active' ? '' : 'active'); setSelected(new Set()); }}
            className="flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold transition-colors"
            style={{ backgroundColor: filterStatus === 'active' ? '#D1FAE5' : '#F1F5F9', color: filterStatus === 'active' ? '#065F46' : '#475569' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Active · {activeCount}
          </button>
          <button onClick={() => { setFilterStatus(filterStatus === 'inactive' ? '' : 'inactive'); setSelected(new Set()); }}
            className="flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold transition-colors"
            style={{ backgroundColor: filterStatus === 'inactive' ? '#FEE2E2' : '#F1F5F9', color: filterStatus === 'inactive' ? '#991B1B' : '#475569' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
            Inactive · {inactiveCount}
          </button>
          {zeroRooms > 0 && (
            <button onClick={() => { setFilterRooms(filterRooms === '0' ? '' : '0'); setSelected(new Set()); }}
              className="flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold transition-colors"
              style={{ backgroundColor: filterRooms === '0' ? '#FEF3C7' : '#F1F5F9', color: filterRooms === '0' ? '#92400E' : '#475569' }}>
              ⚠ No rooms · {zeroRooms}
            </button>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">

        {/* Select all checkbox */}
        <label className="flex items-center gap-2 h-9 px-3 rounded-lg border bg-white cursor-pointer select-none text-sm font-medium"
          style={{ borderColor: selected.size > 0 ? '#134956' : '#E2E8F0', color: selected.size > 0 ? '#134956' : '#64748B', background: selected.size > 0 ? '#F0F7F9' : '#fff' }}>
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
            checked={allSelected} onChange={toggleSelectAll} />
          {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
        </label>

        {/* Bulk delete */}
        {selected.size > 0 && (
          <button onClick={handleBulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
            <Trash2 className="w-3.5 h-3.5" />
            {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} selected`}
          </button>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
          <input value={search} onChange={e=>{ setSearch(e.target.value); setSelected(new Set()); }} placeholder="Search hotels, destinations, states…"
            className="w-64 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
            style={inpSt} />
        </div>

        {/* Destination filter */}
        <select value={destFilter} onChange={e=>{setDestFilter(e.target.value); setSelected(new Set());}}
          className="h-9 px-3 pr-8 rounded-lg border text-sm focus:outline-none bg-white appearance-none"
          style={{ borderColor: destFilter ? T : '#E2E8F0', color: destFilter ? T : '#64748B', backgroundColor: destFilter ? '#F0F7F9' : '#fff' }}>
          <option value="">All Destinations</option>
          {dests.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-white text-sm" style={inpSt}>
          <ArrowUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />
          <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}
            className="bg-transparent border-none text-sm focus:outline-none appearance-none pr-4" style={{color:'#475569'}}>
            {SORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Duplicates button */}
        {duplicateIds.size > 0 && (
          <button onClick={() => { setFilterDuplicates(p => !p); setSelected(new Set()); }}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: filterDuplicates ? '#FEF2F2' : '#FFF8F8', color: '#DC2626', border: '1px solid #FECACA' }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            {duplicateIds.size} Duplicate{duplicateIds.size !== 1 ? 's' : ''}
          </button>
        )}

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
          <button onClick={()=>setViewMode('grid')} className="flex items-center justify-center w-9 h-9 transition-colors"
            style={{ backgroundColor: viewMode === 'grid' ? T : 'white', color: viewMode === 'grid' ? 'white' : '#94A3B8' }}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={()=>setViewMode('list')} className="flex items-center justify-center w-9 h-9 transition-colors"
            style={{ backgroundColor: viewMode === 'list' ? T : 'white', color: viewMode === 'list' ? 'white' : '#94A3B8' }}>
            <List className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[#94A3B8]">{loading ? 'Loading…' : `${displayed.length} hotel${displayed.length!==1?'s':''}`}</p>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="mb-4 px-4 py-4 rounded-xl space-y-4" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          {/* Row 1 — dropdown filters */}
          <div className="flex items-end gap-4 flex-wrap">
            {/* State filter */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">State</span>
              <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setDestFilter(''); setSelected(new Set()); }}
                className="h-8 px-2 pr-6 rounded-lg border text-xs focus:outline-none bg-white appearance-none min-w-[130px]" style={inpSt}>
                <option value="">All States</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Category, Type, Stars, Status */}
            {[
              { label: 'Category', value: catFilter,    set: setCatFilter,    opts: HOTEL_CATS.map(c  => ({ value: c,           label: c.charAt(0)+c.slice(1).toLowerCase() })) },
              { label: 'Type',     value: filterType,   set: setFilterType,   opts: HOTEL_TYPES.map(t => ({ value: t,           label: t.charAt(0)+t.slice(1).toLowerCase() })) },
              { label: 'Stars',    value: filterStars,  set: setFilterStars,  opts: [1,2,3,4,5].map(n  => ({ value: String(n), label: `${n} Star${n>1?'s':''}` })) },
              { label: 'Status',   value: filterStatus, set: setFilterStatus, opts: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
              { label: 'Rooms',    value: filterRooms,  set: setFilterRooms,  opts: ROOM_FILTER_OPTS },
            ].map(({ label, value, set, opts }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">{label}</span>
                <select value={value} onChange={e => { set(e.target.value); setSelected(new Set()); }}
                  className="h-8 px-2 pr-6 rounded-lg border text-xs focus:outline-none bg-white appearance-none" style={inpSt}>
                  <option value="">All</option>
                  {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}

            {/* Clear button */}
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters}
                className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#E2E8F0] self-end">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          {/* Row 2 — date range */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Created From</span>
              <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setSelected(new Set()); }}
                className="h-8 px-2 rounded-lg border text-xs focus:outline-none bg-white" style={inpSt} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Created To</span>
              <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setSelected(new Set()); }}
                className="h-8 px-2 rounded-lg border text-xs focus:outline-none bg-white" style={inpSt} />
            </div>
            {(filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setSelected(new Set()); }}
                className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#E2E8F0] self-end">
                <X className="w-3 h-3" /> Clear dates
              </button>
            )}
          </div>
        </div>
      )}

      {/* Duplicate quick-action banner */}
      {filterDuplicates && duplicateIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-xl text-sm" style={{ backgroundColor: '#FFF8F8', border: '1px solid #FECACA' }}>
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-[#64748B]">Showing <strong className="text-red-600">{duplicateIds.size} newer copies</strong> — originals (oldest entries) are protected.</span>
          <button onClick={() => { setSelected(new Set(duplicateIds)); }}
            className="ml-auto text-xs font-semibold px-3 py-1 rounded-lg"
            style={{ backgroundColor: '#DC2626', color: 'white' }}>
            Select all {duplicateIds.size}
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:T}} />
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl" style={{border:'1px solid #E2E8F0'}}>
          <Building2 className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-semibold text-sm text-[#0F172A]">No hotels found</p>
          <p className="text-sm mt-1 text-[#64748B]">{search||catFilter||destFilter ? 'Try a different filter' : 'Add your first hotel'}</p>
        </div>
      ) : grouped ? (
        /* ── Grouped view (by destination or state) ── */
        <div className="space-y-6">
          {Object.entries(grouped.map).map(([groupName, hotels]) => (
            <div key={groupName}>
              <div className="flex items-center gap-2 mb-3">
                {grouped.isState && <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{color:T}} />}
                <p className="text-xs font-bold uppercase tracking-wider" style={{color:T}}>{groupName}</p>
                <div className="flex-1 h-px" style={{backgroundColor:'#E2E8F0'}} />
                <span className="text-xs text-[#94A3B8]">{hotels.length} hotel{hotels.length !== 1 ? 's' : ''}</span>
              </div>
              <HotelGrid hotels={hotels} viewMode={viewMode} selected={selected} onToggleSelect={toggleSelect}
                onSelect={id=>router.push(`/admin/hotels/${id}`)} />
            </div>
          ))}
        </div>
      ) : (
        <HotelGrid hotels={displayed} viewMode={viewMode} selected={selected} onToggleSelect={toggleSelect}
          onSelect={id=>router.push(`/admin/hotels/${id}`)} />
      )}

      {/* ── Add Hotel Modal ── */}
      <Modal open={showForm} onClose={()=>setShowForm(false)} title="Add New Hotel" subtitle="Fill in the basic details — you can add rooms and rates after creating." maxWidth="max-w-lg">
        {error && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{backgroundColor:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA'}}>{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={lbl}>Hotel Name <span className="text-red-500">*</span></label>
            <input className={inp} style={inpSt} value={form.hotel_name} onChange={e=>setForm(p=>({...p,hotel_name:e.target.value}))} placeholder="The Leela Palace" />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Destination <span className="text-red-500">*</span></label>
            <select className={sel} style={inpSt} value={form.destination_id} onChange={e=>setForm(p=>({...p,destination_id:e.target.value}))}>
              <option value="">Select destination…</option>
              {dests.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Hotel Type</label>
            <select className={sel} style={inpSt} value={form.hotel_type} onChange={e=>setForm(p=>({...p,hotel_type:e.target.value}))}>
              {HOTEL_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Category</label>
            <select className={sel} style={inpSt} value={form.category_label} onChange={e=>setForm(p=>({...p,category_label:e.target.value}))}>
              {HOTEL_CATS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Star Rating</label>
            <select className={sel} style={inpSt} value={form.star_rating} onChange={e=>setForm(p=>({...p,star_rating:e.target.value}))}>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{n} Star{n>1?'s':''}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Address</label>
            <input className={inp} style={inpSt} value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="Full address" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{borderTop:'1px solid #F1F5F9'}}>
          <button onClick={()=>setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{border:'1px solid #E2E8F0'}}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{backgroundColor:T}}>
            {saving ? 'Creating…' : 'Create & Configure →'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Shared grid/list renderer ── */
function HotelGrid({
  hotels, viewMode, selected, onToggleSelect, onSelect,
}: {
  hotels: Hotel[]; viewMode: 'grid'|'list';
  selected: Set<string>; onToggleSelect: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (viewMode === 'list') {
    return (
      <div className="bg-white rounded-xl overflow-hidden" style={{border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr style={{borderBottom:'1px solid #F1F5F9', backgroundColor:'#F8FAFC'}}>
              <th className="w-10 px-4 py-3" />
              <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Hotel</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Destination</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">State</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Type</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Category</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Stars</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Rooms</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Status</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Created</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {hotels.map((h, i) => {
              const cat = CAT_BADGE[h.category_label] ?? CAT_BADGE.STANDARD;
              const isSelected = selected.has(h.id);
              const roomCount = h.room_categories?.length ?? 0;
              return (
                <tr key={h.id} className="transition-colors hover:bg-[#F8FAFC]"
                  style={{ borderBottom: i < hotels.length-1 ? '1px solid #F1F5F9' : undefined, backgroundColor: isSelected ? '#F0F7F9' : undefined }}>
                  <td className="px-4 py-3.5 w-10" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
                      checked={isSelected} onChange={() => onToggleSelect(h.id)} />
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-[#0F172A] cursor-pointer" onClick={()=>onSelect(h.id)}>{h.hotel_name}</td>
                  <td className="px-4 py-3.5 text-[#475569] cursor-pointer" onClick={()=>onSelect(h.id)}>{h.destination.name}</td>
                  <td className="px-4 py-3.5 text-[#64748B] cursor-pointer text-xs" onClick={()=>onSelect(h.id)}>{h.destination.state?.name ?? '—'}</td>
                  <td className="px-4 py-3.5 text-[#64748B] cursor-pointer" onClick={()=>onSelect(h.id)}>{h.hotel_type}</td>
                  <td className="px-4 py-3.5 cursor-pointer" onClick={()=>onSelect(h.id)}>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{backgroundColor:cat.bg,color:cat.text}}>{h.category_label}</span>
                  </td>
                  <td className="px-4 py-3.5 cursor-pointer" onClick={()=>onSelect(h.id)}>
                    {h.star_rating ? (
                      <div className="flex gap-0.5">
                        {Array.from({length:h.star_rating}).map((_,idx)=><Star key={idx} className="w-3 h-3 fill-current text-amber-400" />)}
                      </div>
                    ) : <span className="text-[#CBD5E1]">—</span>}
                  </td>
                  <td className="px-4 py-3.5 cursor-pointer" onClick={()=>onSelect(h.id)}>
                    <span className={`text-xs font-medium ${roomCount === 0 ? 'text-amber-600' : 'text-[#64748B]'}`}>
                      {roomCount === 0 ? '⚠ 0' : roomCount}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 cursor-pointer" onClick={()=>onSelect(h.id)}>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: h.status ? '#D1FAE5' : '#FEE2E2', color: h.status ? '#065F46' : '#991B1B' }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${h.status ? 'bg-emerald-500' : 'bg-red-400'}`} />
                      {h.status ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[#64748B] text-xs">{new Date(h.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3.5 cursor-pointer" onClick={()=>onSelect(h.id)}><ChevronRight className="w-4 h-4 text-[#CBD5E1]" /></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    );
  }

  /* ── Grid view ── */
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {hotels.map(h=>{
        const cat  = CAT_BADGE[h.category_label] ?? CAT_BADGE.STANDARD;
        const hero = h.images?.[0];
        const roomCount = h.room_categories?.length ?? 0;
        const isSelected = selected.has(h.id);
        return (
          <div key={h.id}
            className="bg-white rounded-2xl overflow-hidden group transition-all hover:-translate-y-0.5 relative"
            style={{border: isSelected ? '2px solid #134956' : '1px solid #E2E8F0', boxShadow: isSelected ? '0 0 0 3px rgba(19,73,86,0.1)' : '0 1px 3px rgba(0,0,0,0.06)', opacity: h.status ? 1 : 0.65}}>

            {/* Checkbox overlay */}
            <div className="absolute top-2 left-2 z-10" onClick={e => e.stopPropagation()}>
              <input type="checkbox"
                className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer shadow-sm"
                checked={isSelected} onChange={() => onToggleSelect(h.id)} />
            </div>

            {/* Status badge */}
            {!h.status && (
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{backgroundColor:'#FEE2E2', color:'#991B1B'}}>
                Inactive
              </div>
            )}

            {/* Card body — click to open */}
            <div className="cursor-pointer" onClick={()=>onSelect(h.id)}>
              <div className="aspect-video bg-[#F1F5F9] relative overflow-hidden">
                {hero ? (
                  <Image src={hero} alt={h.hotel_name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Building2 className="w-8 h-8 text-[#CBD5E1]" /></div>
                )}
                {h.status && (
                  <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{backgroundColor:cat.bg, color:cat.text}}>{h.category_label}</span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-sm text-[#0F172A] leading-tight line-clamp-1">{h.hotel_name}</p>
                  <ChevronRight className="w-4 h-4 flex-shrink-0 text-[#CBD5E1] group-hover:text-[#134956] transition-colors mt-0.5" />
                </div>
                <p className="text-xs text-[#94A3B8] mb-1">{h.destination.name} · {h.hotel_type}</p>
                {h.destination.state && (
                  <p className="text-[10px] text-[#CBD5E1] mb-2 flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" />{h.destination.state.name}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  {h.star_rating ? (
                    <div className="flex items-center gap-0.5">
                      {Array.from({length:h.star_rating}).map((_,i)=><Star key={i} className="w-3 h-3 fill-current text-amber-400" />)}
                    </div>
                  ) : null}
                  <span className={`text-[11px] ${roomCount === 0 ? 'text-amber-500 font-semibold' : 'text-[#94A3B8]'}`}>
                    {roomCount === 0 ? '⚠ no rooms' : `${roomCount} room type${roomCount!==1?'s':''}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
