'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { ArrowLeft, Calendar, Users, MapPin, Phone, Mail, Clock, Edit2, Check, X, ExternalLink } from 'lucide-react';

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: '#F1F5F9', text: '#475569' },
  SENT:      { bg: '#DBEAFE', text: '#1D4ED8' },
  VIEWED:    { bg: '#EDE9FE', text: '#6D28D9' },
  APPROVED:  { bg: '#DCFCE7', text: '#15803D' },
  CONFIRMED: { bg: '#CCFBF1', text: '#0F766E' },
  EXPIRED:   { bg: '#FEF2F2', text: '#DC2626' },
  CANCELLED: { bg: '#FEE2E2', text: '#B91C1C' },
  REVISED:   { bg: '#FEF3C7', text: '#B45309' },
};
const ALL_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'APPROVED', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'REVISED'];
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1';
const lblStyle = { color: '#94A3B8' };

interface Quote {
  id: string; quote_number: string; quote_type: string; status: string;
  start_date: string; end_date: string; duration_days: number; duration_nights: number;
  adults: number; children_5_12: number; children_below_5: number; infants: number;
  pickup_point: string | null; drop_point: string | null; expiry_date: string | null;
  created_at: string; public_token: string;
  customer: { id: string; name: string; phone: string; email?: string | null };
  state: { name: string; code: string };
  assigned_agent?: { id: string; name: string; role: string } | null;
  quote_options: Array<{ id: string; option_name: string; final_price: number | null; is_most_popular: boolean; display_order: number }>;
  day_snapshots: Array<{ id: string; day_number: number; title: string | null }>;
}

