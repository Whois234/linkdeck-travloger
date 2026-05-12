'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Loader2, Zap, Workflow, ToggleLeft, ToggleRight, Trash2, ChevronDown,
  Tag as TagIcon, ListPlus, Users, MessageSquare, RotateCcw, Weight, Shield,
} from 'lucide-react';
import { ContactFieldsTab, ContactTagsTab } from './ContactCustomization';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineStage { id: string; name: string; color: string }
interface Pipeline      { id: string; name: string; stages: PipelineStage[] }

interface StageAutomation {
  id: string; pipeline_id: string; stage_id: string; trigger: string;
  action_type: string; action_data: Record<string, unknown>;
  is_active: boolean; created_at: string;
  stage: { id: string; name: string; color: string };
}

interface CrmWorkflow {
  id: string; name: string; module: string; trigger: string;
  conditions: Record<string, unknown> | null;
  actions: Array<{ type: string; strategy: string; team_name?: string; users: WfUser[] }>;
  is_active: boolean; created_at: string;
}

interface User { id: string; name: string; email: string; role: string }
interface WfUser { user_id: string; name: string; weight?: number }

// ─── Constants ───────────────────────────────────────────────────────────────

const T = '#134956';

const STAGE_ACTION_TYPES = [
  { value: 'assign_user',       label: 'Assign to User' },
  { value: 'send_whatsapp',     label: 'Send WhatsApp Template' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'create_task',       label: 'Create Task' },
];

const TASK_TYPES = ['call', 'follow_up', 'send_quote', 'meeting', 'other'];

const ASSIGNMENT_STRATEGIES = [
  { value: 'round_robin', label: 'Round Robin', desc: 'Equal rotation among selected users', icon: RotateCcw },
  { value: 'weighted',    label: 'Weighted',    desc: 'Set percentage weights per user',     icon: Weight },
  { value: 'team',        label: 'Team',        desc: 'Named team with round-robin',         icon: Shield },
];

