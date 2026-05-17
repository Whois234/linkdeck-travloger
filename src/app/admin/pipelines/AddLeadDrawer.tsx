'use client';
import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import PhoneInput, { combinePhone } from '@/components/PhoneInput';

type UserOption = { id: string; name: string; role: string };

export default function AddLeadDrawer({
  pipelineId, users = [], onClose, onCreated,
}: {
  pipelineId: string;
  users?: UserOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', destination_interest: '', travel_month: '', budget_range: '' });
  const [phoneCode, setPhoneCode]     = useState('+91');
  const [phoneLocal, setPhoneLocal]   = useState('');
  const [assignedTo, setAssignedTo]   = useState('');   // user ID
  const [currentUserId, setCurrentUserId] = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // Fetch the current user so we can default "Assign To" to self
  useEffect(() => {
    fetch('/api/v1/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.id) {
          setCurrentUserId(d.data.id);
          setAssignedTo(d.data.id);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullPhone = combinePhone(phoneCode, phoneLocal);
    if (!form.name.trim() || !phoneLocal.trim()) { setError('Name and phone are required'); return; }
    if (!assignedTo) { setError('Please assign this lead to a team member'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/v1/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, phone: fullPhone, pipeline_id: pipelineId, assigned_agent_id: assignedTo }),
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
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Phone *</label>
            <PhoneInput
              code={phoneCode} local={phoneLocal}
              onCodeChange={setPhoneCode} onLocalChange={setPhoneLocal}
            />
          </div>
          {field('Email', 'email', 'email', 'email@example.com')}

          {/* Assign To — required, never blank */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
              Assign To <span style={{ color: '#EF4444' }}>*</span>
            </label>
            {users.length > 0 ? (
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                required
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none transition-all appearance-none"
                style={{ border: '1px solid #D1D5DB', color: assignedTo ? '#111827' : '#9CA3AF', backgroundColor: '#fff' }}
                onFocus={e => (e.target.style.borderColor = '#134956')}
                onBlur={e => (e.target.style.borderColor = '#D1D5DB')}
              >
                <option value="" disabled>Select team member…</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.id === currentUserId ? ' (me)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              /* users not loaded yet — show a placeholder */
              <div className="w-full text-sm rounded-lg px-3 py-2.5 animate-pulse" style={{ border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', color: '#9CA3AF' }}>
                Loading team members…
              </div>
            )}
          </div>

          {field('Source', 'source', 'text', 'Facebook, Referral, Walk-in...')}
          {field('Destination Interest', 'destination_interest', 'text', 'Goa, Manali, Maldives...')}
          {field('Travel Month', 'travel_month', 'text', 'Jan 2026, Dec 2025...')}
          {field('Budget Range', 'budget_range', 'text', '₹50,000 – ₹1,00,000')}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
        <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={e => handleSubmit(e as unknown as React.FormEvent)} disabled={saving || !assignedTo}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: '#134956' }}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating...' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
