'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const APPLIES_TO = ['HOTEL', 'ACTIVITY', 'TRANSFER', 'PACKAGE', 'ALL'];
const MARKUP_TYPES = ['FLAT', 'PERCENTAGE'];
const ROUNDING_RULES = ['NONE', 'NEAREST_99', 'NEAREST_500', 'NEAREST_1000'];
interface PricingRule { id: string; rule_name: string; applies_to: string; markup_type: string; markup_value: number; gst_percent: number; rounding_rule: string; valid_from: string; valid_to: string; status: boolean }
const EMPTY = { rule_name: '', applies_to: 'ALL', markup_type: 'PERCENTAGE', markup_value: '', gst_percent: '5', rounding_rule: 'NONE', valid_from: '', valid_to: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function PricingRulesPage() {
  const [rows, setRows] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load() { setLoading(true); const r = await fetch('/api/v1/pricing-rules'); const d = await r.json(); if (d.success) setRows(d.data); setLoading(false); }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: PricingRule) { setEditing(r); setForm({ rule_name: r.rule_name, applies_to: r.applies_to, markup_type: r.markup_type, markup_value: r.markup_value.toString(), gst_percent: r.gst_percent.toString(), rounding_rule: r.rounding_rule, valid_from: r.valid_from.slice(0, 10), valid_to: r.valid_to.slice(0, 10) }); setError(''); setShowForm(true); }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, markup_value: Number(form.markup_value), gst_percent: Number(form.gst_percent), valid_from: new Date(form.valid_from).toISOString(), valid_to: new Date(form.valid_to).toISOString() };
    const url = editing ? `/api/v1/pricing-rules/${editing.id}` : '/api/v1/pricing-rules';
    const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this pricing rule?')) return;
    setDeleting(id); await fetch(`/api/v1/pricing-rules/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  const filtered = rows.filter(r => !search || r.rule_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Pricing Rules" subtitle="Markup, GST and rounding rules for quotes" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Pricing Rules' }]}
        action={<button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Rule</button>}
      />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Pricing Rule' : 'Add New Pricing Rule'} subtitle="Define markup and GST settings">
{error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Rule Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.rule_name} onChange={e => setForm(p => ({ ...p, rule_name: e.target.value }))} placeholder="Kerala Standard 2025" /></div>
            <div><label className={lbl} style={lblStyle}>Applies To <span style={{ color: '#EF4444' }}>*</span></label>
              <select className={sel} style={inpStyle} value={form.applies_to} onChange={e => setForm(p => ({ ...p, applies_to: e.target.value }))}>
                {APPLIES_TO.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Markup Type <span style={{ color: '#EF4444' }}>*</span></label>
              <select className={sel} style={inpStyle} value={form.markup_type} onChange={e => setForm(p => ({ ...p, markup_type: e.target.value }))}>
                {MARKUP_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Markup Value {form.markup_type === 'PERCENTAGE' ? '(%)' : '(₹)'} <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" className={inp} style={inpStyle} value={form.markup_value} onChange={e => setForm(p => ({ ...p, markup_value: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>GST % <span style={{ color: '#EF4444' }}>*</span></label><input type="number" min="0" max="100" step="0.5" className={inp} style={inpStyle} value={form.gst_percent} onChange={e => setForm(p => ({ ...p, gst_percent: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Rounding Rule</label>
              <select className={sel} style={inpStyle} value={form.rounding_rule} onChange={e => setForm(p => ({ ...p, rounding_rule: e.target.value }))}>
                {ROUNDING_RULES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={lblStyle}>Valid From <span style={{ color: '#EF4444' }}>*</span></label><input type="date" className={inp} style={inpStyle} value={form.valid_from} onChange={e => setForm(p => ({ ...p, valid_from: e.target.value }))} /></div>
            <div><label className={lbl} style={lblStyle}>Valid To <span style={{ color: '#EF4444' }}>*</span></label><input type="date" className={inp} style={inpStyle} value={form.valid_to} onChange={e => setForm(p => ({ ...p, valid_to: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Rule'}</button>
          </div>
      </Modal>
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} rule${filtered.length !== 1 ? 's' : ''}`}</p>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rules…" className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white" style={{ borderColor: '#E2E8F0' }} /></div>
        </div>
        {loading ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0 ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No pricing rules found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first pricing rule'}</p></div>
          : <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Rule Name', 'Applies To', 'Markup', 'GST', 'Rounding', 'Valid From', 'Valid To', 'Status', ''].map(h => <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#0F172A' }}>{r.rule_name}</td>
                    <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{r.applies_to}</span></td>
                    <td className="px-5 py-0 font-semibold" style={{ color: '#134956' }}>{r.markup_type === 'PERCENTAGE' ? `${r.markup_value}%` : `₹${r.markup_value.toLocaleString('en-IN')}`}</td>
                    <td className="px-5 py-0 text-sm font-medium" style={{ color: '#64748B' }}>{r.gst_percent}%</td>
                    <td className="px-5 py-0 text-xs" style={{ color: '#94A3B8' }}>{r.rounding_rule.replace(/_/g, ' ')}</td>
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
