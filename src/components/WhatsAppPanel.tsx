'use client';
/**
 * WhatsAppPanel — right-side drawer showing WhatsApp conversation + send input.
 * Used from Pipeline and Contacts pages.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2, MessageCircle, ChevronDown, Clock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id:           string;
  direction:    string;   // 'incoming' | 'outgoing' | 'unknown'
  content:      string | null;
  message_type: string | null;
  status:       string | null;
  created_at:   string;
  contact_name: string | null;
}

interface WindowStatus {
  status:        'open' | 'expiring' | 'closed';
  minutesLeft:   number;
  lastMessageAt: string | null;
}

interface Template {
  id:           string;
  name:         string;
  language:     string;
  bodyVarCount: number;
  hasUrlButton: boolean;
}

interface Props {
  phone:       string;
  contactName: string;
  onClose:     () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (d.toDateString() === now.toDateString()) return timeStr;
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return `Yesterday · ${timeStr}`;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + timeStr;
}

// ─── Delivery tick (WhatsApp-style) ──────────────────────────────────────────

function DeliveryTick({ status }: { status: string | null }) {
  if (!status || status === 'failed') return null;
  const isRead      = status === 'read';
  const isDelivered = status === 'delivered' || isRead;
  const clr         = isRead ? '#53BDEB' : 'rgba(255,255,255,0.80)';

  if (!isDelivered) {
    // Single checkmark — sent
    return (
      <svg width="14" height="11" viewBox="0 0 14 11" fill="none" style={{ display:'inline', flexShrink:0 }}>
        <path d="M1 5.5L5 9.5L13 1.5" stroke={clr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  // Double checkmark — delivered or read
  return (
    <svg width="18" height="11" viewBox="0 0 18 11" fill="none" style={{ display:'inline', flexShrink:0 }}>
      <path d="M1 5.5L5 9.5L13 1.5"  stroke={clr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 5.5L9 9.5L17 1.5"  stroke={clr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Window badge ─────────────────────────────────────────────────────────────

function WindowBadge({ w }: { w: WindowStatus | null }) {
  if (!w) return null;
  const hrs = Math.floor(w.minutesLeft / 60);
  const mins = w.minutesLeft % 60;
  const timeStr = hrs > 0 ? `${hrs}h` : `${mins}m`;

  if (w.status === 'open') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: '#DCFCE7', color: '#166534' }}>
      <CheckCircle2 className="w-3 h-3" /> Window open · {timeStr}
    </span>
  );
  if (w.status === 'expiring') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: '#FEF9C3', color: '#854D0E' }}>
      <Clock className="w-3 h-3" /> Expiring · {timeStr}
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: '#FEE2E2', color: '#991B1B' }}>
      <AlertCircle className="w-3 h-3" /> Window closed · template only
    </span>
  );
}

// ─── Message content renderer ─────────────────────────────────────────────────

function MessageContent({ msg, isOut }: { msg: Message; isOut: boolean }) {
  if (msg.message_type === 'template') {
    return (
      <div>
        <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{ opacity: 0.55 }}>Template</p>
        <p className="leading-snug font-medium">{msg.content ?? 'Template message'}</p>
      </div>
    );
  }
  if (msg.content) {
    return <p className="leading-snug whitespace-pre-wrap">{msg.content}</p>;
  }
  return (
    <p className="italic text-xs" style={{ opacity: 0.6 }}>
      {msg.message_type ?? 'Media message'}
    </p>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WhatsAppPanel({ phone, contactName, onClose }: Props) {
  const digits = phone.replace(/\D/g, '');

  const [messages,   setMessages]   = useState<Message[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(true);
  const [winStatus,  setWinStatus]  = useState<WindowStatus | null>(null);
  const [templates,  setTemplates]  = useState<Template[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Send state
  const [mode,      setMode]      = useState<'text' | 'template'>('text');
  const [text,      setText]      = useState('');
  const [tpl,       setTpl]       = useState('');
  const [selTpl,    setSelTpl]    = useState<Template | null>(null);
  const [vars,      setVars]      = useState<string[]>([]);
  const [buttonUrl, setButtonUrl] = useState('');
  const [sending,   setSending]   = useState(false);
  const [sendErr,   setSendErr]   = useState('');

  const bottomRef  = useRef<HTMLDivElement>(null);
  const isFirstRef = useRef(true);

  // Safely parse JSON
  async function safeJson<T>(res: Response): Promise<T | null> {
    try {
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) return null;
      return await res.json() as T;
    } catch {
      return null;
    }
  }

  // Fetch conversation + window status
  const loadConversation = useCallback(async (silent = false) => {
    if (!silent) setLoadingMsg(true);
    else setRefreshing(true);
    try {
      const [msgRes, winRes] = await Promise.all([
        fetch(`/api/gallabox/conversation?phone=${digits}`),
        fetch('/api/gallabox/window', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ phones: [digits] }),
        }),
      ]);
      const msgData = await safeJson<{ ok: boolean; data?: Message[] }>(msgRes);
      const winData = await safeJson<{ ok: boolean; data?: Record<string, WindowStatus> }>(winRes);
      if (msgData?.ok) setMessages(msgData.data ?? []);
      if (winData?.ok) {
        const w = winData.data?.[digits] ?? null;
        setWinStatus(w);
        if (w?.status === 'closed') setMode('template');
      }
    } catch (e) {
      console.error('[WhatsAppPanel] loadConversation error:', e);
    } finally {
      setLoadingMsg(false);
      setRefreshing(false);
    }
  }, [digits]);

  // Initial load + templates
  useEffect(() => {
    fetch('/api/gallabox/templates')
      .then(r => r.json())
      .then((d: { ok: boolean; data?: Template[] }) => setTemplates(d.data ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpl(false));
    loadConversation();
  }, [loadConversation]);

  // Auto-refresh every 20 s (silent — no spinner)
  useEffect(() => {
    const id = setInterval(() => { loadConversation(true); }, 20_000);
    return () => clearInterval(id);
  }, [loadConversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isFirstRef.current) {
      // Jump instantly on first load
      bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      isFirstRef.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    globalThis.window?.addEventListener('keydown', fn);
    return () => globalThis.window?.removeEventListener('keydown', fn);
  }, [onClose]);

  const canSendText = winStatus?.status === 'open' || winStatus?.status === 'expiring';

  const handleSend = async () => {
    if (sending) return;
    setSendErr('');

    const body: Record<string, unknown> = { phone: digits, contactName };
    if (mode === 'template') {
      if (!tpl) { setSendErr('Select a template'); return; }
      body.templateName = tpl;
      body.variables    = vars.filter(v => v.trim());
      if (buttonUrl.trim()) body.buttonUrl = buttonUrl.trim();
    } else {
      if (!text.trim()) { setSendErr('Enter a message'); return; }
      body.messageText = text.trim();
    }

    setSending(true);
    try {
      const res = await fetch('/api/gallabox/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });

      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        setSendErr(`Server error (${res.status}) — check Gallabox API credentials`);
        return;
      }

      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setText(''); setTpl(''); setSelTpl(null); setVars([]); setButtonUrl('');
        // DB is now awaited server-side, so refresh will find the message
        loadConversation().catch(e => console.error('[WhatsAppPanel] refresh error:', e));
      } else {
        setSendErr(data.error ?? 'Send failed');
      }
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Network error — could not reach server');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl"
        style={{ width: 'min(440px, 100vw)', background: '#F0F2F5', borderLeft: '1px solid #E2E8F0' }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]"
          style={{ background: '#0F4C75' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              {contactName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-sm text-white">{contactName}</p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>+{digits}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {winStatus && (
              <div className="hidden sm:block">
                <WindowBadge w={winStatus} />
              </div>
            )}
            <button
              onClick={() => loadConversation(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'rgba(255,255,255,0.7)' }}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Window status on mobile (below header) */}
        {winStatus && (
          <div className="sm:hidden flex justify-center py-1.5 border-b border-[#E2E8F0]" style={{ background: '#fff' }}>
            <WindowBadge w={winStatus} />
          </div>
        )}

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-3"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23c0c0c0\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>

          {loadingMsg ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.7)' }}>
                <MessageCircle className="w-7 h-7 text-[#CBD5E1]" />
              </div>
              <p className="text-sm text-[#94A3B8] font-medium">No messages yet</p>
              <p className="text-xs text-[#CBD5E1]">Send a message or template to start</p>
            </div>
          ) : (
            messages.map(msg => {
              const isOut = msg.direction === 'outgoing';
              return (
                <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[82%] px-3 py-2 text-sm"
                    style={{
                      background:            isOut ? '#0F4C75' : '#fff',
                      color:                 isOut ? '#fff' : '#0F172A',
                      borderRadius:          isOut ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      boxShadow:             '0 1px 2px rgba(0,0,0,0.12)',
                    }}
                  >
                    <MessageContent msg={msg} isOut={isOut} />
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <p className="text-[10px]" style={{ opacity: 0.6 }}>{fmtTime(msg.created_at)}</p>
                      {isOut && <DeliveryTick status={msg.status} />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Compose ──────────────────────────────────────────────────────── */}
        <div className="border-t border-[#E2E8F0] px-3 py-3 flex flex-col gap-2" style={{ background: '#fff' }}>

          {/* Mode toggle */}
          <div className="flex rounded-xl bg-[#F1F5F9] p-1 gap-1">
            <button
              onClick={() => { if (canSendText) { setMode('text'); setSendErr(''); } }}
              disabled={!canSendText}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all"
              style={{
                background:  mode === 'text' && canSendText ? '#fff' : 'transparent',
                color:       !canSendText ? '#CBD5E1' : mode === 'text' ? '#0F172A' : '#64748B',
                boxShadow:   mode === 'text' && canSendText ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor:      !canSendText ? 'not-allowed' : 'pointer',
              }}
              title={!canSendText ? 'Template only — 24hr window expired' : undefined}
            >
              {canSendText ? 'Free Text' : '🔒 Window Closed'}
            </button>
            <button
              onClick={() => { setMode('template'); setSendErr(''); }}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all"
              style={{
                background: mode === 'template' ? '#fff' : 'transparent',
                color:      mode === 'template' ? '#0F172A' : '#64748B',
                boxShadow:  mode === 'template' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Template
            </button>
          </div>

          {/* Free text input */}
          {mode === 'text' && canSendText && (
            <div className="flex gap-2 items-end">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message…"
                rows={2}
                className="flex-1 border border-[#E2E8F0] rounded-2xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F4C75]/25 transition-shadow"
                style={{ background: '#F8FAFC' }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-40 hover:scale-105 active:scale-95"
                style={{ background: '#0F4C75' }}
              >
                {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          )}

          {/* Template mode */}
          {mode === 'template' && (
            <div className="flex flex-col gap-2">
              {loadingTpl ? (
                <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading templates…
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={tpl}
                    onChange={e => {
                      const chosen = templates.find(t => t.name === e.target.value) ?? null;
                      setTpl(e.target.value);
                      setSelTpl(chosen);
                      setVars(Array(chosen?.bodyVarCount ?? 0).fill(''));
                      setButtonUrl('');
                      setSendErr('');
                    }}
                    className="w-full appearance-none border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C75]/25 bg-white pr-8"
                  >
                    <option value="">Select template…</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8] pointer-events-none" />
                </div>
              )}

              {/* Body variable inputs */}
              {tpl && selTpl && selTpl.bodyVarCount > 0 && (
                <div className="flex flex-col gap-1.5">
                  {vars.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#94A3B8] w-7 text-right shrink-0 font-mono">{`{{${i + 1}}}`}</span>
                      <input
                        type="text"
                        value={v}
                        placeholder={`Variable ${i + 1}`}
                        onChange={e => { const n = [...vars]; n[i] = e.target.value; setVars(n); }}
                        className="flex-1 border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F4C75]/25 bg-[#F8FAFC]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* URL button input */}
              {tpl && selTpl?.hasUrlButton && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#94A3B8] shrink-0">🔗</span>
                  <input
                    type="url"
                    value={buttonUrl}
                    placeholder="https://link.travloger.in/itinerary/TOKEN"
                    onChange={e => setButtonUrl(e.target.value)}
                    className="flex-1 border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F4C75]/25 bg-[#F8FAFC]"
                  />
                </div>
              )}

              {/* Static template */}
              {tpl && selTpl && selTpl.bodyVarCount === 0 && !selTpl.hasUrlButton && (
                <p className="text-[11px] text-[#94A3B8] text-center">No variables needed — ready to send.</p>
              )}

              <button
                onClick={handleSend}
                disabled={sending || !tpl}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 hover:opacity-90 active:scale-[0.98]"
                style={{ background: '#0F4C75' }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Template'}
              </button>
            </div>
          )}

          {sendErr && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-600 font-medium"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {sendErr}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
