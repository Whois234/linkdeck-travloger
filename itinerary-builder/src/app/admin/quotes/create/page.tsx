'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Plus, Search, Users, MapPin, Calendar, Car } from 'lucide-react';

interface State { id: string; name: string; code: string }
interface Agent { id: string; name: string; role: string }
interface Customer { id: string; name: string; phone: string }
type PassengerFieldKey = 'adults' | 'children_5_12' | 'children_below_5' | 'infants';

const inp = 'w-full h-10 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors';
const inpStyle = { borderColor: '#E2E8F0' };
const sel = 'w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white transition-colors appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const lblStyle = { color: '#64748B' };
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };
const PASSENGER_FIELDS: Array<{ label: string; key: PassengerFieldKey; min: number }> = [
  { label: 'Adults', key: 'adults', min: 1 },
  { label: 'Children (5–12)', key: 'children_5_12', min: 0 },
  { label: 'Children (<5)', key: 'children_below_5', min: 0 },
  { label: 'Infants', key: 'infants', min: 0 },
];

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F0F9FF' }}>
          <Icon className="w-4 h-4" style={{ color: '#134956' }} />
        </div>
        <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function CreateQuotePage() {
  const router = useRouter();
  const [states, setStates] = useState<State[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    quote_type: 'PRIVATE' as 'PRIVATE' | 'GROUP',
    state_id: '',
    start_date: '',
    end_date: '',
    duration_days: 1,
    duration_nights: 0,
    adults: 2,
    children_5_12: 0,
    children_below_5: 0,
    infants: 0,
    pickup_point: '',
    drop_point: '',
    assigned_agent_id: '',
    expiry_date: '',
  });

  useEffect(() => {
    fetch('/api/v1/states').then(r => r.json()).then(d => { if (d.success) setStates(d.data); });
    fetch('/api/v1/agents').then(r => r.json()).then(d => { if (d.success) setAgents(d.data); });
  }, []);

  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2) { setCustomers([]); return; }
    fetch(`/api/v1/customers?q=${encodeURIComponent(customerSearch)}`)
      .then(r => r.json()).then(d => { if (d.success) setCustomers(d.data); });
  }, [customerSearch]);

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const start = new Date(form.start_date);
      const end = new Date(form.end_date);
      const nights = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
      setForm(prev => ({ ...prev, duration_nights: nights, duration_days: nights + 1 }));
    }
  }, [form.start_date, form.end_date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) { setError('Please select a customer'); return; }
    if (!form.state_id) { setError('Please select a state/destination'); return; }
    if (!form.start_date || !form.end_date) { setError('Please select travel dates'); return; }

    setSaving(true); setError('');
    const payload = {
      ...form,
      customer_id: selectedCustomer.id,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
      assigned_agent_id: form.assigned_agent_id || null,
      expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null,
      pickup_point: form.pickup_point || null,
      drop_point: form.drop_point || null,
    };

    const res = await fetch('/api/v1/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Failed to create quote'); setSaving(false); }
    else { router.push(`/admin/quotes/${data.data.id}`); }
  }

  return (
    <div className="max-w-[860px]">
      <PageHeader
        title="New Quote"
        subtitle="Create a new itinerary proposal for a customer"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Quotes', href: '/admin/quotes' }, { label: 'New Quote' }]}
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="p-3.5 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        {/* Trip Type */}
        <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
          <p className={lbl} style={lblStyle}>Trip Type</p>
          <div className="flex gap-3 mt-2">
            {(['PRIVATE', 'GROUP'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setForm(p => ({ ...p, quote_type: type }))}
                className="flex-1 h-12 rounded-lg text-sm font-semibold border-2 transition-all"
                style={form.quote_type === type
                  ? { backgroundColor: '#134956', borderColor: '#134956', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', color: '#64748B' }
                }
              >
                {type === 'PRIVATE' ? '🧳 Customised Private Trip (FIT)' : '🚌 Fixed Group Departure'}
              </button>
            ))}
          </div>
        </div>

        {/* Customer */}
        <SectionCard icon={Users} title="Customer">
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: '#134956' }}>{selectedCustomer.name.charAt(0).toUpperCase()}</div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{selectedCustomer.name}</p>
                  <p className="text-xs font-mono" style={{ color: '#94A3B8' }}>{selectedCustomer.phone}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedCustomer(null)} className="h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F1F5F9]" style={{ color: '#64748B', border: '1px solid #E2E8F0' }}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder="Search customer by name or phone…"
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                  style={{ borderColor: '#E2E8F0' }}
                />
              </div>
              {showCustomerDropdown && customers.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-lg overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {customers.map(c => (
                    <button key={c.id} type="button" className="w-full text-left px-4 py-3 transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9' }}
                      onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); setCustomerSearch(''); }}>
                      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{c.name}</p>
                      <p className="text-xs font-mono" style={{ color: '#94A3B8' }}>{c.phone}</p>
                    </button>
                  ))}
                </div>
              )}
              {customerSearch.length >= 2 && customers.length === 0 && (
                <p className="mt-2 text-xs" style={{ color: '#94A3B8' }}>No customers found. <a href="/admin/customers" target="_blank" className="underline font-medium" style={{ color: '#134956' }}>Add customer first</a>.</p>
              )}
            </div>
          )}
        </SectionCard>

        {/* Destination & Dates */}
        <SectionCard icon={MapPin} title="Destination & Dates">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={lbl} style={lblStyle}>State / Region <span style={{ color: '#EF4444' }}>*</span></label>
              <select value={form.state_id} onChange={e => setForm(p => ({ ...p, state_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">Select state…</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Start Date <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className={inp} style={inpStyle} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>End Date <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className={inp} style={inpStyle} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Duration Nights</label>
              <input type="number" min={0} value={form.duration_nights} onChange={e => setForm(p => ({ ...p, duration_nights: +e.target.value, duration_days: +e.target.value + 1 }))} className={inp} style={inpStyle} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Duration Days</label>
              <input type="number" readOnly value={form.duration_days} className={inp} style={{ ...inpStyle, backgroundColor: '#F8FAFC', color: '#94A3B8' }} />
            </div>
          </div>
        </SectionCard>

        {/* Passengers */}
        <SectionCard icon={Users} title="Passengers">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {PASSENGER_FIELDS.map(({ label, key, min }) => (
              <div key={key}>
                <label className={lbl} style={lblStyle}>{label}</label>
                <input type="number" min={min} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: +e.target.value }))} className={inp} style={inpStyle} />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Logistics */}
        <SectionCard icon={Car} title="Logistics & Assignment">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl} style={lblStyle}>Pickup Point</label>
              <input type="text" placeholder="e.g. Cochin Airport" value={form.pickup_point} onChange={e => setForm(p => ({ ...p, pickup_point: e.target.value }))} className={inp} style={inpStyle} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Drop Point</label>
              <input type="text" placeholder="e.g. Trivandrum Airport" value={form.drop_point} onChange={e => setForm(p => ({ ...p, drop_point: e.target.value }))} className={inp} style={inpStyle} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Assigned Agent</label>
              <select value={form.assigned_agent_id} onChange={e => setForm(p => ({ ...p, assigned_agent_id: e.target.value }))} className={sel} style={inpStyle}>
                <option value="">Unassigned</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Quote Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} className={inp} style={inpStyle} />
            </div>
          </div>
        </SectionCard>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <button type="button" onClick={() => router.push('/admin/quotes')} className="h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#134956' }}>
            <Plus className="w-4 h-4" />
            {saving ? 'Creating…' : 'Create Quote'}
          </button>
        </div>
      </form>
    </div>
  );
}
