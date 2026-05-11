'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useContacts, useUsers, QK } from '@/lib/query-hooks';
import { TableSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toaster';
import {
  Search, Phone, Mail, Plus, X, Calendar, ChevronDown, AlertTriangle,
  Loader2, Edit2, ChevronRight, CheckSquare, Square, ChevronLeft, ExternalLink,
  Save, User, Trash2, Tag as TagIcon, Check, Download, Filter as FilterIcon,
} from 'lucide-react';
import Link from 'next/link';

interface Stage    { id: string; name: string; color: string }
interface Pipeline { id: string; name: string }
interface Lead     {
  id: string; name: string; status: string; created_at: string;
  destination_interest: string | null;
  stage: Stage | null; pipeline: Pipeline | null;
  _count?: { call_logs: number; lead_notes: number };
}
interface Owner { id: string; name: string; email: string }

interface QuoteEvent { id: string; event_type: string; metadata: Record<string, unknown> | null; created_at: string }
interface ContactQuote {
  id: string; quote_number: string; quote_type: string; status: string;
  start_date: string; adults: number; public_token: string; created_at: string;
  state: { name: string; code: string };
  quote_options: Array<{ final_price: number | null; is_most_popular: boolean }>;
  events: QuoteEvent[];
}

interface ContactTag { id: string; name: string; color: string }

type LeadStage  = 'NEW' | 'CONTACTED' | 'FOLLOW_UP' | 'HOT' | 'CONVERTED' | 'LOST';
type LeadSource = 'CTWA' | 'META_LEAD_FORM' | 'GOOGLE_ADS' | 'WEBSITE' | 'WALK_IN' | 'REFERRAL';
type TripType   = 'GROUP' | 'PRIVATE';

interface Contact {
  id: string; name: string; phone: string; email: string | null;
  source: string | null; notes: string | null;
  is_converted: boolean; converted_at: string | null; created_at: string;
  last_known_city: string | null; last_seen_at: string | null;
  city: string | null;
  tags: string[];
  custom_fields: Record<string, unknown> | null;
  owner: Owner | null; owner_id: string;
  leads: Lead[];
  quotes?: ContactQuote[];

  // Travel interest
  interested_destination: string | null;
  number_of_travellers:   number | null;
  trip_type:              TripType | null;
  special_requirements:   string | null;
  budget_per_person:      string | number | null; // Decimal serialises to string

  // Lead source & CRM
  lead_source:    LeadSource | null;
  lead_stage:     LeadStage;
  assigned_to_id: string | null;
  assigned_to:    Owner | null;
  follow_up_date: string | null;
  closed_date:    string | null;
  booking_value:  string | number | null;
  do_not_contact: boolean;
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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtINR(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ─── Badge styling ───────────────────────────────────────────────────────────

const STAGE_BADGE: Record<LeadStage, { bg: string; color: string; label: string }> = {
  NEW:       { bg: '#DBEAFE', color: '#1D4ED8', label: 'New' },
  CONTACTED: { bg: '#FEF3C7', color: '#B45309', label: 'Contacted' },
  FOLLOW_UP: { bg: '#FFEDD5', color: '#C2410C', label: 'Follow up' },
  HOT:       { bg: '#FEE2E2', color: '#DC2626', label: 'Hot' },
  CONVERTED: { bg: '#DCFCE7', color: '#15803D', label: 'Converted' },
  LOST:      { bg: '#F1F5F9', color: '#64748B', label: 'Lost' },
};

const SOURCE_BADGE: Record<LeadSource, { bg: string; color: string; label: string }> = {
  CTWA:           { bg: '#DCFCE7', color: '#15803D', label: 'CTWA' },
  META_LEAD_FORM: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Meta Lead Form' },
  GOOGLE_ADS:     { bg: '#FEF3C7', color: '#B45309', label: 'Google Ads' },
  WEBSITE:        { bg: '#EDE9FE', color: '#6D28D9', label: 'Website' },
  WALK_IN:        { bg: '#E0F2F1', color: '#134956', label: 'Walk-in' },
  REFERRAL:       { bg: '#FCE7F3', color: '#BE185D', label: 'Referral' },
};

const TRIP_TYPE_BADGE: Record<TripType, { bg: string; color: string; label: string }> = {
  GROUP:   { bg: '#E0E7FF', color: '#4338CA', label: 'Group' },
  PRIVATE: { bg: '#CFFAFE', color: '#0E7490', label: 'Private' },
};

const STAGES: LeadStage[]  = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'HOT', 'CONVERTED', 'LOST'];
const SOURCES: LeadSource[] = ['CTWA', 'META_LEAD_FORM', 'GOOGLE_ADS', 'WEBSITE', 'WALK_IN', 'REFERRAL'];

function Chip({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color }}>
      {children}
    </span>
  );
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
    try {
      const res  = await fetch('/api/v1/crm/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) {
        toast.success(`Contact ${form.name.trim()} added`);
        onCreated();
        onClose();
      } else {
        const msg = data.error ?? 'Failed to create contact';
        setError(msg);
        toast.error(msg);
      }
    } catch {
      const msg = 'Network error — please try again';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
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
  contact, users, allTags, onClose, onUpdated,
}: {
  contact: Contact; users: CrmUser[]; allTags: ContactTag[]; onClose: () => void; onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<Contact | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ name: contact.name, phone: contact.phone, email: contact.email ?? '', source: contact.source ?? '', notes: contact.notes ?? '', owner_id: contact.owner_id });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/v1/crm/contacts/${contact.id}`).then(r => r.json()).then(d => { if (d.success) setDetail(d.data); }).catch(() => {});
  }, [contact.id]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) setShowTagPicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function toggleTag(name: string) {
    const current = detail?.tags ?? contact.tags ?? [];
    const next = current.includes(name) ? current.filter(t => t !== name) : [...current, name];
    const res = await fetch(`/api/v1/crm/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: next }),
    });
    const data = await res.json();
    if (data.success) {
      setDetail(prev => prev ? { ...prev, tags: next } : prev);
      onUpdated();
    }
  }

  const c = detail ?? contact;

  async function save() {
    setSaving(true); setError('');
    const res  = await fetch(`/api/v1/crm/contacts/${contact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    setSaving(false);
    if (data.success) { setEditing(false); onUpdated(); setDetail(prev => prev ? { ...prev, ...data.data } : prev); }
    else setError(data.error ?? 'Failed to save');
  }

  async function deleteContact() {
    setDeleting(true);
    await fetch(`/api/v1/crm/contacts/${contact.id}`, { method: 'DELETE' });
    setDeleting(false);
    onClose(); onUpdated();
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
            {!editing && !confirmDelete && (
              <>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[#FEF2F2]" style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: '#DC2626' }}>Sure?</span>
                <button onClick={deleteContact} disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1"
                  style={{ backgroundColor: '#DC2626' }}>
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Yes, delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  Cancel
                </button>
              </div>
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

          {/* Tags */}
          <div className="px-6 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Tags</p>
              <div className="relative" ref={tagPickerRef}>
                <button onClick={() => setShowTagPicker(p => !p)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg hover:bg-[#F1F5F9]"
                  style={{ color: '#134956' }}>
                  <TagIcon className="w-3 h-3" /> Edit
                </button>
                {showTagPicker && (
                  <div className="absolute top-7 right-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[220px] max-h-[300px] overflow-y-auto" style={{ border: '1px solid #E2E8F0' }}>
                    {allTags.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-center" style={{ color: '#94A3B8' }}>No tags. Create them in CRM Settings.</p>
                    ) : allTags.map(t => {
                      const on = (c.tags ?? []).includes(t.name);
                      return (
                        <button key={t.id} onClick={() => toggleTag(t.name)}
                          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-[#F8FAFC] flex items-center gap-2">
                          <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: on ? t.color : '#fff', border: `1px solid ${on ? t.color : '#CBD5E1'}` }}>
                            {on && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          <span style={{ color: '#0F172A' }}>{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {(c.tags ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: '#94A3B8' }}>No tags assigned yet.</p>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {(c.tags ?? []).map(name => {
                  const tag = allTags.find(t => t.name === name);
                  const color = tag?.color ?? '#64748B';
                  return (
                    <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: color + '20', color, border: `1px solid ${color}40` }}>
                      {name}
                      <button onClick={() => toggleTag(name)} className="hover:opacity-70">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Edit form / read view */}
          <div className="px-6 py-4 space-y-4">
            {editing ? (
              <>
                {[
                  { label: 'Name',   key: 'name',   type: 'text' },
                  { label: 'Phone',  key: 'phone',  type: 'tel' },
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
                  { label: 'Last Known City', value: c.last_known_city ? `📍 ${c.last_known_city}` : '—' },
                  { label: 'Last Seen', value: c.last_seen_at ? fmtDateTime(c.last_seen_at) : '—' },
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

          {/* Quotes — previous quotes given to this contact with customer interaction events */}
          {(c.quotes && c.quotes.length > 0) && (
            <div style={{ borderTop: '1px solid #F1F5F9' }}>
              <div className="px-6 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>Quotes ({c.quotes.length})</p>
                <div className="space-y-3">
                  {c.quotes.map(q => {
                    const popular = q.quote_options.find(o => o.is_most_popular);
                    const price   = popular?.final_price ?? q.quote_options[0]?.final_price ?? null;
                    return (
                      <div key={q.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', backgroundColor: '#FAFBFC' }}>
                        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: q.events.length > 0 ? '1px solid #F1F5F9' : undefined, backgroundColor: '#fff' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={`/admin/quotes/${q.id}`} className="text-xs font-mono font-bold hover:underline" style={{ color: '#134956' }}>{q.quote_number}</a>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{q.quote_type}</span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: '#EDE9FE', color: '#6D28D9' }}>{q.status}</span>
                            </div>
                            <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>
                              {q.state.name} · {q.adults} pax · Created {fmtDateTime(q.created_at)}
                            </p>
                          </div>
                          {price != null && (
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: '#134956' }}>₹{Math.round(price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                            </div>
                          )}
                          <a href={`/quotations/${q.public_token}`} target="_blank" rel="noopener noreferrer"
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9] flex-shrink-0"
                            style={{ color: '#94A3B8' }} title="Open public quote">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        {q.events.length > 0 && (
                          <div className="px-4 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Customer Interactions</p>
                            <div className="space-y-1.5">
                              {q.events.map(ev => {
                                const meta = (ev.metadata ?? {}) as Record<string, unknown>;
                                const city    = typeof meta.city === 'string' ? meta.city : null;
                                const device  = typeof meta.device === 'string' ? meta.device : null;
                                const browser = typeof meta.browser === 'string' ? meta.browser : null;
                                const labels: Record<string, string> = {
                                  quote_viewed:     '👀 Viewed quote',
                                  whatsapp_clicked: '💬 Clicked WhatsApp',
                                  booking_intent:   '🎉 Booking intent',
                                  rating_submitted: '⭐ Submitted rating',
                                  batch_selected:   '📅 Selected departure',
                                  package_selected: '📦 Selected package',
                                };
                                const label = labels[ev.event_type] ?? ev.event_type;
                                const extras: string[] = [];
                                if (city) extras.push(`📍 ${city}`);
                                if (device) extras.push(device);
                                if (browser) extras.push(browser);
                                return (
                                  <div key={ev.id} className="flex items-start gap-2 text-[11px]">
                                    <span className="font-medium flex-shrink-0" style={{ color: '#0F172A' }}>{label}</span>
                                    <span className="flex-1" style={{ color: '#64748B' }}>
                                      {extras.length > 0 && <span className="mr-2">{extras.join(' · ')}</span>}
                                    </span>
                                    <span className="flex-shrink-0 whitespace-nowrap" style={{ color: '#94A3B8' }}>{fmtDateTime(ev.created_at)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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
  const [dupes, setDupes]         = useState<DuplicateAttempt[]>([]);
  const [search, setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy]       = useState('newest');
  const [dateRange, setDateRange] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selected, setSelected]   = useState<Contact | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [page, setPage]           = useState(1);
  const [allTags, setAllTags]     = useState<ContactTag[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);

  // New filters per Part 4 spec
  const [stageFilter,       setStageFilter]       = useState<LeadStage[]>([]);
  const [sourceFilter,      setSourceFilter]      = useState<LeadSource[]>([]);
  const [assignedFilter,    setAssignedFilter]    = useState<string>(''); // user id or 'unassigned'
  const [destinationFilter, setDestinationFilter] = useState('');
  const [tripTypeFilter,    setTripTypeFilter]    = useState<TripType | ''>('');

  const PER_PAGE = 20;
  const datePickerRef = useRef<HTMLDivElement>(null);
  const tagFilterRef  = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    fetch('/api/v1/crm/contact-tags').then(r => r.json()).then(d => { if (d.success) setAllTags(Array.isArray(d.data) ? d.data : []); }).catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) setShowTagFilter(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounce search so we don't fire a query on every keystroke
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [sortBy, dateRange, dateFrom, dateTo, tagFilter, stageFilter, sourceFilter, assignedFilter, destinationFilter, tripTypeFilter]);

  // Destinations seen in the loaded contact set — for the destination filter dropdown.
  // (For now this is a static list of common destinations + whatever appears in the current page.)
  const destinationOptions = useMemo(() => {
    const set = new Set<string>(['Kerala', 'Goa', 'Ladakh', 'Kashmir', 'Himachal', 'Uttarakhand', 'Andaman', 'Rajasthan', 'Northeast', 'Bali', 'Dubai', 'Maldives', 'Singapore', 'Thailand', 'Europe']);
    return Array.from(set).sort();
  }, []);

  function clearAllFilters() {
    setSearch('');
    setSortBy('newest');
    setDateRange(''); setDateFrom(''); setDateTo('');
    setTagFilter([]);
    setStageFilter([]); setSourceFilter([]);
    setAssignedFilter(''); setDestinationFilter('');
    setTripTypeFilter('');
  }

  const activeFilterCount =
    (stageFilter.length > 0 ? 1 : 0) +
    (sourceFilter.length > 0 ? 1 : 0) +
    (assignedFilter ? 1 : 0) +
    (destinationFilter ? 1 : 0) +
    (tripTypeFilter ? 1 : 0) +
    (tagFilter.length > 0 ? 1 : 0) +
    (dateRange ? 1 : 0);

  const tagByName = useMemo(() => Object.fromEntries(allTags.map(t => [t.name, t])), [allTags]);

  function toggleTagFilter(name: string) {
    setTagFilter(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  }

  // Build query params (passed to useContacts so React Query key changes automatically)
  const contactParams = new URLSearchParams();
  if (debouncedSearch) contactParams.set('search', debouncedSearch);
  if (sortBy)          contactParams.set('sort', sortBy);
  if (dateRange)       contactParams.set('date_range', dateRange);
  if (dateRange === 'custom' && dateFrom) contactParams.set('date_from', dateFrom);
  if (dateRange === 'custom' && dateTo)   contactParams.set('date_to', dateTo);
  if (tagFilter.length)                   contactParams.set('tags', tagFilter.join(','));
  if (stageFilter.length)                 contactParams.set('lead_stage',  stageFilter.join(','));
  if (sourceFilter.length)                contactParams.set('lead_source', sourceFilter.join(','));
  if (assignedFilter)                     contactParams.set('assigned_to_id', assignedFilter);
  if (destinationFilter)                  contactParams.set('interested_destination', destinationFilter);
  if (tripTypeFilter)                     contactParams.set('trip_type', tripTypeFilter);
  contactParams.set('page', String(page));
  contactParams.set('limit', String(PER_PAGE));

  const { data: contactsResp, isFetching: loading } = useContacts(contactParams);
  const { data: usersData } = useUsers();

  const contactsPage = (contactsResp as { items: Contact[]; total: number; page: number; limit: number; pages: number } | undefined);
  const contacts   = contactsPage?.items   ?? [];
  const totalCount = contactsPage?.total   ?? 0;
  const totalPages = contactsPage?.pages   ?? 1;
  const users: CrmUser[] = (usersData as CrmUser[] | undefined) ?? [];

  async function loadDupes() {
    const res = await fetch('/api/v1/crm/duplicate-attempts');
    const d   = await res.json();
    if (d.success) setDupes(Array.isArray(d.data) ? d.data : []);
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

  // Page-level stats (computed from current page; totals come from API)
  const paginated       = contacts;   // already server-paginated
  const withPipeline    = contacts.filter(c => c.leads.some(l => l.pipeline !== null)).length;
  const withoutPipeline = contacts.filter(c => c.leads.every(l => l.pipeline === null) || c.leads.length === 0).length;
  const untouched       = contacts.filter(c => c.leads.every(l => (l._count?.call_logs ?? 0) + (l._count?.lead_notes ?? 0) === 0)).length;

  const [bulkDeleting, setBulkDeleting]         = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setCheckedIds(prev => prev.size === paginated.length ? new Set() : new Set(paginated.map(c => c.id)));
  }

  async function bulkDelete() {
    setBulkDeleting(true);
    await Promise.all(Array.from(checkedIds).map(id =>
      fetch(`/api/v1/crm/contacts/${id}`, { method: 'DELETE' })
    ));
    setBulkDeleting(false);
    setCheckedIds(new Set());
    setConfirmBulkDelete(false);
    qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) });
  }

  // ─── CSV export ──────────────────────────────────────────────────────────────
  // Exports the current filtered set (uses the same query params as the table).
  async function exportCsv() {
    const exportParams = new URLSearchParams(contactParams);
    exportParams.set('limit', '5000'); // hard cap to avoid runaway downloads
    exportParams.set('page', '1');
    try {
      const res = await fetch(`/api/v1/crm/contacts?${exportParams}`);
      const data = await res.json();
      if (!data.success) return;
      const rows: Contact[] = data.data.items ?? data.data.contacts ?? [];

      const headers = [
        'Full Name', 'Phone', 'Email', 'City', 'Interested Destination',
        'Number of Travellers', 'Trip Type', 'Budget per Person',
        'Lead Source', 'Lead Stage', 'Assigned To',
        'Follow Up Date', 'Created At', 'Converted', 'Booking Value',
        'Do Not Contact', 'Tags',
      ];
      const csvCell = (v: unknown) => {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          r.name, r.phone, r.email ?? '', r.city ?? '',
          r.interested_destination ?? '',
          r.number_of_travellers ?? '',
          r.trip_type ?? '',
          r.budget_per_person ?? '',
          r.lead_source ?? '',
          r.lead_stage,
          r.assigned_to?.name ?? '',
          r.follow_up_date ?? '',
          r.created_at,
          r.is_converted ? 'Yes' : 'No',
          r.booking_value ?? '',
          r.do_not_contact ? 'Yes' : 'No',
          (r.tags ?? []).join('; '),
        ].map(csvCell).join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[contacts/export]', e);
    }
  }

  const allChecked = paginated.length > 0 && checkedIds.size === paginated.length;

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8 overflow-hidden">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white px-6 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <h1 className="text-base font-bold mr-1" style={{ color: '#0F172A' }}>Contacts</h1>
        {totalCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold mr-2"
            style={{ backgroundColor: '#E0F2F1', color: '#134956' }}>
            {totalCount.toLocaleString()} {totalCount === 1 ? 'Contact' : 'Contacts'}
          </span>
        )}

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

            {/* Tag filter */}
            <div className="relative" ref={tagFilterRef}>
              <button onClick={() => setShowTagFilter(p => !p)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ border: `1px solid ${tagFilter.length ? '#134956' : '#E2E8F0'}`, backgroundColor: tagFilter.length ? '#F0F9FF' : '#fff', color: tagFilter.length ? '#134956' : '#64748B' }}>
                <TagIcon className="w-3.5 h-3.5" />
                {tagFilter.length > 0 ? `${tagFilter.length} tag${tagFilter.length > 1 ? 's' : ''}` : 'Tags'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showTagFilter && (
                <div className="absolute top-10 right-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[220px] max-h-[320px] overflow-y-auto" style={{ border: '1px solid #E2E8F0' }}>
                  {allTags.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-center" style={{ color: '#94A3B8' }}>
                      No tags yet. Create them in CRM Settings → Tags.
                    </div>
                  ) : (
                    <>
                      {allTags.map(t => {
                        const checked = tagFilter.includes(t.name);
                        return (
                          <button key={t.id} onClick={() => toggleTagFilter(t.name)}
                            className="w-full text-left px-4 py-2 text-xs font-medium transition-colors hover:bg-[#F8FAFC] flex items-center gap-2">
                            <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: checked ? t.color : '#fff', border: `1px solid ${checked ? t.color : '#CBD5E1'}` }}>
                              {checked && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                            <span style={{ color: '#0F172A' }}>{t.name}</span>
                          </button>
                        );
                      })}
                      {tagFilter.length > 0 && (
                        <button onClick={() => setTagFilter([])}
                          className="w-full text-left px-4 py-2 text-xs font-semibold border-t hover:bg-[#F8FAFC]"
                          style={{ color: '#DC2626', borderColor: '#F1F5F9' }}>
                          Clear all
                        </button>
                      )}
                    </>
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

            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>

            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: '#134956' }}>
              <Plus className="w-3.5 h-3.5" /> Contact
            </button>
          </>
        )}
      </div>

      {/* Second filter row — stage / source / assignee / destination / trip type / clear */}
      {tab === 'contacts' && (
        <div className="flex-shrink-0 bg-white px-6 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <FilterIcon className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />

          {/* Lead Stage */}
          <select
            value={stageFilter[0] ?? ''}
            onChange={e => setStageFilter(e.target.value ? [e.target.value as LeadStage] : [])}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${stageFilter.length ? '#134956' : '#E2E8F0'}`, color: stageFilter.length ? '#134956' : '#64748B', backgroundColor: stageFilter.length ? '#F0F9FF' : '#fff' }}>
            <option value="">All stages</option>
            {STAGES.map(s => <option key={s} value={s}>{STAGE_BADGE[s].label}</option>)}
          </select>

          {/* Lead Source */}
          <select
            value={sourceFilter[0] ?? ''}
            onChange={e => setSourceFilter(e.target.value ? [e.target.value as LeadSource] : [])}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${sourceFilter.length ? '#134956' : '#E2E8F0'}`, color: sourceFilter.length ? '#134956' : '#64748B', backgroundColor: sourceFilter.length ? '#F0F9FF' : '#fff' }}>
            <option value="">All sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_BADGE[s].label}</option>)}
          </select>

          {/* Assigned To */}
          <select
            value={assignedFilter}
            onChange={e => setAssignedFilter(e.target.value)}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer max-w-[180px]"
            style={{ border: `1px solid ${assignedFilter ? '#134956' : '#E2E8F0'}`, color: assignedFilter ? '#134956' : '#64748B', backgroundColor: assignedFilter ? '#F0F9FF' : '#fff' }}>
            <option value="">Anyone assigned</option>
            <option value="unassigned">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          {/* Destination */}
          <select
            value={destinationFilter}
            onChange={e => setDestinationFilter(e.target.value)}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${destinationFilter ? '#134956' : '#E2E8F0'}`, color: destinationFilter ? '#134956' : '#64748B', backgroundColor: destinationFilter ? '#F0F9FF' : '#fff' }}>
            <option value="">Any destination</option>
            {destinationOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* Trip Type */}
          <select
            value={tripTypeFilter}
            onChange={e => setTripTypeFilter(e.target.value as TripType | '')}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${tripTypeFilter ? '#134956' : '#E2E8F0'}`, color: tripTypeFilter ? '#134956' : '#64748B', backgroundColor: tripTypeFilter ? '#F0F9FF' : '#fff' }}>
            <option value="">Any trip type</option>
            <option value="GROUP">Group</option>
            <option value="PRIVATE">Private</option>
          </select>

          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[#FEF2F2]"
              style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {tab === 'contacts' ? (
        <>
          {/* Table */}
          <div className="flex-1 overflow-auto bg-white">
            {loading && contacts.length === 0 ? (
              <TableSkeleton rows={12} />
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm border-collapse min-w-[1280px]">
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th className="w-10 px-4 py-3">
                      <button onClick={toggleAll}>
                        {allChecked
                          ? <CheckSquare className="w-4 h-4" style={{ color: '#134956' }} />
                          : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
                      </button>
                    </th>
                    {[
                      'Full Name', 'Phone', 'City', 'Destination', 'Budget',
                      'Trip', 'Source', 'Stage', 'Assigned', 'Follow-up', 'Created', '',
                    ].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, i) => {
                    const stageStyle = STAGE_BADGE[c.lead_stage] ?? STAGE_BADGE.NEW;
                    const sourceStyle = c.lead_source ? SOURCE_BADGE[c.lead_source] : null;
                    const tripStyle   = c.trip_type ? TRIP_TYPE_BADGE[c.trip_type] : null;
                    const followUpPast = c.follow_up_date && new Date(c.follow_up_date).getTime() < Date.now();

                    return (
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

                        {/* Full Name — clickable → detail page */}
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ backgroundColor: c.is_converted ? '#22C55E' : '#134956' }}>
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <Link href={`/admin/contacts/${c.id}`}
                                className="font-semibold hover:underline truncate block max-w-[180px]"
                                style={{ color: '#0F172A' }}>
                                {c.name}
                              </Link>
                              {(c.tags ?? []).length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {(c.tags ?? []).slice(0, 2).map(name => {
                                    const tag = tagByName[name];
                                    const color = tag?.color ?? '#64748B';
                                    return (
                                      <span key={name} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
                                        style={{ backgroundColor: color + '20', color }}>{name}</span>
                                    );
                                  })}
                                  {c.tags.length > 2 && <span className="text-[9px]" style={{ color: '#94A3B8' }}>+{c.tags.length - 2}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>
                            <Phone className="w-3 h-3" />{c.phone}
                          </span>
                        </td>

                        {/* City */}
                        <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>
                          {c.city ?? c.last_known_city ?? '—'}
                        </td>

                        {/* Interested Destination */}
                        <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>
                          {c.interested_destination ?? c.leads.find(l => l.destination_interest)?.destination_interest ?? '—'}
                        </td>

                        {/* Budget Per Person */}
                        <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: c.budget_per_person ? '#0F172A' : '#CBD5E1' }}>
                          {fmtINR(c.budget_per_person)}
                        </td>

                        {/* Trip Type */}
                        <td className="px-3 py-3">
                          {tripStyle
                            ? <Chip bg={tripStyle.bg} color={tripStyle.color}>{tripStyle.label}</Chip>
                            : <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Lead Source */}
                        <td className="px-3 py-3">
                          {sourceStyle
                            ? <Chip bg={sourceStyle.bg} color={sourceStyle.color}>{sourceStyle.label}</Chip>
                            : c.source
                              ? <span className="text-xs" style={{ color: '#64748B' }}>{c.source}</span>
                              : <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Lead Stage */}
                        <td className="px-3 py-3">
                          <Chip bg={stageStyle.bg} color={stageStyle.color}>{stageStyle.label}</Chip>
                        </td>

                        {/* Assigned To */}
                        <td className="px-3 py-3">
                          {c.assigned_to ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                                {c.assigned_to.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium" style={{ color: '#0F172A' }}>{c.assigned_to.name}</span>
                            </div>
                          ) : <span className="text-xs" style={{ color: '#94A3B8' }}>Unassigned</span>}
                        </td>

                        {/* Follow Up Date (red if past) */}
                        <td className="px-3 py-3 text-xs whitespace-nowrap"
                          style={{ color: followUpPast ? '#DC2626' : '#64748B', fontWeight: followUpPast ? 600 : 400 }}>
                          {c.follow_up_date ? fmtDate(c.follow_up_date) : '—'}
                        </td>

                        {/* Created At */}
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{fmtDate(c.created_at)}</td>

                        {/* Actions */}
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Link href={`/admin/contacts/${c.id}`}
                              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-[#F1F5F9]"
                              style={{ color: '#64748B' }} title="View / Edit">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Link>
                            <button onClick={async () => {
                              if (!confirm(`Delete contact "${c.name}"? This soft-deletes — can be restored from the database.`)) return;
                              await fetch(`/api/v1/crm/contacts/${c.id}`, { method: 'DELETE' });
                              qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) });
                            }}
                              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-[#FEF2F2]"
                              style={{ color: '#94A3B8' }} title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginated.length === 0 && !loading && (
                    <tr>
                      <td colSpan={13} className="text-center py-16">
                        <User className="w-8 h-8 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No contacts found</p>
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                          {activeFilterCount > 0
                            ? <button onClick={clearAllFilters} className="underline" style={{ color: '#134956' }}>Clear filters</button>
                            : 'Click "Contact" to add the first one — or wait for a CTWA lead to come in via webhook.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table></div>
            )}
          </div>

          {/* Stats + Pagination bar (Bigin-style) */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white text-xs" style={{ borderTop: '1px solid #E2E8F0', color: '#64748B' }}>
            <div className="flex items-center gap-4 flex-wrap">
              <span>Total Contacts <span className="font-bold" style={{ color: '#0F172A' }}>{totalCount.toLocaleString()}</span></span>
              <span className="text-[#CBD5E1]">·</span>
              <span>With Open Pipelines <span className="font-bold" style={{ color: '#0F172A' }}>{withPipeline.toLocaleString()}</span></span>
              <span className="text-[#CBD5E1]">·</span>
              <span>Without Pipelines <span className="font-bold" style={{ color: '#0F172A' }}>{withoutPipeline.toLocaleString()}</span></span>
              <span className="text-[#CBD5E1]">·</span>
              <span>Untouched <span className="font-bold" style={{ color: '#0F172A' }}>{untouched.toLocaleString()}</span></span>
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-3">
                <span>
                  Showing <span className="font-semibold" style={{ color: '#0F172A' }}>{(page - 1) * PER_PAGE + 1}</span> to{' '}
                  <span className="font-semibold" style={{ color: '#0F172A' }}>{Math.min(page * PER_PAGE, totalCount)}</span> of{' '}
                  <span className="font-semibold" style={{ color: '#0F172A' }}>{totalCount.toLocaleString()}</span> contacts
                  {loading && <span className="ml-2 opacity-50">…</span>}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
                      className="flex items-center gap-1 px-2 h-7 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F1F5F9] disabled:opacity-30"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
                      className="flex items-center gap-1 px-2 h-7 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F1F5F9] disabled:opacity-30"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
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
            <div className="overflow-x-auto"><table className="w-full text-sm bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
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
            </table></div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
          style={{ backgroundColor: '#0F172A', color: 'white', minWidth: 320 }}>
          <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#7DD3C0' }} />
          <span className="text-sm font-semibold" style={{ color: '#7DD3C0' }}>{checkedIds.size} selected</span>
          <div className="w-px h-4 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />

          {!confirmBulkDelete ? (
            <button onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-white/10"
              style={{ color: '#FCA5A5' }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: '#FCA5A5' }}>Delete {checkedIds.size} contact{checkedIds.size > 1 ? 's' : ''}?</span>
              <button onClick={bulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: '#DC2626' }}>
                {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Yes, delete
              </button>
              <button onClick={() => setConfirmBulkDelete(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}>
                Cancel
              </button>
            </div>
          )}

          <div className="flex-1" />
          <button onClick={() => { setCheckedIds(new Set()); setConfirmBulkDelete(false); }}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modals & panels */}
      {showCreate && <CreateContactModal onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) })} />}
      {selected && <ContactPanel contact={selected} users={users} allTags={allTags} onClose={() => setSelected(null)} onUpdated={() => qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) })} />}
    </div>
  );
}
