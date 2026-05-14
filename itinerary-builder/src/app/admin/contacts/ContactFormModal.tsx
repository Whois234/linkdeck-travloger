'use client';
/**
 * ContactFormModal — single Add/Edit modal for CrmContact.
 *
 * Loaded lazily from `page.tsx` via next/dynamic. Four sections:
 *   1. Basic info
 *   2. Travel interest
 *   3. Lead source & ad data (collapsible "Other ad details")
 *   4. CRM (stage, assignee, follow-up, tags, DNC, booking value)
 *
 * In edit mode, a read-only footer surfaces created_at, closed_date, converted.
 */

import { useEffect, useState } from 'react';
import { X, Loader2, ChevronDown, ChevronRight, Save, Plus } from 'lucide-react';
import { toast } from '@/components/Toaster';

type LeadStage      = 'NEW' | 'CONTACTED' | 'FOLLOW_UP' | 'HOT' | 'CONVERTED' | 'LOST';
type LeadSource     = 'CTWA' | 'META_LEAD_FORM' | 'GOOGLE_ADS' | 'WEBSITE' | 'WALK_IN' | 'REFERRAL';
type TripType       = 'HONEYMOON' | 'FAMILY' | 'FRIENDS' | 'SOLO' | 'CORPORATE' | 'PILGRIMAGE' | 'ADVENTURE' | 'GROUP' | 'PRIVATE' | 'OTHER';
type Platform       = 'FACEBOOK' | 'INSTAGRAM' | 'GOOGLE' | 'YOUTUBE' | 'WEBSITE' | 'WHATSAPP';
type DevicePlatform = 'MOBILE' | 'DESKTOP';

const T = '#134956';

const COUNTRY_CODES = [
  { code: '+91',  flag: '🇮🇳', name: 'India'        },
  { code: '+971', flag: '🇦🇪', name: 'UAE'          },
  { code: '+1',   flag: '🇺🇸', name: 'USA / Canada' },
  { code: '+44',  flag: '🇬🇧', name: 'UK'           },
  { code: '+65',  flag: '🇸🇬', name: 'Singapore'    },
  { code: '+60',  flag: '🇲🇾', name: 'Malaysia'     },
  { code: '+61',  flag: '🇦🇺', name: 'Australia'    },
  { code: '+81',  flag: '🇯🇵', name: 'Japan'        },
  { code: '+49',  flag: '🇩🇪', name: 'Germany'      },
  { code: '+33',  flag: '🇫🇷', name: 'France'       },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+974', flag: '🇶🇦', name: 'Qatar'        },
  { code: '+968', flag: '🇴🇲', name: 'Oman'         },
  { code: '+973', flag: '🇧🇭', name: 'Bahrain'      },
  { code: '+94',  flag: '🇱🇰', name: 'Sri Lanka'    },
  { code: '+977', flag: '🇳🇵', name: 'Nepal'        },
  { code: '+880', flag: '🇧🇩', name: 'Bangladesh'   },
];

/** Split a fully-qualified phone (e.g. "919876543210") into { code, local }. */
function parseExistingPhone(full: string): { code: string; local: string } {
  if (!full) return { code: '+91', local: '' };
  const digits = full.replace(/\D/g, '');
  // Sort by length desc so longer codes (971, 966) match before shorter (+1)
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const { code } of sorted) {
    const prefix = code.replace('+', '');
    if (digits.startsWith(prefix)) {
      return { code, local: digits.slice(prefix.length) };
    }
  }
  return { code: '+91', local: digits };
}

