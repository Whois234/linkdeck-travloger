'use client';
import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import {
  Plus, Search, Pencil, KeyRound, UserX, UserCheck, X, Eye, EyeOff,
  RefreshCw, ShieldCheck, ChevronDown, Users, Wifi, WifiOff, Crown,
  MoreVertical, Check,
} from 'lucide-react';

type UserRole = 'ADMIN' | 'MANAGER' | 'OPS' | 'SALES' | 'FINANCE';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  agent_id: string | null;
  phone: string | null;
  gender: string | null;
  status: boolean;
  is_available: boolean;
  last_login: string | null;
  created_at: string;
  module_access: Array<{ key: string; perm: 'view' | 'edit' }> | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODULE_GROUPS: { group: string; collapsedByDefault?: boolean; items: { key: string; label: string }[] }[] = [
  {
    group: 'QUOTES & CRM',
    items: [
      { key: 'quotes',               label: 'Quotes' },
      { key: 'pipelines',            label: 'Pipelines' },
      { key: 'contacts',             label: 'Contacts' },
      { key: 'converted-customers',  label: 'Converted Customers' },
      { key: 'crm-settings',         label: 'CRM Settings' },
      { key: 'my-activities',        label: 'My Activities (Tasks · grant Edit to see all users\' tasks)' },
    ],
  },
  {
    group: 'ITINERARY',
    items: [
      { key: 'private-templates', label: 'Private Templates' },
      { key: 'group-templates',   label: 'Group Templates' },
      { key: 'group-batches',     label: 'Group Batches' },
    ],
  },
  {
    group: 'MASTERS',
    collapsedByDefault: true,
    items: [
      { key: 'states',                 label: 'States' },
      { key: 'destinations',           label: 'Destinations' },
      { key: 'cities',                 label: 'Cities' },
      { key: 'suppliers',              label: 'Suppliers' },
      { key: 'hotels',                 label: 'Hotels' },
      { key: 'vehicle-types',          label: 'Vehicle Types' },
      { key: 'vehicle-package-rates',  label: 'Vehicle Rates' },
      { key: 'activities',             label: 'Activities' },
      { key: 'day-plans',              label: 'Day Plans' },
      { key: 'inclusions-exclusions',  label: 'Inclusions / Excl.' },
      { key: 'policies',               label: 'Policies' },
      { key: 'media-library',          label: 'Media Library' },
      { key: 'pricing-rules',          label: 'Pricing Rules' },
    ],
  },
];

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'OPS', 'SALES', 'FINANCE'];

/** Per-role gradient for avatar background */
const ROLE_AVATAR: Record<UserRole, { gradient: string; badge: string; badgeText: string }> = {
  ADMIN:   { gradient: 'linear-gradient(135deg,#F59E0B,#D97706)', badge: '#FEF3C7', badgeText: '#92400E' },
  MANAGER: { gradient: 'linear-gradient(135deg,#8B5CF6,#6D28D9)', badge: '#EDE9FE', badgeText: '#5B21B6' },
  SALES:   { gradient: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', badge: '#DBEAFE', badgeText: '#1E40AF' },
  OPS:     { gradient: 'linear-gradient(135deg,#10B981,#059669)', badge: '#D1FAE5', badgeText: '#065F46' },
  FINANCE: { gradient: 'linear-gradient(135deg,#EC4899,#DB2777)', badge: '#FCE7F3', badgeText: '#831843' },
};

// ─── Shared form components ───────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748B' }}>{label}</label>
      {children}
      {error && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{error}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="w-full h-10 px-3.5 rounded-xl border text-sm placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors"
      style={{ borderColor: '#E2E8F0', color: '#0F172A', ...props.style }} />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props}
      className="w-full h-10 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors appearance-none bg-white"
      style={{ borderColor: '#E2E8F0', color: '#0F172A', ...props.style }} />
  );
}

