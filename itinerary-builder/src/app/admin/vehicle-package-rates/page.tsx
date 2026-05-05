'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

interface State { id: string; name: string }
interface VehicleType { id: string; vehicle_type: string; display_name: string }
interface Supplier { id: string; name: string }
interface Rate { id: string; route_name: string; start_city: string; end_city: string; base_cost: number; valid_from: string; valid_to: string; status: boolean; vehicle_type_id: string; state_id: string }
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

  async function load() {
    setLoading(true);
    const [rr, sr, vr, supr] = await Promise.all([fetch('/api/v1/vehicle-package-rates'), fetch('/api/v1/states'), fetch('/api/v1/vehicle-types'), fetch('/api/v1/suppliers')]);
    const [rd, sd, vd, supd] = await Promise.all([rr.json(), sr.json(), vr.json(), supr.json()]);
    if (rd.success) setRows(rd.data);
    if (sd.success) setStates(sd.data);
    if (vd.success) setVehicleTypes(vd.data);
    if (supd.success) setSuppliers(supd.data.filter((s: Supplier & { supplier_type: string }) => s.supplier_type === 'VEHICLE'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Rate) {
    setEditing(r);
    setForm({ route_name: r.route_name, state_id: r.state_id, start_city: r.start_city, end_city: r.end_city, vehicle_type_id: r.vehicle_type_id, supplier_id: '', duration_days: '1', duration_nights: '0', base_cost: r.base_cost.toString(), extra_day_cost: '', extra_km_cost: '', driver_bata_included: false, toll_parking_included: false, valid_from: r.valid_from.slice(0, 10), valid_to: r.valid_to.slice(0, 10) });
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

  const filtered = rows.filter(r => !search || r.route_name.toLowerCase().includes(search.toLowerCase()) || r.start_city.toLowerCase().includes(search.toLowerCase()) || r.end_city.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Vehicle Package Rates" subtitle="Route-based vehicle pricing and cost management" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Vehicle Rates' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExcelIO
              moduleName="Vehicle_Rates"
              columns={[
                { key: 'route_name', label: 'Route Name *', example: 'Cochin – Munnar – Alleppey' },
                { key: 'state', label: 'State Name *', example: 'Kerala' },
                { key: 'start_city', label: 'Start City *', example: 'Cochin' },
                { key: 'end_city', label: 'End City *', example: 'Alleppey' },
                { key: 'vehicle_type', label: 'Vehicle Type Code *', example: 'SUV' },
                { key: 'base_cost', label: 'Base Cost (₹) *', example: '12000' },
                { key: 'duration_days', label: 'Duration Days *', example: '3' },
                { key: 'duration_nights', label: 'Duration Nights', example: '2' },
                { key: 'valid_from', label: 'Valid From (YYYY-MM-DD) *', example: '2026-01-01' },
                { key: 'valid_to', label: 'Valid To (YYYY-MM-DD) *', example: '2026-12-31' },
              ]}
              rows={rows}
              rowMapper={r => {
                const st = states.find(s => s.id === r.state_id);
                const vt = vehicleTypes.find(v => v.id === r.vehicle_type_id);
                return { 'Route Name *': r.route_name, 'State Name *': st?.name ?? '', 'Start City *': r.start_city, 'End City *': r.end_city, 'Vehicle Type Code *': vt?.vehicle_type ?? '', 'Base Cost (₹) *': r.base_cost, 'Duration Days *': '', 'Duration Nights': '', 'Valid From (YYYY-MM-DD) *': r.valid_from.slice(0, 10), 'Valid To (YYYY-MM-DD) *': r.valid_to.slice(0, 10) };
              }}
              importMapper={r => {
                const st = states.find(s => s.name.toLowerCase() === (r['State Name *'] ?? '').toLowerCase());
                const vt = vehicleTypes.find(v => v.vehicle_type.toLowerCase() === (r['Vehicle Type Code *'] ?? '').toLowerCase());
                return { route_name: r['Route Name *'], state_id: st?.id ?? '', start_city: r['Start City *'], end_city: r['End City *'], vehicle_type_id: vt?.id ?? '', base_cost: Number(r['Base Cost (₹) *']) || 0, duration_days: Number(r['Duration Days *']) || 1, duration_nights: Number(r['Duration Nights']) || 0, valid_from: new Date(r['Valid From (YYYY-MM-DD) *']).toISOString(), valid_to: new Date(r['Valid To (YYYY-MM-DD) *']).toISOString() };
              }}
              importUrl="/api/v1/vehicle-package-rates"
              onImportDone={load}
            />
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
            <div><label className={lbl} style={lblStyle}>Start City <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.start_city} onChange={e => setForm(p => ({ ...p, start_city: e.target.value }))} placeholder="Cochin" /></div>
            <div><label className={lbl} style={lblStyle}>End City <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.end_city} onChange={e => setForm(p => ({ ...p, end_city: e.target.value }))} placeholder="Trivandrum" /></div>
            <div><label className={lbl} style={lblStyle}>Duration Days <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="1" className={inp} style={inpStyle} value={form.duration_days} onChange={e => setForm(p => ({ ...p, duration_days: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Duration Nights <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.duration_nights} onChange={e => setForm(p => ({ ...p, duration_nights: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Base Cost (₹) <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.base_cost} onChange={e => setForm(p => ({ ...p, base_cost: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Extra Day Cost (₹)</label><input type="number" min="0" className={inp} style={inpStyle} value={form.extra_day_cost} onChange={e => setForm(p => ({ ...p, extra_day_cost: e.target.value }))} /></div>
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
          <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} rate${filtered.length !== 1 ? 's' : ''}`}</p>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search routes…" className="w-64 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} /></div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No vehicle rates found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first vehicle rate'}</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Route', 'From', 'To', 'Base Cost', 'Valid From', 'Valid To', 'Status', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
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
            </table>}
      </div>
    </div>
  );
}
