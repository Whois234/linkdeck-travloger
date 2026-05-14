'use client';
/**
 * /admin/workflows — Dedicated workflow management page
 * Full builder: conditions, multi-action, availability-aware user picker, run history.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Loader2, Zap, ToggleLeft, ToggleRight, Trash2,
  ChevronDown, ChevronUp, RotateCcw, Weight, Shield,
  CheckCircle2, XCircle, SkipForward, RefreshCw, Clock,
  User as UserIcon, Bell, MessageSquare, ListTodo, ArrowRight,
  Activity, Filter,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CrmWorkflow {
  id: string; name: string; module: string; trigger: string;
  conditions: Record<string, unknown> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: Array<any>;
  is_active: boolean; created_at: string; updated_at: string;
}

interface UserRecord {
  id: string; name: string; email: string; role: string;
  is_available: boolean; status: boolean;
}

interface WfUser    { user_id: string; name: string; weight?: number }
interface WfRule    { field: string; operator: string; value: string }
interface WfActionItem {
  type: 'assign_user' | 'set_follow_up' | 'send_notification' | 'update_lead_stage' | 'send_whatsapp' | 'create_task';
  users?: WfUser[];
  strategy?: 'round_robin' | 'weighted';
  user_id?: string;
  user_name?: string;
  hours_from_now?: number;
  message?: string;
  stage?: string;
  template_name?: string;
  button_url?: string;
  task_type?: string;
  notes?: string;
}

interface WorkflowRun {
  id: string; workflow_id: string; contact_id: string | null;
  contact_name: string | null; trigger: string; conditions_matched: boolean;
  action_type: string; action_detail: string | null; assigned_to: string | null;
  result: 'success' | 'failed' | 'skipped'; error: string | null; created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const T = '#134956';

const TRIGGERS = [
  { value: 'on_create',           label: 'On Contact Create' },
  { value: 'on_update',           label: 'On Contact Update' },
  { value: 'on_create_or_update', label: 'On Create or Update' },
];

const WF_CONDITION_FIELDS = [
  { value: 'lead_source',            label: 'Lead Source',        type: 'leadSource' },
  { value: 'interested_destination', label: 'Destination',        type: 'text' },
  { value: 'trip_type',              label: 'Trip Type',          type: 'text' },
  { value: 'city',                   label: 'City',               type: 'text' },
  { value: 'tags',                   label: 'Tag',                type: 'tag' },
  { value: 'campaign_name',          label: 'Campaign Name',      type: 'text' },
  { value: 'notes',                  label: 'Notes',              type: 'text' },
  { value: 'special_requirements',   label: 'Requirements',       type: 'text' },
  // Gallabox enrichment fields
  { value: 'gallabox_bot_flow_id',   label: 'Bot Flow ID',        type: 'text' },
  { value: 'gallabox_ad_id',         label: 'Ad ID (CTWA)',       type: 'text' },
  { value: 'gallabox_source',        label: 'Gallabox Source',    type: 'text' },
  { value: 'gallabox_ad_headline',   label: 'Ad Headline',        type: 'text' },
];

const TEXT_OPERATORS    = [
  { value: 'contains',     label: 'Contains'      },
  { value: 'not_contains', label: "Doesn't Contain" },
  { value: 'is',           label: 'Is'            },
  { value: 'is_not',       label: 'Is Not'        },
  { value: 'starts_with',  label: 'Starts With'   },
  { value: 'is_empty',     label: 'Is Empty'      },
  { value: 'is_not_empty', label: 'Is Not Empty'  },
];
const SELECT_OPERATORS  = [{ value: 'is', label: 'Is' }, { value: 'is_not', label: 'Is Not' }];
const TAG_OPERATORS     = [{ value: 'has_tag', label: 'Has Tag' }, { value: 'not_contains', label: "Doesn't Have" }];
const LEAD_SOURCES      = ['GOOGLE_ADS', 'META_ADS', 'CTWA', 'ORGANIC', 'REFERRAL', 'WALK_IN', 'WEBSITE', 'OTHER'];
const LEAD_STAGES_LIST  = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'HOT', 'CONVERTED', 'LOST'];
const TASK_TYPES        = ['call', 'follow_up', 'send_quote', 'meeting', 'other'];

const WF_ACTION_TYPES = [
  { value: 'assign_user',       label: 'Assign to User',          icon: UserIcon },
  { value: 'set_follow_up',     label: 'Set Follow-up Date',       icon: Clock },
  { value: 'send_notification', label: 'Send Notification',        icon: Bell },
  { value: 'update_lead_stage', label: 'Update Lead Stage',        icon: ArrowRight },
  { value: 'send_whatsapp',     label: 'Send WhatsApp Template',   icon: MessageSquare },
  { value: 'create_task',       label: 'Create Task',              icon: ListTodo },
];

const ASSIGNMENT_STRATEGIES = [
  { value: 'round_robin', label: 'Round Robin', desc: 'Equal rotation among selected users', icon: RotateCcw },
  { value: 'weighted',    label: 'Weighted',    desc: 'Set percentage weights per user',     icon: Weight },
  { value: 'team',        label: 'Team',        desc: 'Named team with round-robin',         icon: Shield },
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex-shrink-0">
      {on
        ? <ToggleRight className="w-6 h-6" style={{ color: '#22C55E' }} />
        : <ToggleLeft  className="w-6 h-6" style={{ color: '#CBD5E1' }} />}
    </button>
  );
}

function SelectBox({ value, onChange, children, disabled }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none disabled:opacity-50"
        style={{ border: '1px solid #D1D5DB' }}>
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
    </div>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (result === 'success') return <span className="flex items-center gap-1 text-green-700 text-xs"><CheckCircle2 className="w-3 h-3" />Success</span>;
  if (result === 'failed')  return <span className="flex items-center gap-1 text-red-600 text-xs"><XCircle className="w-3 h-3" />Failed</span>;
  return <span className="flex items-center gap-1 text-gray-500 text-xs"><SkipForward className="w-3 h-3" />Skipped</span>;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface RunStats { last_run_at: string | null; total: number; }

export default function WorkflowsPage() {
  const [workflows, setWorkflows]   = useState<CrmWorkflow[]>([]);
  const [users, setUsers]           = useState<UserRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [runs, setRuns]             = useState<Record<string, WorkflowRun[]>>({});
  const [runsLoading, setRunsLoading] = useState<Set<string>>(new Set());
  const [runStats, setRunStats]     = useState<Record<string, RunStats>>({});

  // ── Form state ──
  const [wfName,    setWfName]    = useState('');
  const [wfTrigger, setWfTrigger] = useState<'on_create' | 'on_update' | 'on_create_or_update'>('on_create');
  const [wfMatch,   setWfMatch]   = useState<'AND' | 'OR'>('OR');
  const [wfRules,   setWfRules]   = useState<WfRule[]>([]);
  const [wfActions, setWfActions] = useState<WfActionItem[]>([{ type: 'assign_user', users: [], strategy: 'round_robin' }]);
  const [savingWf,  setSavingWf]  = useState(false);
  const [wfError,   setWfError]   = useState('');

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const [wfRes, uRes] = await Promise.all([
      fetch('/api/v1/crm/workflows'),
      fetch('/api/v1/users?limit=200'),
    ]);
    const [wfData, uData] = await Promise.all([wfRes.json(), uRes.json()]);
    const wfList: CrmWorkflow[] = wfData.success ? (Array.isArray(wfData.data) ? wfData.data : []) : [];
    setWorkflows(wfList);
    const rawUsers = Array.isArray(uData.data) ? uData.data : (uData.data?.items ?? []);
    setUsers(rawUsers as UserRecord[]);
    setLoading(false);

    // Load run stats (last run time + count) for all workflows concurrently
    if (wfList.length > 0) {
      const statsResults = await Promise.all(
        wfList.map(wf =>
          fetch(`/api/v1/crm/workflows/${wf.id}/runs?limit=1`)
            .then(r => r.json())
            .then(d => ({ id: wf.id, last_run_at: d.data?.[0]?.created_at ?? null, total: d.total ?? 0 }))
            .catch(() => ({ id: wf.id, last_run_at: null, total: 0 })),
        ),
      );
      const statsMap: Record<string, RunStats> = {};
      for (const s of statsResults) statsMap[s.id] = { last_run_at: s.last_run_at, total: s.total };
      setRunStats(statsMap);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Run history ──────────────────────────────────────────────────────────

  async function toggleRunHistory(wfId: string) {
    const next = new Set(expandedRuns);
    if (next.has(wfId)) { next.delete(wfId); setExpandedRuns(next); return; }
    next.add(wfId); setExpandedRuns(next);
    setRunsLoading(prev => new Set(prev).add(wfId));
    const res  = await fetch(`/api/v1/crm/workflows/${wfId}/runs?limit=30`);
    const data = await res.json();
    if (data.ok) {
      setRuns(prev => ({ ...prev, [wfId]: data.data ?? [] }));
      setRunStats(prev => ({
        ...prev,
        [wfId]: { last_run_at: data.data?.[0]?.created_at ?? null, total: data.total ?? 0 },
      }));
    }
    setRunsLoading(prev => { const s = new Set(prev); s.delete(wfId); return s; });
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  function resetForm() {
    setWfName(''); setWfTrigger('on_create'); setWfMatch('OR'); setWfRules([]);
    setWfActions([{ type: 'assign_user', users: [], strategy: 'round_robin' }]);
    setWfError(''); setEditingId(null);
  }

  function openCreate() { resetForm(); setShowForm(true); }

  function openEdit(wf: CrmWorkflow) {
    setWfName(wf.name); setWfTrigger(wf.trigger as 'on_create' | 'on_update' | 'on_create_or_update');
    const cond = wf.conditions as { match?: 'AND' | 'OR'; rules?: WfRule[] } | null;
    setWfMatch(cond?.match ?? 'OR');
    setWfRules(cond?.rules ?? []);
    setWfActions(Array.isArray(wf.actions) ? wf.actions : []);
    setWfError(''); setEditingId(wf.id); setShowForm(true);
  }

  async function saveWorkflow() {
    if (!wfName.trim()) { setWfError('Workflow name is required'); return; }
    setSavingWf(true); setWfError('');
    const payload = {
      name: wfName.trim(), module: 'contacts', trigger: wfTrigger,
      conditions: wfRules.length > 0 ? { match: wfMatch, rules: wfRules } : null,
      actions: wfActions,
    };
    const res = await fetch(
      editingId ? `/api/v1/crm/workflows/${editingId}` : '/api/v1/crm/workflows',
      { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    const data = await res.json();
    setSavingWf(false);
    if (!res.ok) { setWfError(data.error ?? 'Failed to save'); return; }
    setShowForm(false); resetForm(); loadData();
  }

  async function toggleWorkflow(id: string, is_active: boolean) {
    await fetch(`/api/v1/crm/workflows/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    });
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, is_active } : w));
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow? This cannot be undone.')) return;
    await fetch(`/api/v1/crm/workflows/${id}`, { method: 'DELETE' });
    setWorkflows(prev => prev.filter(w => w.id !== id));
  }

  // ─── Builder helpers ──────────────────────────────────────────────────────

  function addRule() {
    setWfRules(prev => [...prev, { field: 'lead_source', operator: 'is', value: '' }]);
  }

  function updateRule(i: number, patch: Partial<WfRule>) {
    setWfRules(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function removeRule(i: number) {
    setWfRules(prev => prev.filter((_, idx) => idx !== i));
  }

  function addAction() {
    setWfActions(prev => [...prev, { type: 'assign_user', users: [], strategy: 'round_robin' }]);
  }

  function updateAction(i: number, patch: Partial<WfActionItem>) {
    setWfActions(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  }

  function removeAction(i: number) {
    setWfActions(prev => prev.filter((_, idx) => idx !== i));
  }

  // User picker for assign_user actions
  function toggleUserInAction(actionIdx: number, userId: string, userName: string) {
    const action = wfActions[actionIdx];
    const currentUsers = action.users ?? [];
    const exists = currentUsers.some(u => u.user_id === userId);
    const newUsers = exists
      ? currentUsers.filter(u => u.user_id !== userId)
      : [...currentUsers, { user_id: userId, name: userName, weight: 50 }];
    updateAction(actionIdx, { users: newUsers });
  }

  // ─── Condition field UI ───────────────────────────────────────────────────

  function RuleRow({ rule, idx }: { rule: WfRule; idx: number }) {
    const fieldDef = WF_CONDITION_FIELDS.find(f => f.value === rule.field);
    const operators = fieldDef?.type === 'tag' ? TAG_OPERATORS
      : fieldDef?.type === 'leadSource' ? SELECT_OPERATORS
      : TEXT_OPERATORS;
    return (
      <div className="flex gap-2 items-center">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <SelectBox value={rule.field} onChange={v => updateRule(idx, { field: v, operator: 'is', value: '' })}>
            {WF_CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </SelectBox>
          <SelectBox value={rule.operator} onChange={v => updateRule(idx, { operator: v })}>
            {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectBox>
          {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
            fieldDef?.type === 'leadSource'
              ? <SelectBox value={rule.value} onChange={v => updateRule(idx, { value: v })}>
                  <option value="">Any source…</option>
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </SelectBox>
              : <input value={rule.value} onChange={e => updateRule(idx, { value: e.target.value })}
                  placeholder="Value…" className="text-sm rounded-lg px-3 py-2.5 outline-none"
                  style={{ border: '1px solid #D1D5DB' }} />
          )}
        </div>
        <button onClick={() => removeRule(idx)} className="p-1 rounded hover:bg-red-50">
          <X className="w-4 h-4 text-red-400" />
        </button>
      </div>
    );
  }

  // ─── Action UI ────────────────────────────────────────────────────────────

  function ActionCard({ action, idx }: { action: WfActionItem; idx: number }) {
    const ActionIcon = WF_ACTION_TYPES.find(a => a.value === action.type)?.icon ?? Zap;
    return (
      <div className="rounded-xl p-4 mb-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${T}15` }}>
            <ActionIcon className="w-4 h-4" style={{ color: T }} />
          </div>
          <div className="flex-1">
            <SelectBox value={action.type} onChange={v => updateAction(idx, { type: v as WfActionItem['type'], users: [], strategy: 'round_robin', message: '', stage: '', template_name: '', task_type: 'follow_up', hours_from_now: 24 })}>
              {WF_ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </SelectBox>
          </div>
          {wfActions.length > 1 && (
            <button onClick={() => removeAction(idx)} className="p-1 rounded hover:bg-red-50">
              <X className="w-4 h-4 text-red-400" />
            </button>
          )}
        </div>

        {/* assign_user */}
        {action.type === 'assign_user' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {ASSIGNMENT_STRATEGIES.map(s => (
                <button key={s.value} onClick={() => updateAction(idx, { strategy: s.value as WfActionItem['strategy'] })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={{ borderColor: action.strategy === s.value ? T : '#E2E8F0', background: action.strategy === s.value ? `${T}15` : 'white', color: action.strategy === s.value ? T : '#64748B' }}>
                  <s.icon className="w-3.5 h-3.5" /> {s.label}
                </button>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: '#94A3B8' }}>
              Offline users are automatically skipped. If all are offline, the first Admin gets the lead.
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {users.filter(u => u.status).map(u => {
                const selected = (action.users ?? []).some(wu => wu.user_id === u.id);
                const wfUser   = (action.users ?? []).find(wu => wu.user_id === u.id);
                return (
                  <div key={u.id} className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all`}
                    style={{ background: selected ? `${T}08` : '#F8FAFC', outline: selected ? `1.5px solid ${T}` : 'none' }}
                    onClick={() => toggleUserInAction(idx, u.id, u.name)}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 ${selected ? 'border-transparent' : ''}`}
                      style={{ background: selected ? T : 'white', borderColor: selected ? T : '#D1D5DB' }}>
                      {selected && <div className="w-2 h-2 rounded-sm bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{u.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${u.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {u.is_available ? '🟢' : '🔴'} {u.is_available ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <span className="text-[11px]" style={{ color: '#94A3B8' }}>{u.role}</span>
                    </div>
                    {selected && action.strategy === 'weighted' && (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <input type="number" min={1} max={100}
                          value={wfUser?.weight ?? 50}
                          onChange={e => updateAction(idx, {
                            users: (action.users ?? []).map(wu => wu.user_id === u.id ? { ...wu, weight: parseInt(e.target.value) || 50 } : wu),
                          })}
                          className="w-16 text-xs rounded px-2 py-1 text-center"
                          style={{ border: '1px solid #D1D5DB' }} />
                        <span className="text-xs" style={{ color: '#94A3B8' }}>%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* set_follow_up */}
        {action.type === 'set_follow_up' && (
          <div className="flex items-center gap-2">
            <input type="number" min={1} value={action.hours_from_now ?? 24}
              onChange={e => updateAction(idx, { hours_from_now: parseInt(e.target.value) || 24 })}
              className="w-24 text-sm rounded-lg px-3 py-2 outline-none"
              style={{ border: '1px solid #D1D5DB' }} />
            <span className="text-sm" style={{ color: '#64748B' }}>hours from now</span>
          </div>
        )}

        {/* send_notification */}
        {action.type === 'send_notification' && (
          <textarea value={action.message ?? ''} onChange={e => updateAction(idx, { message: e.target.value })}
            placeholder="Notification message to ADMIN / MANAGER users…"
            rows={2} className="w-full text-sm rounded-lg px-3 py-2.5 outline-none resize-none"
            style={{ border: '1px solid #D1D5DB' }} />
        )}

        {/* update_lead_stage */}
        {action.type === 'update_lead_stage' && (
          <SelectBox value={action.stage ?? ''} onChange={v => updateAction(idx, { stage: v })}>
            <option value="">Select stage…</option>
            {LEAD_STAGES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </SelectBox>
        )}

        {/* send_whatsapp */}
        {action.type === 'send_whatsapp' && (
          <div className="space-y-2">
            <input value={action.template_name ?? ''} onChange={e => updateAction(idx, { template_name: e.target.value })}
              placeholder="Template name (exact from Gallabox)…"
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
              style={{ border: '1px solid #D1D5DB' }} />
            <input value={action.button_url ?? ''} onChange={e => updateAction(idx, { button_url: e.target.value })}
              placeholder="URL button value (optional)…"
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
              style={{ border: '1px solid #D1D5DB' }} />
          </div>
        )}

        {/* create_task */}
        {action.type === 'create_task' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <SelectBox value={action.task_type ?? 'follow_up'} onChange={v => updateAction(idx, { task_type: v })}>
                {TASK_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </SelectBox>
              <div className="flex items-center gap-2">
                <input type="number" min={1} value={action.hours_from_now ?? 24}
                  onChange={e => updateAction(idx, { hours_from_now: parseInt(e.target.value) || 24 })}
                  className="w-20 text-sm rounded-lg px-3 py-2 outline-none"
                  style={{ border: '1px solid #D1D5DB' }} />
                <span className="text-xs text-gray-500">hrs</span>
              </div>
            </div>
            <input value={action.notes ?? ''} onChange={e => updateAction(idx, { notes: e.target.value })}
              placeholder="Task notes (optional)…"
              className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
              style={{ border: '1px solid #D1D5DB' }} />
          </div>
        )}
      </div>
    );
  }

  // ─── Summary helpers ──────────────────────────────────────────────────────

  function wfSummary(wf: CrmWorkflow): string {
    const acts = Array.isArray(wf.actions) ? wf.actions : [];
    return acts.map((a: { type?: string }) => WF_ACTION_TYPES.find(t => t.value === a.type)?.label ?? a.type).join(' → ');
  }

  function conditionCount(wf: CrmWorkflow): number {
    const cond = wf.conditions as { rules?: unknown[] } | null;
    return cond?.rules?.length ?? 0;
  }

  function getAssignedUsers(wf: CrmWorkflow): Array<{ user_id: string; name: string }> {
    const acts = (Array.isArray(wf.actions) ? wf.actions : []) as Array<{ type?: string; users?: Array<{ user_id: string; name?: string }> }>;
    const assignActions = acts.filter(a => a.type === 'assign_user');
    const out: Array<{ user_id: string; name: string }> = [];
    for (const a of assignActions) {
      for (const u of (a.users ?? [])) out.push({ user_id: u.user_id, name: u.name ?? u.user_id });
    }
    return out;
  }

  function getConditionChips(wf: CrmWorkflow): Array<{ field: string; operator: string; value: string }> {
    const cond = wf.conditions as { rules?: Array<{ field: string; operator: string; value: string }> } | null;
    return cond?.rules ?? [];
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: T }} />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Zap className="w-5 h-5" style={{ color: T }} />
            <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>Workflows</h1>
          </div>
          <p className="text-sm" style={{ color: '#64748B' }}>Automation rules — fires when a contact is created or updated</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 rounded-lg hover:bg-gray-100">
            <RefreshCw className="w-4 h-4" style={{ color: '#64748B' }} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: T }}>
            <Plus className="w-4 h-4" /> New Workflow
          </button>
        </div>
      </div>

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <div className="text-center py-20 rounded-2xl" style={{ border: '2px dashed #E2E8F0' }}>
          <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
          <p className="font-semibold text-gray-400">No workflows yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first workflow to automate lead assignment</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: T }}>
            <Plus className="w-4 h-4 inline mr-1" /> New Workflow
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {workflows.map(wf => {
            const stats        = runStats[wf.id];
            const assignedUsers = getAssignedUsers(wf);
            const condChips    = getConditionChips(wf);
            const isExpanded   = expandedRuns.has(wf.id);

            return (
              <div key={wf.id} className="rounded-2xl overflow-hidden shadow-sm"
                style={{ border: `1px solid ${wf.is_active ? '#E2E8F0' : '#F1F5F9'}`, background: 'white' }}>

                {/* ── Card header ── */}
                <div className="p-5">
                  <div className="flex items-start gap-4">

                    {/* Icon */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: wf.is_active ? `${T}18` : '#F1F5F9' }}>
                      <Zap className="w-5 h-5" style={{ color: wf.is_active ? T : '#94A3B8' }} />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">

                      {/* Name + status + trigger */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <p className="font-bold text-base" style={{ color: '#0F172A' }}>{wf.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${wf.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {wf.is_active ? '● Active' : '○ Inactive'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#EFF6FF', color: '#3B82F6' }}>
                          {TRIGGERS.find(t => t.value === wf.trigger)?.label ?? wf.trigger}
                        </span>
                      </div>

                      {/* Action summary */}
                      <p className="text-xs mb-2.5" style={{ color: '#64748B' }}>{wfSummary(wf)}</p>

                      {/* Condition chips */}
                      {condChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          <Filter className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                          {condChips.map((c, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                              style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                              {WF_CONDITION_FIELDS.find(f => f.value === c.field)?.label ?? c.field}
                              {' '}<span className="opacity-60">{c.operator}</span>{' '}
                              <span className="font-bold">{c.value || '—'}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Assigned users */}
                      {assignedUsers.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-medium" style={{ color: '#94A3B8' }}>Agents:</span>
                          {assignedUsers.map(au => {
                            const u = users.find(uu => uu.id === au.user_id);
                            return (
                              <span key={au.user_id} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                                style={{ background: u?.is_available ? '#DCFCE7' : '#FEE2E2', color: u?.is_available ? '#166534' : '#991B1B' }}>
                                {u?.is_available ? '🟢' : '🔴'} {au.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Right controls */}
                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Toggle on={wf.is_active} onToggle={() => toggleWorkflow(wf.id, !wf.is_active)} />
                        <button onClick={() => openEdit(wf)}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                          style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Edit</button>
                        <button onClick={() => deleteWorkflow(wf.id)} className="p-1.5 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                      {/* Stats row */}
                      <div className="flex items-center gap-3 text-[11px]" style={{ color: '#94A3B8' }}>
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {stats?.total ?? 0} runs
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {relTime(stats?.last_run_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Run History toggle button */}
                  <button onClick={() => toggleRunHistory(wf.id)}
                    className="mt-3 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg w-full justify-center transition-all"
                    style={{ background: isExpanded ? `${T}12` : '#F8FAFC', color: isExpanded ? T : '#64748B', border: `1px solid ${isExpanded ? `${T}30` : '#E2E8F0'}` }}>
                    {runsLoading.has(wf.id)
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {isExpanded ? 'Hide' : 'View'} Run History
                    {stats?.total ? <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: T, color: 'white' }}>{stats.total}</span> : null}
                  </button>
                </div>

                {/* ── Run History panel ── */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #F1F5F9' }}>
                    {runsLoading.has(wf.id) ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: T }} />
                      </div>
                    ) : (runs[wf.id] ?? []).length === 0 ? (
                      <div className="text-center py-8">
                        <Activity className="w-6 h-6 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                        <p className="text-xs" style={{ color: '#94A3B8' }}>No runs recorded yet</p>
                      </div>
                    ) : (
                      <div>
                        {/* Column headers */}
                        <div className="grid gap-2 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ gridTemplateColumns: '80px 1fr 1fr 120px 90px', color: '#94A3B8', background: '#F8FAFC' }}>
                          <span>Result</span>
                          <span>Contact</span>
                          <span>Action / Detail</span>
                          <span>Assigned To</span>
                          <span>Time</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {(runs[wf.id] ?? []).map(run => (
                            <div key={run.id} className="grid gap-2 px-5 py-3 items-center text-xs hover:bg-gray-50 transition-colors"
                              style={{ gridTemplateColumns: '80px 1fr 1fr 120px 90px' }}>
                              <ResultBadge result={run.result} />
                              <div className="min-w-0">
                                <p className="font-medium truncate" style={{ color: '#0F172A' }}>{run.contact_name ?? '—'}</p>
                                {!run.conditions_matched && (
                                  <p className="text-[10px] mt-0.5" style={{ color: '#F59E0B' }}>Conditions not met</p>
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: '#F1F5F9', color: '#64748B' }}>
                                  {run.action_type === 'conditions_not_met' ? 'skipped' : run.action_type}
                                </span>
                                {run.action_detail && (
                                  <p className="truncate mt-0.5" style={{ color: '#64748B' }}>{run.action_detail}</p>
                                )}
                                {run.error && (
                                  <p className="truncate mt-0.5 text-red-500">{run.error}</p>
                                )}
                              </div>
                              <div className="min-w-0">
                                {run.assigned_to
                                  ? <span className="font-semibold truncate block" style={{ color: T }}>{run.assigned_to}</span>
                                  : <span style={{ color: '#CBD5E1' }}>—</span>}
                              </div>
                              <span style={{ color: '#94A3B8' }}>{fmtTime(run.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <p className="font-bold text-base" style={{ color: '#0F172A' }}>
                {editingId ? 'Edit Workflow' : 'New Workflow'}
              </p>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" style={{ color: '#64748B' }} />
              </button>
            </div>
            <div className="p-6 space-y-5">

              {/* Name */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>Workflow Name</label>
                <input value={wfName} onChange={e => setWfName(e.target.value)}
                  placeholder="e.g. Assign Goa Leads, Hot Lead Follow-up…"
                  className="w-full text-sm rounded-xl px-4 py-2.5 outline-none font-medium"
                  style={{ border: '1.5px solid #E2E8F0' }} />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>Trigger</label>
                <div className="flex gap-2 flex-wrap">
                  {TRIGGERS.map(t => (
                    <button key={t.value} onClick={() => setWfTrigger(t.value as typeof wfTrigger)}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all"
                      style={{ borderColor: wfTrigger === t.value ? T : '#E2E8F0', background: wfTrigger === t.value ? `${T}15` : 'white', color: wfTrigger === t.value ? T : '#64748B' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Conditions</label>
                  <div className="flex items-center gap-2">
                    {wfRules.length > 1 && (
                      <div className="flex gap-1">
                        {(['AND', 'OR'] as const).map(m => (
                          <button key={m} onClick={() => setWfMatch(m)}
                            className="px-2 py-0.5 rounded text-xs font-bold border transition-all"
                            style={{ borderColor: wfMatch === m ? T : '#E2E8F0', background: wfMatch === m ? `${T}15` : 'white', color: wfMatch === m ? T : '#94A3B8' }}>
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={addRule}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1"
                      style={{ background: `${T}15`, color: T }}>
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                </div>
                {wfRules.length === 0
                  ? <p className="text-xs py-3 px-4 rounded-lg" style={{ color: '#CBD5E1', background: '#F8FAFC' }}>No conditions — workflow runs for every matching contact.</p>
                  : <div className="space-y-2">{wfRules.map((rule, i) => <RuleRow key={i} rule={rule} idx={i} />)}</div>
                }
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Actions</label>
                  <button onClick={addAction}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1"
                    style={{ background: `${T}15`, color: T }}>
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                {wfActions.map((action, i) => <ActionCard key={i} action={action} idx={i} />)}
              </div>

              {wfError && <p className="text-sm text-red-500 font-medium">{wfError}</p>}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowForm(false); resetForm(); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ border: '1.5px solid #E2E8F0', color: '#64748B' }}>
                  Cancel
                </button>
                <button onClick={saveWorkflow} disabled={savingWf}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: T }}>
                  {savingWf ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editingId ? 'Update Workflow' : 'Create Workflow'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