const LEAD_SOURCES = ['GOOGLE_ADS', 'META_ADS', 'CTWA', 'ORGANIC', 'REFERRAL', 'WALK_IN', 'WEBSITE', 'OTHER'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CrmSettingsPage() {
  const [tab, setTab]           = useState<'automations' | 'workflows' | 'contact-fields' | 'tags'>('automations');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [users, setUsers]       = useState<User[]>([]);
  const [automations, setAutomations] = useState<StageAutomation[]>([]);
  const [workflows, setWorkflows]     = useState<CrmWorkflow[]>([]);
  const [loading, setLoading]   = useState(true);

  // ── Stage automation form ──
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [autoForm, setAutoForm] = useState({
    pipeline_id: '', stage_id: '', action_type: 'assign_user',
    user_id: '', whatsapp_template: '', task_type: 'call',
    hours_from_now: '24', notification_message: '',
  });
  const [savingAuto, setSavingAuto] = useState(false);

  // ── Workflow form ──
  const [showWfForm, setShowWfForm]     = useState(false);
  const [wfStep, setWfStep]             = useState<'basics' | 'action'>('basics');
  const [wfName, setWfName]             = useState('');
  const [wfSourceFilter, setWfSourceFilter] = useState(''); // optional condition
  const [wfStrategy, setWfStrategy]     = useState<'round_robin' | 'weighted' | 'team'>('round_robin');
  const [wfTeamName, setWfTeamName]     = useState('');
  const [wfUsers, setWfUsers]           = useState<WfUser[]>([]);
  const [savingWf, setSavingWf]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, uRes, autoRes, wfRes] = await Promise.all([
      fetch('/api/v1/pipelines'),
      fetch('/api/v1/users'),
      fetch('/api/v1/crm/automations'),
      fetch('/api/v1/crm/workflows'),
    ]);
    const [pData, uData, autoData, wfData] = await Promise.all([
      pRes.json(), uRes.json(), autoRes.json(), wfRes.json(),
    ]);
    if (pData.success)    setPipelines(pData.data ?? []);
    if (uData.success)    setUsers((uData.data ?? uData.items ?? []) as User[]);
    else if (Array.isArray(uData)) setUsers(uData);
    if (autoData.success) setAutomations(autoData.data ?? []);
    if (wfData.success)   setWorkflows(wfData.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedPipeline = pipelines.find(p => p.id === autoForm.pipeline_id);

  // ── Stage automation CRUD ──

  async function createAutomation() {
    if (!autoForm.pipeline_id || !autoForm.stage_id) return;
    setSavingAuto(true);
    let action_data: Record<string, unknown> = {};
    if (autoForm.action_type === 'assign_user')       action_data = { user_id: autoForm.user_id };
    if (autoForm.action_type === 'send_whatsapp')     action_data = { template_name: autoForm.whatsapp_template };
    if (autoForm.action_type === 'create_task')       action_data = { task_type: autoForm.task_type, hours_from_now: parseInt(autoForm.hours_from_now) };
    if (autoForm.action_type === 'send_notification') action_data = { message: autoForm.notification_message };
    await fetch('/api/v1/crm/automations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_id: autoForm.pipeline_id, stage_id: autoForm.stage_id, action_type: autoForm.action_type, action_data }),
    });
    setSavingAuto(false);
    setShowAutoForm(false);
    load();
  }

  async function toggleAutomation(id: string, is_active: boolean) {
    await fetch(`/api/v1/crm/automations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    });
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active } : a));
  }

  async function deleteAutomation(id: string) {
    if (!confirm('Delete this automation?')) return;
    await fetch(`/api/v1/crm/automations/${id}`, { method: 'DELETE' });
    setAutomations(prev => prev.filter(a => a.id !== id));
  }

  // ── Workflow CRUD ──

  function resetWfForm() {
    setWfName(''); setWfSourceFilter(''); setWfStrategy('round_robin');
    setWfTeamName(''); setWfUsers([]); setWfStep('basics');
  }

  async function createWorkflow() {
    if (!wfName.trim() || wfUsers.length === 0) return;
    setSavingWf(true);
    const conditions: Record<string, unknown> = { rr_index: 0 };
    if (wfSourceFilter) conditions.source_filter = wfSourceFilter;
    const action: Record<string, unknown> = {
      type: 'assign_user', strategy: wfStrategy,
      users: wfUsers,
    };
    if (wfStrategy === 'team') action.team_name = wfTeamName;
    await fetch('/api/v1/crm/workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: wfName, module: 'contacts', trigger: 'on_create',
        conditions, actions: [action],
      }),
    });
    setSavingWf(false);
    setShowWfForm(false);
    resetWfForm();
    load();
  }

  async function toggleWorkflow(id: string, is_active: boolean) {
    await fetch(`/api/v1/crm/workflows/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    });
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, is_active } : w));
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow?')) return;
    await fetch(`/api/v1/crm/workflows/${id}`, { method: 'DELETE' });
    setWorkflows(prev => prev.filter(w => w.id !== id));
  }

  // ── User toggle for workflow ──
  function toggleWfUser(u: User) {
    setWfUsers(prev => {
      const exists = prev.find(w => w.user_id === u.id);
      if (exists) return prev.filter(w => w.user_id !== u.id);
      return [...prev, { user_id: u.id, name: u.name, weight: Math.floor(100 / (prev.length + 1)) }];
    });
  }

  function setUserWeight(userId: string, weight: number) {
    setWfUsers(prev => prev.map(u => u.user_id === userId ? { ...u, weight } : u));
  }

  // ── Display labels ──
  function autoActionLabel(a: StageAutomation): string {
    const ad = a.action_data;
    if (a.action_type === 'assign_user')       return `Assign to user`;
    if (a.action_type === 'send_whatsapp')     return `Send WhatsApp: "${ad.template_name ?? ''}"`;
    if (a.action_type === 'create_task')       return `Create ${ad.task_type ?? 'task'} task in ${ad.hours_from_now ?? 24}h`;
    if (a.action_type === 'send_notification') return `Notify: "${ad.message ?? ''}"`;
    return a.action_type;
  }

  function wfActionLabel(wf: CrmWorkflow): string {
    const action = wf.actions?.[0];
    if (!action) return 'No action';
    const strat = action.strategy === 'round_robin' ? 'Round Robin'
      : action.strategy === 'weighted' ? 'Weighted'
      : `Team: ${action.team_name ?? 'Unnamed'}`;
    const names = (action.users ?? []).map(u => u.name).join(', ') || 'No users';
    return `Assign (${strat}) → ${names}`;
  }

  const totalWfWeight = wfUsers.reduce((s, u) => s + (u.weight ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: T }} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>CRM Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Configure stage automations, workflow rules, and CRM behavior</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F1F5F9' }}>
        {([
          { key: 'automations',    label: 'Stage Automations', icon: Zap },
          { key: 'workflows',      label: 'Workflows',          icon: Workflow },
          { key: 'contact-fields', label: 'Contact Fields',     icon: ListPlus },
          { key: 'tags',           label: 'Tags',               icon: TagIcon },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: tab === key ? '#fff' : 'transparent',
              color:            tab === key ? '#0F172A' : '#64748B',
              boxShadow:        tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Stage Automations — fires when a lead enters a pipeline stage
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === 'automations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Stage Automations</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Trigger actions automatically when a lead enters a pipeline stage</p>
            </div>
            <button onClick={() => setShowAutoForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: T }}>
              <Plus className="w-4 h-4" /> New Automation
            </button>
          </div>

          {/* Automation form */}
          {showAutoForm && (
            <div className="bg-white rounded-2xl p-6 space-y-4" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold" style={{ color: '#0F172A' }}>New Stage Automation</p>
                <button onClick={() => setShowAutoForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
                  <X className="w-4 h-4" style={{ color: '#64748B' }} />
                </button>
              </div>

              {/* Pipeline + Stage */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Pipeline</label>
                  <SelectBox value={autoForm.pipeline_id}
                    onChange={v => setAutoForm(p => ({ ...p, pipeline_id: v, stage_id: '' }))}>
                    <option value="">Select pipeline…</option>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectBox>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>When lead enters stage</label>
                  <SelectBox value={autoForm.stage_id}
                    onChange={v => setAutoForm(p => ({ ...p, stage_id: v }))}
                    disabled={!selectedPipeline}>
                    <option value="">Select stage…</option>
                    {selectedPipeline?.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </SelectBox>
                </div>
              </div>

              {/* Action type */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Action</label>
                <div className="flex gap-2 flex-wrap">
                  {STAGE_ACTION_TYPES.map(at => (
                    <button key={at.value} onClick={() => setAutoForm(p => ({ ...p, action_type: at.value }))}
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        border:           `1px solid ${autoForm.action_type === at.value ? T : '#E2E8F0'}`,
                        backgroundColor:  autoForm.action_type === at.value ? '#F0F9FF' : '#fff',
                        color:            autoForm.action_type === at.value ? T : '#64748B',
                      }}>
                      {at.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action-specific fields */}
              {autoForm.action_type === 'assign_user' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Assign to User</label>
                  <SelectBox value={autoForm.user_id} onChange={v => setAutoForm(p => ({ ...p, user_id: v }))}>
                    <option value="">Select user…</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </SelectBox>
                </div>
              )}

              {autoForm.action_type === 'send_whatsapp' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" style={{ color: '#25D366' }} />
                      Gallabox WhatsApp Template Name
                    </span>
                  </label>
                  <input type="text" value={autoForm.whatsapp_template}
                    onChange={e => setAutoForm(p => ({ ...p, whatsapp_template: e.target.value }))}
                    placeholder="e.g. welcome_lead_v2"
                    className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                    style={{ border: '1px solid #D1D5DB' }} />
                  <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>
                    Enter the exact template name from your Gallabox account
                  </p>
                </div>
              )}

              {autoForm.action_type === 'create_task' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Task Type</label>
                    <SelectBox value={autoForm.task_type} onChange={v => setAutoForm(p => ({ ...p, task_type: v }))}>
                      {TASK_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </SelectBox>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Due in (hours)</label>
                    <input type="number" min="1" value={autoForm.hours_from_now}
                      onChange={e => setAutoForm(p => ({ ...p, hours_from_now: e.target.value }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                      style={{ border: '1px solid #D1D5DB' }} />
                  </div>
                </div>
              )}

              {autoForm.action_type === 'send_notification' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Notification Message</label>
                  <input type="text" value={autoForm.notification_message}
                    onChange={e => setAutoForm(p => ({ ...p, notification_message: e.target.value }))}
                    placeholder="e.g. Follow up with this lead immediately"
                    className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                    style={{ border: '1px solid #D1D5DB' }} />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowAutoForm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  Cancel
                </button>
                <button onClick={createAutomation}
                  disabled={savingAuto || !autoForm.pipeline_id || !autoForm.stage_id}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: T }}>
                  {savingAuto && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Automation
                </button>
              </div>
            </div>
          )}

          {/* Automations list */}
          {automations.length === 0 && !showAutoForm ? (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No automations yet</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Create automations to trigger actions when leads move between stages.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {automations.map(a => (
                <div key={a.id} className="bg-white rounded-xl px-5 py-4 flex items-center gap-4" style={{ border: '1px solid #E2E8F0' }}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.stage.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                      When lead enters <span style={{ color: a.stage.color }}>{a.stage.name}</span>
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>→ {autoActionLabel(a)}</p>
                  </div>
                  <Toggle on={a.is_active} onToggle={() => toggleAutomation(a.id, !a.is_active)} />
                  <button onClick={() => deleteAutomation(a.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] transition-colors"
                    style={{ color: '#EF4444' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Workflows — fires when a new contact is created → auto-assign user
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === 'workflows' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Lead Assignment Workflows</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Auto-assign new contacts to your team using round-robin, weighted, or team rules</p>
            </div>
            <button onClick={() => { resetWfForm(); setShowWfForm(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: T }}>
              <Plus className="w-4 h-4" /> New Workflow
            </button>
          </div>

          {/* Workflow builder form */}
          {showWfForm && (
            <div className="bg-white rounded-2xl p-6 space-y-6" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold" style={{ color: '#0F172A' }}>New Assignment Workflow</p>
                  <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                    {wfStep === 'basics' ? 'Step 1 of 2 — Name & Conditions' : 'Step 2 of 2 — Assignment Strategy'}
                  </p>
                </div>
                <button onClick={() => { setShowWfForm(false); resetWfForm(); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
                  <X className="w-4 h-4" style={{ color: '#64748B' }} />
                </button>
              </div>

              {/* Step indicators */}
              <div className="flex gap-2">
                {(['basics', 'action'] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <div className="w-8 h-px" style={{ backgroundColor: '#E2E8F0' }} />}
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{
                          backgroundColor: wfStep === s ? T : (wfStep === 'action' && s === 'basics') ? '#22C55E' : '#E2E8F0',
                          color: (wfStep === s || (wfStep === 'action' && s === 'basics')) ? '#fff' : '#94A3B8',
                        }}>
                        {(wfStep === 'action' && s === 'basics') ? '✓' : i + 1}
                      </div>
                      <span className="text-xs font-medium" style={{ color: wfStep === s ? '#0F172A' : '#94A3B8' }}>
                        {s === 'basics' ? 'Basics' : 'Assignment'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Step 1: Basics ── */}
              {wfStep === 'basics' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Workflow Name</label>
                    <input type="text" value={wfName} onChange={e => setWfName(e.target.value)}
                      placeholder="e.g. New Google Ads Leads"
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                      style={{ border: '1px solid #D1D5DB' }} />
                  </div>

                  {/* Trigger (fixed) */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <Zap className="w-4 h-4 flex-shrink-0" style={{ color: '#16A34A' }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: '#15803D' }}>Trigger</p>
                      <p className="text-sm font-medium" style={{ color: '#0F172A' }}>When a new contact is created</p>
                    </div>
                  </div>

                  {/* Condition (optional) */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
                      Condition — Lead Source <span className="font-normal text-[#94A3B8]">(optional)</span>
                    </label>
                    <SelectBox value={wfSourceFilter} onChange={setWfSourceFilter}>
                      <option value="">Any source (always trigger)</option>
                      {LEAD_SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </SelectBox>
                    <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>
                      Leave empty to run for all new contacts regardless of source
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => { setShowWfForm(false); resetWfForm(); }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                      Cancel
                    </button>
                    <button onClick={() => setWfStep('action')} disabled={!wfName.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                      style={{ backgroundColor: T }}>
                      Next: Set Assignment →
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 2: Assignment Strategy ── */}
              {wfStep === 'action' && (
                <div className="space-y-5">
                  {/* Strategy selector */}
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: '#374151' }}>Assignment Strategy</label>
                    <div className="grid grid-cols-3 gap-3">
                      {ASSIGNMENT_STRATEGIES.map(({ value, label, desc, icon: Icon }) => (
                        <button key={value} onClick={() => setWfStrategy(value as typeof wfStrategy)}
                          className="p-4 rounded-xl text-left transition-all"
                          style={{
                            border:          `2px solid ${wfStrategy === value ? T : '#E2E8F0'}`,
                            backgroundColor: wfStrategy === value ? `${T}08` : '#fff',
                          }}>
                          <Icon className="w-5 h-5 mb-2" style={{ color: wfStrategy === value ? T : '#94A3B8' }} />
                          <p className="text-sm font-semibold" style={{ color: wfStrategy === value ? T : '#0F172A' }}>{label}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team name (only for team strategy) */}
                  {wfStrategy === 'team' && (
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Team Name</label>
                      <input type="text" value={wfTeamName} onChange={e => setWfTeamName(e.target.value)}
                        placeholder="e.g. Sales Team A"
                        className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                        style={{ border: '1px solid #D1D5DB' }} />
                    </div>
                  )}

                  {/* User selection */}
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: '#374151' }}>
                      Select Users
                      {wfStrategy === 'weighted' && (
                        <span className="ml-2 font-normal text-[11px]" style={{
                          color: totalWfWeight === 100 ? '#16A34A' : '#EF4444',
                        }}>
                          (total: {totalWfWeight}% — must equal 100%)
                        </span>
                      )}
                    </label>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {users.map(u => {
                        const selected = wfUsers.find(w => w.user_id === u.id);
                        return (
                          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                            style={{ border: `1px solid ${selected ? T : '#E2E8F0'}`, backgroundColor: selected ? `${T}06` : '#fff' }}>
                            <input type="checkbox" checked={!!selected} onChange={() => toggleWfUser(u)}
                              className="rounded w-4 h-4 cursor-pointer" style={{ accentColor: T }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{u.name}</p>
                              <p className="text-[11px]" style={{ color: '#94A3B8' }}>{u.role} · {u.email}</p>
                            </div>
                            {wfStrategy === 'weighted' && selected && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <input type="number" min="1" max="99"
                                  value={selected.weight ?? 0}
                                  onChange={e => setUserWeight(u.id, Number(e.target.value))}
                                  className="w-16 text-sm text-center rounded-lg px-2 py-1 font-semibold outline-none"
                                  style={{ border: `1px solid ${T}`, color: T }} />
                                <span className="text-xs font-semibold" style={{ color: T }}>%</span>
                              </div>
                            )}
                            {wfStrategy === 'round_robin' && selected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${T}15`, color: T }}>
                                #{wfUsers.findIndex(w => w.user_id === u.id) + 1}
                              </span>
                            )}
                            {wfStrategy === 'team' && selected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                                ✓ In team
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {users.length === 0 && (
                        <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No users found</p>
                      )}
                    </div>
                  </div>

                  {/* Summary preview */}
                  {wfUsers.length > 0 && (
                    <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <span className="font-semibold" style={{ color: '#64748B' }}>Preview: </span>
                      <span style={{ color: '#0F172A' }}>
                        When a new contact is created
                        {wfSourceFilter ? ` (from ${wfSourceFilter.replace(/_/g, ' ')})` : ''}
                        {' '}→ {wfStrategy === 'round_robin' ? 'Rotate between' : wfStrategy === 'weighted' ? 'Distribute to' : `Team "${wfTeamName || 'Unnamed'}":` }
                        {' '}{wfUsers.map(u => wfStrategy === 'weighted' ? `${u.name} (${u.weight}%)` : u.name).join(', ')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button onClick={() => setWfStep('basics')}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                      ← Back
                    </button>
                    <div className="flex gap-3">
                      <button onClick={() => { setShowWfForm(false); resetWfForm(); }}
                        className="px-4 py-2 rounded-lg text-sm font-semibold"
                        style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                        Cancel
                      </button>
                      <button onClick={createWorkflow}
                        disabled={
                          savingWf || wfUsers.length === 0 ||
                          (wfStrategy === 'weighted' && totalWfWeight !== 100) ||
                          (wfStrategy === 'team' && !wfTeamName.trim())
                        }
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
                        style={{ backgroundColor: T }}>
                        {savingWf && <Loader2 className="w-4 h-4 animate-spin" />}
                        Create Workflow
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Workflows list */}
          {workflows.length === 0 && !showWfForm ? (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <Users className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No workflows yet</p>
              <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: '#94A3B8' }}>
                Create a workflow to automatically distribute new contacts to your sales team using round-robin or weighted assignment.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {workflows.map(wf => {
                const action = wf.actions?.[0];
                const stratIcon = action?.strategy === 'round_robin' ? RotateCcw
                  : action?.strategy === 'weighted' ? Weight : Shield;
                const StratIcon = stratIcon;
                const cond = wf.conditions as { source_filter?: string } | null;
                return (
                  <div key={wf.id} className="bg-white rounded-xl px-5 py-4 flex items-start gap-4" style={{ border: '1px solid #E2E8F0' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${T}12` }}>
                      <StratIcon className="w-4 h-4" style={{ color: T }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{wf.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                        New contact{cond?.source_filter ? ` (source: ${cond.source_filter})` : ''} → {wfActionLabel(wf)}
                      </p>
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        {action?.users?.map(u => (
                          <span key={u.user_id} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>
                            {u.name}{action.strategy === 'weighted' ? ` ${u.weight}%` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Toggle on={wf.is_active} onToggle={() => toggleWorkflow(wf.id, !wf.is_active)} />
                    <button onClick={() => deleteWorkflow(wf.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] transition-colors"
                      style={{ color: '#EF4444' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'contact-fields' && <ContactFieldsTab />}
      {tab === 'tags'           && <ContactTagsTab />}
    </div>
  );
}
