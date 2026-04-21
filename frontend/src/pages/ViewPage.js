import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Document, Page, pdfjs } from 'react-pdf';
import { AlertCircle, Loader2 } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getPublicPdfUrl(uniqueId, fallbackUrl) {
  if (!fallbackUrl) return '';
  if (typeof window === 'undefined') {
    return fallbackUrl;
  }
  if (window.location.hostname !== 'localhost') {
    return `${window.location.origin}/api/view/${uniqueId}/pdf`;
  }
  if (/^https?:\/\//i.test(fallbackUrl)) {
    return fallbackUrl;
  }
  return new URL(fallbackUrl, window.location.origin).toString();
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function PdfPageSurface({ pageNumber, pageWidth, registerPageNode }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    registerPageNode(pageNumber, wrapperRef.current);
    return () => registerPageNode(pageNumber, null);
  }, [pageNumber, registerPageNode]);

  return (
    <section
      ref={wrapperRef}
      data-page-number={pageNumber}
      className="mx-auto mb-3 bg-white shadow-[0_2px_14px_rgba(15,23,42,0.08)]"
      style={{ width: pageWidth || '100%', maxWidth: '100%' }}
    >
      <Page
        pageNumber={pageNumber}
        width={pageWidth || undefined}
        renderAnnotationLayer={false}
        renderTextLayer={false}
        loading={
          <div className="flex min-h-[320px] items-center justify-center bg-white">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        }
      />
    </section>
  );
}

// ── Gate form field renderer ──────────────────────────────────────────────────
function GateField({ field, value, onChange, error }) {
  const base = 'w-full rounded-lg border px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 transition';
  const style = error
    ? `${base} border-red-300 focus:ring-red-200`
    : `${base} border-slate-200 focus:ring-[#144a57]/20 focus:border-[#144a57]`;

  if (field.field_type === 'textarea') {
    return (
      <textarea
        rows={3}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ''}
        className={style}
      />
    );
  }
  const inputType = field.field_type === 'email' ? 'email'
    : field.field_type === 'phone' ? 'tel'
    : field.field_type === 'number' ? 'number'
    : field.field_type === 'date' ? 'date'
    : 'text';
  return (
    <input
      type={inputType}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || ''}
      className={style}
    />
  );
}

