/**
 * Gallabox API service
 * Docs: https://documenter.getpostman.com/view/21043235/2s9Ye8gF7e
 *
 * Env vars required:
 *   GALLABOX_API_KEY      — from Gallabox Settings → API Keys
 *   GALLABOX_API_SECRET   — from Gallabox Settings → API Keys
 *   GALLABOX_CHANNEL_ID   — your WhatsApp channel ID
 */

const BASE_URL     = 'https://server.gallabox.com/devapi';
const API_KEY      = process.env.GALLABOX_API_KEY      ?? '';
const API_SECRET   = process.env.GALLABOX_API_SECRET   ?? '';
const CHANNEL_ID   = process.env.GALLABOX_CHANNEL_ID   ?? '';

function headers() {
  return {
    'Content-Type':    'application/json',
    'apiKey':          API_KEY,
    'apiSecret':       API_SECRET,
  };
}

/** Normalise phone to digits-only E.164 (no + prefix needed for Gallabox) */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Strip leading country-code zero confusion — keep as-is for India (91...)
  return digits;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateVariable {
  type:  'text';
  text:  string;
}

export interface GallaboxTemplate {
  id:           string;
  name:         string;
  status:       string;   // APPROVED | PENDING | REJECTED
  category:     string;
  language:     string;
  components?:  unknown[];
}

export interface SendResult {
  ok:      boolean;
  messageId?: string;
  error?:  string;
}

// ─── Send template message ────────────────────────────────────────────────────

export async function sendWhatsAppTemplate(
  phone:        string,
  templateName: string,
  variables:    string[],          // ordered list of variable values
  contactName:  string,
  language =    'en',
): Promise<SendResult> {
  if (!API_KEY || !API_SECRET || !CHANNEL_ID) {
    return { ok: false, error: 'Gallabox env vars not configured' };
  }

  const digits = normalisePhone(phone);

  // Build components.body.parameters from variables array
  const bodyParams = variables.map(v => ({ type: 'text', text: v }));

  const payload = {
    channelId: CHANNEL_ID,
    channelType: 'whatsapp',
    contact: {
      phone:  digits,
      name:   contactName || 'Customer',
      countryCode: digits.startsWith('91') ? '+91' : undefined,
    },
    whatsapp: {
      type: 'template',
      template: {
        templateName: templateName,
        bodyValues:   variables,        // simple array form (Gallabox accepts both)
      },
    },
  };

  try {
    const res = await fetch(`${BASE_URL}/messages`, {
      method:  'POST',
      headers: headers(),
      body:    JSON.stringify(payload),
    });

    const data = await res.json() as Record<string, unknown>;
    console.log('[gallabox/send-template] response:', JSON.stringify(data));

    if (!res.ok) {
      return { ok: false, error: (data.message ?? data.error ?? res.statusText) as string };
    }

    const msgId = (data.id ?? data.messageId ?? (data.data as Record<string,unknown>)?.id) as string | undefined;
    return { ok: true, messageId: msgId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[gallabox/send-template] fetch error:', msg);
    return { ok: false, error: msg };
  }
}

// ─── Send free-text message (session / 24-hr window) ─────────────────────────

export async function sendWhatsAppText(
  phone:       string,
  message:     string,
  contactName: string,
): Promise<SendResult> {
  if (!API_KEY || !API_SECRET || !CHANNEL_ID) {
    return { ok: false, error: 'Gallabox env vars not configured' };
  }

  const digits = normalisePhone(phone);

  const payload = {
    channelId:   CHANNEL_ID,
    channelType: 'whatsapp',
    contact: {
      phone:  digits,
      name:   contactName || 'Customer',
    },
    whatsapp: {
      type: 'text',
      text: { body: message },
    },
  };

  try {
    const res = await fetch(`${BASE_URL}/messages`, {
      method:  'POST',
      headers: headers(),
      body:    JSON.stringify(payload),
    });

    const data = await res.json() as Record<string, unknown>;
    console.log('[gallabox/send-text] response:', JSON.stringify(data));

    if (!res.ok) {
      return { ok: false, error: (data.message ?? data.error ?? res.statusText) as string };
    }

    const msgId = (data.id ?? data.messageId ?? (data.data as Record<string,unknown>)?.id) as string | undefined;
    return { ok: true, messageId: msgId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[gallabox/send-text] fetch error:', msg);
    return { ok: false, error: msg };
  }
}

// ─── Fetch available approved templates ──────────────────────────────────────

export async function listWhatsAppTemplates(): Promise<GallaboxTemplate[]> {
  if (!API_KEY || !API_SECRET) return [];

  try {
    const res = await fetch(`${BASE_URL}/whatsappTemplates?status=APPROVED`, {
      headers: headers(),
      cache:   'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>;
    // Response is { data: [...] } or just an array
    const arr = Array.isArray(data) ? data : (data.data as GallaboxTemplate[] ?? []);
    return arr as GallaboxTemplate[];
  } catch {
    return [];
  }
}
