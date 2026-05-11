'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search, X, Phone, Mail, MapPin, User, Building2, ChevronDown, SlidersHorizontal } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

const SUPPLIER_TYPES = ['HOTEL', 'VEHICLE', 'ACTIVITY', 'DMC', 'OTHER'];
interface City { id: string; name: string; state: { name: string } }
interface Supplier {
  id: string; name: string; supplier_type: string;
  contact_person?: string | null; phone?: string | null;
  email?: string | null; address?: string | null;
  status: boolean; created_at: string;
}
type SortKey = 'name_az' | 'name_za' | 'type_az' | 'created_desc' | 'created_asc';
const EMPTY = { name: '', supplier_type: 'HOTEL', contact_person: '', phone: '', email: '', address: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  HOTEL:    { bg: '#DBEAFE', text: '#1D4ED8' },
  VEHICLE:  { bg: '#CCFBF1', text: '#0F766E' },
  ACTIVITY: { bg: '#DCFCE7', text: '#15803D' },
  DMC:      { bg: '#EDE9FE', text: '#6D28D9' },
  OTHER:    { bg: '#F1F5F9', text: '#475569' },
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name_az',      label: 'Name A → Z' },
  { value: 'name_za',      label: 'Name Z → A' },
  { value: 'type_az',      label: 'Type A → Z' },
  { value: 'created_desc', label: 'Newest Added' },
  { value: 'created_asc',  label: 'Oldest Added' },
];

