'use client';
import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Plus, Search, Pencil, KeyRound, UserX, UserCheck, X, Eye, EyeOff, RefreshCw } from 'lucide-react';

type UserRole = 'ADMIN' | 'MANAGER' | 'OPS' | 'SALES' | 'FINANCE';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  agent_id: string | null;
  status: boolean;
  last_login: string | null;
  created_at: string;
}

const ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'OPS', 'SALES', 'FINANCE'];

const ROLE_STYLE: Record<UserRole, { bg: string; color: string }> = {
  ADMIN:   { bg: '#FEF3C7', color: '#B45309' },
  MANAGER: { bg: '#EDE9FE', color: '#7C3AED' },
  OPS:     { bg: '#DCFCE7', color: '#15803D' },
  SALES:   { bg: '#E0F2FE', color: '#0369A1' },
  FINANCE: { bg: '#FCE7F3', color: '#9D174D' },
};

/* ── Reusable field ── */
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
    <input
      {...props}
      className="w-full h-10 px-3.5 rounded-xl border text-sm placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors"
      style={{ borderColor: '#E2E8F0', color: '#0F172A', ...props.style }}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full h-10 px-3.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors appearance-none bg-white"
      style={{ borderColor: '#E2E8F0', color: '#0F172A', ...props.style }}
    />
  );
}

/* ── Modal shell ── */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div className={`w-full ${width} bg-white rounded-2xl overflow-hidden`}
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
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

/* ── Password input ── */
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

/* ── Add User Modal ── */
function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'OPS' as UserRole, agent_id: '', status: true });
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role, agent_id: form.agent_id || null, status: form.status }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setApiError(data.error ?? 'Failed to create user'); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal title="Add New User" onClose={onClose}>
      <div className="space-y-4">
        {apiError && <div className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{apiError}</div>}
        <Field label="Full Name" error={errors.name}><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Doe" /></Field>
        <Field label="Email Address" error={errors.email}><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@travloger.in" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <Select value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
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

/* ── Edit User Modal ── */
function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user.name, email: user.email, role: user.role, agent_id: user.agent_id ?? '', status: user.status });
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
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), role: form.role, agent_id: form.agent_id || null, status: form.status }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setApiError(data.error ?? 'Failed to update user'); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal title="Edit User" onClose={onClose}>
      <div className="space-y-4">
        {apiError && <div className="px-3 py-2.5 rounded-xl text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{apiError}</div>}
        <Field label="Full Name" error={errors.name}><Input value={form.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Email Address" error={errors.email}><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <Select value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
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

/* ── Reset Password Modal ── */
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

/* ── Toggle Status Confirm Modal ── */
function ToggleStatusModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const deactivating = user.status;

  async function handleConfirm() {
    setSaving(true);
    const res = await fetch(`/api/v1/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: !user.status }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); onClose(); }
  }

  return (
    <Modal title={deactivating ? 'Deactivate User' : 'Activate User'} onClose={onClose}>
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: deactivating ? '#FEF2F2' : '#DCFCE7' }}>
          {deactivating ? <UserX className="w-6 h-6" style={{ color: '#DC2626' }} /> : <UserCheck className="w-6 h-6" style={{ color: '#15803D' }} />}
        </div>
        <p className="font-semibold text-sm mb-2" style={{ color: '#0F172A' }}>
          {deactivating ? `Deactivate ${user.name}?` : `Activate ${user.name}?`}
        </p>
        <p className="text-sm mb-6" style={{ color: '#64748B' }}>
          {deactivating
            ? 'This user will no longer be able to sign in.'
            : 'This user will be able to sign in again.'}
        </p>
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

/* ── Main Page ── */
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [toggleUser, setToggleUser] = useState<User | null>(null);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set('search', search);
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

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="User Management"
        subtitle="Manage admin panel users, roles and access"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]}
        action={
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 h-9 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: '#134956' }}>
            <Plus className="w-4 h-4" /> Add User
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-[340px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full h-9 pl-9 pr-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors"
            style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
          />
        </div>
        <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width: 140, height: 36, fontSize: 13 }}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['User', 'Role', 'Agent ID', 'Status', 'Last Login', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center text-sm" style={{ color: '#94A3B8' }}>Loading users…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-sm" style={{ color: '#94A3B8' }}>No users found</td></tr>
              ) : users.map((u, i) => {
                const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                const rs = ROLE_STYLE[u.role];
                return (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #F1F5F9' : undefined }}>
                    {/* User */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-semibold text-[13px]" style={{ color: '#0F172A' }}>{u.name}</p>
                          <p className="text-xs" style={{ color: '#94A3B8' }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: rs.bg, color: rs.color }}>{u.role}</span>
                    </td>
                    {/* Agent ID */}
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-mono" style={{ color: u.agent_id ? '#0F172A' : '#CBD5E1' }}>{u.agent_id ?? '—'}</span>
                    </td>
                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: u.status ? '#DCFCE7' : '#FEF2F2', color: u.status ? '#15803D' : '#DC2626' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: u.status ? '#22C55E' : '#EF4444' }} />
                        {u.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {/* Last Login */}
                    <td className="px-5 py-3.5">
                      <span className="text-xs" style={{ color: '#64748B' }}>{formatDate(u.last_login)}</span>
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setEditUser(u)} title="Edit" className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#64748B' }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setResetUser(u)} title="Reset Password" className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#64748B' }}>
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setToggleUser(u)} title={u.status ? 'Deactivate' : 'Activate'}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                          style={{ color: u.status ? '#DC2626' : '#15803D', backgroundColor: u.status ? '#FEF2F2' : '#DCFCE7' }}>
                          {u.status ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
            <span className="text-xs" style={{ color: '#94A3B8' }}>{total} users total</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 h-7 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 hover:bg-[#F8FAFC]"
                style={{ borderColor: '#E2E8F0', color: '#64748B' }}>Prev</button>
              <span className="px-2 text-xs font-medium" style={{ color: '#0F172A' }}>{page} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 h-7 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 hover:bg-[#F8FAFC]"
                style={{ borderColor: '#E2E8F0', color: '#64748B' }}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {addOpen && <AddUserModal onClose={() => setAddOpen(false)} onSaved={load} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      {toggleUser && <ToggleStatusModal user={toggleUser} onClose={() => setToggleUser(null)} onSaved={load} />}
    </div>
  );
}
