'use client';
/**
 * QuotationTracker — tracks section engagement time + device info.
 *
 * Sends:
 *  - section_time_seconds: { hero: 20, itinerary: 30, ... }  (time spent per section)
 *  - section_views:        { hero: 2, itinerary: 1, ... }    (entry count per section)
 *  - time_spent_seconds: total page time
 *  - is_final: true on last flush (unload/hide)
 */
import { useEffect, useRef } from 'react';

interface Props {
  token: string;
}

const ANALYTICS_URL = (token: string) =>
  `/api/v1/public/itinerary/${token}/analytics`;

const TRACKED_SECTIONS = [
  'hero',
  'packages',
  'itinerary',
  'hotels',
  'inclusions',
  'policies',
  'faqs',
];

export default function QuotationTracker({ token }: Props) {
  const sectionViewsRef    = useRef<Record<string, number>>({});
  const sectionTimeRef     = useRef<Record<string, number>>({});   // accumulated seconds
  const sectionEnterRef    = useRef<Record<string, number>>({});   // entry timestamp (ms)
  const flushTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef       = useRef<number>(Date.now());

  function post(event_type: string, metadata?: Record<string, unknown>) {
    const payload = JSON.stringify({ event_type, metadata });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        ANALYTICS_URL(token),
        new Blob([payload], { type: 'application/json' }),
      );
    } else {
      fetch(ANALYTICS_URL(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }

  /** Snapshot currently-visible sections' elapsed time into sectionTimeRef */
  function snapshotActiveTime() {
    const now = Date.now();
    Object.entries(sectionEnterRef.current).forEach(([section, enterMs]) => {
      if (enterMs > 0) {
        sectionTimeRef.current[section] =
          (sectionTimeRef.current[section] ?? 0) + Math.round((now - enterMs) / 1000);
        sectionEnterRef.current[section] = now; // reset so next flush doesn't double-count
      }
    });
  }

  function flush(isFinal = false) {
    snapshotActiveTime();
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    post('quote_viewed', {
      section_views:        { ...sectionViewsRef.current },
      section_time_seconds: { ...sectionTimeRef.current },
      time_spent_seconds:   timeSpent,
      is_final:             isFinal,
    });
  }

  useEffect(() => {
    // 1. Immediate first ping
    flush();

    // 2. Periodic flush every 30 s
    flushTimerRef.current = setInterval(() => flush(), 30_000);

    // 3. IntersectionObserver — track entry/exit per section
    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        entries.forEach((entry) => {
          const section = (entry.target as HTMLElement).dataset.section;
          if (!section) return;

          if (entry.isIntersecting) {
            // Section entered viewport
            sectionViewsRef.current[section] =
              (sectionViewsRef.current[section] ?? 0) + 1;
            sectionEnterRef.current[section] = now;
          } else {
            // Section left viewport — accumulate time
            const enterMs = sectionEnterRef.current[section];
            if (enterMs && enterMs > 0) {
              sectionTimeRef.current[section] =
                (sectionTimeRef.current[section] ?? 0) +
                Math.round((now - enterMs) / 1000);
              sectionEnterRef.current[section] = 0;
            }
          }
        });
      },
      { threshold: 0.2 },
    );

    const observeTimeout = setTimeout(() => {
      TRACKED_SECTIONS.forEach((s) => {
        const el = document.querySelector(`[data-section="${s}"]`);
        if (el) observer.observe(el);
      });
    }, 800);

    // 4. WhatsApp click listener
    function onWhatsApp() {
      post('whatsapp_clicked', {
        time_spent_seconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
    }
    window.addEventListener('itinerary:whatsapp_clicked', onWhatsApp);

    // 5. Final flush on hide / unload — named handlers so cleanup can remove them
    function onHide() { flush(true); }
    function onVisChange() { if (document.visibilityState === 'hidden') onHide(); }
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', onHide);

    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      clearTimeout(observeTimeout);
      observer.disconnect();
      window.removeEventListener('itinerary:whatsapp_clicked', onWhatsApp);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}
