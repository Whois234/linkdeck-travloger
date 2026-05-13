'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Loader2, Zap, Workflow, ToggleLeft, ToggleRight, Trash2, ChevronDown,
  Tag as TagIcon, ListPlus, Users, MessageSquare, RotateCcw, Weight, Shield, Check, Pencil,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: Array<any>;
  is_active: boolean; created_at: string;
}

interface User { id: string; name: string; email: string; role: string }
interface WfUser { user_id: string; name: string; weight?: number }

interface WfRule { field: string; operator: string; value: string }
interface WfActionItem {
  type: 'assign_user' | 'set_follow_up' | 'send_notification' | 'update_lead_stage';
  user_id?: string;
  user_name?: string;
  hours_from_now?: number;
  message?: string;
  stage?: string;
}

interface CrmTeamMemberUser { id: string; name: string; email: string; role: string }
interface CrmTeamMember { id: string; user_id: string; user: CrmTeamMemberUser }
interface CrmTeam { id: string; name: string; created_at: string; members: CrmTeamMember[] }

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

const LEAD_STAGES_LIST = ['NEW', 'CONTACTED', 'ENGAGED', 'FOLLOW_UP_REQUIRED', 'QUOTE_SENT', 'WON', 'LOST'];

const WF_CONDITION_FIELDS = [
  { value: 'lead_source',            label: 'Lead Source',   type: 'leadSource' },
  { value: 'interested_destination', label: 'Destination',   type: 'text' },
  { value: 'trip_type',              label: 'Trip Type',     type: 'text' },
  { value: 'city',                   label: 'City',          type: 'text' },
  { value: 'tags',                   label: 'Tag',           type: 'tag' },
  { value: 'campaign_name',          label: 'Campaign Name', type: 'text' },
  { value: 'notes',                  label: 'Notes',         type: 'text' },
  { value: 'special_requirements',   label: 'Requirements',  type: 'text' },
];

