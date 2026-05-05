'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const SOURCES = ['WALK_IN', 'PHONE', 'WEBSITE', 'REFERRAL', 'SOCIAL', 'WHATSAPP'];
const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUOTE_SENT', 'CONVERTED', 'LOST'];
const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  NEW: { bg: '#DBEAFE', text: '#1D4ED8' }, CONTACTED: { bg: '#CCFBF1', text: '#0F766E' },
  QUOTE_SENT: { bg: '#FEF3C7', text: '#B45309' }, CONVERTED: { bg: '#DCFCE7', text: '#15803D' }, LOST: { bg: '#F1F5F9', text: '#475569' },
};
interface Lead { id: string; name: string; phone: string; email?: string | null; source?: string | null; status: string; destination_interest?: string | null; notes?: string | null }
const EMPTY = { name: '', phone: '', email: '', source: 'WALK_IN', status: 'NEW', destination_interest: '', notes: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const textarea = 'w-full px-3 py-2.5 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors resize-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function LeadsPage() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() { setLoading(true); const r = await fetch('/api/v1/leads'); const d = await r.json(); if (d.success) setRows(d.data); setLoading(false); }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Lead) {
    setEditing(r);
    setForm({ name: r.name, phone: r.phone, email: r.email ?? '', source: r.source ?? 'WALK_IN', status: r.status, destination_interest: r.destination_interest ?? '', notes: r.notes ?? '' });
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) { setError('Name and phone are required'); return; }
    setSaving(true); setError('');
    const url = editing ? `/api/v1/leads/${editing.id}` : '/api/v1/leads';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this lead?')) return;
    setDeleting(id); await fetch(`/api/v1/leads/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  const filtered = rows.filter(r => (!statusFilter || r.status === statusFilter) && (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search)));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Leads" subtitle="Track and manage sales enquiries" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Leads' }]}
        action={<button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Lead</button>}
      />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Lead' : 'Add New Lead'} subtitle="Fill in the lead details">
        {error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={lbl} style={lblStyle}>Full Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Priya Sharma" /></div>
          <div><label className={lbl} style={lblStyle}>Phone <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
          <div><label className={lbl} style={lblStyle}>Email</label><input type="email" className={inp} style={inpStyle} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          <div><label className={lbl} style={lblStyle}>Source</label>
            <select className={sel} style={inpStyle} value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
              {SOURCES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div><label className={lbl} style={lblStyle}>Status</label>
            <select className={sel} style={inpStyle} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div><label className={lbl} style={lblStyle}>Interested Destination</label><input className={inp} style={inpStyle} value={form.destination_interest} onChange={e => setForm(p => ({ ...p, destination_interest: e.target.value }))} placeholder="Kerala, Rajasthan…" /></div>
          <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Notes</label><textarea rows={2} className={textarea} style={inpStyle} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Lead'}</button>
        </div>
      </Modal>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} lead${filtered.length !== 1 ? 's' : ''}`}</p>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 px-3 rounded-lg border text-xs font-semibold focus:outline-none appearance-none" style={{ borderColor: '#E2E8F0', color: '#64748B', backgroundColor: '#F8FAFC' }}>
              <option value="">All Statuses</option>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} /></div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No leads found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first lead'}</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Name', 'Phone', 'Source', 'Status', 'Destination', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => {
                  const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.NEW;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                      <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.name}</td>
                      <td className="px-5 py-0 text-sm font-mono" style={{ color: '#64748B' }}>{r.phone}</td>
                      <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{(r.source ?? '—').replace('_', ' ')}</span></td>
                      <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>{r.status.replace('_', ' ')}</span></td>
                      <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.destination_interest ?? '—'}</td>
                      <td className="px-5 py-0"><div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#134956')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#FEF2F2] disabled:opacity-40" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>}
      </div>
    </div>
  );
}
