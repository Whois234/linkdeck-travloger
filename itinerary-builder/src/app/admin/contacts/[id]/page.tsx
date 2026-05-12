'use client';
/**
 * Contact detail page at /admin/contacts/[id].
 *
 * Two-column layout:
 *   • Left  — read-only contact info card grouped by the same sections as the
 *             Add/Edit modal. Edit button opens the modal.
 *   • Right — quick-action panel: large stage selector, assignee with Reassign
 *             button, follow-up date with quick update, booking + closed date
 *             once converted.
 *   • Below — activity timeline.
 *
 * Stage changes are optimistic — UI updates instantly, sync to DB in background.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Edit2, Phone, Mail, MapPin, Calendar, Briefcase, Users as UsersIcon,
  Tag as TagIcon, AlertTriangle, BadgeCheck, Loader2, Sparkles, MessageCircle,
  UserPlus, FileEdit, Trash2, Save, ExternalLink, TrendingUp, FileText, GitBranch,
} from 'lucide-react';
import { toast } from '@/components/Toaster';
import { QK } from '@/lib/query-hooks';
import type { ContactFormValue } from '../ContactFormModal';

const ContactFormModal = dynamic(() => import('../ContactFormModal'), { ssr: false, loading: () => null });

// ─── Types (mirror what GET /api/v1/crm/contacts/[id] returns) ───────────────

type LeadStage  = 'NEW' | 'CONTACTED' | 'FOLLOW_UP' | 'HOT' | 'CONVERTED' | 'LOST';
type LeadSource = 'CTWA' | 'META_LEAD_FORM' | 'GOOGLE_ADS' | 'WEBSITE' | 'WALK_IN' | 'REFERRAL';
type TripType   = 'HONEYMOON' | 'FAMILY' | 'FRIENDS' | 'SOLO' | 'CORPORATE' | 'PILGRIMAGE' | 'ADVENTURE' | 'GROUP' | 'PRIVATE' | 'OTHER';
type Platform   = 'FACEBOOK' | 'INSTAGRAM' | 'GOOGLE' | 'YOUTUBE' | 'WEBSITE' | 'WHATSAPP';
type DevicePlatform = 'MOBILE' | 'DESKTOP';
type ActivityType = 'STAGE_CHANGE' | 'ASSIGNMENT_CHANGE' | 'WHATSAPP_SENT' | 'LEAD_CREATED' | 'FIELD_UPDATE' | 'CONTACT_DELETED';

interface User { id: string; name: string; email?: string; role?: string }

interface Lead {
  id: string; name: string; status: string; created_at: string;
  stage:    { id: string; name: string; color: string } | null;
  pipeline: { id: string; name: string } | null;
  _count?: { call_logs: number; lead_notes: number };
}

interface QuoteOption { final_price: number | null; is_most_popular: boolean }
interface QuoteEvent  { id: string; event_type: string; created_at: string }
interface Quote {
  id: string; quote_number: string; quote_type: string; status: string;
  start_date: string | null; adults: number; public_token: string; created_at: string;
  state: { name: string; code: string } | null;
  quote_options: QuoteOption[];
  events: QuoteEvent[];
}

interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  metadata: Record<string, unknown> | null;
  performed_by: { id: string; name: string } | null;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  last_known_city: string | null;
  last_seen_at: string | null;

  interested_destination: string | null;
  number_of_travellers:   number | null;
  trip_type:              TripType | null;
  special_requirements:   string | null;
  budget_per_person:      string | number | null;

  lead_source:        LeadSource | null;
  platform:           Platform | null;
  campaign_name:      string | null;
  ad_set_name:        string | null;
  ad_name:            string | null;
  other_ad_details:   Record<string, unknown> | null;
  device_platform:    DevicePlatform | null;
  facebook_click_id:  string | null;
  facebook_browser_id: string | null;
  google_click_id:    string | null;
  platform_lead_id:   string | null;
  gallabox_contact_id: string | null;

  lead_stage:     LeadStage;
  assigned_to_id: string | null;
  assigned_to:    User | null;
  follow_up_date: string | null;
  closed_date:    string | null;
  booking_value:  string | number | null;
  is_converted:   boolean;

  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
  owner: User | null;

  leads: Lead[];
  quotes: Quote[];
  activities: Activity[];
}

interface Tag { id: string; name: string; color: string }

// ─── Badge maps (must match the list page) ───────────────────────────────────

const STAGE_BADGE: Record<LeadStage, { bg: string; color: string; label: string; dotColor: string }> = {
  NEW:       { bg: '#DBEAFE', color: '#1D4ED8', label: 'New',       dotColor: '#3B82F6' },
  CONTACTED: { bg: '#FEF3C7', color: '#B45309', label: 'Contacted', dotColor: '#F59E0B' },
  FOLLOW_UP: { bg: '#FFEDD5', color: '#C2410C', label: 'Follow up', dotColor: '#F97316' },
  HOT:       { bg: '#FEE2E2', color: '#DC2626', label: 'Hot',       dotColor: '#EF4444' },
  CONVERTED: { bg: '#DCFCE7', color: '#15803D', label: 'Converted', dotColor: '#22C55E' },
  LOST:      { bg: '#F1F5F9', color: '#64748B', label: 'Lost',      dotColor: '#94A3B8' },
};
const STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'HOT', 'CONVERTED', 'LOST'];

const SOURCE_BADGE: Record<LeadSource, { bg: string; color: string; label: string }> = {
  CTWA:           { bg: '#DCFCE7', color: '#15803D', label: 'CTWA' },
  META_LEAD_FORM: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Meta Lead Form' },
  GOOGLE_ADS:     { bg: '#FEF3C7', color: '#B45309', label: 'Google Ads' },
  WEBSITE:        { bg: '#EDE9FE', color: '#6D28D9', label: 'Website' },
  WALK_IN:        { bg: '#E0F2F1', color: '#134956', label: 'Walk-in' },
  REFERRAL:       { bg: '#FCE7F3', color: '#BE185D', label: 'Referral' },
};

const TRIP_TYPE_BADGE: Record<TripType, { bg: string; color: string; label: string }> = {
  HONEYMOON:  { bg: '#FCE7F3', color: '#BE185D', label: 'Honeymoon' },
  FAMILY:     { bg: '#FEF3C7', color: '#B45309', label: 'Family' },
  FRIENDS:    { bg: '#DCFCE7', color: '#15803D', label: 'Friends' },
  SOLO:       { bg: '#DBEAFE', color: '#1D4ED8', label: 'Solo' },
  CORPORATE:  { bg: '#F1F5F9', color: '#475569', label: 'Corporate' },
  PILGRIMAGE: { bg: '#FEF9C3', color: '#A16207', label: 'Pilgrimage' },
  ADVENTURE:  { bg: '#FEE2E2', color: '#DC2626', label: 'Adventure' },
  GROUP:      { bg: '#E0E7FF', color: '#4338CA', label: 'Group' },
  PRIVATE:    { bg: '#CFFAFE', color: '#0E7490', label: 'Private' },
  OTHER:      { bg: '#F1F5F9', color: '#64748B', label: 'Other' },
};

// Activity timeline dot colors per spec
const ACTIVITY_DOT: Record<ActivityType, { color: string; bg: string; Icon: React.ElementType }> = {
  LEAD_CREATED:      { color: '#22C55E', bg: '#DCFCE7', Icon: Sparkles },
  STAGE_CHANGE:      { color: '#3B82F6', bg: '#DBEAFE', Icon: FileEdit },
  ASSIGNMENT_CHANGE: { color: '#F59E0B', bg: '#FEF3C7', Icon: UserPlus },
  WHATSAPP_SENT:     { color: '#A855F7', bg: '#F3E8FF', Icon: MessageCircle },
  FIELD_UPDATE:      { color: '#64748B', bg: '#F1F5F9', Icon: FileEdit },
  CONTACT_DELETED:   { color: '#DC2626', bg: '#FEE2E2', Icon: Trash2 },
};

const T = '#134956';

const QUOTE_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:     { bg: '#F1F5F9', color: '#64748B', label: 'Draft' },
  SENT:      { bg: '#DBEAFE', color: '#1D4ED8', label: 'Sent' },
  VIEWED:    { bg: '#FEF3C7', color: '#B45309', label: 'Viewed' },
  APPROVED:  { bg: '#DCFCE7', color: '#15803D', label: 'Approved' },
  CONFIRMED: { bg: '#D1FAE5', color: '#065F46', label: 'Confirmed' },
  EXPIRED:   { bg: '#FEE2E2', color: '#DC2626', label: 'Expired' },
  CANCELLED: { bg: '#F1F5F9', color: '#94A3B8', label: 'Cancelled' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string | Date) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtINR(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 30)  return `${dd}d ago`;
  const mo = Math.floor(dd / 30);
  if (mo < 12)  return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function contactToFormValue(c: Contact): Partial<ContactFormValue> {
  type OtherAd = {
    keyword?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string;
    utm_term?: string; utm_content?: string; landing_page?: string;
  };
  const other = (c.other_ad_details as unknown as OtherAd) ?? {};
  return {
    id:                     c.id,
    name:                   c.name ?? '',
    phone:                  c.phone ?? '',
    email:                  c.email ?? '',
    city:                   c.city ?? '',
    interested_destination: c.interested_destination ?? '',
    number_of_travellers:   c.number_of_travellers != null ? String(c.number_of_travellers) : '',
    trip_type:              (c.trip_type ?? '') as ContactFormValue['trip_type'],
    special_requirements:   c.special_requirements ?? '',
    budget_per_person:      c.budget_per_person != null ? String(c.budget_per_person) : '',
    lead_source:            (c.lead_source ?? '') as ContactFormValue['lead_source'],
    platform:               (c.platform ?? '') as ContactFormValue['platform'],
    campaign_name:          c.campaign_name ?? '',
    ad_set_name:            c.ad_set_name ?? '',
    ad_name:                c.ad_name ?? '',
    device_platform:        (c.device_platform ?? '') as ContactFormValue['device_platform'],
    gallabox_contact_id:    c.gallabox_contact_id ?? '',
    platform_lead_id:       c.platform_lead_id ?? '',
    facebook_click_id:      c.facebook_click_id ?? '',
    facebook_browser_id:    c.facebook_browser_id ?? '',
    google_click_id:        c.google_click_id ?? '',
    other_keyword:          other.keyword      ?? '',
    other_utm_source:       other.utm_source   ?? '',
    other_utm_medium:       other.utm_medium   ?? '',
    other_utm_campaign:     other.utm_campaign ?? '',
    other_utm_term:         other.utm_term     ?? '',
    other_utm_content:      other.utm_content  ?? '',
    other_landing_page:     other.landing_page ?? '',
    lead_stage:             c.lead_stage,
    assigned_to_id:         c.assigned_to_id ?? '',
    follow_up_date:         c.follow_up_date ? c.follow_up_date.slice(0, 10) : '',
    tags:                   c.tags ?? [],
    do_not_contact:         c.do_not_contact ?? false,
    booking_value:          c.booking_value != null ? String(c.booking_value) : '',
    created_at:             c.created_at,
    closed_date:            c.closed_date,
    is_converted:           c.is_converted,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [contact, setContact] = useState<Contact | null>(null);
  const [users,   setUsers]   = useState<User[]>([]);
  const [tags,    setTags]    = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingStage,   setSavingStage]   = useState(false);
  const [reassigning,   setReassigning]   = useState(false);
  const [showAssignee,  setShowAssignee]  = useState(false);
  const [updatingFollowUp, setUpdatingFollowUp] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [cr, ur, tr] = await Promise.all([
        fetch(`/api/v1/crm/contacts/${params.id}`),
        fetch('/api/v1/users'),
        fetch('/api/v1/crm/contact-tags'),
      ]);
      const [cd, ud, td] = await Promise.all([cr.json(), ur.json(), tr.json()]);
      if (cd.success) {
        setContact(cd.data as Contact);
        setFollowUpInput((cd.data as Contact).follow_up_date ? (cd.data as Contact).follow_up_date!.slice(0, 10) : '');
      }
      if (ud.success) setUsers(Array.isArray(ud.data) ? ud.data : (ud.data?.items ?? []));
      if (td.success) setTags(Array.isArray(td.data) ? td.data : []);
    } catch (e) {
      toast.error(`Failed to load: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.id]);

  // ── Optimistic stage change ─────────────────────────────────────────────────
  async function changeStage(next: LeadStage) {
    if (!contact || contact.lead_stage === next) return;
    const prev = contact;
    // Optimistic patch — auto-flip conversion side-effects to match server.
    const becomingConverted = next === 'CONVERTED';
    setContact({
      ...contact,
      lead_stage:   next,
      is_converted: becomingConverted,
      closed_date:  becomingConverted ? new Date().toISOString() : null,
    });
    setSavingStage(true);
    try {
      const res = await fetch(`/api/v1/crm/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_stage: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Stage → ${STAGE_BADGE[next].label}`);
      // Refresh just to pull the activity entry the service wrote in the same txn.
      load();
      qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch (e) {
      setContact(prev); // rollback
      toast.error(`Could not change stage: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingStage(false);
    }
  }

  async function reassign(userId: string | null) {
    if (!contact) return;
    setReassigning(true);
    try {
      const res = await fetch(`/api/v1/crm/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to_id: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(userId ? 'Contact reassigned' : 'Unassigned');
      setShowAssignee(false);
      load();
      qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch (e) {
      toast.error(`Could not reassign: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setReassigning(false);
    }
  }

  async function saveFollowUp() {
    if (!contact) return;
    setUpdatingFollowUp(true);
    try {
      const res = await fetch(`/api/v1/crm/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follow_up_date: followUpInput || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success('Follow-up updated');
      load();
    } catch (e) {
      toast.error(`Could not update: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setUpdatingFollowUp(false);
    }
  }

  async function softDelete() {
    if (!contact) return;
    if (!confirm(`Delete contact "${contact.name}"? This soft-deletes — can be restored from the database.`)) return;
    const res = await fetch(`/api/v1/crm/contacts/${contact.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Contact deleted');
      qc.invalidateQueries({ queryKey: ['contacts'] });
      router.push('/admin/contacts');
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? 'Delete failed');
    }
  }

  const tagByName = useMemo(() => Object.fromEntries(tags.map(t => [t.name, t])), [tags]);

  if (loading && !contact) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: T }} />
      </div>
    );
  }
  if (!contact) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-base font-semibold" style={{ color: '#0F172A' }}>Contact not found</p>
        <Link href="/admin/contacts" className="text-sm mt-3 inline-flex items-center gap-1.5 font-semibold" style={{ color: T }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Contacts
        </Link>
      </div>
    );
  }

  const stageStyle  = STAGE_BADGE[contact.lead_stage];
  const sourceStyle = contact.lead_source ? SOURCE_BADGE[contact.lead_source] : null;
  const tripStyle   = contact.trip_type ? TRIP_TYPE_BADGE[contact.trip_type] : null;
  const followUpPast = contact.follow_up_date && new Date(contact.follow_up_date).getTime() < Date.now();

  return (
    <div className="max-w-[1280px] space-y-5">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <nav className="flex items-center gap-1.5 text-xs">
          <Link href="/admin/contacts" className="font-medium transition-colors hover:underline" style={{ color: '#94A3B8' }}>
            Contacts
          </Link>
          <span style={{ color: '#CBD5E1' }}>/</span>
          <span className="font-semibold" style={{ color: '#0F172A' }}>{contact.name}</span>
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            <Edit2 className="w-3.5 h-3.5" /> Edit Contact
          </button>
          <button onClick={softDelete}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-[#FEF2F2]"
            style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Do Not Contact warning */}
      {contact.do_not_contact && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
          <div>
            <p className="text-sm font-bold" style={{ color: '#B91C1C' }}>Do Not Contact</p>
            <p className="text-xs mt-0.5" style={{ color: '#7F1D1D' }}>
              This contact has explicitly opted out of communication. Block all outbound WhatsApp, email and SMS.
            </p>
          </div>
        </div>
      )}

      {/* ── Contact Analysis ─────────────────────────────────────────────────── */}
      <ContactAnalysis contact={contact} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">

        {/* LEFT — Info card */}
        <div className="space-y-5">
          {/* Hero */}
          <div className="bg-white rounded-2xl px-5 py-4 flex items-center gap-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: contact.is_converted ? '#22C55E' : T }}>
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate" style={{ color: '#0F172A' }}>{contact.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                  <Phone className="w-3 h-3" />{contact.phone}
                </span>
                {contact.email && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                    <Mail className="w-3 h-3" />{contact.email}
                  </span>
                )}
                {(contact.city || contact.last_known_city) && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                    <MapPin className="w-3 h-3" />{contact.city ?? contact.last_known_city}
                  </span>
                )}
              </div>
              {(contact.tags ?? []).length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mt-2">
                  {(contact.tags ?? []).map(name => {
                    const colour = tagByName[name]?.color ?? '#64748B';
                    return (
                      <span key={name} className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                        style={{ backgroundColor: colour + '20', color: colour }}>{name}</span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Travel Interest */}
          <InfoSection icon={Briefcase} title="Travel Interest">
            <InfoGrid>
              <InfoField label="Interested Destination" value={contact.interested_destination ?? '—'} />
              <InfoField label="Number of Travellers"   value={contact.number_of_travellers != null ? String(contact.number_of_travellers) : '—'} />
              <InfoField label="Trip Type" value={tripStyle ? <Chip {...tripStyle} /> : '—'} />
              <InfoField label="Budget per Person"      value={fmtINR(contact.budget_per_person)} />
              <InfoField label="Special Requirements"   value={contact.special_requirements ?? '—'} fullWidth />
            </InfoGrid>
          </InfoSection>

          {/* Lead Source & Ad Data */}
          <InfoSection icon={Sparkles} title="Lead Source & Ad Data">
            <InfoGrid>
              <InfoField label="Lead Source" value={sourceStyle ? <Chip {...sourceStyle} /> : (contact.source ?? '—')} />
              <InfoField label="Platform" value={contact.platform ?? '—'} />
              <InfoField label="Campaign Name" value={contact.campaign_name ?? '—'} />
              <InfoField label="Ad Set Name" value={contact.ad_set_name ?? '—'} />
              <InfoField label="Ad Name" value={contact.ad_name ?? '—'} />
              <InfoField label="Device" value={contact.device_platform ?? '—'} />
              {contact.gallabox_contact_id && <InfoField label="Gallabox ID" value={<span className="font-mono text-[11px]">{contact.gallabox_contact_id}</span>} />}
              {contact.platform_lead_id && <InfoField label="Platform Lead ID" value={<span className="font-mono text-[11px]">{contact.platform_lead_id}</span>} />}
              {contact.facebook_click_id && <InfoField label="FB Click ID" value={<span className="font-mono text-[11px] truncate block">{contact.facebook_click_id}</span>} />}
              {contact.facebook_browser_id && <InfoField label="FB Browser ID" value={<span className="font-mono text-[11px] truncate block">{contact.facebook_browser_id}</span>} />}
              {contact.google_click_id && <InfoField label="Google Click ID" value={<span className="font-mono text-[11px] truncate block">{contact.google_click_id}</span>} fullWidth />}
            </InfoGrid>
          </InfoSection>

          {/* Record details */}
          <InfoSection icon={Calendar} title="Record">
            <InfoGrid>
              <InfoField label="Created" value={fmtDateTime(contact.created_at)} />
              <InfoField label="Last Updated" value={fmtDateTime(contact.updated_at)} />
              <InfoField label="Owner" value={contact.owner?.name ?? '—'} />
              {contact.is_converted && contact.closed_date && (
                <InfoField label="Closed Date" value={fmtDateTime(contact.closed_date)} />
              )}
            </InfoGrid>
          </InfoSection>
        </div>

        {/* RIGHT — Quick actions */}
        <div className="space-y-4">
          {/* Stage selector */}
          <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Lead Stage</p>
              {savingStage && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: T }} />}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {STAGES.map(s => {
                const style = STAGE_BADGE[s];
                const active = contact.lead_stage === s;
                return (
                  <button key={s} onClick={() => changeStage(s)} disabled={savingStage}
                    className="px-2.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                    style={{
                      backgroundColor: active ? style.bg : '#fff',
                      color:           active ? style.color : '#64748B',
                      border:          `1px solid ${active ? style.color : '#E2E8F0'}`,
                      boxShadow:       active ? `0 0 0 1px ${style.color}` : 'none',
                    }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: style.dotColor }} />
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assignee */}
          <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Assigned To</p>
              <button onClick={() => setShowAssignee(v => !v)}
                className="text-[11px] font-semibold transition-colors hover:underline" style={{ color: T }}>
                {contact.assigned_to ? 'Reassign' : 'Assign'}
              </button>
            </div>
            {contact.assigned_to ? (
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: T }}>
                  {contact.assigned_to.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{contact.assigned_to.name}</p>
                  {contact.assigned_to.email && <p className="text-[11px] truncate" style={{ color: '#94A3B8' }}>{contact.assigned_to.email}</p>}
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: '#94A3B8' }}>Unassigned</p>
            )}
            {showAssignee && (
              <div className="mt-3 max-h-[200px] overflow-y-auto rounded-lg" style={{ border: '1px solid #E2E8F0' }}>
                <button onClick={() => reassign(null)} disabled={reassigning}
                  className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                  style={{ color: '#94A3B8', borderBottom: '1px solid #F1F5F9' }}>
                  Unassign
                </button>
                {users.map(u => (
                  <button key={u.id} onClick={() => reassign(u.id)} disabled={reassigning || u.id === contact.assigned_to_id}
                    className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[#F8FAFC] disabled:opacity-30 disabled:bg-[#F8FAFC]"
                    style={{ color: '#0F172A', borderBottom: '1px solid #F1F5F9' }}>
                    <span className="font-semibold">{u.name}</span>
                    {u.role && <span className="ml-1.5 text-[10px]" style={{ color: '#94A3B8' }}>({u.role})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Follow Up */}
          <div className="bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>Follow Up Date</p>
            <div className="flex items-center gap-2">
              <input type="date" value={followUpInput} onChange={e => setFollowUpInput(e.target.value)}
                className="flex-1 h-9 px-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#134956]/15"
                style={{ border: '1px solid #E2E8F0', color: followUpPast && followUpInput === (contact.follow_up_date ?? '').slice(0,10) ? '#DC2626' : '#0F172A' }} />
              <button onClick={saveFollowUp} disabled={updatingFollowUp || followUpInput === (contact.follow_up_date ?? '').slice(0, 10)}
                className="h-9 px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-30"
                style={{ backgroundColor: T }}>
                {updatingFollowUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              </button>
            </div>
            {followUpPast && contact.follow_up_date && (
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: '#DC2626' }}>
                ⚠ {fmtDate(contact.follow_up_date)} is in the past
              </p>
            )}
          </div>

          {/* Conversion details (only when converted) */}
          {contact.is_converted && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <div className="flex items-center gap-2 mb-2">
                <BadgeCheck className="w-4 h-4" style={{ color: '#15803D' }} />
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#15803D' }}>Converted</p>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#86EFAC' }}>Booking Value</p>
                  <p className="text-lg font-bold" style={{ color: '#0F172A' }}>{fmtINR(contact.booking_value)}</p>
                </div>
                {contact.closed_date && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#86EFAC' }}>Closed Date</p>
                    <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{fmtDate(contact.closed_date)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Quotes ────────────────────────────────────────────────────────────── */}
      {(contact.quotes ?? []).length > 0 && (
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E2E8F0' }}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#0F172A' }}>
            <FileText className="w-4 h-4" style={{ color: T }} />
            Quotes ({contact.quotes.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  {['Quote #', 'Type', 'Destination', 'Date', 'PAX', 'Price', 'Status', ''].map(h => (
                    <th key={h} className="text-left pb-2 pr-4 font-bold uppercase tracking-wider" style={{ color: '#94A3B8', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contact.quotes.map(q => {
                  const bestPrice = q.quote_options.reduce<number | null>((best, o) =>
                    o.final_price !== null && (best === null || o.final_price < best) ? o.final_price : best, null);
                  const popularPrice = q.quote_options.find(o => o.is_most_popular)?.final_price ?? bestPrice;
                  const qs = QUOTE_STATUS[q.status] ?? { bg: '#F1F5F9', color: '#64748B', label: q.status };
                  const openedCount = q.events.filter(e => e.event_type === 'VIEWED').length;
                  return (
                    <tr key={q.id} className="border-t" style={{ borderColor: '#F8FAFC' }}>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono font-bold" style={{ color: T }}>{q.quote_number}</span>
                        {openedCount > 0 && (
                          <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>
                            👁 {openedCount}×
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: '#E0E7FF', color: '#4338CA' }}>
                          {q.quote_type}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4" style={{ color: '#0F172A' }}>{q.state?.name ?? '—'}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: '#64748B' }}>
                        {q.start_date ? fmtDate(q.start_date) : '—'}
                      </td>
                      <td className="py-2.5 pr-4" style={{ color: '#64748B' }}>{q.adults}</td>
                      <td className="py-2.5 pr-4 font-semibold whitespace-nowrap" style={{ color: '#0F172A' }}>
                        {popularPrice !== null ? `₹${Math.round(popularPrice).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: qs.bg, color: qs.color }}>
                          {qs.label}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <a href={`/admin/quotes/${q.id}`}
                          className="flex items-center gap-0.5 font-semibold hover:underline whitespace-nowrap"
                          style={{ color: T }}>
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Activity Timeline ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E2E8F0' }}>
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: '#0F172A' }}>
          <TagIcon className="w-4 h-4" style={{ color: T }} />
          Activity Timeline
        </h3>
        {(contact.activities ?? []).length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: '#94A3B8' }}>No activity yet.</p>
        ) : (
          <ol className="relative space-y-0">
            <span className="absolute left-[15px] top-3 bottom-3 w-px" style={{ backgroundColor: '#E2E8F0' }} />
            {contact.activities.map(act => {
              const cfg = ACTIVITY_DOT[act.type] ?? ACTIVITY_DOT.FIELD_UPDATE;
              const Icon = cfg.Icon;
              return (
                <li key={act.id} className="relative pl-10 py-2.5">
                  <span className="absolute left-0 top-2.5 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: cfg.bg, border: '2px solid #fff', boxShadow: `0 0 0 1px ${cfg.color}40` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                  </span>
                  <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{act.description}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                    {timeAgo(act.created_at)} · {fmtDateTime(act.created_at)}
                    {act.performed_by ? ` · by ${act.performed_by.name}` : ' · by system'}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Edit modal */}
      <ContactFormModal
        open={editing}
        mode="edit"
        initial={contactToFormValue(contact)}
        users={users}
        tags={tags}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
          qc.invalidateQueries({ queryKey: ['contacts'] });
        }}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E2E8F0' }}>
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#0F172A' }}>
        <Icon className="w-4 h-4" style={{ color: T }} />
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function InfoField({ label, value, fullWidth }: { label: string; value: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>{label}</p>
      <div className="text-sm" style={{ color: '#0F172A' }}>{value}</div>
    </div>
  );
}

function Chip({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color }}>{label}</span>
  );
}

// ─── Contact Analysis card ────────────────────────────────────────────────────

function ContactAnalysis({ contact }: { contact: Contact }) {
  const totalQuotes   = contact.quotes?.length ?? 0;
  const totalLeads    = contact.leads?.length ?? 0;
  const activeLead    = contact.leads?.find(l => l.pipeline !== null);
  const viewedCount   = (contact.quotes ?? []).reduce((n, q) => n + q.events.filter(e => e.event_type === 'VIEWED').length, 0);
  const bookingValue  = contact.booking_value;

  const stats: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: string; color: string; bg: string }[] = [
    {
      icon:  FileText,
      label: 'Total Quotes',
      value: totalQuotes,
      sub:   totalQuotes > 0 ? `${viewedCount} view${viewedCount === 1 ? '' : 's'}` : 'None sent yet',
      color: '#4338CA', bg: '#EDE9FE',
    },
    {
      icon:  GitBranch,
      label: 'Pipeline',
      value: activeLead ? (activeLead.pipeline?.name ?? 'In pipeline') : 'Not in pipeline',
      sub:   activeLead?.stage ? activeLead.stage.name : (totalLeads > 0 ? `${totalLeads} lead${totalLeads > 1 ? 's' : ''}` : 'No leads'),
      color: activeLead ? '#0E7490' : '#94A3B8', bg: activeLead ? '#CFFAFE' : '#F1F5F9',
    },
    {
      icon:  TrendingUp,
      label: 'Booking Value',
      value: contact.is_converted ? fmtINR(bookingValue) : '—',
      sub:   contact.is_converted ? 'Converted' : 'Not converted',
      color: contact.is_converted ? '#15803D' : '#94A3B8',
      bg:    contact.is_converted ? '#DCFCE7' : '#F1F5F9',
    },
    {
      icon:  UsersIcon,
      label: 'Assigned To',
      value: contact.assigned_to?.name ?? 'Unassigned',
      sub:   contact.assigned_to?.role ?? (contact.owner?.name ? `Owner: ${contact.owner.name}` : ''),
      color: contact.assigned_to ? T : '#94A3B8',
      bg:    contact.assigned_to ? '#E0F2F1' : '#F1F5F9',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(({ icon: Icon, label, value, sub, color, bg }) => (
        <div key={label} className="bg-white rounded-2xl p-4 flex items-start gap-3" style={{ border: '1px solid #E2E8F0' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>{label}</p>
            <p className="text-sm font-bold truncate mt-0.5" style={{ color: '#0F172A' }}>{value}</p>
            {sub && <p className="text-[10px] truncate" style={{ color }}>{sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
