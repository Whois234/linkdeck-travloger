'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

interface GroupTemplate { id: string; group_template_name: string }
interface Agent { id: string; name: string }
interface GroupBatch {
  id: string; batch_name: string; start_date: string; end_date: string;
  total_seats: number; available_seats: number; adult_price: number;
  child_5_12_price: number; child_below_5_price: number; gst_percent: number;
  booking_status: string; group_template_id: string; assigned_agent_id?: string | null;
  group_template: { group_template_name: string }; assigned_agent?: { name: string } | null; status: boolean;
}
const BATCH_STATUSES = ['OPEN', 'SOLD_OUT', 'CLOSED', 'CANCELLED'];
const BATCH_STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: '#DCFCE7', text: '#15803D' },
  SOLD_OUT: { bg: '#FEE2E2', text: '#DC2626' },
  CLOSED: { bg: '#F1F5F9', text: '#475569' },
  CANCELLED: { bg: '#FEE2E2', text: '#DC2626' },
};
const EMPTY = { group_template_id: '', batch_name: '', start_date: '', end_date: '', total_seats: '20', available_seats: '20', adult_price: '', child_5_12_price: '0', child_below_5_price: '0', gst_percent: '5', booking_status: 'OPEN', assigned_agent_id: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function GroupBatchesPage() {
  const [rows, setRows] = useState<GroupBatch[]>([]);
  const [templates, setTemplates] = useState<GroupTemplate[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GroupBatch | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    setLoading(true);
    const [br, tr, ar] = await Promise.all([fetch('/api/v1/group-batches'), fetch('/api/v1/group-templates'), fetch('/api/v1/agents')]);
    const [bd, td, ad] = await Promise.all([br.json(), tr.json(), ar.json()]);
    if (bd.success) setRows(bd.data);
    if (td.success) setTemplates(td.data);
    if (ad.success) setAgents(ad.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: GroupBatch) {
    setEditing(r);
    setForm({ group_template_id: r.group_template_id, batch_name: r.batch_name, start_date: r.start_date.slice(0, 10), end_date: r.end_date.slice(0, 10), total_seats: r.total_seats.toString(), available_seats: r.available_seats.toString(), adult_price: r.adult_price.toString(), child_5_12_price: r.child_5_12_price.toString(), child_below_5_price: r.child_below_5_price.toString(), gst_percent: r.gst_percent.toString(), booking_status: r.booking_status, assigned_agent_id: r.assigned_agent_id ?? '' });
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, total_seats: Number(form.total_seats), available_seats: Number(form.available_seats), adult_price: Number(form.adult_price), child_5_12_price: Number(form.child_5_12_price), child_below_5_price: Number(form.child_below_5_price), gst_percent: Number(form.gst_percent), assigned_agent_id: form.assigned_agent_id || null, start_date: new Date(form.start_date).toISOString(), end_date: new Date(form.end_date).toISOString() };
    const url = editing ? `/api/v1/group-batches/${editing.id}` : '/api/v1/group-batches';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this batch?')) return;
    setDeleting(id); await fetch(`/api/v1/group-batches/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  const filtered = rows.filter(r => (!statusFilter || r.booking_status === statusFilter) && (!search || r.batch_name.toLowerCase().includes(search.toLowerCase()) || r.group_template.group_template_name.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Group Batches" subtitle="Fixed departure batch management and seat allocation" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Group Batches' }]}
        action={<button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Batch</button>}
      />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Group Batch' : 'Add New Group Batch'} subtitle="Fill in the batch and pricing details">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={lbl} style={lblStyle}>Group Template <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={form.group_template_id} onChange={e => setForm(p => ({ ...p, group_template_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">Select template…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.group_template_name}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Batch Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.batch_name} onChange={e => setForm(p => ({ ...p, batch_name: e.target.value }))} placeholder="Jan 2026 Batch" /></div>
            <div><label className={lbl} style={lblStyle}>Start Date <span style={{ color: '#EF4444' }}>*</span></label><input type="date" className={inp} style={inpStyle} value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>End Date <span style={{ color: '#EF4444' }}>*</span></label><input type="date" className={inp} style={inpStyle} value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Total Seats <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="1" className={inp} style={inpStyle} value={form.total_seats} onChange={e => setForm(p => ({ ...p, total_seats: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Available Seats <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.available_seats} onChange={e => setForm(p => ({ ...p, available_seats: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Adult Price (₹) <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.adult_price} onChange={e => setForm(p => ({ ...p, adult_price: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Child 5–12 Price (₹) <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.child_5_12_price} onChange={e => setForm(p => ({ ...p, child_5_12_price: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Child Below 5 Price (₹) <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.child_below_5_price} onChange={e => setForm(p => ({ ...p, child_below_5_price: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>GST % <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" max="100" step="0.5" className={inp} style={inpStyle} value={form.gst_percent} onChange={e => setForm(p => ({ ...p, gst_percent: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Booking Status</label>
              <select value={form.booking_status} onChange={e => setForm(p => ({ ...p, booking_status: e.target.value }))} className={sel} style={inpStyle}>
                {BATCH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Assigned Agent</label>
              <select value={form.assigned_agent_id} onChange={e => setForm(p => ({ ...p, assigned_agent_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">None</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Batch'}</button>
          </div>
      </Modal>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} batch${filtered.length !== 1 ? 'es' : ''}`}</p>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 px-3 rounded-lg border text-xs font-semibold focus:outline-none appearance-none" style={{ borderColor: '#E2E8F0', color: '#64748B', backgroundColor: '#F8FAFC' }}>
              <option value="">All Statuses</option>
              {BATCH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batches…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} /></div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No group batches found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first group batch'}</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Batch', 'Template', 'Dates', 'Seats', 'Price/Adult', 'Status', 'Agent', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => {
                  const badge = BATCH_STATUS_BADGE[r.booking_status] ?? BATCH_STATUS_BADGE.OPEN;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                      <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.batch_name}</td>
                      <td className="px-5 py-0 text-xs" style={{ color: '#64748B' }}>{r.group_template.group_template_name}</td>
                      <td className="px-5 py-0 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>
                        {new Date(r.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(r.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-0 text-sm">
                        <span className="font-semibold" style={{ color: '#0F172A' }}>{r.available_seats}</span>
                        <span style={{ color: '#94A3B8' }}> / {r.total_seats}</span>
                      </td>
                      <td className="px-5 py-0 font-semibold" style={{ color: '#134956' }}>₹{r.adult_price.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>{r.booking_status}</span></td>
                      <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.assigned_agent?.name ?? '—'}</td>
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
