'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { ArrowLeft, Calendar, Users, MapPin, Phone, Mail, Clock, Edit2, Check, X, ExternalLink, BarChart2, Eye, MessageCircle, Package, ThumbsUp, RefreshCw, Trash2, LinkIcon, Link2Off, ChevronDown, ChevronUp, Hotel, Car, TrendingUp, Receipt, Star, CalendarCheck } from 'lucide-react';

const T = '#134956';
const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: '#F1F5F9', text: '#475569' },
  SENT:      { bg: '#DBEAFE', text: '#1D4ED8' },
  VIEWED:    { bg: '#EDE9FE', text: '#6D28D9' },
  APPROVED:  { bg: '#DCFCE7', text: '#15803D' },
  CONFIRMED: { bg: '#CCFBF1', text: '#0F766E' },
  EXPIRED:   { bg: '#FEF2F2', text: '#DC2626' },
  CANCELLED: { bg: '#FEE2E2', text: '#B91C1C' },
  REVISED:   { bg: '#FEF3C7', text: '#B45309' },
};
const ALL_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'APPROVED', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'REVISED'];
const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1';
const lblStyle = { color: '#94A3B8' };

function fmtINR(n: number) { return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

interface RoomingJson {
  rooms: { type: string; count: number; adults: number; children_with_bed: number; children_without_bed: number }[];
}

interface OptionHotelEnriched {
  id: string; destination_id: string; check_in_date: string; check_out_date: string; nights: number;
  calculated_cost: number; manual_cost_override?: number | null;
  rooming_json?: RoomingJson | null;
  destination?: { name: string } | null;
  hotel?: { hotel_name: string; star_rating: number | null; category_label?: string | null } | null;
  room_category?: { room_category_name: string } | null;
  meal_plan?: { code: string; name: string } | null;
}

interface QuoteOptionFull {
  id: string; option_name: string; is_most_popular: boolean; display_order: number;
  vehicle_cost: number; hotel_cost: number; activity_cost: number; transfer_cost: number; misc_cost: number;
  base_cost: number; profit_type: string; profit_value: number; profit_amount: number;
  discount_amount: number; discount_expires_at?: string | null; selling_before_gst: number; gst_percent: number; gst_amount: number;
  final_price: number; price_per_adult_display: number; rounding_adjustment: number;
  vehicle_type?: { type_name: string } | null;
  option_hotels: OptionHotelEnriched[];
}

interface Quote {
  id: string; quote_number: string; quote_name?: string | null; quote_type: string; status: string;
  start_date: string; end_date: string; duration_days: number; duration_nights: number;
  adults: number; children_5_12: number; children_below_5: number; infants: number;
  pickup_point: string | null; drop_point: string | null; expiry_date: string | null;
  created_at: string; public_token: string; link_active: boolean;
  customer: { id: string; name: string; phone: string; email?: string | null };
  state: { name: string; code: string };
  assigned_agent?: { id: string; name: string; role: string } | null;
  quote_options: QuoteOptionFull[];
  day_snapshots: Array<{ id: string; day_number: number; title: string | null }>;
  snapshots: Array<{ snapshot_json: Record<string, unknown> }>;
}

interface QuoteEvent {
  id: string; event_type: string; metadata: Record<string, unknown> | null; created_at: string;
}

const EVENT_ICON: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  quote_created:    { icon: Calendar,       color: '#6366F1', bg: '#EEF2FF', label: 'Quote Created' },
  quote_sent:       { icon: ExternalLink,   color: '#0EA5E9', bg: '#E0F2FE', label: 'Sent to Customer' },
  quote_viewed:     { icon: Eye,            color: '#8B5CF6', bg: '#F5F3FF', label: 'Viewed by Customer' },
  package_selected: { icon: Package,        color: '#F59E0B', bg: '#FFFBEB', label: 'Package Selected' },
  approve_clicked:  { icon: ThumbsUp,       color: '#10B981', bg: '#ECFDF5', label: 'Approved' },
  whatsapp_clicked: { icon: MessageCircle,  color: '#22C55E', bg: '#F0FDF4', label: 'WhatsApp Clicked' },
  booking_intent:   { icon: ThumbsUp,       color: '#EC4899', bg: '#FDF2F8', label: '🎉 Booking Intent' },
  rating_submitted: { icon: Star,           color: '#F59E0B', bg: '#FFFBEB', label: '⭐ Customer Rated' },
  batch_selected:   { icon: CalendarCheck,  color: '#0EA5E9', bg: '#E0F2FE', label: '📅 Date Selected' },
};

function formatEventTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
function fmtSecs(s: number) { return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }

