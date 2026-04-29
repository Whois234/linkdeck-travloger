'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/PageHeader';
import { ArrowLeft, Phone, Mail, MapPin, Globe, User, Calendar, ExternalLink, Package } from 'lucide-react';

const T = '#134956';
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'APPROVED' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'REVISED';
const STATUS_BADGE: Record<QuoteStatus, { bg: string; text: string }> = {
  DRAFT:     { bg: '#F1F5F9', text: '#475569' },
  SENT:      { bg: '#DBEAFE', text: '#1D4ED8' },
  VIEWED:    { bg: '#EDE9FE', text: '#6D28D9' },
  APPROVED:  { bg: '#DCFCE7', text: '#15803D' },
  CONFIRMED: { bg: '#CCFBF1', text: '#0F766E' },
  EXPIRED:   { bg: '#FEF2F2', text: '#DC2626' },
  CANCELLED: { bg: '#FEE2E2', text: '#B91C1C' },
  REVISED:   { bg: '#FEF3C7', text: '#B45309' },
};
const STATUS_LEFT: Record<QuoteStatus, string> = {
  DRAFT: '#CBD5E1', SENT: '#3B82F6', VIEWED: '#8B5CF6',
  APPROVED: '#22C55E', CONFIRMED: '#14B8A6', EXPIRED: '#EF4444',
  CANCELLED: '#DC2626', REVISED: '#F59E0B',
};

interface Customer {
  id: string; name: string; phone: string; email?: string | null; city?: string | null;
  nationality?: string | null; status: boolean; created_at: string; notes?: string | null;
}

