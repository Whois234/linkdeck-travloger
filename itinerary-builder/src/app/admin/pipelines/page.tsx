'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Search, Phone, MessageCircle, ChevronDown, X, User,
  Clock, CheckCircle2, AlertCircle, FileText, Loader2,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  destination_interest: string | null;
  travel_month: string | null;
  budget_range: string | null;
  status: string;
  stage_id: string | null;
  pipeline_id: string | null;
  created_at: string;
  stage?: { id: string; name: string; color: string; order: number } | null;
}

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  stages: Stage[];
  leads: Lead[];
}

interface Note { id: string; content: string; created_at: string; created_by: string }
interface CallLog { id: string; duration: number | null; outcome: string; notes: string | null; created_at: string; created_by: string }
interface Task { id: string; type: string; due_time: string; status: string; notes: string | null }
interface Activity { id: string; type: string; metadata: Record<string, unknown> | null; created_at: string; created_by: string }

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW:         { bg: '#EFF6FF', text: '#2563EB' },
  CONTACTED:   { bg: '#F0FDF4', text: '#16A34A' },
  QUALIFIED:   { bg: '#FEF9C3', text: '#A16207' },
  NEGOTIATING: { bg: '#FFF7ED', text: '#C2410C' },
  WON:         { bg: '#DCFCE7', text: '#15803D' },
  LOST:        { bg: '#FEF2F2', text: '#DC2626' },
};

