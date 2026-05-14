'use client';
/**
 * /admin/whatsapp — Two-panel WhatsApp inbox powered by Gallabox Conversation Widget.
 *
 * LEFT  35%  — Contact list (role-filtered from CRM Contacts)
 * RIGHT 65%  — Gallabox iframe for selected contact
 *
 * iframe URL:
 *   https://conversation-widget.gallabox.com/conversations/phone/{phoneNoPlus}?name={name}&channelId={channelId}
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, RefreshCw, Loader2, MessageSquare, Phone,
  ChevronRight, User as UserIcon,
} from 'lucide-react';

const T = '#134956';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  phone: string;
  lead_source: string | null;
  platform: string | null;
  assigned_to: { id: string; name: string } | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip +, spaces, dashes — Gallabox needs plain digits with country code */
function cleanPhone(raw: string): string {
  return raw.replace(/[\s+\-()]/g, '');
}

/** Build the Gallabox Conversation Widget URL */
function gallaboxUrl(phone: string, name: string, channelId: string): string {
  const p = cleanPhone(phone);
  const n = encodeURIComponent(name);
  return `https://conversation-widget.gallabox.com/conversations/phone/${p}?name=${n}&channelId=${encodeURIComponent(channelId)}`;
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const isAd = source === 'whatsapp_ad' || source === 'META';
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{
        background: isAd ? '#FFF7ED' : '#F0FDF4',
        color:      isAd ? '#C2410C' : '#15803D',
      }}>
      {isAd ? '📢 Ad' : '💬 Organic'}
    </span>
  );
}

function AgentAvatar({ name }: { name: string }) {
  return (
    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
      style={{ background: T }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Contact | null>(null);
  const [channelId, setChannelId]   = useState('');
  const [iframeKey, setIframeKey]   = useState(0); // force iframe reload
  const [refreshing, setRefreshing] = useState(false);
  const iframeRef                   = useRef<HTMLIFrameElement>(null);

  // ── Load settings + contacts ──────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/app-settings');
      const d   = await res.json();
      if (d.ok) setChannelId(d.data?.gallabox_channel_id ?? '');
    } catch { /* silent */ }
  }, []);

  const loadContacts = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      // Fetch all assigned contacts, newest first, large limit for inbox feel
      const res = await fetch('/api/v1/crm/contacts?sort=newest&limit=200');
      const d   = await res.json();
      if (d.success || d.ok) {
        // contacts API returns { success: true, data: { items: [...], contacts: [...] } }
        const raw = Array.isArray(d.data) ? d.data : (d.data?.items ?? d.data?.contacts ?? []);
        const items: Contact[] = raw.map((c: Contact) => c);
        setContacts(items);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadContacts();
  }, [loadSettings, loadContacts]);

  // ── Filter contacts ───────────────────────────────────────────────────────

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.assigned_to?.name ?? '').toLowerCase().includes(q)
    );
  });

  // ── Select contact ────────────────────────────────────────────────────────

  function selectContact(c: Contact) {
    setSelected(c);
    setIframeKey(k => k + 1); // force fresh load when switching contact
  }

  const iframeSrc = selected && channelId
    ? gallaboxUrl(selected.phone, selected.name, channelId)
    : null;

  return (
    /* Full-height layout: fills the admin shell content area */
    <div className="flex h-[calc(100vh-64px)] overflow-hidden rounded-2xl"
      style={{ border: '1px solid #E2E8F0' }}>

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Contact list (35%)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col bg-white" style={{ width: '35%', borderRight: '1px solid #F1F5F9' }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" style={{ color: T }} />
              <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>WhatsApp Inbox</h2>
            </div>
            <button onClick={() => loadContacts(true)} disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: '#94A3B8' }} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none"
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
            />
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: T }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <UserIcon className="w-8 h-8 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
              <p className="text-xs" style={{ color: '#94A3B8' }}>
                {search ? 'No contacts match' : 'No contacts yet'}
              </p>
            </div>
          ) : (
            filtered.map(c => {
              const isActive = selected?.id === c.id;
              return (
                <button key={c.id} onClick={() => selectContact(c)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 transition-all"
                  style={{
                    background:  isActive ? `${T}10` : 'transparent',
                    borderLeft:  isActive ? `3px solid ${T}` : '3px solid transparent',
                  }}>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: isActive ? T : '#94A3B8' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate" style={{ color: isActive ? T : '#0F172A' }}>
                        {c.name}
                      </span>
                      <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: isActive ? T : '#CBD5E1' }} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-2.5 h-2.5" style={{ color: '#94A3B8' }} />
                      <span className="text-[10px] font-mono" style={{ color: '#94A3B8' }}>
                        +{cleanPhone(c.phone)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <SourceBadge source={c.lead_source ?? c.platform} />
                      {c.assigned_to && (
                        <span className="flex items-center gap-1 text-[9px]" style={{ color: '#94A3B8' }}>
                          <AgentAvatar name={c.assigned_to.name} />
                          {c.assigned_to.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2 flex-shrink-0 text-[10px] text-center" style={{ color: '#CBD5E1', borderTop: '1px solid #F1F5F9' }}>
            {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Gallabox iframe (65%)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selected ? (
          /* Placeholder — no contact selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: `${T}15` }}>
              <MessageSquare className="w-8 h-8" style={{ color: T }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold" style={{ color: '#0F172A' }}>Select a contact</p>
              <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
                Choose a contact from the left to view their conversation
              </p>
            </div>
            {!channelId && (
              <div className="text-xs px-4 py-2 rounded-xl text-center"
                style={{ background: '#FEF3C7', color: '#92400E', maxWidth: 320 }}>
                ⚠️ Gallabox Channel ID not configured.
                Go to <strong>CRM Settings → Gallabox</strong> to set it up.
              </div>
            )}
          </div>
        ) : !channelId ? (
          /* No channel ID configured */
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <MessageSquare className="w-10 h-10" style={{ color: '#F59E0B' }} />
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Channel ID not configured</p>
            <p className="text-xs text-center max-w-xs" style={{ color: '#94A3B8' }}>
              Go to <strong>CRM Settings → Gallabox</strong> and paste your Gallabox Channel ID to activate the widget.
            </p>
            <a href="/admin/crm-settings"
              className="text-xs px-4 py-2 rounded-xl font-semibold text-white"
              style={{ background: T }}>
              Open CRM Settings
            </a>
          </div>
        ) : (
          /* Gallabox iframe */
          <div className="flex flex-col h-full">
            {/* Mini header showing selected contact */}
            <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0 bg-white"
              style={{ borderBottom: '1px solid #F1F5F9' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: T }}>
                {selected.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{selected.name}</p>
                <p className="text-[10px] font-mono" style={{ color: '#94A3B8' }}>+{cleanPhone(selected.phone)}</p>
              </div>
              <button onClick={() => setIframeKey(k => k + 1)}
                className="p-1.5 rounded-lg hover:bg-gray-100"
                title="Reload conversation">
                <RefreshCw className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              </button>
            </div>

            {/* iframe */}
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={iframeSrc!}
              width="100%"
              className="flex-1"
              style={{ border: 'none', display: 'block' }}
              allow="microphone; camera; clipboard-write"
              title={`WhatsApp — ${selected.name}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
