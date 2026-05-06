'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search, Phone, Mail, Plus, X, Calendar, ChevronDown, AlertTriangle,
  Loader2, Edit2, ChevronRight, CheckSquare, Square, ChevronLeft, ExternalLink,
  Save, User,
} from 'lucide-react';

interface Stage    { id: string; name: string; color: string }
interface Pipeline { id: string; name: string }
interface Lead     {
  id: string; name: string; status: string; created_at: string;
  stage: Stage | null; pipeline: Pipeline | null;
  _count?: { call_logs: number; lead_notes: number };
}
interface Owner { id: string; name: string; email: string }

interface Contact {
  id: string; name: string; phone: string; email: string | null;
  source: string | null; notes: string | null;
  is_converted: boolean; converted_at: string | null; created_at: string;
  owner: Owner | null; owner_id: string; leads: Lead[];
}

interface DuplicateAttempt {
  id: string; phone: string; created_at: string;
  attempted_by_user:   { name: string } | null;
  existing_owner_user: { name: string } | null;
}

interface CrmUser { id: string; name: string; role: string }

const DATE_RANGES = [
  { label: 'All time',    value: '' },
  { label: 'Today',       value: 'today' },
  { label: 'Yesterday',   value: 'yesterday' },
  { label: 'This week',   value: 'this_week' },
  { label: 'Past 7 days', value: 'past_7' },
  { label: 'Custom',      value: 'custom' },
];

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Create Contact Modal ────────────────────────────────────────────────────
function CreateContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setError('Name and phone are required'); return; }
    setSaving(true); setError('');
    const res  = await fetch('/api/v1/crm/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    setSaving(false);
    if (data.success) { onCreated(); onClose(); }
    else setError(data.error ?? 'Failed to create contact');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl w-[440px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="font-bold" style={{ color: '#0F172A' }}>New Contact</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]"><X className="w-4 h-4" style={{ color: '#64748B' }} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-3">
          {[
            { label: 'Name *',  key: 'name',   type: 'text',  ph: 'Full name' },
            { label: 'Phone *', key: 'phone',  type: 'tel',   ph: '+91 98765 43210' },
            { label: 'Email',   key: 'email',  type: 'email', ph: 'email@example.com' },
            { label: 'Source',  key: 'source', type: 'text',  ph: 'Facebook, Google, Referral...' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>{f.label}</label>
              <input type={f.type} value={(form as Record<string,string>)[f.key]} placeholder={f.ph}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }} />
            </div>
          ))}
          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2" style={{ backgroundColor: '#134956' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Creating...' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Contact Detail Panel ────────────────────────────────────────────────────