function Modal({ title, onClose, children, width = 'max-w-md' }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: string;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div className={`w-full ${width} bg-white rounded-2xl overflow-hidden`}
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <h3 className="font-bold text-[15px]" style={{ color: '#0F172A' }}>{title}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9] transition-colors" style={{ color: '#94A3B8' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? '••••••••'} />
      <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }}>
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'OPS' as UserRole, agent_id: '', phone: '', gender: '', status: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  function set(field: string, value: unknown) { setForm(p => ({ ...p, [field]: value })); }
  async function handleSave() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true); setApiError('');
    const res = await fetch('/api/v1/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role, agent_id: form.agent_id || null, phone: form.phone || null, gender: form.gender || null, status: form.status }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setApiError(data.error ?? 'Failed to create user'); return; }
    onSaved(); onClose();
  }
  return (
    <Modal title="Add New User" onClose={onClose}>
      <div className="space-y-4">
        {apiError && <div className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{apiError}</div>}
        <Field label="Full Name" error={errors.name}><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Doe" /></Field>
        <Field label="Email Address" error={errors.email}><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@travloger.in" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role"><Select value={form.role} onChange={e => set('role', e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</Select></Field>
          <Field label="Gender"><Select value={form.gender} onChange={e => set('gender', e.target.value)}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile Number"><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" /></Field>
          <Field label="Agent ID (optional)"><Input value={form.agent_id} onChange={e => set('agent_id', e.target.value)} placeholder="AGT-001" /></Field>
        </div>
        <Field label="Password" error={errors.password}><PasswordInput value={form.password} onChange={v => set('password', v)} /></Field>
        <Field label="Confirm Password" error={errors.confirm}><PasswordInput value={form.confirm} onChange={v => set('confirm', v)} placeholder="Re-enter password" /></Field>
        <div className="flex items-center gap-2.5">
          <input type="checkbox" id="status-add" checked={form.status} onChange={e => set('status', e.target.checked)} className="w-4 h-4 rounded accent-[#134956]" />
          <label htmlFor="status-add" className="text-sm font-medium" style={{ color: '#475569' }}>Active account</label>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ borderColor: '#E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2" style={{ backgroundColor: '#134956' }}>
            {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Add User'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user.name, email: user.email, role: user.role, agent_id: user.agent_id ?? '', phone: user.phone ?? '', gender: user.gender ?? '', status: user.status });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  function set(field: string, value: unknown) { setForm(p => ({ ...p, [field]: value })); }
  async function handleSave() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true); setApiError('');
    const res = await fetch(`/api/v1/users/${user.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), role: form.role, agent_id: form.agent_id || null, phone: form.phone || null, gender: form.gender || null, status: form.status }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setApiError(data.error ?? 'Failed to update user'); return; }
    onSaved(); onClose();
  }
  return (
    <Modal title="Edit User" onClose={onClose}>
      <div className="space-y-4">
        {apiError && <div className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{apiError}</div>}
        <Field label="Full Name" error={errors.name}><Input value={form.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Email Address" error={errors.email}><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role"><Select value={form.role} onChange={e => set('role', e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</Select></Field>
          <Field label="Gender"><Select value={form.gender} onChange={e => set('gender', e.target.value)}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile Number"><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" /></Field>
          <Field label="Agent ID (optional)"><Input value={form.agent_id} onChange={e => set('agent_id', e.target.value)} placeholder="AGT-001" /></Field>
        </div>
        <div className="flex items-center gap-2.5">
          <input type="checkbox" id="status-edit" checked={form.status} onChange={e => set('status', e.target.checked)} className="w-4 h-4 rounded accent-[#134956]" />
          <label htmlFor="status-edit" className="text-sm font-medium" style={{ color: '#475569' }}>Active account</label>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ borderColor: '#E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2" style={{ backgroundColor: '#134956' }}>
            {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState('');
  async function handleReset() {
    const e: Record<string, string> = {};
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Minimum 8 characters';
    if (password !== confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true); setApiError('');
    const res = await fetch(`/api/v1/users/${user.id}/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setApiError(data.error ?? 'Failed to reset password'); return; }
    setSuccess(true);
  }
  return (
    <Modal title={`Reset Password — ${user.name}`} onClose={onClose}>
      {success ? (
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#DCFCE7' }}>
            <KeyRound className="w-6 h-6" style={{ color: '#15803D' }} />
          </div>
          <p className="font-semibold text-sm mb-1" style={{ color: '#0F172A' }}>Password reset successfully</p>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>The user can now sign in with the new password.</p>
          <button onClick={onClose} className="px-6 h-10 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: '#134956' }}>Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          {apiError && <div className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{apiError}</div>}
          <Field label="New Password" error={errors.password}><PasswordInput value={password} onChange={setPassword} /></Field>
          <Field label="Confirm New Password" error={errors.confirm}><PasswordInput value={confirm} onChange={setConfirm} placeholder="Re-enter password" /></Field>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ borderColor: '#E2E8F0', color: '#64748B' }}>Cancel</button>
            <button onClick={handleReset} disabled={saving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2" style={{ backgroundColor: '#134956' }}>
              {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Resetting…</> : 'Reset Password'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ToggleStatusModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const deactivating = user.status;
  async function handleConfirm() {
    setSaving(true); setApiError(null);
    try {
      const res = await fetch(`/api/v1/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: !user.status }),
      });
      if (res.ok) { onSaved(); onClose(); return; }
      const d = await res.json().catch(() => ({}));
      setApiError(d.error ?? `Failed (${res.status})`);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={deactivating ? 'Deactivate User' : 'Activate User'} onClose={onClose}>
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: deactivating ? '#FEF2F2' : '#DCFCE7' }}>
          {deactivating ? <UserX className="w-6 h-6" style={{ color: '#DC2626' }} /> : <UserCheck className="w-6 h-6" style={{ color: '#15803D' }} />}
        </div>
        <p className="font-semibold text-sm mb-2" style={{ color: '#0F172A' }}>{deactivating ? `Deactivate ${user.name}?` : `Activate ${user.name}?`}</p>
        <p className="text-sm mb-4" style={{ color: '#64748B' }}>{deactivating ? 'This user will no longer be able to sign in.' : 'This user will be able to sign in again.'}</p>
        {apiError && <p className="text-xs text-red-500 mb-4 bg-red-50 rounded-lg px-3 py-2">{apiError}</p>}
        <div className="flex gap-3 justify-center">
          <button onClick={onClose} className="px-5 h-10 rounded-xl border text-sm font-semibold" style={{ borderColor: '#E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleConfirm} disabled={saving} className="px-5 h-10 rounded-xl text-white text-sm font-semibold disabled:opacity-60" style={{ backgroundColor: deactivating ? '#DC2626' : '#134956' }}>
            {saving ? 'Processing…' : deactivating ? 'Yes, Deactivate' : 'Yes, Activate'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type PermState = 'none' | 'view' | 'edit';

function ModuleAccessModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [fullAccess, setFullAccess] = useState(user.module_access === null);
  const [perms, setPerms] = useState<Record<string, PermState>>(() => {
    const map: Record<string, PermState> = {};
    MODULE_GROUPS.forEach(g => g.items.forEach(({ key }) => { map[key] = 'none'; }));
    if (user.module_access) { user.module_access.forEach(({ key, perm }) => { map[key] = perm; }); }
    else { Object.keys(map).forEach(k => { map[k] = 'edit'; }); }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() =>
    new Set(MODULE_GROUPS.filter(g => g.collapsedByDefault).map(g => g.group))
  );
  function toggleGroupCollapse(group: string) {
    setCollapsedGroups(prev => { const next = new Set(prev); next.has(group) ? next.delete(group) : next.add(group); return next; });
  }
  function setModulePerm(key: string, perm: PermState) { setPerms(p => ({ ...p, [key]: perm })); }
  function setGroupPerm(keys: string[], perm: PermState) { setPerms(p => { const n = { ...p }; keys.forEach(k => { n[k] = perm; }); return n; }); }
  async function handleSave() {
    setSaving(true); setApiError('');
    const module_access = fullAccess ? null : Object.entries(perms).filter(([, p]) => p !== 'none').map(([key, perm]) => ({ key, perm }));
    const res = await fetch(`/api/v1/users/${user.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module_access }) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setApiError(data.error ?? 'Failed to save permissions'); return; }
    onSaved(); onClose();
  }
  const enabledCount = Object.values(perms).filter(p => p !== 'none').length;
  return (
    <Modal title={`Module Access — ${user.name}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        {apiError && <div className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{apiError}</div>}
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: fullAccess ? '#ECFDF5' : '#F8FAFC', border: `1.5px solid ${fullAccess ? '#6EE7B7' : '#E2E8F0'}` }}>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Full Access (no restrictions)</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>All modules allowed by this role, all with edit rights.</p>
          </div>
          <button type="button" onClick={() => setFullAccess(v => !v)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
            style={{ backgroundColor: fullAccess ? '#134956' : '#CBD5E1' }}>
            <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{ transform: fullAccess ? 'translateX(22px)' : 'translateX(2px)' }} />
          </button>
        </div>
        {!fullAccess && (
          <>
            <div className="flex items-center gap-3 text-[11px] font-semibold" style={{ color: '#94A3B8' }}>
              <span className="flex-1">MODULE</span>
              <div className="flex items-center gap-1 w-[195px]">
                <span className="w-[60px] text-center">No Access</span>
                <span className="w-[60px] text-center">View Only</span>
                <span className="w-[60px] text-center">Edit</span>
              </div>
            </div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 -mr-1">
              {MODULE_GROUPS.map(({ group, items, collapsedByDefault }) => {
                const groupKeys = items.map(i => i.key);
                const groupPerms = groupKeys.map(k => perms[k]);
                const allEdit = groupPerms.every(p => p === 'edit');
                const allView = groupPerms.every(p => p === 'view');
                const allNone = groupPerms.every(p => p === 'none');
                const isCollapsible = !!collapsedByDefault;
                const isCollapsed = collapsedGroups.has(group);
                return (
                  <div key={group}>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1 cursor-pointer select-none"
                      style={{ backgroundColor: '#F1F5F9' }}
                      onClick={isCollapsible ? () => toggleGroupCollapse(group) : undefined}>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {isCollapsible && <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 transition-transform" style={{ color: '#64748B', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />}
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#64748B' }}>{group}</span>
                        {isCollapsible && isCollapsed && <span className="text-[10px] font-medium ml-1" style={{ color: '#94A3B8' }}>({items.length} modules)</span>}
                      </div>
                      <div className="flex items-center gap-1 w-[195px]" onClick={e => e.stopPropagation()}>
                        {(['none', 'view', 'edit'] as PermState[]).map(p => (
                          <button key={p} type="button" onClick={() => setGroupPerm(groupKeys, p)}
                            className="w-[60px] h-6 rounded text-[11px] font-semibold transition-all"
                            style={(p === 'none' && allNone) ? { backgroundColor: '#94A3B8', color: '#fff' } : (p === 'view' && allView) ? { backgroundColor: '#3B82F6', color: '#fff' } : (p === 'edit' && allEdit) ? { backgroundColor: '#134956', color: '#fff' } : { backgroundColor: '#E2E8F0', color: '#94A3B8' }}>
                            {p === 'none' ? 'None' : p === 'view' ? 'View' : 'Edit'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className="space-y-1 pl-2">
                        {items.map(({ key, label }) => {
                          const cur = perms[key] ?? 'none';
                          return (
                            <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                              style={{ backgroundColor: cur === 'none' ? '#fff' : cur === 'view' ? '#EFF6FF' : '#F0FDF4', border: `1px solid ${cur === 'none' ? '#E2E8F0' : cur === 'view' ? '#BFDBFE' : '#BBF7D0'}` }}>
                              <span className="flex-1 text-sm font-medium" style={{ color: cur === 'none' ? '#94A3B8' : '#0F172A' }}>{label}</span>
                              <div className="flex items-center gap-1 w-[195px]">
                                {(['none', 'view', 'edit'] as PermState[]).map(p => (
                                  <button key={p} type="button" onClick={() => setModulePerm(key, p)}
                                    className="w-[60px] h-7 rounded-lg text-[11px] font-semibold transition-all"
                                    style={cur === p ? p === 'none' ? { backgroundColor: '#F1F5F9', color: '#64748B', border: '1.5px solid #CBD5E1' } : p === 'view' ? { backgroundColor: '#DBEAFE', color: '#1D4ED8', border: '1.5px solid #93C5FD' } : { backgroundColor: '#DCFCE7', color: '#15803D', border: '1.5px solid #86EFAC' } : { backgroundColor: '#F8FAFC', color: '#CBD5E1', border: '1px solid #E2E8F0' }}>
                                    {p === 'none' ? 'X' : p === 'view' ? 'View' : 'Edit'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs" style={{ color: '#94A3B8' }}>{enabledCount} module{enabledCount !== 1 ? 's' : ''} with access · Dashboard always visible</p>
          </>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ borderColor: '#E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2" style={{ backgroundColor: '#134956' }}>
            {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Save Permissions'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Small toggle switch ───────────────────────────────────────────────────────

function AvailabilitySwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={on ? 'Mark as offline' : 'Mark as online'}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none"
      style={{ backgroundColor: on ? '#22C55E' : '#CBD5E1' }}>
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

// ─── Relative timestamp ────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fullDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── User row action menu ─────────────────────────────────────────────────────

function ActionMenu({ user, isSelf, onEdit, onAccess, onReset, onToggle }: {
  user: User;
  isSelf: boolean;
  onEdit: () => void;
  onAccess: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-100"
        style={{ color: '#94A3B8' }}>
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-48 bg-white rounded-xl py-1 overflow-hidden"
            style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.14)', border: '1px solid #F1F5F9' }}>
            <button onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left" style={{ color: '#374151' }}>
              <Pencil className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} /> Edit User
            </button>
            {user.role !== 'ADMIN' && (
              <button onClick={() => { setOpen(false); onAccess(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left" style={{ color: '#374151' }}>
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} /> Module Access
              </button>
            )}
            <button onClick={() => { setOpen(false); onReset(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-left" style={{ color: '#374151' }}>
              <KeyRound className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} /> Reset Password
            </button>
            {!isSelf && (
              <>
                <div style={{ height: 1, background: '#F1F5F9', margin: '4px 0' }} />
                <button onClick={() => { setOpen(false); onToggle(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-red-50 transition-colors text-left" style={{ color: user.status ? '#DC2626' : '#15803D' }}>
                  {user.status ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  {user.status ? 'Deactivate' : 'Activate'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Access badge ─────────────────────────────────────────────────────────────

function AccessBadge({ user }: { user: User }) {
  if (user.role === 'ADMIN') return (
    <div className="flex items-center gap-1.5">
      <Crown className="w-3 h-3" style={{ color: '#D97706' }} />
      <span className="text-xs font-semibold" style={{ color: '#92400E' }}>Full Admin</span>
    </div>
  );
  if (user.module_access === null) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold" style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
      <Check className="w-3 h-3" /> Full Access
    </span>
  );
  if (user.module_access.length === 0) return (
    <span className="text-xs font-medium" style={{ color: '#CBD5E1' }}>No access</span>
  );
  const editCount = user.module_access.filter(m => m.perm === 'edit').length;
  const viewCount = user.module_access.filter(m => m.perm === 'view').length;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {editCount > 0 && <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>{editCount} edit</span>}
      {viewCount > 0 && <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold" style={{ background: '#DBEAFE', color: '#1E40AF' }}>{viewCount} view</span>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers]           = useState<User[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage]             = useState(1);

  const [addOpen,    setAddOpen]    = useState(false);
  const [editUser,   setEditUser]   = useState<User | null>(null);
  const [resetUser,  setResetUser]  = useState<User | null>(null);
  const [toggleUser, setToggleUser] = useState<User | null>(null);
  const [moduleUser, setModuleUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const LIMIT = 20;

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data?.id) setCurrentUserId(d.data.id); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search)     params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    const res = await fetch(`/api/v1/users?${params}`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.data.items);
      setTotal(data.data.total);
    }
    setLoading(false);
  }, [page, search, roleFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, roleFilter]);

  async function toggleAvailability(u: User) {
    await fetch(`/api/v1/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_available: !u.is_available }),
    });
    load();
  }

  const pages   = Math.ceil(total / LIMIT);
  const online  = users.filter(u => u.is_available && u.status).length;
  const offline = users.filter(u => !u.is_available && u.status).length;

  // Role pill tabs
  const roleTabs = [{ value: '', label: 'All Users' }, ...ROLES.map(r => ({ value: r, label: r }))];

  return (
    <div className="max-w-[1280px] pb-4">
      <PageHeader
        title="Team Members"
        subtitle="Manage roles, access permissions and availability"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]}
        action={
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#134956,#0d3640)' }}>
            <Plus className="w-4 h-4" /> Add User
          </button>
        }
      />

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-5">
        {[
          { icon: Users,   label: 'Total Members', value: total,   color: '#134956', bg: '#EEF6F8' },
          { icon: Wifi,    label: 'Online Now',     value: online,  color: '#059669', bg: '#ECFDF5' },
          { icon: WifiOff, label: 'Offline',        value: offline, color: '#94A3B8', bg: '#F8FAFC' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2.5 sm:gap-3.5 px-3 sm:px-5 py-3 sm:py-4 rounded-xl sm:rounded-2xl bg-white"
            style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
              <s.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-bold leading-none" style={{ color: '#0F172A' }}>{s.value}</p>
              <p className="text-[10px] sm:text-xs mt-0.5 font-medium truncate" style={{ color: '#94A3B8' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 mb-4">
        {/* Role pill tabs — horizontally scrollable on mobile */}
        <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto no-scrollbar" style={{ background: '#F1F5F9' }}>
          {roleTabs.map(tab => (
            <button key={tab.value} onClick={() => setRoleFilter(tab.value)}
              className="px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0"
              style={roleFilter === tab.value
                ? { background: 'white', color: '#134956', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                : { color: '#64748B' }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="hidden sm:block flex-1" />

        {/* Search */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="h-9 pl-9 pr-4 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors w-full sm:w-56"
            style={{ borderColor: '#E2E8F0', color: '#0F172A', background: 'white' }} />
        </div>
      </div>

      {/* ── Table / Cards ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl overflow-hidden"
        style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Desktop table header */}
        <div className="hidden md:grid items-center px-5 py-3"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
          {['Team Member', 'Role', 'Access', 'Availability', 'Last Active', ''].map(h => (
            <div key={h} className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: '#134956' }} />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-10 h-10 mx-auto mb-3" style={{ color: '#E2E8F0' }} />
            <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>No users found</p>
          </div>
        ) : users.map((u, i) => {
          const initials = u.name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
          const ra = ROLE_AVATAR[u.role];
          const isSelf = u.id === currentUserId;
          const rowBorder = i < users.length - 1 ? '1px solid #F8FAFC' : undefined;
          return (
            <div key={u.id} style={{ borderBottom: rowBorder }}>

              {/* Desktop row */}
              <div className="hidden md:grid group items-center px-5 py-3.5 transition-colors hover:bg-slate-50/60"
                style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto' }}>
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 select-none"
                    style={{ background: ra.gradient, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[13px] truncate" style={{ color: '#0F172A' }}>{u.name}</p>
                      {!u.status && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#FEE2E2', color: '#DC2626' }}>Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{u.email}</p>
                      {u.agent_id && (
                        <>
                          <span style={{ color: '#E2E8F0' }}>·</span>
                          <span className="text-[11px] font-mono" style={{ color: '#CBD5E1' }}>{u.agent_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide"
                    style={{ backgroundColor: ra.badge, color: ra.badgeText }}>{u.role}</span>
                </div>

                <div><AccessBadge user={u} /></div>

                <div className="flex items-center gap-2.5">
                  <AvailabilitySwitch on={u.is_available} onToggle={() => toggleAvailability(u)} />
                  <span className="text-xs font-medium" style={{ color: u.is_available ? '#059669' : '#94A3B8' }}>
                    {u.is_available ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div title={fullDateTime(u.last_login)}>
                  <p className="text-xs font-medium" style={{ color: u.last_login ? '#374151' : '#CBD5E1' }}>
                    {relativeTime(u.last_login)}
                  </p>
                </div>

                <div className="flex justify-end">
                  <ActionMenu user={u} isSelf={isSelf}
                    onEdit={() => setEditUser(u)}
                    onAccess={() => setModuleUser(u)}
                    onReset={() => setResetUser(u)}
                    onToggle={() => setToggleUser(u)} />
                </div>
              </div>

              {/* Mobile card */}
              <div className="md:hidden px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 select-none"
                    style={{ background: ra.gradient, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{u.name}</p>
                          {!u.status && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#FEE2E2', color: '#DC2626' }}>Inactive</span>
                          )}
                        </div>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#94A3B8' }}>{u.email}</p>
                      </div>
                      <ActionMenu user={u} isSelf={isSelf}
                        onEdit={() => setEditUser(u)}
                        onAccess={() => setModuleUser(u)}
                        onReset={() => setResetUser(u)}
                        onToggle={() => setToggleUser(u)} />
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide"
                        style={{ backgroundColor: ra.badge, color: ra.badgeText }}>{u.role}</span>
                      <AccessBadge user={u} />
                      {u.agent_id && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#F1F5F9', color: '#64748B' }}>{u.agent_id}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2.5 pt-2.5" style={{ borderTop: '1px dashed #F1F5F9' }}>
                      <div className="flex items-center gap-2">
                        <AvailabilitySwitch on={u.is_available} onToggle={() => toggleAvailability(u)} />
                        <span className="text-[11px] font-medium" style={{ color: u.is_available ? '#059669' : '#94A3B8' }}>
                          {u.is_available ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium" style={{ color: u.last_login ? '#94A3B8' : '#CBD5E1' }}>
                        {relativeTime(u.last_login)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Footer / Pagination */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5"
          style={{ borderTop: '1px solid #F1F5F9', background: '#FAFBFC' }}>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            Showing {users.length} of <span className="font-semibold" style={{ color: '#374151' }}>{total}</span> members
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 h-7 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 hover:bg-white"
                style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
                ← Prev
              </button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2;
                if (p < 1 || p > pages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className="w-7 h-7 rounded-lg text-xs font-semibold transition-colors"
                    style={p === page ? { background: '#134956', color: 'white' } : { color: '#64748B', border: '1px solid #E2E8F0' }}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 h-7 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 hover:bg-white"
                style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {addOpen    && <AddUserModal     onClose={() => setAddOpen(false)}    onSaved={load} />}
      {editUser   && <EditUserModal    user={editUser}   onClose={() => setEditUser(null)}   onSaved={load} />}
      {moduleUser && <ModuleAccessModal user={moduleUser} onClose={() => setModuleUser(null)} onSaved={load} />}
      {resetUser  && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      {toggleUser && <ToggleStatusModal  user={toggleUser} onClose={() => setToggleUser(null)} onSaved={load} />}
    </div>
  );
}