const STAGES: { value: LeadStage;  label: string }[] = [
  { value: 'NEW',       label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'FOLLOW_UP', label: 'Follow up' },
  { value: 'HOT',       label: 'Hot' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'LOST',      label: 'Lost' },
];

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'CTWA',            label: 'CTWA (Click-to-WhatsApp)' },
  { value: 'META_LEAD_FORM',  label: 'Meta Lead Form' },
  { value: 'GOOGLE_ADS',      label: 'Google Ads' },
  { value: 'WEBSITE',         label: 'Website' },
  { value: 'WALK_IN',         label: 'Walk-in' },
  { value: 'REFERRAL',        label: 'Referral' },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'FACEBOOK',  label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'GOOGLE',    label: 'Google' },
  { value: 'YOUTUBE',   label: 'YouTube' },
  { value: 'WEBSITE',   label: 'Website' },
  { value: 'WHATSAPP',  label: 'WhatsApp' },
];

// Fallback arrays of raw values (used when API hasn't loaded yet)
const TRIP_TYPE_VALS = ['HONEYMOON','FAMILY','FRIENDS','SOLO','GROUP','CORPORATE','PILGRIMAGE','ADVENTURE','PRIVATE','OTHER'];

// Display label maps for known enum values
const SOURCE_LABEL: Record<string, string> = {
  CTWA: 'CTWA (Click-to-WhatsApp)',
  META_LEAD_FORM: 'Meta Lead Form',
  GOOGLE_ADS: 'Google Ads',
  WEBSITE: 'Website',
  WALK_IN: 'Walk-in',
  REFERRAL: 'Referral',
};
const TRIP_LABEL: Record<string, string> = {
  HONEYMOON: 'Honeymoon', FAMILY: 'Family', FRIENDS: 'Friends', SOLO: 'Solo',
  GROUP: 'Group', CORPORATE: 'Corporate', PILGRIMAGE: 'Pilgrimage',
  ADVENTURE: 'Adventure', PRIVATE: 'Private', OTHER: 'Other',
};
const PLATFORM_LABEL: Record<string, string> = {
  FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', GOOGLE: 'Google',
  YOUTUBE: 'YouTube', WEBSITE: 'Website', WHATSAPP: 'WhatsApp',
};

export interface ContactFormValue {
  id?: string;
  // Basic
  name: string;
  countryCode: string;  // e.g. "+91"
  phone: string;        // local number only (no country code)
  email: string;
  city: string;

  // Travel
  interested_destination: string;
  number_of_travellers:   string;   // bound to <input type=number> as string
  trip_type:              TripType | '';
  special_requirements:   string;
  budget_per_person:      string;

  // Source & ad
  lead_source:         LeadSource | '';
  platform:            Platform | '';
  campaign_name:       string;
  ad_set_name:         string;
  ad_name:             string;
  device_platform:     DevicePlatform | '';
  gallabox_contact_id: string;
  platform_lead_id:    string;
  facebook_click_id:   string;
  facebook_browser_id: string;
  google_click_id:     string;
  other_keyword:       string;
  other_utm_source:    string;
  other_utm_medium:    string;
  other_utm_campaign:  string;
  other_utm_term:      string;
  other_utm_content:   string;
  other_landing_page:  string;

  // CRM
  lead_stage:     LeadStage;
  assigned_to_id: string;
  follow_up_date: string;   // YYYY-MM-DD
  tags:           string[];
  do_not_contact: boolean;
  booking_value:  string;

  // Read-only (edit mode)
  created_at?:   string;
  closed_date?:  string | null;
  is_converted?: boolean;
}

const EMPTY: ContactFormValue = {
  name: '', countryCode: '+91', phone: '', email: '', city: '',
  interested_destination: '', number_of_travellers: '', trip_type: '',
  special_requirements: '', budget_per_person: '',
  lead_source: '', platform: '', campaign_name: '', ad_set_name: '', ad_name: '',
  device_platform: '', gallabox_contact_id: '', platform_lead_id: '',
  facebook_click_id: '', facebook_browser_id: '', google_click_id: '',
  other_keyword: '', other_utm_source: '', other_utm_medium: '',
  other_utm_campaign: '', other_utm_term: '', other_utm_content: '', other_landing_page: '',
  lead_stage: 'NEW', assigned_to_id: '', follow_up_date: '', tags: [],
  do_not_contact: false, booking_value: '',
};

