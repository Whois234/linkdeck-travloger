import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Map, Plus, Search, ExternalLink, Edit2, Archive,
  Trash2, Loader2, RotateCcw, Link2, Copy, Check, Eye,
  ShieldCheck, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SITE_URL = process.env.REACT_APP_SITE_URL || window.location.origin;

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  return { id: Date.now() + Math.random(), label: '', field_type: 'text', required: true, placeholder: '' };
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Long Text' },
];

// ── Schema builder ────────────────────────────────────────────────────────────
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
              <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={field.placeholder || ''}
              onChange={(e) => update(field.id, 'placeholder', e.target.value)}
              placeholder="Placeholder (optional)"
              className="flex-1 h-8 text-xs rounded-lg border-slate-200"
            />
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

// ── Submissions table ─────────────────────────────────────────────────────────
function SubmissionsTable({ submissions, schema }) {
  if (!submissions.length) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">No submissions yet.</p>
    );
  }
  const formKeys = schema.map((f) => f.label);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent" style={{ backgroundColor: '#f8fafc' }}>
            {formKeys.map((k) => (
              <TableHead key={k} className="text-xs font-bold uppercase tracking-wider text-slate-500 h-9 whitespace-nowrap">{k}</TableHead>
            ))}
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-9">Device</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-9">Location</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-9">Time Spent</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-9">Submitted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((s) => (
            <TableRow key={s.id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
              {formKeys.map((k) => (
                <TableCell key={k} className="text-sm text-slate-700 max-w-[180px] truncate">
                  {s.form_data?.[k] || '--'}
                </TableCell>
              ))}
              <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                {[s.device_type, s.browser, s.os].filter(Boolean).join(' · ') || '--'}
              </TableCell>
              <TableCell className="text-xs text-slate-500 whitespace-nowrap">{s.location_label || '--'}</TableCell>
              <TableCell className="text-xs text-slate-600">{formatDuration(s.time_spent_seconds)}</TableCell>
              <TableCell className="text-xs text-slate-400 whitespace-nowrap">{formatDate(s.submitted_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TripDeckPage() {
  const navigate = useNavigate();

  // TripDeck state
  const [tripdecks, setTripdecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  // Gate links state
  const [gateLinks, setGateLinks] = useState([]);
  const [gateLinksLoading, setGateLinksLoading] = useState(true);
  const [pdfs, setPdfs] = useState([]);
  const [gateSearchQuery, setGateSearchQuery] = useState('');

  // Create gate link dialog
  const [newGateDialogOpen, setNewGateDialogOpen] = useState(false);
  const [newGatePdfId, setNewGatePdfId] = useState('');
  const [newGateSchema, setNewGateSchema] = useState([newSchemaField()]);
  const [creatingGate, setCreatingGate] = useState(false);

  // Submissions dialog
  const [submissionsDialog, setSubmissionsDialog] = useState({ open: false, link: null });
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Edit schema dialog
  const [editSchemaDialog, setEditSchemaDialog] = useState({ open: false, link: null });
  const [editSchema, setEditSchema] = useState([]);
  const [savingSchema, setSavingSchema] = useState(false);

  // Copy link feedback
  const [copiedId, setCopiedId] = useState(null);
  const [deletingGateId, setDeletingGateId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/tripdeck`, { withCredentials: true });
      setTripdecks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load TripDecks');
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    loadData();
    loadGateData();
  }, [loadData, loadGateData]);

  // ── TripDeck actions ──────────────────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await axios.post(`${API}/tripdeck`, { title: newTitle.trim(), description: '' }, { withCredentials: true });
      toast.success('TripDeck created');
      setNewDialogOpen(false);
      setNewTitle('');
      navigate(`/tripdeck/${res.data._id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create TripDeck');
    } finally {
      setCreating(false);
    }
  };

  const handleArchiveToggle = async (td) => {
    setArchivingId(td._id);
    const newStatus = td.status === 'archived' ? 'active' : 'archived';
    try {
      await axios.put(`${API}/tripdeck/${td._id}`, { status: newStatus }, { withCredentials: true });
      toast.success(newStatus === 'archived' ? 'TripDeck archived' : 'TripDeck restored');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update TripDeck');
    } finally {
      setArchivingId(null);
    }
  };

  const handleDelete = async (td) => {
    if (!window.confirm(`Delete "${td.title}"? This will remove all destinations and responses and cannot be undone.`)) return;
    setDeletingId(td._id);
    try {
      await axios.delete(`${API}/tripdeck/${td._id}`, { withCredentials: true });
      toast.success('TripDeck deleted');
      setTripdecks((prev) => prev.filter((t) => t._id !== td._id));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete TripDeck');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Gate link actions ─────────────────────────────────────────────────────

  const handleCreateGateLink = async (e) => {
    e.preventDefault();
    if (!newGatePdfId) { toast.error('Select a PDF'); return; }
    const validFields = newGateSchema.filter((f) => f.label.trim());
    if (!validFields.length) { toast.error('Add at least one form field'); return; }
    setCreatingGate(true);
    try {
      await axios.post(`${API}/gate-links`, {
        pdf_id: newGatePdfId,
        gate_schema: validFields.map(({ label, field_type, required, placeholder }) => ({ label: label.trim(), field_type, required, placeholder: placeholder || '' })),
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

  const handleViewSubmissions = async (link) => {
    setSubmissionsDialog({ open: true, link });
    setSubmissionsLoading(true);
    setSubmissions([]);
    try {
      const res = await axios.get(`${API}/links/${link._id}/gate-submissions`, { withCredentials: true });
      setSubmissions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleOpenEditSchema = (link) => {
    setEditSchema(
      (link.gate_schema || []).map((f) => ({ ...f, id: Date.now() + Math.random() }))
    );
    setEditSchemaDialog({ open: true, link });
  };

  const handleSaveSchema = async () => {
    const validFields = editSchema.filter((f) => f.label.trim());
    if (!validFields.length) { toast.error('Add at least one field'); return; }
    setSavingSchema(true);
    try {
      await axios.patch(`${API}/links/${editSchemaDialog.link._id}/gate`, {
        gate_schema: validFields.map(({ label, field_type, required, placeholder }) => ({ label: label.trim(), field_type, required, placeholder: placeholder || '' })),
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

  const handleDeleteGateLink = async (link) => {
    if (!window.confirm(`Delete gate link for "${link.pdf_name}"? All submissions will be lost.`)) return;
    setDeletingGateId(link._id);
    try {
      await axios.delete(`${API}/links/${link._id}`, { withCredentials: true });
      toast.success('Gate link deleted');
      setGateLinks((prev) => prev.filter((g) => g._id !== link._id));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete gate link');
    } finally {
      setDeletingGateId(null);
    }
  };

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = tripdecks.filter((td) =>
    !searchQuery.trim() ||
    [td.title, td.description].filter(Boolean).some((v) =>
      v.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
  );
  const activeList = filtered.filter((td) => td.status !== 'archived');
  const archivedList = filtered.filter((td) => td.status === 'archived');

  const filteredGateLinks = gateLinks.filter((g) =>
    !gateSearchQuery.trim() ||
    g.pdf_name.toLowerCase().includes(gateSearchQuery.trim().toLowerCase())
  );

  // ── TripDeck table ────────────────────────────────────────────────────────

  const TripDeckTable = ({ rows, archived }) => (
    <Table>
      <TableHeader>
        <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Title</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Destinations</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Responses</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Opens</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Created</TableHead>
          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
              {archived ? 'No archived TripDecks.' : searchQuery ? 'No TripDecks match your search.' : 'No active TripDecks yet. Click "New TripDeck" to get started.'}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((td) => (
            <TableRow key={td._id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
              <TableCell>
                {archived ? (
                  <span className="font-semibold text-slate-500">{td.title || 'Untitled'}</span>
                ) : (
                  <button onClick={() => navigate(`/tripdeck/${td._id}`)} className="font-semibold text-left hover:underline" style={{ color: 'var(--teal)' }}>
                    {td.title || 'Untitled'}
                  </button>
                )}
                {td.description && <p className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{td.description}</p>}
              </TableCell>
              <TableCell className="text-sm text-slate-600">{td.destination_count ?? td.destinations?.length ?? 0}</TableCell>
              <TableCell className="text-sm text-slate-600">{td.form_response_count ?? 0}</TableCell>
              <TableCell className="text-sm text-slate-600">{td.total_opens ?? 0}</TableCell>
              <TableCell className="text-xs text-slate-400">{formatDate(td.created_at)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {!archived && (
                    <>
                      <button onClick={() => navigate(`/tripdeck/${td._id}`)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Open builder"><Edit2 className="w-4 h-4" /></button>
                      <a href={`${SITE_URL}/deck/${td.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="View public page"><ExternalLink className="w-4 h-4" /></a>
                    </>
                  )}
                  <button onClick={() => handleArchiveToggle(td)} disabled={archivingId === td._id} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title={archived ? 'Restore' : 'Archive'}>
                    {archivingId === td._id ? <Loader2 className="w-4 h-4 animate-spin" /> : archived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleDelete(td)} disabled={deletingId === td._id} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600" title="Delete">
                    {deletingId === td._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="min-h-screen bg-[var(--off-white)] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <Map className="h-5 w-5" style={{ color: 'var(--gold)' }} />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>TripDecks</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">Lead-gated multi-destination pages that unlock itinerary PDFs after form submit.</p>
          </div>
          <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg text-white" style={{ backgroundColor: 'var(--teal)' }}>
                <Plus className="mr-2 h-4 w-4" /> New TripDeck
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New TripDeck</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</Label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Europe Summer Tour" className="mt-2 rounded-lg border-slate-200" autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setNewDialogOpen(false); setNewTitle(''); }}>Cancel</Button>
                  <Button type="submit" disabled={creating || !newTitle.trim()} className="text-white" style={{ backgroundColor: 'var(--teal)' }}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Create & Open Builder
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Search ── */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search TripDecks..." className="pl-10 rounded-lg border-slate-200" />
        </div>

        {/* ── Active TripDecks ── */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <div>
                <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Active TripDecks</h3>
                <p className="text-sm text-slate-500 mt-1">Live pages currently accepting lead submissions.</p>
              </div>
            </div>
          </div>
          {loading ? <div className="flex items-center justify-center py-14"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : <TripDeckTable rows={activeList} archived={false} />}
        </div>

        {/* ── Archived TripDecks ── */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <div>
                <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Archived TripDecks</h3>
                <p className="text-sm text-slate-500 mt-1">Paused or retired pages — restore to make them live again.</p>
              </div>
            </div>
          </div>
          <TripDeckTable rows={archivedList} archived={true} />
        </div>

        {/* ── Gate Links section ── */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ borderColor: '#f1f5f9' }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <div>
                <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Gated PDF Links</h3>
                <p className="text-sm text-slate-500 mt-1">PDF links with a lead capture form — visitors fill the form before accessing the document.</p>
              </div>
            </div>
            <Dialog open={newGateDialogOpen} onOpenChange={(o) => { setNewGateDialogOpen(o); if (!o) { setNewGatePdfId(''); setNewGateSchema([newSchemaField()]); } }}>
              <DialogTrigger asChild>
                <Button className="shrink-0 rounded-lg text-white text-sm" style={{ backgroundColor: 'var(--teal)' }}>
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
            </Dialog>
          </div>

          {/* Gate link search */}
          <div className="px-5 py-3 border-b" style={{ borderColor: '#f1f5f9' }}>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={gateSearchQuery} onChange={(e) => setGateSearchQuery(e.target.value)} placeholder="Search gate links..." className="pl-10 h-9 rounded-lg border-slate-200 text-sm" />
            </div>
          </div>

          {gateLinksLoading ? (
            <div className="flex items-center justify-center py-14"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
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
                {filteredGateLinks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
                      {gateSearchQuery ? 'No gate links match your search.' : 'No gate links yet. Click "New Gate Link" to get started.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGateLinks.map((gl) => (
                    <TableRow key={gl._id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                      <TableCell className="font-semibold text-sm" style={{ color: 'var(--teal)' }}>{gl.pdf_name}</TableCell>
                      <TableCell className="text-sm text-slate-600">{(gl.gate_schema || []).length}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleViewSubmissions(gl)}
                          className="flex items-center gap-1 text-sm font-semibold hover:underline"
                          style={{ color: (gl.submission_count || 0) > 0 ? 'var(--teal)' : '#94a3b8' }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {gl.submission_count || 0}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{gl.open_count || 0}</TableCell>
                      <TableCell className="text-xs text-slate-400">{formatDate(gl.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleCopyGateLink(gl._id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Copy shareable link">
                            {copiedId === gl._id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <a href={`${SITE_URL}/view/${gl._id}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Preview gate">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <button onClick={() => handleOpenEditSchema(gl)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Edit form fields">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteGateLink(gl)} disabled={deletingGateId === gl._id} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600" title="Delete">
                            {deletingGateId === gl._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ── Submissions dialog ── */}
      <Dialog open={submissionsDialog.open} onOpenChange={(o) => { if (!o) setSubmissionsDialog({ open: false, link: null }); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Submissions — {submissionsDialog.link?.pdf_name}
            </DialogTitle>
          </DialogHeader>
          {submissionsLoading ? (
            <div className="flex items-center justify-center py-14"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : (
            <SubmissionsTable
              submissions={submissions}
              schema={submissionsDialog.link?.gate_schema || []}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit schema dialog ── */}
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
