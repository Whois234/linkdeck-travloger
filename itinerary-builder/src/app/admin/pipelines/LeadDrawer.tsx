'use client';
import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X, ChevronDown, Phone, MessageCircle, Plus, FileText,
  Loader2, Clock, CheckCircle2, AlertCircle, MoveRight,
  PhoneCall, RefreshCw, Users, Pin, Sparkles, ArrowLeftRight, Bell,
  Send, Eye, CheckCircle, Package, BarChart2, ClipboardList,
  Calendar, VoicemailIcon, PhoneMissed, PhoneOff, PhoneIncoming,
  type LucideProps,
} from 'lucide-react';
import Link from 'next/link';
import { useLead, useAddNote, useLogCall, useAddTask, useMarkTaskDone, QK } from '@/lib/query-hooks';
import { DrawerSkeleton } from '@/components/Skeleton';
import {
  Stage, Lead, Note, CallLog, Task, Activity, QuoteRef,
  STATUS_COLORS, QUOTE_STATUS_COLORS, TASK_ICONS, ACTIVITY_CONFIG, SECTION_ORDER,
  timeAgo, formatDate, formatDateTime, fmtSecs,
} from './types';

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  PhoneCall, RefreshCw, FileText, Users, Pin, Sparkles, ArrowLeftRight, Clock, Bell,
  Send, Eye, CheckCircle,
};
function DynamicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Icon = ICON_MAP[name] ?? Bell;
  return <Icon className={className} style={style} />;
}

// ─── Floating Call Banner ─────────────────────────────────────────────────────

