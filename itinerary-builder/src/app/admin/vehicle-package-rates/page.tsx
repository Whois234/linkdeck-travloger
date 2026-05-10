'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

interface State { id: string; name: string }
interface City  { id: string; name: string; state_id: string }
interface VehicleType { id: string; vehicle_type: string; display_name: string }
interface Supplier { id: string; name: string }
interface Rate {
  id: string; route_name: string; start_city: string; end_city: string;
  base_cost: number; extra_day_cost: number | null; extra_km_cost: number | null;
  duration_days: number; duration_nights: number;
  driver_bata_included: boolean; toll_parking_included: boolean;
  valid_from: string; valid_to: string; status: boolean;
  vehicle_type_id: string; state_id: string;
  supplier_id: string | null;
  supplier?: { name: string } | null;
}
const EMPTY = { route_name: '', state_id: '', start_city: '', end_city: '', vehicle_type_id: '', supplier_id: '', duration_days: '1', duration_nights: '0', base_cost: '', extra_day_cost: '', extra_km_cost: '', driver_bata_included: false, toll_parking_included: false, valid_from: '', valid_to: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function VehicleRatesPage() {
  const [rows, setRows] = useState<Rate[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rate | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [rr, sr, cr, vr, supr] = await Promise.all([fetch('/api/v1/vehicle-package-rates'), fetch('/api/v1/states'), fetch('/api/v1/cities'), fetch('/api/v1/vehicle-types'), fetch('/api/v1/suppliers')]);
    const [rd, sd, cd, vd, supd] = await Promise.all([rr.json(), sr.json(), cr.json(), vr.json(), supr.json()]);
    if (rd.success) setRows(rd.data);
    if (sd.success) setStates(sd.data);
    if (cd.success) setCities(cd.data);
    if (vd.success) setVehicleTypes(vd.data);
    if (supd.success) setSuppliers(supd.data.filter((s: Supplier & { supplier_type: string }) => s.supplier_type === 'VEHICLE'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Rate) {
    setEditing(r);
    setForm({
      route_name: r.route_name,
      state_id: r.state_id,
      start_city: r.start_city,
      end_city: r.end_city,
      vehicle_type_id: r.vehicle_type_id,
      supplier_id: r.supplier_id ?? '',
      duration_days: String(r.duration_days ?? 1),
      duration_nights: String(r.duration_nights ?? 0),
      base_cost: r.base_cost.toString(),
      extra_day_cost: r.extra_day_cost != null ? r.extra_day_cost.toString() : '',
      extra_km_cost: r.extra_km_cost != null ? r.extra_km_cost.toString() : '',
      driver_bata_included: r.driver_bata_included ?? false,
      toll_parking_included: r.toll_parking_included ?? false,
      valid_from: r.valid_from.slice(0, 10),
      valid_to: r.valid_to.slice(0, 10),
    });
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, base_cost: Number(form.base_cost), duration_days: Number(form.duration_days), duration_nights: Number(form.duration_nights), extra_day_cost: form.extra_day_cost ? Number(form.extra_day_cost) : null, extra_km_cost: form.extra_km_cost ? Number(form.extra_km_cost) : null, supplier_id: form.supplier_id || null, valid_from: new Date(form.valid_from).toISOString(), valid_to: new Date(form.valid_to).toISOString() };
    const url = editing ? `/api/v1/vehicle-package-rates/${editing.id}` : '/api/v1/vehicle-package-rates';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this vehicle rate?')) return;
    setDeleting(id); await fetch(`/api/v1/vehicle-package-rates/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Deactivate ${selected.size} selected item${selected.size !== 1 ? 's' : ''}?`)) return;
    setBulkDeleting(true);
    await Promise.all(Array.from(selected).map(id => fetch(`/api/v1/vehicle-package-rates/${id}`, { method: 'DELETE' })));
    setBulkDeleting(false);
    setSelected(new Set());
    load();
  }

  const filtered = rows.filter(r => !search || r.route_name.toLowerCase().includes(search.toLowerCase()) || r.start_city.toLowerCase().includes(search.toLowerCase()) || r.end_city.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Vehicle Package Rates" subtitle="Route-based vehicle pricing and cost management" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Vehicle Rates' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Rate</button>
          </div>
        }
      />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Vehicle Rate' : 'Add New Vehicle Rate'} subtitle="Define route pricing details">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Route Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.route_name} onChange={e => setForm(p => ({ ...p, route_name: e.target.value }))} placeholder="Cochin – Munnar – Thekkady – Alleppey" /></div>
            <div><label className={lbl} style={lblStyle}>State <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={form.state_id} onChange={e => setForm(p => ({ ...p, state_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">Select state…</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Vehicle Type <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={form.vehicle_type_id} onChange={e => setForm(p => ({ ...p, vehicle_type_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">Select vehicle…</option>
                {vehicleTypes.map(v => <option key={v.id} value={v.id}>{v.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Start City <span style={{ color: '#EF4444' }}>*</span></label>
              <select className={sel} style={inpStyle} value={form.start_city} onChange={e => setForm(p => ({ ...p, start_city: e.target.value }))}>
                <option value="">Select city…</option>
                {(form.state_id ? cities.filter(c => c.state_id === form.state_id) : cities).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              {!form.state_id && <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>Select a state above to filter cities</p>}
            </div>
            <div>
              <label className={lbl} style={lblStyle}>End City <span style={{ color: '#EF4444' }}>*</span></label>
              <select className={sel} style={inpStyle} value={form.end_city} onChange={e => setForm(p => ({ ...p, end_city: e.target.value }))}>
                <option value="">Select city…</option>
                {(form.state_id ? cities.filter(c => c.state_id === form.state_id) : cities).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Duration Days <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="1" className={inp} style={inpStyle} value={form.duration_days} onChange={e => setForm(p => ({ ...p, duration_days: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Duration Nights <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.duration_nights} onChange={e => setForm(p => ({ ...p, duration_nights: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Base Cost (₹) <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.base_cost} onChange={e => setForm(p => ({ ...p, base_cost: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Extra Day Cost (₹)</label><input type="number" min="0" className={inp} style={inpStyle} value={form.extra_day_cost} onChange={e => setForm(p => ({ ...p, extra_day_cost: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Extra KM Cost (₹)</label><input type="number" min="0" className={inp} style={inpStyle} value={form.extra_km_cost} onChange={e => setForm(p => ({ ...p, extra_km_cost: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Supplier</label>
              <select value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-6 pt-5">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: '#0F172A' }}><input type="checkbox" checked={form.driver_bata_included} onChange={e => setForm(p => ({ ...p, driver_bata_included: e.target.checked }))} className="w-4 h-4 rounded accent-[#134956]" /> Driver Bata Incl.</label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: '#0F172A' }}><input type="checkbox" checked={form.toll_parking_included} onChange={e => setForm(p => ({ ...p, toll_parking_included: e.target.checked }))} className="w-4 h-4 rounded accent-[#134956]" /> Toll &amp; Parking Incl.</label>
            </div>
            <div><label className={lbl} style={lblStyle}>Valid From <span style={{ color: '#EF4444' }}>*</span></label><input type="date" className={inp} style={inpStyle} value={form.valid_from} onChange={e => setForm(p => ({ ...p, valid_from: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Valid To <span style={{ color: '#EF4444' }}>*</span></label><input type="date" className={inp} style={inpStyle} value={form.valid_to} onChange={e => setForm(p => ({ ...p, valid_to: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Rate'}</button>
          </div>
      </Modal>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} rate${filtered.length !== 1 ? 's' : ''}`}</p>
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
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); setSelected(new Set()); }}
              className="h-9 px-3 rounded-lg border text-sm focus:outline-none bg-white appearance-none"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); setSelected(new Set()); }} placeholder="Search routes…" className="w-64 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} /></div>
          </div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No vehicle rates found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first vehicle rate'}</p></div>
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
                {['Route', 'From', 'To', 'Base Cost', 'Valid From', 'Valid To', 'Status', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}
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
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.route_name}</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.start_city}</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.end_city}</td>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#134956' }}>₹{r.base_cost.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-0 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{new Date(r.valid_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-5 py-0 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{new Date(r.valid_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>{r.status ? 'Active' : 'Inactive'}</span></td>
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
