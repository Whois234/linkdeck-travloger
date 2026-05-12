'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useContacts, useUsers, QK } from '@/lib/query-hooks';
import { TableSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toaster';
import {
  Search, Phone, Mail, Plus, X, Calendar, ChevronDown, AlertTriangle,
  Loader2, Edit2, ChevronRight, CheckSquare, Square, ChevronLeft, ExternalLink,
  Save, User, Trash2, Tag as TagIcon, Check, Download, Filter as FilterIcon,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { ContactFormValue } from './ContactFormModal';

// Lazy-load the full Add/Edit modal — heavy form, not needed on first paint.
const ContactFormModal = dynamic(() => import('./ContactFormModal'), {
  ssr: false,
  loading: () => null,
});

interface Stage    { id: string; name: string; color: string }
interface Pipeline { id: string; name: string }
interface Lead     {
  id: string; name: string; status: string; created_at: string;
  destination_interest: string | null;
  budget_range:         string | null;
  travel_month:         string | null;
  stage: Stage | null; pipeline: Pipeline | null;
  _count?: { call_logs: number; lead_notes: number };
}
interface Owner { id: string; name: string; email: string }

interface QuoteEvent { id: string; event_type: string; metadata: Record<string, unknown> | null; created_at: string }
interface ContactQuote {
  id: string; quote_number: string; quote_type: string; status: string;
  start_date: string; adults: number; public_token: string; created_at: string;
  state: { name: string; code: string };
  quote_options: Array<{ final_price: number | null; is_most_popular: boolean }>;
  events: QuoteEvent[];
}

interface ContactTag { id: string; name: string; color: string }

type LeadStage  = 'NEW' | 'CONTACTED' | 'FOLLOW_UP' | 'HOT' | 'CONVERTED' | 'LOST';
type LeadSource = 'CTWA' | 'META_LEAD_FORM' | 'GOOGLE_ADS' | 'WEBSITE' | 'WALK_IN' | 'REFERRAL';
type TripType   = 'HONEYMOON' | 'FAMILY' | 'FRIENDS' | 'SOLO' | 'CORPORATE' | 'PILGRIMAGE' | 'ADVENTURE' | 'GROUP' | 'PRIVATE' | 'OTHER';

interface Contact {
  id: string; name: string; phone: string; email: string | null;
  source: string | null; notes: string | null;
  is_converted: boolean; converted_at: string | null; created_at: string;
  last_known_city: string | null; last_seen_at: string | null;
  city: string | null;
  tags: string[];
  custom_fields: Record<string, unknown> | null;
  owner: Owner | null; owner_id: string;
  leads: Lead[];
  quotes?: ContactQuote[];

  // Travel interest
  interested_destination: string | null;
  number_of_travellers:   number | null;
  trip_type:              string | null;
  special_requirements:   string | null;
  budget_per_person:      string | number | null; // Decimal serialises to string

  // Lead source & Ad data
  lead_source:         string | null;
  platform:            string | null;
  campaign_name:       string | null;
  ad_set_name:         string | null;
  ad_name:             string | null;
  device_platform:     string | null;
  gallabox_contact_id: string | null;
  platform_lead_id:    string | null;
  facebook_click_id:   string | null;
  facebook_browser_id: string | null;
  google_click_id:     string | null;
  other_ad_details:    Record<string, string> | null;
  // CRM
  lead_stage:     LeadStage;
  assigned_to_id: string | null;
  assigned_to:    Owner | null;
  follow_up_date: string | null;
  closed_date:    string | null;
  booking_value:  string | number | null;
  do_not_contact: boolean;
  // Creator
  created_by?: Owner | null;
  // Merged from Customer module
  nationality?:  string | null;
  quotes_count?: number;
}

interface DuplicateAttempt {
  id: string; phone: string; created_at: string;
  attempted_by_user:   { name: string } | null;
  existing_owner_user: { name: string } | null;
}

interface CrmUser { id: string; name: string; role: string }

const DATE_RANGES = [
  { label: 'All time',    value: '' },
  { label: 'Today',       value: 'today' },
  { label: 'Yesterday',   value: 'yesterday' },
  { label: 'This week',   value: 'this_week' },
  { label: 'Past 7 days', value: 'past_7' },
  { label: 'Custom',      value: 'custom' },
];

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Translate a Contact (API row) into the modal's flat form value shape.
function contactToFormValue(c: Contact): Partial<ContactFormValue> {
  type OtherAd = {
    keyword?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string;
    utm_term?: string; utm_content?: string; landing_page?: string;
  };
  const other = (c.custom_fields as unknown as OtherAd) ?? {};
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
    lead_stage:             c.lead_stage,
    assigned_to_id:         c.assigned_to_id ?? '',
    follow_up_date:         c.follow_up_date ? c.follow_up_date.slice(0, 10) : '',
    tags:                   c.tags ?? [],
    do_not_contact:         c.do_not_contact ?? false,
    booking_value:          c.booking_value != null ? String(c.booking_value) : '',
    other_keyword:          other.keyword      ?? '',
    other_utm_source:       other.utm_source   ?? '',
    other_utm_medium:       other.utm_medium   ?? '',
    other_utm_campaign:     other.utm_campaign ?? '',
    other_utm_term:         other.utm_term     ?? '',
    other_utm_content:      other.utm_content  ?? '',
    other_landing_page:     other.landing_page ?? '',
    created_at:             c.created_at,
    closed_date:            c.closed_date,
    is_converted:           c.is_converted,
  };
}

function fmtINR(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ─── Badge styling ───────────────────────────────────────────────────────────

const STAGE_BADGE: Record<LeadStage, { bg: string; color: string; label: string }> = {
  NEW:       { bg: '#DBEAFE', color: '#1D4ED8', label: 'New' },
  CONTACTED: { bg: '#FEF3C7', color: '#B45309', label: 'Contacted' },
  FOLLOW_UP: { bg: '#FFEDD5', color: '#C2410C', label: 'Follow up' },
  HOT:       { bg: '#FEE2E2', color: '#DC2626', label: 'Hot' },
  CONVERTED: { bg: '#DCFCE7', color: '#15803D', label: 'Converted' },
  LOST:      { bg: '#F1F5F9', color: '#64748B', label: 'Lost' },
};

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

const STAGES: LeadStage[]  = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'HOT', 'CONVERTED', 'LOST'];
const SOURCES: LeadSource[] = ['CTWA', 'META_LEAD_FORM', 'GOOGLE_ADS', 'WEBSITE', 'WALK_IN', 'REFERRAL'];

// Helper to look up a badge, with graceful fallback for custom/unknown values
function getSourceBadge(v: string | null): { bg: string; color: string; label: string } | null {
  if (!v) return null;
  return SOURCE_BADGE[v as LeadSource] ?? { bg: '#F1F5F9', color: '#64748B', label: v };
}
function getTripBadge(v: string | null): { bg: string; color: string; label: string } | null {
  if (!v) return null;
  return TRIP_TYPE_BADGE[v as TripType] ?? { bg: '#F1F5F9', color: '#64748B', label: v };
}

function Chip({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color }}>
      {children}
    </span>
  );
}

