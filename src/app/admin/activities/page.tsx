'use client';
import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

const RATE_TYPES = ['PER_PERSON', 'PER_GROUP'];
interface Dest { id: string; name: string }
interface Activity { id: string; activity_name: string; activity_type?: string | null; duration?: string | null; description?: string | null; adult_cost: number; child_cost?: number | null; rate_type: string; destination: { name: string }; destination_id: string; status: boolean; created_at: string }
type SortKey = 'newest' | 'oldest' | 'az' | 'za' | 'dest_az';
const EMPTY = { destination_id: '', activity_name: '', activity_type: '', duration: '', description: '', adult_cost: '', child_cost: '', rate_type: 'PER_PERSON' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const textarea = 'w-full px-3 py-2.5 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors resize-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function ActivitiesPage() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [dests, setDests] = useState<Dest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [ar, dr] = await Promise.all([fetch('/api/v1/activities'), fetch('/api/v1/destinations')]);
    const [ad, dd] = await Promise.all([ar.json(), dr.json()]);
    if (ad.success) setRows(ad.data);
    if (dd.success) setDests(dd.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Activity) { setEditing(r); setForm({ destination_id: r.destination_id, activity_name: r.activity_name, activity_type: r.activity_type ?? '', duration: r.duration ?? '', description: '', adult_cost: r.adult_cost.toString(), child_cost: r.child_cost?.toString() ?? '', rate_type: r.rate_type }); setError(''); setShowForm(true); }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, adult_cost: Number(form.adult_cost), child_cost: form.child_cost ? Number(form.child_cost) : null };
    const url = editing ? `/api/v1/activities/${editing.id}` : '/api/v1/activities';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this activity?')) return;
    setDeleting(id); await fetch(`/api/v1/activities/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Deactivate ${selected.size} selected item${selected.size !== 1 ? 's' : ''}?`)) return;
    setBulkDeleting(true);
    await Promise.all(Array.from(selected).map(id => fetch(`/api/v1/activities/${id}`, { method: 'DELETE' })));
    setBulkDeleting(false);
    setSelected(new Set());
    load();
  }

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortKey === 'newest') arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortKey === 'oldest') arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (sortKey === 'az') arr.sort((a, b) => a.activity_name.localeCompare(b.activity_name));
    else if (sortKey === 'za') arr.sort((a, b) => b.activity_name.localeCompare(a.activity_name));
    else if (sortKey === 'dest_az') arr.sort((a, b) => a.destination.name.localeCompare(b.destination.name));
    return arr;
  }, [rows, sortKey]);

  const filtered = sorted.filter(r => !search || r.activity_name.toLowerCase().includes(search.toLowerCase()) || r.destination.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Activities" subtitle="Manage sightseeing and experience activities" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Activities' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExcelIO
              moduleName="Activities"
              columns={[
                { key: 'destination', label: 'Destination Name *', example: 'Munnar' },
                { key: 'activity_name', label: 'Activity Name *', example: 'Boat Ride' },
                { key: 'activity_type', label: 'Activity Type', example: 'Adventure' },
                { key: 'duration', label: 'Duration', example: '2 hrs' },
                { key: 'adult_cost', label: 'Adult Cost (₹) *', example: '500' },
                { key: 'child_cost', label: 'Child Cost (₹)', example: '300' },
                { key: 'rate_type', label: 'Rate Type (PER_PERSON/PER_GROUP)', example: 'PER_PERSON' },
                { key: 'description', label: 'Description', example: 'Scenic boat ride through backwaters' },
              ]}
              rows={rows}
              rowMapper={r => ({ 'Destination Name *': r.destination.name, 'Activity Name *': r.activity_name, 'Activity Type': r.activity_type ?? '', 'Duration': r.duration ?? '', 'Adult Cost (₹) *': r.adult_cost, 'Child Cost (₹)': r.child_cost ?? '', 'Rate Type (PER_PERSON/PER_GROUP)': r.rate_type, 'Description': r.description ?? '' })}
              importMapper={r => {
                const dest = dests.find(d => d.name.toLowerCase() === (r['Destination Name *'] ?? '').toLowerCase());
                return { destination_id: dest?.id ?? undefined, activity_name: r['Activity Name *'], activity_type: r['Activity Type'] || undefined, duration: r['Duration'] || undefined, adult_cost: Number(r['Adult Cost (₹) *']) || 0, child_cost: r['Child Cost (₹)'] ? Number(r['Child Cost (₹)']) : null, rate_type: r['Rate Type (PER_PERSON/PER_GROUP)'] || 'PER_PERSON', description: r['Description'] || undefined };
              }}
              importUrl="/api/v1/activities"
              onImportDone={load}
            />
            <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Activity</button>
          </div>
        }
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Activity' : 'Add New Activity'} subtitle="Fill in the activity details">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={lbl} style={lblStyle}>Destination <span style={{ color: '#EF4444' }}>*</span></label>
              <select className={sel} style={inpStyle} value={form.destination_id} onChange={e => setForm(p => ({ ...p, destination_id: e.target.value }))}>
                <option value="">Select destination…</option>
                {dests.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Activity Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.activity_name} onChange={e => setForm(p => ({ ...p, activity_name: e.target.value }))} placeholder="Boat Ride, Trekking…" /></div>
            <div><label className={lbl} style={lblStyle}>Activity Type</label><input className={inp} style={inpStyle} value={form.activity_type} onChange={e => setForm(p => ({ ...p, activity_type: e.target.value }))} placeholder="Adventure, Cultural…" /></div>
            <div><label className={lbl} style={lblStyle}>Duration</label><input className={inp} style={inpStyle} value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} placeholder="2 hrs, Half Day…" /></div>
            <div><label className={lbl} style={lblStyle}>Rate Type</label>
              <select className={sel} style={inpStyle} value={form.rate_type} onChange={e => setForm(p => ({ ...p, rate_type: e.target.value }))}>
                {RATE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Adult Cost (₹) <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.adult_cost} onChange={e => setForm(p => ({ ...p, adult_cost: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Child Cost (₹)</label><input type="number" min="0" className={inp} style={inpStyle} value={form.child_cost} onChange={e => setForm(p => ({ ...p, child_cost: e.target.value }))} /></div>
            <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Description</label><textarea rows={2} className={textarea} style={inpStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Activity details…" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Activity'}</button>
          </div>
      </Modal>

      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} activit${filtered.length !== 1 ? 'ies' : 'y'}`}</p>
            {selected.size > 0 && (
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} selected`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={sortKey}
              onChange={e => { setSortKey(e.target.value as SortKey); setCurrentPage(1); setSelected(new Set()); }}
              className="h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none pr-8"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
              <option value="dest_az">Destination A → Z</option>
            </select>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); setSelected(new Set()); }}
              className="h-9 px-3 rounded-lg border text-sm focus:outline-none bg-white appearance-none"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); setSelected(new Set()); }} placeholder="Search activities…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors" style={{ borderColor: '#E2E8F0' }} /></div>
          </div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No activities found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first activity'}</p></div>
          : <>
            <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
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
                {['Activity', 'Destination', 'Type', 'Duration', 'Adult Cost', 'Rate', 'Status', 'Created By', 'Created', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {paginated.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
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
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.activity_name}</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.destination.name}</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.activity_type ?? '—'}</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.duration ?? '—'}</td>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>₹{r.adult_cost.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>{r.rate_type.replace('_', ' ')}</span></td>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>{r.status ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>Admin</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>
                      {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-0"><div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#134956')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#FEF2F2] disabled:opacity-40" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
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
          </>}
      </div>
    </div>
  );
}
