'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search, Star } from 'lucide-react';

const HOTEL_TYPES = ['HOTEL', 'RESORT', 'VILLA', 'HOMESTAY', 'HOUSEBOAT'];
const HOTEL_CATS = ['BUDGET', 'STANDARD', 'DELUXE', 'PREMIUM', 'LUXURY'];
interface Dest { id: string; name: string }
interface State { id: string; name: string }
interface Hotel { id: string; hotel_name: string; hotel_type: string; category_label: string; star_rating?: number | null; destination: { name: string }; destination_id: string; status: boolean; address?: string | null; hotel_description?: string | null }
const EMPTY = { hotel_name: '', destination_id: '', state_id: '', hotel_type: 'HOTEL', category_label: 'STANDARD', star_rating: '3', address: '', hotel_description: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };
const CAT_BADGE: Record<string, { bg: string; text: string }> = {
  BUDGET: { bg: '#F1F5F9', text: '#475569' }, STANDARD: { bg: '#DBEAFE', text: '#1D4ED8' },
  DELUXE: { bg: '#CCFBF1', text: '#0F766E' }, PREMIUM: { bg: '#EDE9FE', text: '#6D28D9' }, LUXURY: { bg: '#FEF3C7', text: '#B45309' },
};

export default function HotelsPage() {
  const [rows, setRows] = useState<Hotel[]>([]);
  const [dests, setDests] = useState<Dest[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Hotel | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const [hr, dr, sr] = await Promise.all([fetch('/api/v1/hotels'), fetch('/api/v1/destinations'), fetch('/api/v1/states')]);
    const [hd, dd, sd] = await Promise.all([hr.json(), dr.json(), sr.json()]);
    if (hd.success) setRows(hd.data);
    if (dd.success) setDests(dd.data);
    if (sd.success) setStates(sd.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Hotel) {
    setEditing(r);
    setForm({
      hotel_name: r.hotel_name,
      destination_id: r.destination_id,
      state_id: '',
      hotel_type: r.hotel_type,
      category_label: r.category_label,
      star_rating: r.star_rating?.toString() ?? '3',
      address: r.address ?? '',
      hotel_description: r.hotel_description ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const { state_id, ...payloadForm } = form;
    const payload = { ...payloadForm, star_rating: form.star_rating ? Number(form.star_rating) : null };
    const url = editing ? `/api/v1/hotels/${editing.id}` : '/api/v1/hotels';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this hotel?')) return;
    setDeleting(id); await fetch(`/api/v1/hotels/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  const filtered = rows.filter(r => !search || r.hotel_name.toLowerCase().includes(search.toLowerCase()) || r.destination.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Hotels" subtitle="Manage hotel inventory and properties" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Hotels' }]}
        action={<button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Hotel</button>}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Hotel' : 'Add New Hotel'} subtitle="Fill in the hotel details">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Hotel Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.hotel_name} onChange={e => setForm(p => ({ ...p, hotel_name: e.target.value }))} placeholder="The Leela Palace" /></div>
            <div><label className={lbl} style={lblStyle}>Destination <span style={{ color: '#EF4444' }}>*</span></label>
              <select className={sel} style={inpStyle} value={form.destination_id} onChange={e => setForm(p => ({ ...p, destination_id: e.target.value }))}>
                <option value="">Select destination…</option>
                {dests.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>State <span style={{ color: '#EF4444' }}>*</span></label>
              <select className={sel} style={inpStyle} value={form.state_id} onChange={e => setForm(p => ({ ...p, state_id: e.target.value }))}>
                <option value="">Select state…</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Hotel Type</label>
              <select className={sel} style={inpStyle} value={form.hotel_type} onChange={e => setForm(p => ({ ...p, hotel_type: e.target.value }))}>
                {HOTEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Category</label>
              <select className={sel} style={inpStyle} value={form.category_label} onChange={e => setForm(p => ({ ...p, category_label: e.target.value }))}>
                {HOTEL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Star Rating</label>
              <select className={sel} style={inpStyle} value={form.star_rating} onChange={e => setForm(p => ({ ...p, star_rating: e.target.value }))}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} Star{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Address</label><input className={inp} style={inpStyle} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Full address" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Hotel'}</button>
          </div>
      </Modal>

      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} hotel${filtered.length !== 1 ? 's' : ''}`}</p>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hotels…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors" style={{ borderColor: '#E2E8F0' }} /></div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No hotels found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first hotel'}</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Name', 'Destination', 'Type', 'Category', 'Stars', 'Status', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => {
                  const cat = CAT_BADGE[r.category_label] ?? CAT_BADGE.STANDARD;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                      <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.hotel_name}</td>
                      <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.destination.name}</td>
                      <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{r.hotel_type}</span></td>
                      <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: cat.bg, color: cat.text }}>{r.category_label}</span></td>
                      <td className="px-5 py-0"><div className="flex items-center gap-0.5">{Array.from({ length: r.star_rating ?? 0 }).map((_, i) => <Star key={i} className="w-3 h-3 fill-current" style={{ color: '#F59E0B' }} />)}</div></td>
                      <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>{r.status ? 'Active' : 'Inactive'}</span></td>
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
