'use client';
/**
 * WhatsAppPanel — right-side drawer showing WhatsApp conversation + send input.
 * Used from Pipeline and Contacts pages.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2, MessageCircle, ChevronDown, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

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

interface Template { id: string; name: string; language: string }

interface Props {
  phone:       string;
  contactName: string;
  onClose:     () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

function WindowBadge({ w }: { w: WindowStatus | null }) {
  if (!w) return null;
  const hrs = Math.floor(w.minutesLeft / 60);
  const mins = w.minutesLeft % 60;
  const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  if (w.status === 'open') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#DCFCE7', color: '#166534' }}>
      <CheckCircle2 className="w-3 h-3" /> Window open · {timeStr} left
    </span>
  );
  if (w.status === 'expiring') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEF9C3', color: '#854D0E' }}>
      <Clock className="w-3 h-3" /> Expiring · {timeStr} left
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEE2E2', color: '#991B1B' }}>
      <AlertCircle className="w-3 h-3" /> Window closed · template only
    </span>
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

  // Send state
  const [mode,        setMode]       = useState<'text' | 'template'>('text');
  const [text,        setText]       = useState('');
  const [tpl,         setTpl]        = useState('');
  const [vars,        setVars]       = useState<string[]>(['', '', '', '', '']);
  const [sending,     setSending]    = useState(false);
  const [sendErr,     setSendErr]    = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch conversation + window status
  const loadConversation = useCallback(async () => {
    setLoadingMsg(true);
    const [msgRes, winRes] = await Promise.all([
      fetch(`/api/gallabox/conversation?phone=${digits}`),
      fetch('/api/gallabox/window', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: [digits] }),
      }),
    ]);
    const msgData = await msgRes.json() as { ok: boolean; data?: Message[] };
    const winData = await winRes.json() as { ok: boolean; data?: Record<string, WindowStatus> };
    if (msgData.ok) setMessages(msgData.data ?? []);
    if (winData.ok) {
      const w = winData.data?.[digits] ?? null;
      setWinStatus(w);
      // Auto-switch to template if window closed
      if (w?.status === 'closed') setMode('template');
    }
    setLoadingMsg(false);
  }, [digits]);

  // Fetch templates
  useEffect(() => {
    fetch('/api/gallabox/templates')
      .then(r => r.json())
      .then((d: { ok: boolean; data?: Template[] }) => setTemplates(d.data ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpl(false));
    loadConversation();
  }, [loadConversation]);

  // Scroll to bottom when messages load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    } else {
      if (!text.trim()) { setSendErr('Enter a message'); return; }
      body.messageText = text.trim();
    }

    setSending(true);
    try {
      const res  = await fetch('/api/gallabox/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setText(''); setTpl(''); setVars(['', '', '', '', '']);
        await loadConversation();   // refresh conversation
      } else {
        setSendErr(data.error ?? 'Send failed');
      }
    } catch {
      setSendErr('Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl"
        style={{ width: 'min(420px, 100vw)', background: '#F8FAFC', borderLeft: '1px solid #E2E8F0' }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-[#E2E8F0]" style={{ background: '#fff' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#DCFCE7' }}>
              <MessageCircle className="w-4.5 h-4.5" style={{ color: '#16A34A' }} />
            </div>
            <div>
              <p className="font-bold text-sm text-[#0F172A]">{contactName}</p>
              <p className="text-[11px] text-[#64748B]">+{digits}</p>
              <div className="mt-0.5">
                <WindowBadge w={winStatus} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9] transition-colors mt-0.5">
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2">
          {loadingMsg ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2">
              <MessageCircle className="w-8 h-8 text-[#CBD5E1]" />
              <p className="text-sm text-[#94A3B8]">No messages yet</p>
            </div>
          ) : (
            messages.map(msg => {
              const isOut = msg.direction === 'outgoing';
              return (
                <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[78%] rounded-2xl px-3 py-2 text-sm"
                    style={{
                      background:   isOut ? '#0F4C75' : '#fff',
                      color:        isOut ? '#fff' : '#0F172A',
                      borderBottomRightRadius: isOut ? 4 : undefined,
                      borderBottomLeftRadius:  !isOut ? 4 : undefined,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                  >
                    {msg.content ? (
                      <p className="leading-snug">{msg.content}</p>
                    ) : (
                      <p className="italic opacity-60 text-xs">
                        {msg.message_type ?? 'Media message'}
                      </p>
                    )}
                    <p className="text-[10px] mt-1 opacity-60 text-right">{fmtTime(msg.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Compose ──────────────────────────────────────────────────────── */}
        <div className="border-t border-[#E2E8F0] px-3 py-3 flex flex-col gap-2" style={{ background: '#fff' }}>

          {/* Mode toggle — only show text tab if window is open */}
          <div className="flex rounded-lg bg-[#F1F5F9] p-0.5 gap-0.5">
            <button
              onClick={() => { if (canSendText) { setMode('text'); setSendErr(''); } }}
              disabled={!canSendText}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all"
              style={{
                background:     mode === 'text' && canSendText ? '#fff' : 'transparent',
                color:          !canSendText ? '#CBD5E1' : mode === 'text' ? '#0F172A' : '#64748B',
                boxShadow:      mode === 'text' && canSendText ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor:         !canSendText ? 'not-allowed' : 'pointer',
              }}
              title={!canSendText ? 'Template only — 24hr window expired' : undefined}
            >
              {canSendText ? 'Free Text' : '🔒 Window Closed'}
            </button>
            <button
              onClick={() => { setMode('template'); setSendErr(''); }}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all"
              style={{
                background: mode === 'template' ? '#fff' : 'transparent',
                color:      mode === 'template' ? '#0F172A' : '#64748B',
                boxShadow:  mode === 'template' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Template
            </button>
          </div>

          {/* Input area */}
          {mode === 'text' && canSendText && (
            <div className="flex gap-2">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message…"
                rows={2}
                className="flex-1 border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F4C75]/30"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="self-end w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
                style={{ background: '#0F4C75' }}
              >
                {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          )}

          {mode === 'template' && (
            <div className="flex flex-col gap-2">
              {/* Template selector */}
              {loadingTpl ? (
                <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading templates…
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={tpl}
                    onChange={e => setTpl(e.target.value)}
                    className="w-full appearance-none border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F4C75]/30 bg-white pr-8"
                  >
                    <option value="">Select template…</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8] pointer-events-none" />
                </div>
              )}
              {/* Variable inputs */}
              {tpl && (
                <div className="flex flex-col gap-1.5">
                  {vars.slice(0, 5).map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#94A3B8] w-7 text-right shrink-0">{`{{${i + 1}}}`}</span>
                      <input
                        type="text"
                        value={v}
                        placeholder={`Variable ${i + 1}`}
                        onChange={e => { const n = [...vars]; n[i] = e.target.value; setVars(n); }}
                        className="flex-1 border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F4C75]/30"
                      />
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleSend}
                disabled={sending || !tpl}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
                style={{ background: '#0F4C75' }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Template'}
              </button>
            </div>
          )}

          {sendErr && (
            <p className="text-xs text-red-500 text-center">{sendErr}</p>
          )}
        </div>
      </div>
    </>
  );
}