export default function QuoteDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/v1/quotes/${id}`);
    const data = await res.json();
    if (data.success) { setQuote(data.data); setNewStatus(data.data.status); }
    else setError('Quote not found');
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  async function saveStatus() {
    if (!quote || newStatus === quote.status) { setEditingStatus(false); return; }
    setSavingStatus(true);
    await fetch(`/api/v1/quotes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    setSavingStatus(false); setEditingStatus(false); load();
  }

  if (loading) return <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>;
  if (error || !quote) return (
    <div className="py-16 text-center">
      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>Quote not found</p>
      <Link href="/admin/quotes" className="text-sm mt-2 inline-block" style={{ color: '#134956' }}>← Back to Quotes</Link>
    </div>
  );

  const totalPax = quote.adults + (quote.children_5_12 ?? 0) + (quote.children_below_5 ?? 0) + (quote.infants ?? 0);
  const badge = STATUS_BADGE[quote.status] ?? STATUS_BADGE.DRAFT;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title={quote.quote_number}
        subtitle={`${quote.state.name} · ${quote.duration_nights}N/${quote.duration_days}D · ${totalPax} pax`}
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Quotes', href: '/admin/quotes' }, { label: quote.quote_number }]}
        action={
          <div className="flex items-center gap-2">
            <a href={`/itinerary/${quote.public_token}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F1F5F9]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <ExternalLink className="w-4 h-4" /> Preview
            </a>
            <Link href="/admin/quotes" className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          {/* Status bar */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>{quote.status}</span>
              <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={quote.quote_type === 'PRIVATE' ? { backgroundColor: '#EDE9FE', color: '#6D28D9' } : { backgroundColor: '#FEF3C7', color: '#B45309' }}>{quote.quote_type}</span>
              <span className="text-xs ml-auto" style={{ color: '#94A3B8' }}>Created {new Date(quote.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {editingStatus ? (
                <div className="flex items-center gap-2">
                  <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="h-8 px-3 rounded-lg border text-xs focus:outline-none appearance-none" style={{ borderColor: '#E2E8F0' }}>
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={saveStatus} disabled={savingStatus} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingStatus(false)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#64748B' }}><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button onClick={() => setEditingStatus(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  <Edit2 className="w-3 h-3" /> Change Status
                </button>
              )}
            </div>
          </div>

          {/* Trip Details */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Trip Details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <div>
                <p className={lbl} style={lblStyle}>Destination</p>
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><MapPin className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{quote.state.name}</p>
              </div>
              <div>
                <p className={lbl} style={lblStyle}>Start Date</p>
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Calendar className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{new Date(quote.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <div>
                <p className={lbl} style={lblStyle}>End Date</p>
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Calendar className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{new Date(quote.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <div>
                <p className={lbl} style={lblStyle}>Duration</p>
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Clock className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{quote.duration_nights}N / {quote.duration_days}D</p>
              </div>
              <div>
                <p className={lbl} style={lblStyle}>Passengers</p>
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Users className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{totalPax} pax</p>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{quote.adults}A{quote.children_5_12 ? ` · ${quote.children_5_12}C(5-12)` : ''}{quote.children_below_5 ? ` · ${quote.children_below_5}C(<5)` : ''}{quote.infants ? ` · ${quote.infants}inf` : ''}</p>
              </div>
              {(quote.pickup_point || quote.drop_point) && (
                <div>
                  <p className={lbl} style={lblStyle}>Pickup / Drop</p>
                  <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{quote.pickup_point ?? '—'} → {quote.drop_point ?? '—'}</p>
                </div>
              )}
              {quote.expiry_date && (
                <div>
                  <p className={lbl} style={lblStyle}>Expires</p>
                  <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>{new Date(quote.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              )}
            </div>
          </div>

          {/* Quote Options */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Quote Options</h2>
            {quote.quote_options.length === 0 ? (
              <p className="text-sm" style={{ color: '#94A3B8' }}>No options added yet.</p>
            ) : (
              <div className="space-y-3">
                {quote.quote_options.map(opt => (
                  <div key={opt.id} className="flex items-center justify-between p-4 rounded-lg" style={opt.is_most_popular ? { backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' } : { backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{opt.option_name}</p>
                      {opt.is_most_popular && <span className="text-xs font-semibold" style={{ color: '#15803D' }}>★ Most Popular</span>}
                    </div>
                    <p className="text-lg font-bold" style={{ color: '#134956' }}>{opt.final_price != null ? `₹${opt.final_price.toLocaleString('en-IN')}` : 'TBD'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Day Snapshots */}
          {quote.day_snapshots.length > 0 && (
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Itinerary <span className="font-normal" style={{ color: '#94A3B8' }}>({quote.day_snapshots.length} days)</span></h2>
              <div className="space-y-2">
                {quote.day_snapshots.map(day => (
                  <div key={day.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: '#134956' }}>D{day.day_number}</span>
                    <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{day.title ?? `Day ${day.day_number}`}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Customer */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Customer</h2>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                {quote.customer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{quote.customer.name}</p>
                <p className="text-xs flex items-center gap-1.5 mt-1" style={{ color: '#64748B' }}><Phone className="w-3 h-3" />{quote.customer.phone}</p>
                {quote.customer.email && <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: '#64748B' }}><Mail className="w-3 h-3" />{quote.customer.email}</p>}
              </div>
            </div>
          </div>

          {/* Agent */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Assigned Agent</h2>
            {quote.assigned_agent ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#64748B' }}>
                  {quote.assigned_agent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{quote.assigned_agent.name}</p>
                  <p className="text-xs" style={{ color: '#64748B' }}>{quote.assigned_agent.role}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: '#94A3B8' }}>Unassigned</p>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <h2 className="text-sm font-bold mb-3" style={{ color: '#0F172A' }}>Actions</h2>
            <div className="space-y-2">
              <button onClick={() => router.push('/admin/quotes')} className="w-full h-9 rounded-lg text-sm font-semibold text-left px-3 transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                ← All quotes
              </button>
              <Link href="/admin/quotes/create" className="flex w-full h-9 items-center rounded-lg text-sm font-semibold px-3 transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                + New quote
              </Link>
              <a href={`/itinerary/${quote.public_token}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 w-full h-9 rounded-lg text-sm font-semibold px-3 transition-colors hover:opacity-90" style={{ backgroundColor: '#134956', color: '#FFFFFF' }}>
                <ExternalLink className="w-3.5 h-3.5" /> View customer preview
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
