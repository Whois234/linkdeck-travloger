'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const TYPES = ['INCLUSION', 'EXCLUSION'];
const CATEGORIES = ['HOTEL', 'TRANSFER', 'ACTIVITY', 'TAX', 'GENERAL'];
interface Item { id: string; text: string; type: string; category: string; status: boolean }
const EMPTY = { text: '', type: 'INCLUSION', category: 'GENERAL' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function InclusionsExclusionsPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  async function load() { setLoading(true); const r = await fetch('/api/v1/inclusions-exclusions'); const d = await r.json(); if (d.success) setRows(d.data); setLoading(false); }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Item) { setEditing(r); setForm({ text: r.text, type: r.type, category: r.category }); setError(''); setShowForm(true); }

  async function handleSave() {
    if (!form.text.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    const url = editing ? `/api/v1/inclusions-exclusions/${editing.id}` : '/api/v1/inclusions-exclusions';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this item?')) return;
    setDeleting(id); await fetch(`/api/v1/inclusions-exclusions/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  const filtered = rows.filter(r => (!typeFilter || r.type === typeFilter) && (!search || r.text.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Inclusions & Exclusions" subtitle="Standard inclusions and exclusions for itineraries" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Inclusions / Excl.' }]}
        action={<button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Item</button>}
      />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Item' : 'Add New Item'} subtitle="Fill in the item details">
        {error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={lbl} style={lblStyle}>Title <span style={{ color: '#EF4444' }}>*</span></label>
            <input className={inp} style={inpStyle} value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))} placeholder="Breakfast included, Flights excluded…" />
          </div>
          <div>
            <label className={lbl} style={lblStyle}>Type <span style={{ color: '#EF4444' }}>*</span></label>
            <select className={sel} style={inpStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl} style={lblStyle}>Category</label>
            <select className={sel} style={inpStyle} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Item'}</button>
        </div>
      </Modal>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`}</p>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-8 px-3 rounded-lg border text-xs font-semibold focus:outline-none appearance-none" style={{ borderColor: '#E2E8F0', color: '#64748B', backgroundColor: '#F8FAFC' }}>
              <option value="">All Types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} />
          </div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No items found</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Title', 'Type', 'Category', 'Status', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.text}</td>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.type === 'INCLUSION' ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#FEE2E2', color: '#DC2626' }}>{r.type}</span></td>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{r.category}</span></td>
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