interface User { id: string; name: string; role?: string }
interface Tag  { id: string; name: string; color: string }

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: Partial<ContactFormValue>;
  users: User[];
  tags:  Tag[];
  onClose: () => void;
  onSaved: (contact: { id: string }) => void;
}

// ─── Field-level styles (kept inline so the file is self-contained) ─────────
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5';
const inputCls = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/15 bg-white transition-colors';
const selectCls = inputCls + ' appearance-none pr-8 cursor-pointer';
const textareaCls = 'w-full px-3 py-2 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/15 bg-white transition-colors resize-none';
const borderStyle = { borderColor: '#E2E8F0' };

export default function ContactFormModal({ open, mode, initial, users, tags, onClose, onSaved }: Props) {
  const [form,    setForm]    = useState<ContactFormValue>({ ...EMPTY, ...initial });
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [showOtherAd, setShowOtherAd] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [fieldOptions, setFieldOptions] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch('/api/v1/crm/contact-fields')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.data)) {
          const map: Record<string, string[]> = {};
          d.data.forEach((f: { key: string; type: string; options: string[] | null }) => {
            if ((f.type === 'select' || f.type === 'multiselect') && f.options?.length) {
              map[f.key] = f.options;
            }
          });
          setFieldOptions(map);
        }
      })
      .catch(() => {});
  }, []);

  // Reset whenever the modal opens or the initial subject changes.
  useEffect(() => {
    if (open) {
      // In edit mode, parse the existing stored phone (e.g. "919876543210") into code + local.
      const { code, local } = initial?.phone ? parseExistingPhone(initial.phone) : { code: '+91', local: '' };
      setForm({ ...EMPTY, ...initial, countryCode: code, phone: local });
      setErrors({});
      setShowOtherAd(false);
      setTagInput('');
    }
  }, [open, initial]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  function update<K extends keyof ContactFormValue>(key: K, value: ContactFormValue[K]) {
    setForm(p => ({ ...p, [key]: value }));
    if (errors[key as string]) setErrors(e => { const n = { ...e }; delete n[key as string]; return n; });
  }

  function addTag(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (form.tags.includes(v)) return;
    update('tags', [...form.tags, v]);
    setTagInput('');
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim())                                              e.name  = 'Name is required';
    if (!form.phone.trim())                                             e.phone = 'Phone is required';
    else if (!/^\d{5,15}$/.test(form.phone.replace(/[\s\-()]/g, '')))   e.phone = 'Enter digits only (5–15 numbers)';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))   e.email = 'Email format looks invalid';
    if (form.number_of_travellers && !/^\d+$/.test(form.number_of_travellers))
                                                                        e.number_of_travellers = 'Must be a whole number';
    if (form.budget_per_person && isNaN(Number(form.budget_per_person)))
                                                                        e.budget_per_person = 'Must be a number';
    if (form.booking_value && isNaN(Number(form.booking_value)))        e.booking_value = 'Must be a number';
    setErrors(e);
    // Focus the first invalid field.
    const first = Object.keys(e)[0];
    if (first) {
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-field="${first}"]`);
        el?.focus();
      }, 0);
    }
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name:                 form.name.trim(),
        phone:                form.countryCode.replace('+', '') + form.phone.replace(/[\s\-\(\)]/g, ''),
        email:                form.email.trim() || null,
        city:                 form.city.trim() || null,
        interested_destination: form.interested_destination.trim() || null,
        number_of_travellers: form.number_of_travellers ? parseInt(form.number_of_travellers, 10) : null,
        trip_type:            form.trip_type || null,
        special_requirements: form.special_requirements.trim() || null,
        budget_per_person:    form.budget_per_person ? Number(form.budget_per_person) : null,
        lead_source:          form.lead_source || null,
        platform:             form.platform || null,
        campaign_name:        form.campaign_name.trim() || null,
        ad_set_name:          form.ad_set_name.trim() || null,
        ad_name:              form.ad_name.trim() || null,
        device_platform:      form.device_platform || null,
        gallabox_contact_id:  form.gallabox_contact_id.trim() || null,
        platform_lead_id:     form.platform_lead_id.trim() || null,
        facebook_click_id:    form.facebook_click_id.trim() || null,
        facebook_browser_id:  form.facebook_browser_id.trim() || null,
        google_click_id:      form.google_click_id.trim() || null,
        lead_stage:           form.lead_stage,
        assigned_to_id:       form.assigned_to_id || null,
        follow_up_date:       form.follow_up_date ? new Date(form.follow_up_date).toISOString() : null,
        tags:                 form.tags,
        do_not_contact:       form.do_not_contact,
        booking_value:        form.booking_value ? Number(form.booking_value) : null,
      };

      // Roll the "other ad details" subfields into a single Json field, only
      // emitting the property at all if at least one subfield is set.
      const other: Record<string, string> = {};
      if (form.other_keyword)      other.keyword       = form.other_keyword;
      if (form.other_utm_source)   other.utm_source    = form.other_utm_source;
      if (form.other_utm_medium)   other.utm_medium    = form.other_utm_medium;
      if (form.other_utm_campaign) other.utm_campaign  = form.other_utm_campaign;
      if (form.other_utm_term)     other.utm_term      = form.other_utm_term;
      if (form.other_utm_content)  other.utm_content   = form.other_utm_content;
      if (form.other_landing_page) other.landing_page  = form.other_landing_page;
      if (Object.keys(other).length > 0) payload.other_ad_details = other;

      const url = mode === 'edit' && form.id
        ? `/api/v1/crm/contacts/${form.id}`
        : '/api/v1/crm/contacts';
      const method = mode === 'edit' ? 'PATCH' : 'POST';

      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error ?? `Save failed (HTTP ${res.status})`;
        if (res.status === 409 && /phone/i.test(msg)) {
          setErrors({ phone: msg });
          toast.error(msg);
        } else {
          toast.error(msg);
        }
        return;
      }

      toast.success(mode === 'edit' ? 'Contact updated' : 'Contact added');
      onSaved(data.data);
      onClose();
    } catch (e) {
      toast.error(`Network error: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-white w-full max-w-3xl flex flex-col rounded-none sm:rounded-2xl h-[100dvh] sm:h-auto sm:max-h-[calc(100vh-2rem)] shadow-2xl"
        style={{ border: '1px solid #E2E8F0' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>
              {mode === 'edit' ? 'Edit Contact' : 'New Contact'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {mode === 'edit' ? 'Update contact details — changes save instantly to the timeline.' : 'Create a new lead in your CRM.'}
            </p>
          </div>
          <button onClick={onClose} disabled={saving}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9] disabled:opacity-30"
            style={{ color: '#64748B' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrolls */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">

          {/* SECTION 1 — Basic Info */}
          <Section title="Basic Info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Name *" error={errors.name}>
                <input className={inputCls} style={borderStyle} data-field="name" autoFocus
                  value={form.name} onChange={e => update('name', e.target.value)} placeholder="Anjali Sharma" />
              </Field>
              <Field label="Phone *" error={errors.phone}>
                <div className="flex rounded-lg border overflow-hidden" style={borderStyle} data-field="phone">
                  <select
                    value={form.countryCode}
                    onChange={e => update('countryCode', e.target.value)}
                    className="h-9 pl-2 pr-1 text-sm font-semibold bg-[#F8FAFC] border-r focus:outline-none flex-shrink-0 cursor-pointer"
                    style={{ borderColor: '#E2E8F0', color: '#0F172A', minWidth: 72 }}
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                    ))}
                  </select>
                  <input
                    className="flex-1 h-9 px-3 text-sm placeholder:text-[#94A3B8] focus:outline-none bg-white"
                    type="tel" inputMode="numeric"
                    value={form.phone}
                    onChange={e => update('phone', e.target.value.replace(/[^\d\s\-()]/g, ''))}
                    placeholder="98765 43210"
                  />
                </div>
              </Field>
              <Field label="Email" error={errors.email}>
                <input className={inputCls} style={borderStyle} data-field="email" type="email"
                  value={form.email} onChange={e => update('email', e.target.value)} placeholder="anjali@example.com" />
              </Field>
              <Field label="City">
                <input className={inputCls} style={borderStyle}
                  value={form.city} onChange={e => update('city', e.target.value)} placeholder="Mumbai" />
              </Field>
            </div>
          </Section>

          {/* SECTION 2 — Travel Interest */}
          <Section title="Travel Interest">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Interested Destination">
                <input className={inputCls} style={borderStyle}
                  value={form.interested_destination} onChange={e => update('interested_destination', e.target.value)} placeholder="Kerala, Goa, Ladakh…" />
              </Field>
              <Field label="Number of Travellers" error={errors.number_of_travellers}>
                <input className={inputCls} style={borderStyle} data-field="number_of_travellers" type="number" min={1}
                  value={form.number_of_travellers} onChange={e => update('number_of_travellers', e.target.value)} placeholder="4" />
              </Field>
              <Field label="Trip Type">
                <SelectChevron>
                  <select className={selectCls} style={borderStyle}
                    value={form.trip_type} onChange={e => update('trip_type', e.target.value as TripType | '')}>
                    <option value="">—</option>
                    {(fieldOptions['trip_type'] ?? TRIP_TYPE_VALS).map(v => (
                      <option key={v} value={v}>{TRIP_LABEL[v] ?? v}</option>
                    ))}
                  </select>
                </SelectChevron>
              </Field>
              <Field label="Budget per Person (₹)" error={errors.budget_per_person}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#64748B' }}>₹</span>
                  <input className={inputCls + ' pl-7'} style={borderStyle} data-field="budget_per_person" type="number" min={0}
                    value={form.budget_per_person} onChange={e => update('budget_per_person', e.target.value)} placeholder="25000" />
                </div>
              </Field>
              <Field label="Special Requirements" className="sm:col-span-2">
                <textarea className={textareaCls} style={borderStyle} rows={2}
                  value={form.special_requirements} onChange={e => update('special_requirements', e.target.value)}
                  placeholder="Honeymoon, vegetarian meals, wheelchair access, etc." />
              </Field>
            </div>
          </Section>

          {/* SECTION 3 — Lead Source & Ad Data */}
          <Section title="Lead Source & Ad Data">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Lead Source">
                <SelectChevron>
                  <select className={selectCls} style={borderStyle}
                    value={form.lead_source} onChange={e => update('lead_source', e.target.value as LeadSource | '')}>
                    <option value="">—</option>
                    {(fieldOptions['source'] ?? SOURCES.map(s => s.value)).map(v => (
                      <option key={v} value={v}>{SOURCE_LABEL[v] ?? v}</option>
                    ))}
                  </select>
                </SelectChevron>
              </Field>
              <Field label="Platform">
                <SelectChevron>
                  <select className={selectCls} style={borderStyle}
                    value={form.platform} onChange={e => update('platform', e.target.value as Platform | '')}>
                    <option value="">—</option>
                    {(fieldOptions['platform'] ?? PLATFORMS.map(p => p.value)).map(v => (
                      <option key={v} value={v}>{PLATFORM_LABEL[v] ?? v}</option>
                    ))}
                  </select>
                </SelectChevron>
              </Field>
              <Field label="Campaign Name">
                <input className={inputCls} style={borderStyle}
                  value={form.campaign_name} onChange={e => update('campaign_name', e.target.value)} placeholder="Diwali_Kerala_2026" />
              </Field>
              <Field label="Ad Set Name">
                <input className={inputCls} style={borderStyle}
                  value={form.ad_set_name} onChange={e => update('ad_set_name', e.target.value)} />
              </Field>
              <Field label="Ad Name">
                <input className={inputCls} style={borderStyle}
                  value={form.ad_name} onChange={e => update('ad_name', e.target.value)} />
              </Field>
              <Field label="Device Platform">
                <SelectChevron>
                  <select className={selectCls} style={borderStyle}
                    value={form.device_platform} onChange={e => update('device_platform', e.target.value as DevicePlatform | '')}>
                    <option value="">—</option>
                    <option value="MOBILE">Mobile</option>
                    <option value="DESKTOP">Desktop</option>
                  </select>
                </SelectChevron>
              </Field>
              <Field label="Gallabox Contact ID">
                <input className={inputCls} style={borderStyle}
                  value={form.gallabox_contact_id} onChange={e => update('gallabox_contact_id', e.target.value)} />
              </Field>
              <Field label="Platform Lead ID">
                <input className={inputCls} style={borderStyle}
                  value={form.platform_lead_id} onChange={e => update('platform_lead_id', e.target.value)} />
              </Field>
              <Field label="Facebook Click ID (fbclid)">
                <input className={inputCls} style={borderStyle}
                  value={form.facebook_click_id} onChange={e => update('facebook_click_id', e.target.value)} />
              </Field>
              <Field label="Facebook Browser ID (fbp)">
                <input className={inputCls} style={borderStyle}
                  value={form.facebook_browser_id} onChange={e => update('facebook_browser_id', e.target.value)} />
              </Field>
              <Field label="Google Click ID (gclid)" className="sm:col-span-2">
                <input className={inputCls} style={borderStyle}
                  value={form.google_click_id} onChange={e => update('google_click_id', e.target.value)} />
              </Field>
            </div>

            {/* Collapsible: Other ad details */}
            <button onClick={() => setShowOtherAd(v => !v)}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold transition-colors hover:opacity-80"
              style={{ color: T }} type="button">
              {showOtherAd ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Other ad details (keyword, UTM, landing page)
            </button>
            {showOtherAd && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg" style={{ backgroundColor: '#FAFBFC', border: '1px solid #F1F5F9' }}>
                <Field label="Keyword">
                  <input className={inputCls} style={borderStyle} value={form.other_keyword} onChange={e => update('other_keyword', e.target.value)} />
                </Field>
                <Field label="UTM Source">
                  <input className={inputCls} style={borderStyle} value={form.other_utm_source} onChange={e => update('other_utm_source', e.target.value)} />
                </Field>
                <Field label="UTM Medium">
                  <input className={inputCls} style={borderStyle} value={form.other_utm_medium} onChange={e => update('other_utm_medium', e.target.value)} />
                </Field>
                <Field label="UTM Campaign">
                  <input className={inputCls} style={borderStyle} value={form.other_utm_campaign} onChange={e => update('other_utm_campaign', e.target.value)} />
                </Field>
                <Field label="UTM Term">
                  <input className={inputCls} style={borderStyle} value={form.other_utm_term} onChange={e => update('other_utm_term', e.target.value)} />
                </Field>
                <Field label="UTM Content">
                  <input className={inputCls} style={borderStyle} value={form.other_utm_content} onChange={e => update('other_utm_content', e.target.value)} />
                </Field>
                <Field label="Landing Page URL" className="sm:col-span-2">
                  <input className={inputCls} style={borderStyle} value={form.other_landing_page} onChange={e => update('other_landing_page', e.target.value)} placeholder="https://travloger.in/kerala" />
                </Field>
              </div>
            )}
          </Section>

          {/* SECTION 4 — CRM */}
          <Section title="CRM">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Lead Stage">
                <SelectChevron>
                  <select className={selectCls} style={borderStyle}
                    value={form.lead_stage} onChange={e => update('lead_stage', e.target.value as LeadStage)}>
                    {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </SelectChevron>
              </Field>
              <Field label="Assigned To">
                <SelectChevron>
                  <select className={selectCls} style={borderStyle}
                    value={form.assigned_to_id} onChange={e => update('assigned_to_id', e.target.value)}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.role ? ` (${u.role})` : ''}</option>)}
                  </select>
                </SelectChevron>
              </Field>
              <Field label="Follow Up Date">
                <input className={inputCls} style={borderStyle} type="date"
                  value={form.follow_up_date} onChange={e => update('follow_up_date', e.target.value)} />
              </Field>
              {form.lead_stage === 'CONVERTED' && (
                <Field label="Booking Value (₹)" error={errors.booking_value}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#64748B' }}>₹</span>
                    <input className={inputCls + ' pl-7'} style={borderStyle} data-field="booking_value" type="number" min={0}
                      value={form.booking_value} onChange={e => update('booking_value', e.target.value)} placeholder="120000" />
                  </div>
                </Field>
              )}

              {/* Tags */}
              <Field label="Tags" className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg border min-h-[36px]" style={borderStyle}>
                  {form.tags.map((t, idx) => {
                    const colour = tags.find(x => x.name === t)?.color ?? '#64748B';
                    return (
                      <span key={`${t}-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ backgroundColor: colour + '20', color: colour }}>
                        {t}
                        <button type="button" onClick={() => update('tags', form.tags.filter((_, i) => i !== idx))}
                          className="hover:opacity-70">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  <input
                    list="contact-tag-suggestions"
                    className="flex-1 min-w-[120px] text-sm outline-none"
                    placeholder={form.tags.length === 0 ? 'Type and press Enter to add a tag…' : ''}
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')                       { e.preventDefault(); addTag(tagInput); }
                      else if (e.key === ',')                      { e.preventDefault(); addTag(tagInput); }
                      else if (e.key === 'Backspace' && !tagInput && form.tags.length > 0) {
                        update('tags', form.tags.slice(0, -1));
                      }
                    }}
                    onBlur={() => tagInput && addTag(tagInput)}
                  />
                  <datalist id="contact-tag-suggestions">
                    {tags.filter(t => !form.tags.includes(t.name)).map(t => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                </div>
              </Field>

              {/* Do Not Contact toggle */}
              <Field label="Do Not Contact" className="sm:col-span-2">
                <button type="button" onClick={() => update('do_not_contact', !form.do_not_contact)}
                  className="flex items-center gap-3 cursor-pointer">
                  <span className="relative inline-block w-10 h-6 rounded-full transition-colors"
                    style={{ backgroundColor: form.do_not_contact ? '#DC2626' : '#CBD5E1' }}>
                    <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: form.do_not_contact ? 'translateX(16px)' : 'translateX(0)' }} />
                  </span>
                  <span className="text-sm" style={{ color: form.do_not_contact ? '#DC2626' : '#64748B' }}>
                    {form.do_not_contact ? 'This contact has opted out — block all outbound messages' : 'Outbound contact allowed'}
                  </span>
                </button>
              </Field>
            </div>
          </Section>

          {/* Read-only footer (edit mode) */}
          {mode === 'edit' && (form.created_at || form.is_converted) && (
            <Section title="Record details">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {form.created_at && (
                  <ReadOnlyField label="Created" value={new Date(form.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                )}
                {form.is_converted && form.closed_date && (
                  <ReadOnlyField label="Closed" value={new Date(form.closed_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                )}
                <ReadOnlyField label="Converted" value={form.is_converted ? 'Yes' : 'No'} />
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 flex-shrink-0" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={onClose} disabled={saving}
            className="h-9 px-4 rounded-lg text-sm font-semibold disabled:opacity-30"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="h-9 px-5 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: T }}>
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : mode === 'edit'
                ? <><Save className="w-4 h-4" /> Save Changes</>
                : <><Plus className="w-4 h-4" /> Add Contact</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Small UI helpers ────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#94A3B8' }}>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className={labelCls} style={{ color: error ? '#DC2626' : '#64748B' }}>{label}</label>
      <div style={error ? { boxShadow: '0 0 0 1px #DC2626', borderRadius: 8 } : undefined}>
        {children}
      </div>
      {error && <p className="text-[11px] mt-1 font-medium" style={{ color: '#DC2626' }}>{error}</p>}
    </div>
  );
}

function SelectChevron({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{value}</p>
    </div>
  );
}

