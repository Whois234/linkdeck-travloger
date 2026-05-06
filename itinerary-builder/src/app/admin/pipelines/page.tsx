'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelines, usePipeline, useUsers, useLead, useLeadStageMutation, useAddNote, useLogCall, useAddTask, useMarkTaskDone, usePrefetchLead, QK } from '@/lib/query-hooks';
import {
  Plus, Search, Phone, MessageCircle, ChevronDown, X, User,
  Clock, CheckCircle2, AlertCircle, FileText, Loader2,
  Filter, ArrowUpDown, Trash2, MoveRight, CheckSquare, Square,
  ExternalLink, Calendar, Users,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stage { id: string; name: string; color: string; order: number }

interface Lead {
  id: string; name: string; phone: string; email: string | null;
  source: string | null; destination_interest: string | null;
  travel_month: string | null; budget_range: string | null;
  status: string; stage_id: string | null; pipeline_id: string | null;
  owner_id: string | null;
  created_at: string;
  stage?: { id: string; name: string; color: string; order: number } | null;
  _count?: { call_logs: number; lead_notes: number };
}

interface Pipeline { id: string; name: string; is_default: boolean; stages: Stage[]; leads: Lead[] }
interface Note { id: string; content: string; created_at: string; created_by: string }
interface CallLog { id: string; duration: number | null; outcome: string; notes: string | null; created_at: string; created_by: string }
interface Task { id: string; type: string; due_time: string; status: string; notes: string | null }
interface Activity { id: string; type: string; metadata: Record<string, unknown> | null; created_at: string; created_by: string }
interface QuoteOption { id: string; option_name: string; final_price: number; is_most_popular: boolean }
interface QuoteEvent  { id: string; event_type: string; metadata: Record<string, unknown> | null; created_at: string }
interface QuoteRef {
  id: string; quote_number: string; status: string; created_at: string; updated_at: string;
  quote_name: string | null; start_date: string; end_date: string; adults: number; duration_days: number;
  quote_options: QuoteOption[];
  events: QuoteEvent[];
  _count: { events: number };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW:         { bg: '#EFF6FF', text: '#2563EB' },
  CONTACTED:   { bg: '#F0FDF4', text: '#16A34A' },
  QUALIFIED:   { bg: '#FEF9C3', text: '#A16207' },
  NEGOTIATING: { bg: '#FFF7ED', text: '#C2410C' },
  WON:         { bg: '#DCFCE7', text: '#15803D' },
  LOST:        { bg: '#FEF2F2', text: '#DC2626' },
};

const QUOTE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: '#F8FAFC', text: '#64748B' },
  PUBLISHED: { bg: '#EFF6FF', text: '#2563EB' },
  ACCEPTED:  { bg: '#DCFCE7', text: '#15803D' },
  REJECTED:  { bg: '#FEF2F2', text: '#DC2626' },
  EXPIRED:   { bg: '#F1F5F9', text: '#94A3B8' },
};

const TASK_ICONS: Record<string, string> = {
  call: '📞', follow_up: '🔁', send_quote: '📄', meeting: '🤝', other: '📌',
};

