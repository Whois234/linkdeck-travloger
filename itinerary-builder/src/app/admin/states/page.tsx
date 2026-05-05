'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

interface State { id: string; name: string; country: string; code: string; trip_id_prefix: string; description?: string | null; status: boolean }
const EMPTY = { name: '', country: 'India', code: '', trip_id_prefix: '', description: '' };

const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

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

  async function load() {
    setLoading(true);
    const r = await fetch('/api/v1/states'); const d = await r.json();
    if (d.success) setRows(d.data);
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

  const filtered = rows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()));

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
              importMapper={r => ({ name: r['State Name *'], country: r['Country'] || 'India', code: r['Code *'], trip_id_prefix: r['Trip ID Prefix'] || '', description: r['Description'] || '' })}
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
        {/* Card Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="text-sm font-semibold" style={{ color: '#64748B' }}>
            {loading ? 'Loading…' : `${filtered.length} state${filtered.length !== 1 ? 's' : ''}`}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search states…"
              className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors"
              style={{ borderColor: '#E2E8F0' }}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No states found</p>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search term' : 'Add your first state to get started'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Name', 'Country', 'Code', 'Prefix', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                  <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.name}</td>
                  <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.country}</td>
                  <td className="px-5 py-0"><span className="font-mono text-xs font-bold px-2 py-1 rounded-md" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{r.code}</span></td>
                  <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.trip_id_prefix}</td>
                  <td className="px-5 py-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>
                      {r.status ? 'Active' : 'Inactive'}
                    </span>
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
