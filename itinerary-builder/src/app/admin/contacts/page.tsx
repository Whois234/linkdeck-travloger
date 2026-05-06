'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Search, Phone, Mail, User, ExternalLink, ChevronDown, ChevronRight,
  Plus, X, Calendar, ArrowUpDown, AlertTriangle, Users, TrendingUp, Loader2,
} from 'lucide-react';

interface Stage    { id: string; name: string; color: string }
interface Pipeline { id: string; name: string }
interface Lead     { id: string; name: string; status: string; created_at: string; stage: Stage | null; pipeline: Pipeline | null }
interface Owner    { id: string; name: string; email: string }

interface Contact {
  id: string; name: string; phone: string; email: string | null; source: string | null;
  is_converted: boolean; converted_at: string | null; created_at: string;
  owner: Owner | null; leads: Lead[];
}

interface DuplicateAttempt {
  id: string; phone: string; created_at: string;
  attempted_by_user:   { id: string; name: string; email: string } | null;
  existing_owner_user: { id: string; name: string; email: string } | null;
}

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
    const res = await fetch('/api/v1/crm/contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) { onCreated(); onClose(); }
    else setError(data.error ?? 'Failed to create contact');
  }

  function field(label: string, key: keyof typeof form, type = 'text', placeholder = '') {
    return (
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>{label}</label>
        <input type={type} value={form[key]} placeholder={placeholder}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
          style={{ border: '1px solid #D1D5DB', color: '#111827' }}
          onFocus={e => (e.target.style.borderColor = '#134956')}
          onBlur={e => (e.target.style.borderColor = '#D1D5DB')} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl w-[440px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="font-bold text-base" style={{ color: '#0F172A' }}>New Contact</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: '#64748B' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {field('Name *',  'name',   'text',  'Full name')}
          {field('Phone *', 'phone',  'tel',   '+91 98765 43210')}
          {field('Email',   'email',  'email', 'email@example.com')}
          {field('Source',  'source', 'text',  'Facebook, Referral, Walk-in...')}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Notes</label>
            <textarea value={form.notes} rows={2} placeholder="Any additional notes..."
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none resize-none"
              style={{ border: '1px solid #D1D5DB', color: '#111827' }} />
          </div>
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: '#134956' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Creating...' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const [tab, setTab]           = useState<'contacts' | 'duplicates'>('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dupes, setDupes]       = useState<DuplicateAttempt[]>([]);
  const [search, setSearch]     = useState('');
  const [sortBy, setSortBy]     = useState('newest');
  const [dateRange, setDateRange] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)    params.set('search', search);
    if (sortBy)    params.set('sort', sortBy);
    if (dateRange) params.set('date_range', dateRange);
    if (dateRange === 'custom' && dateFrom) params.set('date_from', dateFrom);
    if (dateRange === 'custom' && dateTo)   params.set('date_to', dateTo);
    const res  = await fetch(`/api/v1/crm/contacts?${params}`);
    const data = await res.json();
    if (data.success) setContacts(data.data);
    setLoading(false);
  }, [search, sortBy, dateRange, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function loadDupes() {
    const res  = await fetch('/api/v1/crm/duplicate-attempts');
    const data = await res.json();
    if (data.success) setDupes(data.data);
  }

  useEffect(() => { if (tab === 'duplicates') loadDupes(); }, [tab]);

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const withPipeline    = contacts.filter(c => c.leads.some(l => l.pipeline !== null)).length;
  const withoutPipeline = contacts.filter(c => c.leads.every(l => l.pipeline === null) || c.leads.length === 0).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Contacts</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>All CRM contacts — one contact per phone number</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#134956' }}>
          <Plus className="w-4 h-4" /> New Contact
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Contacts',       value: contacts.length,  icon: Users,      color: '#3B82F6', bg: '#DBEAFE' },
          { label: 'With Pipeline',        value: withPipeline,     icon: TrendingUp, color: '#22C55E', bg: '#DCFCE7' },
          { label: 'Without Pipeline',     value: withoutPipeline,  icon: User,       color: '#F59E0B', bg: '#FEF9C3' },
          { label: 'Duplicate Attempts',   value: dupes.length || '—', icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3" style={{ border: '1px solid #E2E8F0' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: s.bg }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: '#0F172A' }}>{s.value}</p>
              <p className="text-[11px]" style={{ color: '#94A3B8' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F1F5F9' }}>
        {(['contacts', 'duplicates'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize"
            style={{
              backgroundColor: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0F172A' : '#64748B',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {t === 'duplicates' ? `Duplicate Cleanup${dupes.length ? ` (${dupes.length})` : ''}` : 'Contacts'}
          </button>
        ))}
      </div>

      {tab === 'contacts' && (
        <>
          {/* Filters row */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
              <input type="text" placeholder="Search by name, phone or email..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid #E2E8F0', backgroundColor: '#fff', color: '#0F172A' }} />
            </div>

            {/* Date range picker */}
            <div className="relative">
              <button onClick={() => setShowDatePicker(p => !p)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ border: `1px solid ${dateRange ? '#134956' : '#E2E8F0'}`, backgroundColor: dateRange ? '#F0F9FF' : '#fff', color: dateRange ? '#134956' : '#64748B' }}>
                <Calendar className="w-4 h-4" />
                {DATE_RANGES.find(r => r.value === dateRange)?.label ?? 'All time'}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showDatePicker && (
                <div className="absolute top-12 left-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[180px]"
                  style={{ border: '1px solid #E2E8F0' }}>
                  {DATE_RANGES.map(r => (
                    <button key={r.value} onClick={() => { setDateRange(r.value); if (r.value !== 'custom') setShowDatePicker(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-[#F8FAFC]"
                      style={{ color: dateRange === r.value ? '#134956' : '#64748B', fontWeight: dateRange === r.value ? 600 : 400 }}>
                      {r.label}
                    </button>
                  ))}
                  {dateRange === 'custom' && (
                    <div className="px-4 pb-3 space-y-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>From</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="w-full text-sm rounded-lg px-2 py-1.5 mt-1 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>To</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                          className="w-full text-sm rounded-lg px-2 py-1.5 mt-1 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                      </div>
                      <button onClick={() => setShowDatePicker(false)}
                        className="w-full py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#134956' }}>
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium"
              style={{ border: '1px solid #E2E8F0', backgroundColor: '#fff', color: '#64748B' }}>
              <ArrowUpDown className="w-4 h-4" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="outline-none text-sm bg-transparent" style={{ color: '#64748B' }}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>

            {dateRange && (
              <button onClick={() => { setDateRange(''); setDateFrom(''); setDateTo(''); }}
                className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors hover:bg-[#FEF2F2]"
                style={{ color: '#EF4444', border: '1px solid #FEE2E2' }}>
                <X className="w-3 h-3" /> Clear filter
              </button>
            )}

            <div className="text-sm font-medium px-3 py-2 rounded-xl" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>
              {contacts.length} contacts
            </div>
          </div>

          {/* Contact list */}
          {loading ? (
            <div className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: '#134956' }} /></div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-16">
              <User className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No contacts found</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Contacts are created automatically when a lead is added, or you can create one manually.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map(contact => {
                const isOpen = expanded.has(contact.id);
                return (
                  <div key={contact.id} className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                    <div className="flex items-center gap-4 px-5 py-4">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: contact.is_converted ? '#22C55E' : '#134956' }}>
                        {contact.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{contact.name}</p>
                          {contact.is_converted && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>Converted</span>
                          )}
                        </div>
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                          <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                            <Phone className="w-3 h-3" />{contact.phone}
                          </span>
                          {contact.email && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                              <Mail className="w-3 h-3" />{contact.email}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: '#CBD5E1' }}>{fmtDateTime(contact.created_at)}</p>
                      </div>

                      {/* Owner */}
                      <div className="hidden md:flex flex-col items-end gap-0.5 text-right">
                        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#CBD5E1' }}>Owner</span>
                        <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{contact.owner?.name ?? '—'}</span>
                      </div>

                      {/* Deals + expand */}
                      <div className="flex items-center gap-3">
                        <div className="text-center hidden sm:block">
                          <p className="text-lg font-bold" style={{ color: '#0F172A' }}>{contact.leads.length}</p>
                          <p className="text-[10px]" style={{ color: '#94A3B8' }}>deals</p>
                        </div>
                        <button onClick={() => toggleExpand(contact.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F8FAFC]"
                          style={{ color: '#64748B' }}>
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                        <div className="px-5 py-3">
                          {contact.leads.length === 0 ? (
                            <p className="text-xs" style={{ color: '#94A3B8' }}>No deals yet. Add this contact as a lead in a pipeline.</p>
                          ) : (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>Deals</p>
                              <div className="space-y-2">
                                {contact.leads.map(lead => (
                                  <div key={lead.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-2.5" style={{ border: '1px solid #E2E8F0' }}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{lead.name}</p>
                                      <p className="text-[11px]" style={{ color: '#94A3B8' }}>
                                        {lead.pipeline?.name ?? 'No pipeline'} · {fmtDateTime(lead.created_at)}
                                      </p>
                                    </div>
                                    {lead.stage && (
                                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white flex-shrink-0"
                                        style={{ backgroundColor: lead.stage.color }}>
                                        {lead.stage.name}
                                      </span>
                                    )}
                                    <a href={`/admin/pipelines`}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F8FAFC] flex-shrink-0"
                                      style={{ color: '#94A3B8' }}>
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'duplicates' && (
        <div className="space-y-4">
          <div className="bg-amber-50 rounded-xl px-5 py-4 flex items-start gap-3" style={{ border: '1px solid #FDE68A' }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Duplicate Contact Attempts</p>
              <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>
                These are attempts by team members to add a contact with a phone number already owned by another user.
                The attempt was blocked and logged here for your review.
              </p>
            </div>
          </div>

          {dupes.length === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No duplicate attempts</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>When someone tries to add an existing contact, it will show up here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dupes.map(d => (
                <div key={d.id} className="bg-white rounded-xl px-5 py-4 flex items-center gap-4" style={{ border: '1px solid #FDE68A' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FEF9C3' }}>
                    <AlertTriangle className="w-4 h-4" style={{ color: '#D97706' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                        {d.attempted_by_user?.name ?? 'Unknown user'}
                      </span>
                      <span className="text-sm" style={{ color: '#64748B' }}>tried to add</span>
                      <span className="font-mono text-sm font-semibold" style={{ color: '#134956' }}>{d.phone}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                      Owned by <span className="font-semibold">{d.existing_owner_user?.name ?? 'Unknown'}</span>
                      {' · '}{fmtDateTime(d.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateContactModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}