const ACTIVITY_CONFIG: Record<string, { icon: string; color: string; label: (m: Record<string, string>) => string }> = {
  created:      { icon: '✨', color: '#6366F1', label: () => 'Lead created' },
  stage_changed:{ icon: '🔀', color: '#0EA5E9', label: m => `Stage: ${m.from ?? '?'} → ${m.to ?? '?'}` },
  note_added:   { icon: '📝', color: '#F59E0B', label: () => 'Note added' },
  call_logged:  { icon: '📞', color: '#10B981', label: m => `Call logged — ${m.outcome ?? ''}` },
  task_added:   { icon: '⏰', color: '#8B5CF6', label: m => `Task: ${(m.task_type as string ?? '').replace('_', ' ')}` },
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Lead Card ───────────────────────────────────────────────────────────────

function LeadCard({
  lead, stageColor, onDragStart, onClick, selected, onToggleSelect, onPrefetch,
}: {
  lead: Lead; stageColor: string;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onClick: (lead: Lead) => void;
  selected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onPrefetch: (leadId: string) => void;
}) {
  const isUntouched = (lead._count?.call_logs ?? 0) + (lead._count?.lead_notes ?? 0) === 0;
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onMouseEnter={() => onPrefetch(lead.id)}
      onClick={() => onClick(lead)}
      className="bg-white rounded-xl p-4 cursor-pointer transition-shadow hover:shadow-md select-none relative"
      style={{
        border: selected ? '1.5px solid #134956' : '1px solid #E2E8F0',
        borderLeft: `3px solid ${stageColor}`,
        backgroundColor: selected ? '#F0F9FF' : 'white',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={e => onToggleSelect(lead.id, e)}
        className="absolute top-3 right-3 z-10"
        title={selected ? 'Deselect' : 'Select'}
      >
        {selected
          ? <CheckSquare className="w-4 h-4" style={{ color: '#134956' }} />
          : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
      </button>

      <div className="flex items-start justify-between gap-2 mb-2 pr-6">
        <p className="text-sm font-semibold leading-snug" style={{ color: '#0F172A' }}>{lead.name}</p>
        {isUntouched && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#DBEAFE', color: '#2563EB' }}>
            NEW
          </span>
        )}
      </div>
      {lead.destination_interest && (
        <p className="text-xs mb-1 truncate" style={{ color: '#64748B' }}>📍 {lead.destination_interest}</p>
      )}
      {lead.travel_month && (
        <p className="text-xs mb-1" style={{ color: '#64748B' }}>🗓 {lead.travel_month}</p>
      )}
      {lead.budget_range && (
        <p className="text-xs mb-2" style={{ color: '#64748B' }}>💰 {lead.budget_range}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px]" style={{ color: '#94A3B8' }}>{timeAgo(lead.created_at)}</p>
        <div className="flex gap-1">
          <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[#F0FDF4]" title="Call">
            <Phone className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
          </a>
          <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[#F0FDF4]" title="WhatsApp">
            <MessageCircle className="w-3.5 h-3.5" style={{ color: '#25D366' }} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Column ───────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, onDragStart, onDrop, onLeadClick, selectedIds, onToggleSelect, onSelectAllInStage, onPrefetch,
}: {
  stage: Stage; leads: Lead[];
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDrop: (stageId: string) => void;
  onLeadClick: (lead: Lead) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onSelectAllInStage: (stageId: string, leads: Lead[]) => void;
  onPrefetch: (leadId: string) => void;
}) {
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [over, setOver] = useState(false);
  const allSelected = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  const visibleLeads = leads.slice(0, visibleCount);
  const hidden = leads.length - visibleCount;

  return (
    <div className="flex flex-col rounded-xl flex-shrink-0 w-[280px]"
      style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id); }}>
      <div className="px-4 py-3 rounded-t-xl flex items-center justify-between"
        style={{ borderBottom: `2px solid ${stage.color}`, backgroundColor: `${stage.color}18` }}>
        <div className="flex items-center gap-2">
          <button onClick={() => onSelectAllInStage(stage.id, leads)} title={allSelected ? 'Deselect all' : 'Select all in stage'}>
            {allSelected
              ? <CheckSquare className="w-3.5 h-3.5" style={{ color: '#134956' }} />
              : <Square className="w-3.5 h-3.5" style={{ color: '#CBD5E1' }} />}
          </button>
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
          <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{stage.name}</p>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: stage.color + '22', color: stage.color }}>
          {leads.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 transition-colors"
        style={{ minHeight: 120, backgroundColor: over ? `${stage.color}08` : undefined, maxHeight: 'calc(100vh - 220px)' }}>
        {visibleLeads.map(lead => (
          <LeadCard key={lead.id} lead={lead} stageColor={stage.color}
            onDragStart={onDragStart} onClick={onLeadClick}
            selected={selectedIds.has(lead.id)} onToggleSelect={onToggleSelect}
            onPrefetch={onPrefetch} />
        ))}
        {hidden > 0 && (
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="w-full py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-100"
            style={{ color: stage.color, border: `1px dashed ${stage.color}66` }}>
            Show {Math.min(hidden, PAGE_SIZE)} more of {hidden}
          </button>
        )}
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs"
            style={{ borderColor: over ? stage.color : '#E2E8F0', color: '#94A3B8' }}>
            Drop lead here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Lead Drawer ──────────────────────────────────────────────────────────

function AddLeadDrawer({ pipelineId, onClose, onCreated }: { pipelineId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', destination_interest: '', travel_month: '', budget_range: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setError('Name and phone are required'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/v1/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, pipeline_id: pipelineId }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) { onCreated(); onClose(); }
    else setError(data.error ?? 'Failed to create lead');
  }

  function field(label: string, key: keyof typeof form, type = 'text', placeholder = '') {
    return (
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>{label}</label>
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-all"
          style={{ border: '1px solid #D1D5DB', color: '#111827' }}
          onFocus={e => (e.target.style.borderColor = '#134956')}
          onBlur={e => (e.target.style.borderColor = '#D1D5DB')} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[420px] bg-white flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="font-bold text-base" style={{ color: '#0F172A' }}>New Lead</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: '#64748B' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {field('Name *', 'name', 'text', 'Full name')}
          {field('Phone *', 'phone', 'tel', '+91 98765 43210')}
          {field('Email', 'email', 'email', 'email@example.com')}
          {field('Source', 'source', 'text', 'Facebook, Referral, Walk-in...')}
          {field('Destination Interest', 'destination_interest', 'text', 'Goa, Manali, Maldives...')}
          {field('Travel Month', 'travel_month', 'text', 'Jan 2026, Dec 2025...')}
          {field('Budget Range', 'budget_range', 'text', '₹50,000 – ₹1,00,000')}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
        <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={e => handleSubmit(e as unknown as React.FormEvent)} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#134956' }}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating...' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Call Log Popup ───────────────────────────────────────────────────────────

function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Floating Call Banner ─────────────────────────────────────────────────────

function CallBanner({
  leadName, phone,
  onEndCall, onNotAnswered,
}: {
  leadName: string; phone: string;
  onEndCall: (elapsed: number) => void;
  onNotAnswered: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[80] flex justify-center pointer-events-none" style={{ padding: '0 16px 20px' }}>
      <div className="pointer-events-auto w-full max-w-[480px] rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0F172A', boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)' }}>

        {/* Top row — name + timer */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4ADE80' }} />
              <div className="absolute inset-0 w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: '#4ADE80', opacity: 0.5 }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-none mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Call in progress</p>
              <p className="text-sm font-semibold text-white truncate leading-none">{leadName}</p>
            </div>
          </div>
          <p className="text-xl font-bold font-mono flex-shrink-0 tabular-nums" style={{ color: '#4ADE80', letterSpacing: '-0.5px' }}>{fmtSecs(elapsed)}</p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '0 20px' }} />

        {/* Bottom row — actions */}
        <div className="flex gap-2 px-5 py-3">
          <button onClick={() => onEndCall(elapsed)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#16A34A' }}>
            End Call
          </button>
          <button onClick={onNotAnswered}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}>
            Not Answered
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Call Log Popup ───────────────────────────────────────────────────────────

function CallLogPopup({
  leadId, leadName, onClose, onSaved,
  initialElapsed = 0, initialOutcome = 'ANSWERED',
}: {
  leadId: string; leadName: string; onClose: () => void; onSaved: () => void;
  initialElapsed?: number; initialOutcome?: string;
}) {
  const [manualDuration, setManualDuration] = useState('');
  const [outcome, setOutcome] = useState(initialOutcome);
  const [notes, setNotes] = useState('');
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextType, setNextType] = useState('call');
  const [nextTime, setNextTime] = useState('');
  const logCallMutation = useLogCall(leadId);

  // When coming from banner: save exact seconds; fallback to manual minutes input
  const durationForApi = initialElapsed > 0
    ? Math.max(1, Math.round(initialElapsed / 60))
    : (manualDuration ? parseInt(manualDuration) : null);

  function save() {
    logCallMutation.mutate({
      duration: durationForApi, outcome, notes,
      next_task_type: scheduleNext ? nextType : undefined,
      next_task_time: scheduleNext && nextTime ? nextTime : undefined,
    }, {
      onSuccess: () => { onSaved(); onClose(); },
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <p className="font-bold text-base" style={{ color: '#0F172A' }}>Log Call</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{leadName}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: '#94A3B8' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Duration */}
          {initialElapsed > 0 ? (
            <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#15803D' }}>Call Duration</p>
                <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: '#0F172A', letterSpacing: '-0.5px' }}>{fmtSecs(initialElapsed)}</p>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#DCFCE7' }}>
                <Phone className="w-4 h-4" style={{ color: '#16A34A' }} />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Duration (minutes)</label>
              <input type="number" value={manualDuration} onChange={e => setManualDuration(e.target.value)} placeholder="e.g. 5"
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }} />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Outcome</label>
            <select value={outcome} onChange={e => setOutcome(e.target.value)}
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }}>
              <option value="ANSWERED">✅ Answered</option>
              <option value="NO_ANSWER">📵 No Answer</option>
              <option value="BUSY">📳 Busy</option>
              <option value="CALLBACK_REQUESTED">🔁 Callback Requested</option>
              <option value="VOICEMAIL">📬 Voicemail</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="What was discussed..."
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none resize-none" style={{ border: '1px solid #D1D5DB' }} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={scheduleNext} onChange={e => setScheduleNext(e.target.checked)} />
            <span className="text-sm" style={{ color: '#374151' }}>Schedule follow-up task</span>
          </label>
          {scheduleNext && (
            <div className="flex gap-3">
              <select value={nextType} onChange={e => setNextType(e.target.value)}
                className="flex-1 text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }}>
                <option value="call">Call</option>
                <option value="follow_up">Follow Up</option>
                <option value="send_quote">Send Quote</option>
                <option value="meeting">Meeting</option>
                <option value="other">Other</option>
              </select>
              <input type="datetime-local" value={nextTime} onChange={e => setNextTime(e.target.value)}
                className="flex-1 text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }} />
            </div>
          )}
        </div>
        <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={save} disabled={logCallMutation.isPending}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#134956' }}>
            {logCallMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Call
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quote Detail Popup ───────────────────────────────────────────────────────

const SECTION_ORDER = ['hero', 'packages', 'dates', 'itinerary', 'inclusions', 'fare', 'policies', 'faqs'];

function QuotePopup({ quote, onClose }: { quote: QuoteRef; onClose: () => void }) {
  const [view, setView] = useState<'details' | 'analytics'>('details');

  const sessionEvents = quote.events.filter(e => e.event_type === 'quote_viewed' && (e.metadata as Record<string,unknown>)?.is_final === true);
  const views         = sessionEvents.length;
  const waClicks      = quote.events.filter(e => e.event_type === 'whatsapp_clicked').length;
  const pkgEvents     = quote.events.filter(e => e.event_type === 'package_selected');
  const approved      = quote.events.some(e => e.event_type === 'approve_clicked');

  const sectionTotals: Record<string, number> = {};
  sessionEvents.forEach(e => {
    const st = (e.metadata as Record<string,unknown>)?.section_time_seconds as Record<string,number> | undefined;
    if (st) Object.entries(st).forEach(([k, v]) => { sectionTotals[k] = (sectionTotals[k] ?? 0) + v; });
  });
  const topSections = SECTION_ORDER.filter(s => (sectionTotals[s] ?? 0) > 0).map(s => [s, sectionTotals[s]] as [string, number]);
  const maxSec = Math.max(...topSections.map(([, v]) => v), 1);

  const pkgCounts: Record<string, number> = {};
  pkgEvents.forEach(e => {
    const m = e.metadata as Record<string,unknown>;
    const name = (m?.option_name as string) || (m?.tier_name as string) || 'Unknown';
    pkgCounts[name] = (pkgCounts[name] ?? 0) + 1;
  });
  const maxPkg = Math.max(...Object.values(pkgCounts), 1);

  const qsc = QUOTE_STATUS_COLORS[quote.status] ?? { bg: '#F8FAFC', text: '#64748B' };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[540px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-base" style={{ color: '#0F172A' }}>{quote.quote_number}</p>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: qsc.bg, color: qsc.text }}>{quote.status}</span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Created {formatDate(quote.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/quotes/${quote.id}`} target="_blank"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ border: '1px solid #E2E8F0', color: '#134956' }}>
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </Link>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
              <X className="w-4 h-4" style={{ color: '#64748B' }} />
            </button>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex px-6 pt-3 pb-0 gap-1 flex-shrink-0">
          {(['details', 'analytics'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-2 rounded-t-lg text-xs font-semibold capitalize transition-colors"
              style={{ backgroundColor: view === v ? '#F8FAFC' : 'transparent', color: view === v ? '#134956' : '#94A3B8', borderBottom: view === v ? '2px solid #134956' : '2px solid transparent' }}>
              {v === 'analytics' ? '📊 Analytics' : '📋 Details'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {view === 'details' && (
            <div className="space-y-4">
              {/* Trip info */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Adults',    value: `${quote.adults} pax` },
                  { label: 'Duration',  value: `${quote.duration_days} days` },
                  { label: 'Travel',    value: quote.start_date ? formatDate(quote.start_date) : '—' },
                ].map(f => (
                  <div key={f.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>{f.label}</p>
                    <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Options */}
              {quote.quote_options.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Package Options</p>
                  <div className="space-y-2">
                    {quote.quote_options.map(opt => (
                      <div key={opt.id} className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ backgroundColor: opt.is_most_popular ? '#F0FDF4' : '#F8FAFC', border: opt.is_most_popular ? '1px solid #BBF7D0' : '1px solid #F1F5F9' }}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{opt.option_name}</p>
                          {opt.is_most_popular && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>POPULAR</span>}
                        </div>
                        <p className="text-sm font-bold" style={{ color: '#0F172A' }}>₹{opt.final_price.toLocaleString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick engagement */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: '👁', label: 'Views',     value: views,      color: views > 0 ? '#2563EB' : '#94A3B8' },
                  { icon: '💬', label: 'WhatsApp',  value: waClicks,   color: waClicks > 0 ? '#16A34A' : '#94A3B8' },
                  { icon: '📦', label: 'Pkg Picks', value: pkgEvents.length, color: pkgEvents.length > 0 ? '#D97706' : '#94A3B8' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <p className="text-lg">{s.icon}</p>
                    <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] font-medium" style={{ color: '#94A3B8' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {approved && (
                <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <span className="text-base">✅</span>
                  <p className="text-sm font-semibold" style={{ color: '#15803D' }}>Customer approved this quote</p>
                </div>
              )}
            </div>
          )}

          {view === 'analytics' && (
            <div className="space-y-5">
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Sessions',       value: views,            icon: '👁',  color: '#8B5CF6' },
                  { label: 'WhatsApp Clicks',value: waClicks,         icon: '💬',  color: '#22C55E' },
                  { label: 'Pkg Selected',   value: pkgEvents.length, icon: '📦',  color: '#F59E0B' },
                  { label: 'Approved',       value: approved ? 1 : 0, icon: '✅',  color: '#10B981' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <span className="text-xl">{s.icon}</span>
                    <div>
                      <p className="text-lg font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-[10px] font-medium mt-0.5" style={{ color: '#94A3B8' }}>{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Section engagement */}
              {topSections.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>Section Engagement</p>
                  <div className="space-y-2.5">
                    {topSections.map(([section, secs]) => (
                      <div key={section}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium capitalize" style={{ color: '#374151' }}>{section}</span>
                          <span className="text-xs font-bold" style={{ color: '#0F172A' }}>{secs}s</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                          <div className="h-2 rounded-full transition-all" style={{ width: `${(secs / maxSec) * 100}%`, backgroundColor: '#134956' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Package preference */}
              {Object.keys(pkgCounts).length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>Package Preference</p>
                  <div className="space-y-2.5">
                    {Object.entries(pkgCounts).sort(([,a],[,b]) => b - a).map(([name, cnt]) => (
                      <div key={name}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium" style={{ color: '#374151' }}>{name}</span>
                          <span className="text-xs font-bold" style={{ color: '#0F172A' }}>{cnt}×</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                          <div className="h-2 rounded-full" style={{ width: `${(cnt / maxPkg) * 100}%`, backgroundColor: '#F59E0B' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topSections.length === 0 && Object.keys(pkgCounts).length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>No analytics data yet — quote hasn&apos;t been opened by customer.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lead Drawer ──────────────────────────────────────────────────────────────

function LeadDrawer({
  leadId, stages, onClose, onUpdated,
}: {
  leadId: string; stages: Stage[]; onClose: () => void; onUpdated: () => void;
}) {
  const { data: leadData } = useLead(leadId);
  const ld = leadData as (Lead & { lead_notes: Note[]; call_logs: CallLog[]; lead_tasks: Task[]; lead_activities: Activity[]; quotes: QuoteRef[] }) | undefined;

  const lead       = ld ?? null;
  const notes      = ld?.lead_notes      ?? [];
  const calls      = ld?.call_logs       ?? [];
  const tasks      = ld?.lead_tasks      ?? [];
  const activities = ld?.lead_activities ?? [];
  const quotes     = ld?.quotes          ?? [];

  const [tab, setTab] = useState<'overview' | 'notes' | 'calls' | 'tasks' | 'quotes' | 'activity'>('overview');
  const [noteText, setNoteText] = useState('');
  const [showCallPopup, setShowCallPopup] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskType, setTaskType] = useState('call');
  const [taskDue, setTaskDue] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [movingStage, setMovingStage] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', destination_interest: '', travel_month: '', budget_range: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<QuoteRef | null>(null);
  const [callBannerActive, setCallBannerActive] = useState(false);
  const [callPopupState, setCallPopupState] = useState<{ elapsed: number; outcome: string } | null>(null);

  // Sync edit form when lead data first arrives
  useEffect(() => {
    if (lead && !editMode) {
      setEditForm({
        name: lead.name, phone: lead.phone, email: lead.email ?? '',
        destination_interest: lead.destination_interest ?? '',
        travel_month: lead.travel_month ?? '',
        budget_range: lead.budget_range ?? '',
      });
    }
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optimistic mutation hooks
  const addNoteMutation    = useAddNote(leadId);
  const addTaskMutation    = useAddTask(leadId);
  const markTaskMutation   = useMarkTaskDone(leadId);
  const logCallMutation    = useLogCall(leadId);
  const qc = useQueryClient();

  function addNote() {
    if (!noteText.trim()) return;
    addNoteMutation.mutate(noteText, { onSuccess: () => setNoteText('') });
  }

  async function moveStage(stageId: string) {
    setMovingStage(true);
    await fetch(`/api/v1/leads/${leadId}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId }),
    });
    setMovingStage(false);
    qc.invalidateQueries({ queryKey: QK.lead(leadId) });
    onUpdated();
  }

  function addTask() {
    if (!taskDue) return;
    addTaskMutation.mutate(
      { type: taskType, due_time: new Date(taskDue).toISOString(), notes: taskNotes },
      { onSuccess: () => { setShowTaskForm(false); setTaskDue(''); setTaskNotes(''); } },
    );
  }

  function markTaskDone(taskId: string) {
    markTaskMutation.mutate(taskId);
  }

  async function saveEdit() {
    setSavingEdit(true);
    await fetch(`/api/v1/leads/${leadId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setSavingEdit(false); setEditMode(false);
    qc.invalidateQueries({ queryKey: QK.lead(leadId) });
    onUpdated();
  }

  const TABS = [
    { key: 'overview',  label: 'Overview' },
    { key: 'notes',     label: `Notes (${notes.length})` },
    { key: 'calls',     label: `Calls (${calls.length})` },
    { key: 'tasks',     label: `Tasks (${tasks.length})` },
    { key: 'quotes',    label: `Quotes (${quotes.length})` },
    { key: 'activity',  label: 'Activity' },
  ] as const;

  if (!lead) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/40" onClick={onClose} />
        <div className="w-[520px] bg-white flex items-center justify-center shadow-2xl">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#134956' }} />
        </div>
      </div>
    );
  }

  const currentStage = stages.find(s => s.id === lead.stage_id);
  const sc = STATUS_COLORS[lead.status] ?? { bg: '#F8FAFC', text: '#64748B' };

  return (
    <>
      {callBannerActive && (
        <CallBanner
          leadName={lead.name} phone={lead.phone}
          onEndCall={(elapsed) => { setCallBannerActive(false); setCallPopupState({ elapsed, outcome: 'ANSWERED' }); }}
          onNotAnswered={() => { setCallBannerActive(false); setCallPopupState({ elapsed: 0, outcome: 'NO_ANSWER' }); }}
        />
      )}
      {(showCallPopup || callPopupState) && (
        <CallLogPopup
          leadId={leadId} leadName={lead.name}
          initialElapsed={callPopupState?.elapsed ?? 0}
          initialOutcome={callPopupState?.outcome ?? 'ANSWERED'}
          onClose={() => { setShowCallPopup(false); setCallPopupState(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: QK.lead(leadId) }); onUpdated(); setShowCallPopup(false); setCallPopupState(null); }}
        />
      )}
      {selectedQuote && <QuotePopup quote={selectedQuote} onClose={() => setSelectedQuote(null)} />}
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/40" onClick={onClose} />
        <div className="w-[520px] bg-white flex flex-col shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-lg font-bold truncate" style={{ color: '#0F172A' }}>{lead.name}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc.bg, color: sc.text }}>{lead.status}</span>
                </div>
                <p className="text-sm" style={{ color: '#64748B' }}>{lead.phone}{lead.email ? ` · ${lead.email}` : ''}</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9] flex-shrink-0" style={{ color: '#64748B' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stage selector */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>Stage:</span>
              <div className="relative">
                <select value={lead.stage_id ?? ''} onChange={e => moveStage(e.target.value)} disabled={movingStage}
                  className="text-xs font-bold pl-2 pr-6 py-1 rounded-full outline-none appearance-none cursor-pointer"
                  style={{ backgroundColor: currentStage ? currentStage.color + '22' : '#F1F5F9', color: currentStage?.color ?? '#64748B', border: `1px solid ${currentStage?.color ?? '#E2E8F0'}` }}>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: currentStage?.color ?? '#64748B' }} />
              </div>
              <div className="flex-1" />
              <button
                onClick={() => { window.location.href = `tel:${lead.phone}`; setCallBannerActive(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
                style={{ backgroundColor: '#16A34A' }}>
                <Phone className="w-3.5 h-3.5" /> Call
              </button>
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: '#25D366' }}>
                <MessageCircle className="w-3.5 h-3.5" /> WA
              </a>
              <button onClick={() => setShowCallPopup(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: '#134956' }}>
                + Log Call
              </button>
            </div>

            {/* Tabs */}
            <div className="flex mt-4 overflow-x-auto" style={{ borderBottom: '1px solid #F1F5F9' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className="px-3 py-2 text-[11px] font-semibold whitespace-nowrap transition-colors flex-shrink-0"
                  style={{
                    color: tab === t.key ? '#134956' : '#94A3B8',
                    borderBottom: tab === t.key ? '2px solid #134956' : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* OVERVIEW */}
            {tab === 'overview' && (
              <div className="space-y-5">
                {editMode ? (
                  <div className="space-y-3">
                    {[['Name', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Destination Interest', 'destination_interest'], ['Travel Month', 'travel_month'], ['Budget Range', 'budget_range']].map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>{label}</label>
                        <input value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full text-sm rounded-lg px-3 py-2 outline-none" style={{ border: '1px solid #D1D5DB' }} />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditMode(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
                      <button onClick={saveEdit} disabled={savingEdit}
                        className="flex-1 py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1"
                        style={{ backgroundColor: '#134956' }}>
                        {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <button onClick={() => setEditMode(true)} className="text-xs font-semibold" style={{ color: '#134956' }}>Edit Details</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[['Source', lead.source], ['Destination', lead.destination_interest], ['Travel Month', lead.travel_month], ['Budget', lead.budget_range]].map(([label, value]) => (
                        <div key={label} className="rounded-lg p-3" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                          <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>{label}</p>
                          <p className="text-sm font-semibold" style={{ color: value ? '#0F172A' : '#CBD5E1' }}>{value || '—'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg p-3" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>Created</p>
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{formatDate(lead.created_at)}</p>
                    </div>
                    <div className="rounded-lg p-3 flex items-center justify-between" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>Lead ID</p>
                        <p className="text-xs font-mono truncate" style={{ color: '#64748B' }}>{lead.id}</p>
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(lead.id)}
                        className="ml-3 flex-shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors hover:bg-[#E2E8F0]"
                        style={{ color: '#134956', border: '1px solid #E2E8F0' }}>
                        Copy
                      </button>
                    </div>
                    <Link
                      href={`/admin/quotes/create?lead_id=${lead.id}&lead_name=${encodeURIComponent(lead.name)}&lead_phone=${encodeURIComponent(lead.phone)}&lead_email=${encodeURIComponent(lead.email ?? '')}`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: '#134956' }}>
                      <FileText className="w-4 h-4" /> Create Quote for this Lead
                    </Link>
                  </>
                )}
              </div>
            )}

            {/* NOTES */}
            {tab === 'notes' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." rows={3}
                    className="flex-1 text-sm rounded-lg px-3 py-2.5 outline-none resize-none" style={{ border: '1px solid #D1D5DB' }} />
                  <button onClick={addNote} disabled={addNoteMutation.isPending || !noteText.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white self-start flex items-center gap-1"
                    style={{ backgroundColor: '#134956', opacity: !noteText.trim() ? 0.5 : 1 }}>
                    {addNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                  </button>
                </div>
                {notes.length === 0 && <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No notes yet</p>}
                {notes.map(n => (
                  <div key={n.id} className="rounded-xl p-4" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>{n.content}</p>
                    <p className="text-[11px] mt-2" style={{ color: '#94A3B8' }}>{timeAgo(n.created_at)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* CALLS */}
            {tab === 'calls' && (
              <div className="space-y-3">
                <button onClick={() => setShowCallPopup(true)}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ border: '1px dashed #134956', color: '#134956' }}>
                  <Plus className="w-4 h-4" /> Log a Call
                </button>
                {calls.length === 0 && <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No calls logged yet</p>}
                {calls.map(c => (
                  <div key={c.id} className="rounded-xl p-4" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#E0F2FE', color: '#0369A1' }}>{c.outcome}</span>
                      {c.duration && <span className="text-xs" style={{ color: '#64748B' }}>{c.duration} min</span>}
                    </div>
                    {c.notes && <p className="text-sm mt-1" style={{ color: '#374151' }}>{c.notes}</p>}
                    <p className="text-[11px] mt-2" style={{ color: '#94A3B8' }}>{timeAgo(c.created_at)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* TASKS */}
            {tab === 'tasks' && (
              <div className="space-y-3">
                {!showTaskForm ? (
                  <button onClick={() => setShowTaskForm(true)}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                    style={{ border: '1px dashed #134956', color: '#134956' }}>
                    <Plus className="w-4 h-4" /> Schedule Task
                  </button>
                ) : (
                  <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <select value={taskType} onChange={e => setTaskType(e.target.value)}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }}>
                      <option value="call">Call</option>
                      <option value="follow_up">Follow Up</option>
                      <option value="send_quote">Send Quote</option>
                      <option value="meeting">Meeting</option>
                      <option value="other">Other</option>
                    </select>
                    <input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }} />
                    <textarea value={taskNotes} onChange={e => setTaskNotes(e.target.value)} rows={2} placeholder="Notes..."
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none resize-none" style={{ border: '1px solid #D1D5DB' }} />
                    <div className="flex gap-2">
                      <button onClick={() => setShowTaskForm(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
                      <button onClick={addTask} disabled={addTaskMutation.isPending || !taskDue}
                        className="flex-1 py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1"
                        style={{ backgroundColor: '#134956' }}>
                        {addTaskMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save Task
                      </button>
                    </div>
                  </div>
                )}
                {tasks.length === 0 && <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No tasks scheduled</p>}
                {tasks.map(t => {
                  const isOverdue = t.status === 'overdue';
                  const isDone = t.status === 'done';
                  return (
                    <div key={t.id} className="rounded-xl p-4 flex items-start gap-3"
                      style={{ backgroundColor: isOverdue ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${isOverdue ? '#FECACA' : '#E2E8F0'}` }}>
                      <button onClick={() => !isDone && markTaskDone(t.id)} disabled={isDone} className="mt-0.5 flex-shrink-0">
                        {isDone ? <CheckCircle2 className="w-5 h-5" style={{ color: '#16A34A' }} /> :
                          isOverdue ? <AlertCircle className="w-5 h-5" style={{ color: '#DC2626' }} /> :
                          <Clock className="w-5 h-5" style={{ color: '#64748B' }} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{TASK_ICONS[t.type] ?? '📌'}</span>
                          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{t.type.replace('_', ' ')}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{
                            backgroundColor: isDone ? '#DCFCE7' : isOverdue ? '#FEE2E2' : '#F1F5F9',
                            color: isDone ? '#15803D' : isOverdue ? '#DC2626' : '#64748B',
                          }}>{t.status}</span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Due: {formatDate(t.due_time)}</p>
                        {t.notes && <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{t.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* QUOTES — timeline */}
            {tab === 'quotes' && (
              <div className="space-y-3">
                <Link
                  href={`/admin/quotes/create?lead_id=${lead.id}&lead_name=${encodeURIComponent(lead.name)}&lead_phone=${encodeURIComponent(lead.phone)}&lead_email=${encodeURIComponent(lead.email ?? '')}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                  style={{ border: '1.5px dashed #134956', color: '#134956', backgroundColor: '#F0F9FF' }}>
                  <Plus className="w-4 h-4" /> Create New Quote
                </Link>

                {quotes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10">
                    <FileText className="w-8 h-8 mb-2" style={{ color: '#CBD5E1' }} />
                    <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>No quotes yet for this lead</p>
                  </div>
                )}

                {/* Timeline */}
                <div className="relative">
                  {quotes.length > 1 && (
                    <div className="absolute left-[19px] top-10 bottom-4 w-px" style={{ background: 'linear-gradient(to bottom, #E2E8F0, transparent)' }} />
                  )}
                  {quotes.map((q, qi) => {
                    const qsc = QUOTE_STATUS_COLORS[q.status] ?? { bg: '#F8FAFC', text: '#64748B' };
                    const isConfirmed = q.status === 'ACCEPTED';
                    const isDraft     = q.status === 'DRAFT';
                    const views = q.events.filter(e => e.event_type === 'quote_viewed' && (e.metadata as Record<string,unknown>)?.is_final === true).length;
                    const hasEngagement = q._count.events > 0;
                    const minPrice = q.quote_options.length > 0 ? Math.min(...q.quote_options.map(o => o.final_price)) : null;
                    const maxPrice = q.quote_options.length > 0 ? Math.max(...q.quote_options.map(o => o.final_price)) : null;

                    return (
                      <div key={q.id} className="flex gap-3.5 group" style={{ paddingBottom: 12 }}>
                        {/* Timeline dot */}
                        <div className="flex-shrink-0 z-10 mt-1">
                          <div className="w-[38px] h-[38px] rounded-2xl flex items-center justify-center text-sm font-bold text-white transition-transform group-hover:scale-105"
                            style={{ backgroundColor: isConfirmed ? '#16A34A' : isDraft ? '#94A3B8' : '#134956', boxShadow: qi === 0 ? '0 0 0 3px rgba(19,73,86,0.15)' : 'none' }}>
                            {qi + 1}
                          </div>
                        </div>

                        {/* Card — clickable */}
                        <button onClick={() => setSelectedQuote(q)} className="flex-1 min-w-0 text-left rounded-2xl overflow-hidden transition-all hover:shadow-md"
                          style={{ border: isConfirmed ? '1.5px solid #86EFAC' : '1px solid #E2E8F0', boxShadow: isConfirmed ? '0 0 0 3px #DCFCE7' : '0 1px 3px rgba(0,0,0,0.04)' }}>

                          {/* Card header */}
                          <div className="px-4 py-3 flex items-center justify-between"
                            style={{ background: isConfirmed ? 'linear-gradient(135deg,#F0FDF4,#DCFCE7)' : isDraft ? '#F8FAFC' : 'linear-gradient(135deg,#F0F9FF,#EFF6FF)' }}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{q.quote_number}</p>
                                {isConfirmed && <span className="text-[10px]">✅</span>}
                              </div>
                              <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>{formatDate(q.created_at)}</p>
                            </div>
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: qsc.bg, color: qsc.text }}>{q.status}</span>
                          </div>

                          {/* Card body */}
                          <div className="px-4 py-3 bg-white">
                            {/* Pax + duration */}
                            <div className="flex items-center gap-3 text-xs mb-2" style={{ color: '#64748B' }}>
                              {q.adults > 0 && <span>👥 {q.adults} pax</span>}
                              {q.duration_days > 0 && <span>🗓 {q.duration_days}D</span>}
                              {minPrice !== null && (
                                <span className="font-semibold" style={{ color: '#0F172A' }}>
                                  ₹{minPrice.toLocaleString('en-IN')}{maxPrice !== minPrice ? ` – ₹${maxPrice!.toLocaleString('en-IN')}` : ''}
                                </span>
                              )}
                            </div>

                            {/* Engagement badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {views > 0 ? (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                                  👁 {views} view{views > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F1F5F9', color: '#94A3B8' }}>Not opened</span>
                              )}
                              {q.events.some(e => e.event_type === 'whatsapp_clicked') && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>💬 WA clicked</span>
                              )}
                              {q.events.some(e => e.event_type === 'package_selected') && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>📦 Pkg picked</span>
                              )}
                              {hasEngagement && (
                                <span className="ml-auto text-[10px] font-semibold" style={{ color: '#94A3B8' }}>Tap to view →</span>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ACTIVITY — premium timeline */}
            {tab === 'activity' && (
              <div className="space-y-1">
                {activities.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#F1F5F9' }}>
                      <Clock className="w-5 h-5" style={{ color: '#CBD5E1' }} />
                    </div>
                    <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>No activity recorded yet</p>
                  </div>
                )}
                <div className="relative">
                  {activities.length > 1 && (
                    <div className="absolute left-[19px] top-10 bottom-4 w-px" style={{ background: 'linear-gradient(to bottom, #E2E8F0, transparent)' }} />
                  )}
                  {activities.map((a, idx) => {
                    const meta = (a.metadata ?? {}) as Record<string, string>;
                    const cfg = ACTIVITY_CONFIG[a.type] ?? { icon: '🔔', color: '#94A3B8', label: () => a.type.replace(/_/g, ' ') };
                    const isFirst = idx === 0;
                    return (
                      <div key={a.id} className="flex gap-3.5 group" style={{ paddingBottom: 8 }}>
                        {/* Icon */}
                        <div className="flex-shrink-0 relative z-10 mt-1">
                          <div className="w-[38px] h-[38px] rounded-2xl flex items-center justify-center text-base transition-transform group-hover:scale-105"
                            style={{
                              background: `linear-gradient(135deg, ${cfg.color}22, ${cfg.color}10)`,
                              border: `1.5px solid ${cfg.color}30`,
                              boxShadow: isFirst ? `0 0 0 3px ${cfg.color}15` : 'none',
                            }}>
                            {cfg.icon}
                          </div>
                        </div>
                        {/* Card */}
                        <div className="flex-1 min-w-0 pb-2">
                          <div className="rounded-2xl overflow-hidden transition-shadow group-hover:shadow-sm"
                            style={{ background: isFirst ? `linear-gradient(135deg, ${cfg.color}08, white)` : 'white', border: `1px solid ${isFirst ? cfg.color + '20' : '#F1F5F9'}` }}>
                            <div className="px-4 py-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold leading-snug" style={{ color: '#0F172A' }}>{cfg.label(meta)}</p>
                                <span className="text-[10px] font-medium flex-shrink-0 mt-0.5 whitespace-nowrap" style={{ color: '#94A3B8' }}>{timeAgo(a.created_at)}</span>
                              </div>
                              {a.type === 'stage_changed' && meta.from && (
                                <div className="flex items-center gap-1.5 mt-2">
                                  <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>{meta.from}</span>
                                  <MoveRight className="w-3 h-3 flex-shrink-0" style={{ color: '#CBD5E1' }} />
                                  <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: cfg.color + '18', color: cfg.color }}>{meta.to}</span>
                                </div>
                              )}
                              {a.type === 'call_logged' && meta.outcome && (
                                <div className="mt-1.5">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#E0F2FE', color: '#0369A1' }}>{meta.outcome}</span>
                                </div>
                              )}
                              <p className="text-[11px] mt-2 font-medium" style={{ color: '#CBD5E1' }}>{formatDateTime(a.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

function BulkActionBar({
  count, stages, onMoveStage, onDelete, onClear,
}: {
  count: number; stages: Stage[];
  onMoveStage: (stageId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [showStageMenu, setShowStageMenu] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg"
      style={{ backgroundColor: '#0F172A', color: 'white' }}>
      <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#7DD3C0' }} />
      <span className="text-[#7DD3C0]">{count} selected</span>
      <div className="w-px h-4 bg-white/20" />

      {/* Move stage */}
      <div className="relative">
        <button onClick={() => setShowStageMenu(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-white/10">
          <MoveRight className="w-3.5 h-3.5" /> Move Stage <ChevronDown className="w-3 h-3" />
        </button>
        {showStageMenu && (
          <div className="absolute top-9 left-0 bg-white rounded-xl shadow-xl overflow-hidden z-10 min-w-[160px]"
            style={{ border: '1px solid #E2E8F0' }}>
            {stages.map(s => (
              <button key={s.id} onClick={() => { onMoveStage(s.id); setShowStageMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-[#F8FAFC] text-left"
                style={{ color: '#0F172A' }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <button onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 transition-colors hover:bg-white/10">
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>

      <div className="flex-1" />
      <button onClick={onClear} className="text-white/50 hover:text-white transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface CrmUser { id: string; name: string; role: string }

export default function PipelinesPage() {
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterOwner, setFilterOwner] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const draggingLeadId = useRef<string | null>(null);
  const qc = useQueryClient();

  // ─── React Query data ───────────────────────────────────────────────────────
  const { data: pipelinesData, isLoading: loadingPipelines } = usePipelines();
  const rawPipelines = (pipelinesData as Pipeline[] | undefined) ?? [];

  // Auto-select default pipeline on first load
  const resolvedPipelineId = activePipelineId ||
    (rawPipelines.find(p => p.is_default)?.id ?? rawPipelines[0]?.id ?? '');

  const filterParams = new URLSearchParams();
  if (filterOwner)    filterParams.set('owner_id',  filterOwner);
  if (filterDateFrom) filterParams.set('date_from', filterDateFrom);
  if (filterDateTo)   filterParams.set('date_to',   filterDateTo);

  const { data: pipelineDetail } = usePipeline(resolvedPipelineId, filterParams);

  const { data: usersData } = useUsers();
  const users: CrmUser[] = (usersData as CrmUser[] | undefined) ?? [];

  const stageMutation = useLeadStageMutation(resolvedPipelineId, filterParams);
  const prefetchLead  = usePrefetchLead();

  // Merge pipeline list with live detail data
  const pipelines: Pipeline[] = rawPipelines.map(p =>
    p.id === resolvedPipelineId && pipelineDetail
      ? { ...p, stages: (pipelineDetail as Pipeline).stages, leads: (pipelineDetail as Pipeline).leads }
      : p
  );

  const activePipeline = pipelines.find(p => p.id === resolvedPipelineId);

  function handleDragStart(e: React.DragEvent, leadId: string) {
    draggingLeadId.current = leadId;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(stageId: string) {
    const leadId = draggingLeadId.current;
    if (!leadId) return;
    draggingLeadId.current = null;
    stageMutation.mutate({ leadId, stageId });
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = (activePipeline?.leads ?? []).map(l => l.id);
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  async function bulkMoveStage(stageId: string) {
    await Promise.all(Array.from(selectedIds).map(leadId =>
      fetch(`/api/v1/leads/${leadId}/stage`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      })
    ));
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });
  }

  function toggleSelectAllInStage(stageId: string, stageLeads: Lead[]) {
    const allSelected = stageLeads.every(l => selectedIds.has(l.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      stageLeads.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id));
      return next;
    });
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    await Promise.all(Array.from(selectedIds).map(leadId =>
      fetch(`/api/v1/leads/${leadId}`, { method: 'DELETE' })
    ));
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });
  }

  // Filter + sort leads
  function processLeads(leads: Lead[]) {
    let result = leads;
    if (search) result = result.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search));
    if (filterStatus) result = result.filter(l => l.status === filterStatus);
    if (sortBy === 'newest') result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'oldest') result = [...result].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (sortBy === 'name') result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }

  function leadsForStage(stageId: string) {
    return processLeads((activePipeline?.leads ?? []).filter(l => l.stage_id === stageId));
  }

  const allLeads = processLeads(activePipeline?.leads ?? []);

  if (loadingPipelines) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#134956' }} />
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-lg font-semibold" style={{ color: '#0F172A' }}>No pipelines yet</p>
        <Link href="/admin/pipelines/config" className="px-5 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#134956' }}>
          Configure Pipelines
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white px-5 lg:px-8 py-4 space-y-3" style={{ borderBottom: '1px solid #E2E8F0' }}>
        {/* Row 1: Pipeline tabs + actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto">
            {pipelines.map(p => (
              <button key={p.id} onClick={() => { setActivePipelineId(p.id); setSelectedIds(new Set()); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0"
                style={{
                  backgroundColor: resolvedPipelineId === p.id ? '#134956' : '#F8FAFC',
                  color: resolvedPipelineId === p.id ? '#fff' : '#64748B',
                  border: '1px solid', borderColor: resolvedPipelineId === p.id ? '#134956' : '#E2E8F0',
                }}>
                {p.name}{p.is_default && <span className="ml-1.5 text-[10px] opacity-70">★</span>}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {/* Select all */}
          <button onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            {selectedIds.size === (activePipeline?.leads ?? []).length && selectedIds.size > 0
              ? <CheckSquare className="w-3.5 h-3.5" style={{ color: '#134956' }} />
              : <Square className="w-3.5 h-3.5" />}
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select All'}
          </button>
          {resolvedPipelineId && (
            <button onClick={() => setShowAddLead(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#134956' }}>
              <Plus className="w-4 h-4" /> New Lead
            </button>
          )}
          <Link href="/admin/pipelines/config"
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            Configure
          </Link>
        </div>

        {/* Row 2: Search + filter + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..."
              className="pl-9 pr-4 py-2 text-sm rounded-lg outline-none" style={{ border: '1px solid #E2E8F0', width: 200 }} />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <button onClick={() => setShowFilters(p => !p)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ border: `1px solid ${filterStatus ? '#134956' : '#E2E8F0'}`, color: filterStatus ? '#134956' : '#64748B', backgroundColor: filterStatus ? '#F0F9FF' : 'white' }}>
              <Filter className="w-3.5 h-3.5" /> {filterStatus ? filterStatus : 'Status'}
            </button>
            {showFilters && (
              <div className="absolute top-10 left-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[160px]"
                style={{ border: '1px solid #E2E8F0' }}>
                <button onClick={() => { setFilterStatus(''); setShowFilters(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-[#F8FAFC]"
                  style={{ color: !filterStatus ? '#134956' : '#64748B' }}>All Statuses</button>
                {Object.keys(STATUS_COLORS).map(s => (
                  <button key={s} onClick={() => { setFilterStatus(s); setShowFilters(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-[#F8FAFC]"
                    style={{ color: filterStatus === s ? '#134956' : '#64748B' }}>{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Salesperson/owner filter */}
          <div className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ border: `1px solid ${filterOwner ? '#134956' : '#E2E8F0'}`, backgroundColor: filterOwner ? '#F0F9FF' : 'white', color: filterOwner ? '#134956' : '#64748B' }}>
            <Users className="w-3.5 h-3.5" />
            <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
              className="outline-none bg-transparent text-xs font-semibold" style={{ color: filterOwner ? '#134956' : '#64748B' }}>
              <option value="">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Date filter */}
          <div className="relative">
            <button onClick={() => setShowDateFilter(p => !p)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ border: `1px solid ${filterDateFrom || filterDateTo ? '#134956' : '#E2E8F0'}`, color: filterDateFrom || filterDateTo ? '#134956' : '#64748B', backgroundColor: filterDateFrom || filterDateTo ? '#F0F9FF' : 'white' }}>
              <Calendar className="w-3.5 h-3.5" /> Date
            </button>
            {showDateFilter && (
              <div className="absolute top-10 left-0 bg-white rounded-xl shadow-xl z-20 p-4 space-y-3 min-w-[220px]"
                style={{ border: '1px solid #E2E8F0' }}>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>From</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                    className="w-full text-xs rounded-lg px-2 py-2 mt-1 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>To</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                    className="w-full text-xs rounded-lg px-2 py-2 mt-1 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setShowDateFilter(false); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Clear</button>
                  <button onClick={() => setShowDateFilter(false)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: '#134956' }}>Apply</button>
                </div>
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs font-semibold outline-none py-2 px-2 rounded-lg"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          <div className="flex-1" />
          <div className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg"
            style={{ backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
            <User className="w-3.5 h-3.5" />
            {allLeads.length} leads
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <BulkActionBar
            count={selectedIds.size}
            stages={activePipeline?.stages ?? []}
            onMoveStage={bulkMoveStage}
            onDelete={bulkDelete}
            onClear={() => setSelectedIds(new Set())}
          />
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full p-5 lg:p-8 min-w-max">
          {(activePipeline?.stages ?? []).map(stage => {
            const stageLeads = leadsForStage(stage.id);
            return (
              <KanbanColumn
                key={stage.id} stage={stage}
                leads={stageLeads}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onLeadClick={setSelectedLead}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAllInStage={() => toggleSelectAllInStage(stage.id, stageLeads)}
                onPrefetch={prefetchLead}
              />
            );
          })}
          {(activePipeline?.stages ?? []).length === 0 && (
            <div className="flex items-center justify-center w-full">
              <p className="text-sm" style={{ color: '#94A3B8' }}>No stages configured. Go to Pipeline Config to add stages.</p>
            </div>
          )}
        </div>
      </div>

      {showAddLead && resolvedPipelineId && (
        <AddLeadDrawer pipelineId={resolvedPipelineId} onClose={() => setShowAddLead(false)} onCreated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })} />
      )}
      {selectedLead && (
        <LeadDrawer
          leadId={selectedLead.id} stages={activePipeline?.stages ?? []}
          onClose={() => setSelectedLead(null)} onUpdated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })}
        />
      )}
    </div>
  );
}
