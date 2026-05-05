'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search, Check } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

interface VehicleType { id: string; vehicle_type: string; display_name: string; capacity: number; luggage_capacity?: number | null; ac_available: boolean; description?: string | null; status: boolean }
const EMPTY = { vehicle_type: '', display_name: '', capacity: '', luggage_capacity: '', ac_available: true, description: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const textarea = 'w-full px-3 py-2.5 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors resize-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function VehicleTypesPage() {
  const [rows, setRows] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VehicleType | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load() { setLoading(true); const r = await fetch('/api/v1/vehicle-types'); const d = await r.json(); if (d.success) setRows(d.data); setLoading(false); }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: VehicleType) {
    setEditing(r);
    setForm({ vehicle_type: r.vehicle_type, display_name: r.display_name, capacity: r.capacity.toString(), luggage_capacity: r.luggage_capacity?.toString() ?? '', ac_available: r.ac_available, description: r.description ?? '' });
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, capacity: Number(form.capacity), luggage_capacity: form.luggage_capacity ? Number(form.luggage_capacity) : null };
    const url = editing ? `/api/v1/vehicle-types/${editing.id}` : '/api/v1/vehicle-types';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this vehicle type?')) return;
    setDeleting(id); await fetch(`/api/v1/vehicle-types/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  const filtered = rows.filter(r => !search || r.display_name.toLowerCase().includes(search.toLowerCase()) || r.vehicle_type.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Vehicle Types" subtitle="Manage fleet vehicle types and capacities" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Vehicle Types' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExcelIO
              moduleName="Vehicle_Types"
              columns={[
                { key: 'vehicle_type', label: 'Type Code *', example: 'SUV' },
                { key: 'display_name', label: 'Display Name *', example: 'Toyota Innova Crysta' },
                { key: 'capacity', label: 'Passenger Capacity *', example: '7' },
                { key: 'luggage_capacity', label: 'Luggage Capacity', example: '4' },
                { key: 'ac_available', label: 'AC Available (YES/NO)', example: 'YES' },
                { key: 'description', label: 'Description', example: 'Comfortable SUV for hills' },
              ]}
              rows={rows}
              rowMapper={r => ({ 'Type Code *': r.vehicle_type, 'Display Name *': r.display_name, 'Passenger Capacity *': r.capacity, 'Luggage Capacity': r.luggage_capacity ?? '', 'AC Available (YES/NO)': r.ac_available ? 'YES' : 'NO', 'Description': r.description ?? '' })}
              importMapper={r => ({ vehicle_type: r['Type Code *'], display_name: r['Display Name *'], capacity: Number(r['Passenger Capacity *']) || 1, luggage_capacity: r['Luggage Capacity'] ? Number(r['Luggage Capacity']) : null, ac_available: (r['AC Available (YES/NO)'] ?? '').toUpperCase() === 'YES', description: r['Description'] || '' })}
              importUrl="/api/v1/vehicle-types"
              onImportDone={load}
            />
            <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Vehicle Type</button>
          </div>
        }
      />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Vehicle Type' : 'Add New Vehicle Type'} subtitle="Fill in the vehicle details">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={lbl} style={lblStyle}>Type Code <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.vehicle_type} onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))} placeholder="SEDAN, SUV, TEMPO…" /></div>
            <div><label className={lbl} style={lblStyle}>Display Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.display_name} onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))} placeholder="Toyota Innova Crysta" /></div>
            <div><label className={lbl} style={lblStyle}>Passenger Capacity <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="1" className={inp} style={inpStyle} value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Luggage Capacity</label><input type="number" min="0" className={inp} style={inpStyle} value={form.luggage_capacity} onChange={e => setForm(p => ({ ...p, luggage_capacity: e.target.value }))} /></div>
            <div className="flex items-center gap-3 pt-5">
              <input type="checkbox" id="ac" checked={form.ac_available} onChange={e => setForm(p => ({ ...p, ac_available: e.target.checked }))} className="w-4 h-4 rounded accent-[#134956]" />
              <label htmlFor="ac" className="text-sm font-medium" style={{ color: '#0F172A' }}>AC Available</label>
            </div>
            <div><label className={lbl} style={lblStyle}>Description</label><input className={inp} style={inpStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description…" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Vehicle Type'}</button>
          </div>
      </Modal>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} vehicle type${filtered.length !== 1 ? 's' : ''}`}</p>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vehicle types…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} /></div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No vehicle types found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first vehicle type'}</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Type Code', 'Display Name', 'Capacity', 'Luggage', 'AC', 'Status', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold font-mono" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{r.vehicle_type}</span></td>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.display_name}</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.capacity} pax</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.luggage_capacity != null ? `${r.luggage_capacity} bags` : '—'}</td>
                    <td className="px-5 py-0">{r.ac_available ? <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#15803D' }}><Check className="w-3.5 h-3.5" /> Yes</span> : <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>No</span>}</td>
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
