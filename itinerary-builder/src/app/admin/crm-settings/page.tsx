'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Loader2, Zap, Workflow, ToggleLeft, ToggleRight, Trash2, ChevronDown,
  GripVertical, Tag as TagIcon, Pencil, Check, ListPlus,
} from 'lucide-react';
import { ContactFieldsTab, ContactTagsTab } from './ContactCustomization';

interface PipelineStage { id: string; name: string; color: string }
interface Pipeline      { id: string; name: string; stages: PipelineStage[] }

interface StageAutomation {
  id: string; pipeline_id: string; stage_id: string; trigger: string;
  action_type: string; action_data: Record<string, unknown>;
  is_active: boolean; created_at: string;
  stage: { id: string; name: string; color: string };
}

interface Workflow {
  id: string; name: string; module: string; trigger: string;
  conditions: Record<string, unknown> | null; actions: Record<string, unknown>[];
  is_active: boolean; created_at: string;
}

interface Agent { id: string; name: string; user_id: string }

const ACTION_TYPES = [
  { value: 'assign_agent',       label: 'Assign to Agent' },
  { value: 'send_notification',  label: 'Send Notification' },
  { value: 'create_task',        label: 'Create Task' },
];

const TASK_TYPES   = ['call', 'follow_up', 'send_quote', 'meeting', 'other'];
const MODULES      = [{ value: 'contacts', label: 'Contacts' }, { value: 'deals', label: 'Deals' }];
const TRIGGERS     = [
  { value: 'on_create',       label: 'On Create' },
  { value: 'on_stage_change', label: 'On Stage Change' },
  { value: 'on_update',       label: 'On Update' },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex-shrink-0">
      {on
        ? <ToggleRight className="w-6 h-6" style={{ color: '#22C55E' }} />
        : <ToggleLeft  className="w-6 h-6" style={{ color: '#CBD5E1' }} />}
    </button>
  );
}

