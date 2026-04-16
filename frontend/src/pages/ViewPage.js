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
  if (typeof window === 'undefined' || window.location.hostname === 'localhost') {
    return fallbackUrl;
  }
  return `${window.location.origin}/api/view/${uniqueId}/pdf`;
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function TravlogerMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="7" fill="#144a57"/>
      <path d="M20 8 L32 14 L32 26 L20 32 L8 26 L8 14 Z" fill="none" stroke="#E8A020" strokeWidth="2"/>
      <circle cx="20" cy="20" r="5" fill="#E8A020"/>
      <path d="M20 8 L20 15 M20 25 L20 32 M8 14 L14 17 M26 23 L32 26 M8 26 L14 23 M26 17 L32 14" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
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

export default function ViewPage() {
  const { uniqueId } = useParams();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewerLoading, setViewerLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const tracked = useRef(false);
  const sessionId = useRef(null);
  const sessionStartedAt = useRef(null);
  const heartbeatTimer = useRef(null);
  const viewerRef = useRef(null);
  const pageNodesRef = useRef({});
  const observerRef = useRef(null);
  const currentPageRef = useRef(1);
  const currentPageStartedAtRef = useRef(null);
  const pageDurationsMsRef = useRef({});
  const pageCountRef = useRef(0);

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
    const loadPdf = async () => {
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

    loadPdf();

    const handleFinalHeartbeat = () => sendHeartbeatBeacon();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') sendHeartbeatBeacon();
    };

    window.addEventListener('pagehide', handleFinalHeartbeat);
    window.addEventListener('beforeunload', handleFinalHeartbeat);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (heartbeatTimer.current) window.clearInterval(heartbeatTimer.current);
      if (observerRef.current) observerRef.current.disconnect();
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
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visibleEntries.length) return;
      const pageNumber = Number(visibleEntries[0].target.getAttribute('data-page-number'));
      if (pageNumber) setActivePage(pageNumber);
    }, {
      root: viewerRef.current,
      threshold: [0.45, 0.7, 0.9],
    });

    Object.values(pageNodesRef.current).forEach((node) => {
      if (node) observerRef.current.observe(node);
    });

    return () => observerRef.current?.disconnect();
  }, [pageCount, setActivePage, pageWidth]);

  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" data-testid="view-loading">
        <TravlogerMark size={48} />
        <Loader2 className="w-7 h-7 animate-spin mt-4" style={{ color: '#144a57' }} />
        <p className="text-sm text-slate-400 mt-2">Loading your itinerary...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" data-testid="view-error">
        <TravlogerMark size={48} />
        <AlertCircle className="w-10 h-10 mt-4" style={{ color: '#dc2626' }} />
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
        <TravlogerMark size={24} />
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
        ) : (
          <div className="mx-auto max-w-5xl">
            <Document
              file={pdfUrl}
              loading={
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#144a57' }} />
                </div>
              }
              error="Unable to display this PDF right now."
              onLoadSuccess={({ numPages }) => {
                setViewerLoading(false);
                setPageCount(numPages);
                pageCountRef.current = numPages;
                setCurrentPage(1);
                currentPageRef.current = 1;
                currentPageStartedAtRef.current = Date.now();
              }}
              onLoadError={() => {
                setViewerLoading(false);
                setError('Unable to display this PDF right now.');
              }}
              options={{
                cMapUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/cmaps/',
                cMapPacked: true,
                standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/standard_fonts/',
              }}
            >
              {pageNumbers.map((pageNumber) => (
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
