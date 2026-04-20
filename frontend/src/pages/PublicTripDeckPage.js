import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND_BASE = process.env.REACT_APP_BACKEND_URL;

function buildInitialResponses(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.label, '']));
}

function renderField(field, value, onChange) {
  const commonClass = 'mt-2 rounded-lg border-slate-200';
  if (field.field_type === 'dropdown') {
    return (
      <Select value={value || ''} onValueChange={(selected) => onChange(selected)}>
        <SelectTrigger className={commonClass}>
          <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
        </SelectTrigger>
        <SelectContent>
          {(field.options || []).map((option) => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.field_type === 'text' && (field.placeholder || '').length > 60) {
    return (
      <Textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={field.placeholder || field.label}
        className={commonClass}
      />
    );
  }

  const typeMap = {
    phone: 'tel',
    email: 'email',
    date: 'date',
    number: 'number',
    text: 'text',
  };

  return (
    <Input
      type={typeMap[field.field_type] || 'text'}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      className={commonClass}
    />
  );
}

export default function PublicTripDeckPage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [tripdeck, setTripdeck] = useState(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [formsByDestination, setFormsByDestination] = useState({});
  const [submittingId, setSubmittingId] = useState('');
  const [accessByDestination, setAccessByDestination] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get(`${API}/public/tripdeck/${slug}`);
        setTripdeck(data);
        const initialDestination = data.destinations?.[0]?._id || '';
        setSelectedDestinationId(initialDestination);
        const initialForms = Object.fromEntries(
          (data.destinations || []).map((destination) => [
            destination._id,
            {
              customer_name: '',
              customer_phone: '',
              customer_email: '',
              responses: buildInitialResponses(destination.form_schema?.fields || []),
            },
          ])
        );
        setFormsByDestination(initialForms);
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to load itinerary page');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  const selectedDestination = useMemo(
    () => (tripdeck?.destinations || []).find((destination) => destination._id === selectedDestinationId) || tripdeck?.destinations?.[0],
    [tripdeck, selectedDestinationId]
  );

  const selectedForm = formsByDestination[selectedDestination?._id] || {
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    responses: {},
  };

  const updateSelectedForm = (updater) => {
    if (!selectedDestination?._id) return;
    setFormsByDestination((current) => ({
      ...current,
      [selectedDestination._id]: updater(current[selectedDestination._id] || {
        customer_name: '',
        customer_phone: '',
        customer_email: '',
        responses: {},
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDestination?._id) return;
    if (!selectedForm.customer_name.trim() || !selectedForm.customer_phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    const missingRequired = (selectedDestination.form_schema?.fields || []).some(
      (field) => field.is_required && !String(selectedForm.responses?.[field.label] || '').trim()
    );
    if (missingRequired) {
      toast.error('Please complete all required form fields');
      return;
    }
    setSubmittingId(selectedDestination._id);
    try {
      const { data } = await axios.post(`${API}/public/tripdeck/${slug}/destination/${selectedDestination._id}/submit`, {
        customer_name: selectedForm.customer_name.trim(),
        customer_phone: selectedForm.customer_phone.trim(),
        customer_email: selectedForm.customer_email.trim() || undefined,
        responses: selectedForm.responses,
      });
      setAccessByDestination((current) => ({
        ...current,
        [selectedDestination._id]: {
          token: data.pdf_access_token,
          pdfUrl: `${BACKEND_BASE}/api/public/tripdeck/${slug}/destination/${selectedDestination._id}/pdf?token=${encodeURIComponent(data.pdf_access_token)}`,
        },
      }));
      toast.success('Thanks — your itinerary is ready below');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit form');
    } finally {
      setSubmittingId('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin" />
          <span className="text-sm font-medium">Loading your itinerary...</span>
        </div>
      </div>
    );
  }

  if (!tripdeck) {
    return (
      <div className="min-h-screen bg-white px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border p-10 text-center" style={{ borderColor: '#e5e7eb' }}>
          <p className="text-xl font-semibold text-slate-700">This itinerary page is unavailable.</p>
          <p className="mt-2 text-sm text-slate-500">The TripDeck might be archived or the link may be invalid.</p>
        </div>
      </div>
    );
  }

  const pdfAccess = selectedDestination ? accessByDestination[selectedDestination._id] : null;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <section className="border-b px-6 py-10" style={{ backgroundColor: 'var(--teal)', borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--gold)' }}>Travloger Itinerary</div>
            <h1 className="mt-3 text-4xl font-black text-white md:text-5xl">{tripdeck.title}</h1>
            {tripdeck.description && (
              <p className="mt-4 text-base leading-7 text-white/75">{tripdeck.description}</p>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1.2fr,0.8fr]">
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {(tripdeck.destinations || []).map((destination) => {
              const isSelected = destination._id === selectedDestination?._id;
              return (
                <button
                  key={destination._id}
                  type="button"
                  onClick={() => setSelectedDestinationId(destination._id)}
                  className={`overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all ${isSelected ? 'ring-2 ring-offset-2' : 'hover:-translate-y-0.5 hover:shadow-md'}`}
                  style={{
                    borderColor: isSelected ? 'var(--teal)' : '#e5e7eb',
                    ringColor: 'rgba(20,74,87,0.2)',
                  }}
                >
                  <div className="aspect-[16/10] w-full bg-slate-100">
                    {destination.hero_image_url ? (
                      <img src={destination.hero_image_url} alt={destination.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">No image yet</div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-slate-800">{destination.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">{destination.duration}</p>
                      </div>
                      {destination.pdf_available && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Gated PDF
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {pdfAccess?.pdfUrl && (
            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e5e7eb' }}>
              <div className="border-b px-5 py-3 text-sm font-semibold text-slate-600" style={{ borderColor: '#e5e7eb' }}>
                {selectedDestination?.name} itinerary
              </div>
              <iframe
                title={`${selectedDestination?.name} itinerary`}
                src={pdfAccess.pdfUrl}
                className="h-[85vh] w-full bg-white"
              />
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e5e7eb' }}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <MapPin className="h-4 w-4" style={{ color: 'var(--gold)' }} />
              Lead form
            </div>
            <h3 className="mt-3 text-2xl font-bold" style={{ color: 'var(--teal)' }}>
              {selectedDestination?.name || 'Choose a destination'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Fill this quick form to unlock the itinerary PDF for the selected destination.
            </p>

            {!selectedDestination ? null : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Full name</Label>
                  <Input
                    value={selectedForm.customer_name}
                    onChange={(e) => updateSelectedForm((current) => ({ ...current, customer_name: e.target.value }))}
                    className="mt-2 rounded-lg border-slate-200"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label>
                  <Input
                    value={selectedForm.customer_phone}
                    onChange={(e) => updateSelectedForm((current) => ({ ...current, customer_phone: e.target.value }))}
                    className="mt-2 rounded-lg border-slate-200"
                    placeholder="Your WhatsApp number"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email <span className="font-normal normal-case text-slate-300">(optional)</span></Label>
                  <Input
                    type="email"
                    value={selectedForm.customer_email}
                    onChange={(e) => updateSelectedForm((current) => ({ ...current, customer_email: e.target.value }))}
                    className="mt-2 rounded-lg border-slate-200"
                    placeholder="you@example.com"
                  />
                </div>

                {(selectedDestination.form_schema?.fields || []).map((field) => (
                  <div key={`${selectedDestination._id}-${field._id || field.label}`}>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {field.label}
                      {field.is_required ? <span className="ml-1 text-red-400">*</span> : null}
                    </Label>
                    {renderField(
                      field,
                      selectedForm.responses?.[field.label] || '',
                      (newValue) => updateSelectedForm((current) => ({
                        ...current,
                        responses: {
                          ...(current.responses || {}),
                          [field.label]: newValue,
                        },
                      }))
                    )}
                  </div>
                ))}

                <Button type="submit" className="w-full rounded-lg text-white" style={{ backgroundColor: 'var(--gold)' }} disabled={submittingId === selectedDestination._id || !selectedDestination.pdf_available}>
                  {submittingId === selectedDestination._id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {selectedDestination.pdf_available ? 'Unlock itinerary PDF' : 'Itinerary unavailable'}
                </Button>
              </form>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