// ─── Platform & OS premium badges ───────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  facebook:        { label: 'Facebook',   bg: '#1877F212', color: '#1877F2', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg> },
  meta_ads:        { label: 'Meta Ads',   bg: '#0082FB12', color: '#0082FB', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#0082FB"><path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.186.24.358.48.54.744l1.522 2.28c1.656 2.46 2.643 3.504 4.305 3.504 1.226 0 2.271-.56 2.94-1.51.364-.505.62-1.116.705-1.79a8.726 8.726 0 0 0 .056-.96c0-2.084-.65-4.56-1.97-6.337C20.084 5.26 18.413 4.03 16.452 4.03c-1.312 0-2.436.46-3.494 1.387a9.688 9.688 0 0 0-.585.533 8.39 8.39 0 0 0-.447.49c-.126.15-.252.3-.365.46a5.682 5.682 0 0 0-.35-.468 8.16 8.16 0 0 0-.46-.52C9.69 4.73 8.497 4.03 6.915 4.03z"/></svg> },
  instagram:       { label: 'Instagram',  bg: '#E1306C12', color: '#E1306C', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#E1306C"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg> },
  google_ads:      { label: 'Google Ads', bg: '#4285F412', color: '#4285F4', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> },
  whatsapp:        { label: 'WhatsApp',   bg: '#25D36612', color: '#25D366', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> },
  ctwa:            { label: 'CTWA',       bg: '#25D36612', color: '#25D366', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> },
  website:         { label: 'Website',    bg: '#64748B12', color: '#475569', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  referral:        { label: 'Referral',   bg: '#8B5CF612', color: '#7C3AED', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  walk_in:         { label: 'Walk-in',    bg: '#F59E0B12', color: '#D97706', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="2"/><path d="M5 22l2-7 3 3 2-8"/><path d="M19 22l-2-7-3 3-2-8"/></svg> },
  meta_lead_form:  { label: 'Meta Form',  bg: '#0082FB12', color: '#0082FB', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#0082FB"><path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.186.24.358.48.54.744l1.522 2.28c1.656 2.46 2.643 3.504 4.305 3.504 1.226 0 2.271-.56 2.94-1.51.364-.505.62-1.116.705-1.79a8.726 8.726 0 0 0 .056-.96c0-2.084-.65-4.56-1.97-6.337C20.084 5.26 18.413 4.03 16.452 4.03c-1.312 0-2.436.46-3.494 1.387a9.688 9.688 0 0 0-.585.533 8.39 8.39 0 0 0-.447.49c-.126.15-.252.3-.365.46a5.682 5.682 0 0 0-.35-.468 8.16 8.16 0 0 0-.46-.52C9.69 4.73 8.497 4.03 6.915 4.03z"/></svg> },
};

const OS_META: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  iOS:     { label: 'iOS',     bg: '#00000010', color: '#1C1C1E', icon: <svg width="10" height="10" viewBox="0 0 814 1000" fill="#1C1C1E"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-39.5-150.3-108.8c-52.8-82.4-106.8-209.5-106.8-330.4 0-194.3 125.4-297.5 248.6-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg> },
  macOS:   { label: 'macOS',   bg: '#00000010', color: '#1C1C1E', icon: <svg width="10" height="10" viewBox="0 0 814 1000" fill="#1C1C1E"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-39.5-150.3-108.8c-52.8-82.4-106.8-209.5-106.8-330.4 0-194.3 125.4-297.5 248.6-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg> },
  Android: { label: 'Android', bg: '#3DDC8412', color: '#2E7D32', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#3DDC84"><path d="M17.523 15.341A1 1 0 0 1 16.53 16H7.47a1 1 0 0 1-.993-1.341l1.267-4.341A6.978 6.978 0 0 1 12 9a6.978 6.978 0 0 1 4.256 1.318l1.267 4.023zM15.5 6.5L17 5M8.5 6.5L7 5M12 3a7 7 0 0 0-7 7v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a7 7 0 0 0-7-7z"/></svg> },
  Windows: { label: 'Windows', bg: '#0078D412', color: '#0078D4', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="#0078D4"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg> },
  Linux:   { label: 'Linux',   bg: '#F9A82512', color: '#E65100', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#E65100" strokeWidth="1.8" strokeLinecap="round"><ellipse cx="12" cy="6" rx="4" ry="5"/><path d="M8 11c-3 1-5 4-4 8h16c1-4-1-7-4-8"/><path d="M9 19c-.5 1.5-.5 3 1 3m5-3c.5 1.5.5 3-1 3"/></svg> },
};

const DEV_META: Record<string, { label: string; icon: React.ReactNode }> = {
  Mobile:  { label: 'Mobile',  icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg> },
  MOBILE:  { label: 'Mobile',  icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg> },
  Tablet:  { label: 'Tablet',  icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="2" width="18" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg> },
  Desktop: { label: 'Desktop', icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
  DESKTOP: { label: 'Desktop', icon: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
};

function getPlatformMeta(val: string | null | undefined) {
  if (!val) return null;
  return PLATFORM_META[val.toLowerCase().replace(/[^a-z0-9]/g, '_')] ?? PLATFORM_META[val.toLowerCase()] ?? { label: val.replace(/_/g, ' '), bg: '#64748B12', color: '#475569', icon: null };
}

function PlatformBadge({ platform, os, device }: { platform?: string | null; os?: string | null; device?: string | null }) {
  const pm = getPlatformMeta(platform);
  const om = os ? (OS_META[os] ?? null) : null;
  const dm = device ? (DEV_META[device] ?? null) : null;
  if (!pm && !om && !dm) return <span style={{ color: '#CBD5E1' }}>—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {pm && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ backgroundColor: pm.bg, color: pm.color, border: `1px solid ${pm.color}20` }}>
          {pm.icon}{pm.label}
        </span>
      )}
      {om && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ backgroundColor: om.bg, color: om.color, border: `1px solid ${om.color}20` }}>
          {om.icon}{om.label}
        </span>
      )}
      {!om && dm && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ backgroundColor: '#64748B12', color: '#475569', border: '1px solid #47556920' }}>
          {dm.icon}{dm.label}
        </span>
      )}
    </div>
  );
}

