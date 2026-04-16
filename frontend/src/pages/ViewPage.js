import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist/webpack.mjs';
import { AlertCircle, Loader2, Minus, Plus } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DEFAULT_ZOOM = 1;

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

function PdfPageCanvas({ pdfDocument, pageNumber, viewerWidth, zoomLevel, registerPageNode }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [pageHeight, setPageHeight] = useState(320);

  useEffect(() => {
    registerPageNode(pageNumber, wrapperRef.current);
    return () => registerPageNode(pageNumber, null);
  }, [pageNumber, registerPageNode]);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;

    const renderPage = async () => {
      if (!pdfDocument || !canvasRef.current || !viewerWidth) return;
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const fitWidth = Math.max(260, viewerWidth - 32);
        const scale = (fitWidth / unscaledViewport.width) * zoomLevel;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        const pixelRatio = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        setPageHeight(viewport.height);

        renderTask = page.render({
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') {
          console.error(`Failed to render PDF page ${pageNumber}`, error);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask?.cancel) renderTask.cancel();
    };
  }, [pageNumber, pdfDocument, viewerWidth, zoomLevel]);

  return (
    <section
      ref={wrapperRef}
      data-page-number={pageNumber}
      className="mx-auto mb-5 rounded-lg border bg-white shadow-sm"
      style={{ borderColor: '#e2e8f0', minHeight: pageHeight }}
    >
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400" style={{ borderColor: '#f1f5f9' }}>
        <span>Page {pageNumber}</span>
      </div>
      <div className="overflow-hidden rounded-b-lg">
        <canvas ref={canvasRef} className="block mx-auto max-w-full" />
      </div>
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
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [viewerWidth, setViewerWidth] = useState(0);
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
      const nextWidth = entries[0]?.contentRect?.width || 0;
      setViewerWidth(nextWidth);
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

        const loadingTask = pdfjsLib.getDocument({ url: publicPdfUrl });
        const nextPdfDocument = await loadingTask.promise;
        setPdfDocument(nextPdfDocument);
        setPageCount(nextPdfDocument.numPages);
        pageCountRef.current = nextPdfDocument.numPages;
        setCurrentPage(1);
        currentPageRef.current = 1;
        currentPageStartedAtRef.current = Date.now();
      } catch (err) {
        if (err.response?.status === 410) {
          setExpired(true);
        }
        setError(err.response?.data?.detail || 'PDF not found or link is invalid');
      } finally {
        setLoading(false);
        setViewerLoading(false);
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
    if (!pdfDocument) return;
    heartbeatTimer.current = window.setInterval(sendHeartbeat, 3000);
    return () => {
      if (heartbeatTimer.current) window.clearInterval(heartbeatTimer.current);
    };
  }, [pdfDocument, sendHeartbeat]);

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
  }, [pageCount, setActivePage, viewerWidth, zoomLevel]);

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
    <div className="min-h-screen flex flex-col bg-[#f8fafc]" data-testid="view-page">
      <header
        className="flex items-center gap-3 px-4 md:px-5 h-12 border-b flex-shrink-0"
        style={{ backgroundColor: '#144a57', borderColor: 'rgba(232,160,32,0.3)' }}
      >
        <TravlogerMark size={24} />
        <span className="text-sm font-semibold text-white truncate flex-1">{pdfName}</span>
        <div className="hidden sm:flex items-center gap-2 text-xs text-white/75">
          <span>Page {currentPage} / {pageCount || '--'}</span>
          <div className="flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-1">
            <button
              type="button"
              onClick={() => setZoomLevel((value) => Math.max(0.75, Number((value - 0.1).toFixed(2))))}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[48px] text-center font-semibold">{Math.round(zoomLevel * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="border-b bg-white px-4 py-3 text-xs text-slate-500 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <span>Page {currentPage} / {pageCount || '--'}</span>
          <div className="flex items-center gap-1 rounded-full border px-1.5 py-1" style={{ borderColor: '#e2e8f0' }}>
            <button
              type="button"
              onClick={() => setZoomLevel((value) => Math.max(0.75, Number((value - 0.1).toFixed(2))))}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[46px] text-center font-semibold text-slate-700">{Math.round(zoomLevel * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <main ref={viewerRef} className="flex-1 overflow-y-auto px-3 py-4 md:px-5">
        {viewerLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#144a57' }} />
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            {pageNumbers.map((pageNumber) => (
              <PdfPageCanvas
                key={pageNumber}
                pdfDocument={pdfDocument}
                pageNumber={pageNumber}
                viewerWidth={viewerWidth}
                zoomLevel={zoomLevel}
                registerPageNode={registerPageNode}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
