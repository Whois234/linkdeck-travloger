'use client';
import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

export default function AddLeadDrawer({
  pipelineId, onClose, onCreated,
}: {
  pipelineId: string; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', destination_interest: '', travel_month: '', budget_range: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setError('Name and phone are required'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/v1/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
          {field('Phone *', 'phone', 'tel', '+91 98765 43210')}
          {field('Email', 'email', 'email', 'email@example.com')}
          {field('Source', 'source', 'text', 'Facebook, Referral, Walk-in...')}
          {field('Destination Interest', 'destination_interest', 'text', 'Goa, Manali, Maldives...')}
          {field('Travel Month', 'travel_month', 'text', 'Jan 2026, Dec 2025...')}
          {field('Budget Range', 'budget_range', 'text', '₹50,000 – ₹1,00,000')}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
        <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button onClick={e => handleSubmit(e as unknown as React.FormEvent)} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#134956' }}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating...' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
