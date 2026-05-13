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

    // Always check HTTP status BEFORE parsing — Gallabox can return HTML error pages
    if (!res.ok) {
      let errMsg = `Gallabox API error (${res.status} ${res.statusText})`;
      try {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const d = await res.json() as Record<string, unknown>;
          errMsg = (d.message ?? d.error ?? errMsg) as string;
        }
      } catch { /* ignore parse failure on error body */ }
      console.error('[gallabox/send-template] API error:', errMsg);
      return { ok: false, error: errMsg };
    }

    const data = await res.json() as Record<string, unknown>;
    console.log('[gallabox/send-template] response:', JSON.stringify(data));

    const msgId = (data.id ?? data.messageId ?? (data.data as Record<string,unknown>)?.id) as string | undefined;
    return { ok: true, messageId: msgId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[gallabox/send-template] fetch error:', msg);
    return { ok: false, error: `Failed to reach Gallabox: ${msg}` };
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

    // Always check HTTP status BEFORE parsing — Gallabox can return HTML error pages
    if (!res.ok) {
      let errMsg = `Gallabox API error (${res.status} ${res.statusText})`;
      try {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const d = await res.json() as Record<string, unknown>;
          errMsg = (d.message ?? d.error ?? errMsg) as string;
        }
      } catch { /* ignore parse failure on error body */ }
      console.error('[gallabox/send-text] API error:', errMsg);
      return { ok: false, error: errMsg };
    }

    const data = await res.json() as Record<string, unknown>;
    console.log('[gallabox/send-text] response:', JSON.stringify(data));

    const msgId = (data.id ?? data.messageId ?? (data.data as Record<string,unknown>)?.id) as string | undefined;
    return { ok: true, messageId: msgId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[gallabox/send-text] fetch error:', msg);
    return { ok: false, error: `Failed to reach Gallabox: ${msg}` };
  }
}

// ─── Fetch available approved templates ──────────────────────────────────────

/** Fallback template shown when the API call fails or returns nothing */
const FALLBACK_TEMPLATES: GallaboxTemplate[] = [
  { id: 'itinerary_ready', name: 'itinerary_ready', status: 'APPROVED', category: 'MARKETING', language: 'en' },
];

export async function listWhatsAppTemplates(): Promise<GallaboxTemplate[]> {
  if (!API_KEY || !API_SECRET) {
    console.warn('[gallabox/templates] Missing API credentials — returning fallback');
    return FALLBACK_TEMPLATES;
  }

  // Try known Gallabox endpoints — with and without channelId filter
  const channelParam = CHANNEL_ID ? `&channelId=${CHANNEL_ID}` : '';
  const endpoints = [
    `${BASE_URL}/whatsappTemplates?${channelParam}`,
    `${BASE_URL}/whatsappTemplates?status=APPROVED${channelParam}`,
    `${BASE_URL}/templates`,
    `${BASE_URL}/whatsappTemplates`,
  ];

  /** Gallabox uses both "APPROVED" and "active"/"ACTIVE" to mean "usable" */
  function isActive(status: string | undefined) {
    if (!status) return true;
    const s = status.toLowerCase();
    return s === 'approved' || s === 'active';
  }

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: headers(), cache: 'no-store' });
      const raw = await res.text();
      console.log(`[gallabox/templates] ${url} → ${res.status}: ${raw.slice(0, 400)}`);

      if (!res.ok) continue;

      let data: unknown;
      try { data = JSON.parse(raw); } catch { continue; }

      // Handle multiple known response shapes:
      // { data: [...] }  |  { entities: [...] }  |  { templates: [...] }  |
      // { whatsappTemplates: [...] }  |  direct array
      let arr: GallaboxTemplate[] = [];
      if (Array.isArray(data))                                         arr = data as GallaboxTemplate[];
      else if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        if (Array.isArray(d.data))                                     arr = d.data as GallaboxTemplate[];
        else if (Array.isArray(d.entities))                            arr = d.entities as GallaboxTemplate[];
        else if (Array.isArray(d.templates))                           arr = d.templates as GallaboxTemplate[];
        else if (Array.isArray(d.whatsappTemplates))                   arr = d.whatsappTemplates as GallaboxTemplate[];
      }

      // Accept templates whose status is APPROVED, active, ACTIVE, or missing
      const active = arr.filter(t => isActive(t.status));
      if (active.length > 0) {
        console.log(`[gallabox/templates] Returning ${active.length} active templates from ${url}`);
        return active;
      }

      // If endpoint returned data but nothing active, keep trying
      if (arr.length > 0) {
        console.warn(`[gallabox/templates] ${url} returned ${arr.length} templates but none are active — statuses: ${arr.map(t => t.status).join(', ')}`);
      }
    } catch (e) {
      console.warn(`[gallabox/templates] Failed ${url}:`, e);
    }
  }

  console.warn('[gallabox/templates] All endpoints failed — returning fallback');
  return FALLBACK_TEMPLATES;
}
