import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Archive, ArrowDown, ArrowUp, ExternalLink, FileText, LayoutGrid, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SITE_URL = process.env.REACT_APP_SITE_URL || window.location.origin;

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
];

const emptyDestination = {
  name: '',
  duration: '',
  hero_image_url: '',
  pdf_id: '',
  form_schema_id: '',
};

const emptyField = (order = 0) => ({
  label: '',
  field_type: 'text',
  placeholder: '',
  optionsText: '',
  is_required: true,
  order,
});

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function normalizeFieldsForApi(fields) {
  return fields.map((field, index) => ({
    label: field.label.trim(),
    field_type: field.field_type,
    placeholder: field.placeholder?.trim() || '',
    options: field.field_type === 'dropdown'
      ? field.optionsText.split('\n').map((item) => item.trim()).filter(Boolean)
      : [],
    is_required: Boolean(field.is_required),
    order: index,
  }));
}

function schemaFieldsToForm(fields = []) {
  return fields.map((field, index) => ({
    label: field.label || '',
    field_type: field.field_type || 'text',
    placeholder: field.placeholder || '',
    optionsText: Array.isArray(field.options) ? field.options.join('\n') : '',
    is_required: field.is_required !== false,
    order: field.order ?? index,
  }));
}

export default function TripDeckBuilderPage() {
  const { tripdeckId } = useParams();
  const [loading, setLoading] = useState(true);
  const [tripdeck, setTripdeck] = useState(null);
  const [pdfs, setPdfs] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [responses, setResponses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState(null);
  const [destinationForm, setDestinationForm] = useState(emptyDestination);
  const [savingDestination, setSavingDestination] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [editingSchema, setEditingSchema] = useState(null);
  const [schemaName, setSchemaName] = useState('');
  const [schemaFields, setSchemaFields] = useState([emptyField(0)]);
  const [savingSchema, setSavingSchema] = useState(false);

  const destinationNameMap = useMemo(
    () => Object.fromEntries((tripdeck?.destinations || []).map((dest) => [dest._id, dest.name])),
    [tripdeck]
  );
  const pdfNameMap = useMemo(
    () => Object.fromEntries((pdfs || []).map((pdf) => [pdf.id, pdf.file_name])),
    [pdfs]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tripdeckRes, pdfsRes, schemasRes, responsesRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/tripdeck/${tripdeckId}`, { withCredentials: true }),
        axios.get(`${API}/pdfs`, { withCredentials: true }),
        axios.get(`${API}/form-schema`, { withCredentials: true }),
        axios.get(`${API}/tripdeck/${tripdeckId}/responses`, { withCredentials: true }),
        axios.get(`${API}/tripdeck/${tripdeckId}/analytics`, { withCredentials: true }),
      ]);
      setTripdeck(tripdeckRes.data);
      setPdfs(pdfsRes.data?.data || pdfsRes.data || []);
      setSchemas(Array.isArray(schemasRes.data) ? schemasRes.data : []);
      setResponses(Array.isArray(responsesRes.data) ? responsesRes.data : []);
      setAnalytics(analyticsRes.data || null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load TripDeck');
    } finally {
      setLoading(false);
    }
  }, [tripdeckId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveMeta = async () => {
    if (!tripdeck?.title?.trim()) {
      toast.error('TripDeck title is required');
      return;
    }
    setSavingMeta(true);
    try {
      const { data } = await axios.put(
        `${API}/tripdeck/${tripdeckId}`,
        {
          title: tripdeck.title.trim(),
          description: tripdeck.description?.trim() || null,
        },
        { withCredentials: true }
      );
      setTripdeck(data);
      toast.success('TripDeck updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update TripDeck');
    } finally {
      setSavingMeta(false);
    }
  };

  const openCreateDestination = () => {
    setEditingDestination(null);
    setDestinationForm({
      ...emptyDestination,
      pdf_id: pdfs[0]?.id || '',
      form_schema_id: schemas[0]?._id || '',
    });
    setDestinationOpen(true);
  };

  const openEditDestination = (destination) => {
    setEditingDestination(destination);
    setDestinationForm({
      name: destination.name || '',
      duration: destination.duration || '',
      hero_image_url: destination.hero_image_url || '',
      pdf_id: destination.pdf_id || '',
      form_schema_id: destination.form_schema_id || '',
    });
    setDestinationOpen(true);
  };

  const handleSaveDestination = async (e) => {
    e.preventDefault();
    if (!destinationForm.name.trim() || !destinationForm.duration.trim() || !destinationForm.pdf_id || !destinationForm.form_schema_id) {
      toast.error('Please complete all required destination fields');
      return;
    }
    setSavingDestination(true);
    try {
      const payload = {
        ...destinationForm,
        name: destinationForm.name.trim(),
        duration: destinationForm.duration.trim(),
        hero_image_url: destinationForm.hero_image_url.trim(),
        order: editingDestination?.order ?? (tripdeck?.destinations?.length || 0),
      };
      if (editingDestination?._id) {
        await axios.put(`${API}/tripdeck/${tripdeckId}/destination/${editingDestination._id}`, payload, { withCredentials: true });
        toast.success('Destination updated');
      } else {
        await axios.post(`${API}/tripdeck/${tripdeckId}/destination`, payload, { withCredentials: true });
        toast.success('Destination added');
      }
      setDestinationOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save destination');
    } finally {
      setSavingDestination(false);
    }
  };

  const handleDeleteDestination = async (destinationId) => {
    if (!window.confirm('Delete this destination?')) return;
    try {
      await axios.delete(`${API}/tripdeck/${tripdeckId}/destination/${destinationId}`, { withCredentials: true });
      toast.success('Destination deleted');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete destination');
    }
  };

  const moveDestination = async (destinationId, direction) => {
    const items = [...(tripdeck?.destinations || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const currentIndex = items.findIndex((item) => item._id === destinationId);
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    [items[currentIndex], items[targetIndex]] = [items[targetIndex], items[currentIndex]];
    try {
      await axios.put(
        `${API}/tripdeck/${tripdeckId}/destinations/reorder`,
        { destination_ids: items.map((item) => item._id) },
        { withCredentials: true }
      );
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reorder destinations');
    }
  };

  const openCreateSchema = () => {
    setEditingSchema(null);
    setSchemaName('');
    setSchemaFields([emptyField(0)]);
    setSchemaOpen(true);
  };

  const openEditSchema = (schema) => {
    setEditingSchema(schema);
    setSchemaName(schema.name || '');
    setSchemaFields(schemaFieldsToForm(schema.fields));
    setSchemaOpen(true);
  };

  const handleSaveSchema = async (e) => {
    e.preventDefault();
    const normalizedFields = normalizeFieldsForApi(schemaFields).filter((field) => field.label);
    if (!schemaName.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (normalizedFields.length === 0) {
      toast.error('Add at least one field');
      return;
    }
    setSavingSchema(true);
    try {
      const payload = {
        name: schemaName.trim(),
        fields: normalizedFields,
      };
      if (editingSchema?._id) {
        await axios.put(`${API}/form-schema/${editingSchema._id}`, payload, { withCredentials: true });
        toast.success('Template updated');
      } else {
        await axios.post(`${API}/form-schema`, payload, { withCredentials: true });
        toast.success('Template created');
      }
      setSchemaOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save template');
    } finally {
      setSavingSchema(false);
    }
  };

  const handleDeleteSchema = async (schemaId) => {
    if (!window.confirm('Delete this form template?')) return;
    try {
      await axios.delete(`${API}/form-schema/${schemaId}`, { withCredentials: true });
      toast.success('Template deleted');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete template');
    }
  };

  const exportResponses = () => {
    window.open(`${API}/tripdeck/${tripdeckId}/responses/export`, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--off-white)]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!tripdeck) {
    return (
      <div className="min-h-screen bg-[var(--off-white)] px-5 py-10">
        <div className="mx-auto max-w-5xl rounded-2xl border bg-white p-10 text-center" style={{ borderColor: '#e5e7eb' }}>
          <p className="text-lg font-semibold text-slate-600">TripDeck not found</p>
          <Link to="/" className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const sortedDestinations = [...(tripdeck.destinations || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="min-h-screen bg-[var(--off-white)] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" style={{ color: 'var(--gold)' }} />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>TripDeck Builder</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">Build a lead-gated multi-destination page that unlocks itinerary PDFs after form submit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`${SITE_URL}/deck/${tripdeck.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              style={{ borderColor: '#e5e7eb' }}
            >
              <ExternalLink className="h-4 w-4" /> Preview public page
            </a>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e5e7eb' }}>
          <div className="grid gap-4 md:grid-cols-[1.4fr,1fr,auto]">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</Label>
              <Input
                value={tripdeck.title || ''}
                onChange={(e) => setTripdeck((current) => ({ ...current, title: e.target.value }))}
                className="mt-2 rounded-lg border-slate-200"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Slug</Label>
              <Input value={tripdeck.slug || ''} disabled className="mt-2 rounded-lg border-slate-200 bg-slate-50 text-slate-500" />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSaveMeta} disabled={savingMeta} className="rounded-lg text-white" style={{ backgroundColor: 'var(--teal)' }}>
                {savingMeta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</Label>
            <Textarea
              value={tripdeck.description || ''}
              onChange={(e) => setTripdeck((current) => ({ ...current, description: e.target.value }))}
              rows={3}
              className="mt-2 rounded-lg border-slate-200"
              placeholder="A short intro customers see before selecting a destination"
            />
          </div>
        </div>

        <Tabs defaultValue="destinations" className="space-y-5">
          <TabsList className="grid w-full grid-cols-4 rounded-xl bg-white p-1 shadow-sm">
            <TabsTrigger value="destinations">Destinations</TabsTrigger>
            <TabsTrigger value="templates">Form Templates</TabsTrigger>
            <TabsTrigger value="responses">Responses</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="destinations" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--teal)' }}>Destination cards</h2>
                <p className="text-sm text-slate-500">Each destination has its own hero image, PDF, and lead form.</p>
              </div>
              <Button onClick={openCreateDestination} className="rounded-lg text-white" style={{ backgroundColor: 'var(--gold)' }}>
                <Plus className="mr-2 h-4 w-4" /> Add destination
              </Button>
            </div>

            {sortedDestinations.length === 0 ? (
              <div className="rounded-2xl border bg-white p-10 text-center" style={{ borderColor: '#e5e7eb' }}>
                <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                <p className="font-semibold text-slate-500">No destinations yet</p>
                <p className="mt-1 text-xs text-slate-400">Add your first destination card to start the lead-gated flow.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e5e7eb' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Destination</TableHead>
                      <TableHead>PDF</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDestinations.map((destination, index) => (
                      <TableRow key={destination._id}>
                        <TableCell>
                          <div className="font-semibold text-slate-700">{destination.name}</div>
                          <div className="text-xs text-slate-400">{destination.duration}</div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{pdfNameMap[destination.pdf_id] || 'Unknown PDF'}</TableCell>
                        <TableCell className="text-sm text-slate-500">{schemas.find((schema) => schema._id === destination.form_schema_id)?.name || 'Deleted template'}</TableCell>
                        <TableCell className="text-sm text-slate-500">#{index + 1}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => moveDestination(destination._id, 'up')} disabled={index === 0}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => moveDestination(destination._id, 'down')} disabled={index === sortedDestinations.length - 1}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDestination(destination)}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteDestination(destination._id)} className="text-red-500 hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--teal)' }}>Form templates</h2>
                <p className="text-sm text-slate-500">Create reusable enquiry forms for each destination card.</p>
              </div>
              <Button onClick={openCreateSchema} className="rounded-lg text-white" style={{ backgroundColor: 'var(--gold)' }}>
                <Plus className="mr-2 h-4 w-4" /> New template
              </Button>
            </div>

            {schemas.length === 0 ? (
              <div className="rounded-2xl border bg-white p-10 text-center" style={{ borderColor: '#e5e7eb' }}>
                <FileText className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                <p className="font-semibold text-slate-500">No templates yet</p>
                <p className="mt-1 text-xs text-slate-400">Create one reusable form template and assign it to your destinations.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {schemas.map((schema) => (
                  <div key={schema._id} className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e5e7eb' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-700">{schema.name}</h3>
                        <p className="mt-1 text-xs text-slate-400">{schema.fields?.length || 0} fields</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditSchema(schema)}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteSchema(schema._id)} className="text-red-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {(schema.fields || []).map((field) => (
                        <div key={field._id || `${schema._id}-${field.label}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          <div className="font-semibold text-slate-700">{field.label}</div>
                          <div className="mt-1">{field.field_type}{field.is_required ? ' · required' : ' · optional'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="responses" className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--teal)' }}>Lead responses</h2>
                <p className="text-sm text-slate-500">Every TripDeck submission is stored here and exportable as CSV.</p>
              </div>
              <Button variant="outline" onClick={exportResponses} className="rounded-lg border-slate-200 text-slate-600">
                Export CSV
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e5e7eb' }}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Submitted</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-sm text-slate-400">No responses yet for this TripDeck.</TableCell>
                    </TableRow>
                  ) : (
                    responses.map((response) => (
                      <TableRow key={response._id}>
                        <TableCell className="text-xs text-slate-500">{formatDate(response.submitted_at)}</TableCell>
                        <TableCell className="text-sm text-slate-600">{destinationNameMap[response.destination_id] || 'Unknown destination'}</TableCell>
                        <TableCell className="font-semibold text-slate-700">{response.customer_name}</TableCell>
                        <TableCell className="text-sm text-slate-600">{response.customer_phone}</TableCell>
                        <TableCell className="text-sm text-slate-500">{response.customer_email || '--'}</TableCell>
                        <TableCell className="text-sm text-slate-500">{response.device || '--'} · {response.browser || '--'}</TableCell>
                        <TableCell className="text-sm text-slate-500">{response.location || '--'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Total Opens', value: analytics?.total_opens || 0 },
                { label: 'Form Submissions', value: analytics?.total_submissions || 0 },
                { label: 'Conversion Rate', value: `${analytics?.conversion_rate || 0}%` },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e5e7eb' }}>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{item.label}</div>
                  <div className="mt-3 text-3xl font-black" style={{ color: 'var(--teal)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e5e7eb' }}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Destination</TableHead>
                    <TableHead>Submissions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(analytics?.destination_stats || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-12 text-center text-sm text-slate-400">No analytics yet for this TripDeck.</TableCell>
                    </TableRow>
                  ) : (
                    analytics.destination_stats.map((item) => (
                      <TableRow key={item.destination_id}>
                        <TableCell className="font-semibold text-slate-700">{item.destination_name}</TableCell>
                        <TableCell className="text-slate-600">{item.form_submissions}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={destinationOpen} onOpenChange={setDestinationOpen}>
          <DialogContent className="rounded-xl border sm:max-w-2xl" style={{ borderColor: '#e5e7eb' }}>
            <DialogHeader>
              <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>
                {editingDestination ? 'Edit destination' : 'Add destination'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveDestination} className="space-y-4 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Destination name</Label>
                  <Input value={destinationForm.name} onChange={(e) => setDestinationForm((current) => ({ ...current, name: e.target.value }))} className="mt-2 rounded-lg border-slate-200" />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Duration</Label>
                  <Input value={destinationForm.duration} onChange={(e) => setDestinationForm((current) => ({ ...current, duration: e.target.value }))} placeholder="e.g. 5 Days 4 Nights" className="mt-2 rounded-lg border-slate-200" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Hero image URL</Label>
                <Input value={destinationForm.hero_image_url} onChange={(e) => setDestinationForm((current) => ({ ...current, hero_image_url: e.target.value }))} placeholder="https://..." className="mt-2 rounded-lg border-slate-200" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">PDF</Label>
                  <Select value={destinationForm.pdf_id} onValueChange={(value) => setDestinationForm((current) => ({ ...current, pdf_id: value }))}>
                    <SelectTrigger className="mt-2 rounded-lg border-slate-200">
                      <SelectValue placeholder="Select PDF" />
                    </SelectTrigger>
                    <SelectContent>
                      {pdfs.map((pdf) => (
                        <SelectItem key={pdf.id} value={pdf.id}>{pdf.file_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Form template</Label>
                  <Select value={destinationForm.form_schema_id} onValueChange={(value) => setDestinationForm((current) => ({ ...current, form_schema_id: value }))}>
                    <SelectTrigger className="mt-2 rounded-lg border-slate-200">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {schemas.map((schema) => (
                        <SelectItem key={schema._id} value={schema._id}>{schema.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="rounded-lg text-white" style={{ backgroundColor: 'var(--teal)' }} disabled={savingDestination}>
                  {savingDestination ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingDestination ? 'Save destination' : 'Add destination'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={schemaOpen} onOpenChange={setSchemaOpen}>
          <DialogContent className="rounded-xl border sm:max-w-3xl" style={{ borderColor: '#e5e7eb' }}>
            <DialogHeader>
              <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>
                {editingSchema ? 'Edit template' : 'Create template'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveSchema} className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Template name</Label>
                <Input value={schemaName} onChange={(e) => setSchemaName(e.target.value)} className="mt-2 rounded-lg border-slate-200" placeholder="e.g. Group Trip Enquiry" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Fields</Label>
                  <Button type="button" variant="outline" onClick={() => setSchemaFields((current) => [...current, emptyField(current.length)])} className="rounded-lg border-slate-200 text-slate-600">
                    <Plus className="mr-2 h-4 w-4" /> Add field
                  </Button>
                </div>
                {schemaFields.map((field, index) => (
                  <div key={`${field.label}-${index}`} className="rounded-xl border border-slate-200 p-4">
                    <div className="grid gap-4 md:grid-cols-[1.4fr,1fr,1fr,auto]">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Label</Label>
                        <Input value={field.label} onChange={(e) => setSchemaFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item))} className="mt-2 rounded-lg border-slate-200" />
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Field type</Label>
                        <Select value={field.field_type} onValueChange={(value) => setSchemaFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, field_type: value } : item))}>
                          <SelectTrigger className="mt-2 rounded-lg border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Placeholder</Label>
                        <Input value={field.placeholder} onChange={(e) => setSchemaFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, placeholder: e.target.value } : item))} className="mt-2 rounded-lg border-slate-200" />
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="ghost" onClick={() => setSchemaFields((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-red-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {field.field_type === 'dropdown' && (
                      <div className="mt-4">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Dropdown options</Label>
                        <Textarea
                          value={field.optionsText}
                          onChange={(e) => setSchemaFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, optionsText: e.target.value } : item))}
                          rows={4}
                          className="mt-2 rounded-lg border-slate-200"
                          placeholder={'One option per line'}
                        />
                      </div>
                    )}
                    <label className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                      <input
                        type="checkbox"
                        checked={field.is_required}
                        onChange={(e) => setSchemaFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, is_required: e.target.checked } : item))}
                      />
                      Required field
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="rounded-lg text-white" style={{ backgroundColor: 'var(--gold)' }} disabled={savingSchema}>
                  {savingSchema ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingSchema ? 'Save template' : 'Create template'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