function ContactPanel({
  contact, users, onClose, onUpdated,
}: {
  contact: Contact; users: CrmUser[]; onClose: () => void; onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<Contact | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ name: contact.name, email: contact.email ?? '', source: contact.source ?? '', notes: contact.notes ?? '', owner_id: contact.owner_id });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    fetch(`/api/v1/crm/contacts/${contact.id}`).then(r => r.json()).then(d => { if (d.success) setDetail(d.data); });
  }, [contact.id]);

  const c = detail ?? contact;

  async function save() {
    setSaving(true); setError('');
    const res  = await fetch(`/api/v1/crm/contacts/${contact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    setSaving(false);
    if (data.success) { setEditing(false); onUpdated(); setDetail(prev => prev ? { ...prev, ...data.data } : prev); }
    else setError(data.error ?? 'Failed to save');
  }

  const withPipeline = c.leads.filter(l => l.pipeline !== null).length;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[520px] bg-white flex flex-col shadow-2xl overflow-hidden" style={{ borderLeft: '1px solid #E2E8F0' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: c.is_converted ? '#22C55E' : '#134956' }}>
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: '#0F172A' }}>{c.name}</p>
              <p className="text-xs" style={{ color: '#64748B' }}>{c.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]"><X className="w-4 h-4" style={{ color: '#64748B' }} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Badges */}
          <div className="px-6 py-3 flex gap-2 flex-wrap" style={{ borderBottom: '1px solid #F1F5F9' }}>
            {c.is_converted && <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>Converted</span>}
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>{c.leads.length} deal{c.leads.length !== 1 ? 's' : ''}</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>{withPipeline} in pipeline</span>
          </div>

          {/* Edit form / read view */}
          <div className="px-6 py-4 space-y-4">
            {editing ? (
              <>
                {[
                  { label: 'Name',   key: 'name',   type: 'text' },
                  { label: 'Email',  key: 'email',  type: 'email' },
                  { label: 'Source', key: 'source', type: 'text' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>{f.label}</label>
                    <input type={f.type} value={(form as Record<string,string>)[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Contact Owner</label>
                  <div className="relative">
                    <select value={form.owner_id} onChange={e => setForm(p => ({ ...p, owner_id: e.target.value }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none" style={{ border: '1px solid #D1D5DB' }}>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Notes</label>
                  <textarea value={form.notes} rows={3} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full text-sm rounded-lg px-3 py-2.5 outline-none resize-none" style={{ border: '1px solid #D1D5DB' }} />
                </div>
                {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
                  <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2" style={{ backgroundColor: '#134956' }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {[
                  { label: 'Phone',   value: c.phone },
                  { label: 'Email',   value: c.email ?? '—' },
                  { label: 'Source',  value: c.source ?? '—' },
                  { label: 'Owner',   value: c.owner?.name ?? '—' },
                  { label: 'Created', value: fmtDateTime(c.created_at) },
                  { label: 'Converted', value: c.converted_at ? fmtDateTime(c.converted_at) : '—' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>{f.label}</p>
                    <p className="text-sm" style={{ color: '#0F172A' }}>{f.value}</p>
                  </div>
                ))}
                {c.notes && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>Notes</p>
                    <p className="text-sm" style={{ color: '#64748B' }}>{c.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Deals */}
          {c.leads.length > 0 && (
            <div style={{ borderTop: '1px solid #F1F5F9' }}>
              <div className="px-6 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>Deals</p>
                <div className="space-y-2">
                  {c.leads.map(lead => (
                    <div key={lead.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{lead.name}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                          {lead.pipeline?.name ?? 'No pipeline'} · {fmtDateTime(lead.created_at)}
                        </p>
                      </div>
                      {lead.stage && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white flex-shrink-0" style={{ backgroundColor: lead.stage.color }}>
                          {lead.stage.name}
                        </span>
                      )}
                      <a href="/admin/pipelines" className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white flex-shrink-0" style={{ color: '#94A3B8' }}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const [tab, setTab]             = useState<'contacts' | 'duplicates'>('contacts');
  const [contacts, setContacts]   = useState<Contact[]>([]);
  const [dupes, setDupes]         = useState<DuplicateAttempt[]>([]);
  const [users, setUsers]         = useState<CrmUser[]>([]);
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState('newest');
  const [dateRange, setDateRange] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Contact | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [page, setPage]           = useState(1);
  const PER_PAGE = 100;
  const datePickerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)    params.set('search', search);
    if (sortBy)    params.set('sort', sortBy);
    if (dateRange) params.set('date_range', dateRange);
    if (dateRange === 'custom' && dateFrom) params.set('date_from', dateFrom);
    if (dateRange === 'custom' && dateTo)   params.set('date_to', dateTo);
    const [cRes, uRes] = await Promise.all([
      fetch(`/api/v1/crm/contacts?${params}`),
      fetch('/api/v1/users'),
    ]);
    const [cData, uData] = await Promise.all([cRes.json(), uRes.json()]);
    if (cData.success) setContacts(cData.data);
    if (uData.success) setUsers(Array.isArray(uData.data) ? uData.data : (uData.data?.items ?? []));
    setLoading(false);
    setPage(1);
  }, [search, sortBy, dateRange, dateFrom, dateTo]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  async function loadDupes() {
    const res = await fetch('/api/v1/crm/duplicate-attempts');
    const d   = await res.json();
    if (d.success) setDupes(d.data);
  }

  useEffect(() => { if (tab === 'duplicates') loadDupes(); }, [tab]);

  // Close date picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const paginated    = contacts.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages   = Math.ceil(contacts.length / PER_PAGE);
  const withPipeline = contacts.filter(c => c.leads.some(l => l.pipeline !== null)).length;
  const withoutPipeline = contacts.filter(c => c.leads.every(l => l.pipeline === null) || c.leads.length === 0).length;
  const untouched    = contacts.filter(c => c.leads.every(l => (l._count?.call_logs ?? 0) + (l._count?.lead_notes ?? 0) === 0)).length;

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setCheckedIds(prev => prev.size === paginated.length ? new Set() : new Set(paginated.map(c => c.id)));
  }

  const allChecked = paginated.length > 0 && checkedIds.size === paginated.length;

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8 overflow-hidden">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white px-6 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <h1 className="text-base font-bold mr-2" style={{ color: '#0F172A' }}>Contacts</h1>

        {/* Tabs */}
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: '#F1F5F9' }}>
          {(['contacts', 'duplicates'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize"
              style={{ backgroundColor: tab === t ? '#fff' : 'transparent', color: tab === t ? '#0F172A' : '#64748B', boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>
              {t === 'duplicates' ? `Duplicate Cleanup${dupes.length ? ` (${dupes.length})` : ''}` : 'All Contacts'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {tab === 'contacts' && (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              <input type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg text-xs outline-none" style={{ border: '1px solid #E2E8F0', width: 200 }} />
            </div>

            {/* Date filter */}
            <div className="relative" ref={datePickerRef}>
              <button onClick={() => setShowDatePicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ border: `1px solid ${dateRange ? '#134956' : '#E2E8F0'}`, backgroundColor: dateRange ? '#F0F9FF' : '#fff', color: dateRange ? '#134956' : '#64748B' }}>
                <Calendar className="w-3.5 h-3.5" />
                {DATE_RANGES.find(r => r.value === dateRange)?.label ?? 'All time'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showDatePicker && (
                <div className="absolute top-10 right-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[170px]" style={{ border: '1px solid #E2E8F0' }}>
                  {DATE_RANGES.map(r => (
                    <button key={r.value} onClick={() => { setDateRange(r.value); if (r.value !== 'custom') setShowDatePicker(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-[#F8FAFC]"
                      style={{ color: dateRange === r.value ? '#134956' : '#64748B', fontWeight: dateRange === r.value ? 600 : 400 }}>
                      {r.label}
                    </button>
                  ))}
                  {dateRange === 'custom' && (
                    <div className="px-4 pb-3 space-y-2 pt-1" style={{ borderTop: '1px solid #F1F5F9' }}>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>From</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="w-full text-xs rounded-lg px-2 py-1.5 mt-0.5 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>To</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                          className="w-full text-xs rounded-lg px-2 py-1.5 mt-0.5 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                      </div>
                      <button onClick={() => setShowDatePicker(false)}
                        className="w-full py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: '#134956' }}>Apply</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="text-xs font-medium rounded-lg px-3 py-2 outline-none" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>

            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: '#134956' }}>
              <Plus className="w-3.5 h-3.5" /> Contact
            </button>
          </>
        )}
      </div>

      {tab === 'contacts' ? (
        <>
          {/* Table */}
          <div className="flex-1 overflow-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#134956' }} /></div>
            ) : (
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th className="w-10 px-4 py-3">
                      <button onClick={toggleAll}>
                        {allChecked
                          ? <CheckSquare className="w-4 h-4" style={{ color: '#134956' }} />
                          : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
                      </button>
                    </th>
                    {['Contact Name', 'Email', 'Contact Owner', 'Destination', 'Mobile', 'Lead Source', 'Created Time', ''].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, i) => (
                    <tr key={c.id}
                      onClick={() => setSelected(c)}
                      className="cursor-pointer transition-colors hover:bg-[#F8FAFC]"
                      style={{ borderBottom: i < paginated.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleCheck(c.id)}>
                          {checkedIds.has(c.id)
                            ? <CheckSquare className="w-4 h-4" style={{ color: '#134956' }} />
                            : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: c.is_converted ? '#22C55E' : '#134956' }}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold" style={{ color: '#0F172A' }}>{c.name}</p>
                            {c.is_converted && <span className="text-[10px] font-semibold" style={{ color: '#16A34A' }}>Converted</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>{c.email ? <span className="truncate max-w-[140px] block">{c.email}</span> : '—'}</td>
                      <td className="px-3 py-3">
                        {c.owner ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                              {c.owner.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium" style={{ color: '#0F172A' }}>{c.owner.name}</span>
                          </div>
                        ) : <span className="text-xs" style={{ color: '#94A3B8' }}>—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>
                        {c.leads.find(l => l.name.includes('for'))?.name?.split('for')[1]?.trim() ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                          <Phone className="w-3 h-3" />{c.phone}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>{c.source ?? '—'}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{fmtDateTime(c.created_at)}</td>
                      <td className="px-3 py-3">
                        <ChevronRight className="w-4 h-4" style={{ color: '#CBD5E1' }} />
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-16">
                        <User className="w-8 h-8 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No contacts found</p>
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Contacts are created automatically when a lead is added.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Stats + Pagination bar (Bigin-style) */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white text-xs" style={{ borderTop: '1px solid #E2E8F0', color: '#64748B' }}>
            <div className="flex items-center gap-4 flex-wrap">
              <span>Total Contacts <span className="font-bold" style={{ color: '#0F172A' }}>{contacts.length.toLocaleString()}</span></span>
              <span className="text-[#CBD5E1]">·</span>
              <span>With Open Pipelines <span className="font-bold" style={{ color: '#0F172A' }}>{withPipeline.toLocaleString()}</span></span>
              <span className="text-[#CBD5E1]">·</span>
              <span>Without Pipelines <span className="font-bold" style={{ color: '#0F172A' }}>{withoutPipeline.toLocaleString()}</span></span>
              <span className="text-[#CBD5E1]">·</span>
              <span>Untouched <span className="font-bold" style={{ color: '#0F172A' }}>{untouched.toLocaleString()}</span></span>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span>{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, contacts.length)} of {contacts.length}</span>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9] disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9] disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Duplicate Cleanup Tab */
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="bg-amber-50 rounded-xl px-5 py-4 flex items-start gap-3" style={{ border: '1px solid #FDE68A' }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Duplicate Contact Attempts</p>
              <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>Blocked attempts to add a phone number already owned by another user. Logged automatically.</p>
            </div>
          </div>
          {dupes.length === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No duplicate attempts</p>
            </div>
          ) : (
            <table className="w-full text-sm bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Attempted By', 'Phone', 'Existing Owner', 'Time'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dupes.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < dupes.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: '#0F172A' }}>{d.attempted_by_user?.name ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: '#134956' }}>{d.phone}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: '#64748B' }}>{d.existing_owner_user?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: '#94A3B8' }}>{fmtDateTime(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals & panels */}
      {showCreate && <CreateContactModal onClose={() => setShowCreate(false)} onCreated={load} />}
      {selected && <ContactPanel contact={selected} users={users} onClose={() => setSelected(null)} onUpdated={load} />}
    </div>
  );
}
