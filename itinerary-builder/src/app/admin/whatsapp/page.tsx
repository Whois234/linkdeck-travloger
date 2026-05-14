'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, Loader2, MessageSquare, Phone, Megaphone, Leaf, Users } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-teal-500 to-cyan-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-green-600',
  'from-sky-500 to-blue-600',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── Main page ────────────────────────────────────────────────────────────────

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
      const res = await fetch('/api/v1/crm/contacts?sort=newest&limit=200');
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
    <div
      className="flex h-[calc(100vh-64px)] overflow-hidden rounded-2xl relative"
      style={{
        background: 'linear-gradient(135deg, #0d1f2d 0%, #134956 45%, #0f2535 100%)',
      }}
    >
      {/* Ambient blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #25d366 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute -bottom-24 right-1/3 w-80 h-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #134956 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute top-1/2 -right-16 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #25d366 0%, transparent 70%)', filter: 'blur(50px)' }} />
      </div>

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col z-10 flex-shrink-0"
        style={{
          width: '340px',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(37,211,102,0.2)', border: '1px solid rgba(37,211,102,0.3)' }}>
                <MessageSquare className="w-4 h-4" style={{ color: '#25d366' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-none">WhatsApp Inbox</h2>
                {!loading && (
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => loadContacts(true)}
              disabled={refreshing}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-105"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: 'rgba(255,255,255,0.6)' }} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full pl-9 pr-4 py-2.5 text-xs text-white rounded-xl outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                caretColor: '#25d366',
              }}
            />
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#25d366' }} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading conversations…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Users className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.3)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {search ? 'No results found' : 'No contacts yet'}
              </p>
            </div>
          ) : (
            <div className="py-2">
              {filtered.map(c => {
                const isActive = selected?.id === c.id;
                const isAd = c.lead_source === 'whatsapp_ad' || c.platform === 'META' || c.lead_source === 'CTWA';
                return (
                  <button
                    key={c.id}
                    onClick={() => selectContact(c)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 transition-all relative group"
                    style={{
                      background: isActive
                        ? 'rgba(37,211,102,0.12)'
                        : 'transparent',
                    }}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-r-full"
                        style={{ background: '#25d366' }} />
                    )}

                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br ${avatarColor(c.name)}`}
                      style={{ boxShadow: isActive ? '0 0 12px rgba(37,211,102,0.3)' : 'none' }}>
                      {initials(c.name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate"
                          style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.85)' }}>
                          {c.name}
                        </span>
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {timeAgo(c.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-2.5 h-2.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
                        <span className="text-[11px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          +{cleanPhone(c.phone)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {/* Source badge */}
                        {(c.lead_source || c.platform) && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={isAd
                              ? { background: 'rgba(251,146,60,0.2)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }
                              : { background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
                            }
                          >
                            {isAd ? <Megaphone className="w-2 h-2" /> : <Leaf className="w-2 h-2" />}
                            {isAd ? 'Ad' : 'Organic'}
                          </span>
                        )}
                        {/* Assigned agent */}
                        {c.assigned_to && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center text-[7px] font-bold text-white">
                              {c.assigned_to.name[0].toUpperCase()}
                            </div>
                            {c.assigned_to.name.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col z-10">
        {!selected ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center"
              style={{
                background: 'rgba(37,211,102,0.1)',
                border: '1px solid rgba(37,211,102,0.2)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 0 40px rgba(37,211,102,0.1)',
              }}
            >
              <MessageSquare className="w-10 h-10" style={{ color: 'rgba(37,211,102,0.7)' }} />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">Select a conversation</p>
              <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Choose a contact from the left to view their WhatsApp conversation
              </p>
            </div>
            {!channelId && (
              <div
                className="text-xs px-5 py-3 rounded-2xl text-center max-w-xs"
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  color: '#fbbf24',
                  backdropFilter: 'blur(10px)',
                }}
              >
                Gallabox Channel ID not configured.
                Go to <strong>CRM Settings &rarr; Gallabox</strong> to set it up.
              </div>
            )}
          </div>
        ) : !channelId ? (
          /* No channel ID */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <MessageSquare className="w-8 h-8" style={{ color: '#fbbf24' }} />
            </div>
            <p className="text-base font-bold text-white">Channel ID not configured</p>
            <p className="text-sm text-center max-w-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Go to CRM Settings &rarr; Gallabox and paste your Gallabox Channel ID.
            </p>
            <a
              href="/admin/crm-settings"
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #134956, #1a6b7a)' }}
            >
              Open CRM Settings
            </a>
          </div>
        ) : (
          /* Gallabox iframe */
          <div className="flex flex-col h-full">
            {/* Contact header bar */}
            <div
              className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br ${avatarColor(selected.name)}`}>
                {initials(selected.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{selected.name}</p>
                <p className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  +{cleanPhone(selected.phone)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px rgba(74,222,128,0.8)' }} />
                <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Live</span>
              </div>
              <button
                onClick={() => setIframeKey(k => k + 1)}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-105"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                title="Reload conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
              </button>
            </div>

            {/* iframe wrapper */}
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
