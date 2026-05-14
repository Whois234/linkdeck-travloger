'use client';

/**
 * WhatsAppModal
 * Opens a modal to send a WhatsApp message to a contact.
 * Supports template messages (with variable inputs) and free-text.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Send, MessageCircle, ChevronDown, Loader2 } from 'lucide-react';

interface Template {
  id:       string;
  name:     string;
  status:   string;
  category: string;
  language: string;
}

interface Props {
  phone:       string;
  contactName: string;
  onClose:     () => void;
}

export default function WhatsAppModal({ phone, contactName, onClose }: Props) {
  const [templates,    setTemplates]    = useState<Template[]>([]);
  const [loadingTpls,  setLoadingTpls]  = useState(true);
  const [mode,         setMode]         = useState<'template' | 'text'>('template');
  const [selectedTpl,  setSelectedTpl]  = useState('');
  const [variables,    setVariables]    = useState<string[]>(['', '', '', '', '']);
  const [messageText,  setMessageText]  = useState('');
  const [sending,      setSending]      = useState(false);
  const [result,       setResult]       = useState<{ ok: boolean; msg: string } | null>(null);

  // Fetch approved templates
  useEffect(() => {
    setLoadingTpls(true);
    fetch('/api/gallabox/templates')
      .then(r => r.json())
      .then(d => setTemplates(d.data ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpls(false));
  }, []);

  const send = useCallback(async () => {
    if (sending) return;
    if (mode === 'template' && !selectedTpl) {
      setResult({ ok: false, msg: 'Please select a template.' });
      return;
    }
    if (mode === 'text' && !messageText.trim()) {
      setResult({ ok: false, msg: 'Please enter a message.' });
      return;
    }

    setSending(true);
    setResult(null);

    const body: Record<string, unknown> = { phone, contactName };
    if (mode === 'template') {
      body.templateName = selectedTpl;
      body.variables    = variables.filter(v => v.trim() !== '');
    } else {
      body.messageText = messageText.trim();
    }

    try {
      const res  = await fetch('/api/gallabox/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string; messageId?: string };
      if (data.ok) {
        setResult({ ok: true, msg: 'Message sent successfully!' });
        setTimeout(onClose, 1500);
      } else {
        setResult({ ok: false, msg: data.error ?? 'Send failed.' });
      }
    } catch (e) {
      setResult({ ok: false, msg: 'Network error. Please try again.' });
    } finally {
      setSending(false);
    }
  }, [sending, mode, selectedTpl, variables, messageText, phone, contactName, onClose]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Send WhatsApp</p>
              <p className="text-xs text-gray-500">{contactName} · +{phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Mode toggle */}
          <div className="flex rounded-lg bg-gray-100 p-1 gap-1">
            {(['template', 'text'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setResult(null); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'template' ? 'Template Message' : 'Free Text (24hr)'}
              </button>
            ))}
          </div>

          {mode === 'template' ? (
            <>
              {/* Template selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Template
                </label>
                {loadingTpls ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
                  </div>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No approved templates found.</p>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedTpl}
                      onChange={e => setSelectedTpl(e.target.value)}
                      className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white pr-8"
                    >
                      <option value="">Select a template…</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.name}>
                          {t.name} ({t.language})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Variable inputs */}
              {selectedTpl && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Variables <span className="text-gray-400 font-normal normal-case">(fill only what the template needs)</span>
                  </label>
                  <div className="space-y-2">
                    {variables.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-6 text-right shrink-0">{`{{${i + 1}}}`}</span>
                        <input
                          type="text"
                          placeholder={`Variable ${i + 1}`}
                          value={v}
                          onChange={e => {
                            const next = [...variables];
                            next[i] = e.target.value;
                            setVariables(next);
                          }}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Message
              </label>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder="Type your message…"
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                Free-text messages only work within 24 hours of the contact&apos;s last message.
              </p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`text-sm px-3 py-2 rounded-lg ${
              result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}>
              {result.msg}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={send}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  );
}
