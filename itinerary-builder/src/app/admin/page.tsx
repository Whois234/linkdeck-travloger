'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Building2, Layout, CalendarDays, ArrowRight, TrendingUp, Plus } from 'lucide-react';

interface Stats { quotes: number; hotels: number; templates: number; batches: number }
interface RecentQuote {
  id: string; quote_number: string; quote_type: string; status: string;
  customer: { name?: string | null; phone?: string | null } | null;
  state: { name?: string | null } | null;
  quote_options: Array<{ final_price: number | null; is_most_popular: boolean }>;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: '#F1F5F9', text: '#475569' },
  SENT:      { bg: '#DBEAFE', text: '#1D4ED8' },
  VIEWED:    { bg: '#EDE9FE', text: '#6D28D9' },
  APPROVED:  { bg: '#DCFCE7', text: '#15803D' },
  CONFIRMED: { bg: '#CCFBF1', text: '#0F766E' },
  EXPIRED:   { bg: '#FEE2E2', text: '#DC2626' },
  CANCELLED: { bg: '#FEE2E2', text: '#B91C1C' },
  REVISED:   { bg: '#FEF3C7', text: '#B45309' },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ quotes: 0, hotels: 0, templates: 0, batches: 0 });
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState('');
  const [hour] = useState(new Date().getHours());
  const [userName, setUserName] = useState('');

  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  async function fetchJson(path: string, timeoutMs = 12000) {
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
      setTimeout(() => resolve({ success: false, error: 'Request timeout' }), timeoutMs);
    });

    try {
      const responsePromise = (async () => {
        const res = await fetch(path);
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          return { success: false, error: `Invalid response (${res.status})` };
        }
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data?.error ?? `HTTP ${res.status}` };
        }
        return data;
      })();

      return await Promise.race([responsePromise, timeoutPromise]);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/auth/me').then(r => r.json()).then(d => {
      if (!cancelled && d.success) setUserName(d.data.name?.split(' ')[0] ?? '');
    }).catch(() => {});

    async function loadDashboard() {
      if (cancelled) return;
      setLoading(true);
      setLoadWarning('');
      const forceStopTimer = setTimeout(() => {
        if (!cancelled) {
          setLoadWarning('Dashboard is taking longer than expected. Showing partial data.');
          setLoading(false);
        }
      }, 9000);

      const [quotesRes, hotelsRes, templatesRes, batchesRes] = await Promise.allSettled([
        fetchJson('/api/v1/quotes?limit=5'),
        fetchJson('/api/v1/hotels'),
        fetchJson('/api/v1/private-templates'),
        fetchJson('/api/v1/group-batches'),
      ]);
      clearTimeout(forceStopTimer);
      if (cancelled) return;

      const qd = quotesRes.status === 'fulfilled' ? quotesRes.value : null;
      const hd = hotelsRes.status === 'fulfilled' ? hotelsRes.value : null;
      const td = templatesRes.status === 'fulfilled' ? templatesRes.value : null;
      const bd = batchesRes.status === 'fulfilled' ? batchesRes.value : null;

      setStats({
        quotes: qd?.success ? (qd.data?.total ?? 0) : 0,
        hotels: hd?.success ? (hd.data?.length ?? 0) : 0,
        templates: td?.success ? (td.data?.length ?? 0) : 0,
        batches: bd?.success ? (bd.data?.length ?? 0) : 0,
      });
      setRecentQuotes(qd?.success ? (qd.data?.quotes ?? []) : []);

      const failedCount = [quotesRes, hotelsRes, templatesRes, batchesRes].filter(r => r.status === 'rejected').length;
      if (failedCount > 0 || !qd?.success || !hd?.success || !td?.success || !bd?.success) {
        const totalFailed = failedCount + [qd, hd, td, bd].filter(r => r && !r.success).length;
        setLoadWarning(`Some dashboard widgets failed to load (${Math.min(totalFailed, 4)}/4).`);
      }
      setLoading(false);
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, []);

  const STAT_CARDS = [
    { label: 'Total Quotes', value: stats.quotes, icon: FileText, accent: '#134956', iconBg: '#E8F4F6' },
    { label: 'Active Hotels', value: stats.hotels, icon: Building2, accent: '#3B82F6', iconBg: '#EFF6FF' },
    { label: 'Templates', value: stats.templates, icon: Layout, accent: '#10B981', iconBg: '#ECFDF5' },
    { label: 'Group Batches', value: stats.batches, icon: CalendarDays, accent: '#F59E0B', iconBg: '#FFFBEB' },
  ];

  const QUICK_ACTIONS = [
    { label: 'Create Private Quote', desc: 'Build a custom FIT itinerary', href: '/admin/quotes/create', icon: FileText, color: '#134956' },
    { label: 'Add New Hotel', desc: 'Add hotel to inventory', href: '/admin/hotels', icon: Building2, color: '#3B82F6' },
    { label: 'Add Template', desc: 'New private itinerary template', href: '/admin/private-templates', icon: Layout, color: '#10B981' },
    { label: 'Group Batches', desc: 'Manage fixed departures', href: '/admin/group-batches', icon: CalendarDays, color: '#F59E0B' },
  ];

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-7 max-w-[1400px]">

      {/* Welcome Banner */}
      <div
        className="rounded-xl p-7 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #134956 0%, #1a6b82 60%, #0f5a70 100%)',
          boxShadow: '0 4px 24px rgba(19,73,86,0.25)',
        }}
      >
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">{today}</p>
            <h1 className="text-[28px] font-bold text-white leading-tight">
              {greeting}{userName ? `, ${userName}` : ''} 👋
            </h1>
            <p className="mt-2 text-white/70 text-[15px] font-medium">
              Here&apos;s what&apos;s happening with your quotes today.
            </p>
          </div>
          <div className="hidden md:flex items-center justify-center w-24 h-24 rounded-2xl text-5xl opacity-20 text-white font-bold">
            ✈
          </div>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
        <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
      </div>

      {/* Stats Row */}
      {loadWarning && (
        <div className="rounded-lg px-4 py-2.5 text-sm font-medium" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          {loadWarning}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ label, value, icon: Icon, accent, iconBg }) => (
          <div
            key={label}
            className="bg-white rounded-xl p-6 relative overflow-hidden"
            style={{
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
              borderLeft: `3px solid ${accent}`,
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748B' }}>{label}</p>
                <p className="text-[32px] font-bold leading-none" style={{ color: '#0F172A' }}>
                  {loading ? '—' : value.toLocaleString()}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
                <Icon className="w-5 h-5" style={{ color: accent }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              <span className="text-xs font-semibold" style={{ color: '#10B981' }}>Active</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Quick Actions</h2>
            <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Jump to frequently used tasks</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map(({ label, desc, href, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className="bg-white rounded-xl p-5 group flex items-start gap-4 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)')}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${color}15` }}
              >
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight" style={{ color: '#0F172A' }}>{label}</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: '#64748B' }}>{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 transition-transform group-hover:translate-x-1" style={{ color: '#CBD5E1' }} />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Quotes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Recent Quotes</h2>
            <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Latest quote activity</p>
          </div>
          <Link
            href="/admin/quotes"
            className="flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80"
            style={{ color: '#134956' }}
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div
          className="bg-white rounded-xl overflow-hidden"
          style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" />
            </div>
          ) : recentQuotes.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#F1F5F9' }}>
                <FileText className="w-7 h-7" style={{ color: '#94A3B8' }} />
              </div>
              <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No quotes yet</p>
              <p className="text-sm mt-1" style={{ color: '#64748B' }}>Create your first quote to get started</p>
              <Link
                href="/admin/quotes/create"
                className="inline-flex items-center gap-2 mt-4 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: '#134956' }}
              >
                <Plus className="w-4 h-4" /> New Quote
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                  {['Quote #', 'Customer', 'Destination', 'Type', 'Status', 'Date', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentQuotes.map(q => {
                  const s = STATUS_COLORS[q.status] ?? { bg: '#F1F5F9', text: '#475569' };
                  const customerName = q.customer?.name?.trim() || 'Unknown customer';
                  const customerPhone = q.customer?.phone?.trim() || '—';
                  const stateName = q.state?.name?.trim() || '—';
                  return (
                    <tr key={q.id} className="transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9', height: '56px' }}>
                      <td className="px-5 py-0">
                        <span className="text-sm font-bold font-mono" style={{ color: '#134956' }}>{q.quote_number}</span>
                      </td>
                      <td className="px-5 py-0">
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{customerName}</p>
                        <p className="text-xs" style={{ color: '#94A3B8' }}>{customerPhone}</p>
                      </td>
                      <td className="px-5 py-0 text-sm font-medium" style={{ color: '#64748B' }}>{stateName}</td>
                      <td className="px-5 py-0">
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold"
                          style={q.quote_type === 'PRIVATE' ? { backgroundColor: '#EDE9FE', color: '#6D28D9' } : { backgroundColor: '#FEF3C7', color: '#B45309' }}
                        >
                          {q.quote_type}
                        </span>
                      </td>
                      <td className="px-5 py-0">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.text }}>
                          {q.status}
                        </span>
                      </td>
                      <td className="px-5 py-0 text-xs font-medium whitespace-nowrap" style={{ color: '#94A3B8' }}>
                        {new Date(q.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-5 py-0">
                        <Link href={`/admin/quotes/${q.id}`} className="text-xs font-semibold transition-colors hover:opacity-80" style={{ color: '#134956' }}>
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