// ─── Contact Detail Panel ────────────────────────────────────────────────────
function ContactPanel({
  contact, users, allTags, onClose, onUpdated, onEditFull,
}: {
  contact: Contact; users: CrmUser[]; allTags: ContactTag[];
  onClose: () => void; onUpdated: () => void; onEditFull: (c: Contact) => void;
}) {
  const [detail, setDetail] = useState<Contact | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/v1/crm/contacts/${contact.id}`).then(r => r.json()).then(d => { if (d.success) setDetail(d.data); }).catch(() => {});
  }, [contact.id]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) setShowTagPicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function toggleTag(name: string) {
    const current = detail?.tags ?? contact.tags ?? [];
    const next = current.includes(name) ? current.filter(t => t !== name) : [...current, name];
    const res = await fetch(`/api/v1/crm/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: next }),
    });
    const data = await res.json();
    if (data.success) {
      setDetail(prev => prev ? { ...prev, tags: next } : prev);
      onUpdated();
    }
  }

  const c = detail ?? contact;

  async function deleteContact() {
    setDeleting(true);
    await fetch(`/api/v1/crm/contacts/${contact.id}`, { method: 'DELETE' });
    setDeleting(false);
    onClose(); onUpdated();
  }

  const withPipeline = c.leads.filter(l => l.pipeline !== null).length;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full sm:w-[520px] sm:max-w-[90vw] bg-white flex flex-col shadow-2xl overflow-hidden" style={{ borderLeft: '1px solid #E2E8F0' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: c.is_converted ? '#22C55E' : '#134956' }}>
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: '#0F172A' }}>{c.name}</p>
              <p className="text-xs" style={{ color: '#64748B' }}>{c.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!confirmDelete && (
              <>
                <button onClick={() => onEditFull(c)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[#FEF2F2]" style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: '#DC2626' }}>Sure?</span>
                <button onClick={deleteContact} disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1"
                  style={{ backgroundColor: '#DC2626' }}>
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Yes, delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                  Cancel
                </button>
              </div>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]"><X className="w-4 h-4" style={{ color: '#64748B' }} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Badges */}
          <div className="px-6 py-3 flex gap-2 flex-wrap" style={{ borderBottom: '1px solid #F1F5F9' }}>
            {c.is_converted && <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>Converted</span>}
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>{c.leads.length} deal{c.leads.length !== 1 ? 's' : ''}</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>{withPipeline} in pipeline</span>
          </div>

          {/* Tags */}
          <div className="px-6 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Tags</p>
              <div className="relative" ref={tagPickerRef}>
                <button onClick={() => setShowTagPicker(p => !p)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg hover:bg-[#F1F5F9]"
                  style={{ color: '#134956' }}>
                  <TagIcon className="w-3 h-3" /> Edit
                </button>
                {showTagPicker && (
                  <div className="absolute top-7 right-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[220px] max-h-[300px] overflow-y-auto" style={{ border: '1px solid #E2E8F0' }}>
                    {allTags.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-center" style={{ color: '#94A3B8' }}>No tags. Create them in CRM Settings.</p>
                    ) : allTags.map(t => {
                      const on = (c.tags ?? []).includes(t.name);
                      return (
                        <button key={t.id} onClick={() => toggleTag(t.name)}
                          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-[#F8FAFC] flex items-center gap-2">
                          <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: on ? t.color : '#fff', border: `1px solid ${on ? t.color : '#CBD5E1'}` }}>
                            {on && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          <span style={{ color: '#0F172A' }}>{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {(c.tags ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: '#94A3B8' }}>No tags assigned yet.</p>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {(c.tags ?? []).map(name => {
                  const tag = allTags.find(t => t.name === name);
                  const color = tag?.color ?? '#64748B';
                  return (
                    <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: color + '20', color, border: `1px solid ${color}40` }}>
                      {name}
                      <button onClick={() => toggleTag(name)} className="hover:opacity-70">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Read view — all sections */}
          <>
              {/* ── BASIC INFO ─────────────────────────────────────────── */}
              <PanelSection title="Basic Info">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <PF label="Phone"   value={c.phone} />
                  <PF label="Email"   value={c.email} />
                  <PF label="City"        value={c.city ?? c.last_known_city} />
                  <PF label="Nationality" value={c.nationality} />
                  <PF label="Owner"       value={c.owner?.name} />
                  <PF label="Created" value={fmtDateTime(c.created_at)} />
                  <PF label="Last Seen" value={c.last_seen_at ? fmtDateTime(c.last_seen_at) : null} />
                  {c.source && <PF label="Source (legacy)" value={c.source} span={2} />}
                  {c.notes  && <PF label="Notes" value={c.notes} span={2} />}
                </div>
              </PanelSection>

              {/* ── DEVICE & LOCATION (auto-detected when customer opens a quote) ── */}
              {(() => {
                const cf = c.custom_fields as Record<string, string> | null;
                const os      = cf?.detected_os;
                const browser = cf?.detected_browser;
                const device  = cf?.detected_device ?? (c.device_platform ?? null);
                const dCity   = cf?.detected_city;
                const dRegion = cf?.detected_region;
                const dCountry= cf?.detected_country;
                if (!os && !device && !dCity) return null;

                return (
                  <PanelSection title="Device & Location (Auto-detected)">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {(os || device) && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>OS / Device</p>
                          <PlatformBadge os={os} device={device} />
                        </div>
                      )}
                      {browser && <PF label="Browser" value={browser} />}
                      {dCity && <PF label="Location (IP)" value={[dCity, dRegion, dCountry].filter(Boolean).join(', ')} />}
                    </div>
                  </PanelSection>
                );
              })()}

              {/* ── TRAVEL INTEREST ────────────────────────────────────── */}
              <PanelSection title="Travel Interest">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <PF label="Destination"    value={c.interested_destination} />
                  <PF label="Travellers"     value={c.number_of_travellers != null ? String(c.number_of_travellers) : null} />
                  <PF label="Trip Type"      value={getTripBadge(c.trip_type)?.label ?? null} badge={getTripBadge(c.trip_type) ?? undefined} />
                  <PF label="Budget / Person" value={fmtINR(c.budget_per_person)} />
                  {c.special_requirements && <PF label="Special Requirements" value={c.special_requirements} span={2} />}
                </div>
              </PanelSection>

              {/* ── LEAD SOURCE & AD DATA ──────────────────────────────── */}
              <PanelSection title="Lead Source & Ad Data">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <PF label="Lead Source"   value={getSourceBadge(c.lead_source)?.label ?? null} badge={getSourceBadge(c.lead_source) ?? undefined} />
                  <PF label="Platform"      value={c.platform} />
                  <PF label="Campaign Name" value={c.campaign_name} />
                  <PF label="Ad Set Name"   value={c.ad_set_name} />
                  <PF label="Ad Name"       value={c.ad_name} />
                  <PF label="Device Platform" value={c.device_platform} />
                  <PF label="Gallabox Contact ID" value={c.gallabox_contact_id} />
                  <PF label="Platform Lead ID"    value={c.platform_lead_id} />
                  <PF label="Facebook Click ID (fbclid)" value={c.facebook_click_id}   span={2} mono />
                  <PF label="Facebook Browser ID (fbp)"  value={c.facebook_browser_id} span={2} mono />
                  <PF label="Google Click ID (gclid)"    value={c.google_click_id}     span={2} mono />
                </div>
              </PanelSection>

              {/* ── UTM & OTHER AD DETAILS ─────────────────────────────── */}
              {(() => {
                const o = c.other_ad_details ?? (c.custom_fields as Record<string, string> | null);
                if (!o || Object.keys(o).length === 0) return null;
                return (
                  <PanelSection title="UTM & Other Ad Details">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <PF label="Keyword"      value={o.keyword} />
                      <PF label="UTM Source"   value={o.utm_source} />
                      <PF label="UTM Medium"   value={o.utm_medium} />
                      <PF label="UTM Campaign" value={o.utm_campaign} />
                      <PF label="UTM Term"     value={o.utm_term} />
                      <PF label="UTM Content"  value={o.utm_content} />
                      {o.landing_page && <PF label="Landing Page" value={o.landing_page} span={2} mono />}
                    </div>
                  </PanelSection>
                );
              })()}

              {/* ── CRM ────────────────────────────────────────────────── */}
              <PanelSection title="CRM">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {/* Show live pipeline stage if available, else CRM lead_stage */}
                  {(() => {
                    const ps = c.leads.find(l => l.stage !== null)?.stage ?? null;
                    if (ps) {
                      return (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>Stage</p>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold"
                            style={{ backgroundColor: ps.color + '22', color: ps.color }}>
                            {ps.name}
                          </span>
                        </div>
                      );
                    }
                    return <PF label="Stage" value={STAGE_BADGE[c.lead_stage].label} badge={STAGE_BADGE[c.lead_stage]} />;
                  })()}
                  <PF label="Assigned To" value={c.assigned_to?.name} />
                  <PF label="Follow-up"   value={c.follow_up_date ? fmtDate(c.follow_up_date) : null} />
                  <PF label="Booking Value" value={fmtINR(c.booking_value)} />
                  <PF label="Do Not Contact" value={c.do_not_contact ? 'Yes — blocked' : 'No'} color={c.do_not_contact ? '#DC2626' : undefined} />
                  <PF label="Converted" value={c.is_converted ? (c.closed_date ? fmtDateTime(c.closed_date) : 'Yes') : 'No'} />
                </div>
              </PanelSection>
            </>

          {/* Quotes — previous quotes given to this contact with customer interaction events */}
          {(c.quotes && c.quotes.length > 0) && (
            <div style={{ borderTop: '1px solid #F1F5F9' }}>
              <div className="px-6 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>Quotes ({c.quotes.length})</p>
                <div className="space-y-3">
                  {c.quotes.map(q => {
                    const popular = q.quote_options.find(o => o.is_most_popular);
                    const price   = popular?.final_price ?? q.quote_options[0]?.final_price ?? null;
                    return (
                      <div key={q.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', backgroundColor: '#FAFBFC' }}>
                        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: q.events.length > 0 ? '1px solid #F1F5F9' : undefined, backgroundColor: '#fff' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={`/admin/quotes/${q.id}`} className="text-xs font-mono font-bold hover:underline" style={{ color: '#134956' }}>{q.quote_number}</a>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{q.quote_type}</span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: '#EDE9FE', color: '#6D28D9' }}>{q.status}</span>
                            </div>
                            <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>
                              {q.state.name} · {q.adults} pax · Created {fmtDateTime(q.created_at)}
                            </p>
                          </div>
                          {price != null && (
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: '#134956' }}>₹{Math.round(price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                            </div>
                          )}
                          <a href={`/quotations/${q.public_token}`} target="_blank" rel="noopener noreferrer"
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9] flex-shrink-0"
                            style={{ color: '#94A3B8' }} title="Open public quote">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        {q.events.length > 0 && (
                          <div className="px-4 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Customer Interactions</p>
                            <div className="space-y-1.5">
                              {q.events.map(ev => {
                                const meta = (ev.metadata ?? {}) as Record<string, unknown>;
                                const city    = typeof meta.city === 'string' ? meta.city : null;
                                const device  = typeof meta.device === 'string' ? meta.device : null;
                                const browser = typeof meta.browser === 'string' ? meta.browser : null;
                                const labels: Record<string, string> = {
                                  quote_viewed:     '👀 Viewed quote',
                                  whatsapp_clicked: '💬 Clicked WhatsApp',
                                  booking_intent:   '🎉 Booking intent',
                                  rating_submitted: '⭐ Submitted rating',
                                  batch_selected:   '📅 Selected departure',
                                  package_selected: '📦 Selected package',
                                };
                                const label = labels[ev.event_type] ?? ev.event_type;
                                const extras: string[] = [];
                                if (city) extras.push(`📍 ${city}`);
                                if (device) extras.push(device);
                                if (browser) extras.push(browser);
                                return (
                                  <div key={ev.id} className="flex items-start gap-2 text-[11px]">
                                    <span className="font-medium flex-shrink-0" style={{ color: '#0F172A' }}>{label}</span>
                                    <span className="flex-1" style={{ color: '#64748B' }}>
                                      {extras.length > 0 && <span className="mr-2">{extras.join(' · ')}</span>}
                                    </span>
                                    <span className="flex-shrink-0 whitespace-nowrap" style={{ color: '#94A3B8' }}>{fmtDateTime(ev.created_at)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Deals */}
          <ContactPipelineSection c={c} onRefresh={onUpdated} />
        </div>
      </div>
    </div>
  );
}

// ─── Contact Pipeline Section (with Add-to-Pipeline button) ──────────────────

function ContactPipelineSection({ c, onRefresh }: { c: Contact; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);

  const hasActiveLead = c.leads.some(l => l.pipeline !== null);

  async function addToPipeline() {
    setAdding(true);
    try {
      const res  = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: c.name, phone: c.phone, crm_contact_id: c.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Lead added to pipeline');
        onRefresh();
      } else {
        toast.error(data.message ?? 'Failed to add to pipeline');
      }
    } catch {
      toast.error('Network error');
    }
    setAdding(false);
  }

  return (
    <div style={{ borderTop: '1px solid #F1F5F9' }}>
      <div className="px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Pipeline Deals</p>
          {!hasActiveLead && (
            <button onClick={addToPipeline} disabled={adding}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: '#134956', color: '#fff' }}>
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Add to Pipeline
            </button>
          )}
        </div>
        {c.leads.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>No pipeline deals yet. Click "Add to Pipeline" to create one.</p>
        ) : (
          <div className="space-y-2">
            {c.leads.map(lead => (
              <div key={lead.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{lead.name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                    {lead.pipeline?.name ?? 'No pipeline'} · {fmtDateTime(lead.created_at)}
                  </p>
                </div>
                {lead.stage && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white flex-shrink-0" style={{ backgroundColor: lead.stage.color }}>
                    {lead.stage.name}
                  </span>
                )}
                <a href="/admin/pipelines" className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white flex-shrink-0" style={{ color: '#94A3B8' }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Deleted Contacts Recycle Bin ────────────────────────────────────────────

function DeletedContactsTab({ qc, contactParams }: { qc: QueryClient; contactParams: URLSearchParams }) {
  const [deleted, setDeleted]   = useState<{ id: string; name: string; phone: string; deleted_at: string; email?: string | null }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging]   = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/v1/crm/contacts?deleted_only=true&limit=200').catch(() => null);
    const data = await res?.json().catch(() => null);
    setDeleted(data?.success ? (data.data?.items ?? data.data?.contacts ?? []) : []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  async function restore(id: string) {
    setRestoring(id);
    const res = await fetch(`/api/v1/crm/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restore: true }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success('Contact restored successfully');
      qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) });
      void load();
    } else {
      toast.error('Failed to restore contact');
    }
    setRestoring(null);
  }

  async function purgeNow(id: string) {
    if (!confirm('Permanently delete this contact? This CANNOT be undone.')) return;
    setPurging(id);
    const res = await fetch(`/api/v1/crm/contacts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success('Contact permanently deleted');
      setDeleted(prev => prev.filter(c => c.id !== id));
    } else {
      toast.error('Failed to delete contact');
    }
    setPurging(null);
  }

  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 px-5 py-4 rounded-xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
        <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>Deleted Contacts Recycle Bin</p>
          <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>
            Contacts are soft-deleted and kept here for 30 days. After 30 days they are permanently removed automatically.
            Restore a contact at any time to bring it back.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#94A3B8' }} />
        </div>
      ) : deleted.length === 0 ? (
        <div className="text-center py-16">
          <Trash2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No deleted contacts</p>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Deleted contacts appear here and are auto-purged after 30 days.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <div className="grid grid-cols-5 px-5 py-3 text-[11px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: '#FFF5F5', borderBottom: '1px solid #FECACA', color: '#94A3B8' }}>
            <div className="col-span-2">Contact</div>
            <div>Phone</div>
            <div>Deleted</div>
            <div className="text-right">Actions</div>
          </div>
          {deleted.map((c, i) => {
            const days = daysSince(c.deleted_at);
            const daysLeft = 30 - days;
            return (
              <div key={c.id} className="grid grid-cols-5 items-center px-5 py-4"
                style={{ borderBottom: i < deleted.length - 1 ? '1px solid #FEF2F2' : 'none' }}>
                <div className="col-span-2">
                  <p className="text-sm font-semibold" style={{ color: '#374151' }}>{c.name}</p>
                  {c.email && <p className="text-xs" style={{ color: '#94A3B8' }}>{c.email}</p>}
                </div>
                <div className="font-mono text-xs" style={{ color: '#134956' }}>{c.phone}</div>
                <div>
                  <p className="text-xs" style={{ color: '#64748B' }}>{days} day{days !== 1 ? 's' : ''} ago</p>
                  <p className="text-[10px] font-semibold" style={{ color: daysLeft <= 5 ? '#DC2626' : '#94A3B8' }}>
                    {daysLeft > 0 ? `${daysLeft}d left` : 'Due for purge'}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => restore(c.id)} disabled={restoring === c.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    style={{ backgroundColor: '#134956', color: '#fff' }}>
                    {restoring === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Restore
                  </button>
                  <button onClick={() => purgeNow(c.id)} disabled={purging === c.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                    {purging === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete Forever
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const [tab, setTab]             = useState<'contacts' | 'duplicates' | 'deleted'>('contacts');
  const [dupes, setDupes]         = useState<DuplicateAttempt[]>([]);
  const [search, setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy]       = useState('newest');
  const [dateRange, setDateRange] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selected, setSelected]   = useState<Contact | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing,    setEditing]    = useState<Contact | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [page, setPage]           = useState(1);
  const [allTags, setAllTags]     = useState<ContactTag[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);

  // Pipeline presence filter (clicked from stats bar)
  const [pipelineScope, setPipelineScope] = useState<'with' | 'without' | null>(null);

  // New filters per Part 4 spec
  const [stageFilter,       setStageFilter]       = useState<LeadStage[]>([]);
  const [sourceFilter,      setSourceFilter]      = useState<LeadSource[]>([]);
  const [assignedFilter,    setAssignedFilter]    = useState<string>(''); // user id or 'unassigned'
  const [destinationFilter, setDestinationFilter] = useState('');
  const [tripTypeFilter,    setTripTypeFilter]    = useState<TripType | ''>('');

  const [perPage, setPerPage] = useState<number | 'ALL'>(25);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const tagFilterRef  = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    fetch('/api/v1/crm/contact-tags').then(r => r.json()).then(d => { if (d.success) setAllTags(Array.isArray(d.data) ? d.data : []); }).catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) setShowTagFilter(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounce search so we don't fire a query on every keystroke
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [sortBy, dateRange, dateFrom, dateTo, tagFilter, stageFilter, sourceFilter, assignedFilter, destinationFilter, tripTypeFilter, perPage, pipelineScope]);

  // Destinations seen in the loaded contact set — for the destination filter dropdown.
  // (For now this is a static list of common destinations + whatever appears in the current page.)
  const destinationOptions = useMemo(() => {
    const set = new Set<string>(['Kerala', 'Goa', 'Ladakh', 'Kashmir', 'Himachal', 'Uttarakhand', 'Andaman', 'Rajasthan', 'Northeast', 'Bali', 'Dubai', 'Maldives', 'Singapore', 'Thailand', 'Europe']);
    return Array.from(set).sort();
  }, []);

  function clearAllFilters() {
    setSearch('');
    setSortBy('newest');
    setDateRange(''); setDateFrom(''); setDateTo('');
    setTagFilter([]);
    setStageFilter([]); setSourceFilter([]);
    setAssignedFilter(''); setDestinationFilter('');
    setTripTypeFilter('');
    setPipelineScope(null);
  }

  const activeFilterCount =
    (stageFilter.length > 0 ? 1 : 0) +
    (sourceFilter.length > 0 ? 1 : 0) +
    (assignedFilter ? 1 : 0) +
    (destinationFilter ? 1 : 0) +
    (tripTypeFilter ? 1 : 0) +
    (tagFilter.length > 0 ? 1 : 0) +
    (dateRange ? 1 : 0);

  const tagByName = useMemo(() => Object.fromEntries(allTags.map(t => [t.name, t])), [allTags]);

  function toggleTagFilter(name: string) {
    setTagFilter(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  }

  // Build query params (passed to useContacts so React Query key changes automatically)
  const contactParams = new URLSearchParams();
  if (debouncedSearch) contactParams.set('search', debouncedSearch);
  if (sortBy)          contactParams.set('sort', sortBy);
  if (dateRange)       contactParams.set('date_range', dateRange);
  if (dateRange === 'custom' && dateFrom) contactParams.set('date_from', dateFrom);
  if (dateRange === 'custom' && dateTo)   contactParams.set('date_to', dateTo);
  if (tagFilter.length)                   contactParams.set('tags', tagFilter.join(','));
  if (stageFilter.length)                 contactParams.set('lead_stage',  stageFilter.join(','));
  if (sourceFilter.length)                contactParams.set('lead_source', sourceFilter.join(','));
  if (assignedFilter)                     contactParams.set('assigned_to_id', assignedFilter);
  if (destinationFilter)                  contactParams.set('interested_destination', destinationFilter);
  if (tripTypeFilter)                     contactParams.set('trip_type', tripTypeFilter);
  if (pipelineScope === 'with')           contactParams.set('has_pipeline', 'true');
  if (pipelineScope === 'without')        contactParams.set('has_pipeline', 'false');
  contactParams.set('page', String(page));
  contactParams.set('limit', perPage === 'ALL' ? '9999' : String(perPage));

  const { data: contactsResp, isFetching: loading } = useContacts(contactParams);
  const { data: usersData } = useUsers();

  const contactsPage = (contactsResp as { items: Contact[]; total: number; page: number; limit: number; pages: number } | undefined);
  const contacts   = contactsPage?.items   ?? [];
  const totalCount = contactsPage?.total   ?? 0;
  const totalPages = contactsPage?.pages   ?? 1;
  const users: CrmUser[] = (usersData as CrmUser[] | undefined) ?? [];

  async function loadDupes() {
    const res = await fetch('/api/v1/crm/duplicate-attempts');
    const d   = await res.json();
    if (d.success) setDupes(Array.isArray(d.data) ? d.data : []);
  }

  useEffect(() => { if (tab === 'duplicates') loadDupes(); }, [tab]);

  // Close date picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Page-level stats (computed from current page; totals come from API)
  const paginated       = contacts;   // already server-paginated
  const withPipeline    = contacts.filter(c => c.leads.some(l => l.pipeline !== null)).length;
  const withoutPipeline = contacts.filter(c => c.leads.every(l => l.pipeline === null) || c.leads.length === 0).length;
  const untouched       = contacts.filter(c => c.leads.every(l => (l._count?.call_logs ?? 0) + (l._count?.lead_notes ?? 0) === 0)).length;

  const [bulkDeleting, setBulkDeleting]         = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  function toggleCheck(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setCheckedIds(prev => prev.size === paginated.length ? new Set() : new Set(paginated.map(c => c.id)));
  }

  async function bulkDelete() {
    setBulkDeleting(true);
    await Promise.all(Array.from(checkedIds).map(id =>
      fetch(`/api/v1/crm/contacts/${id}`, { method: 'DELETE' })
    ));
    setBulkDeleting(false);
    setCheckedIds(new Set());
    setConfirmBulkDelete(false);
    qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) });
  }

  // ─── CSV export ──────────────────────────────────────────────────────────────
  // Exports the current filtered set (uses the same query params as the table).
  async function exportCsv() {
    const exportParams = new URLSearchParams(contactParams);
    exportParams.set('limit', '5000'); // hard cap to avoid runaway downloads
    exportParams.set('page', '1');
    try {
      const res = await fetch(`/api/v1/crm/contacts?${exportParams}`);
      const data = await res.json();
      if (!data.success) return;
      const rows: Contact[] = data.data.items ?? data.data.contacts ?? [];

      const headers = [
        'Full Name', 'Phone', 'Email', 'City', 'Interested Destination',
        'Number of Travellers', 'Trip Type', 'Budget per Person',
        'Lead Source', 'Lead Stage', 'Assigned To',
        'Follow Up Date', 'Created At', 'Converted', 'Booking Value',
        'Do Not Contact', 'Tags',
      ];
      const csvCell = (v: unknown) => {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          r.name, r.phone, r.email ?? '', r.city ?? '',
          r.interested_destination ?? '',
          r.number_of_travellers ?? '',
          r.trip_type ?? '',
          r.budget_per_person ?? '',
          r.lead_source ?? '',
          r.lead_stage,
          r.assigned_to?.name ?? '',
          r.follow_up_date ?? '',
          r.created_at,
          r.is_converted ? 'Yes' : 'No',
          r.booking_value ?? '',
          r.do_not_contact ? 'Yes' : 'No',
          (r.tags ?? []).join('; '),
        ].map(csvCell).join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[contacts/export]', e);
    }
  }

  const allChecked = paginated.length > 0 && checkedIds.size === paginated.length;

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8 overflow-hidden">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white px-6 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <h1 className="text-base font-bold mr-1" style={{ color: '#0F172A' }}>Contacts</h1>
        {totalCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold mr-2"
            style={{ backgroundColor: '#E0F2F1', color: '#134956' }}>
            {totalCount.toLocaleString()} {totalCount === 1 ? 'Contact' : 'Contacts'}
          </span>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: '#F1F5F9' }}>
          {([
            { key: 'contacts',   label: 'All Contacts' },
            { key: 'duplicates', label: `Duplicate Cleanup${dupes.length ? ` (${dupes.length})` : ''}` },
            { key: 'deleted',    label: 'Deleted' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{
                backgroundColor: tab === key ? '#fff' : 'transparent',
                color:            tab === key ? (key === 'deleted' ? '#DC2626' : '#0F172A') : '#64748B',
                boxShadow:        tab === key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {tab === 'contacts' && (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              <input type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg text-xs outline-none" style={{ border: '1px solid #E2E8F0', width: 200 }} />
            </div>

            {/* Date filter */}
            <div className="relative" ref={datePickerRef}>
              <button onClick={() => setShowDatePicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ border: `1px solid ${dateRange ? '#134956' : '#E2E8F0'}`, backgroundColor: dateRange ? '#F0F9FF' : '#fff', color: dateRange ? '#134956' : '#64748B' }}>
                <Calendar className="w-3.5 h-3.5" />
                {DATE_RANGES.find(r => r.value === dateRange)?.label ?? 'All time'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showDatePicker && (
                <div className="absolute top-10 right-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[170px]" style={{ border: '1px solid #E2E8F0' }}>
                  {DATE_RANGES.map(r => (
                    <button key={r.value} onClick={() => { setDateRange(r.value); if (r.value !== 'custom') setShowDatePicker(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-[#F8FAFC]"
                      style={{ color: dateRange === r.value ? '#134956' : '#64748B', fontWeight: dateRange === r.value ? 600 : 400 }}>
                      {r.label}
                    </button>
                  ))}
                  {dateRange === 'custom' && (
                    <div className="px-4 pb-3 space-y-2 pt-1" style={{ borderTop: '1px solid #F1F5F9' }}>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>From</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="w-full text-xs rounded-lg px-2 py-1.5 mt-0.5 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>To</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                          className="w-full text-xs rounded-lg px-2 py-1.5 mt-0.5 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                      </div>
                      <button onClick={() => setShowDatePicker(false)}
                        className="w-full py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: '#134956' }}>Apply</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tag filter */}
            <div className="relative" ref={tagFilterRef}>
              <button onClick={() => setShowTagFilter(p => !p)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                style={{ border: `1px solid ${tagFilter.length ? '#134956' : '#E2E8F0'}`, backgroundColor: tagFilter.length ? '#F0F9FF' : '#fff', color: tagFilter.length ? '#134956' : '#64748B' }}>
                <TagIcon className="w-3.5 h-3.5" />
                {tagFilter.length > 0 ? `${tagFilter.length} tag${tagFilter.length > 1 ? 's' : ''}` : 'Tags'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showTagFilter && (
                <div className="absolute top-10 right-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[220px] max-h-[320px] overflow-y-auto" style={{ border: '1px solid #E2E8F0' }}>
                  {allTags.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-center" style={{ color: '#94A3B8' }}>
                      No tags yet. Create them in CRM Settings → Tags.
                    </div>
                  ) : (
                    <>
                      {allTags.map(t => {
                        const checked = tagFilter.includes(t.name);
                        return (
                          <button key={t.id} onClick={() => toggleTagFilter(t.name)}
                            className="w-full text-left px-4 py-2 text-xs font-medium transition-colors hover:bg-[#F8FAFC] flex items-center gap-2">
                            <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: checked ? t.color : '#fff', border: `1px solid ${checked ? t.color : '#CBD5E1'}` }}>
                              {checked && <Check className="w-3 h-3 text-white" />}
                            </span>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                            <span style={{ color: '#0F172A' }}>{t.name}</span>
                          </button>
                        );
                      })}
                      {tagFilter.length > 0 && (
                        <button onClick={() => setTagFilter([])}
                          className="w-full text-left px-4 py-2 text-xs font-semibold border-t hover:bg-[#F8FAFC]"
                          style={{ color: '#DC2626', borderColor: '#F1F5F9' }}>
                          Clear all
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="text-xs font-medium rounded-lg px-3 py-2 outline-none" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>

            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>

            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: '#134956' }}>
              <Plus className="w-3.5 h-3.5" /> Contact
            </button>
          </>
        )}
      </div>

      {/* Second filter row — stage / source / assignee / destination / trip type / clear */}
      {tab === 'contacts' && (
        <div className="flex-shrink-0 bg-white px-6 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <FilterIcon className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />

          {/* Lead Stage */}
          <select
            value={stageFilter[0] ?? ''}
            onChange={e => setStageFilter(e.target.value ? [e.target.value as LeadStage] : [])}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${stageFilter.length ? '#134956' : '#E2E8F0'}`, color: stageFilter.length ? '#134956' : '#64748B', backgroundColor: stageFilter.length ? '#F0F9FF' : '#fff' }}>
            <option value="">All stages</option>
            {STAGES.map(s => <option key={s} value={s}>{STAGE_BADGE[s].label}</option>)}
          </select>

          {/* Lead Source */}
          <select
            value={sourceFilter[0] ?? ''}
            onChange={e => setSourceFilter(e.target.value ? [e.target.value as LeadSource] : [])}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${sourceFilter.length ? '#134956' : '#E2E8F0'}`, color: sourceFilter.length ? '#134956' : '#64748B', backgroundColor: sourceFilter.length ? '#F0F9FF' : '#fff' }}>
            <option value="">All sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_BADGE[s].label}</option>)}
          </select>

          {/* Assigned To */}
          <select
            value={assignedFilter}
            onChange={e => setAssignedFilter(e.target.value)}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer max-w-[180px]"
            style={{ border: `1px solid ${assignedFilter ? '#134956' : '#E2E8F0'}`, color: assignedFilter ? '#134956' : '#64748B', backgroundColor: assignedFilter ? '#F0F9FF' : '#fff' }}>
            <option value="">Anyone assigned</option>
            <option value="unassigned">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          {/* Destination */}
          <select
            value={destinationFilter}
            onChange={e => setDestinationFilter(e.target.value)}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${destinationFilter ? '#134956' : '#E2E8F0'}`, color: destinationFilter ? '#134956' : '#64748B', backgroundColor: destinationFilter ? '#F0F9FF' : '#fff' }}>
            <option value="">Any destination</option>
            {destinationOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* Trip Type */}
          <select
            value={tripTypeFilter}
            onChange={e => setTripTypeFilter(e.target.value as TripType | '')}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
            style={{ border: `1px solid ${tripTypeFilter ? '#134956' : '#E2E8F0'}`, color: tripTypeFilter ? '#134956' : '#64748B', backgroundColor: tripTypeFilter ? '#F0F9FF' : '#fff' }}>
            <option value="">Any trip type</option>
            {(Object.entries(TRIP_TYPE_BADGE) as [TripType, { label: string }][]).map(([v, b]) => (
              <option key={v} value={v}>{b.label}</option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-[#FEF2F2]"
              style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {tab === 'contacts' ? (
        <>
          {/* Table */}
          <div className="flex-1 overflow-auto bg-white">
            {loading && contacts.length === 0 ? (
              <TableSkeleton rows={12} />
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm border-collapse min-w-[1800px]">
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th className="w-10 px-4 py-3">
                      <button onClick={toggleAll}>
                        {allChecked
                          ? <CheckSquare className="w-4 h-4" style={{ color: '#134956' }} />
                          : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
                      </button>
                    </th>
                    {[
                      'Full Name', 'Phone', 'Email', 'City', 'Nationality', 'Destination', 'Travellers',
                      'Budget', 'Trip', 'Source', 'Platform', 'Campaign',
                      'Stage', 'Assigned', 'Follow-up', 'DNC', 'Booking', 'Quotes', 'Created By', 'Created', '',
                    ].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, i) => {
                    // Prefer the live pipeline stage from the most recent lead (always accurate),
                    // fall back to CrmContact.lead_stage for contacts with no pipeline lead.
                    const pipelineStage = c.leads.find(l => l.stage !== null)?.stage ?? null;
                    const stageStyle = STAGE_BADGE[c.lead_stage] ?? STAGE_BADGE.NEW;
                    const sourceStyle = getSourceBadge(c.lead_source);
                    const tripStyle   = getTripBadge(c.trip_type);
                    const followUpPast = c.follow_up_date && new Date(c.follow_up_date).getTime() < Date.now();

                    return (
                      <tr key={c.id}
                        onClick={() => setSelected(c)}
                        className="cursor-pointer transition-colors hover:bg-[#F8FAFC]"
                        style={{ borderBottom: i < paginated.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <button onClick={() => toggleCheck(c.id)}>
                            {checkedIds.has(c.id)
                              ? <CheckSquare className="w-4 h-4" style={{ color: '#134956' }} />
                              : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
                          </button>
                        </td>

                        {/* Full Name — clickable → detail page */}
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ backgroundColor: c.is_converted ? '#22C55E' : '#134956' }}>
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <Link href={`/admin/contacts/${c.id}`}
                                className="font-semibold hover:underline truncate block max-w-[180px]"
                                style={{ color: '#0F172A' }}>
                                {c.name}
                              </Link>
                              {(c.tags ?? []).length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {(c.tags ?? []).slice(0, 2).map(name => {
                                    const tag = tagByName[name];
                                    const color = tag?.color ?? '#64748B';
                                    return (
                                      <span key={name} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
                                        style={{ backgroundColor: color + '20', color }}>{name}</span>
                                    );
                                  })}
                                  {c.tags.length > 2 && <span className="text-[9px]" style={{ color: '#94A3B8' }}>+{c.tags.length - 2}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>
                            <Phone className="w-3 h-3" />{c.phone}
                          </span>
                        </td>

                        {/* Email */}
                        <td className="px-3 py-3 text-xs">
                          {c.email
                            ? <span className="flex items-center gap-1 whitespace-nowrap" style={{ color: '#64748B' }}><Mail className="w-3 h-3" />{c.email}</span>
                            : <span style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* City */}
                        <td className="px-3 py-3 text-xs">
                          {(() => {
                            const city = c.city ?? c.last_known_city ?? null;
                            return city
                              ? <span style={{ color: '#0F172A' }}>{city}</span>
                              : <span style={{ color: '#CBD5E1' }}>—</span>;
                          })()}
                        </td>

                        {/* Nationality (from Customer record) */}
                        <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>
                          {c.nationality ?? <span style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Interested Destination */}
                        <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>
                          {(() => {
                            const dest = c.interested_destination ?? c.leads.find(l => l.destination_interest)?.destination_interest ?? null;
                            const month = c.leads.find(l => l.travel_month)?.travel_month ?? null;
                            return dest ? (
                              <div>
                                <span style={{ color: '#0F172A', fontWeight: 500 }}>{dest}</span>
                                {month && <div className="text-[10px] mt-0.5" style={{ color: '#94A3B8' }}>{month}</div>}
                              </div>
                            ) : <span style={{ color: '#CBD5E1' }}>—</span>;
                          })()}
                        </td>

                        {/* Number of Travellers */}
                        <td className="px-3 py-3 text-xs text-center">
                          {c.number_of_travellers != null
                            ? <span className="font-semibold" style={{ color: '#0F172A' }}>{c.number_of_travellers}</span>
                            : <span style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Budget Per Person */}
                        <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap">
                          {(() => {
                            const perPerson = c.budget_per_person;
                            if (perPerson !== null && perPerson !== undefined && perPerson !== '') {
                              return <span style={{ color: '#0F172A' }}>{fmtINR(perPerson)}</span>;
                            }
                            const leadBudget = c.leads.find(l => l.budget_range)?.budget_range ?? null;
                            if (leadBudget) {
                              return <span style={{ color: '#64748B' }}>{leadBudget}</span>;
                            }
                            return <span style={{ color: '#CBD5E1' }}>—</span>;
                          })()}
                        </td>

                        {/* Trip Type */}
                        <td className="px-3 py-3">
                          {tripStyle
                            ? <Chip bg={tripStyle.bg} color={tripStyle.color}>{tripStyle.label}</Chip>
                            : <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Lead Source */}
                        <td className="px-3 py-3">
                          {sourceStyle
                            ? <Chip bg={sourceStyle.bg} color={sourceStyle.color}>{sourceStyle.label}</Chip>
                            : c.source
                              ? <span className="text-xs" style={{ color: '#64748B' }}>{c.source}</span>
                              : <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Platform + detected OS */}
                        <td className="px-3 py-3">
                          {(() => {
                            const cf = c.custom_fields as Record<string, string> | null;
                            return <PlatformBadge platform={c.platform} os={cf?.detected_os} device={cf?.detected_device ?? c.device_platform} />;
                          })()}
                        </td>

                        {/* Campaign */}
                        <td className="px-3 py-3 text-xs" style={{ color: '#64748B' }}>
                          {c.campaign_name
                            ? <span className="truncate block max-w-[120px]" title={c.campaign_name}>{c.campaign_name}</span>
                            : <span style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Lead Stage — pipeline stage takes precedence for accuracy */}
                        <td className="px-3 py-3">
                          {pipelineStage ? (
                            <Chip bg={pipelineStage.color + '22'} color={pipelineStage.color}>
                              {pipelineStage.name}
                            </Chip>
                          ) : (
                            <Chip bg={stageStyle.bg} color={stageStyle.color}>{stageStyle.label}</Chip>
                          )}
                        </td>

                        {/* Assigned To */}
                        <td className="px-3 py-3">
                          {c.assigned_to ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                                {c.assigned_to.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium" style={{ color: '#0F172A' }}>{c.assigned_to.name}</span>
                            </div>
                          ) : <span className="text-xs" style={{ color: '#94A3B8' }}>Unassigned</span>}
                        </td>

                        {/* Follow Up Date (red if past) */}
                        <td className="px-3 py-3 text-xs whitespace-nowrap"
                          style={{ color: followUpPast ? '#DC2626' : '#64748B', fontWeight: followUpPast ? 600 : 400 }}>
                          {c.follow_up_date ? fmtDate(c.follow_up_date) : '—'}
                        </td>

                        {/* Do Not Contact */}
                        <td className="px-3 py-3 text-center">
                          {c.do_not_contact
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>DNC</span>
                            : <span style={{ color: '#CBD5E1' }} className="text-xs">—</span>}
                        </td>

                        {/* Booking Value */}
                        <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap">
                          {c.booking_value != null && c.booking_value !== ''
                            ? <span style={{ color: '#15803D' }}>{fmtINR(c.booking_value)}</span>
                            : <span style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Quotes count (from Customer record) */}
                        <td className="px-3 py-3 text-xs text-center">
                          {(c.quotes_count ?? 0) > 0
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ backgroundColor: '#E0F2FE', color: '#0369A1' }}>{c.quotes_count}</span>
                            : <span style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Created By */}
                        <td className="px-3 py-3">
                          {c.created_by ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: '#64748B' }}>
                                {c.created_by.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium" style={{ color: '#0F172A' }}>{c.created_by.name}</span>
                            </div>
                          ) : c.owner ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: '#94A3B8' }}>
                                {c.owner.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium" style={{ color: '#64748B' }}>{c.owner.name}</span>
                            </div>
                          ) : <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>}
                        </td>

                        {/* Created At */}
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{fmtDate(c.created_at)}</td>

                        {/* Actions */}
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Link href={`/admin/contacts/${c.id}`}
                              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-[#F1F5F9]"
                              style={{ color: '#64748B' }} title="View / Edit">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Link>
                            <button onClick={async () => {
                              if (!confirm(`Delete contact "${c.name}"? This soft-deletes — can be restored from the database.`)) return;
                              const res = await fetch(`/api/v1/crm/contacts/${c.id}`, { method: 'DELETE' });
                              if (res.ok) {
                                qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) });
                              }
                            }}
                              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-[#FEF2F2]"
                              style={{ color: '#94A3B8' }} title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginated.length === 0 && !loading && (
                    <tr>
                      <td colSpan={20} className="text-center py-16">
                        <User className="w-8 h-8 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No contacts found</p>
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                          {activeFilterCount > 0
                            ? <button onClick={clearAllFilters} className="underline" style={{ color: '#134956' }}>Clear filters</button>
                            : 'Click "Contact" to add the first one — or wait for a CTWA lead to come in via webhook.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table></div>
            )}
          </div>

          {/* Stats + Pagination bar (Bigin-style) */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white text-xs" style={{ borderTop: '1px solid #E2E8F0', color: '#64748B' }}>
            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={() => { setPipelineScope(null); setPage(1); }}
                className="transition-colors"
                style={{ color: pipelineScope === null ? '#0F172A' : '#94A3B8', fontWeight: pipelineScope === null ? 700 : 400 }}>
                Total Contacts <span className="font-bold" style={{ color: pipelineScope === null ? '#134956' : '#0F172A' }}>{totalCount.toLocaleString()}</span>
              </button>
              <span className="text-[#CBD5E1]">·</span>
              <button
                onClick={() => { setPipelineScope(pipelineScope === 'with' ? null : 'with'); setPage(1); }}
                className="transition-colors rounded px-1 -mx-1"
                style={{
                  color: pipelineScope === 'with' ? '#134956' : '#64748B',
                  backgroundColor: pipelineScope === 'with' ? '#EFF6FF' : 'transparent',
                  fontWeight: pipelineScope === 'with' ? 600 : 400,
                }}>
                With Open Pipelines <span className="font-bold" style={{ color: '#0F172A' }}>{withPipeline.toLocaleString()}</span>
              </button>
              <span className="text-[#CBD5E1]">·</span>
              <button
                onClick={() => { setPipelineScope(pipelineScope === 'without' ? null : 'without'); setPage(1); }}
                className="transition-colors rounded px-1 -mx-1"
                style={{
                  color: pipelineScope === 'without' ? '#134956' : '#64748B',
                  backgroundColor: pipelineScope === 'without' ? '#EFF6FF' : 'transparent',
                  fontWeight: pipelineScope === 'without' ? 600 : 400,
                }}>
                Without Pipelines <span className="font-bold" style={{ color: '#0F172A' }}>{withoutPipeline.toLocaleString()}</span>
              </button>
              <span className="text-[#CBD5E1]">·</span>
              <span>Untouched <span className="font-bold" style={{ color: '#0F172A' }}>{untouched.toLocaleString()}</span></span>
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-3">
                {/* Rows per page */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: '#94A3B8' }}>Rows per page:</span>
                  <select
                    value={perPage}
                    onChange={e => { setPerPage(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)); setPage(1); }}
                    className="text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                    style={{ border: '1px solid #E2E8F0', color: '#134956', backgroundColor: '#fff' }}>
                    {([25, 50, 75, 100, 200, 300] as const).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value="ALL">All</option>
                  </select>
                </div>
                <span className="text-[#CBD5E1]">·</span>
                <span>
                  Showing <span className="font-semibold" style={{ color: '#0F172A' }}>{(page - 1) * (perPage === 'ALL' ? totalCount : perPage) + 1}</span> to{' '}
                  <span className="font-semibold" style={{ color: '#0F172A' }}>{Math.min(page * (perPage === 'ALL' ? totalCount : perPage), totalCount)}</span> of{' '}
                  <span className="font-semibold" style={{ color: '#0F172A' }}>{totalCount.toLocaleString()}</span> contacts
                  {loading && <span className="ml-2 opacity-50">…</span>}
                </span>
                {(perPage !== 'ALL' ? totalPages : 1) > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
                      className="flex items-center gap-1 px-2 h-7 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F1F5F9] disabled:opacity-30"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
                      className="flex items-center gap-1 px-2 h-7 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F1F5F9] disabled:opacity-30"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : tab === 'deleted' ? (
        /* ── Deleted Contacts Recycle Bin ── */
        <DeletedContactsTab qc={qc} contactParams={contactParams} />
      ) : (
        /* Duplicate Cleanup Tab */
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="bg-amber-50 rounded-xl px-5 py-4 flex items-start gap-3" style={{ border: '1px solid #FDE68A' }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Duplicate Contact Attempts</p>
              <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>Blocked attempts to add a phone number already owned by another user. Logged automatically.</p>
            </div>
          </div>
          {dupes.length === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No duplicate attempts</p>
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Attempted By', 'Phone', 'Existing Owner', 'Time'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dupes.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < dupes.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: '#0F172A' }}>{d.attempted_by_user?.name ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: '#134956' }}>{d.phone}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: '#64748B' }}>{d.existing_owner_user?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: '#94A3B8' }}>{fmtDateTime(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
          style={{ backgroundColor: '#0F172A', color: 'white', minWidth: 320 }}>
          <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#7DD3C0' }} />
          <span className="text-sm font-semibold" style={{ color: '#7DD3C0' }}>{checkedIds.size} selected</span>
          <div className="w-px h-4 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />

          {!confirmBulkDelete ? (
            <button onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-white/10"
              style={{ color: '#FCA5A5' }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: '#FCA5A5' }}>Delete {checkedIds.size} contact{checkedIds.size > 1 ? 's' : ''}?</span>
              <button onClick={bulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: '#DC2626' }}>
                {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Yes, delete
              </button>
              <button onClick={() => setConfirmBulkDelete(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}>
                Cancel
              </button>
            </div>
          )}

          <div className="flex-1" />
          <button onClick={() => { setCheckedIds(new Set()); setConfirmBulkDelete(false); }}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modals & panels */}
      <ContactFormModal
        open={showCreate || !!editing}
        mode={editing ? 'edit' : 'create'}
        initial={editing ? contactToFormValue(editing) : undefined}
        users={users}
        tags={allTags}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) });
          setShowCreate(false);
          setEditing(null);
          setSelected(null);
        }}
      />
      {selected && (
        <ContactPanel
          contact={selected}
          users={users}
          allTags={allTags}
          onClose={() => setSelected(null)}
          onUpdated={() => qc.invalidateQueries({ queryKey: QK.contacts(contactParams.toString()) })}
          onEditFull={(c) => setEditing(c)}
        />
      )}
    </div>
  );
}

// ─── Panel helpers ────────────────────────────────────────────────────────────
function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4" style={{ borderTop: '1px solid #F1F5F9' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>{title}</p>
      {children}
    </div>
  );
}

function PF({
  label, value, span, mono, color, badge,
}: {
  label: string;
  value: string | number | null | undefined;
  span?: 1 | 2;
  mono?: boolean;
  color?: string;
  badge?: { bg: string; color: string };
}) {
  const display = value !== null && value !== undefined && value !== '' ? String(value) : null;
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>{label}</p>
      {display && badge ? (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold"
          style={{ backgroundColor: badge.bg, color: badge.color }}>
          {display}
        </span>
      ) : (
        <p className={`text-sm ${mono ? 'font-mono text-[11px] break-all' : ''}`}
          style={{ color: display ? (color ?? '#0F172A') : '#CBD5E1' }}>
          {display ?? '—'}
        </p>
      )}
    </div>
  );
}
