'use client';
import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Pencil, Trash2, Search, X, Phone, Mail, MapPin, User, Building2 } from 'lucide-react';
import ExcelIO from '@/components/ExcelIO';

const SUPPLIER_TYPES = ['HOTEL', 'VEHICLE', 'ACTIVITY', 'DMC', 'OTHER'];
interface Supplier {
  id: string; name: string; supplier_type: string;
  contact_person?: string | null; phone?: string | null;
  email?: string | null; address?: string | null;
  status: boolean; created_at: string;
}
type SortKey = 'newest' | 'oldest' | 'az' | 'za' | 'type_az';
const EMPTY = { name: '', supplier_type: 'HOTEL', contact_person: '', phone: '', email: '', address: '' };
const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  HOTEL:    { bg: '#DBEAFE', text: '#1D4ED8' },
  VEHICLE:  { bg: '#CCFBF1', text: '#0F766E' },
  ACTIVITY: { bg: '#DCFCE7', text: '#15803D' },
  DMC:      { bg: '#EDE9FE', text: '#6D28D9' },
  OTHER:    { bg: '#F1F5F9', text: '#475569' },
};

export default function SuppliersPage() {
  const [rows, setRows]             = useState<Supplier[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<Supplier | null>(null);
  const [form, setForm]             = useState({ ...EMPTY });
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [sortKey, setSortKey]       = useState<SortKey>('newest');
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [pageSize, setPageSize]     = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [detail, setDetail]         = useState<Supplier | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/v1/suppliers');
    const d = await r.json();
    if (d.success) setRows(d.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setError(''); setShowForm(true); }
  function openEdit(r: Supplier) {
    setEditing(r);
    setForm({
      name: r.name,
      supplier_type: r.supplier_type,
      contact_person: r.contact_person ?? '',
      phone: r.phone ?? '',
      email: r.email ?? '',
      address: r.address ?? '',
    });
    setError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setError('');
    const payload = {
      ...form,
      // Send null for empty optional fields so Zod validation passes
      contact_person: form.contact_person || null,
      phone:          form.phone || null,
      email:          form.email || null,
      address:        form.address || null,
    };
    const url = editing ? `/api/v1/suppliers/${editing.id}` : '/api/v1/suppliers';
    const res  = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); } else { setShowForm(false); load(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this supplier?')) return;
    setDeleting(id); await fetch(`/api/v1/suppliers/${id}`, { method: 'DELETE' }); setDeleting(null); load();
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Deactivate ${selected.size} selected item${selected.size !== 1 ? 's' : ''}?`)) return;
    setBulkDeleting(true);
    await Promise.all(Array.from(selected).map(id => fetch(`/api/v1/suppliers/${id}`, { method: 'DELETE' })));
    setBulkDeleting(false); setSelected(new Set()); load();
  }

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortKey === 'newest')  arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortKey === 'oldest') arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (sortKey === 'az') arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortKey === 'za') arr.sort((a, b) => b.name.localeCompare(a.name));
    else if (sortKey === 'type_az') arr.sort((a, b) => a.supplier_type.localeCompare(b.supplier_type));
    return arr;
  }, [rows, sortKey]);

  const filtered   = sorted.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.supplier_type.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated  = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="max-w-[1400px]">
      <PageHeader title="Suppliers" subtitle="Manage hotel, vehicle and activity suppliers" crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Suppliers' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ExcelIO
              moduleName="Suppliers"
              columns={[
                { key: 'name',           label: 'Supplier Name *',                         example: 'Ratan Hotels Pvt Ltd' },
                { key: 'supplier_type',  label: 'Type * (HOTEL/VEHICLE/ACTIVITY/DMC/OTHER)', example: 'HOTEL' },
                { key: 'contact_person', label: 'Contact Person',                           example: 'John Doe' },
                { key: 'phone',          label: 'Phone',                                   example: '+91 98765 43210' },
                { key: 'email',          label: 'Email',                                   example: 'supplier@email.com' },
                { key: 'address',        label: 'City',                                    example: 'Munnar, Kerala' },
              ]}
              rows={rows}
              rowMapper={r => ({
                'Supplier Name *': r.name,
                'Type * (HOTEL/VEHICLE/ACTIVITY/DMC/OTHER)': r.supplier_type,
                'Contact Person': r.contact_person ?? '',
                'Phone': r.phone ?? '',
                'Email': r.email ?? '',
                'City': r.address ?? '',
              })}
              importMapper={r => ({
                name:           r['Supplier Name *'],
                supplier_type:  r['Type * (HOTEL/VEHICLE/ACTIVITY/DMC/OTHER)'] || 'OTHER',
                contact_person: r['Contact Person'] || null,
                phone:          r['Phone'] || null,
                email:          r['Email'] || null,
                address:        r['City'] || null,
              })}
              importUrl="/api/v1/suppliers"
              onImportDone={load}
            />
            <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90" style={{ backgroundColor: '#134956' }}><Plus className="w-4 h-4" /> Add Supplier</button>
          </div>
        }
      />

      {/* ── Add / Edit Modal ── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Supplier' : 'Add New Supplier'} subtitle="Fill in the supplier details">
        {error && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={lbl} style={lblStyle}>Supplier Name <span style={{ color: '#EF4444' }}>*</span></label><input className={inp} style={inpStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ratan Hotels Pvt Ltd" /></div>
          <div><label className={lbl} style={lblStyle}>Type <span style={{ color: '#EF4444' }}>*</span></label>
            <select className={sel} style={inpStyle} value={form.supplier_type} onChange={e => setForm(p => ({ ...p, supplier_type: e.target.value }))}>
              {SUPPLIER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className={lbl} style={lblStyle}>Contact Person</label><input className={inp} style={inpStyle} value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} placeholder="John Doe" /></div>
          <div><label className={lbl} style={lblStyle}>Phone</label><input className={inp} style={inpStyle} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
          <div><label className={lbl} style={lblStyle}>Email</label><input type="email" className={inp} style={inpStyle} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="supplier@email.com" /></div>
          <div><label className={lbl} style={lblStyle}>City / Location</label><input className={inp} style={inpStyle} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Munnar, Kerala" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Supplier'}</button>
        </div>
      </Modal>

      {/* ── Detail popup ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 flex items-start justify-between" style={{ background: '#F0F7F9', borderBottom: '1px solid #E2E8F0' }}>
              <div>
                <p className="font-bold text-base" style={{ color: '#0F172A' }}>{detail.name}</p>
                <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-md text-xs font-semibold"
                  style={{ backgroundColor: (TYPE_BADGE[detail.supplier_type] ?? TYPE_BADGE.OTHER).bg, color: (TYPE_BADGE[detail.supplier_type] ?? TYPE_BADGE.OTHER).text }}>
                  {detail.supplier_type}
                </span>
              </div>
              <button onClick={() => setDetail(null)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white transition-colors" style={{ color: '#94A3B8' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              {[
                { icon: <User className="w-4 h-4" />,      label: 'Contact',  value: detail.contact_person },
                { icon: <Phone className="w-4 h-4" />,     label: 'Phone',    value: detail.phone },
                { icon: <Mail className="w-4 h-4" />,      label: 'Email',    value: detail.email },
                { icon: <MapPin className="w-4 h-4" />,    label: 'City',     value: detail.address },
                { icon: <Building2 className="w-4 h-4" />, label: 'Status',   value: detail.status ? 'Active' : 'Inactive' },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0" style={{ color: '#94A3B8' }}>{icon}</span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{label}</p>
                    <p className="text-sm" style={{ color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0" style={{ color: '#94A3B8' }}><Building2 className="w-4 h-4" /></span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Added</p>
                  <p className="text-sm" style={{ color: '#0F172A' }}>
                    {new Date(detail.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
            {/* Footer actions */}
            <div className="px-5 py-3 flex gap-2" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => { setDetail(null); openEdit(detail); }}
                className="flex-1 h-9 rounded-lg text-sm font-semibold transition-colors hover:opacity-90 flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#134956', color: '#fff' }}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => setDetail(null)}
                className="flex-1 h-9 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F1F5F9]"
                style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold" style={{ color: '#64748B' }}>{loading ? 'Loading…' : `${filtered.length} supplier${filtered.length !== 1 ? 's' : ''}`}</p>
            {selected.size > 0 && (
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} selected`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={sortKey} onChange={e => { setSortKey(e.target.value as SortKey); setCurrentPage(1); setSelected(new Set()); }}
              className="h-9 px-3 rounded-lg border text-sm focus:outline-none bg-white appearance-none"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
              <option value="type_az">Type A → Z</option>
            </select>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); setSelected(new Set()); }}
              className="h-9 px-3 rounded-lg border text-sm focus:outline-none bg-white appearance-none"
              style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); setSelected(new Set()); }}
                placeholder="Search suppliers…"
                className="w-60 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                style={{ borderColor: '#E2E8F0' }} />
            </div>
          </div>
        </div>

        {loading
          ? <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          : filtered.length === 0
            ? <div className="py-16 text-center"><p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No suppliers found</p><p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Add your first supplier'}</p></div>
            : <>
              <table className="w-full text-sm">
                <thead><tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th className="px-5 py-3.5 w-10">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
                      checked={paginated.length > 0 && paginated.every(r => selected.has(r.id))}
                      onChange={e => {
                        if (e.target.checked) setSelected(prev => new Set([...Array.from(prev), ...paginated.map(r => r.id)]));
                        else setSelected(prev => { const n = new Set(prev); paginated.forEach(r => n.delete(r.id)); return n; });
                      }} />
                  </th>
                  {['Name', 'Type', 'Contact', 'Phone', 'City', 'Status', 'Created By', 'Created', ''].map(h =>
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {paginated.map(r => {
                    const badge = TYPE_BADGE[r.supplier_type] ?? TYPE_BADGE.OTHER;
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                        <td className="px-5 py-0 w-10">
                          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#134956] cursor-pointer"
                            checked={selected.has(r.id)}
                            onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} />
                        </td>
                        {/* Clickable name → detail popup */}
                        <td className="px-5 py-0">
                          <button onClick={() => setDetail(r)}
                            className="font-semibold text-left hover:underline underline-offset-2 transition-colors"
                            style={{ color: '#134956' }}>
                            {r.name}
                          </button>
                        </td>
                        <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>{r.supplier_type}</span></td>
                        <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.contact_person ?? '—'}</td>
                        <td className="px-5 py-0 text-sm font-mono" style={{ color: '#64748B' }}>{r.phone ?? '—'}</td>
                        <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{r.address ?? '—'}</td>
                        <td className="px-5 py-0"><span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={r.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>{r.status ? 'Active' : 'Inactive'}</span></td>
                        <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>Admin</td>
                        <td className="px-5 py-0 text-sm whitespace-nowrap" style={{ color: '#64748B' }}>
                          {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-0"><div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#134956')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#FEF2F2] disabled:opacity-40" style={{ color: '#94A3B8' }} onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')} onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#F1F5F9] transition-colors" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>← Prev</button>
                    <span className="text-xs px-2" style={{ color: '#64748B' }}>Page {currentPage} of {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-[#F1F5F9] transition-colors" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Next →</button>
                  </div>
                </div>
              )}
            </>}
      </div>
    </div>
  );
}
