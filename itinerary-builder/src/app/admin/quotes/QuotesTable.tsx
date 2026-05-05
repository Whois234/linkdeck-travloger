'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Plus, ExternalLink, Search, Trash2, X } from 'lucide-react';

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

const STATUS_LEFT_BORDER: Record<QuoteStatus, string> = {
  DRAFT: '#CBD5E1', SENT: '#3B82F6', VIEWED: '#8B5CF6',
  APPROVED: '#22C55E', CONFIRMED: '#14B8A6', EXPIRED: '#EF4444',
  CANCELLED: '#DC2626', REVISED: '#F59E0B',
};

const STATUS_TABS = [
  { label: 'All', value: '' }, { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' }, { label: 'Viewed', value: 'VIEWED' },
  { label: 'Approved', value: 'APPROVED' }, { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Expired', value: 'EXPIRED' }, { label: 'Cancelled', value: 'CANCELLED' },
];

export interface QuoteRow {
  id: string; quote_number: string; quote_type: 'GROUP' | 'PRIVATE'; status: QuoteStatus;
  start_date: string; adults: number; public_token: string; created_at: string;
  customer: { id: string; name: string; phone: string };
  assigned_agent?: { name: string } | null;
  state: { name: string; code: string };
  quote_options: Array<{ final_price: number | null; is_most_popular: boolean }>;
  created_by_name?: string | null;
}

const T = '#134956';
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

export function QuotesTable({ quotes, statusFilter, isPrivileged }: { quotes: QuoteRow[]; statusFilter: string; isPrivileged?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [deleting, setDeleting]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const filtered = quotes.filter(q =>
    !search ||
    q.quote_number.toLowerCase().includes(search.toLowerCase()) ||
    q.customer.name.toLowerCase().includes(search.toLowerCase()) ||
    q.customer.phone.includes(search)
  );

  const allChecked  = filtered.length > 0 && filtered.every(q => selected.has(q.id));
  const someChecked = selected.size > 0;

  function setFilter(value: string) {
    startTransition(() => {
      router.push(value ? `/admin/quotes?status=${value}` : '/admin/quotes');
    });
    setSelected(new Set());
    setSearch('');
  }

  function toggleAll() { setSelected(allChecked ? new Set() : new Set(filtered.map(q => q.id))); }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleBulkDelete() {
    setDeleting(true);
    await Promise.all(Array.from(selected).map(id => fetch(`/api/v1/quotes/${id}`, { method: 'DELETE' })));
    setDeleting(false); setShowConfirm(false); setSelected(new Set());
    router.refresh(); // re-runs the server component, re-queries DB
  }

  const loading = isPending;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Quotes"
        subtitle="Manage customer quotes and itinerary proposals"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Quotes' }]}
        action={
          <Link href="/admin/quotes/create"
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: T }}>
            <Plus className="w-4 h-4" /> New Quote
          </Link>
        }
      />

      {/* Status Tabs */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-0.5">
        {STATUS_TABS.map(tab => (
          <button key={tab.value} onClick={() => setFilter(tab.value)}
            className="h-8 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
            style={statusFilter === tab.value
              ? { backgroundColor: T, color: '#FFF' }
              : { backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {someChecked && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl"
          style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <span className="text-sm font-semibold" style={{ color: '#1D4ED8' }}>
            {selected.size} quote{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {showConfirm ? (
              <>
                <span className="text-sm mr-1" style={{ color: '#DC2626' }}>
                  Permanently delete {selected.size} quote{selected.size !== 1 ? 's' : ''}?
                </span>
                <button onClick={handleBulkDelete} disabled={deleting}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#DC2626' }}>
                  <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
                <button onClick={() => setShowConfirm(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#DBEAFE]"
                  style={{ color: '#64748B' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setShowConfirm(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold hover:bg-[#FEE2E2]"
                  style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected
                </button>
                <button onClick={() => setSelected(new Set())}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#DBEAFE]"
                  style={{ color: '#64748B' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', ...cardShadow }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <p className="text-sm font-semibold" style={{ color: '#64748B' }}>
            {loading ? 'Loading…' : `${filtered.length} quote${filtered.length !== 1 ? 's' : ''}`}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by quote #, customer or phone…"
              className="w-72 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
              style={{ borderColor: '#E2E8F0' }} />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No quotes found</p>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>{search ? 'Try a different search' : 'Create your first quote'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th className="px-4 py-3.5 w-10">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll}
                    className="w-4 h-4 rounded" style={{ accentColor: T, cursor: 'pointer' }} />
                </th>
                {['Quote #', 'Customer', 'Destination', 'Type', 'Date', 'Pax', 'Price', 'Status', ...(isPrivileged ? ['Created By', 'Agent'] : []), ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => {
                const popular    = q.quote_options.find(o => o.is_most_popular);
                const price      = popular?.final_price ?? q.quote_options[0]?.final_price;
                const badge      = STATUS_BADGE[q.status] ?? STATUS_BADGE.DRAFT;
                const leftBorder = STATUS_LEFT_BORDER[q.status] ?? '#CBD5E1';
                const isSelected = selected.has(q.id);
                return (
                  <tr key={q.id} className="transition-colors hover:bg-[#F8FAFC]"
                    style={{
                      borderBottom: '1px solid #F1F5F9', height: '56px',
                      borderLeft: `3px solid ${isSelected ? '#3B82F6' : leftBorder}`,
                      backgroundColor: isSelected ? '#EFF6FF' : undefined,
                    }}>
                    <td className="px-4 py-0">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(q.id)}
                        className="w-4 h-4 rounded" style={{ accentColor: T, cursor: 'pointer' }} />
                    </td>
                    <td className="px-5 py-0">
                      <Link href={`/admin/quotes/${q.id}`} className="font-mono text-xs font-bold hover:underline" style={{ color: T }}>{q.quote_number}</Link>
                    </td>
                    <td className="px-5 py-0">
                      <Link href={`/admin/customers/${q.customer.id}`} className="font-semibold hover:underline" style={{ color: '#0F172A' }}>{q.customer.name}</Link>
                      <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{q.customer.phone}</div>
                    </td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{q.state.name}</td>
                    <td className="px-5 py-0">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={q.quote_type === 'PRIVATE' ? { backgroundColor: '#EDE9FE', color: '#6D28D9' } : { backgroundColor: '#FEF3C7', color: '#B45309' }}>
                        {q.quote_type}
                      </span>
                    </td>
                    <td className="px-5 py-0 text-sm whitespace-nowrap" style={{ color: '#64748B' }}>
                      {new Date(q.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{q.adults}</td>
                    <td className="px-5 py-0 font-semibold" style={{ color: T }}>{price ? `₹${price.toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-5 py-0">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={{ backgroundColor: badge.bg, color: badge.text }}>
                        {q.status}
                      </span>
                    </td>
                    {isPrivileged && (
                      <td className="px-5 py-0 text-sm font-medium" style={{ color: '#0F172A' }}>{q.created_by_name ?? '—'}</td>
                    )}
                    {isPrivileged && (
                      <td className="px-5 py-0 text-sm" style={{ color: '#64748B' }}>{q.assigned_agent?.name ?? '—'}</td>
                    )}
                    <td className="px-5 py-0">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/quotes/${q.id}`} className="text-xs font-semibold" style={{ color: T }}>View</Link>
                        <a href={`/quotations/${q.public_token}`} target="_blank" rel="noopener noreferrer"
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]"
                          style={{ color: '#94A3B8' }}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
