'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, Loader2, MessageSquare, RotateCcw, Wifi, Clock } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  phone: string;
  lead_source: string | null;
  platform: string | null;
  assigned_to: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
  custom_fields?: Record<string, unknown> | null;
}

function cleanPhone(raw: string): string {
  return raw.replace(/[\s+\-()]/g, '');
}

function gallaboxUrl(phone: string, name: string, channelId: string): string {
  return `https://conversation-widget.gallabox.com/conversations/phone/${cleanPhone(phone)}?name=${encodeURIComponent(name)}&channelId=${encodeURIComponent(channelId)}`;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// 72-hour CTWA free window countdown
function ctwaTimeLeft(createdAt: string): string | null {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const windowMs = 72 * 3600 * 1000;
  const remaining = windowMs - elapsed;
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Detect ad contacts — check lead_source, platform and custom_fields
function isAdContact(c: Contact): boolean {
  const src = (c.lead_source ?? '').toLowerCase();
  const plat = (c.platform ?? '').toLowerCase();
  if (src === 'ctwa' || src === 'whatsapp_ad' || src === 'cta') return true;
  if (plat === 'meta') return true;
  // Check custom_fields for gallabox_ad_id
  const cf = c.custom_fields as Record<string, unknown> | null;
  if (cf?.gallabox_ad_id) return true;
  return false;
}

const PALETTE = [
  { bg: '#EEF2FF', text: '#4338CA' },
  { bg: '#F0FDF4', text: '#15803D' },
  { bg: '#FDF4FF', text: '#9333EA' },
  { bg: '#FFF7ED', text: '#C2410C' },
  { bg: '#FFF1F2', text: '#BE123C' },
  { bg: '#F0F9FF', text: '#0369A1' },
];
function avatarStyle(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function WhatsAppPage() {
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Contact | null>(null);
  const [channelId, setChannelId]   = useState('');
  const [iframeKey, setIframeKey]   = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const iframeRef                   = useRef<HTMLIFrameElement>(null);

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
      // sort=recent → updated_at DESC so latest active chats are first
      const res = await fetch('/api/v1/crm/contacts?sort=recent&limit=200');
      const d   = await res.json();
      if (d.success || d.ok) {
        const raw = Array.isArray(d.data) ? d.data : (d.data?.items ?? d.data?.contacts ?? []);
        setContacts(raw.map((c: Contact) => c));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadSettings(); loadContacts(); }, [loadSettings, loadContacts]);

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.assigned_to?.name ?? '').toLowerCase().includes(q);
  });

  function selectContact(c: Contact) { setSelected(c); setIframeKey(k => k + 1); }

  const iframeSrc = selected && channelId ? gallaboxUrl(selected.phone, selected.name, channelId) : null;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">

      {/* ── SIDEBAR ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-shrink-0" style={{ width: '300px', borderRight: '1px solid #EBEBEB', background: '#FAFAFA' }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid #EBEBEB' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#E6F9EE' }}>
                <MessageSquare className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
              </div>
              <span className="text-sm font-semibold text-gray-800">WhatsApp Inbox</span>
            </div>
            <button
              onClick={() => loadContacts(true)}
              disabled={refreshing}
              title="Refresh"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg outline-none bg-white placeholder:text-gray-400 text-gray-700"
              style={{ border: '1px solid #E5E7EB' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#16A34A')}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
            />
          </div>

          {!loading && (
            <p className="text-[10px] text-gray-400 mt-2">
              {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#E5E7EB transparent' }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
              <p className="text-xs text-gray-400">Loading…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-xs text-gray-400">{search ? 'No results found' : 'No contacts yet'}</p>
            </div>
          ) : (
            filtered.map((c, idx) => {
              const isActive = selected?.id === c.id;
              const isAd = isAdContact(c);
              const av = avatarStyle(c.name);
              const agentName = c.assigned_to?.name ?? null;
              const timeLeft = isAd ? ctwaTimeLeft(c.created_at) : null;

              return (
                <div key={c.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                  <button
                    onClick={() => selectContact(c)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors"
                    style={{
                      background: isActive ? '#F0FDF4' : 'transparent',
                      borderLeft: isActive ? '3px solid #16A34A' : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ background: av.bg, color: av.text }}
                    >
                      {initials(c.name)}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Row 1: name + time */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-semibold text-gray-800 truncate">{c.name}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(c.updated_at || c.created_at)}</span>
                      </div>

                      {/* Row 2: phone */}
                      <p className="text-[10px] text-gray-400 font-mono mb-1.5 truncate">+{cleanPhone(c.phone)}</p>

                      {/* Row 3: badges */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* Source badge */}
                        <span
                          className="inline-flex items-center text-[9px] font-semibold px-2 py-0.5 rounded-full"
                          style={isAd
                            ? { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }
                            : { background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0' }
                          }
                        >
                          {isAd ? 'Ad' : 'Organic'}
                        </span>

                        {/* 72h window countdown — only for ad contacts while window is open */}
                        {timeLeft && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
                            <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                            {timeLeft}
                          </span>
                        )}

                        {/* Agent badge — full name */}
                        {agentName && (
                          <span className="inline-flex items-center text-[9px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}>
                            {agentName}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-gray-200" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">Select a conversation</p>
              <p className="text-xs text-gray-400 mt-1">Choose a contact from the sidebar</p>
            </div>
            {!channelId && (
              <a href="/admin/crm-settings"
                className="text-xs px-4 py-2 rounded-lg border transition-colors hover:bg-yellow-50"
                style={{ color: '#B45309', borderColor: '#FDE68A', background: '#FFFBEB' }}>
                Configure Gallabox Channel ID in CRM Settings
              </a>
            )}
          </div>
        ) : !channelId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
              <Wifi className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Channel not configured</p>
            <a href="/admin/crm-settings"
              className="text-xs px-4 py-2 rounded-lg font-medium transition-colors hover:opacity-90 text-white"
              style={{ background: '#16A34A' }}>
              Open CRM Settings
            </a>
          </div>
        ) : (
          <div className="flex flex-col h-full">

            {/* Contact header */}
            <div className="flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #EBEBEB' }}>

              {/* CTWA free window banner */}
              {(() => {
                const timeLeft = isAdContact(selected) ? ctwaTimeLeft(selected.created_at) : null;
                if (!timeLeft) return null;
                return (
                  <div
                    className="flex items-center gap-2 px-5 py-2"
                    style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}
                  >
                    <Clock className="w-3 h-3 flex-shrink-0" style={{ color: '#D97706' }} />
                    <p className="text-[11px]" style={{ color: '#92400E' }}>
                      <span className="font-semibold">{timeLeft} left</span> to message this customer for free via CTWA window
                    </p>
                  </div>
                );
              })()}

              {/* Contact info row */}
              <div className="flex items-center gap-3 px-5 py-3">
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                  style={{ background: avatarStyle(selected.name).bg, color: avatarStyle(selected.name).text }}
                >
                  {initials(selected.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-none">{selected.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">+{cleanPhone(selected.phone)}</p>
                </div>

                {/* Source badge in header */}
                <span
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={isAdContact(selected)
                    ? { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }
                    : { background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0' }
                  }
                >
                  {isAdContact(selected) ? 'Ad' : 'Organic'}
                </span>

                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 5px #4ADE80' }} />
                  <span className="text-[10px] text-gray-400">Live</span>
                </div>

                <button
                  onClick={() => setIframeKey(k => k + 1)}
                  title="Reload conversation"
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 text-gray-400"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Iframe */}
            <div className="flex-1 relative overflow-hidden">
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={iframeSrc!}
                className="absolute inset-0 w-full h-full"
                style={{ border: 'none' }}
                allow="microphone; camera; clipboard-write"
                title={`WhatsApp — ${selected.name}`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
