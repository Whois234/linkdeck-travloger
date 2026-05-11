'use client';
import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

interface State { id: string; name: string; country: string; code: string; trip_id_prefix: string; description?: string | null; status: boolean; created_at: string }
type SortKey = 'name_az' | 'name_za' | 'code_az' | 'created_desc' | 'created_asc';
const EMPTY = { name: '', country: 'India', code: '', trip_id_prefix: '', description: '' };

const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name_az',      label: 'Name A → Z' },
  { value: 'name_za',      label: 'Name Z → A' },
  { value: 'code_az',      label: 'Code A → Z' },
  { value: 'created_desc', label: 'Newest Added' },
  { value: 'created_asc',  label: 'Oldest Added' },
];

export default function StatesPage() {
  const [rows, setRows] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<State | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Filters ──
  const [filterStatus,     setFilterStatus]     = useState('');
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [showFilters,      setShowFilters]      = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/v1/states'); const d = await r.json();
    if (d.success) setRows(Array.isArray(d.data) ? d.data : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: State) { setEditing(r); setForm({ name: r.name, country: r.country, code: r.code, trip_id_prefix: r.trip_id_prefix, description: r.description ?? '' }); setError(''); setShowForm(true); }

  async function handleSave() {
    setSaving(true); setError('');
    const url = editing ? `/api/v1/states/${editing.id}` : '/api/v1/states';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this state?')) return;
    setDeleting(id); await fetch(`/api/v1/states/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Deactivate ${selected.size} selected item${selected.size !== 1 ? 's' : ''}?`)) return;
    setBulkDeleting(true);
    await Promise.all(Array.from(selected).map(id => fetch(`/api/v1/states/${id}`, { method: 'DELETE' })));
    setBulkDeleting(false);
    setSelected(new Set());
    load();
  }

  function resetPage() { setCurrentPage(1); setSelected(new Set()); }
  function clearFilters() { setFilterStatus(''); setFilterDuplicates(false); setSearch(''); resetPage(); }

  // ── duplicate detection ──
  const duplicateIds = useMemo(() => {
    const dupKey = (r: State) => `${r.name.trim().toLowerCase()}||${r.code.trim().toLowerCase()}`;
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
      arr = arr.filter(r => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    }
    if (filterStatus === 'active')   arr = arr.filter(r =>  r.status);
    if (filterStatus === 'inactive') arr = arr.filter(r => !r.status);
    if (filterDuplicates) arr = arr.filter(r => duplicateIds.has(r.id));
    switch (sortKey) {
      case 'name_az':      arr.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name_za':      arr.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'code_az':      arr.sort((a, b) => a.code.localeCompare(b.code)); break;
      case 'created_desc': arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case 'created_asc':  arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
    }
    return arr;
  }, [rows, search, filterStatus, filterDuplicates, duplicateIds, sortKey]);

  const totalPages = Math.ceil(processed.length / pageSize);
  const paginated = processed.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilterCount = [filterStatus, filterDuplicates ? 'dup' : ''].filter(Boolean).length;

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="States" subtitle="Manage travel states and regions" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'States' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExcelIO
              moduleName="States"
              columns={[
                { key: 'name', label: 'State Name *', example: 'Kerala' },
                { key: 'country', label: 'Country', example: 'India' },
                { key: 'code', label: 'Code *', example: 'KER' },
                { key: 'trip_id_prefix', label: 'Trip ID Prefix', example: 'TRV-KER' },
                { key: 'description', label: 'Description', example: 'Coastal state in South India' },
              ]}
              rows={rows}
              rowMapper={r => ({ 'State Name *': r.name, 'Country': r.country, 'Code *': r.code, 'Trip ID Prefix': r.trip_id_prefix, 'Description': r.description ?? '' })}
              importMapper={r => ({ name: r['State Name *'], country: r['Country'] || 'India', code: r['Code *'], trip_id_prefix: r['Trip ID Prefix'] || undefined, description: r['Description'] || undefined })}
              importUrl="/api/v1/states"
              onImportDone={load}
            />
            <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}>
              <Plus className="w-4 h-4" /> Add State
            </button>
          </div>
        }
      />

      {/* Form */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit State' : 'Add New State'} subtitle="Fill in the state details below">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={lbl} style={lblStyle}>State Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Kerala" /></div>
            <div><label className={lbl} style={lblStyle}>Country</label><input className={inp} style={inpStyle} value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} placeholder="India" /></div>
            <div><label className={lbl} style={lblStyle}>Code <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="KER" /></div>
            <div><label className={lbl} style={lblStyle}>Trip ID Prefix</label><input className={inp} style={inpStyle} value={form.trip_id_prefix} onChange={e => setForm(p => ({ ...p, trip_id_prefix: e.target.value }))} placeholder="TRV-KER" /></div>
            <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Description</label>
              <textarea rows={2} className="w-full px-3 py-2.5 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors resize-none" style={inpStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description…" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>
              {saving ? 'Saving…' : editing ? 'Update State' : 'Add State'}
            </button>
          </div>
      </Modal>

      {/* Table Card */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>

        {/* ── Toolbar row ── */}
        <div className="px-5 py-3.5 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid #F1F5F9' }}>

          {/* left: count + bulk delete */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <p className="text-sm font-semibold whitespace-nowrap" style={{ color: '#64748B' }}>
              {loading ? 'Loading…' : `${processed.length} state${processed.length !== 1 ? 's' : ''}`}
              {activeFilterCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#134956', color: '#fff' }}>{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}</span>}
            </p>
            {filterDuplicates && duplicateIds.size > 0 && selected.size === 0 && (
              <button
                onClick={() => setSelected(new Set(Array.from(duplicateIds)))}
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

          {/* right: search + sort + page size + filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); resetPage(); }}
                placeholder="Search states…"
                className="w-52 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                style={{ borderColor: '#E2E8F0' }}
              />
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
              <button
                onClick={() => { setFilterDuplicates(v => !v); resetPage(); }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  border: '1px solid ' + (filterDuplicates ? '#DC2626' : '#FECACA'),
                  color:  filterDuplicates ? '#DC2626' : '#B45309',
                  background: filterDuplicates ? '#FEF2F2' : '#FEF9C3',
                }}
                title="Show only duplicate states">
                <span className="text-base leading-none">⚠</span>
                {duplicateIds.size} Duplicates
              </button>
            )}
            <button
              onClick={() => setShowFilters(v => !v)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors"
              style={{
                border: '1px solid ' + (activeFilterCount ? '#134956' : '#E2E8F0'),
                color:  activeFilterCount ? '#134956' : '#64748B',
                background: activeFilterCount ? '#F0F7F9' : '#fff',
              }}>
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
              {filterStatus && <Chip label={`Status: ${filterStatus}`} onRemove={() => { setFilterStatus(''); resetPage(); }} />}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" />
          </div>
        ) : processed.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No states found</p>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>
              {activeFilterCount || search ? <button onClick={clearFilters} className="underline" style={{ color: '#134956' }}>Clear filters</button> : 'Add your first state to get started'}
            </p>
          </div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th className="px-5 py-3.5 w-10">
                  <input type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
                    checked={paginated.length > 0 && paginated.every(r => selected.has(r.id))}
                    onChange={e => {
                      if (e.target.checked) setSelected(prev => new Set([...Array.from(prev), ...paginated.map(r => r.id)]));
                      else setSelected(prev => { const n = new Set(prev); paginated.forEach(r => n.delete(r.id)); return n; });
                    }}
                  />
                </th>
                {['Name', 'Country', 'Code', 'Prefix', 'Status', 'Created By', 'Created', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map(r => {
                const isDup = duplicateIds.has(r.id);
                return (
                  <tr key={r.id}
                    className={`transition-colors ${isDup ? 'hover:bg-[#FFF1F1]' : 'hover:bg-[#F8FAFC]'}`}
                    style={{ borderBottom: '1px solid #F1F5F9', height: '56px', backgroundColor: isDup ? '#FFF8F8' : undefined }}>
                    <td className="px-5 py-0 w-10">
                      <input type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
                        checked={selected.has(r.id)}
                        onChange={e => setSelected(prev => {
                          const n = new Set(prev);
                          e.target.checked ? n.add(r.id) : n.delete(r.id);
                          return n;
                        })}
                      />
                    </td>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>
                      <div className="flex items-center gap-1.5">
                        {isDup && <span className="text-[10px] text-red-500 flex-shrink-0" title="Duplicate state">⚠</span>}
                        {r.name}
                      </div>
                    </td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.country}</td>
                    <td className="px-5 py-0"><span className="font-mono text-xs font-bold px-2 py-1 rounded-md" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{r.code}</span></td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.trip_id_prefix}</td>
                    <td className="px-5 py-0">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>
                        {r.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>Admin</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>
                      {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-0">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" title="Edit" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#134956')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#FEF2F2] disabled:opacity-40" title="Delete" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
              <p className="text-xs" style={{ color: '#94A3B8' }}>
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, processed.length)} of {processed.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#F1F5F9] transition-colors"
                  style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>← Prev</button>
                <span className="text-xs px-2" style={{ color: '#64748B' }}>Page {currentPage} of {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#F1F5F9] transition-colors"
                  style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Next →</button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
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
