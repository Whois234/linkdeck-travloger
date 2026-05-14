import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined, currency = 'INR') {
  const n = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(amount: number | null | undefined) {
  const n = Math.round(Number(amount) || 0);
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Policy enum → human labels
export const POLICY_TYPE_LABELS: Record<string, string> = {
  PAYMENT: 'Payment Policy',
  CANCELLATION: 'Cancellation Policy',
  TERMS: 'Terms & Conditions',
  FAQ: 'FAQ',
  IMPORTANT_NOTE: 'Important Note',
};

export const POLICY_APPLIES_TO_LABELS: Record<string, string> = {
  GROUP: 'Group Tours',
  PRIVATE: 'Private Tours',
  BOTH: 'Both',
};

export function policyTypeLabel(type: string | null | undefined) {
  if (!type) return '';
  return POLICY_TYPE_LABELS[type] ?? type;
}

export function policyAppliesToLabel(val: string | null | undefined) {
  if (!val) return '';
  return POLICY_APPLIES_TO_LABELS[val] ?? val;
}

// Group batch status enum → human labels
export const BATCH_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  FILLING_FAST: 'Filling Fast',
  SOLD_OUT: 'Sold Out',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export function batchStatusLabel(status: string | null | undefined) {
  if (!status) return '';
  return BATCH_STATUS_LABELS[status] ?? status;
}
