/**
 * Gallabox API service
 * Credentials are read from the AppSetting table (CRM Settings → Gallabox tab),
 * falling back to env vars for backward compatibility.
 */

import { prisma } from '@/lib/prisma';

const BASE_URL      = 'https://server.gallabox.com/devapi';
const MESSAGES_PATH = '/messages/whatsapp'; // confirmed from Gallabox n8n/Postman docs

interface GallaboxCreds {
  apiKey:    string;
  apiSecret: string;
  channelId: string;
}

/** Read credentials from DB (AppSetting table), fall back to env vars */
async function getGallaboxCreds(): Promise<GallaboxCreds> {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ['gallabox_api_key', 'gallabox_api_secret', 'gallabox_channel_id'] } },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      apiKey:    map['gallabox_api_key']    || process.env.GALLABOX_API_KEY    || '',
      apiSecret: map['gallabox_api_secret'] || process.env.GALLABOX_API_SECRET || '',
      channelId: map['gallabox_channel_id'] || process.env.GALLABOX_CHANNEL_ID || '',
    };
  } catch {
    return {
      apiKey:    process.env.GALLABOX_API_KEY    ?? '',
      apiSecret: process.env.GALLABOX_API_SECRET ?? '',
      channelId: process.env.GALLABOX_CHANNEL_ID ?? '',
    };
  }
}

