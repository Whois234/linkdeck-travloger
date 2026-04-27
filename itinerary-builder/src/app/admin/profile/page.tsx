'use client';
import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { User, Mail, Shield, KeyRound, Check, Eye, EyeOff } from 'lucide-react';

interface AuthUser { id: string; name: string; email: string; role: string }

const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export default function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    fetch('/api/v1/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setUser(d.data);
        setName(d.data.name);
        setEmail(d.data.email);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true); setProfileError(''); setProfileSuccess(false);
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      if (res.ok) {
        setProfileSuccess(true);
        setTimeout(() => setProfileSuccess(false), 3000);
      } else {
        const data = await res.json();
        setProfileError(data.error ?? 'Failed to update profile');
      }
    } catch {
      setProfileError('Something went wrong. Please try again.');
    }
    setSavingProfile(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(''); setPasswordSuccess(false);
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/v1/auth/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (res.ok) {
        setPasswordSuccess(true);
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        const data = await res.json();
        setPasswordError(data.error ?? 'Failed to change password');
      }
    } catch {
      setPasswordError('Something went wrong. Please try again.');
    }
    setSavingPassword(false);
  }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? 'AU';

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="My Profile"
        subtitle="Manage your account information and password"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'My Profile' }]}
      />

      {loading ? (
        <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-5">
          {/* Avatar + role card */}
          <div className="bg-white rounded-xl border p-6 flex items-center gap-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
              {initials}
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: '#0F172A' }}>{user?.name ?? 'Admin User'}</p>
              <p className="text-sm" style={{ color: '#64748B' }}>{user?.email}</p>
              <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>
                <Shield className="w-3 h-3" /> {user?.role ?? 'ADMIN'}
              </span>
            </div>
          </div>

          {/* Profile form */}
          <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F0F9FF' }}>
                <User className="w-4 h-4" style={{ color: '#134956' }} />
              </div>
              <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>Account Information</h2>
            </div>

            {profileError && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{profileError}</div>}
            {profileSuccess && (
              <div className="mb-4 p-3.5 rounded-lg text-sm font-medium flex items-center gap-2" style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
                <Check className="w-4 h-4" /> Profile updated successfully.
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className={lbl} style={lblStyle}>Full Name</label>
                <input className={inp} style={inpStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <label className={lbl} style={lblStyle}>Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                  <input type="email" className={inp} style={{ ...inpStyle, paddingLeft: '2.25rem' }} value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                </div>
              </div>
              <div>
                <label className={lbl} style={lblStyle}>Role</label>
                <input className={inp} style={{ ...inpStyle, backgroundColor: '#F8FAFC', color: '#94A3B8' }} value={user?.role ?? ''} readOnly />
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={savingProfile} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Password form */}
          <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF7ED' }}>
                <KeyRound className="w-4 h-4" style={{ color: '#EA580C' }} />
              </div>
              <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>Change Password</h2>
            </div>

            {passwordError && <div className="mb-4 p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{passwordError}</div>}
            {passwordSuccess && (
              <div className="mb-4 p-3.5 rounded-lg text-sm font-medium flex items-center gap-2" style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
                <Check className="w-4 h-4" /> Password changed successfully.
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              {[
                { label: 'Current Password', value: currentPassword, set: setCurrentPassword, show: showCurrentPw, toggle: () => setShowCurrentPw(v => !v) },
                { label: 'New Password', value: newPassword, set: setNewPassword, show: showNewPw, toggle: () => setShowNewPw(v => !v) },
                { label: 'Confirm New Password', value: confirmPassword, set: setConfirmPassword, show: showConfirmPw, toggle: () => setShowConfirmPw(v => !v) },
              ].map(({ label, value, set, show, toggle }) => (
                <div key={label}>
                  <label className={lbl} style={lblStyle}>{label}</label>
                  <div className="relative">
                    <input
                      type={show ? 'text' : 'password'}
                      className={inp}
                      style={{ ...inpStyle, paddingRight: '2.5rem' }}
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }}>
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs" style={{ color: '#94A3B8' }}>Password must be at least 8 characters long.</p>
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword} className="h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#EA580C' }}>
                  {savingPassword ? 'Changing…' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
