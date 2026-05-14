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
  'dates',
  'itinerary',
  'inclusions',
  'fare',
  'policies',
  'faqs',
];

export default function QuotationTracker({ token }: Props) {
  const sectionViewsRef    = useRef<Record<string, number>>({});
  const sectionTimeRef     = useRef<Record<string, number>>({});   // accumulated seconds
  const sectionEnterRef    = useRef<Record<string, number>>({});   // entry timestamp (ms)
  const flushTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef       = useRef<number>(Date.now());
  const finalFlushedRef    = useRef(false);   // guard: only one is_final=true flush per session
  // Stable session ID so the admin page can group intermediate + final flushes into one session
  const sessionIdRef       = useRef<string>(crypto.randomUUID());

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
    // Ensure is_final=true is only sent once per session (visibilitychange + pagehide both fire on tab close)
    if (isFinal) {
      if (finalFlushedRef.current) return;
      finalFlushedRef.current = true;
    }
    snapshotActiveTime();
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    post('quote_viewed', {
      session_id:           sessionIdRef.current,
      section_views:        { ...sectionViewsRef.current },
      section_time_seconds: { ...sectionTimeRef.current },
      time_spent_seconds:   timeSpent,
      is_final:             isFinal,
    });
  }

  useEffect(() => {
    // Reset per-mount state (new session on every page load)
    finalFlushedRef.current  = false;
    startTimeRef.current     = Date.now();
    sessionIdRef.current     = crypto.randomUUID();
    sectionViewsRef.current  = {};
    sectionTimeRef.current   = {};
    sectionEnterRef.current  = {};

    // 1. Immediate first ping
    flush();

    // 2. Periodic flush every 30 s
    flushTimerRef.current = setInterval(() => flush(), 30_000);

    // 3. IntersectionObserver — track entry/exit per section
    // Uses a reference-count so multiple elements sharing a data-section name
    // (e.g. group-template sub-components) don't cause double-counting.
    // activeCountRef[section] = number of elements currently visible
    const activeCountRef: Record<string, number> = {};

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        entries.forEach((entry) => {
          const section = (entry.target as HTMLElement).dataset.section;
          if (!section || !TRACKED_SECTIONS.includes(section)) return;

          if (entry.isIntersecting) {
            activeCountRef[section] = (activeCountRef[section] ?? 0) + 1;
            if (activeCountRef[section] === 1) {
              // First element of this section just became visible
              sectionViewsRef.current[section] = (sectionViewsRef.current[section] ?? 0) + 1;
              sectionEnterRef.current[section] = now;
            }
          } else {
            activeCountRef[section] = Math.max(0, (activeCountRef[section] ?? 0) - 1);
            if (activeCountRef[section] === 0) {
              // Last element of this section left viewport — accumulate time
              const enterMs = sectionEnterRef.current[section];
              if (enterMs && enterMs > 0) {
                sectionTimeRef.current[section] =
                  (sectionTimeRef.current[section] ?? 0) +
                  Math.round((now - enterMs) / 1000);
                sectionEnterRef.current[section] = 0;
              }
            }
          }
        });
      },
      { threshold: 0.15 },
    );

    // Observe all data-section elements currently in DOM
    const observedEls = new Set<Element>();
    function observeAll() {
      document.querySelectorAll('[data-section]').forEach((el) => {
        if (!observedEls.has(el)) {
          observedEls.add(el);
          observer.observe(el);
        }
      });
    }

    // Initial pass after a brief paint delay
    const observeTimeout = setTimeout(observeAll, 500);

    // MutationObserver catches elements added after initial render (group template async data, etc.)
    const mutationObs = new MutationObserver(() => observeAll());
    mutationObs.observe(document.body, { childList: true, subtree: true });

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
      mutationObs.disconnect();
      window.removeEventListener('itinerary:whatsapp_clicked', onWhatsApp);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}