/* ── Pricing Breakdown per option ───────────────────────────────────── */
function OptionPricingCard({
  opt, adults, quoteId, onUpdated,
}: {
  opt: QuoteOptionFull; adults: number; quoteId: string;
  onUpdated: () => void;
}) {
  const [open, setOpen]               = useState(false);
  const [editingDiscount, setEditing] = useState(false);
  const [discountInput, setDiscountInput] = useState(String(opt.discount_amount));
  // datetime-local value e.g. "2025-05-07T16:00"
  const [expiryInput, setExpiryInput] = useState(() => {
    if (!opt.discount_expires_at) return '';
    const d = new Date(opt.discount_expires_at);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  // Live preview of what the new final price will look like
  const previewDiscount   = Math.max(0, Number(discountInput) || 0);
  const previewSellBGST   = opt.base_cost + opt.profit_amount - previewDiscount;
  const previewGST        = (previewSellBGST * opt.gst_percent) / 100;
  const previewFinal      = previewSellBGST + previewGST;
  const previewPerAdult   = adults > 0 ? previewFinal / adults : 0;

  async function applyDiscount() {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/v1/quotes/${quoteId}/options/${opt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discount_amount:     previewDiscount,
          discount_expires_at: expiryInput ? new Date(expiryInput).toISOString() : null,
        }),
      });
      if (res.ok) {
        setSaveMsg({ ok: true, text: 'Discount applied & itinerary republished.' });
        setEditing(false);
        onUpdated();
      } else {
        const d = await res.json();
        setSaveMsg({ ok: false, text: d.error ?? 'Failed to apply discount.' });
      }
    } catch {
      setSaveMsg({ ok: false, text: 'Network error.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 5000);
    }
  }

  const rows = [
    { label: 'Hotel B2B', value: opt.hotel_cost, icon: <Hotel className="w-3.5 h-3.5" />, color: '#0EA5E9' },
    { label: `Vehicle${opt.vehicle_type ? ` (${opt.vehicle_type.type_name})` : ''}`, value: opt.vehicle_cost, icon: <Car className="w-3.5 h-3.5" />, color: '#8B5CF6' },
    ...(opt.activity_cost > 0 ? [{ label: 'Activities', value: opt.activity_cost, icon: <Receipt className="w-3.5 h-3.5" />, color: '#F59E0B' }] : []),
    ...(opt.transfer_cost > 0 ? [{ label: 'Transfers', value: opt.transfer_cost, icon: <Car className="w-3.5 h-3.5" />, color: '#6366F1' }] : []),
    ...(opt.misc_cost > 0 ? [{ label: 'Misc', value: opt.misc_cost, icon: <Receipt className="w-3.5 h-3.5" />, color: '#94A3B8' }] : []),
  ];

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: opt.is_most_popular ? '#86EFAC' : '#E2E8F0' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        style={{ backgroundColor: opt.is_most_popular ? '#F0FDF4' : '#F8FAFC' }}
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm" style={{ color: '#0F172A' }}>{opt.option_name}</span>
          {opt.is_most_popular && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>★ Most Popular</span>}
          {opt.discount_amount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
              −{fmtINR(opt.discount_amount)} off
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-base font-bold" style={{ color: T }}>{fmtINR(opt.final_price)}</p>
            <p className="text-[11px]" style={{ color: '#94A3B8' }}>{fmtINR(opt.price_per_adult_display)} / adult</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4" style={{ color: '#94A3B8' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />}
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-5" style={{ borderTop: '1px solid #E2E8F0' }}>
          {/* Hotel breakdown table */}
          {opt.option_hotels.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Hotel Details</p>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                      {['Destination', 'Hotel', 'Room', 'Meal', 'Nts', 'Check-in', 'Check-out', 'B2B Cost'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#64748B' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {opt.option_hotels.map((oh, i) => {
                      const totalRooms = oh.rooming_json?.rooms?.reduce((s, r) => s + r.count, 0) ?? 1;
                      const effectiveCost = oh.manual_cost_override ?? oh.calculated_cost;
                      const costPerRoom   = totalRooms > 1 ? Math.round(effectiveCost / totalRooms) : null;
                      return (
                        <tr key={oh.id} style={{ borderTop: i > 0 ? '1px solid #F1F5F9' : undefined }}>
                          <td className="px-3 py-2 font-medium" style={{ color: '#0F172A' }}>{oh.destination?.name ?? '—'}</td>
                          <td className="px-3 py-2" style={{ color: '#0F172A' }}>
                            <span>{oh.hotel?.hotel_name ?? '—'}</span>
                            {oh.hotel?.star_rating && <span className="ml-1 text-[10px]" style={{ color: '#94A3B8' }}>{oh.hotel.star_rating}★</span>}
                          </td>
                          <td className="px-3 py-2" style={{ color: '#475569' }}>{oh.room_category?.room_category_name ?? '—'}</td>
                          <td className="px-3 py-2" style={{ color: '#475569' }}>{oh.meal_plan?.code ?? '—'}</td>
                          <td className="px-3 py-2 text-center font-medium" style={{ color: '#0F172A' }}>{oh.nights}</td>
                          <td className="px-3 py-2" style={{ color: '#475569' }}>{fmtDate(oh.check_in_date)}</td>
                          <td className="px-3 py-2" style={{ color: '#475569' }}>{fmtDate(oh.check_out_date)}</td>
                          <td className="px-3 py-2 text-right">
                            {costPerRoom != null ? (
                              <div>
                                <p className="text-[11px]" style={{ color: '#64748B' }}>
                                  {totalRooms} rm × {fmtINR(costPerRoom)}
                                </p>
                                <p className="font-bold" style={{ color: T }}>{fmtINR(effectiveCost)}</p>
                              </div>
                            ) : (
                              <p className="font-semibold" style={{ color: T }}>{fmtINR(effectiveCost)}</p>
                            )}
                            {oh.manual_cost_override != null && (
                              <span className="text-[10px] font-normal" style={{ color: '#F59E0B' }}>manual</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cost summary */}
          <div className="grid grid-cols-2 gap-3">
            {/* B2B breakdown */}
            <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>B2B Cost Breakdown</p>
              {rows.map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#475569' }}>
                    <span style={{ color: r.color }}>{r.icon}</span>{r.label}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{fmtINR(r.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #E2E8F0' }}>
                <span className="text-xs font-bold" style={{ color: '#0F172A' }}>B2B Total</span>
                <span className="text-sm font-bold" style={{ color: '#0F172A' }}>{fmtINR(opt.base_cost)}</span>
              </div>
            </div>

            {/* B2C pricing + discount editor */}
            <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>B2C Pricing</p>
              <div className="flex items-center justify-between pb-2 mb-1" style={{ borderBottom: '1px dashed #86EFAC' }}>
                <span className="text-xs font-semibold" style={{ color: '#475569' }}>B2B Total</span>
                <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{fmtINR(opt.base_cost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#475569' }}>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  Profit ({opt.profit_type === 'PERCENTAGE' ? `${opt.profit_value}%` : 'flat'})
                </span>
                <span className="text-xs font-semibold" style={{ color: '#15803D' }}>+{fmtINR(opt.profit_amount)}</span>
              </div>

              {/* ── Discount row with inline editor ───────────────── */}
              <div className="rounded-lg p-2.5" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold" style={{ color: '#DC2626' }}>Discount</span>
                  {!editingDiscount ? (
                    <button
                      onClick={() => {
                        setDiscountInput(String(opt.discount_amount));
                        setExpiryInput(opt.discount_expires_at ? new Date(opt.discount_expires_at).toISOString().slice(0, 16) : '');
                        setEditing(true);
                      }}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors hover:bg-red-100"
                      style={{ color: '#DC2626', border: '1px solid #FECACA' }}>
                      {opt.discount_amount > 0 ? 'Edit' : '+ Add'}
                    </button>
                  ) : (
                    <button onClick={() => setEditing(false)} className="text-[10px]" style={{ color: '#94A3B8' }}>Cancel</button>
                  )}
                </div>

                {editingDiscount ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: '#64748B' }}>₹</span>
                      <input
                        type="number" min="0" step="100"
                        value={discountInput}
                        onChange={e => setDiscountInput(e.target.value)}
                        className="flex-1 text-sm font-bold rounded-lg px-2 py-1.5 outline-none"
                        style={{ border: '1px solid #FECACA', color: '#DC2626', backgroundColor: 'white' }}
                        placeholder="0"
                      />
                    </div>
                    {/* Expiry datetime */}
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide mb-1 block" style={{ color: '#64748B' }}>
                        Valid until (optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={expiryInput}
                        onChange={e => setExpiryInput(e.target.value)}
                        className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
                        style={{ border: '1px solid #FECACA', color: '#DC2626', backgroundColor: 'white' }}
                      />
                      {expiryInput && (
                        <button
                          onClick={() => setExpiryInput('')}
                          className="text-[10px] mt-0.5" style={{ color: '#94A3B8' }}>
                          Clear expiry
                        </button>
                      )}
                    </div>
                    {/* Live preview */}
                    {previewDiscount > 0 && (
                      <div className="text-[10px] space-y-0.5 px-1" style={{ color: '#64748B' }}>
                        <div className="flex justify-between">
                          <span>New final price</span>
                          <span className="font-bold" style={{ color: T }}>{fmtINR(Math.max(0, previewFinal))}</span>
                        </div>
                        {adults > 0 && (
                          <div className="flex justify-between">
                            <span>Per adult</span>
                            <span className="font-semibold">{fmtINR(Math.max(0, previewPerAdult))}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={applyDiscount} disabled={saving}
                      className="w-full py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
                      style={{ backgroundColor: '#DC2626' }}>
                      {saving ? 'Applying…' : 'Apply Discount & Republish'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: '#DC2626' }}>
                        {opt.discount_amount > 0 ? `−${fmtINR(opt.discount_amount)}` : 'No discount'}
                      </span>
                    </div>
                    {opt.discount_amount > 0 && opt.discount_expires_at && (
                      <p className="text-[10px]" style={{ color: '#94A3B8' }}>
                        Valid till {new Date(opt.discount_expires_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {saveMsg && (
                <p className="text-[11px] font-medium px-1" style={{ color: saveMsg.ok ? '#15803D' : '#DC2626' }}>
                  {saveMsg.ok ? '✓ ' : '✗ '}{saveMsg.text}
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#475569' }}>Before GST</span>
                <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{fmtINR(opt.selling_before_gst)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#475569' }}>GST ({opt.gst_percent}%)</span>
                <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>+{fmtINR(opt.gst_amount)}</span>
              </div>
              {opt.rounding_adjustment !== 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: '#94A3B8' }}>Rounding</span>
                  <span className="text-xs" style={{ color: '#94A3B8' }}>{opt.rounding_adjustment > 0 ? '+' : ''}{fmtINR(opt.rounding_adjustment)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid #86EFAC' }}>
                <span className="text-xs font-bold" style={{ color: '#0F172A' }}>
                  Customer Total ({adults > 0 ? `${adults} pax` : ''})
                </span>
                <span className="text-base font-bold" style={{ color: T }}>{fmtINR(opt.final_price)}</span>
              </div>
              {adults > 0 && (
                <p className="text-[11px] text-right" style={{ color: '#94A3B8' }}>{fmtINR(opt.price_per_adult_display)} per adult</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuoteDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics'>('overview');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [events, setEvents] = useState<QuoteEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [republishing, setRepublishing] = useState(false);
  const [republishMsg, setRepublishMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [togglingLink, setTogglingLink] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/v1/quotes/${id}`);
    const data = await res.json();
    if (data.success) { setQuote(data.data); setNewStatus(data.data.status); }
    else setError('Quote not found');
    setLoading(false);
  }

  async function loadEvents() {
    if (eventsLoading) return;
    setEventsLoading(true);
    const res = await fetch(`/api/v1/quotes/${id}/events`).catch(() => null);
    if (res?.ok) { const data = await res.json(); if (data.success) setEvents(data.data); }
    setEventsLoading(false);
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (activeTab === 'analytics') loadEvents(); }, [activeTab]);

  async function handleRepublish() {
    if (!quote || republishing) return;
    setRepublishing(true); setRepublishMsg(null);
    try {
      const res = await fetch(`/api/v1/quotes/${id}/publish`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) { setRepublishMsg({ ok: true, text: 'Snapshot refreshed — customer link is now up to date.' }); load(); }
      else setRepublishMsg({ ok: false, text: data.error ?? 'Re-publish failed.' });
    } catch { setRepublishMsg({ ok: false, text: 'Network error. Try again.' }); }
    finally { setRepublishing(false); setTimeout(() => setRepublishMsg(null), 6000); }
  }

  async function handleToggleLink() {
    if (!quote || togglingLink) return;
    setTogglingLink(true);
    try {
      await fetch(`/api/v1/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_active: !quote.link_active }),
      });
      await load();
    } finally { setTogglingLink(false); }
  }

  async function handleDelete() {
    if (!quote || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/quotes/${id}`, { method: 'DELETE' });
      if (res.ok) { router.push('/admin/quotes'); }
    } finally { setDeleting(false); }
  }

  async function saveStatus() {
    if (!quote || newStatus === quote.status) { setEditingStatus(false); return; }
    setSavingStatus(true);
    await fetch(`/api/v1/quotes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    setSavingStatus(false); setEditingStatus(false); load();
  }

  if (loading) return <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>;
  if (error || !quote) return (
    <div className="py-16 text-center">
      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>Quote not found</p>
      <Link href="/admin/quotes" className="text-sm mt-2 inline-block" style={{ color: '#134956' }}>← Back to Quotes</Link>
    </div>
  );

  const totalPax = quote.adults + (quote.children_5_12 ?? 0) + (quote.children_below_5 ?? 0) + (quote.infants ?? 0);
  const badge = STATUS_BADGE[quote.status] ?? STATUS_BADGE.DRAFT;

  // analytics helpers — group by session_id (added in tracker v2) to count distinct visits.
  // Fallback to is_final=true for events recorded before session_id was introduced.
  const allViewEvents  = events.filter(e => e.event_type === 'quote_viewed');
  const sessionMap     = new Map<string, QuoteEvent[]>();
  const legacyFinals: QuoteEvent[] = [];
  for (const evt of allViewEvents) {
    const sid = evt.metadata?.session_id as string | undefined;
    if (sid) {
      if (!sessionMap.has(sid)) sessionMap.set(sid, []);
      sessionMap.get(sid)!.push(evt);
    } else if (evt.metadata?.is_final === true) {
      legacyFinals.push(evt);
    }
  }
  // For each session pick the final flush (most complete data); fallback to highest time_spent
  const sessionEvents: QuoteEvent[] = [
    ...Array.from(sessionMap.values()).map(evts =>
      evts.find(e => e.metadata?.is_final === true) ??
      [...evts].sort((a, b) => Number(b.metadata?.time_spent_seconds ?? 0) - Number(a.metadata?.time_spent_seconds ?? 0))[0]
    ),
    ...legacyFinals,
  ];
  const viewCount      = sessionEvents.length;   // unique sessions
  const whatsappClicks = events.filter(e => e.event_type === 'whatsapp_clicked').length;
  const pkgSelectedEvt = events.filter(e => e.event_type === 'package_selected');
  const approvedEvt    = events.filter(e => e.event_type === 'approve_clicked');
  const bookingIntents = events.filter(e => e.event_type === 'booking_intent');
  const ratingEvents   = events.filter(e => e.event_type === 'rating_submitted');
  const latestRating   = ratingEvents.length > 0 ? ratingEvents[ratingEvents.length - 1] : null;
  const RATING_FACES   = ['😢', '😕', '😐', '🙂', '😍'];
  const latestFace     = latestRating?.metadata?.rating != null ? (RATING_FACES[Number(latestRating.metadata.rating)] ?? '⭐') : null;

  const SECTION_ORDER = ['hero', 'packages', 'dates', 'itinerary', 'inclusions', 'fare', 'policies', 'faqs'];
  const sectionTimeTotals: Record<string, number> = {};
  // IMPORTANT: section_time_seconds is CUMULATIVE from session start (each periodic flush
  // re-sends the running total, not a delta). Only the final flush (is_final === true) has
  // the correct end-of-session totals. Summing intermediate flushes would multiply the
  // values by the number of flushes. Use sessionEvents which are already filtered to is_final.
  sessionEvents.forEach(e => {
    const st = e.metadata?.section_time_seconds as Record<string, number> | undefined;
    if (st) Object.entries(st).forEach(([k, v]) => { sectionTimeTotals[k] = (sectionTimeTotals[k] ?? 0) + v; });
  });
  // Keep fixed section order, filter out zeros
  const topSections = SECTION_ORDER
    .filter(s => (sectionTimeTotals[s] ?? 0) > 0)
    .map(s => [s, sectionTimeTotals[s]] as [string, number]);
  const maxSectionVal = Math.max(...topSections.map(([, v]) => v), 1);

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title={quote.quote_number}
        subtitle={`${quote.state.name} · ${quote.duration_nights}N/${quote.duration_days}D · ${totalPax} pax`}
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Quotes', href: '/admin/quotes' }, { label: quote.quote_number }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {republishMsg && (
              <span className="text-xs font-medium px-3 py-1.5 rounded-lg" style={republishMsg.ok ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                {republishMsg.text}
              </span>
            )}
            <button onClick={handleRepublish} disabled={republishing}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: T }}>
              <RefreshCw className={`w-4 h-4 ${republishing ? 'animate-spin' : ''}`} />
              {republishing ? 'Republishing…' : 'Re-publish'}
            </button>
            <a href={`/quotations/${quote.public_token}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F1F5F9]"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <ExternalLink className="w-4 h-4" /> Preview
            </a>
            <Link href="/admin/quotes" className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F1F5F9' }}>
        {(['overview', 'analytics'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-semibold transition-all"
            style={activeTab === tab ? { backgroundColor: '#fff', color: T, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#64748B' }}>
            {tab === 'analytics' && <BarChart2 className="w-3.5 h-3.5" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── ANALYTICS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {eventsLoading ? (
            <div className="py-16 text-center"><div className="w-8 h-8 rounded-full border-2 border-[#134956] border-t-transparent animate-spin mx-auto" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Sessions', value: viewCount, icon: Eye, color: '#8B5CF6', bg: '#F5F3FF', sub: 'unique page visits' },
                  { label: 'WhatsApp Clicks', value: whatsappClicks, icon: MessageCircle, color: '#22C55E', bg: '#F0FDF4', sub: '' },
                  { label: 'Pkg Selected', value: pkgSelectedEvt.length, icon: Package, color: '#F59E0B', bg: '#FFFBEB', sub: pkgSelectedEvt.length > 0 ? ((pkgSelectedEvt[pkgSelectedEvt.length - 1]?.metadata?.option_name as string | undefined) || (pkgSelectedEvt[pkgSelectedEvt.length - 1]?.metadata?.tier_name as string | undefined) || '') : 'no selection yet' },
                  { label: 'Booking Intents', value: bookingIntents.length, icon: ThumbsUp, color: '#EC4899', bg: '#FDF2F8', sub: 'Book Now tapped' },
                  { label: 'Approved', value: approvedEvt.length, icon: ThumbsUp, color: '#10B981', bg: '#ECFDF5', sub: '' },
                  { label: 'Customer Rating', value: latestFace ?? (ratingEvents.length === 0 ? '—' : '⭐'), icon: Star, color: '#F59E0B', bg: '#FFFBEB', sub: ratingEvents.length > 0 ? (latestRating?.metadata?.rating_label as string | undefined ?? '') : 'not yet rated', isText: true },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border p-4" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{s.label}</p>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: s.bg }}>
                        <s.icon className="w-4 h-4" style={{ color: s.color }} />
                      </div>
                    </div>
                    {'isText' in s && s.isText
                      ? <p className="text-3xl leading-none font-bold" style={{ color: '#0F172A' }}>{s.value}</p>
                      : <p className="text-2xl font-bold" style={{ color: '#0F172A' }}>{s.value}</p>
                    }
                    {s.sub && <p className="text-[10px] mt-0.5 truncate" style={{ color: '#94A3B8' }}>{s.sub}</p>}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
                  <h3 className="text-sm font-bold mb-1" style={{ color: '#0F172A' }}>Section Engagement</h3>
                  <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>Total time spent per section across all sessions</p>
                  {topSections.length === 0 ? <p className="text-sm" style={{ color: '#94A3B8' }}>No section data yet.</p> : (
                    <div className="space-y-3">
                      {topSections.map(([section, val]) => (
                        <div key={section}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium capitalize" style={{ color: '#475569' }}>{section.replace(/_/g, ' ')}</span>
                            <span className="text-xs font-bold" style={{ color: '#0F172A' }}>{fmtSecs(val)}</span>
                          </div>
                          <div className="h-2 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                            <div className="h-2 rounded-full transition-all" style={{ width: `${(val / maxSectionVal) * 100}%`, backgroundColor: T }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
                  <h3 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Package Preference</h3>
                  {pkgSelectedEvt.length === 0 ? <p className="text-sm" style={{ color: '#94A3B8' }}>No package selected yet.</p> : (() => {
                    const counts: Record<string, number> = {};
                    pkgSelectedEvt.forEach(e => { const name = (e.metadata?.option_name as string) || (e.metadata?.tier_name as string) || 'Unknown'; counts[name] = (counts[name] ?? 0) + 1; });
                    const maxC = Math.max(...Object.values(counts));
                    return (
                      <div className="space-y-3">
                        {Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, cnt]) => (
                          <div key={name}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium" style={{ color: '#475569' }}>{name}</span>
                              <span className="text-xs font-bold" style={{ color: '#0F172A' }}>{cnt}×</span>
                            </div>
                            <div className="h-2 rounded-full" style={{ backgroundColor: '#F1F5F9' }}>
                              <div className="h-2 rounded-full" style={{ width: `${(cnt / maxC) * 100}%`, backgroundColor: '#F59E0B' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {sessionEvents.length > 0 && (
                <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
                  <h3 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Sessions ({sessionEvents.length})</h3>
                  <div className="space-y-4">
                    {sessionEvents.slice(0, 20).map((evt, i) => {
                      const st = evt.metadata?.section_time_seconds as Record<string, number> | undefined;
                      const tot = Number(evt.metadata?.time_spent_seconds ?? 0);
                      // Fixed section order, filter zeros
                      const nonZero = st
                        ? SECTION_ORDER.filter(s => (st[s] ?? 0) > 0).map(s => [s, st[s]] as [string, number])
                        : [];
                      const maxT = Math.max(...nonZero.map(([, v]) => v), 1);
                      return (
                        <div key={evt.id ?? i} className="rounded-xl p-4" style={{ border: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              {!!evt.metadata?.device && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#EEF2FF', color: '#4F46E5' }}>{String(evt.metadata.device)}</span>}
                              {!!evt.metadata?.os && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#F0F9FF', color: '#0369A1' }}>{String(evt.metadata.os)}</span>}
                              {!!evt.metadata?.browser && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>{String(evt.metadata.browser)}</span>}
                              {!!(evt.metadata?.city || evt.metadata?.region || evt.metadata?.country) && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#FFF7ED', color: '#C2410C' }}>
                                  📍 {[evt.metadata!.city, evt.metadata!.region, evt.metadata!.country].filter(Boolean).map(String).join(', ')}
                                </span>
                              )}
                              {tot > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{fmtSecs(tot)} total</span>}
                            </div>
                            <span className="text-[11px] flex-shrink-0" style={{ color: '#94A3B8' }}>{formatEventTime(evt.created_at)}</span>
                          </div>
                          {nonZero.length > 0 && (
                            <div className="space-y-1.5">
                              {nonZero.map(([section, secs]) => (
                                <div key={section} className="flex items-center gap-2">
                                  <span className="text-[11px] w-20 flex-shrink-0 capitalize" style={{ color: '#64748B' }}>{section}</span>
                                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
                                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min((secs / maxT) * 100, 100)}%`, backgroundColor: T }} />
                                  </div>
                                  <span className="text-[11px] flex-shrink-0 font-medium" style={{ color: '#475569' }}>{fmtSecs(secs)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
                <h3 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Activity Timeline</h3>
                {events.length === 0 ? <p className="text-sm" style={{ color: '#94A3B8' }}>No events recorded yet.</p> : (
                  <div className="relative">
                    <div className="absolute left-[19px] top-0 bottom-0 w-px" style={{ backgroundColor: '#E2E8F0' }} />
                    <div className="space-y-4">
                      {events.slice(0, 50).map((evt, i) => {
                        const meta = EVENT_ICON[evt.event_type] ?? { icon: Calendar, color: '#64748B', bg: '#F8FAFC', label: evt.event_type };
                        const Icon = meta.icon;
                        return (
                          <div key={evt.id ?? i} className="flex items-start gap-4 relative">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10" style={{ backgroundColor: meta.bg, border: `2px solid ${meta.color}` }}>
                              <Icon className="w-4 h-4" style={{ color: meta.color }} />
                            </div>
                            <div className="flex-1 min-w-0 pt-1.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{meta.label}</p>
                                <p className="text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>{formatEventTime(evt.created_at)}</p>
                              </div>
                              {evt.metadata && (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {/* booking_intent specific fields */}
                                  {evt.event_type === 'booking_intent' && !!evt.metadata.customer_name && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#FDF2F8', color: '#BE185D' }}>
                                      👤 {String(evt.metadata.customer_name)}
                                    </span>
                                  )}
                                  {evt.event_type === 'booking_intent' && !!evt.metadata.adults && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#EEF2FF', color: '#4F46E5' }}>
                                      {String(evt.metadata.adults)} adult{Number(evt.metadata.adults) !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {evt.event_type === 'booking_intent' && !!evt.metadata.batch_start_date && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#ECFDF5', color: '#065F46' }}>
                                      📅 {new Date(String(evt.metadata.batch_start_date)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                  )}
                                  {evt.event_type === 'booking_intent' && !!evt.metadata.total_price && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
                                      ₹{Number(evt.metadata.total_price).toLocaleString('en-IN')}
                                    </span>
                                  )}
                                  {/* rating_submitted chips */}
                                  {evt.event_type === 'rating_submitted' && evt.metadata.rating != null && (
                                    <span className="px-2 py-0.5 rounded-full text-[13px] font-bold" style={{ backgroundColor: '#FFFBEB', color: '#B45309' }}>
                                      {(['😢','😕','😐','🙂','😍'][Number(evt.metadata.rating)] ?? '⭐')}
                                      <span className="text-[11px] font-medium ml-1" style={{ color: '#92400E' }}>
                                        {String(evt.metadata.rating_label ?? '')}
                                      </span>
                                    </span>
                                  )}
                                  {/* batch_selected chips */}
                                  {evt.event_type === 'batch_selected' && !!evt.metadata.batch_name && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#E0F2FE', color: '#0369A1' }}>
                                      {String(evt.metadata.batch_name)}
                                    </span>
                                  )}
                                  {evt.event_type === 'batch_selected' && !!evt.metadata.batch_start_date && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#ECFDF5', color: '#065F46' }}>
                                      📅 {new Date(String(evt.metadata.batch_start_date)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                  )}
                                  {evt.event_type === 'batch_selected' && !!evt.metadata.adult_price && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>
                                      ₹{Number(evt.metadata.adult_price).toLocaleString('en-IN')} / adult
                                    </span>
                                  )}
                                  {/* package_selected chips */}
                                  {evt.event_type === 'package_selected' && !!evt.metadata.option_name && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#FFFBEB', color: '#B45309' }}>
                                      📦 {String(evt.metadata.option_name)}
                                    </span>
                                  )}
                                  {evt.event_type !== 'booking_intent' && evt.event_type !== 'rating_submitted' && evt.event_type !== 'batch_selected' && evt.event_type !== 'package_selected' && evt.metadata.time_spent_seconds != null && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{fmtSecs(Number(evt.metadata.time_spent_seconds))} on page</span>}
                                  {!!evt.metadata.device && evt.event_type === 'quote_viewed' && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#EEF2FF', color: '#4F46E5' }}>{String(evt.metadata.device)} · {String(evt.metadata.os ?? '')}</span>}
                                  {!!(evt.metadata.city || evt.metadata.country) && evt.event_type === 'quote_viewed' && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: '#FFF7ED', color: '#C2410C' }}>📍 {[evt.metadata.city, evt.metadata.country].filter(Boolean).map(String).join(', ')}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── OVERVIEW TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">

            {/* Status bar */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>{quote.status}</span>
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold" style={quote.quote_type === 'PRIVATE' ? { backgroundColor: '#EDE9FE', color: '#6D28D9' } : { backgroundColor: '#FEF3C7', color: '#B45309' }}>{quote.quote_type}</span>
                {/* Link status badge */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={quote.link_active ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                  {quote.link_active ? <LinkIcon className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
                  Link {quote.link_active ? 'Active' : 'Deactivated'}
                </span>
                <span className="text-xs ml-auto" style={{ color: '#94A3B8' }}>Created {new Date(quote.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {editingStatus ? (
                  <div className="flex items-center gap-2">
                    <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="h-8 px-3 rounded-lg border text-xs focus:outline-none appearance-none" style={{ borderColor: '#E2E8F0' }}>
                      {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={saveStatus} disabled={savingStatus} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingStatus(false)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F1F5F9]" style={{ color: '#64748B' }}><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => setEditingStatus(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                    <Edit2 className="w-3 h-3" /> Change Status
                  </button>
                )}
              </div>
            </div>

            {/* Trip Details */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Trip Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <div><p className={lbl} style={lblStyle}>Destination</p><p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><MapPin className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{quote.state.name}</p></div>
                <div><p className={lbl} style={lblStyle}>Start Date</p><p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Calendar className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{fmtDate(quote.start_date)}</p></div>
                <div><p className={lbl} style={lblStyle}>End Date</p><p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Calendar className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{fmtDate(quote.end_date)}</p></div>
                <div><p className={lbl} style={lblStyle}>Duration</p><p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Clock className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{quote.duration_nights}N / {quote.duration_days}D</p></div>
                <div>
                  <p className={lbl} style={lblStyle}>Passengers</p>
                  <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}><Users className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />{totalPax} pax</p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{quote.adults}A{quote.children_5_12 ? ` · ${quote.children_5_12}C(5-12)` : ''}{quote.children_below_5 ? ` · ${quote.children_below_5}C(<5)` : ''}{quote.infants ? ` · ${quote.infants}inf` : ''}</p>
                </div>
                {(quote.pickup_point || quote.drop_point) && (
                  <div><p className={lbl} style={lblStyle}>Pickup / Drop</p><p className="text-sm font-medium" style={{ color: '#0F172A' }}>{quote.pickup_point ?? '—'} → {quote.drop_point ?? '—'}</p></div>
                )}
                {quote.expiry_date && (
                  <div><p className={lbl} style={lblStyle}>Expires</p><p className="text-sm font-semibold" style={{ color: '#EF4444' }}>{fmtDate(quote.expiry_date)}</p></div>
                )}
              </div>
            </div>

            {/* Quote Options with full pricing breakdown */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Quote Options &amp; Pricing Breakdown</h2>
              {quote.quote_options.length === 0 ? (
                <p className="text-sm" style={{ color: '#94A3B8' }}>No options added yet.</p>
              ) : (
                <div className="space-y-3">
                  {quote.quote_options.map(opt => (
                    <OptionPricingCard key={opt.id} opt={opt} adults={quote.adults} quoteId={id} onUpdated={load} />
                  ))}
                </div>
              )}
            </div>

            {/* Day Snapshots */}
            {quote.day_snapshots.length > 0 && (
              <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
                <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Itinerary <span className="font-normal" style={{ color: '#94A3B8' }}>({quote.day_snapshots.length} days)</span></h2>
                <div className="space-y-2">
                  {quote.day_snapshots.map(day => (
                    <div key={day.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: T }}>D{day.day_number}</span>
                      <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{day.title ?? `Day ${day.day_number}`}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Customer */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Customer</h2>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: T }}>
                  {quote.customer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{quote.customer.name}</p>
                  <p className="text-xs flex items-center gap-1.5 mt-1" style={{ color: '#64748B' }}><Phone className="w-3 h-3" />{quote.customer.phone}</p>
                  {quote.customer.email && <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: '#64748B' }}><Mail className="w-3 h-3" />{quote.customer.email}</p>}
                </div>
              </div>
            </div>

            {/* Agent */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <h2 className="text-sm font-bold mb-4" style={{ color: '#0F172A' }}>Assigned Agent</h2>
              {quote.assigned_agent ? (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#64748B' }}>
                    {quote.assigned_agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{quote.assigned_agent.name}</p>
                    <p className="text-xs" style={{ color: '#64748B' }}>{quote.assigned_agent.role}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: '#94A3B8' }}>Unassigned</p>
              )}
            </div>

            {/* Actions */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0', ...cardShadow }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: '#0F172A' }}>Actions</h2>
              <div className="space-y-2">
                <button onClick={() => router.push('/admin/quotes')} className="w-full h-9 rounded-lg text-sm font-semibold text-left px-3 transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  ← All quotes
                </button>
                <Link href="/admin/quotes/create" className="flex w-full h-9 items-center rounded-lg text-sm font-semibold px-3 transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  + New quote
                </Link>
                <a href={`/quotations/${quote.public_token}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full h-9 rounded-lg text-sm font-semibold px-3 transition-colors hover:opacity-90"
                  style={{ backgroundColor: T, color: '#FFFFFF' }}>
                  <ExternalLink className="w-3.5 h-3.5" /> View customer preview
                </a>

                {/* Toggle link */}
                <button onClick={handleToggleLink} disabled={togglingLink}
                  className="flex items-center gap-2 w-full h-9 rounded-lg text-sm font-semibold px-3 transition-colors hover:opacity-90 disabled:opacity-50"
                  style={quote.link_active
                    ? { backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }
                    : { backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
                  {togglingLink
                    ? <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    : quote.link_active ? <Link2Off className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  {quote.link_active ? 'Deactivate Link' : 'Activate Link'}
                </button>

                {/* Delete */}
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 w-full h-9 rounded-lg text-sm font-semibold px-3 transition-colors hover:bg-[#FEF2F2]"
                    style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete Quote
                  </button>
                ) : (
                  <div className="rounded-lg p-3" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#DC2626' }}>Delete this quote permanently?</p>
                    <div className="flex gap-2">
                      <button onClick={handleDelete} disabled={deleting}
                        className="flex-1 h-8 rounded-lg text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: '#DC2626' }}>
                        {deleting ? 'Deleting…' : 'Yes, Delete'}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 h-8 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
                        style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