const TASK_ICONS: Record<string, string> = {
  call: '📞', follow_up: '🔁', send_quote: '📄', meeting: '🤝', other: '📌',
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

// ─── Lead Card ───────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  stageColor,
  onDragStart,
  onClick,
}: {
  lead: Lead;
  stageColor: string;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onClick: (lead: Lead) => void;
}) {
  const sc = STATUS_COLORS[lead.status] ?? { bg: '#F8FAFC', text: '#64748B' };
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onClick={() => onClick(lead)}
      className="bg-white rounded-xl p-4 cursor-pointer transition-shadow hover:shadow-md select-none"
      style={{ border: '1px solid #E2E8F0', borderLeft: `3px solid ${stageColor}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold leading-snug" style={{ color: '#0F172A' }}>{lead.name}</p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: sc.bg, color: sc.text }}>
          {lead.status}
        </span>
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
          <a
            href={`tel:${lead.phone}`}
            onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[#F0FDF4]"
            title="Call"
          >
            <Phone className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
          </a>
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[#F0FDF4]"
            title="WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5" style={{ color: '#25D366' }} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Column ───────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  leads,
  onDragStart,
  onDrop,
  onLeadClick,
}: {
  stage: Stage;
  leads: Lead[];
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDrop: (stageId: string) => void;
  onLeadClick: (lead: Lead) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className="flex flex-col rounded-xl flex-shrink-0 w-[280px]"
      style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id); }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 rounded-t-xl flex items-center justify-between"
        style={{ borderBottom: `2px solid ${stage.color}`, backgroundColor: `${stage.color}18` }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
          <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{stage.name}</p>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: stage.color + '22', color: stage.color }}
        >
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-3 transition-colors"
        style={{
          minHeight: 120,
          backgroundColor: over ? `${stage.color}08` : undefined,
          maxHeight: 'calc(100vh - 220px)',
        }}
      >
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            stageColor={stage.color}
            onDragStart={onDragStart}
            onClick={onLeadClick}
          />
        ))}
        {leads.length === 0 && (
          <div
            className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs"
            style={{ borderColor: over ? stage.color : '#E2E8F0', color: '#94A3B8' }}
          >
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        <input
          type={type}
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-all"
          style={{ border: '1px solid #D1D5DB', color: '#111827' }}
          onFocus={e => (e.target.style.borderColor = '#134956')}
          onBlur={e => (e.target.style.borderColor = '#D1D5DB')}
        />
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
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button
            onClick={e => handleSubmit(e as unknown as React.FormEvent)}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#134956' }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating...' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Call Log Popup ───────────────────────────────────────────────────────────

function CallLogPopup({ leadId, onClose, onSaved }: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [duration, setDuration] = useState('');
  const [outcome, setOutcome] = useState('ANSWERED');
  const [notes, setNotes] = useState('');
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextType, setNextType] = useState('call');
  const [nextTime, setNextTime] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/v1/leads/${leadId}/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration: duration ? parseInt(duration) : null,
        outcome, notes,
        next_task_type: scheduleNext ? nextType : undefined,
        next_task_time: scheduleNext && nextTime ? nextTime : undefined,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="font-bold text-base" style={{ color: '#0F172A' }}>Log Call</p>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: '#94A3B8' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Duration (minutes)</label>
            <input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 5"
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Outcome</label>
            <select value={outcome} onChange={e => setOutcome(e.target.value)}
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none" style={{ border: '1px solid #D1D5DB' }}>
              <option value="ANSWERED">Answered</option>
              <option value="NO_ANSWER">No Answer</option>
              <option value="BUSY">Busy</option>
              <option value="CALLBACK_REQUESTED">Callback Requested</option>
              <option value="VOICEMAIL">Voicemail</option>
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
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#134956' }}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Call
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lead Drawer ──────────────────────────────────────────────────────────────

function LeadDrawer({
  leadId,
  stages,
  onClose,
  onUpdated,
}: {
  leadId: string;
  stages: Stage[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tab, setTab] = useState<'overview' | 'notes' | 'calls' | 'tasks' | 'activity'>('overview');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showCallPopup, setShowCallPopup] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskType, setTaskType] = useState('call');
  const [taskDue, setTaskDue] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', destination_interest: '', travel_month: '', budget_range: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/leads/${leadId}`);
    const d = await res.json();
    if (d.success) {
      setLead(d.data);
      setNotes(d.data.lead_notes ?? []);
      setCalls(d.data.call_logs ?? []);
      setTasks(d.data.lead_tasks ?? []);
      setActivities(d.data.lead_activities ?? []);
      setEditForm({
        name: d.data.name,
        phone: d.data.phone,
        email: d.data.email ?? '',
        destination_interest: d.data.destination_interest ?? '',
        travel_month: d.data.travel_month ?? '',
        budget_range: d.data.budget_range ?? '',
      });
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    await fetch(`/api/v1/leads/${leadId}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteText }),
    });
    setNoteText('');
    setSavingNote(false);
    load();
  }

  async function moveStage(stageId: string) {
    setMovingStage(true);
    await fetch(`/api/v1/leads/${leadId}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId }),
    });
    setMovingStage(false);
    load();
    onUpdated();
  }

  async function addTask() {
    if (!taskDue) return;
    setSavingTask(true);
    await fetch(`/api/v1/leads/${leadId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: taskType, due_time: new Date(taskDue).toISOString(), notes: taskNotes }),
    });
    setShowTaskForm(false); setTaskDue(''); setTaskNotes('');
    setSavingTask(false);
    load();
  }

  async function markTaskDone(taskId: string) {
    await fetch(`/api/v1/leads/${leadId}/tasks?taskId=${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    load();
  }

  async function saveEdit() {
    setSavingEdit(true);
    await fetch(`/api/v1/leads/${leadId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setSavingEdit(false);
    setEditMode(false);
    load();
    onUpdated();
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'notes',    label: `Notes (${notes.length})` },
    { key: 'calls',    label: `Calls (${calls.length})` },
    { key: 'tasks',    label: `Tasks (${tasks.length})` },
    { key: 'activity', label: 'Activity' },
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
      {showCallPopup && (
        <CallLogPopup leadId={leadId} onClose={() => setShowCallPopup(false)} onSaved={() => { load(); onUpdated(); }} />
      )}
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
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>Stage:</span>
              <div className="relative">
                <select
                  value={lead.stage_id ?? ''}
                  onChange={e => moveStage(e.target.value)}
                  disabled={movingStage}
                  className="text-xs font-bold pl-2 pr-6 py-1 rounded-full outline-none appearance-none cursor-pointer"
                  style={{ backgroundColor: currentStage ? currentStage.color + '22' : '#F1F5F9', color: currentStage?.color ?? '#64748B', border: `1px solid ${currentStage?.color ?? '#E2E8F0'}` }}
                >
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: currentStage?.color ?? '#64748B' }} />
              </div>

              <div className="flex-1" />

              {/* Actions */}
              <a href={`tel:${lead.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#16A34A' }}>
                <Phone className="w-3.5 h-3.5" /> Call
              </a>
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#25D366' }}>
                <MessageCircle className="w-3.5 h-3.5" /> WA
              </a>
              <button onClick={() => setShowCallPopup(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#134956' }}>
                + Log Call
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 mt-4 overflow-x-auto" style={{ borderBottom: '1px solid #F1F5F9' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className="px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0"
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
                    {[
                      ['Name', 'name'],
                      ['Phone', 'phone'],
                      ['Email', 'email'],
                      ['Destination Interest', 'destination_interest'],
                      ['Travel Month', 'travel_month'],
                      ['Budget Range', 'budget_range'],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>{label}</label>
                        <input
                          value={editForm[key as keyof typeof editForm]}
                          onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                          style={{ border: '1px solid #D1D5DB' }}
                        />
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
                      {[
                        ['Source', lead.source],
                        ['Destination', lead.destination_interest],
                        ['Travel Month', lead.travel_month],
                        ['Budget', lead.budget_range],
                      ].map(([label, value]) => (
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
                    <div className="pt-2">
                      <Link href={`/admin/quotes?lead_id=${lead.id}&lead_name=${encodeURIComponent(lead.name)}`}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
                        style={{ border: '1px dashed #134956', color: '#134956' }}>
                        <FileText className="w-4 h-4" /> Create Quote from this Lead
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* NOTES */}
            {tab === 'notes' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <textarea
                    value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    rows={3}
                    className="flex-1 text-sm rounded-lg px-3 py-2.5 outline-none resize-none"
                    style={{ border: '1px solid #D1D5DB' }}
                  />
                  <button onClick={addNote} disabled={savingNote || !noteText.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white self-start flex items-center gap-1"
                    style={{ backgroundColor: '#134956', opacity: !noteText.trim() ? 0.5 : 1 }}>
                    {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
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
                      <button onClick={addTask} disabled={savingTask || !taskDue}
                        className="flex-1 py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1"
                        style={{ backgroundColor: '#134956' }}>
                        {savingTask && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save Task
                      </button>
                    </div>
                  </div>
                )}
                {tasks.length === 0 && <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No tasks scheduled</p>}
                {tasks.map(t => {
                  const isOverdue = t.status === 'overdue';
                  const isDone = t.status === 'done';
                  return (
                    <div key={t.id} className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: isOverdue ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${isOverdue ? '#FECACA' : '#E2E8F0'}` }}>
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
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                          Due: {formatDate(t.due_time)}
                        </p>
                        {t.notes && <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{t.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ACTIVITY */}
            {tab === 'activity' && (
              <div className="space-y-2">
                {activities.length === 0 && <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No activity yet</p>}
                {activities.map(a => {
                  const meta = a.metadata as Record<string, string> | null;
                  let desc = a.type.replace(/_/g, ' ');
                  if (a.type === 'stage_changed' && meta) desc = `Moved: ${meta.from ?? '?'} → ${meta.to ?? '?'}`;
                  if (a.type === 'note_added') desc = 'Note added';
                  if (a.type === 'call_logged') desc = `Call logged (${meta?.outcome ?? ''})`;
                  if (a.type === 'task_added') desc = `Task scheduled: ${(meta?.task_type as string ?? '').replace('_', ' ')}`;
                  if (a.type === 'created') desc = 'Lead created';
                  return (
                    <div key={a.id} className="flex items-start gap-3 py-2" style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: '#134956' }} />
                      <div className="flex-1">
                        <p className="text-sm" style={{ color: '#374151' }}>{desc}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>{timeAgo(a.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const draggingLeadId = useRef<string | null>(null);

  const loadPipelines = useCallback(async () => {
    const res = await fetch('/api/v1/pipelines');
    const d = await res.json();
    if (d.success) {
      setPipelines(d.data);
      if (!activePipelineId && d.data.length > 0) {
        const def = d.data.find((p: Pipeline) => p.is_default) ?? d.data[0];
        setActivePipelineId(def.id);
      }
    }
    setLoading(false);
  }, [activePipelineId]);

  const loadActivePipeline = useCallback(async () => {
    if (!activePipelineId) return;
    const res = await fetch(`/api/v1/pipelines/${activePipelineId}`);
    const d = await res.json();
    if (d.success) {
      setPipelines(prev => prev.map(p => p.id === activePipelineId ? { ...p, stages: d.data.stages, leads: d.data.leads } : p));
    }
  }, [activePipelineId]);

  useEffect(() => { loadPipelines(); }, []);
  useEffect(() => { if (activePipelineId) loadActivePipeline(); }, [activePipelineId]);

  const activePipeline = pipelines.find(p => p.id === activePipelineId);

  function handleDragStart(e: React.DragEvent, leadId: string) {
    draggingLeadId.current = leadId;
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleDrop(stageId: string) {
    const leadId = draggingLeadId.current;
    if (!leadId) return;
    draggingLeadId.current = null;
    // Optimistic update
    setPipelines(prev => prev.map(p =>
      p.id !== activePipelineId ? p : {
        ...p,
        leads: p.leads.map(l => l.id === leadId ? { ...l, stage_id: stageId } : l),
      }
    ));
    await fetch(`/api/v1/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId }),
    });
    loadActivePipeline();
  }

  const filteredLeads = (activePipeline?.leads ?? []).filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search)
  );

  function leadsForStage(stageId: string) {
    return filteredLeads.filter(l => l.stage_id === stageId);
  }

  if (loading) {
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
        <p className="text-sm" style={{ color: '#64748B' }}>Go to Pipeline Config to create your first pipeline.</p>
        <Link href="/admin/pipelines/config"
          className="px-5 py-2.5 rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: '#134956' }}>
          Configure Pipelines
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white px-5 lg:px-8 py-4 flex items-center gap-4 flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
        {/* Pipeline tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {pipelines.map(p => (
            <button key={p.id} onClick={() => setActivePipelineId(p.id)}
              className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0"
              style={{
                backgroundColor: activePipelineId === p.id ? '#134956' : '#F8FAFC',
                color: activePipelineId === p.id ? '#fff' : '#64748B',
                border: '1px solid',
                borderColor: activePipelineId === p.id ? '#134956' : '#E2E8F0',
              }}>
              {p.name}
              {p.is_default && <span className="ml-1.5 text-[10px] opacity-70">★</span>}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="pl-9 pr-4 py-2 text-sm rounded-lg outline-none"
            style={{ border: '1px solid #E2E8F0', width: 200 }}
          />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
          <User className="w-3.5 h-3.5" />
          {filteredLeads.length} leads
        </div>

        {/* Add Lead */}
        {activePipelineId && (
          <button onClick={() => setShowAddLead(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#134956' }}>
            <Plus className="w-4 h-4" /> New Lead
          </button>
        )}

        {/* Config link */}
        <Link href="/admin/pipelines/config"
          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[#F8FAFC]"
          style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
          Configure
        </Link>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full p-5 lg:p-8 min-w-max">
          {(activePipeline?.stages ?? []).map(stage => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={leadsForStage(stage.id)}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onLeadClick={setSelectedLead}
            />
          ))}
          {(activePipeline?.stages ?? []).length === 0 && (
            <div className="flex items-center justify-center w-full">
              <p className="text-sm" style={{ color: '#94A3B8' }}>No stages configured. Go to Pipeline Config to add stages.</p>
            </div>
          )}
        </div>
      </div>

      {/* Drawers & Popups */}
      {showAddLead && activePipelineId && (
        <AddLeadDrawer
          pipelineId={activePipelineId}
          onClose={() => setShowAddLead(false)}
          onCreated={() => loadActivePipeline()}
        />
      )}
      {selectedLead && (
        <LeadDrawer
          leadId={selectedLead.id}
          stages={activePipeline?.stages ?? []}
          onClose={() => setSelectedLead(null)}
          onUpdated={() => loadActivePipeline()}
        />
      )}
    </div>
  );
}