const TEXT_OPERATORS = [
  { value: 'contains',     label: 'Contains' },
  { value: 'not_contains', label: "Doesn't Contain" },
  { value: 'is',           label: 'Is' },
  { value: 'is_not',       label: 'Is Not' },
  { value: 'starts_with',  label: 'Starts With' },
  { value: 'is_empty',     label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];
const SELECT_OPERATORS = [{ value: 'is', label: 'Is' }, { value: 'is_not', label: 'Is Not' }];
const TAG_OPERATORS    = [{ value: 'has_tag', label: 'Has Tag' }, { value: 'not_contains', label: "Doesn't Have Tag" }];

const WF_ACTION_TYPES = [
  { value: 'assign_user',       label: 'Assign to User' },
  { value: 'set_follow_up',     label: 'Set Follow-up Date' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'update_lead_stage', label: 'Update Lead Stage' },
];

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
  const [tab, setTab]           = useState<'automations' | 'workflows' | 'contact-fields' | 'tags' | 'teams'>('automations');
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
  const [autoError, setAutoError]   = useState('');

  // ── Workflow form ──
  const [showWfForm, setShowWfForm]   = useState(false);
  const [wfStep, setWfStep]           = useState<'basics' | 'conditions' | 'actions'>('basics');
  const [wfName, setWfName]           = useState('');
  const [wfMatch, setWfMatch]         = useState<'AND' | 'OR'>('OR');
  const [wfRules, setWfRules]         = useState<WfRule[]>([]);
  const [wfActions, setWfActions]     = useState<WfActionItem[]>([{ type: 'assign_user', user_id: '', user_name: '' }]);
  const [savingWf, setSavingWf]       = useState(false);
  const [wfError, setWfError]         = useState('');

  // ── Teams ──
  const [teams, setTeams]               = useState<CrmTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName]         = useState('');
  const [teamError, setTeamError]       = useState('');
  const [savingTeam, setSavingTeam]     = useState(false);
  const [managingTeam, setManagingTeam] = useState<CrmTeam | null>(null);
  const [teamMemberIds, setTeamMemberIds] = useState<Set<string>>(new Set());
  const [savingMembers, setSavingMembers] = useState(false);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    const r = await fetch('/api/v1/crm/teams');
    const d = await r.json();
    if (d.success) setTeams(d.data ?? []);
    setLoadingTeams(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, uRes, autoRes, wfRes, teamsRes] = await Promise.all([
      fetch('/api/v1/pipelines'),
      fetch('/api/v1/users'),
      fetch('/api/v1/crm/automations'),
      fetch('/api/v1/crm/workflows'),
      fetch('/api/v1/crm/teams'),
    ]);
    const [pData, uData, autoData, wfData, teamsData] = await Promise.all([
      pRes.json(), uRes.json(), autoRes.json(), wfRes.json(), teamsRes.json(),
    ]);
    if (pData.success)    setPipelines(Array.isArray(pData.data) ? pData.data : []);
    // /api/v1/users returns a paginated object: { data: { items: [], total, ... } }
    if (uData.success) setUsers((Array.isArray(uData.data) ? uData.data : (uData.data?.items ?? uData.items ?? [])) as User[]);
    else if (Array.isArray(uData)) setUsers(uData);
    if (autoData.success)  setAutomations(Array.isArray(autoData.data) ? autoData.data : []);
    if (wfData.success)    setWorkflows(Array.isArray(wfData.data) ? wfData.data : []);
    if (teamsData.success) setTeams(Array.isArray(teamsData.data) ? teamsData.data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'teams') loadTeams(); }, [tab, loadTeams]);

  const selectedPipeline = pipelines.find(p => p.id === autoForm.pipeline_id);

  // ── Stage automation CRUD ──

  async function createAutomation() {
    if (!autoForm.pipeline_id || !autoForm.stage_id) return;
    setSavingAuto(true); setAutoError('');
    let action_data: Record<string, unknown> = {};
    if (autoForm.action_type === 'assign_user')       action_data = { user_id: autoForm.user_id };
    if (autoForm.action_type === 'send_whatsapp')     action_data = { template_name: autoForm.whatsapp_template };
    if (autoForm.action_type === 'create_task')       action_data = { task_type: autoForm.task_type, hours_from_now: parseInt(autoForm.hours_from_now) };
    if (autoForm.action_type === 'send_notification') action_data = { message: autoForm.notification_message };
    const res  = await fetch('/api/v1/crm/automations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_id: autoForm.pipeline_id, stage_id: autoForm.stage_id, action_type: autoForm.action_type, action_data }),
    });
    const data = await res.json();
    setSavingAuto(false);
    if (!res.ok) { setAutoError(data.error ?? 'Failed to save automation'); return; }
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
    setWfName(''); setWfMatch('OR'); setWfRules([]);
    setWfActions([{ type: 'assign_user', user_id: '', user_name: '' }]);
    setWfStep('basics'); setWfError('');
  }

  async function createWorkflow() {
    const validActions = wfActions.filter(a => {
      if (a.type === 'assign_user')       return !!a.user_id;
      if (a.type === 'set_follow_up')     return (a.hours_from_now ?? 0) > 0;
      if (a.type === 'send_notification') return !!a.message?.trim();
      if (a.type === 'update_lead_stage') return !!a.stage;
      return false;
    });
    if (!wfName.trim() || validActions.length === 0) { setWfError('Add at least one complete action.'); return; }
    setSavingWf(true); setWfError('');
    const validRules = wfRules.filter(r => r.field && (r.operator === 'is_empty' || r.operator === 'is_not_empty' || r.value.trim()));
    const conditions = validRules.length > 0 ? { match: wfMatch, rules: validRules } : null;
    const res = await fetch('/api/v1/crm/workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wfName, module: 'contacts', trigger: 'on_create', conditions, actions: validActions }),
    });
    const data = await res.json();
    setSavingWf(false);
    if (!res.ok) { setWfError(data.error ?? 'Failed to save workflow'); return; }
    setShowWfForm(false); resetWfForm(); load();
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

  // ── Teams CRUD ──

  async function createTeam() {
    if (!teamName.trim()) return;
    setSavingTeam(true); setTeamError('');
    const res  = await fetch('/api/v1/crm/teams', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamName.trim() }),
    });
    const data = await res.json();
    setSavingTeam(false);
    if (!res.ok) { setTeamError(data.error ?? 'Failed to create team'); return; }
    setShowTeamForm(false);
    setTeamName('');
    loadTeams();
  }

  async function deleteTeam(id: string, name: string) {
    if (!confirm(`Delete team "${name}"? Members will be removed but user accounts will remain.`)) return;
    await fetch(`/api/v1/crm/teams/${id}`, { method: 'DELETE' });
    loadTeams();
  }

  function openManageMembers(team: CrmTeam) {
    setManagingTeam(team);
    setTeamMemberIds(new Set(team.members.map(m => m.user_id)));
  }

  async function saveTeamMembers() {
    if (!managingTeam) return;
    setSavingMembers(true);
    await fetch(`/api/v1/crm/teams/${managingTeam.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: Array.from(teamMemberIds) }),
    });
    setSavingMembers(false);
    setManagingTeam(null);
    loadTeams();
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
    if (!Array.isArray(wf.actions) || wf.actions.length === 0) return 'No actions';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = wf.actions[0] as any;
    // Old format
    if (first.strategy) {
      const strat = first.strategy === 'round_robin' ? 'Round Robin' : first.strategy === 'weighted' ? 'Weighted' : `Team: ${first.team_name ?? ''}`;
      const names = (first.users ?? []).map((u: { name: string }) => u.name).join(', ') || 'No users';
      return `Assign (${strat}) → ${names}`;
    }
    // New format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return wf.actions.map((a: any) => {
      if (a.type === 'assign_user')       return `Assign → ${a.user_name || a.user_id || 'User'}`;
      if (a.type === 'set_follow_up')     return `Follow-up in ${a.hours_from_now ?? 24}h`;
      if (a.type === 'send_notification') return `Notify: "${(a.message ?? '').slice(0, 30)}"`;
      if (a.type === 'update_lead_stage') return `Stage → ${(a.stage ?? '').replace(/_/g, ' ')}`;
      return a.type;
    }).join(' + ');
  }

  function wfConditionLabel(wf: CrmWorkflow): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cond = wf.conditions as any;
    if (!cond) return 'All new contacts';
    if (cond.source_filter) return `Source: ${cond.source_filter.replace(/_/g, ' ')}`;
    if (Array.isArray(cond.rules) && cond.rules.length > 0) {
      const labels = cond.rules.map((r: { field: string; operator: string; value: string }) => {
        const fieldLabel = WF_CONDITION_FIELDS.find(f => f.value === r.field)?.label ?? r.field;
        return `${fieldLabel} ${r.operator.replace(/_/g, ' ')} "${r.value}"`;
      });
      return `IF (${labels.join(` ${cond.match ?? 'OR'} `)})`;
    }
    return 'All new contacts';
  }

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
      <div className="flex gap-1 p-1 rounded-xl w-fit flex-wrap" style={{ backgroundColor: '#F1F5F9' }}>
        {([
          { key: 'automations',    label: 'Stage Automations', icon: Zap },
          { key: 'workflows',      label: 'Workflows',          icon: Workflow },
          { key: 'contact-fields', label: 'Contact Fields',     icon: ListPlus },
          { key: 'tags',           label: 'Tags',               icon: TagIcon },
          { key: 'teams',          label: 'Teams',              icon: Users },
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
                <button onClick={() => { setShowAutoForm(false); setAutoError(''); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
                  <X className="w-4 h-4" style={{ color: '#64748B' }} />
                </button>
              </div>

              {autoError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{autoError}</p>
              )}

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
          Workflows — fires when a new contact is created (Bigin-style)
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === 'workflows' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Workflows</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Multi-condition rules with multi-action sequences — runs when a new contact is created</p>
            </div>
            <button onClick={() => { resetWfForm(); setShowWfForm(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: T }}>
              <Plus className="w-4 h-4" /> New Workflow
            </button>
          </div>

          {/* Workflow builder form */}
          {showWfForm && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <p className="font-bold text-sm" style={{ color: '#0F172A' }}>New Workflow</p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    {wfStep === 'basics' ? 'Step 1 of 3 — Name' : wfStep === 'conditions' ? 'Step 2 of 3 — Conditions (optional)' : 'Step 3 of 3 — Actions'}
                  </p>
                </div>
                <button onClick={() => { setShowWfForm(false); resetWfForm(); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
                  <X className="w-4 h-4" style={{ color: '#64748B' }} />
                </button>
              </div>

              {/* Step progress dots */}
              <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: '1px solid #F8FAFC' }}>
                {(['basics', 'conditions', 'actions'] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <div className="w-8 h-px" style={{ backgroundColor: '#E2E8F0' }} />}
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{
                          backgroundColor: wfStep === s ? T : (['basics', 'conditions', 'actions'].indexOf(wfStep) > i ? '#22C55E' : '#E2E8F0'),
                          color: wfStep === s || ['basics', 'conditions', 'actions'].indexOf(wfStep) > i ? '#fff' : '#94A3B8',
                        }}>
                        {['basics', 'conditions', 'actions'].indexOf(wfStep) > i ? '✓' : i + 1}
                      </div>
                      <span className="text-xs font-medium" style={{ color: wfStep === s ? '#0F172A' : '#94A3B8' }}>
                        {s === 'basics' ? 'Name' : s === 'conditions' ? 'Conditions' : 'Actions'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-5 space-y-4">
                {wfError && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{wfError}</p>}

                {/* ── Step 1: Name ── */}
                {wfStep === 'basics' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Workflow Name *</label>
                      <input type="text" value={wfName} onChange={e => setWfName(e.target.value)}
                        placeholder="e.g. New Google Ads Lead"
                        className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                        style={{ border: '1px solid #D1D5DB' }} autoFocus />
                    </div>
                    {/* Fixed trigger display */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                      <Zap className="w-4 h-4 flex-shrink-0" style={{ color: '#16A34A' }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#15803D' }}>Trigger</p>
                        <p className="text-sm font-medium" style={{ color: '#0F172A' }}>When a new contact is created</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => setWfStep('conditions')} disabled={!wfName.trim()}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                        style={{ backgroundColor: T }}>
                        Next: Add Conditions →
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Step 2: Conditions ── */}
                {wfStep === 'conditions' && (
                  <div className="space-y-4">
                    {/* Match toggle */}
                    {wfRules.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: '#374151' }}>Match</span>
                        {(['OR', 'AND'] as const).map(m => (
                          <button key={m} onClick={() => setWfMatch(m)}
                            className="px-3 py-1 rounded-lg text-xs font-bold border transition-all"
                            style={{
                              borderColor:     wfMatch === m ? T : '#E2E8F0',
                              backgroundColor: wfMatch === m ? `${T}10` : '#fff',
                              color:           wfMatch === m ? T : '#64748B',
                            }}>
                            {m === 'OR' ? 'ANY condition' : 'ALL conditions'}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Condition rows */}
                    <div className="space-y-2">
                      {wfRules.map((rule, idx) => {
                        const fieldDef = WF_CONDITION_FIELDS.find(f => f.value === rule.field);
                        const ops = fieldDef?.type === 'leadSource' ? SELECT_OPERATORS
                          : fieldDef?.type === 'tag' ? TAG_OPERATORS : TEXT_OPERATORS;
                        const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator);
                        return (
                          <div key={idx} className="flex items-center gap-2 flex-wrap">
                            {idx > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>{wfMatch}</span>}
                            {/* Field */}
                            <div className="relative flex-1 min-w-[140px]">
                              <select value={rule.field} onChange={e => {
                                const newRules = [...wfRules];
                                newRules[idx] = { field: e.target.value, operator: 'contains', value: '' };
                                setWfRules(newRules);
                              }} className="w-full text-sm rounded-lg px-3 py-2 outline-none appearance-none" style={{ border: '1px solid #D1D5DB' }}>
                                <option value="">Select field…</option>
                                {WF_CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                              </select>
                            </div>
                            {/* Operator */}
                            <div className="relative min-w-[130px]">
                              <select value={rule.operator} onChange={e => {
                                const newRules = [...wfRules];
                                newRules[idx] = { ...newRules[idx], operator: e.target.value, value: '' };
                                setWfRules(newRules);
                              }} className="w-full text-sm rounded-lg px-3 py-2 outline-none appearance-none" style={{ border: '1px solid #D1D5DB' }}>
                                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                            {/* Value */}
                            {needsValue && (
                              fieldDef?.type === 'leadSource' ? (
                                <select value={rule.value} onChange={e => {
                                  const newRules = [...wfRules]; newRules[idx] = { ...newRules[idx], value: e.target.value }; setWfRules(newRules);
                                }} className="flex-1 min-w-[120px] text-sm rounded-lg px-3 py-2 outline-none appearance-none" style={{ border: '1px solid #D1D5DB' }}>
                                  <option value="">Select…</option>
                                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                                </select>
                              ) : (
                                <input type="text" value={rule.value}
                                  onChange={e => { const newRules = [...wfRules]; newRules[idx] = { ...newRules[idx], value: e.target.value }; setWfRules(newRules); }}
                                  placeholder={fieldDef?.type === 'tag' ? 'tag name…' : 'value…'}
                                  className="flex-1 min-w-[120px] text-sm rounded-lg px-3 py-2 outline-none"
                                  style={{ border: '1px solid #D1D5DB' }} />
                              )
                            )}
                            {/* Remove */}
                            <button onClick={() => setWfRules(wfRules.filter((_, i) => i !== idx))}
                              className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2]" style={{ color: '#EF4444' }}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={() => setWfRules([...wfRules, { field: 'lead_source', operator: 'is', value: '' }])}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors hover:bg-[#F8FAFC]"
                      style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                      <Plus className="w-3.5 h-3.5" /> Add Condition
                    </button>

                    {wfRules.length === 0 && (
                      <p className="text-xs" style={{ color: '#94A3B8' }}>No conditions — workflow will apply to every new contact.</p>
                    )}

                    <div className="flex justify-between pt-2">
                      <button onClick={() => setWfStep('basics')} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>← Back</button>
                      <button onClick={() => setWfStep('actions')} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: T }}>Next: Add Actions →</button>
                    </div>
                  </div>
                )}

                {/* ── Step 3: Actions ── */}
                {wfStep === 'actions' && (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {wfActions.map((action, idx) => (
                        <div key={idx} className="p-4 rounded-xl space-y-3" style={{ border: '1px solid #E2E8F0', backgroundColor: '#FAFAFA' }}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${T}15`, color: T }}>
                                Action {idx + 1}
                              </span>
                              <div className="relative flex-1">
                                <select value={action.type}
                                  onChange={e => {
                                    const newActions = [...wfActions];
                                    newActions[idx] = { type: e.target.value as WfActionItem['type'] };
                                    setWfActions(newActions);
                                  }}
                                  className="w-full text-sm rounded-lg px-3 py-2 outline-none appearance-none bg-white"
                                  style={{ border: '1px solid #D1D5DB' }}>
                                  {WF_ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                </select>
                              </div>
                            </div>
                            {wfActions.length > 1 && (
                              <button onClick={() => setWfActions(wfActions.filter((_, i) => i !== idx))}
                                className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2]" style={{ color: '#EF4444' }}>
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {/* Action-specific fields */}
                          {action.type === 'assign_user' && (
                            <select value={action.user_id ?? ''}
                              onChange={e => {
                                const u = users.find(u => u.id === e.target.value);
                                const newActions = [...wfActions];
                                newActions[idx] = { ...newActions[idx], user_id: e.target.value, user_name: u?.name ?? '' };
                                setWfActions(newActions);
                              }}
                              className="w-full text-sm rounded-lg px-3 py-2 outline-none appearance-none bg-white"
                              style={{ border: '1px solid #D1D5DB' }}>
                              <option value="">Select user to assign…</option>
                              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                            </select>
                          )}
                          {action.type === 'set_follow_up' && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium" style={{ color: '#374151' }}>Due in</span>
                              <input type="number" min="1" value={action.hours_from_now ?? 24}
                                onChange={e => { const newActions = [...wfActions]; newActions[idx] = { ...newActions[idx], hours_from_now: Number(e.target.value) }; setWfActions(newActions); }}
                                className="w-20 text-sm rounded-lg px-3 py-2 outline-none text-center bg-white"
                                style={{ border: '1px solid #D1D5DB' }} />
                              <span className="text-xs font-medium" style={{ color: '#374151' }}>hours</span>
                            </div>
                          )}
                          {action.type === 'send_notification' && (
                            <input type="text" value={action.message ?? ''}
                              onChange={e => { const newActions = [...wfActions]; newActions[idx] = { ...newActions[idx], message: e.target.value }; setWfActions(newActions); }}
                              placeholder="e.g. New high-value lead from Google Ads"
                              className="w-full text-sm rounded-lg px-3 py-2 outline-none bg-white"
                              style={{ border: '1px solid #D1D5DB' }} />
                          )}
                          {action.type === 'update_lead_stage' && (
                            <select value={action.stage ?? ''}
                              onChange={e => { const newActions = [...wfActions]; newActions[idx] = { ...newActions[idx], stage: e.target.value }; setWfActions(newActions); }}
                              className="w-full text-sm rounded-lg px-3 py-2 outline-none appearance-none bg-white"
                              style={{ border: '1px solid #D1D5DB' }}>
                              <option value="">Select stage…</option>
                              {LEAD_STAGES_LIST.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>

                    <button onClick={() => setWfActions([...wfActions, { type: 'assign_user', user_id: '', user_name: '' }])}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors hover:bg-[#F8FAFC]"
                      style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                      <Plus className="w-3.5 h-3.5" /> Add Another Action
                    </button>

                    <div className="flex items-center justify-between pt-2">
                      <button onClick={() => setWfStep('conditions')} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>← Back</button>
                      <div className="flex gap-3">
                        <button onClick={() => { setShowWfForm(false); resetWfForm(); }} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
                        <button onClick={createWorkflow} disabled={savingWf}
                          className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
                          style={{ backgroundColor: T }}>
                          {savingWf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Create Workflow
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Workflows list */}
          {workflows.length === 0 && !showWfForm ? (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <Workflow className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No workflows yet</p>
              <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: '#94A3B8' }}>
                Create a workflow with conditions and actions to automate your lead management process.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {workflows.map(wf => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const firstAction = (wf.actions as any)?.[0];
                const hasStrategy = !!firstAction?.strategy;
                const StratIcon = hasStrategy
                  ? (firstAction.strategy === 'round_robin' ? RotateCcw : firstAction.strategy === 'weighted' ? Weight : Shield)
                  : Workflow;
                return (
                  <div key={wf.id} className="bg-white rounded-xl px-5 py-4 flex items-start gap-4" style={{ border: '1px solid #E2E8F0' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${T}12` }}>
                      <StratIcon className="w-4 h-4" style={{ color: T }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{wf.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                        {wfConditionLabel(wf)} → {wfActionLabel(wf)}
                      </p>
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

      {/* ═══════════════════════════════════════════════════════════════════════
          Teams — group users into named teams for assignment workflows
      ══════════════════════════════════════════════════════════════════════════ */}
      {tab === 'teams' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Teams</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Create teams and add users — then reference teams in assignment workflows</p>
            </div>
            <button onClick={() => { setShowTeamForm(true); setTeamName(''); setTeamError(''); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: T }}>
              <Plus className="w-4 h-4" /> New Team
            </button>
          </div>

          {/* Create team form */}
          {showTeamForm && (
            <div className="bg-white rounded-2xl p-6 space-y-4" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold" style={{ color: '#0F172A' }}>Create New Team</p>
                <button onClick={() => setShowTeamForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
                  <X className="w-4 h-4" style={{ color: '#64748B' }} />
                </button>
              </div>
              {teamError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{teamError}</p>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Team Name *</label>
                <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createTeam(); }}
                  placeholder="e.g. Sales Team A"
                  className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                  style={{ border: '1px solid #D1D5DB' }}
                  autoFocus />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowTeamForm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  Cancel
                </button>
                <button onClick={createTeam} disabled={savingTeam || !teamName.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: T }}>
                  {savingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Create Team
                </button>
              </div>
            </div>
          )}

          {/* Teams list */}
          {loadingTeams ? (
            <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: T }} /></div>
          ) : teams.length === 0 && !showTeamForm ? (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <Users className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No teams yet</p>
              <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: '#94A3B8' }}>
                Create teams to organise your agents, then assign leads to a team in workflows.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map(team => (
                <div key={team.id} className="bg-white rounded-xl px-5 py-4" style={{ border: '1px solid #E2E8F0' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{team.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                        {team.members.length === 0 ? 'No members yet' : `${team.members.length} member${team.members.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => openManageMembers(team)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:bg-[#F8FAFC]"
                        style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                        <Pencil className="w-3 h-3" /> Members
                      </button>
                      <button onClick={() => deleteTeam(team.id, team.name)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] transition-colors"
                        style={{ color: '#EF4444' }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {team.members.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {team.members.map(m => (
                        <span key={m.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: `${T}12`, color: T }}>
                          {m.user.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Manage members modal */}
          {managingTeam && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setManagingTeam(null)}>
              <div className="bg-white rounded-2xl w-full max-w-[460px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <div>
                    <p className="font-bold" style={{ color: '#0F172A' }}>Manage Members</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{managingTeam.name}</p>
                  </div>
                  <button onClick={() => setManagingTeam(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-2">
                  {users.length === 0 && (
                    <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No users found</p>
                  )}
                  {users.map(u => {
                    const isIn = teamMemberIds.has(u.id);
                    return (
                      <div key={u.id}
                        onClick={() => {
                          setTeamMemberIds(prev => {
                            const next = new Set(prev);
                            if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                            return next;
                          });
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors"
                        style={{ border: `1px solid ${isIn ? T : '#E2E8F0'}`, backgroundColor: isIn ? `${T}06` : '#fff' }}>
                        <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                          style={{ border: `2px solid ${isIn ? T : '#D1D5DB'}`, backgroundColor: isIn ? T : '#fff' }}>
                          {isIn && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{u.name}</p>
                          <p className="text-[11px]" style={{ color: '#94A3B8' }}>{u.role} · {u.email}</p>
                        </div>
                        {isIn && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${T}15`, color: T }}>In team</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-4 flex gap-3 flex-shrink-0" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <button onClick={() => setManagingTeam(null)}
                    className="flex-1 h-9 rounded-lg text-sm font-semibold"
                    style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                    Cancel
                  </button>
                  <button onClick={saveTeamMembers} disabled={savingMembers}
                    className="flex-1 h-9 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: T }}>
                    {savingMembers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Members
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
