'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

// Minimal zero-dep toast system. Fire via `toast.success('msg')` / `toast.error('msg')`
// from anywhere in the app — no provider needed; the <Toaster /> mounted once in
// admin/layout subscribes to a tiny event bus.

type Variant = 'success' | 'error' | 'info';
interface ToastItem { id: number; variant: Variant; message: string }

type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();
let nextId = 1;

function emit(variant: Variant, message: string) {
  if (typeof window === 'undefined') return;
  const t: ToastItem = { id: nextId++, variant, message };
  listeners.forEach(l => l(t));
}

export const toast = {
  success: (msg: string) => emit('success', msg),
  error:   (msg: string) => emit('error',   msg),
  info:    (msg: string) => emit('info',    msg),
};

const STYLES: Record<Variant, { bg: string; color: string; border: string; Icon: React.ElementType }> = {
  success: { bg: '#DCFCE7', color: '#15803D', border: '#86EFAC', Icon: CheckCircle2 },
  error:   { bg: '#FEE2E2', color: '#B91C1C', border: '#FCA5A5', Icon: AlertTriangle },
  info:    { bg: '#DBEAFE', color: '#1D4ED8', border: '#93C5FD', Icon: Info },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const l: Listener = (t) => {
      setItems(prev => [...prev, t]);
      // Auto-dismiss after 4s
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), 4000);
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed z-[100] flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 16, right: 16, left: 16, maxWidth: 'min(420px, calc(100vw - 32px))', marginLeft: 'auto' }}
    >
      {items.map(t => {
        const s = STYLES[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg animate-[slideUp_0.18s_ease-out]"
            style={{ backgroundColor: '#fff', border: `1px solid ${s.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
          >
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: s.bg }}>
              <s.Icon className="w-3.5 h-3.5" style={{ color: s.color }} />
            </div>
            <p className="flex-1 text-sm font-medium leading-snug" style={{ color: '#0F172A' }}>{t.message}</p>
            <button
              onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
              className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#F1F5F9] flex-shrink-0"
              style={{ color: '#94A3B8' }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