function CallBanner({
  leadName, phone, initialElapsed = 0,
  onEndCall, onNotAnswered,
}: {
  leadName: string; phone: string; initialElapsed?: number;
  onEndCall: (elapsed: number) => void;
  onNotAnswered: () => void;
}) {
  const [elapsed, setElapsed] = useState(initialElapsed);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[80] flex justify-center pointer-events-none" style={{ padding: '0 16px 20px' }}>
      <div className="pointer-events-auto w-full max-w-[480px] rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0F172A', boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)' }}>
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
        <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '0 20px' }} />
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

  // Duration stored in seconds; manual entry is in minutes, converted to seconds
  const durationForApi = initialElapsed > 0
    ? initialElapsed
    : (manualDuration ? parseInt(manualDuration) * 60 : null);

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
              Open
            </Link>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
              <X className="w-4 h-4" style={{ color: '#64748B' }} />
            </button>
          </div>
        </div>

        <div className="flex px-6 pt-3 pb-0 gap-1 flex-shrink-0">
          {(['details', 'analytics'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-xs font-semibold capitalize transition-colors"
              style={{ backgroundColor: view === v ? '#F8FAFC' : 'transparent', color: view === v ? '#134956' : '#94A3B8', borderBottom: view === v ? '2px solid #134956' : '2px solid transparent' }}>
              {v === 'analytics' ? <><BarChart2 className="w-3.5 h-3.5" /> Analytics</> : <><ClipboardList className="w-3.5 h-3.5" /> Details</>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {view === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Adults',   value: `${quote.adults} pax` },
                  { label: 'Duration', value: `${quote.duration_days} days` },
                  { label: 'Travel',   value: quote.start_date ? formatDate(quote.start_date) : '—' },
                ].map(f => (
                  <div key={f.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>{f.label}</p>
                    <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{f.value}</p>
                  </div>
                ))}
              </div>
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
                        <p className="text-sm font-bold" style={{ color: '#0F172A' }}>₹{Math.round(opt.final_price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { Icon: Eye,             label: 'Views',     value: views,             color: views > 0 ? '#2563EB' : '#94A3B8' },
                  { Icon: MessageCircle,   label: 'WhatsApp',  value: waClicks,          color: waClicks > 0 ? '#16A34A' : '#94A3B8' },
                  { Icon: Package,         label: 'Pkg Picks', value: pkgEvents.length,  color: pkgEvents.length > 0 ? '#D97706' : '#94A3B8' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <div className="flex justify-center mb-1"><s.Icon className="w-4 h-4" style={{ color: s.color }} /></div>
                    <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] font-medium" style={{ color: '#94A3B8' }}>{s.label}</p>
                  </div>
                ))}
              </div>
              {approved && (
                <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#16A34A' }} />
                  <p className="text-sm font-semibold" style={{ color: '#15803D' }}>Customer approved this quote</p>
                </div>
              )}
            </div>
          )}

          {view === 'analytics' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { Icon: Eye,           label: 'Sessions',        value: views,             color: '#8B5CF6' },
                  { Icon: MessageCircle, label: 'WhatsApp Clicks', value: waClicks,          color: '#22C55E' },
                  { Icon: Package,       label: 'Pkg Selected',    value: pkgEvents.length,  color: '#F59E0B' },
                  { Icon: CheckCircle2,  label: 'Approved',        value: approved ? 1 : 0,  color: '#10B981' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: s.color + '15' }}>
                      <s.Icon className="w-4 h-4" style={{ color: s.color }} />
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-[10px] font-medium mt-0.5" style={{ color: '#94A3B8' }}>{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
              {topSections.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>Section Engagement</p>
                  <div className="space-y-2.5">
                    {topSections.map(([section, secs]) => (
                      <div key={section}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium capitalize" style={{ color: '#374151' }}>{section}</span>
                          <span className="text-xs font-bold" style={{ color: '#0F172A' }}>{fmtSecs(secs)}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                          <div className="h-2 rounded-full transition-all" style={{ width: `${(secs / maxSec) * 100}%`, backgroundColor: '#134956' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

export { CallBanner, CallLogPopup };

export type CallState = { active: boolean; leadId: string; leadName: string; phone: string; elapsed: number } | null;

export default function LeadDrawer({
  leadId, stages, users, onClose, onUpdated, callState, setCallState,
}: {
  leadId: string; stages: Stage[]; users?: { id: string; name: string }[]; onClose: () => void; onUpdated: () => void;
  callState: CallState;
  setCallState: (s: CallState) => void;
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
  const [movingStage, setMovingStage]       = useState(false);
  const [assigningAgent, setAssigningAgent] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', destination_interest: '', travel_month: '', budget_range: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<QuoteRef | null>(null);
  const [callPopupState, setCallPopupState] = useState<{ elapsed: number; outcome: string } | null>(null);

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

  const addNoteMutation  = useAddNote(leadId);
  const addTaskMutation  = useAddTask(leadId);
  const markTaskMutation = useMarkTaskDone(leadId);
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

  async function assignAgent(agentId: string | null) {
    setAssigningAgent(true);
    await fetch(`/api/v1/leads/${leadId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_agent_id: agentId }),
    });
    setAssigningAgent(false);
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
    return <DrawerSkeleton onClose={onClose} />;
  }

  const currentStage = stages.find(s => s.id === lead.stage_id);
  const sc = STATUS_COLORS[lead.status] ?? { bg: '#F8FAFC', text: '#64748B' };

  return (
    <>
      {/* CallBanner is rendered at page level for persistence across drawer open/close */}
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
              {/* Assigned agent dropdown */}
              {users && users.length > 0 && (
                <div className="relative">
                  <select
                    value={lead.assigned_agent_id ?? ''}
                    onChange={e => assignAgent(e.target.value || null)}
                    disabled={assigningAgent}
                    className="text-xs font-semibold pl-2 pr-6 py-1 rounded-full outline-none appearance-none cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: lead.assigned_agent_id ? '#EEF7F9' : '#F1F5F9', color: lead.assigned_agent_id ? '#134956' : '#94A3B8', border: `1px solid ${lead.assigned_agent_id ? '#134956' : '#E2E8F0'}` }}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: lead.assigned_agent_id ? '#134956' : '#94A3B8' }} />
                </div>
              )}

              <div className="flex-1" />
              <button
                onClick={() => { window.location.href = `tel:${lead.phone}`; setCallState({ active: true, leadId, leadName: lead.name, phone: lead.phone, elapsed: 0 }); }}
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

            <div className="flex mt-4 overflow-x-auto" style={{ borderBottom: '1px solid #F1F5F9' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className="px-3 py-2 text-[11px] font-semibold whitespace-nowrap transition-colors flex-shrink-0"
                  style={{ color: tab === t.key ? '#134956' : '#94A3B8', borderBottom: tab === t.key ? '2px solid #134956' : '2px solid transparent', marginBottom: -1 }}>
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
                      {c.duration != null && c.duration > 0 && <span className="text-xs" style={{ color: '#64748B' }}>{fmtSecs(c.duration)}</span>}
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
                      <button onClick={() => !isDone && markTaskMutation.mutate(t.id)} disabled={isDone} className="mt-0.5 flex-shrink-0">
                        {isDone ? <CheckCircle2 className="w-5 h-5" style={{ color: '#16A34A' }} /> :
                          isOverdue ? <AlertCircle className="w-5 h-5" style={{ color: '#DC2626' }} /> :
                          <Clock className="w-5 h-5" style={{ color: '#64748B' }} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <DynamicIcon name={TASK_ICONS[t.type] ?? 'Pin'} className="w-4 h-4 flex-shrink-0" style={{ color: '#64748B' }} />
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
                        <div className="flex-shrink-0 z-10 mt-1">
                          <div className="w-[38px] h-[38px] rounded-2xl flex items-center justify-center text-sm font-bold text-white transition-transform group-hover:scale-105"
                            style={{ backgroundColor: isConfirmed ? '#16A34A' : isDraft ? '#94A3B8' : '#134956', boxShadow: qi === 0 ? '0 0 0 3px rgba(19,73,86,0.15)' : 'none' }}>
                            {qi + 1}
                          </div>
                        </div>
                        <button onClick={() => setSelectedQuote(q)} className="flex-1 min-w-0 text-left rounded-2xl overflow-hidden transition-all hover:shadow-md"
                          style={{ border: isConfirmed ? '1.5px solid #86EFAC' : '1px solid #E2E8F0', boxShadow: isConfirmed ? '0 0 0 3px #DCFCE7' : '0 1px 3px rgba(0,0,0,0.04)' }}>
                          <div className="px-4 py-3 flex items-center justify-between"
                            style={{ background: isConfirmed ? 'linear-gradient(135deg,#F0FDF4,#DCFCE7)' : isDraft ? '#F8FAFC' : 'linear-gradient(135deg,#F0F9FF,#EFF6FF)' }}>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{q.quote_number}</p>
                                {isConfirmed && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />}
                              </div>
                              <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>{formatDate(q.created_at)}</p>
                            </div>
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: qsc.bg, color: qsc.text }}>{q.status}</span>
                          </div>
                          <div className="px-4 py-3 bg-white">
                            <div className="flex items-center gap-3 text-xs mb-2" style={{ color: '#64748B' }}>
                              {q.adults > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{q.adults} pax</span>}
                              {q.duration_days > 0 && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{q.duration_days}D</span>}
                              {minPrice !== null && (
                                <span className="font-semibold" style={{ color: '#0F172A' }}>
                                  ₹{Math.round(minPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}{maxPrice !== minPrice ? ` – ₹${Math.round(maxPrice!).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {views > 0 ? (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                                  <Eye className="w-2.5 h-2.5" />{views} view{views > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F1F5F9', color: '#94A3B8' }}>Not opened</span>
                              )}
                              {q.events.some(e => e.event_type === 'whatsapp_clicked') && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}><MessageCircle className="w-2.5 h-2.5" />WA clicked</span>
                              )}
                              {q.events.some(e => e.event_type === 'package_selected') && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}><Package className="w-2.5 h-2.5" />Pkg picked</span>
                              )}
                              {hasEngagement && <span className="ml-auto text-[10px] font-semibold" style={{ color: '#94A3B8' }}>Tap to view →</span>}
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
                    const cfg = ACTIVITY_CONFIG[a.type] ?? { icon: 'Bell', color: '#94A3B8', label: () => a.type.replace(/_/g, ' ') };
                    const isFirst = idx === 0;
                    return (
                      <div key={a.id} className="flex gap-3.5 group" style={{ paddingBottom: 8 }}>
                        <div className="flex-shrink-0 relative z-10 mt-1">
                          <div className="w-[38px] h-[38px] rounded-2xl flex items-center justify-center text-base transition-transform group-hover:scale-105"
                            style={{ background: `linear-gradient(135deg, ${cfg.color}22, ${cfg.color}10)`, border: `1.5px solid ${cfg.color}30`, boxShadow: isFirst ? `0 0 0 3px ${cfg.color}15` : 'none' }}>
                            <DynamicIcon name={cfg.icon} className="w-4 h-4" style={{ color: cfg.color }} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pb-2">
                          <div className="rounded-2xl overflow-hidden transition-shadow group-hover:shadow-sm"
                            style={{ background: isFirst ? `linear-gradient(135deg, ${cfg.color}08, white)` : 'white', border: `1px solid ${isFirst ? cfg.color + '20' : '#F1F5F9'}` }}>
                            <div className="px-4 py-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold leading-snug" style={{ color: '#0F172A' }}>{cfg.label(meta)}</p>
                                  {cfg.sublabel && cfg.sublabel(meta) && (
                                    <p className="text-[11px] mt-0.5 font-medium" style={{ color: '#94A3B8' }}>{cfg.sublabel(meta)}</p>
                                  )}
                                </div>
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
