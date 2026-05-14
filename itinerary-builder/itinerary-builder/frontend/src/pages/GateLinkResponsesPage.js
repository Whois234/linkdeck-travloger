import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Search, Loader2, Download,
  ArrowUpDown, CalendarDays, Eye, ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
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
      <Select
        value={dateFilter.preset}
        onValueChange={(v) => setDateFilter({ preset: v, from: '', to: '' })}
      >
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
          <Input
            type="date"
            value={dateFilter.from}
            onChange={(e) => setDateFilter((p) => ({ ...p, from: e.target.value }))}
            className="h-8 text-xs rounded-lg border-slate-200 w-36"
          />
          <span className="text-xs text-slate-400">to</span>
          <Input
            type="date"
            value={dateFilter.to}
            onChange={(e) => setDateFilter((p) => ({ ...p, to: e.target.value }))}
            className="h-8 text-xs rounded-lg border-slate-200 w-36"
          />
        </>
      )}
    </div>
  );
}

function exportToCSV(submissions, schema, pdfName) {
  const formKeys = schema.map((f) => f.label);
  const headers = [...formKeys, 'Device', 'Browser', 'OS', 'Location', 'Time Spent', 'Submitted At'];
  const rows = submissions.map((s) => [
    ...formKeys.map((k) => s.form_data?.[k] || ''),
    s.device_type || '',
    s.browser || '',
    s.os || '',
    s.location_label || '',
    s.time_spent_seconds ? `${s.time_spent_seconds}s` : '',
    s.submitted_at ? new Date(s.submitted_at).toISOString() : '',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `responses-${pdfName.replace(/[^a-z0-9]/gi, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GateLinkResponsesPage() {
  const { linkId } = useParams();

  const [gateLink, setGateLink] = useState(null);
  const [linkLoading, setLinkLoading] = useState(true);

  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [dateFilter, setDateFilter] = useState({ preset: 'all', from: '', to: '' });

  const loadData = useCallback(async () => {
    setLinkLoading(true);
    setSubmissionsLoading(true);
    try {
      const [linkRes, subRes] = await Promise.all([
        axios.get(`${API}/gate-links/${linkId}`, { withCredentials: true }),
        axios.get(`${API}/links/${linkId}/gate-submissions`, { withCredentials: true }),
      ]);
      setGateLink(linkRes.data);
      setSubmissions(Array.isArray(subRes.data) ? subRes.data : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load responses');
    } finally {
      setLinkLoading(false);
      setSubmissionsLoading(false);
    }
  }, [linkId]);

  useEffect(() => { loadData(); }, [loadData]);

  const schema = gateLink?.gate_schema || [];
  const formKeys = schema.map((f) => f.label);

  // Filter + sort submissions
  const visibleSubmissions = (() => {
    let list = [...submissions];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) =>
        formKeys.some((k) => (s.form_data?.[k] || '').toLowerCase().includes(q)) ||
        (s.location_label || '').toLowerCase().includes(q) ||
        (s.device_type || '').toLowerCase().includes(q)
      );
    }

    list = applyDateFilter(list, 'submitted_at', dateFilter);

    list = list.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.submitted_at) - new Date(b.submitted_at);
      if (sortBy === 'time_high') return (b.time_spent_seconds || 0) - (a.time_spent_seconds || 0);
      if (sortBy === 'time_low') return (a.time_spent_seconds || 0) - (b.time_spent_seconds || 0);
      return new Date(b.submitted_at) - new Date(a.submitted_at); // newest
    });

    return list;
  })();

  if (linkLoading) {
    return (
      <div className="min-h-screen bg-[var(--off-white)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--off-white)] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Link to="/tripdeck" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Back to Gate Links
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: 'var(--gold)' }} />
              <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--teal)' }}>
                {gateLink?.pdf_name || 'Responses'}
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Form responses — created {formatDate(gateLink?.created_at)}
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> {gateLink?.open_count || 0} opens
              </span>
              <span>·</span>
              <span>{gateLink?.submission_count || 0} total submissions</span>
              <span>·</span>
              <span>{schema.length} form field{schema.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="shrink-0 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={() => exportToCSV(visibleSubmissions, schema, gateLink?.pdf_name || 'responses')}
            disabled={visibleSubmissions.length === 0}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border px-5 py-4 space-y-3" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search submissions..."
                className="pl-10 h-9 rounded-lg border-slate-200 text-sm"
              />
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-9 text-sm rounded-lg border-slate-200 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="time_high">Longest time spent</SelectItem>
                  <SelectItem value="time_low">Shortest time spent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Count badge */}
            <Badge variant="outline" className="h-9 px-3 text-sm font-medium">
              {visibleSubmissions.length} response{visibleSubmissions.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {/* Date filter */}
          <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />
        </div>

        {/* Submissions table */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {submissionsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : visibleSubmissions.length === 0 ? (
            <div className="py-16 text-center">
              <Eye className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {submissions.length === 0
                  ? 'No submissions yet. Share the gate link to start collecting leads.'
                  : 'No submissions match your current filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b" style={{ backgroundColor: '#f8fafc', borderColor: '#f1f5f9' }}>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 whitespace-nowrap">#</TableHead>
                    {formKeys.map((k) => (
                      <TableHead key={k} className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 whitespace-nowrap">{k}</TableHead>
                    ))}
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 whitespace-nowrap">Device</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 whitespace-nowrap">Location</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 whitespace-nowrap">Time Spent</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 whitespace-nowrap">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSubmissions.map((s, idx) => (
                    <TableRow key={s.id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                      <TableCell className="text-xs text-slate-400 font-mono">{idx + 1}</TableCell>
                      {formKeys.map((k) => (
                        <TableCell key={k} className="text-sm text-slate-700 max-w-[200px] truncate" title={s.form_data?.[k]}>
                          {s.form_data?.[k] || <span className="text-slate-300">—</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {[s.device_type, s.browser, s.os].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {s.location_label || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        {formatDuration(s.time_spent_seconds)}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                        {formatDateTime(s.submitted_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
