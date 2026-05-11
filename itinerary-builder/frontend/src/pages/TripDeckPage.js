import { Fragment, useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Search, ExternalLink, Edit2,
  Trash2, Loader2, Link2, Copy, Check, Eye,
  ShieldCheck, X, Archive, RotateCcw, ArrowUpDown,
  CalendarDays, Filter, ChevronDown, ChevronRight,
  Users, BarChart2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SITE_URL = process.env.REACT_APP_SITE_URL || window.location.origin;

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

function newSchemaField() {
  return { id: Date.now() + Math.random(), label: '', field_type: 'text', required: true, placeholder: '', options: [] };
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Long Text' },
];

function SchemaBuilder({ fields, onChange }) {
  const update = (id, key, val) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [key]: val } : f)));
  const remove = (id) => onChange(fields.filter((f) => f.id !== id));
  const add = () => onChange([...fields, newSchemaField()]);

  return (
    <div className="space-y-3">
      {fields.map((field, idx) => (
        <div key={field.id} className="rounded-xl border p-3 space-y-2 bg-slate-50" style={{ borderColor: '#e5e7eb' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{idx + 1}.</span>
            <Input
              value={field.label}
              onChange={(e) => update(field.id, 'label', e.target.value)}
              placeholder="Field label (e.g. Full Name)"
              className="flex-1 h-8 text-sm rounded-lg border-slate-200"
            />
            <button onClick={() => remove(field.id)} className="p-1 text-slate-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 pl-7">
            <Select value={field.field_type} onValueChange={(v) => update(field.id, 'field_type', v)}>
              <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.field_type === 'select' ? (
              <Input
                value={(field.options || []).join(', ')}
                onChange={(e) =>
                  update(field.id, 'options', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                }
                placeholder="Options: Instagram, Facebook, Google..."
                className="flex-1 h-8 text-xs rounded-lg border-slate-200"
              />
            ) : (
              <Input
                value={field.placeholder || ''}
                onChange={(e) => update(field.id, 'placeholder', e.target.value)}
                placeholder="Placeholder (optional)"
                className="flex-1 h-8 text-xs rounded-lg border-slate-200"
              />
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => update(field.id, 'required', e.target.checked)}
                className="rounded"
              />
              Required
            </label>
          </div>
          {field.field_type === 'select' && (field.options || []).length > 0 && (
            <div className="pl-7">
              <div className="flex flex-wrap gap-1 mt-1">
                {(field.options || []).map((opt, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                    {opt}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Comma-separate the options above</p>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-dashed hover:bg-slate-50 transition-colors"
        style={{ color: 'var(--teal)', borderColor: 'var(--teal)' }}
      >
        <Plus className="w-3.5 h-3.5" /> Add field
      </button>
    </div>
  );
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

export default function TripDeckPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // admins always have full access; regular users need 'edit' permission on tripdeck module
  const canEdit = user?.role === 'admin' || user?.module_access?.tripdeck === 'edit';

  // Gate links
  const [gateLinks, setGateLinks] = useState([]);
  const [gateLinksLoading, setGateLinksLoading] = useState(true);
  const [pdfs, setPdfs] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [dateFilter, setDateFilter] = useState({ preset: 'all', from: '', to: '' });
  const [showArchived, setShowArchived] = useState(false);

  // Inline sessions accordion
  const [expandedLinkId, setExpandedLinkId] = useState(null);
  const [sessionsCache, setSessionsCache] = useState({}); // { [linkId]: { loading, data } }

  // Create dialog
  const [newGateDialogOpen, setNewGateDialogOpen] = useState(false);
  const [newGatePdfId, setNewGatePdfId] = useState('');
  const [newGateSchema, setNewGateSchema] = useState([newSchemaField()]);
  const [creatingGate, setCreatingGate] = useState(false);

  // Edit schema dialog
  const [editSchemaDialog, setEditSchemaDialog] = useState({ open: false, link: null });
  const [editSchema, setEditSchema] = useState([]);
  const [savingSchema, setSavingSchema] = useState(false);

  // Action states
  const [copiedId, setCopiedId] = useState(null);
  const [deletingGateId, setDeletingGateId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  const loadGateData = useCallback(async () => {
    setGateLinksLoading(true);
    try {
      const [gateRes, pdfsRes] = await Promise.all([
        axios.get(`${API}/gate-links`, { withCredentials: true }),
        axios.get(`${API}/pdfs`, { withCredentials: true }),
      ]);
      setGateLinks(Array.isArray(gateRes.data) ? gateRes.data : []);
      const pdfList = pdfsRes.data?.data || pdfsRes.data || [];
      setPdfs(Array.isArray(pdfList) ? pdfList.filter((p) => !p.archived) : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load gate links');
    } finally {
      setGateLinksLoading(false);
    }
  }, []);

  useEffect(() => { loadGateData(); }, [loadGateData]);

  // Toggle inline sessions for a link
  const toggleSessions = async (linkId) => {
    if (expandedLinkId === linkId) {
      setExpandedLinkId(null);
      return;
    }
    setExpandedLinkId(linkId);
    if (sessionsCache[linkId]) return; // already loaded

    setSessionsCache((prev) => ({ ...prev, [linkId]: { loading: true, data: [] } }));
    try {
      const res = await axios.get(`${API}/links/${linkId}/gate-submissions`, { withCredentials: true });
      setSessionsCache((prev) => ({ ...prev, [linkId]: { loading: false, data: Array.isArray(res.data) ? res.data : [] } }));
    } catch {
      setSessionsCache((prev) => ({ ...prev, [linkId]: { loading: false, data: [] } }));
      toast.error('Failed to load sessions');
    }
  };

  const handleCreateGateLink = async (e) => {
    e.preventDefault();
    if (!newGatePdfId) { toast.error('Select a PDF'); return; }
    const validFields = newGateSchema.filter((f) => f.label.trim());
    if (!validFields.length) { toast.error('Add at least one form field'); return; }
    setCreatingGate(true);
    try {
      await axios.post(`${API}/gate-links`, {
        pdf_id: newGatePdfId,
        gate_schema: validFields.map(({ label, field_type, required, placeholder, options }) => ({
          label: label.trim(), field_type, required,
          placeholder: placeholder || '',
          options: field_type === 'select' ? (options || []) : [],
        })),
      }, { withCredentials: true });
      toast.success('Gate link created');
      setNewGateDialogOpen(false);
      setNewGatePdfId('');
      setNewGateSchema([newSchemaField()]);
      await loadGateData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create gate link');
    } finally {
      setCreatingGate(false);
    }
  };

  const handleCopyGateLink = (id) => {
    navigator.clipboard.writeText(`${SITE_URL}/view/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenEditSchema = (link) => {
    setEditSchema(
      (link.gate_schema || []).map((f) => ({ ...f, id: Date.now() + Math.random(), options: f.options || [] }))
    );
    setEditSchemaDialog({ open: true, link });
  };

  const handleSaveSchema = async () => {
    const validFields = editSchema.filter((f) => f.label.trim());
    if (!validFields.length) { toast.error('Add at least one field'); return; }
    setSavingSchema(true);
    try {
      await axios.patch(`${API}/links/${editSchemaDialog.link._id}/gate`, {
        gate_schema: validFields.map(({ label, field_type, required, placeholder, options }) => ({
          label: label.trim(), field_type, required,
          placeholder: placeholder || '',
          options: field_type === 'select' ? (options || []) : [],
        })),
      }, { withCredentials: true });
      toast.success('Form schema saved');
      setEditSchemaDialog({ open: false, link: null });
      await loadGateData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save schema');
    } finally {
      setSavingSchema(false);
    }
  };

  const handleArchiveToggle = async (link) => {
    setArchivingId(link._id);
    try {
      const res = await axios.patch(`${API}/links/${link._id}/archive`, {}, { withCredentials: true });
      const archived = res.data.archived;
      toast.success(archived ? 'Gate link archived' : 'Gate link restored');
      setGateLinks((prev) =>
        prev.map((g) => (g._id === link._id ? { ...g, gate_archived: archived } : g))
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update gate link');
    } finally {
      setArchivingId(null);
    }
  };

  const handleDeleteGateLink = async (link) => {
    if (!window.confirm(`Delete gate link for "${link.pdf_name}"? All submissions will be lost.`)) return;
    setDeletingGateId(link._id);
    try {
      await axios.delete(`${API}/links/${link._id}`, { withCredentials: true });
      toast.success('Gate link deleted');
      setGateLinks((prev) => prev.filter((g) => g._id !== link._id));
      if (expandedLinkId === link._id) setExpandedLinkId(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete gate link');
    } finally {
      setDeletingGateId(null);
    }
  };

  // Filter + sort
  const visibleLinks = (() => {
    let list = gateLinks.filter((g) => !!g.gate_archived === showArchived);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((g) => g.pdf_name.toLowerCase().includes(q));
    }
    list = applyDateFilter(list, 'created_at', dateFilter);
    list = [...list].sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'submissions') return (b.submission_count || 0) - (a.submission_count || 0);
      if (sortBy === 'opens') return (b.open_count || 0) - (a.open_count || 0);
      if (sortBy === 'name_asc') return a.pdf_name.localeCompare(b.pdf_name);
      if (sortBy === 'name_desc') return b.pdf_name.localeCompare(a.pdf_name);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return list;
  })();

  const archivedCount = gateLinks.filter((g) => g.gate_archived).length;
  const activeCount = gateLinks.filter((g) => !g.gate_archived).length;

  return (
    <div className="min-h-screen bg-[var(--off-white)] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" style={{ color: 'var(--gold)' }} />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>Gated PDF Links</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Lead-gated PDF pages — visitors fill a form before accessing the document.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Analytics button */}
            <Button
              variant="outline"
              className="rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => navigate('/tripdeck/analytics')}
            >
              <BarChart2 className="mr-2 h-4 w-4" /> Analytics
            </Button>

            {/* Leads button */}
            <Button
              variant="outline"
              className="rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => navigate('/tripdeck/leads')}
            >
              <Users className="mr-2 h-4 w-4" /> Leads
            </Button>

            {/* New Gate Link — only visible to users with edit access */}
            {canEdit && <Dialog
              open={newGateDialogOpen}
              onOpenChange={(o) => { setNewGateDialogOpen(o); if (!o) { setNewGatePdfId(''); setNewGateSchema([newSchemaField()]); } }}
            >
              <DialogTrigger asChild>
                <Button className="rounded-lg text-white" style={{ backgroundColor: 'var(--teal)' }}>
                  <Link2 className="mr-2 h-4 w-4" /> New Gate Link
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>New Gated PDF Link</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateGateLink} className="space-y-5 pt-2">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Select PDF</Label>
                    <Select value={newGatePdfId} onValueChange={setNewGatePdfId}>
                      <SelectTrigger className="mt-2 rounded-lg border-slate-200">
                        <SelectValue placeholder="Choose a PDF..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pdfs.length === 0 ? (
                          <SelectItem value="_none" disabled>No active PDFs available</SelectItem>
                        ) : (
                          pdfs.map((pdf) => (
                            <SelectItem key={pdf.id} value={pdf.id}>{pdf.file_name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Form Fields</Label>
                    <SchemaBuilder fields={newGateSchema} onChange={setNewGateSchema} />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setNewGateDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={creatingGate || !newGatePdfId} className="text-white" style={{ backgroundColor: 'var(--teal)' }}>
                      {creatingGate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                      Create Gate Link
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>}
          </div>
        </div>

        {/* Filters bar */}
        <div className="bg-white rounded-xl border px-5 py-4 space-y-3" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by PDF name..." className="pl-10 h-9 rounded-lg border-slate-200 text-sm" />
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
                  <SelectItem value="submissions">Most submissions</SelectItem>
                  <SelectItem value="opens">Most opens</SelectItem>
                  <SelectItem value="name_asc">Name A → Z</SelectItem>
                  <SelectItem value="name_desc">Name Z → A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
                showArchived ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              Archived
              {archivedCount > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{archivedCount}</Badge>}
            </button>
          </div>
          <DateFilterBar dateFilter={dateFilter} setDateFilter={setDateFilter} />
        </div>

        {/* Gate Links Table */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: '#f1f5f9' }}>
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">{showArchived ? 'Archived' : 'Active'} gate links</span>
            <Badge variant="outline" className="text-xs">{visibleLinks.length}</Badge>
          </div>

          {gateLinksLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">PDF</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Fields</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Submissions</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Opens</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Created</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLinks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      {searchQuery ? 'No gate links match your search.' : showArchived ? 'No archived gate links.' : 'No gate links yet. Click "New Gate Link" to get started.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleLinks.map((gl) => {
                    const isExpanded = expandedLinkId === gl._id;
                    const sessionState = sessionsCache[gl._id];

                    return (
                      <Fragment key={gl._id}>
                        {/* Main row */}
                        <TableRow className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                          {/* PDF name — click toggles sessions */}
                          <TableCell>
                            <button
                              onClick={() => toggleSessions(gl._id)}
                              className="flex items-center gap-1.5 font-semibold text-sm text-left hover:underline"
                              style={{ color: 'var(--teal)' }}
                              title="Click to view sessions"
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                              {gl.pdf_name}
                            </button>
                            {gl.gate_archived && (
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Archived</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{(gl.gate_schema || []).length}</TableCell>
                          <TableCell>
                            <button
                              onClick={() => navigate(`/tripdeck/responses/${gl._id}`)}
                              className="flex items-center gap-1 text-sm font-semibold hover:underline"
                              style={{ color: (gl.submission_count || 0) > 0 ? 'var(--teal)' : '#94a3b8' }}
                              title="View all responses"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {gl.submission_count || 0}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{gl.open_count || 0}</TableCell>
                          <TableCell className="text-xs text-slate-400">{formatDate(gl.created_at)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => handleCopyGateLink(gl._id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Copy shareable link">
                                {copiedId === gl._id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                              </button>
                              <button onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/view/${gl._id}/pdf`, '_blank')} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Preview PDF">
                                <Eye className="w-4 h-4" />
                              </button>
                              <a href={`${SITE_URL}/view/${gl._id}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Preview gate page">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                              {canEdit && <>
                              <button onClick={() => handleOpenEditSchema(gl)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Edit form fields">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleArchiveToggle(gl)} disabled={archivingId === gl._id} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title={gl.gate_archived ? 'Restore' : 'Archive'}>
                                {archivingId === gl._id ? <Loader2 className="w-4 h-4 animate-spin" /> : gl.gate_archived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                              </button>
                              <button onClick={() => handleDeleteGateLink(gl)} disabled={deletingGateId === gl._id} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600" title="Delete">
                                {deletingGateId === gl._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                              </>}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Inline sessions accordion */}
                        {isExpanded && (
                          <TableRow style={{ borderColor: '#f1f5f9' }}>
                            <TableCell colSpan={6} className="p-0 bg-slate-50 border-b" style={{ borderColor: '#e2e8f0' }}>
                              <div className="px-6 py-4">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Sessions for this PDF
                                  </p>
                                  <button
                                    onClick={() => navigate(`/tripdeck/responses/${gl._id}`)}
                                    className="text-xs font-semibold hover:underline"
                                    style={{ color: 'var(--teal)' }}
                                  >
                                    View all responses →
                                  </button>
                                </div>

                                {sessionState?.loading ? (
                                  <div className="flex items-center justify-center py-6">
                                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                                  </div>
                                ) : !sessionState || sessionState.data.length === 0 ? (
                                  <p className="text-sm text-slate-400 text-center py-4">No submissions yet for this PDF.</p>
                                ) : (
                                  <div className="overflow-x-auto rounded-lg border bg-white" style={{ borderColor: '#e2e8f0' }}>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                                          {(gl.gate_schema || []).map((f) => (
                                            <th key={f.label} className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">{f.label}</th>
                                          ))}
                                          <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Device</th>
                                          <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Location</th>
                                          <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Time</th>
                                          <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Submitted</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sessionState.data.map((s, idx) => (
                                          <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                                            {(gl.gate_schema || []).map((f) => (
                                              <td key={f.label} className="px-3 py-2 text-slate-700 max-w-[160px] truncate">{s.form_data?.[f.label] || '—'}</td>
                                            ))}
                                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{[s.device_type, s.browser].filter(Boolean).join(' · ') || '—'}</td>
                                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{s.location_label || '—'}</td>
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDuration(s.time_spent_seconds)}</td>
                                            <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatDateTime(s.submitted_at)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Edit schema dialog */}
      <Dialog open={editSchemaDialog.open} onOpenChange={(o) => { if (!o) setEditSchemaDialog({ open: false, link: null }); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Form Fields — {editSchemaDialog.link?.pdf_name}</DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-4">
            <SchemaBuilder fields={editSchema} onChange={setEditSchema} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditSchemaDialog({ open: false, link: null })}>Cancel</Button>
              <Button onClick={handleSaveSchema} disabled={savingSchema} className="text-white" style={{ backgroundColor: 'var(--teal)' }}>
                {savingSchema ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Fields
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
