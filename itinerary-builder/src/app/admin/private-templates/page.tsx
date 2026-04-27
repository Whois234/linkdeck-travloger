'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

interface State { id: string; name: string }
interface PrivateTemplate {
  id: string; template_name: string; duration_days: number; duration_nights: number;
  theme?: string | null; start_city?: string | null; end_city?: string | null;
  state: { name: string }; state_id: string; template_days: Array<{ id: string }>; status: boolean;
}
const EMPTY = { template_name: '', state_id: '', duration_days: '1', duration_nights: '1', start_city: '', end_city: '', theme: '', hero_image: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function PrivateTemplatesPage() {
  const [rows, setRows] = useState<PrivateTemplate[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PrivateTemplate | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const [tr, sr] = await Promise.all([fetch('/api/v1/private-templates'), fetch('/api/v1/states')]);
    const [td, sd] = await Promise.all([tr.json(), sr.json()]);
    if (td.success) setRows(td.data);
    if (sd.success) setStates(sd.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: PrivateTemplate) {
    setEditing(r);
    setForm({ template_name: r.template_name, state_id: r.state_id, duration_days: r.duration_days.toString(), duration_nights: r.duration_nights.toString(), start_city: r.start_city ?? '', end_city: r.end_city ?? '', theme: r.theme ?? '', hero_image: '' });
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, duration_days: Number(form.duration_days), duration_nights: Number(form.duration_nights) };
    const url = editing ? `/api/v1/private-templates/${editing.id}` : '/api/v1/private-templates';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this template?')) return;
    setDeleting(id); await fetch(`/api/v1/private-templates/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  const filtered = rows.filter(r => !search || r.template_name.toLowerCase().includes(search.toLowerCase()) || r.state.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Private Templates" subtitle="Customisable itinerary templates for private tours" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Private Templates' }]}
        action={<button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Template</button>}
      />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Private Template' : 'Add New Private Template'} subtitle="Fill in the template details">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Template Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.template_name} onChange={e => setForm(p => ({ ...p, template_name: e.target.value }))} placeholder="Kerala Highlights 5D/4N" /></div>
            <div><label className={lbl} style={lblStyle}>State <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={form.state_id} onChange={e => setForm(p => ({ ...p, state_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">Select state…</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Theme</label><input className={inp} style={inpStyle} value={form.theme} onChange={e => setForm(p => ({ ...p, theme: e.target.value }))} placeholder="Beach, Hill Station, Cultural…" /></div>
            <div><label className={lbl} style={lblStyle}>Duration Days <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="1" className={inp} style={inpStyle} value={form.duration_days} onChange={e => setForm(p => ({ ...p, duration_days: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Duration Nights <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.duration_nights} onChange={e => setForm(p => ({ ...p, duration_nights: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Start City</label><input className={inp} style={inpStyle} value={form.start_city} onChange={e => setForm(p => ({ ...p, start_city: e.target.value }))} placeholder="Cochin" /></div>
            <div><label className={lbl} style={lblStyle}>End City</label><input className={inp} style={inpStyle} value={form.end_city} onChange={e => setForm(p => ({ ...p, end_city: e.target.value }))} placeholder="Trivandrum" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Template'}</button>
          </div>
      </Modal>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} template${filtered.length !== 1 ? 's' : ''}`}</p>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} /></div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No private templates found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first private template'}</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Template Name', 'State', 'Duration', 'Start City', 'Theme', 'Days', 'Status', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.template_name}</td>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: '#CCFBF1', color: '#0F766E' }}>{r.state.name}</span></td>
                    <td className="px-5 py-0 text-sm font-medium whitespace-nowrap" style={{ color: '#64748B' }}>{r.duration_nights}N / {r.duration_days}D</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.start_city ?? '—'}</td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.theme ?? '—'}</td>
                    <td className="px-5 py-0"><span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{r.template_days.length}</span></td>
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