export default function SuppliersPage() {
  const [rows, setRows]             = useState<Supplier[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<Supplier | null>(null);
  const [form, setForm]             = useState({ ...EMPTY });
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [sortKey, setSortKey]       = useState<SortKey>('created_desc');
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [pageSize, setPageSize]     = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [detail, setDetail]         = useState<Supplier | null>(null);

  // City combobox state
  const [cities, setCities]         = useState<City[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [cityOpen, setCityOpen]     = useState(false);
  const cityRef                     = useRef<HTMLDivElement>(null);

  // ── Filters ──
  const [filterType,       setFilterType]       = useState('');
  const [filterStatus,     setFilterStatus]     = useState('');
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [showFilters,      setShowFilters]      = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/v1/suppliers');
    const d = await r.json();
    if (d.success) setRows(Array.isArray(d.data) ? d.data : []);
    setLoading(false);
  }
  async function loadCities() {
    const r = await fetch('/api/v1/cities');
    const d = await r.json();
    if (d.success) setCities(Array.isArray(d.data) ? d.data : []);
  }
  useEffect(() => { load(); loadCities(); }, []);

  // Close city dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setCitySearch(''); setCityOpen(false); setError(''); setShowForm(true); }
  function openEdit(r: Supplier) {
    setEditing(r);
    setForm({ name: r.name, supplier_type: r.supplier_type, contact_person: r.contact_person ?? '', phone: r.phone ?? '', email: r.email ?? '', address: r.address ?? '' });
    setCitySearch(''); setCityOpen(false);
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, contact_person: form.contact_person || null, phone: form.phone || null, email: form.email || null, address: form.address || null };
    const url = editing ? `/api/v1/suppliers/${editing.id}` : '/api/v1/suppliers';
    const res  = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this supplier?')) return;
    setDeleting(id); await fetch(`/api/v1/suppliers/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Deactivate ${selected.size} selected item${selected.size !== 1 ? 's' : ''}?`)) return;
    setBulkDeleting(true);
    await Promise.all(Array.from(selected).map(id => fetch(`/api/v1/suppliers/${id}`, { method: 'DELETE' })));
    setBulkDeleting(false); setSelected(new Set()); load();
  }

  function resetPage() { setCurrentPage(1); setSelected(new Set()); }
  function clearFilters() { setFilterType(''); setFilterStatus(''); setFilterDuplicates(false); setSearch(''); resetPage(); }

  // ── duplicate detection ──
  const duplicateIds = useMemo(() => {
    const dupKey = (r: Supplier) => `${r.name.trim().toLowerCase()}`;
    const groups = new Map<string, { id: string; created_at: string }[]>();
    rows.forEach(r => {
      const k = dupKey(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ id: r.id, created_at: r.created_at });
    });
    const ids = new Set<string>();
    groups.forEach(arr => {
      if (arr.length > 1) {
        // Sort oldest → newest; protect the oldest, flag the rest
        const sorted = [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        sorted.slice(1).forEach(({ id }) => ids.add(id));
      }
    });
    return ids;
  }, [rows]);

  // ── filter + sort pipeline ──
  const processed = useMemo(() => {
    let arr = [...rows];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(r => r.name.toLowerCase().includes(q) || r.supplier_type.toLowerCase().includes(q));
    }
    if (filterType)  arr = arr.filter(r => r.supplier_type === filterType);
    if (filterStatus === 'active')   arr = arr.filter(r =>  r.status);
    if (filterStatus === 'inactive') arr = arr.filter(r => !r.status);
    if (filterDuplicates) arr = arr.filter(r => duplicateIds.has(r.id));
    switch (sortKey) {
      case 'name_az':      arr.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name_za':      arr.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'type_az':      arr.sort((a, b) => a.supplier_type.localeCompare(b.supplier_type)); break;
      case 'created_desc': arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case 'created_asc':  arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
    }
    return arr;
  }, [rows, search, filterType, filterStatus, filterDuplicates, duplicateIds, sortKey]);

  const totalPages = Math.ceil(processed.length / pageSize);
  const paginated  = processed.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilterCount = [filterType, filterStatus, filterDuplicates ? 'dup' : ''].filter(Boolean).length;

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Suppliers" subtitle="Manage hotel, vehicle and activity suppliers" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Suppliers' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExcelIO
              moduleName="Suppliers"
              columns={[
                { key: 'name',           label: 'Supplier Name *',                         example: 'Ratan Hotels Pvt Ltd' },
                { key: 'supplier_type',  label: 'Type * (HOTEL/VEHICLE/ACTIVITY/DMC/OTHER)', example: 'HOTEL' },
                { key: 'contact_person', label: 'Contact Person',                           example: 'John Doe' },
                { key: 'phone',          label: 'Phone',                                   example: '+91 98765 43210' },
                { key: 'email',          label: 'Email',                                   example: 'supplier@email.com' },
                { key: 'address',        label: 'City',                                    example: 'Munnar, Kerala' },
              ]}
              rows={rows}
              rowMapper={r => ({ 'Supplier Name *': r.name, 'Type * (HOTEL/VEHICLE/ACTIVITY/DMC/OTHER)': r.supplier_type, 'Contact Person': r.contact_person ?? '', 'Phone': r.phone ?? '', 'Email': r.email ?? '', 'City': r.address ?? '' })}
              importMapper={r => ({ name: r['Supplier Name *'], supplier_type: r['Type * (HOTEL/VEHICLE/ACTIVITY/DMC/OTHER)'] || 'OTHER', contact_person: r['Contact Person'] || null, phone: r['Phone'] || null, email: r['Email'] || null, address: r['City'] || null })}
              importUrl="/api/v1/suppliers"
              onImportDone={load}
            />
            <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Supplier</button>
          </div>
        }
      />

      {/* ── Add / Edit Modal ── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Supplier' : 'Add New Supplier'} subtitle="Fill in the supplier details">
        {error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={lbl} style={lblStyle}>Supplier Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ratan Hotels Pvt Ltd" /></div>
          <div><label className={lbl} style={lblStyle}>Type <span style={{ color: '#EF4444' }}>*</span></label>
            <select className={sel} style={inpStyle} value={form.supplier_type} onChange={e => setForm(p => ({ ...p, supplier_type: e.target.value }))}>
              {SUPPLIER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className={lbl} style={lblStyle}>Contact Person</label><input className={inp} style={inpStyle} value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} placeholder="John Doe" /></div>
          <div><label className={lbl} style={lblStyle}>Phone</label><input className={inp} style={inpStyle} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
          <div><label className={lbl} style={lblStyle}>Email</label><input type="email" className={inp} style={inpStyle} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="supplier@email.com" /></div>

          {/* City combobox */}
          <div ref={cityRef} className="relative">
            <label className={lbl} style={lblStyle}>City / Location</label>
            <div
              className="w-full h-10 px-3 rounded-lg border text-sm bg-white flex items-center justify-between cursor-pointer focus-within:ring-2 focus-within:ring-[#134956]/10 transition-colors"
              style={{ borderColor: '#E2E8F0' }}
              onClick={() => { setCityOpen(o => !o); setCitySearch(''); }}
            >
              <span style={{ color: form.address ? '#0F172A' : '#94A3B8' }}>
                {form.address || 'Select a city…'}
              </span>
              <div className="flex items-center gap-1">
                {form.address && (
                  <button type="button" onClick={e => { e.stopPropagation(); setForm(p => ({ ...p, address: '' })); setCityOpen(false); }}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#94A3B8' }}>
                    <X className="w-3 h-3" />
                  </button>
                )}
                <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#94A3B8' }} />
              </div>
            </div>
            {cityOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border shadow-xl overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
                <div className="px-2 pt-2 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                    <input autoFocus value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="Search cities…"
                      className="w-full h-8 pl-8 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none bg-[#F8FAFC]"
                      style={{ borderColor: '#E2E8F0' }} onClick={e => e.stopPropagation()} />
                  </div>
                </div>
                <ul className="max-h-52 overflow-y-auto py-1">
                  {cities.filter(c => !citySearch || c.name.toLowerCase().includes(citySearch.toLowerCase()) || c.state.name.toLowerCase().includes(citySearch.toLowerCase())).map(c => (
                    <li key={c.id} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#F0F7F9] transition-colors text-sm"
                      style={{ color: form.address === c.name ? '#134956' : '#0F172A' }}
                      onClick={() => { setForm(p => ({ ...p, address: c.name })); setCityOpen(false); setCitySearch(''); }}>
                      <span className={form.address === c.name ? 'font-semibold' : ''}>{c.name}</span>
                      <span className="text-xs ml-2 flex-shrink-0" style={{ color: '#94A3B8' }}>{c.state.name}</span>
                    </li>
                  ))}
                  {cities.filter(c => !citySearch || c.name.toLowerCase().includes(citySearch.toLowerCase()) || c.state.name.toLowerCase().includes(citySearch.toLowerCase())).length === 0 && (
                    <li className="px-3 py-3 text-sm text-center" style={{ color: '#94A3B8' }}>No cities found</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Supplier'}</button>
        </div>
      </Modal>

      {/* ── Detail popup ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-start justify-between" style={{ background: '#F0F7F9', borderBottom: '1px solid #E2E8F0' }}>
              <div>
                <p className="font-bold text-base" style={{ color: '#0F172A' }}>{detail.name}</p>
                <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-md text-xs font-semibold"
                  style={{ backgroundColor: (TYPE_BADGE[detail.supplier_type] ?? TYPE_BADGE.OTHER).bg, color: (TYPE_BADGE[detail.supplier_type] ?? TYPE_BADGE.OTHER).text }}>
                  {detail.supplier_type}
                </span>
              </div>
              <button onClick={() => setDetail(null)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white transition-colors" style={{ color: '#94A3B8' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { icon: <User className="w-4 h-4" />,      label: 'Contact', value: detail.contact_person },
                { icon: <Phone className="w-4 h-4" />,     label: 'Phone',   value: detail.phone },
                { icon: <Mail className="w-4 h-4" />,      label: 'Email',   value: detail.email },
                { icon: <MapPin className="w-4 h-4" />,    label: 'City',    value: detail.address },
                { icon: <Building2 className="w-4 h-4" />, label: 'Status',  value: detail.status ? 'Active' : 'Inactive' },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0" style={{ color: '#94A3B8' }}>{icon}</span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{label}</p>
                    <p className="text-sm" style={{ color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0" style={{ color: '#94A3B8' }}><Building2 className="w-4 h-4" /></span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Added</p>
                  <p className="text-sm" style={{ color: '#0F172A' }}>
                    {new Date(detail.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 flex gap-2" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => { setDetail(null); openEdit(detail); }}
                className="flex-1 h-9 rounded-lg text-sm font-semibold transition-colors hover:opacity-90 flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#134956', color: '#fff' }}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => setDetail(null)}
                className="flex-1 h-9 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F1F5F9]"
                style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>

        {/* ── Toolbar row ── */}
        <div className="px-5 py-3.5 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <p className="text-sm font-semibold whitespace-nowrap" style={{ color: '#64748B' }}>
              {loading ? 'Loading…' : `${processed.length} supplier${processed.length !== 1 ? 's' : ''}`}
              {activeFilterCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#134956', color: '#fff' }}>{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}</span>}
            </p>
            {filterDuplicates && duplicateIds.size > 0 && selected.size === 0 && (
              <button onClick={() => setSelected(new Set(Array.from(duplicateIds)))}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: '#FEF9C3', color: '#B45309', border: '1px solid #FDE68A' }}>
                Select all {duplicateIds.size} duplicates
              </button>
            )}
            {selected.size > 0 && (
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} selected`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Search suppliers…"
                className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                style={{ borderColor: '#E2E8F0' }} />
            </div>
            <div className="relative">
              <select value={sortKey} onChange={e => { setSortKey(e.target.value as SortKey); resetPage(); }}
                className="h-9 pl-3 pr-8 rounded-lg border text-sm font-medium focus:outline-none bg-white appearance-none"
                style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            </div>
            <div className="relative">
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); resetPage(); }}
                className="h-9 pl-3 pr-8 rounded-lg border text-sm focus:outline-none bg-white appearance-none"
                style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            </div>
            {duplicateIds.size > 0 && (
              <button onClick={() => { setFilterDuplicates(v => !v); resetPage(); }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors"
                style={{ border: '1px solid ' + (filterDuplicates ? '#DC2626' : '#FECACA'), color: filterDuplicates ? '#DC2626' : '#B45309', background: filterDuplicates ? '#FEF2F2' : '#FEF9C3' }}>
                <span className="text-base leading-none">⚠</span>
                {duplicateIds.size} Duplicates
              </button>
            )}
            <button onClick={() => setShowFilters(v => !v)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors"
              style={{ border: '1px solid ' + (activeFilterCount ? '#134956' : '#E2E8F0'), color: activeFilterCount ? '#134956' : '#64748B', background: activeFilterCount ? '#F0F7F9' : '#fff' }}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: '#134956', color: '#fff' }}>{activeFilterCount}</span>}
            </button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        {showFilters && (
          <div className="px-5 py-3 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wider mr-1" style={{ color: '#94A3B8' }}>Filter by</span>
            <FilterSelect label="Type" value={filterType} onChange={v => { setFilterType(v); resetPage(); }} options={SUPPLIER_TYPES} placeholder="All Types" />
            <div className="relative">
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); resetPage(); }}
                className="h-8 pl-3 pr-7 rounded-lg border text-xs font-medium focus:outline-none bg-white appearance-none cursor-pointer"
                style={{ borderColor: filterStatus ? '#134956' : '#E2E8F0', color: filterStatus ? '#134956' : '#64748B', backgroundColor: filterStatus ? '#F0F7F9' : '#fff' }}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#94A3B8' }} />
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-red-50"
                style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
            <div className="flex flex-wrap gap-1.5 ml-1">
              {filterType   && <Chip label={`Type: ${filterType}`}     onRemove={() => { setFilterType('');   resetPage(); }} />}
              {filterStatus && <Chip label={`Status: ${filterStatus}`} onRemove={() => { setFilterStatus(''); resetPage(); }} />}
            </div>
          </div>
        )}

        {loading
          ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : processed.length === 0
            ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No suppliers found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{activeFilterCount || search ? <button onClick={clearFilters} className="underline" style={{ color: '#134956' }}>Clear filters</button> : 'Add your first supplier'}</p></div>
            : <>
              <table className="w-full text-sm">
                <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th className="px-5 py-3.5 w-10">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
                      checked={paginated.length > 0 && paginated.every(r => selected.has(r.id))}
                      onChange={e => {
                        if (e.target.checked) setSelected(prev => new Set([...Array.from(prev), ...paginated.map(r => r.id)]));
                        else setSelected(prev => { const n = new Set(prev); paginated.forEach(r => n.delete(r.id)); return n; });
                      }} />
                  </th>
                  {['Name', 'Type', 'Contact', 'Phone', 'City', 'Status', 'Created By', 'Created', ''].map(h =>
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {paginated.map(r => {
                    const badge = TYPE_BADGE[r.supplier_type] ?? TYPE_BADGE.OTHER;
                    const isDup = duplicateIds.has(r.id);
                    return (
                      <tr key={r.id} className={`transition-colors ${isDup ? 'hover:bg-[#FFF1F1]' : 'hover:bg-[#F8FAFC]'}`}
                        style={{ borderBottom: '1px solid #F1F5F9', height: '56px', backgroundColor: isDup ? '#FFF8F8' : undefined }}>
                        <td className="px-5 py-0 w-10">
                          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
                            checked={selected.has(r.id)}
                            onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} />
                        </td>
                        <td className="px-5 py-0">
                          <div className="flex items-center gap-1.5">
                            {isDup && <span className="text-[10px] text-red-500 flex-shrink-0" title="Duplicate supplier">⚠</span>}
                            <button onClick={() => setDetail(r)}
                              className="font-semibold text-left hover:underline underline-offset-2 transition-colors"
                              style={{ color: '#134956' }}>
                              {r.name}
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>{r.supplier_type}</span></td>
                        <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.contact_person ?? '—'}</td>
                        <td className="px-5 py-0 text-sm font-mono" style={{ color: '#64748B' }}>{r.phone ?? '—'}</td>
                        <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.address ?? '—'}</td>
                        <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>{r.status ? 'Active' : 'Inactive'}</span></td>
                        <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>Admin</td>
                        <td className="px-5 py-0 text-sm whitespace-nowrap" style={{ color: '#64748B' }}>
                          {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-0"><div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#134956')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#FEF2F2] disabled:opacity-40" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, processed.length)} of {processed.length}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#F1F5F9] transition-colors" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>← Prev</button>
                    <span className="text-xs px-2" style={{ color: '#64748B' }}>Page {currentPage} of {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#F1F5F9] transition-colors" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Next →</button>
                  </div>
                </div>
              )}
            </>}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-8 pl-3 pr-7 rounded-lg border text-xs font-medium focus:outline-none bg-white appearance-none cursor-pointer"
        style={{ borderColor: value ? '#134956' : '#E2E8F0', color: value ? '#134956' : '#64748B', backgroundColor: value ? '#F0F7F9' : '#fff' }}
        title={label}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#94A3B8' }} />
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#E0F2F7', color: '#134956' }}>
      {label}
      <button onClick={onRemove} className="hover:opacity-70 transition-opacity ml-0.5"><X className="w-3 h-3" /></button>
    </span>
  );
}
