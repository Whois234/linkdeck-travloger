import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Map, Plus, Search, ExternalLink, Edit2, Archive,
  Trash2, Loader2, RotateCcw,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SITE_URL = process.env.REACT_APP_SITE_URL || window.location.origin;

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TripDeckPage() {
  const navigate = useNavigate();
  const [tripdecks, setTripdecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

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

  useEffect(() => { loadData(); }, [loadData]);

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

  const filtered = tripdecks.filter((td) =>
    !searchQuery.trim() ||
    [td.title, td.description].filter(Boolean).some((v) =>
      v.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
  );
  const activeList = filtered.filter((td) => td.status !== 'archived');
  const archivedList = filtered.filter((td) => td.status === 'archived');

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
              {archived
                ? 'No archived TripDecks.'
                : searchQuery
                  ? 'No TripDecks match your search.'
                  : 'No active TripDecks yet. Click "New TripDeck" to get started.'}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((td) => (
            <TableRow key={td._id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
              <TableCell>
                {archived ? (
                  <span className="font-semibold text-slate-500">{td.title || 'Untitled'}</span>
                ) : (
                  <button
                    onClick={() => navigate(`/tripdeck/${td._id}`)}
                    className="font-semibold text-left hover:underline"
                    style={{ color: 'var(--teal)' }}
                  >
                    {td.title || 'Untitled'}
                  </button>
                )}
                {td.description && (
                  <p className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{td.description}</p>
                )}
              </TableCell>
              <TableCell className="text-sm text-slate-600">
                {td.destination_count ?? td.destinations?.length ?? 0}
              </TableCell>
              <TableCell className="text-sm text-slate-600">{td.form_response_count ?? 0}</TableCell>
              <TableCell className="text-sm text-slate-600">{td.total_opens ?? 0}</TableCell>
              <TableCell className="text-xs text-slate-400">{formatDate(td.created_at)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {!archived && (
                    <>
                      <button
                        onClick={() => navigate(`/tripdeck/${td._id}`)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                        title="Open builder"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <a
                        href={`${SITE_URL}/deck/${td.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                        title="View public page"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </>
                  )}
                  <button
                    onClick={() => handleArchiveToggle(td)}
                    disabled={archivingId === td._id}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                    title={archived ? 'Restore' : 'Archive'}
                  >
                    {archivingId === td._id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : archived
                        ? <RotateCcw className="w-4 h-4" />
                        : <Archive className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(td)}
                    disabled={deletingId === td._id}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"
                    title="Delete"
                  >
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

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <Map className="h-5 w-5" style={{ color: 'var(--gold)' }} />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>TripDecks</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Lead-gated multi-destination pages that unlock itinerary PDFs after form submit.
            </p>
          </div>
          <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg text-white" style={{ backgroundColor: 'var(--teal)' }}>
                <Plus className="mr-2 h-4 w-4" /> New TripDeck
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New TripDeck</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Europe Summer Tour"
                    className="mt-2 rounded-lg border-slate-200"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setNewDialogOpen(false); setNewTitle(''); }}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating || !newTitle.trim()}
                    className="text-white"
                    style={{ backgroundColor: 'var(--teal)' }}
                  >
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Create & Open Builder
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search TripDecks..."
            className="pl-10 rounded-lg border-slate-200"
          />
        </div>

        {/* Active */}
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
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <TripDeckTable rows={activeList} archived={false} />
          )}
        </div>

        {/* Archived */}
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

      </div>
    </div>
  );
}