function makeHeaders(creds: GallaboxCreds) {
  return {
    'Content-Type': 'application/json',
    'apikey':       creds.apiKey,
    'apisecret':    creds.apiSecret,
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

interface TemplateButton {
  type: string;   // URL | PHONE_NUMBER | QUICK_REPLY
  text?: string;
  url?:  string;
}

interface TemplateComponent {
  type:     string;   // HEADER | BODY | FOOTER | BUTTONS
  text?:    string;
  format?:  string;
  buttons?: TemplateButton[];
}

export interface GallaboxTemplate {
  id:            string;
  name:          string;
  status:        string;   // APPROVED | active | ACTIVE | PENDING | REJECTED
  category:      string;
  language:      string;
  components?:   TemplateComponent[];
  /** Number of {{n}} placeholders found in the BODY component */
  bodyVarCount:  number;
  /** True when a URL button has a dynamic {{1}} suffix */
  hasUrlButton:  boolean;
}

export interface SendResult {
  ok:      boolean;
  messageId?: string;
  error?:  string;
}

// ─── Template parser ──────────────────────────────────────────────────────────

function parseTemplate(raw: Record<string, unknown>): GallaboxTemplate {
  const components = ((raw.components ?? []) as TemplateComponent[]).map(c => ({
    ...c,
    type: (c.type ?? '').toUpperCase(),
    buttons: (c.buttons ?? []).map(b => ({ ...b, type: (b.type ?? '').toUpperCase() })),
  }));

  const body       = components.find(c => c.type === 'BODY');
  const bodyText   = body?.text ?? '';
  const bodyVarCount = new Set((bodyText.match(/\{\{\d+\}\}/g) ?? [])).size;

  const buttonsComp = components.find(c => c.type === 'BUTTONS');
  const hasUrlButton = (buttonsComp?.buttons ?? []).some(
    b => b.type === 'URL' && (b.url ?? '').includes('{{'),
  );

  return {
    id:           String(raw.id   ?? raw._id ?? ''),
    name:         String(raw.name ?? ''),
    status:       String(raw.status   ?? ''),
    category:     String(raw.category ?? ''),
    language:     String(raw.language ?? 'en'),
    components,
    bodyVarCount,
    hasUrlButton,
  };
}

// ─── Send template message ────────────────────────────────────────────────────

export async function sendWhatsAppTemplate(
  phone:         string,
  templateName:  string,
  variables:     string[],   // body {{n}} values
  contactName:   string,
  language =     'en',
  buttonValues:  string[] = [], // URL button dynamic suffix(es)
): Promise<SendResult> {
  const creds = await getGallaboxCreds();
  if (!creds.apiKey || !creds.apiSecret || !creds.channelId) {
    return { ok: false, error: 'Gallabox credentials not configured — go to CRM Settings → Gallabox to set them' };
  }

  const digits = normalisePhone(phone);

  const payload: Record<string, unknown> = {
    channelId:    creds.channelId,
    channelType:  'whatsapp',
    recipient: {
      phone: digits,
      name:  contactName || 'Customer',
    },
    whatsapp: {
      type: 'template',
      template: {
        templateName,
        ...(variables.length    > 0 ? { bodyValues:   variables.map((v, i) => ({ index: i, type: 'text', text: v })) } : {}),
        ...(buttonValues.length > 0 ? { buttonValues: buttonValues.map((v, i) => ({
          index: i, type: 'button', sub_type: 'url',
          parameters: { type: 'text', text: v },
        })) } : {}),
      },
    },
  };

  try {
    const res = await fetch(`${BASE_URL}${MESSAGES_PATH}`, {
      method:  'POST',
      headers: makeHeaders(creds),
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      // Always read the full body to surface Gallabox's real error message
      let rawBody = '';
      try { rawBody = await res.text(); } catch { /* ignore */ }
      let errMsg = `Gallabox error (${res.status}): ${rawBody.slice(0, 300)}`;
      try {
        const d = JSON.parse(rawBody) as Record<string, unknown>;
        const apiMsg = (d.message ?? d.error ?? d.msg ?? '') as string;
        if (apiMsg) errMsg = `Gallabox (${res.status}): ${apiMsg}`;
      } catch { /* raw text is fine */ }
      console.error('[gallabox/send-template] API error:', errMsg, '| payload:', JSON.stringify(payload));
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
  const creds = await getGallaboxCreds();
  if (!creds.apiKey || !creds.apiSecret || !creds.channelId) {
    return { ok: false, error: 'Gallabox credentials not configured — go to CRM Settings → Gallabox' };
  }

  const digits = normalisePhone(phone);

  const payload = {
    channelId:   creds.channelId,
    channelType: 'whatsapp',
    recipient: {
      phone: digits,
      name:  contactName || 'Customer',
    },
    whatsapp: {
      type: 'text',
      text: { body: message },
    },
  };

  try {
    const res = await fetch(`${BASE_URL}${MESSAGES_PATH}`, {
      method:  'POST',
      headers: makeHeaders(creds),
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      let errMsg = `Gallabox API error (${res.status})`;
      if (res.status === 401) errMsg = 'Gallabox unauthorised (401) — check apikey and apisecret in CRM Settings';
      if (res.status === 404) errMsg = 'Gallabox channel not found (404) — check Channel ID in CRM Settings';
      try {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const d = await res.json() as Record<string, unknown>;
          const apiMsg = (d.message ?? d.error ?? '') as string;
          if (apiMsg) errMsg = apiMsg;
        }
      } catch { /* ignore */ }
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
  {
    id: 'itinerary_ready', name: 'itinerary_ready', status: 'APPROVED',
    category: 'UTILITY', language: 'en',
    bodyVarCount: 0, hasUrlButton: true,   // static body + URL button
  },
];

export async function listWhatsAppTemplates(): Promise<GallaboxTemplate[]> {
  const creds = await getGallaboxCreds();
  if (!creds.apiKey || !creds.apiSecret) {
    console.warn('[gallabox/templates] Missing API credentials — returning fallback');
    return FALLBACK_TEMPLATES;
  }

  const channelParam = creds.channelId ? `&channelId=${creds.channelId}` : '';
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
      const res = await fetch(url, { headers: makeHeaders(creds), cache: 'no-store' });
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
      // Then parse each one so bodyVarCount and hasUrlButton are populated
      const active = arr
        .filter(t => isActive(t.status))
        .map(t => parseTemplate(t as unknown as Record<string, unknown>));
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