export default function CrmSettingsPage() {
  const [tab, setTab]               = useState<'automations' | 'workflows' | 'contact-fields' | 'tags'>('automations');
  const [pipelines, setPipelines]   = useState<Pipeline[]>([]);
  const [agents, setAgents]         = useState<Agent[]>([]);
  const [automations, setAutomations] = useState<StageAutomation[]>([]);
  const [workflows, setWorkflows]   = useState<Workflow[]>([]);
  const [loading, setLoading]       = useState(true);

  // Automation form
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [autoForm, setAutoForm] = useState({
    pipeline_id: '', stage_id: '', action_type: 'assign_agent',
    agent_id: '', task_type: 'call', hours_from_now: '24', message: '', notification_message: '',
  });
  const [savingAuto, setSavingAuto] = useState(false);

  // Workflow form
  const [showWfForm, setShowWfForm] = useState(false);
  const [wfForm, setWfForm]         = useState({ name: '', module: 'deals', trigger: 'on_stage_change' });
  const [savingWf, setSavingWf]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, aRes, autoRes, wfRes] = await Promise.all([
      fetch('/api/v1/pipelines'),
      fetch('/api/v1/agents'),
      fetch('/api/v1/crm/automations'),
      fetch('/api/v1/crm/workflows'),
    ]);
    const [pData, aData, autoData, wfData] = await Promise.all([pRes.json(), aRes.json(), autoRes.json(), wfRes.json()]);
    if (pData.success)    setPipelines(pData.data);
    if (aData.success)    setAgents(aData.data);
    if (autoData.success) setAutomations(autoData.data);
    if (wfData.success)   setWorkflows(wfData.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedPipeline = pipelines.find(p => p.id === autoForm.pipeline_id);

  async function createAutomation() {
    if (!autoForm.pipeline_id || !autoForm.stage_id) return;
    setSavingAuto(true);

    let action_data: Record<string, unknown> = {};
    if (autoForm.action_type === 'assign_agent')      action_data = { agent_id: autoForm.agent_id };
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

  async function createWorkflow() {
    if (!wfForm.name.trim()) return;
    setSavingWf(true);
    await fetch('/api/v1/crm/workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...wfForm, actions: [] }),
    });
    setSavingWf(false);
    setShowWfForm(false);
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

  function actionLabel(a: StageAutomation) {
    const ad = a.action_data;
    if (a.action_type === 'assign_agent')      return `Assign to agent ${(ad.agent_id as string ?? '').slice(0, 6)}...`;
    if (a.action_type === 'create_task')       return `Create ${ad.task_type ?? 'task'} task in ${ad.hours_from_now ?? 24}h`;
    if (a.action_type === 'send_notification') return `Notify: "${ad.message ?? ''}"`;
    return a.action_type;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#134956' }} />
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
              color: tab === key ? '#0F172A' : '#64748B',
              boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Stage Automations ── */}
      {tab === 'automations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Stage Automations</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Automatically trigger actions when a lead enters a pipeline stage</p>
            </div>
            <button onClick={() => setShowAutoForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: '#134956' }}>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Pipeline</label>
                  <div className="relative">
                    <select value={autoForm.pipeline_id} onChange={e => setAutoForm(p => ({ ...p, pipeline_id: e.target.value, stage_id: '' }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none"
                      style={{ border: '1px solid #D1D5DB' }}>
                      <option value="">Select pipeline…</option>
                      {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>When lead enters stage</label>
                  <div className="relative">
                    <select value={autoForm.stage_id} onChange={e => setAutoForm(p => ({ ...p, stage_id: e.target.value }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none"
                      style={{ border: '1px solid #D1D5DB' }} disabled={!selectedPipeline}>
                      <option value="">Select stage…</option>
                      {selectedPipeline?.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Action</label>
                <div className="flex gap-2 flex-wrap">
                  {ACTION_TYPES.map(at => (
                    <button key={at.value} onClick={() => setAutoForm(p => ({ ...p, action_type: at.value }))}
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        border: `1px solid ${autoForm.action_type === at.value ? '#134956' : '#E2E8F0'}`,
                        backgroundColor: autoForm.action_type === at.value ? '#F0F9FF' : '#fff',
                        color: autoForm.action_type === at.value ? '#134956' : '#64748B',
                      }}>
                      {at.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action-specific fields */}
              {autoForm.action_type === 'assign_agent' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Assign to Agent</label>
                  <div className="relative">
                    <select value={autoForm.agent_id} onChange={e => setAutoForm(p => ({ ...p, agent_id: e.target.value }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none"
                      style={{ border: '1px solid #D1D5DB' }}>
                      <option value="">Select agent…</option>
                      {agents.map(a => <option key={a.id} value={a.user_id ?? a.id}>{a.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                  </div>
                </div>
              )}
              {autoForm.action_type === 'create_task' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Task Type</label>
                    <div className="relative">
                      <select value={autoForm.task_type} onChange={e => setAutoForm(p => ({ ...p, task_type: e.target.value }))}
                        className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none"
                        style={{ border: '1px solid #D1D5DB' }}>
                        {TASK_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                    </div>
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
                  <input type="text" value={autoForm.notification_message} placeholder="e.g. Follow up with this lead"
                    onChange={e => setAutoForm(p => ({ ...p, notification_message: e.target.value }))}
                    className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                    style={{ border: '1px solid #D1D5DB' }} />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowAutoForm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  Cancel
                </button>
                <button onClick={createAutomation} disabled={savingAuto || !autoForm.pipeline_id || !autoForm.stage_id}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: '#134956' }}>
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
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>→ {actionLabel(a)}</p>
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

      {/* ── Workflows ── */}
      {tab === 'workflows' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Workflows</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Trigger automatic actions when CRM records match specified criteria</p>
            </div>
            <button onClick={() => setShowWfForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: '#134956' }}>
              <Plus className="w-4 h-4" /> New Workflow
            </button>
          </div>

          {showWfForm && (
            <div className="bg-white rounded-2xl p-6 space-y-4" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold" style={{ color: '#0F172A' }}>New Workflow</p>
                <button onClick={() => setShowWfForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]">
                  <X className="w-4 h-4" style={{ color: '#64748B' }} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Workflow Name</label>
                  <input type="text" value={wfForm.name} placeholder="e.g. New Lead Google"
                    onChange={e => setWfForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                    style={{ border: '1px solid #D1D5DB' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Module</label>
                  <div className="relative">
                    <select value={wfForm.module} onChange={e => setWfForm(p => ({ ...p, module: e.target.value }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none"
                      style={{ border: '1px solid #D1D5DB' }}>
                      {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Execute On</label>
                  <div className="relative">
                    <select value={wfForm.trigger} onChange={e => setWfForm(p => ({ ...p, trigger: e.target.value }))}
                      className="w-full text-sm rounded-lg px-3 py-2.5 outline-none appearance-none"
                      style={{ border: '1px solid #D1D5DB' }}>
                      {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowWfForm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  Cancel
                </button>
                <button onClick={createWorkflow} disabled={savingWf || !wfForm.name.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: '#134956' }}>
                  {savingWf && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Workflow
                </button>
              </div>
            </div>
          )}

          {workflows.length === 0 && !showWfForm ? (
            <div className="text-center py-16 bg-white rounded-2xl" style={{ border: '1px solid #E2E8F0' }}>
              <Workflow className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No workflows yet</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Workflows trigger email alerts, create tasks, and tag/update records automatically.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              <div className="grid grid-cols-5 px-5 py-3 text-[11px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#94A3B8' }}>
                <div className="col-span-2">Workflow Name</div>
                <div>Module</div>
                <div>Execute On</div>
                <div className="text-center">Status</div>
              </div>
              {workflows.map((wf, i) => (
                <div key={wf.id} className="grid grid-cols-5 px-5 py-4 items-center"
                  style={{ borderBottom: i < workflows.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div className="col-span-2">
                    <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{wf.name}</p>
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                      {wf.module}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: '#64748B' }}>
                      {TRIGGERS.find(t => t.value === wf.trigger)?.label ?? wf.trigger}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Toggle on={wf.is_active} onToggle={() => toggleWorkflow(wf.id, !wf.is_active)} />
                    <button onClick={() => deleteWorkflow(wf.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] transition-colors"
                      style={{ color: '#EF4444' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'contact-fields' && <ContactFieldsTab />}
      {tab === 'tags'           && <ContactTagsTab />}
    </div>
  );
}