export default function ViewPage() {
  const { uniqueId } = useParams();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewerLoading, setViewerLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);

  // Gate state
  const [gateVisible, setGateVisible] = useState(false);
  const [gateSchema, setGateSchema] = useState([]);
  const [gatePdfName, setGatePdfName] = useState('');
  const [gateFormData, setGateFormData] = useState({});
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateErrors, setGateErrors] = useState({});
  const [gateSubmitError, setGateSubmitError] = useState('');
  const gateTokenRef = useRef(null);
  // Ref so gate submit handler can call the PDF load function without stale closures
  const loadPdfContentRef = useRef(null);

  const tracked = useRef(false);
  const sessionId = useRef(null);
  const sessionStartedAt = useRef(null);
  const heartbeatTimer = useRef(null);
  const viewerRef = useRef(null);
  const pageNodesRef = useRef({});
  const currentPageRef = useRef(1);
  const currentPageStartedAtRef = useRef(null);
  const pageDurationsMsRef = useRef({});
  const pageCountRef = useRef(0);
  const nativeRedirectedRef = useRef(false);

  const registerPageNode = useCallback((pageNumber, node) => {
    if (node) {
      pageNodesRef.current[pageNumber] = node;
    } else {
      delete pageNodesRef.current[pageNumber];
    }
  }, []);

  const flushCurrentPageTime = useCallback((timestamp = Date.now()) => {
    const activePage = currentPageRef.current;
    if (!activePage || !currentPageStartedAtRef.current) return;
    const elapsedMs = Math.max(0, timestamp - currentPageStartedAtRef.current);
    if (elapsedMs > 0) {
      pageDurationsMsRef.current[activePage] = (pageDurationsMsRef.current[activePage] || 0) + elapsedMs;
      currentPageStartedAtRef.current = timestamp;
    }
  }, []);

  const setActivePage = useCallback((pageNumber) => {
    if (!pageNumber || pageNumber === currentPageRef.current) return;
    const now = Date.now();
    flushCurrentPageTime(now);
    currentPageRef.current = pageNumber;
    currentPageStartedAtRef.current = now;
    setCurrentPage(pageNumber);
  }, [flushCurrentPageTime]);

  const buildPageDurationPayload = useCallback((timestamp = Date.now()) => {
    flushCurrentPageTime(timestamp);
    return Object.fromEntries(
      Object.entries(pageDurationsMsRef.current).map(([page, durationMs]) => [
        String(page),
        Math.max(1, Math.round(durationMs / 1000)),
      ])
    );
  }, [flushCurrentPageTime]);

  const sendHeartbeat = useCallback(async () => {
    if (!sessionId.current || !sessionStartedAt.current) return;
    const now = Date.now();
    const durationSeconds = Math.max(1, Math.round((now - sessionStartedAt.current) / 1000));
    try {
      await axios.post(`${API}/view/${uniqueId}/session/heartbeat`, {
        session_id: sessionId.current,
        duration_seconds: durationSeconds,
        current_page: currentPageRef.current,
        total_pages: pageCountRef.current || undefined,
        page_durations: buildPageDurationPayload(now),
      });
    } catch {
      // Tracking should never interrupt the customer viewing experience.
    }
    // Gate heartbeat: update time_spent_seconds on the gate submission
    if (gateTokenRef.current) {
      axios.post(`${API}/view/${uniqueId}/gate/heartbeat`, {
        access_token: gateTokenRef.current,
        duration_seconds: durationSeconds,
      }).catch(() => {});
    }
  }, [buildPageDurationPayload, uniqueId]);

  const sendHeartbeatBeacon = useCallback(() => {
    if (!sessionId.current || !sessionStartedAt.current || !navigator.sendBeacon) return;
    const now = Date.now();
    const durationSeconds = Math.max(1, Math.round((now - sessionStartedAt.current) / 1000));
    const payload = JSON.stringify({
      session_id: sessionId.current,
      duration_seconds: durationSeconds,
      current_page: currentPageRef.current,
      total_pages: pageCountRef.current || undefined,
      page_durations: buildPageDurationPayload(now),
    });
    navigator.sendBeacon(
      `${API}/view/${uniqueId}/session/heartbeat`,
      new Blob([payload], { type: 'application/json' })
    );
    // Gate beacon
    if (gateTokenRef.current) {
      navigator.sendBeacon(
        `${API}/view/${uniqueId}/gate/heartbeat`,
        new Blob([JSON.stringify({ access_token: gateTokenRef.current, duration_seconds: durationSeconds })], { type: 'application/json' })
      );
    }
  }, [buildPageDurationPayload, uniqueId]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const containerWidth = entries[0]?.contentRect?.width || 0;
      setPageWidth(Math.max(260, Math.floor(containerWidth - 8)));
    });
    if (viewerRef.current) resizeObserver.observe(viewerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!useNativeFallback || !pdfUrl || !isMobileDevice() || nativeRedirectedRef.current) return;
    nativeRedirectedRef.current = true;
    sendHeartbeatBeacon();
    window.location.replace(pdfUrl);
  }, [pdfUrl, sendHeartbeatBeacon, useNativeFallback]);

  useEffect(() => {
    // Core PDF content loader — extracted so it can be called after gate passes too.
    const loadPdfContent = async () => {
      try {
        if (!tracked.current) {
          tracked.current = true;
          axios.post(`${API}/view/${uniqueId}/track`).catch(() => {});
        }

        const { data } = await axios.get(`${API}/view/${uniqueId}/info`);
        const publicPdfUrl = getPublicPdfUrl(uniqueId, data.file_url);
        setPdfName(data.pdf_name);
        setPdfUrl(publicPdfUrl);

        try {
          const sessionRes = await axios.post(`${API}/view/${uniqueId}/session/start`, {
            screen_width: window.innerWidth,
            screen_height: window.innerHeight,
            is_mobile: isMobileDevice(),
          });
          sessionId.current = sessionRes.data?.session_id;
          sessionStartedAt.current = Date.now();
          currentPageStartedAtRef.current = Date.now();
        } catch {
          // Session analytics are optional; the PDF should still open.
        }
      } catch (err) {
        if (err.response?.status === 410) {
          setExpired(true);
        }
        setError(err.response?.data?.detail || 'PDF not found or link is invalid');
      } finally {
        setLoading(false);
      }
    };

    loadPdfContentRef.current = loadPdfContent;

    const init = async () => {
      // Check gate first; on failure fall through to normal load.
      try {
        const gateRes = await axios.get(`${API}/view/${uniqueId}/gate`);
        if (gateRes.data.enabled) {
          setGateSchema(gateRes.data.schema || []);
          setGatePdfName(gateRes.data.pdf_name || '');

          const storedToken = localStorage.getItem(`gate_token_${uniqueId}`);
          if (storedToken) {
            const verifyRes = await axios.post(`${API}/view/${uniqueId}/gate/verify`, {
              access_token: storedToken,
            });
            if (verifyRes.data.valid) {
              gateTokenRef.current = storedToken;
              await loadPdfContent();
              return;
            }
            localStorage.removeItem(`gate_token_${uniqueId}`);
          }

          // No valid token — show gate form.
          setGateVisible(true);
          setLoading(false);
          return;
        }
      } catch {
        // Gate endpoint unavailable — proceed without gate.
      }

      await loadPdfContent();
    };

    init();

    const handleFinalHeartbeat = () => sendHeartbeatBeacon();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') sendHeartbeatBeacon();
    };

    window.addEventListener('pagehide', handleFinalHeartbeat);
    window.addEventListener('beforeunload', handleFinalHeartbeat);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (heartbeatTimer.current) window.clearInterval(heartbeatTimer.current);
      sendHeartbeatBeacon();
      window.removeEventListener('pagehide', handleFinalHeartbeat);
      window.removeEventListener('beforeunload', handleFinalHeartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sendHeartbeatBeacon, uniqueId]);

  useEffect(() => {
    if (!pageCount) return;
    heartbeatTimer.current = window.setInterval(sendHeartbeat, 3000);
    return () => {
      if (heartbeatTimer.current) window.clearInterval(heartbeatTimer.current);
    };
  }, [pageCount, sendHeartbeat]);

  useEffect(() => {
    if (!pageCount || !viewerRef.current) return;
    const container = viewerRef.current;
    let rafId = null;

    const updateActivePageFromScroll = () => {
      rafId = null;
      const nodes = Object.entries(pageNodesRef.current);
      if (!nodes.length) return;

      const containerRect = container.getBoundingClientRect();
      const targetLine = containerRect.top + containerRect.height * 0.35;
      let closestPage = currentPageRef.current;
      let closestDistance = Number.POSITIVE_INFINITY;

      nodes.forEach(([pageNumber, node]) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const pageMidpoint = rect.top + rect.height / 2;
        const distance = Math.abs(pageMidpoint - targetLine);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = Number(pageNumber);
        }
      });

      if (closestPage) setActivePage(closestPage);
    };

    const handleScroll = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(updateActivePageFromScroll);
    };

    updateActivePageFromScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [pageCount, setActivePage, pageWidth]);

  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount]
  );

  // ── Gate form submit ────────────────────────────────────────────────────────
  const handleGateSubmit = async (e) => {
    e.preventDefault();
    setGateSubmitError('');

    const errors = {};
    gateSchema.forEach((field) => {
      if (field.required && !gateFormData[field.label]?.trim()) {
        errors[field.label] = 'Required';
      }
    });
    if (Object.keys(errors).length) {
      setGateErrors(errors);
      return;
    }

    setGateSubmitting(true);
    try {
      const res = await axios.post(`${API}/view/${uniqueId}/gate/submit`, {
        form_data: gateFormData,
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
        is_mobile: isMobileDevice(),
      });
      const token = res.data.access_token;
      localStorage.setItem(`gate_token_${uniqueId}`, token);
      gateTokenRef.current = token;
      setGateVisible(false);
      setLoading(true);
      await loadPdfContentRef.current?.();
    } catch {
      setGateSubmitError('Something went wrong. Please try again.');
    } finally {
      setGateSubmitting(false);
    }
  };

  // ── Gate form overlay ───────────────────────────────────────────────────────
  if (gateVisible) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#edf1f6] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-[0_4px_24px_rgba(20,74,87,0.12)] overflow-hidden">
          <div className="px-6 py-5 border-b" style={{ borderColor: '#f1f5f9', backgroundColor: '#144a57' }}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Your Itinerary
            </p>
            <h2 className="text-lg font-bold text-white mt-0.5 truncate">
              {gatePdfName || 'Exclusive Itinerary'}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Please fill in your details to access this document.
            </p>
          </div>
          <form onSubmit={handleGateSubmit} className="px-6 py-6 space-y-4">
            {gateSchema.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No fields configured.</p>
            ) : (
              gateSchema.map((field, i) => (
                <div key={i}>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#144a57' }}>
                    {field.label}
                    {field.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <GateField
                    field={field}
                    value={gateFormData[field.label] || ''}
                    onChange={(val) => {
                      setGateFormData((prev) => ({ ...prev, [field.label]: val }));
                      if (gateErrors[field.label]) {
                        setGateErrors((prev) => { const n = { ...prev }; delete n[field.label]; return n; });
                      }
                    }}
                    error={gateErrors[field.label]}
                  />
                  {gateErrors[field.label] && (
                    <p className="mt-1 text-xs text-red-500">{gateErrors[field.label]}</p>
                  )}
                </div>
              ))
            )}
            {gateSubmitError && (
              <p className="text-sm text-red-500 text-center">{gateSubmitError}</p>
            )}
            <button
              type="submit"
              disabled={gateSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#144a57' }}
            >
              {gateSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {gateSubmitting ? 'Submitting...' : 'View Itinerary'}
            </button>
          </form>
          <div className="px-6 pb-5 text-center">
            <p className="text-xs text-slate-400">
              Powered by{' '}
              <a href="https://travloger.in" className="underline" style={{ color: '#E8A020' }}>
                Travloger
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" data-testid="view-loading">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#144a57' }} />
        <p
          className="mt-3 text-[16px] leading-none tracking-normal text-slate-300 md:text-[18px]"
          style={{ fontFamily: '"Comfortaa", sans-serif', fontWeight: 400 }}
        >
          Loading your itinerary...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" data-testid="view-error">
        <AlertCircle className="w-10 h-10" style={{ color: '#dc2626' }} />
        <h2 className="text-lg font-bold mt-3" style={{ color: '#144a57' }}>
          {expired ? 'Itinerary Expired' : 'Link Not Found'}
        </h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md text-center px-6">{error}</p>
        <p className="text-xs text-slate-400 mt-4 text-center px-6">
          Contact{' '}
          <a href="https://travloger.in" className="underline" style={{ color: '#E8A020' }}>travloger.in</a>
          {' '}or{' '}
          <a href="https://wa.me/916281392007" className="underline" style={{ color: '#E8A020' }}>WhatsApp +91 62813 92007</a>
          {' '}for the latest itinerary.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#edf1f6]" data-testid="view-page">
      <header
        className="flex items-center gap-3 px-4 md:px-5 h-12 border-b flex-shrink-0"
        style={{ backgroundColor: '#144a57', borderColor: 'rgba(232,160,32,0.25)' }}
      >
        <span className="text-sm font-semibold text-white truncate flex-1">{pdfName}</span>
        <div className="text-xs font-medium text-white/70">
          {pageCount ? `${currentPage} / ${pageCount}` : ''}
        </div>
      </header>

      <main ref={viewerRef} className="flex-1 overflow-y-auto px-2 py-3 md:px-5 md:py-4">
        {!pdfUrl ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#144a57' }} />
          </div>
        ) : useNativeFallback ? (
          <div className="mx-auto max-w-6xl overflow-hidden rounded bg-white shadow-[0_2px_14px_rgba(15,23,42,0.08)]">
            <iframe
              src={pdfUrl}
              title={pdfName}
              className="block h-[calc(100vh-3rem)] w-full border-0"
            />
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            <Document
              file={pdfUrl}
              loading={
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#144a57' }} />
                </div>
              }
              error={null}
              onLoadSuccess={({ numPages }) => {
                setViewerLoading(false);
                setPageCount(numPages);
                pageCountRef.current = numPages;
                setCurrentPage(1);
                currentPageRef.current = 1;
                currentPageStartedAtRef.current = Date.now();
              }}
              onLoadError={(loadError) => {
                console.error('react-pdf failed to load document, switching to native fallback', loadError);
                setViewerLoading(false);
                setUseNativeFallback(true);
              }}
              options={{
                cMapUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/cmaps/',
                cMapPacked: true,
                standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/standard_fonts/',
              }}
            >
              {!useNativeFallback && pageNumbers.map((pageNumber) => (
                <PdfPageSurface
                  key={pageNumber}
                  pageNumber={pageNumber}
                  pageWidth={pageWidth}
                  registerPageNode={registerPageNode}
                />
              ))}
            </Document>
            {viewerLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#144a57' }} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
