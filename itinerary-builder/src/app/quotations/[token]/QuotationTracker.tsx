'use client';
/**
 * QuotationTracker — client component rendered on the customer itinerary page.
 *
 * Responsibilities:
 *  1. Fire "quote_viewed" immediately on mount (+ again every 30 s as a keep-alive)
 *  2. Track which named sections are visible via IntersectionObserver
 *  3. Collect section-view data and flush it on unload / every 30 s
 *  4. Expose a `trackWhatsApp()` function via a window event listener so the
 *     ItineraryClient can dispatch a custom event when the WhatsApp button is clicked.
 */
import { useEffect, useRef } from 'react';

interface Props {
  token: string;
}

const ANALYTICS_URL = (token: string) =>
  `/api/v1/public/itinerary/${token}/analytics`;

/** Section IDs we want to track — must match `data-section` attrs in ItineraryClient */
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
  const sectionViewsRef = useRef<Record<string, number>>({});
  const flushTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef    = useRef<number>(Date.now());

  // ── post helper (fire-and-forget) ─────────────────────────────────────────
  function post(event_type: string, metadata?: Record<string, unknown>) {
    navigator.sendBeacon
      ? navigator.sendBeacon(
          ANALYTICS_URL(token),
          new Blob([JSON.stringify({ event_type, metadata })], {
            type: 'application/json',
          }),
        )
      : fetch(ANALYTICS_URL(token), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type, metadata }),
          keepalive: true,
        }).catch(() => {});
  }

  // ── flush accumulated section data ────────────────────────────────────────
  function flush(isFinal = false) {
    const views = { ...sectionViewsRef.current };
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    post('quote_viewed', {
      section_views: views,
      time_spent_seconds: timeSpent,
      is_final: isFinal,
    });
  }

  useEffect(() => {
    // 1. Immediate first ping
    flush();

    // 2. Periodic flush every 30 s
    flushTimerRef.current = setInterval(() => flush(), 30_000);

    // 3. IntersectionObserver for section tracking
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const section = (entry.target as HTMLElement).dataset.section;
            if (section) {
              sectionViewsRef.current[section] =
                (sectionViewsRef.current[section] ?? 0) + 1;
            }
          }
        });
      },
      { threshold: 0.2 },
    );

    // Observe sections once the DOM has settled
    const observeTimeout = setTimeout(() => {
      TRACKED_SECTIONS.forEach((s) => {
        const el = document.querySelector(`[data-section="${s}"]`);
        if (el) observer.observe(el);
      });
    }, 800);

    // 4. WhatsApp click listener dispatched by ItineraryClient
    function onWhatsApp() {
      post('whatsapp_clicked', { time_spent_seconds: Math.round((Date.now() - startTimeRef.current) / 1000) });
    }
    window.addEventListener('itinerary:whatsapp_clicked', onWhatsApp);

    // 5. Flush on page hide / unload
    function onHide() { flush(true); }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    window.addEventListener('pagehide', onHide);

    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      clearTimeout(observeTimeout);
      observer.disconnect();
      window.removeEventListener('itinerary:whatsapp_clicked', onWhatsApp);
      window.removeEventListener('pagehide', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // This component renders nothing visible
  return null;
}
