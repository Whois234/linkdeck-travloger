'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Search, CheckSquare, Square, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';

interface Customer {
  id: string; name: string; phone: string; email?: string | null;
  city?: string | null; nationality?: string | null; status: boolean;
}
const EMPTY = { name: '', phone: '', email: '', city: '', nationality: 'Indian', whatsapp: '', notes: '' };
const inp      = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const textarea = 'w-full px-3 py-2.5 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors resize-none';
const lbl      = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const T        = '#134956';

type Tab = 'all' | 'duplicates';

export default function CustomersPage() {
  const [rows,      setRows]      = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<Tab>('all');
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState<Customer | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY });
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [keepMap,   setKeepMap]   = useState<Record<string, string>>({}); // phone → id to keep
  const [cleaningPhone, setCleaningPhone] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    const url = q ? `/api/v1/customers?q=${encodeURIComponent(q)}` : '/api/v1/customers';
    const r = await fetch(url); const d = await r.json();
    if (d.success) setRows(Array.isArray(d.data) ? d.data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  // ── Duplicate groups (by phone) ──────────────────────────────────────────────
  const duplicateGroups = useMemo(() => {
    const byPhone = new Map<string, Customer[]>();
    rows.forEach(r => {
      const p = r.phone.replace(/[\s\-\(\)]/g, '');
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p)!.push(r);
    });
    return Array.from(byPhone.entries())
      .filter(([, group]) => group.length > 1)
      .map(([phone, group]) => ({ phone, group }));
  }, [rows]);

  // auto-init keepMap when duplicate groups change
  useEffect(() => {
    setKeepMap(prev => {
      const next = { ...prev };
      duplicateGroups.forEach(({ phone, group }) => {
        if (!next[phone]) next[phone] = group[0].id;
      });
      return next;
    });
  }, [duplicateGroups]);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Customer) {
    setEditing(r);
    setForm({ name: r.name, phone: r.phone, email: r.email ?? '', city: r.city ?? '', nationality: r.nationality ?? 'Indian', whatsapp: '', notes: '' });
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const url    = editing ? `/api/v1/customers/${editing.id}` : '/api/v1/customers';
    const method = editing ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data   = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this customer?')) return;
    await fetch(`/api/v1/customers/${id}`, { method: 'DELETE' });
    load();
  }

  // ── Bulk delete ──────────────────────────────────────────────────────────────
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected customer${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    await Promise.all(Array.from(selected).map(id => fetch(`/api/v1/customers/${id}`, { method: 'DELETE' })));
    setSelected(new Set());
    setBulkDeleting(false);
    load();
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredRows.length && filteredRows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredRows.map(r => r.id)));
    }
  }

  // ── Duplicate cleanup: delete all except the kept one ───────────────────────
  async function cleanDuplicates(phone: string, group: Customer[]) {
    const keepId = keepMap[phone] ?? group[0].id;
    const toDelete = group.filter(c => c.id !== keepId);
    if (!confirm(`Delete ${toDelete.length} duplicate${toDelete.length > 1 ? 's' : ''} for phone ${phone}? The selected record will be kept.`)) return;
    setCleaningPhone(phone);
    await Promise.all(toDelete.map(c => fetch(`/api/v1/customers/${c.id}`, { method: 'DELETE' })));
    setCleaningPhone(null);
    load();
  }

  async function cleanAllDuplicates() {
    const totalToDelete = duplicateGroups.reduce((n, { phone, group }) => {
      const keepId = keepMap[phone] ?? group[0].id;
      return n + group.filter(c => c.id !== keepId).length;
    }, 0);
    if (!confirm(`Remove all ${totalToDelete} duplicate records? The selected "keep" record in each group will be preserved.`)) return;
    setBulkDeleting(true);
    await Promise.all(
      duplicateGroups.flatMap(({ phone, group }) => {
        const keepId = keepMap[phone] ?? group[0].id;
        return group.filter(c => c.id !== keepId).map(c => fetch(`/api/v1/customers/${c.id}`, { method: 'DELETE' }));
      })
    );
    setBulkDeleting(false);
    load();
  }

  const filteredRows = useMemo(() =>
    rows.filter(r =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.includes(search)
    ),
  [rows, search]);

  const allSelected   = filteredRows.length > 0 && selected.size === filteredRows.length;
  const someSelected  = selected.size > 0;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Customers"
        subtitle="Customer database and contact management"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Customers' }]}
        action={<button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}><Plus className="w-4 h-4" /> Add Customer</button>}
      />

      {/* Edit / Create modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Customer' : 'Add New Customer'} subtitle="Fill in customer details">
        {error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={lbl} style={lblStyle}>Full Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ravi Kumar" /></div>
          <div><label className={lbl} style={lblStyle}>Phone <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
          <div><label className={lbl} style={lblStyle}>WhatsApp</label><input className={inp} style={inpStyle} value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="+91 98765 43210" /></div>
          <div><label className={lbl} style={lblStyle}>Email</label><input type="email" className={inp} style={inpStyle} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="customer@email.com" /></div>
          <div><label className={lbl} style={lblStyle}>City</label><input className={inp} style={inpStyle} value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Mumbai" /></div>
          <div><label className={lbl} style={lblStyle}>Nationality</label><input className={inp} style={inpStyle} value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className={lbl} style={lblStyle}>Notes</label><textarea rows={2} className={textarea} style={inpStyle} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any special requirements, preferences…" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: T }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Customer'}</button>
        </div>
      </Modal>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(['all', 'duplicates'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(new Set()); }}
            className="px-4 h-9 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: tab === t ? T : 'white',
              color: tab === t ? 'white' : '#64748B',
              border: `1px solid ${tab === t ? T : '#E2E8F0'}`,
            }}>
            {t === 'all' ? 'All Customers' : (
              <span className="flex items-center gap-2">
                Duplicate Cleanup
                {duplicateGroups.length > 0 && (
                  <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: tab === t ? 'rgba(255,255,255,0.25)' : '#FEE2E2', color: tab === t ? 'white' : '#DC2626' }}>
                    {duplicateGroups.length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ ALL CUSTOMERS TAB ══ */}
      {tab === 'all' && (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold" style={{ color: '#64748B' }}>
                {loading ? 'Loading…' : `${filteredRows.length} customer${filteredRows.length !== 1 ? 's' : ''}`}
              </p>
              {someSelected && (
                <button onClick={handleBulkDelete} disabled={bulkDeleting}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-colors"
                  style={{ backgroundColor: '#DC2626' }}>
                  {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Delete {selected.size} selected
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone…"
                className="w-64 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                style={{ borderColor: '#E2E8F0' }} />
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          ) : filteredRows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No customers found</p>
              <p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first customer'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {/* Select all checkbox */}
                  <th className="px-4 py-3.5 w-10">
                    <button onClick={toggleSelectAll} className="flex items-center justify-center" style={{ color: someSelected ? T : '#CBD5E1' }}>
                      {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  {['Name', 'Phone', 'Email', 'City', 'Nationality', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => {
                  const isChecked = selected.has(r.id);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]"
                      style={{ borderBottom: '1px solid #F1F5F9', height: 56, backgroundColor: isChecked ? '#F0FDF4' : undefined }}>
                      <td className="px-4 py-0">
                        <button onClick={() => toggleSelect(r.id)} style={{ color: isChecked ? T : '#CBD5E1' }}>
                          {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-5 py-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: T }}>
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                          <Link href={`/admin/customers/${r.id}`} className="font-semibold hover:underline" style={{ color: '#0F172A' }}>{r.name}</Link>
                        </div>
                      </td>
                      <td className="px-5 py-0 font-mono text-sm" style={{ color: '#64748B' }}>{r.phone}</td>
                      <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.email ?? '—'}</td>
                      <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.city ?? '—'}</td>
                      <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.nationality ?? '—'}</td>
                      <td className="px-5 py-0">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold"
                          style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>
                          {r.status ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-0">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: '#94A3B8' }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2]" style={{ color: '#94A3B8' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {/* ══ DUPLICATE CLEANUP TAB ══ */}
      {tab === 'duplicates' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-white rounded-xl p-5 flex items-start justify-between gap-4" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: duplicateGroups.length > 0 ? '#FEF2F2' : '#DCFCE7' }}>
                {duplicateGroups.length > 0
                  ? <AlertTriangle className="w-5 h-5" style={{ color: '#DC2626' }} />
                  : <ShieldCheck className="w-5 h-5" style={{ color: '#15803D' }} />}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: '#0F172A' }}>
                  {duplicateGroups.length > 0
                    ? `${duplicateGroups.length} phone number${duplicateGroups.length > 1 ? 's' : ''} with duplicate records`
                    : 'No duplicates found'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                  {duplicateGroups.length > 0
                    ? 'Select which record to keep in each group, then delete the rest.'
                    : 'All customers have unique phone numbers. Your database is clean!'}
                </p>
              </div>
            </div>
            {duplicateGroups.length > 0 && (
              <button onClick={cleanAllDuplicates} disabled={bulkDeleting}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white flex-shrink-0 disabled:opacity-60"
                style={{ backgroundColor: '#DC2626' }}>
                {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remove All Duplicates
              </button>
            )}
          </div>

          {/* Duplicate groups */}
          {duplicateGroups.map(({ phone, group }) => (
            <div key={phone} className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #FECACA', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {/* Group header */}
              <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>
                    {group.length} records
                  </span>
                  <span className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>{phone}</span>
                </div>
                <button onClick={() => cleanDuplicates(phone, group)} disabled={cleaningPhone === phone}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: '#DC2626' }}>
                  {cleaningPhone === phone ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Delete duplicates
                </button>
              </div>

              {/* Rows in group */}
              <div className="divide-y divide-[#F1F5F9]">
                {group.map(c => {
                  const isKeep = (keepMap[phone] ?? group[0].id) === c.id;
                  return (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                      style={{ backgroundColor: isKeep ? '#F0FDF4' : 'white' }}>
                      {/* Radio: keep this one */}
                      <button onClick={() => setKeepMap(p => ({ ...p, [phone]: c.id }))}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                        style={{ borderColor: isKeep ? '#15803D' : '#CBD5E1', backgroundColor: isKeep ? '#15803D' : 'white' }}
                        title="Keep this record">
                        {isKeep && <div className="w-2 h-2 rounded-full bg-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>{c.name}</span>
                          {isKeep && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>KEEP</span>}
                          {!isKeep && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>DELETE</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs font-mono" style={{ color: '#64748B' }}>{c.phone}</span>
                          {c.email && <span className="text-xs" style={{ color: '#94A3B8' }}>{c.email}</span>}
                          {c.city && <span className="text-xs" style={{ color: '#94A3B8' }}>{c.city}</span>}
                        </div>
                      </div>
                      <Link href={`/admin/customers/${c.id}`} className="text-xs font-semibold hover:underline flex-shrink-0" style={{ color: T }}>
                        View →
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
