// Shared types, constants, and helpers for the pipelines feature

export interface Stage { id: string; name: string; color: string; order: number }

export interface Lead {
  id: string; name: string; phone: string; email: string | null;
  source: string | null; destination_interest: string | null;
  travel_month: string | null; budget_range: string | null;
  status: string; stage_id: string | null; pipeline_id: string | null;
  owner_id: string | null; crm_contact_id: string | null;
  created_at: string;
  stage?: { id: string; name: string; color: string; order: number } | null;
  _count?: { call_logs: number; lead_notes: number };
  quotes?: QuoteRef[];
}

export interface Pipeline { id: string; name: string; is_default: boolean; stages: Stage[]; leads: Lead[] }
export interface Note { id: string; content: string; created_at: string; created_by: string }
export interface CallLog { id: string; duration: number | null; outcome: string; notes: string | null; created_at: string; created_by: string }
export interface Task { id: string; type: string; due_time: string; status: string; notes: string | null }
export interface Activity { id: string; type: string; metadata: Record<string, unknown> | null; created_at: string; created_by: string }
export interface QuoteOption { id: string; option_name: string; final_price: number; is_most_popular: boolean }
export interface QuoteEvent  { id: string; event_type: string; metadata?: Record<string, unknown> | null; created_at: string }
export interface QuoteRef {
  id: string; quote_number: string; status: string; created_at: string; updated_at: string;
  quote_name: string | null; start_date: string; end_date: string; adults: number; duration_days: number;
  quote_options: QuoteOption[];
  events: QuoteEvent[];
  _count: { events: number };
}

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW:         { bg: '#EFF6FF', text: '#2563EB' },
  CONTACTED:   { bg: '#F0FDF4', text: '#16A34A' },
  QUALIFIED:   { bg: '#FEF9C3', text: '#A16207' },
  NEGOTIATING: { bg: '#FFF7ED', text: '#C2410C' },
  WON:         { bg: '#DCFCE7', text: '#15803D' },
  LOST:        { bg: '#FEF2F2', text: '#DC2626' },
};

export const QUOTE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: '#F8FAFC', text: '#64748B' },
  PUBLISHED: { bg: '#EFF6FF', text: '#2563EB' },
  ACCEPTED:  { bg: '#DCFCE7', text: '#15803D' },
  REJECTED:  { bg: '#FEF2F2', text: '#DC2626' },
  EXPIRED:   { bg: '#F1F5F9', text: '#94A3B8' },
};

export const TASK_ICONS: Record<string, string> = {
  call: 'PhoneCall', follow_up: 'RefreshCw', send_quote: 'FileText', meeting: 'Users', other: 'Pin',
};

export const ACTIVITY_CONFIG: Record<string, { icon: string; color: string; label: (m: Record<string, string>) => string }> = {
  created:      { icon: 'Sparkles',        color: '#6366F1', label: () => 'Lead created' },
  stage_changed:{ icon: 'ArrowLeftRight',  color: '#0EA5E9', label: m => `Stage: ${m.from ?? '?'} → ${m.to ?? '?'}` },
  note_added:   { icon: 'FileText',        color: '#F59E0B', label: () => 'Note added' },
  call_logged:  { icon: 'PhoneCall',       color: '#10B981', label: m => `Call logged — ${m.outcome ?? ''}` },
  task_added:   { icon: 'Clock',           color: '#8B5CF6', label: m => `Task: ${(m.task_type as string ?? '').replace('_', ' ')}` },
  quote_created:  { icon: 'FileText',      color: '#2563EB', label: () => 'Quote created' },
  quote_sent:     { icon: 'Send',          color: '#0891B2', label: () => 'Quote sent to customer' },
  quote_viewed:   { icon: 'Eye',           color: '#7C3AED', label: () => 'Customer viewed the quote' },
  quote_approved: { icon: 'CheckCircle',   color: '#15803D', label: () => 'Customer approved the quote' },
};

export const SECTION_ORDER = ['hero', 'packages', 'dates', 'itinerary', 'inclusions', 'fare', 'policies', 'faqs'];

export function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
