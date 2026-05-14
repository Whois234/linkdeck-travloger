'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MessageCircle, Phone, Clock, CheckCircle2, AlertCircle, Search, RefreshCw, Loader2 } from 'lucide-react';

const WhatsAppPanel = dynamic(() => import('@/components/WhatsAppPanel'), { ssr: false });

const T = '#134956';

interface Conversation {
  contact_phone: string;
  contact_name: string | null;
  last_message: string | null;
  last_message_type: string | null;
  last_direction: string;
  last_message_at: string;
  total_messages: number;
  window_status: 'open' | 'expiring' | 'closed';
  minutes_left: number;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffHrs = (now.getTime() - d.getTime()) / 3600000;
  if (diffHrs < 24) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (diffHrs < 48) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function WindowDot({ status }: { status: 'open' | 'expiring' | 'closed' }) {
  const cfg = {
    open:     { color: '#16A34A', bg: '#DCFCE7', label: 'Open' },
    expiring: { color: '#D97706', bg: '#FEF9C3', label: 'Expiring' },
    closed:   { color: '#DC2626', bg: '#FEE2E2', label: 'Closed' },
  }[status];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

export default function WhatsAppInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [panel, setPanel]                 = useState<{ phone: string; name: string } | null>(null);
  const [refreshing, setRefreshing]       = useState(false);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch('/api/gallabox/inbox');
      const d = await res.json();
      if (d.ok) setConversations(d.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase();
    return !q || (c.contact_name ?? '').toLowerCase().includes(q) || c.contact_phone.includes(q);
  });

  function getPreview(c: Conversation) {
    if (c.last_message) return c.last_message.length > 60 ? c.last_message.slice(0, 60) + '…' : c.last_message;
    return c.last_message_type ? `[${c.last_message_type}]` : 'Media message';
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>WhatsApp Inbox</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            {loading ? 'Loading…' : `${filtered.length} conversation${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold border transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
          style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone…"
          className="w-full h-10 pl-10 pr-4 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/20"
          style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
      </div>

      {/* Conversation list */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: T }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <MessageCircle className="w-10 h-10" style={{ color: '#CBD5E1' }} />
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No conversations yet</p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              {search ? 'No matches for your search' : 'WhatsApp messages from your contacts will appear here'}
            </p>
          </div>
        ) : (
          filtered.map((c, i) => (
            <button key={c.contact_phone} onClick={() => setPanel({ phone: c.contact_phone, name: c.contact_name ?? c.contact_phone })}
              className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F8FAFC]"
              style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : undefined }}>
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
                style={{ backgroundColor: T }}>
                {(c.contact_name ?? c.contact_phone).charAt(0).toUpperCase()}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>
                    {c.contact_name ?? c.contact_phone}
                  </span>
                  <span className="text-[11px] flex-shrink-0" style={{ color: '#94A3B8' }}>
                    {fmtTime(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] truncate" style={{ color: '#64748B' }}>
                    {c.last_direction === 'outgoing' ? '↗ ' : ''}{getPreview(c)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <WindowDot status={c.window_status} />
                    <span className="text-[10px] font-medium" style={{ color: '#94A3B8' }}>
                      {c.total_messages} msg{c.total_messages !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>+{c.contact_phone}</p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Chat panel */}
      {panel && (
        <WhatsAppPanel
          phone={panel.phone}
          contactName={panel.name}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
