import { Fragment, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Search, Loader2, Download, Users,
  ArrowUpDown, CalendarDays, ChevronDown, ChevronRight,
  Phone, Mail, FileText, Clock,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(seconds) {
  if (!seconds) return '--';
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function applyDateFilter(items, dateField, dateFilter) {
  if (dateFilter.preset === 'all') return items;
  const now = new Date();
  let from, to;
  if (dateFilter.preset === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = new Date(from.getTime() + 86400000);
  } else if (dateFilter.preset === 'week') {
    from = new Date(now.getTime() - 7 * 86400000);
    to = new Date(now.getTime() + 86400000);
  } else if (dateFilter.preset === 'month') {
    from = new Date(now.getTime() - 30 * 86400000);
    to = new Date(now.getTime() + 86400000);
  } else if (dateFilter.preset === 'custom') {
    from = dateFilter.from ? new Date(dateFilter.from) : null;
    to = dateFilter.to ? new Date(new Date(dateFilter.to).getTime() + 86400000) : null;
  }
  return items.filter((item) => {
    const d = new Date(item[dateField]);
    if (from && d < from) return false;
    if (to && d >= to) return false;
    return true;
  });
}

function DateFilterBar({ dateFilter, setDateFilter }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <CalendarDays className="w-3.5 h-3.5" /> Date
      </div>
      <Select value={dateFilter.preset} onValueChange={(v) => setDateFilter({ preset: v, from: '', to: '' })}>
        <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">Last 7 days</SelectItem>
          <SelectItem value="month">Last 30 days</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {dateFilter.preset === 'custom' && (
        <>
          <Input type="date" value={dateFilter.from} onChange={(e) => setDateFilter((p) => ({ ...p, from: e.target.value }))} className="h-8 text-xs rounded-lg border-slate-200 w-36" />
          <span className="text-xs text-slate-400">to</span>
          <Input type="date" value={dateFilter.to} onChange={(e) => setDateFilter((p) => ({ ...p, to: e.target.value }))} className="h-8 text-xs rounded-lg border-slate-200 w-36" />
        </>
      )}
    </div>
  );
}

function exportLeadsCSV(leads) {
  const headers = ['Name', 'Phone', 'Email', 'Sessions', 'PDFs Accessed', 'First Seen', 'Last Seen'];
  const rows = leads.map((l) => [
    l.name || '',
    l.phone || '',
    l.email || '',
    l.session_count || 0,
    (l.pdfs_accessed || []).join('; '),
    l.first_seen ? new Date(l.first_seen).toISOString() : '',
    l.last_seen ? new Date(l.last_seen).toISOString() : '',
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leads.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [dateFilter, setDateFilter] = useState({ preset: 'all', from: '', to: '' });

  const [expandedKey, setExpandedKey] = useState(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/leads`, { withCredentials: true });
      setLeads(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const visibleLeads = (() => {
    let list = [...leads];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((l) =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.pdfs_accessed || []).some((p) => p.toLowerCase().includes(q))
      );
    }

    list = applyDateFilter(list, 'last_seen', dateFilter);

    list = list.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.first_seen) - new Date(b.first_seen);
      if (sortBy === 'sessions_high') return (b.session_count || 0) - (a.session_count || 0);
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      return new Date(b.last_seen) - new Date(a.last_seen);
    });

    return list;
  })();

  const totalSessions = leads.reduce((sum, l) => sum + (l.session_count || 0), 0);

  return (
    <div className="min-h-screen bg-[var(--off-white)] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Link to="/tripdeck" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Back to Gate Links
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <Users className="h-5 w-5" style={{ color: 'var(--gold)' }} />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>Leads</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              All unique leads collected across your gated PDFs — deduplicated by phone & email.
            </p>
            {!loading && (
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {leads.length} unique lead{leads.length !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{totalSessions} total session{totalSessions !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            className="shrink-0 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={() => exportLeadsCSV(visibleLeads)}
            disabled={visibleLeads.length === 0}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border px-5 py-4 space-y-3" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, phone, email, PDF..." className="pl-10 h-9 rounded-lg border-slate-200 text-sm" />
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-9 text-sm rounded-lg border-slate-200 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="sessions_high">Most sessions</SelectItem>
                  <SelectItem value="name_asc">Name A → Z</SelectItem>
                  <SelectItem value="name_desc">Name Z → A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="h-9 px-3 text-sm font-medium">
              {visibleLeads.length} lead{visibleLeads.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />
        </div>

        {/* Leads table */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : visibleLeads.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {leads.length === 0
                  ? 'No leads yet. Share your gate links to start collecting leads.'
                  : 'No leads match your current filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">#</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">Name</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">Phone</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">Email</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">Sessions</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">PDFs Accessed</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">First Seen</th>
                    <th className="text-left text-xs font-bold uppercase tracking-wider text-slate-500 h-10 px-4">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.map((lead, idx) => {
                    const isExpanded = expandedKey === lead.identity_key;
                    return (
                      <Fragment key={lead.identity_key}>
                        {/* Lead row */}
                        <tr
                          className="border-b hover:bg-slate-50 cursor-pointer"
                          style={{ borderColor: '#f1f5f9' }}
                          onClick={() => setExpandedKey(isExpanded ? null : lead.identity_key)}
                        >
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                              <span className="font-semibold text-sm" style={{ color: 'var(--teal)' }}>
                                {lead.name || 'Unknown'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {lead.phone ? (
                              <div className="flex items-center gap-1 text-sm text-slate-600">
                                <Phone className="w-3 h-3 text-slate-400" /> {lead.phone}
                              </div>
                            ) : <span className="text-slate-300 text-sm">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {lead.email ? (
                              <div className="flex items-center gap-1 text-sm text-slate-600">
                                <Mail className="w-3 h-3 text-slate-400" /> {lead.email}
                              </div>
                            ) : <span className="text-slate-300 text-sm">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className="text-xs font-semibold">
                              {lead.session_count} session{lead.session_count !== 1 ? 's' : ''}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {(lead.pdfs_accessed || []).map((pdf, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 max-w-[140px] truncate" title={pdf}>
                                  <FileText className="w-2.5 h-2.5 shrink-0" />{pdf}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(lead.first_seen)}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(lead.last_seen)}</td>
                        </tr>

                        {/* Expanded sessions for this lead */}
                        {isExpanded && (
                          <tr style={{ borderColor: '#f1f5f9' }}>
                            <td colSpan={8} className="p-0 bg-slate-50 border-b" style={{ borderColor: '#e2e8f0' }}>
                              <div className="px-8 py-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                  All sessions — {lead.session_count} total
                                </p>
                                <div className="space-y-2">
                                  {(lead.sessions || []).map((s, si) => (
                                    <div key={s.id} className="flex items-start gap-4 rounded-lg border bg-white px-4 py-3 text-xs" style={{ borderColor: '#e2e8f0' }}>
                                      <span className="font-bold text-slate-400 w-4 shrink-0">{si + 1}</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 font-semibold text-slate-700 truncate">
                                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                                          {s.pdf_name}
                                        </div>
                                        {/* Form data for this session */}
                                        {s.form_data && Object.keys(s.form_data).length > 0 && (
                                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-slate-500">
                                            {Object.entries(s.form_data).map(([k, v]) => (
                                              v ? <span key={k}><span className="text-slate-400">{k}:</span> {v}</span> : null
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0 text-slate-400">
                                        {[s.device_type, s.browser].filter(Boolean).length > 0 && (
                                          <span>{[s.device_type, s.browser].filter(Boolean).join(' · ')}</span>
                                        )}
                                        {s.location_label && <span>{s.location_label}</span>}
                                        {s.time_spent_seconds > 0 && (
                                          <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />{formatDuration(s.time_spent_seconds)}
                                          </span>
                                        )}
                                        <span className="text-slate-300">{formatDateTime(s.submitted_at)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