interface Quote {
  id: string; quote_number: string; quote_type: 'GROUP' | 'PRIVATE'; status: QuoteStatus;
  start_date: string; adults: number; public_token: string; duration_nights: number; duration_days: number;
  state: { name: string };
  assigned_agent?: { name: string } | null;
  quote_options: Array<{ final_price: number; is_most_popular: boolean }>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quotes, setQuotes]     = useState<Quote[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    async function load() {
      const res  = await fetch(`/api/v1/customers/${params.id}`);
      const data = await res.json();
      if (!res.ok || !data.success) { setError('Customer not found'); setLoading(false); return; }
      setCustomer(data.data.customer);
      setQuotes(data.data.quotes);
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (loading) return <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>;
  if (error || !customer) return (
    <div className="py-16 text-center">
      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>Customer not found</p>
      <Link href="/admin/customers" className="text-sm mt-2 inline-block" style={{ color: T }}>← Back to Customers</Link>
    </div>
  );

  const confirmedQuotes = quotes.filter(q => q.status === 'CONFIRMED');
  const totalRevenue    = confirmedQuotes.reduce((sum, q) => {
    const popular = q.quote_options.find(o => o.is_most_popular) ?? q.quote_options[0];
    return sum + (popular?.final_price ?? 0);
  }, 0);
  const quotesSent      = quotes.filter(q => !['DRAFT', 'CANCELLED'].includes(q.status)).length;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title={customer.name}
        subtitle={`${customer.phone}${customer.city ? ` · ${customer.city}` : ''}`}
        crumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Customers', href: '/admin/customers' },
          { label: customer.name },
        ]}
        action={
          <Link href="/admin/customers"
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Customer profile */}
        <div className="space-y-4">

          {/* Avatar + name card */}
          <div className="bg-white rounded-xl border p-5 text-center" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3" style={{ backgroundColor: T }}>
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>{customer.name}</h2>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold mt-1.5"
              style={customer.status ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#475569' }}>
              {customer.status ? 'Active' : 'Inactive'}
            </span>
            <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>Customer since {fmtDate(customer.created_at)}</p>
          </div>

          {/* Contact details */}
          <div className="bg-white rounded-xl border p-5 space-y-3" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>Contact Details</h3>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0F9FF' }}>
                <Phone className="w-3.5 h-3.5" style={{ color: '#0369A1' }} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Phone</p>
                <p className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>{customer.phone}</p>
              </div>
            </div>
            {customer.email && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0FDF4' }}>
                  <Mail className="w-3.5 h-3.5" style={{ color: '#15803D' }} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Email</p>
                  <p className="text-sm" style={{ color: '#0F172A' }}>{customer.email}</p>
                </div>
              </div>
            )}
            {customer.city && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FFF7ED' }}>
                  <MapPin className="w-3.5 h-3.5" style={{ color: '#C2410C' }} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>City</p>
                  <p className="text-sm" style={{ color: '#0F172A' }}>{customer.city}</p>
                </div>
              </div>
            )}
            {customer.nationality && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F5F3FF' }}>
                  <Globe className="w-3.5 h-3.5" style={{ color: '#6D28D9' }} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Nationality</p>
                  <p className="text-sm" style={{ color: '#0F172A' }}>{customer.nationality}</p>
                </div>
              </div>
            )}
            {customer.notes && (
              <div className="flex items-start gap-3 pt-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: '#F8FAFC' }}>
                  <User className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>Notes</p>
                  <p className="text-sm" style={{ color: '#475569' }}>{customer.notes}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Quotes', value: quotes.length, bg: '#EFF6FF', text: '#1D4ED8' },
              { label: 'Sent', value: quotesSent, bg: '#F0FDF4', text: '#15803D' },
              { label: 'Confirmed', value: confirmedQuotes.length, bg: '#CCFBF1', text: '#0F766E' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: s.bg }}>
                <p className="text-xl font-bold" style={{ color: s.text }}>{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: s.text }}>{s.label}</p>
              </div>
            ))}
          </div>

          {totalRevenue > 0 && (
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Total Revenue (Confirmed)</p>
              <p className="text-2xl font-bold mt-1" style={{ color: T }}>₹{totalRevenue.toLocaleString('en-IN')}</p>
            </div>
          )}
        </div>

        {/* Right: Quotes list */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" style={{ color: T }} />
                <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>All Quotes</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{quotes.length}</span>
              </div>
              <Link href={`/admin/quotes/create`}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: T }}>
                + New Quote
              </Link>
            </div>

            {quotes.length === 0
              ? <div className="py-16 text-center">
                  <Package className="w-8 h-8 mx-auto mb-3" style={{ color: '#E2E8F0' }} />
                  <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No quotes yet</p>
                  <p className="text-sm mt-1" style={{ color: '#64748B' }}>Create a quote for this customer</p>
                </div>
              : <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      {['Quote #', 'Destination', 'Type', 'Date', 'Nights', 'Pax', 'Price', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map(q => {
                      const popular    = q.quote_options.find(o => o.is_most_popular) ?? q.quote_options[0];
                      const price      = popular?.final_price;
                      const badge      = STATUS_BADGE[q.status] ?? STATUS_BADGE.DRAFT;
                      const leftBorder = STATUS_LEFT[q.status] ?? '#CBD5E1';
                      return (
                        <tr key={q.id} className="transition-colors hover:bg-[#F8FAFC]"
                          style={{ borderBottom: '1px solid #F1F5F9', height: '52px', borderLeft: `3px solid ${leftBorder}` }}>
                          <td className="px-4 py-0">
                            <Link href={`/admin/quotes/${q.id}`} className="font-mono text-xs font-bold hover:underline" style={{ color: T }}>{q.quote_number}</Link>
                          </td>
                          <td className="px-4 py-0 text-sm font-medium" style={{ color: '#0F172A' }}>{q.state.name}</td>
                          <td className="px-4 py-0">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold"
                              style={q.quote_type === 'PRIVATE' ? { backgroundColor: '#EDE9FE', color: '#6D28D9' } : { backgroundColor: '#FEF3C7', color: '#B45309' }}>
                              {q.quote_type}
                            </span>
                          </td>
                          <td className="px-4 py-0 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>
                            {fmtDate(q.start_date)}
                          </td>
                          <td className="px-4 py-0 text-sm text-center" style={{ color: '#64748B' }}>{q.duration_nights}N</td>
                          <td className="px-4 py-0 text-sm text-center" style={{ color: '#64748B' }}>{q.adults}</td>
                          <td className="px-4 py-0 font-semibold text-sm" style={{ color: T }}>
                            {price ? `₹${price.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-4 py-0">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold"
                              style={{ backgroundColor: badge.bg, color: badge.text }}>
                              {q.status}
                            </span>
                          </td>
                          <td className="px-4 py-0">
                            <div className="flex items-center justify-end gap-1.5">
                              <Link href={`/admin/quotes/${q.id}`} className="text-xs font-semibold" style={{ color: T }}>View</Link>
                              <a href={`/quotations/${q.public_token}`} target="_blank" rel="noopener noreferrer"
                                className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[#F1F5F9]"
                                style={{ color: '#94A3B8' }}>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
