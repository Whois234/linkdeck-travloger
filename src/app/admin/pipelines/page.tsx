'use client';
import { useState, useRef, useCallback, useMemo, memo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelines, usePipeline, useUsers, useLeadStageMutation, usePrefetchLead, QK } from '@/lib/query-hooks';
import {
  Plus, Search, Phone, ChevronDown, X, Trash2,
  MoveRight, CheckSquare, Square, Calendar, Users, MapPin, Wallet,
  MessageCircle, SlidersHorizontal, Star, Clock, FileText, PhoneCall,
  CheckCircle2, Eye, ArrowRightLeft, UserCheck, ArrowLeft, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { Stage, Lead, Pipeline, STATUS_COLORS, formatDateTime } from './types';
import type { CallState } from './LeadDrawer';
import { KanbanSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toaster';

const LeadDrawer      = dynamic(() => import('./LeadDrawer'),    { ssr: false });
const AddLeadDrawer   = dynamic(() => import('./AddLeadDrawer'), { ssr: false });
const CallBanner      = dynamic(() => import('./LeadDrawer').then(m => ({ default: m.CallBanner })),      { ssr: false });
const CallLogPopup    = dynamic(() => import('./LeadDrawer').then(m => ({ default: m.CallLogPopup })),    { ssr: false });
// WhatsAppPanel replaced with Gallabox iframe drawer (see GallaboxDrawer below)

const T = '#134956';

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  const initials = name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold select-none"
      style={{ width: size, height: size, fontSize: size * 0.34, backgroundColor: color + 'cc', border: `1.5px solid ${color}55` }}>
      {initials}
    </div>
  );
}

// ─── Move-To Bottom Sheet ─────────────────────────────────────────────────────

function MoveToSheet({ lead, stages, stageCounts, onMove, onClose }: {
  lead: Lead; stages: Stage[];
  stageCounts: Record<string, number>;
  onMove: (stageId: string) => void;
  onClose: () => void;
}) {
  const maxCount = Math.max(1, ...Object.values(stageCounts));
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" onClick={onClose}>
      <div className="fixed inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />
      <div className="relative rounded-t-3xl overflow-hidden" style={{ backgroundColor: '#0F1923', maxHeight: '82vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <p className="font-bold text-base text-white">Move To</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)', maxWidth: 240 }}>{lead.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pt-2 pb-10 space-y-1.5" style={{ maxHeight: 'calc(82vh - 90px)' }}>
          {stages.map(stage => {
            const count = stageCounts[stage.id] ?? 0;
            const isCurrent = stage.id === lead.stage_id;
            const pct = Math.round((count / maxCount) * 100);
            return (
              <button key={stage.id} disabled={isCurrent}
                onClick={() => { if (!isCurrent) onMove(stage.id); }}
                className="w-full text-left rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: isCurrent ? `${T}22` : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${isCurrent ? T + '66' : 'rgba(255,255,255,0.07)'}`,
                }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color, boxShadow: `0 0 6px ${stage.color}88` }} />
                    <span className="text-sm font-semibold text-white">{stage.name}</span>
                    {isCurrent && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: T, color: '#fff' }}>current</span>}
                  </div>
                  <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>{count} {count === 1 ? 'deal' : 'deals'}</span>
                </div>
                <div className="h-[3px] rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: stage.color, opacity: 0.7 }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Lead Card ───────────────────────────────────────────────────────────────

const LeadCard = memo(function LeadCard({
  lead, stageColor, onDragStart, onClick, selected, onToggleSelect, onPrefetch,
  onLongPress, onMoveTap, onCall, onWhatsAppChat, isDragging,
  onSwipeStage, prevStageName, prevStageColor, nextStageName, nextStageColor,
}: {
  lead: Lead; stageColor: string;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onClick: (lead: Lead) => void;
  selected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onPrefetch: (leadId: string) => void;
  onLongPress: (lead: Lead, rect: DOMRect, touchX: number, touchY: number) => void;
  onMoveTap: (lead: Lead) => void;
  onCall: (lead: Lead) => void;
  onWhatsAppChat: (lead: Lead) => void;
  isDragging: boolean;
  onSwipeStage: (lead: Lead, dir: 'prev' | 'next') => void;
  prevStageName: string | null;
  prevStageColor: string | null;
  nextStageName: string | null;
  nextStageColor: string | null;
}) {
  const callCount  = lead._count?.call_logs ?? 0;
  const noteCount  = lead._count?.lead_notes ?? 0;
  const isNew      = callCount + noteCount === 0;
  const topQuote   = lead.quotes?.[0];
  const quoteViewed   = topQuote && (topQuote.status === 'PUBLISHED' || topQuote.status === 'VIEWED') && topQuote.events.some(e => e.event_type === 'quote_viewed');
  const quoteApproved = topQuote?.status === 'APPROVED' || topQuote?.status === 'ACCEPTED';

  const cardRef        = useRef<HTMLDivElement>(null);
  const didLongPress   = useRef(false);
  // Stable refs for callbacks (avoid stale closures in DOM event handlers)
  const onSwipeStageRef = useRef(onSwipeStage);
  useEffect(() => { onSwipeStageRef.current = onSwipeStage; }, [onSwipeStage]);
  const leadRef = useRef(lead);
  useEffect(() => { leadRef.current = lead; }, [lead]);
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => { onLongPressRef.current = onLongPress; }, [onLongPress]);

  // ── Unified PointerEvents handler: swipe-to-move + long-press drag ──────────
  //
  // Why PointerEvents instead of TouchEvents:
  //   • setPointerCapture() locks the pointer to this element once horizontal
  //     intent is confirmed — iOS scroll-snap can no longer steal the gesture
  //   • No passive/non-passive conflict (touchmove passive = can't preventDefault)
  //   • Handles swipe AND long-press in one place, eliminating the race where
  //     the 400ms long-press timer fires during a slow horizontal swipe
  //
  // touch-action: pan-y (set on the div below) tells the browser: let vertical
  // panning be native (so column still scrolls), horizontal is ours.
  useEffect(() => {
    const elMaybe = cardRef.current;
    if (!elMaybe) return;
    const el: HTMLDivElement = elMaybe; // narrowed — safe to use in closures

    let startX = 0, startY = 0;
    let trackedId: number | null = null;   // which pointer we're following
    let swipeActive = false;               // true = horizontal swipe in progress
    let intentLocked = false;             // direction decision made
    let hasMoved = false;                 // any movement > 6px → cancel long press
    let swipeDx = 0;
    let lpTimer: ReturnType<typeof setTimeout> | null = null;

    const hintNext = el.querySelector('.swipe-hint-next') as HTMLElement | null;
    const hintPrev = el.querySelector('.swipe-hint-prev') as HTMLElement | null;

    function resetVisual() {
      el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.transform = '';
      el.style.opacity = '';
      setTimeout(() => { el.style.transition = ''; }, 400);
      if (hintNext) hintNext.style.opacity = '0';
      if (hintPrev) hintPrev.style.opacity = '0';
    }

    function clearLP() {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse') return; // desktop: skip touch logic
      if (trackedId !== null) return;        // already tracking another finger

      trackedId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      swipeDx = 0; swipeActive = false; intentLocked = false; hasMoved = false;
      didLongPress.current = false;
      el.style.transition = 'none';

      // Long-press: 500ms hold with no meaningful movement → open drag sheet
      lpTimer = setTimeout(() => {
        if (hasMoved) return; // finger already moved — it's a swipe, not a long press
        didLongPress.current = true;
        if (navigator.vibrate) navigator.vibrate(50);
        const rect = el.getBoundingClientRect();
        onLongPressRef.current(leadRef.current, rect, startX, startY);
        trackedId = null; // release tracking so drag-ghost takes over
      }, 500);
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId !== trackedId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      // Any movement > 6px → cancel long-press
      if (!hasMoved && (adx > 6 || ady > 6)) {
        hasMoved = true;
        clearLP();
      }

      // Lock direction once movement is definitive (> 10px)
      if (!intentLocked && (adx > 10 || ady > 10)) {
        intentLocked = true;
        if (adx > ady * 1.2) {
          // ✅ Horizontal swipe intent — capture pointer so iOS scroll-snap
          // can't intercept future events, then drive the animation ourselves
          swipeActive = true;
          try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        } else {
          // Vertical intent — release tracking, let column scroll natively
          trackedId = null;
          el.style.transition = '';
          el.style.transform = '';
          return;
        }
      }

      if (!swipeActive) return;

      swipeDx = dx;
      // Rubber-band: elastic feel, cap at 120px
      const reach = Math.sign(dx) * Math.min(Math.abs(dx) * 0.6, 120);
      el.style.transform = `translateX(${reach}px)`;

      // Reveal stage name hints progressively
      const progress = Math.min(1, (adx - 10) / 50);
      if (dx > 10) {
        if (hintNext) hintNext.style.opacity = String(progress);
        if (hintPrev) hintPrev.style.opacity = '0';
      } else if (dx < -10) {
        if (hintPrev) hintPrev.style.opacity = String(progress);
        if (hintNext) hintNext.style.opacity = '0';
      } else {
        if (hintNext) hintNext.style.opacity = '0';
        if (hintPrev) hintPrev.style.opacity = '0';
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId !== trackedId) return;
      clearLP();
      trackedId = null;
      if (!swipeActive) return;
      swipeActive = false;
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      const absDx = Math.abs(swipeDx);
      if (absDx > 48) {
        // Right swipe → next stage; left swipe → prev stage
        const dir = swipeDx > 0 ? 'next' : 'prev';
        if ((dir === 'next' && !nextStageName) || (dir === 'prev' && !prevStageName)) {
          resetVisual(); return;
        }
        if (navigator.vibrate) navigator.vibrate(28);
        el.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in';
        el.style.transform = `translateX(${swipeDx > 0 ? 200 : -200}px)`;
        el.style.opacity = '0';
        if (hintNext) hintNext.style.opacity = '0';
        if (hintPrev) hintPrev.style.opacity = '0';
        setTimeout(() => {
          el.style.transform = '';
          el.style.transition = '';
          el.style.opacity = '';
          onSwipeStageRef.current(leadRef.current, dir);
        }, 210);
      } else {
        resetVisual();
      }
    }

    function onPointerCancel(e: PointerEvent) {
      if (e.pointerId !== trackedId) return;
      clearLP();
      trackedId = null;
      swipeActive = false;
      resetVisual();
    }

    el.addEventListener('pointerdown',   onPointerDown);
    el.addEventListener('pointermove',   onPointerMove);
    el.addEventListener('pointerup',     onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    return () => {
      clearLP();
      el.removeEventListener('pointerdown',   onPointerDown);
      el.removeEventListener('pointermove',   onPointerMove);
      el.removeEventListener('pointerup',     onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, !!prevStageName, !!nextStageName]);

  return (
    <div
      ref={cardRef}
      data-lead-id={lead.id}
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onMouseEnter={() => onPrefetch(lead.id)}
      onClick={() => { if (!didLongPress.current) onClick(lead); }}
      className="group relative cursor-pointer select-none transition-all duration-150 overflow-hidden"
      style={{
        // touch-action: pan-y → tells iOS/Android: vertical scroll is native,
        // horizontal swipes are handled by our JS (not the scroll-snap container).
        // This is the key fix that makes swipe-to-move work on mobile.
        touchAction: 'pan-y',
        backgroundColor: isDragging ? 'transparent' : (selected ? '#EFF8FF' : '#fff'),
        border: isDragging ? `2px dashed ${stageColor}66` : (selected ? `1.5px solid ${T}` : '1px solid #E8EDF2'),
        borderRadius: 14,
        boxShadow: isDragging ? 'none' : (selected
          ? `0 0 0 3px ${T}18, 0 2px 8px rgba(0,0,0,0.06)`
          : '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)'),
        borderLeft: isDragging ? `2px dashed ${stageColor}66` : `3px solid ${stageColor}`,
        padding: '13px 13px 11px',
        opacity: isDragging ? 0 : 1,
        minHeight: isDragging ? 60 : undefined,
      }}
    >
      {/* Swipe-right hint: move to next stage */}
      {nextStageName && (
        <div className="swipe-hint-next absolute inset-0 flex items-center justify-end pr-4 pointer-events-none rounded-[13px]"
          style={{ opacity: 0, background: `linear-gradient(to left, ${nextStageColor ?? '#16A34A'}22 0%, transparent 60%)` }}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
            style={{ backgroundColor: nextStageColor ?? '#16A34A', color: '#fff' }}>
            <span className="text-[11px] font-bold leading-none">{nextStageName}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}
      {/* Swipe-left hint: move to prev stage */}
      {prevStageName && (
        <div className="swipe-hint-prev absolute inset-0 flex items-center pl-4 pointer-events-none rounded-[13px]"
          style={{ opacity: 0, background: `linear-gradient(to right, ${prevStageColor ?? '#64748B'}22 0%, transparent 60%)` }}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
            style={{ backgroundColor: prevStageColor ?? '#64748B', color: '#fff' }}>
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold leading-none">{prevStageName}</span>
          </div>
        </div>
      )}

      {/* Checkbox overlay */}
      <button
        onClick={e => onToggleSelect(lead.id, e)}
        className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ opacity: selected ? 1 : undefined }}
        title={selected ? 'Deselect' : 'Select'}
      >
        {selected
          ? <CheckSquare className="w-4 h-4" style={{ color: T }} />
          : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
      </button>

      {/* Header: avatar + name + NEW badge */}
      <div className="flex items-start gap-2.5 mb-2.5 pr-6">
        <Avatar name={lead.name} color={stageColor} size={30} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold leading-tight truncate" style={{ color: '#0F172A' }}>{lead.name}</p>
            {isNew && (
              <span className="flex-shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wide"
                style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>NEW</span>
            )}
          </div>
          {lead.phone && (
            <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>{lead.phone}</p>
          )}
        </div>
      </div>

      {/* Meta chips */}
      {(lead.destination_interest || lead.travel_month || lead.budget_range) && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {lead.destination_interest && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#F0F9FF', color: '#0369A1' }}>
              <MapPin className="w-2.5 h-2.5" />{lead.destination_interest}
            </span>
          )}
          {lead.travel_month && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#F5F3FF', color: '#6D28D9' }}>
              <Calendar className="w-2.5 h-2.5" />{lead.travel_month}
            </span>
          )}
          {lead.budget_range && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>
              <Wallet className="w-2.5 h-2.5" />{lead.budget_range}
            </span>
          )}
        </div>
      )}

      {/* Footer: time + activity counts + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1" style={{ color: '#94A3B8' }}>
          <Clock className="w-3 h-3" />
          <span className="text-[11px]">{formatDateTime(lead.created_at)}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {callCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
              <PhoneCall className="w-2.5 h-2.5" />{callCount}
            </span>
          )}
          {noteCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#FFFBEB', color: '#B45309' }}>
              <FileText className="w-2.5 h-2.5" />{noteCount}
            </span>
          )}
          {quoteApproved && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
              <CheckCircle2 className="w-2.5 h-2.5" />Approved
            </span>
          )}
          {!quoteApproved && quoteViewed && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#F3E8FF', color: '#7C3AED' }}>
              <Eye className="w-2.5 h-2.5" />Viewed
            </span>
          )}
          <div className="flex items-center gap-0.5 ml-1">
            {/* Move button — mobile only, tapping shows Move-To sheet instantly */}
            <button
              onClick={e => { e.stopPropagation(); onMoveTap(lead); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[#EFF6FF] md:hidden"
              title="Move to stage">
              <ArrowRightLeft className="w-3 h-3" style={{ color: T }} />
            </button>
            <button onClick={e => { e.stopPropagation(); onCall(lead); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F0FDF4]" title="Call">
              <Phone className="w-3 h-3" style={{ color: '#16A34A' }} />
            </button>
            {/* Blue — opens conversation panel (API-based) */}
            <button onClick={e => { e.stopPropagation(); onWhatsAppChat(lead); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[#EFF6FF]"
              title="WhatsApp chat (API)">
              <MessageCircle className="w-3 h-3" style={{ color: '#2563EB' }} />
            </button>
            {/* Green — opens wa.me in new tab */}
            <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F0FDF4]"
              title="Open in WhatsApp">
              <MessageCircle className="w-3 h-3" style={{ color: '#25D366' }} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Kanban Column ───────────────────────────────────────────────────────────

const KanbanColumn = memo(function KanbanColumn({
  stage, leads, loading, onDragStart, onDrop, onLeadClick, selectedIds, onToggleSelect, onSelectAllInStage, onPrefetch,
  onLongPress, onMoveTap, onCall, onWhatsAppChat, draggingLeadId, isDragTarget, onSwipeStage,
  prevStage, nextStage, trueCount,
}: {
  stage: Stage; leads: Lead[]; loading?: boolean;
  trueCount?: number;  // real DB count (unaffected by the 300-lead cap)
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDrop: (stageId: string) => void;
  onLeadClick: (lead: Lead) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onSelectAllInStage: (stageId: string, leads: Lead[]) => void;
  onPrefetch: (leadId: string) => void;
  onLongPress: (lead: Lead, rect: DOMRect, touchX: number, touchY: number) => void;
  onMoveTap: (lead: Lead) => void;
  onCall: (lead: Lead) => void;
  onWhatsAppChat: (lead: Lead) => void;
  draggingLeadId: string | null;
  isDragTarget: boolean;
  onSwipeStage: (lead: Lead, dir: 'prev' | 'next') => void;
  prevStage: Stage | null;
  nextStage: Stage | null;
}) {
  const PAGE_SIZE    = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [over, setOver] = useState(false);
  const isOver       = over || isDragTarget;
  const allSelected  = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  const visibleLeads = leads.slice(0, visibleCount);
  const hasMore      = visibleCount < leads.length;

  // Sentinel ref — IntersectionObserver fires when user scrolls to bottom
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);

  // Auto-load more when the sentinel (bottom of visible cards) scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(c => c + PAGE_SIZE);
        }
      },
      { root: scrollRef.current, rootMargin: '60px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.length, visibleCount]);

  return (
    <div
      data-stage-id={stage.id}
      className="kanban-col flex flex-col flex-shrink-0 rounded-2xl"
      style={{
        width: 284,
        backgroundColor: '#F6F8FA',
        scrollSnapAlign: 'start',
        border: `1px solid ${isOver ? stage.color + '88' : '#E2E8F0'}`,
        boxShadow: isOver ? `0 0 0 3px ${stage.color}33, 0 4px 16px ${stage.color}22` : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        overflow: 'hidden',
      }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id); }}
    >
      {/* Column Header */}
      <div className="px-4 pt-3.5 pb-3 flex items-center justify-between flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${stage.color}14 0%, ${stage.color}06 100%)`,
          borderBottom: `1.5px solid ${stage.color}30`,
        }}>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onSelectAllInStage(stage.id, leads)}
            title={allSelected ? 'Deselect all' : 'Select all in stage'}
            className="opacity-40 hover:opacity-100 transition-opacity">
            {allSelected
              ? <CheckSquare className="w-3.5 h-3.5" style={{ color: T }} />
              : <Square className="w-3.5 h-3.5" style={{ color: '#64748B' }} />}
          </button>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color, boxShadow: `0 0 6px ${stage.color}88` }} />
          <span className="text-[13px] font-bold tracking-tight" style={{ color: '#0F172A' }}>{stage.name}</span>
        </div>
        <div className="flex items-center justify-center rounded-full text-[11px] font-extrabold min-w-[22px] h-5 px-1.5"
          style={{ backgroundColor: stage.color, color: '#fff', boxShadow: `0 1px 4px ${stage.color}66` }}>
          {trueCount ?? leads.length}
        </div>
      </div>

      {/* Cards — scrollable container */}
      <div
        ref={scrollRef}
        className="kanban-cards-scroll overflow-y-auto px-3 pt-3 space-y-2.5"
        style={{
          backgroundColor: isOver ? `${stage.color}08` : undefined,
          transition: 'background-color 0.15s',
          pointerEvents: 'auto',
        }}>

        {/* Touch drag drop indicator */}
        {isDragTarget && (
          <div className="mx-0 mb-2.5 rounded-xl border-2 border-dashed flex items-center justify-center py-3 transition-all"
            style={{
              borderColor: stage.color,
              backgroundColor: stage.color + '12',
              animation: 'pulse 1.2s ease-in-out infinite',
            }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-[12px] font-bold" style={{ color: stage.color }}>Drop here</span>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
            </div>
          </div>
        )}

        {/* Loading skeleton — while pipeline detail API is fetching */}
        {loading && leads.length === 0 && (
          <div className="space-y-2.5 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl p-3 space-y-2"
                style={{ backgroundColor: '#fff', border: '1px solid #E8EDF2', borderLeft: `3px solid ${stage.color}44` }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full" style={{ backgroundColor: stage.color + '22' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded" style={{ backgroundColor: '#E2E8F0', width: `${55 + i * 12}%` }} />
                    <div className="h-2.5 rounded" style={{ backgroundColor: '#F1F5F9', width: '45%' }} />
                  </div>
                </div>
                <div className="h-2 rounded" style={{ backgroundColor: '#F1F5F9', width: '70%' }} />
              </div>
            ))}
          </div>
        )}

        {visibleLeads.map(lead => (
          <LeadCard key={lead.id} lead={lead} stageColor={stage.color}
            onDragStart={onDragStart} onClick={onLeadClick}
            selected={selectedIds.has(lead.id)} onToggleSelect={onToggleSelect}
            onPrefetch={onPrefetch}
            onLongPress={onLongPress} onMoveTap={onMoveTap} onCall={onCall}
            onWhatsAppChat={onWhatsAppChat}
            isDragging={draggingLeadId === lead.id}
            onSwipeStage={onSwipeStage}
            prevStageName={prevStage?.name ?? null}
            prevStageColor={prevStage?.color ?? null}
            nextStageName={nextStage?.name ?? null}
            nextStageColor={nextStage?.color ?? null}
          />
        ))}

        {/* Sentinel div — IntersectionObserver watches this to auto-load more */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-3 gap-2">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
              style={{ borderColor: stage.color, borderTopColor: 'transparent' }} />
            <span className="text-[11px] font-semibold" style={{ color: stage.color + 'AA' }}>
              {leads.length - visibleCount} more
            </span>
          </div>
        )}

        {!loading && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 rounded-xl border-2 border-dashed transition-colors"
            style={{ borderColor: isOver ? stage.color + '88' : '#DDE3EB', color: '#94A3B8' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: stage.color + '18' }}>
              <Plus className="w-4 h-4" style={{ color: stage.color }} />
            </div>
            <p className="text-[11px] font-semibold">Drop lead here</p>
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

interface BulkUser { id: string; name: string; role?: string }

function BulkActionBar({ count, stages, users, onMoveStage, onAssign, onDelete, onClear, isDeleting }: {
  count: number; stages: Stage[]; users: BulkUser[];
  onMoveStage: (stageId: string) => void;
  onAssign: (userId: string, userName: string) => void;
  onDelete: () => void;
  onClear: () => void;
  isDeleting?: boolean;
}) {
  const [showStageMenu,  setShowStageMenu]  = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);
  const stageRef  = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setShowAssignMenu(false);
      if (stageRef.current  && !stageRef.current.contains(e.target as Node))  setShowStageMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg"
      style={{ backgroundColor: '#0C1B29', color: 'white', border: '1px solid #1e3347' }}>
      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#7DD3C022' }}>
        <CheckSquare className="w-3.5 h-3.5" style={{ color: '#7DD3C0' }} />
      </div>
      <span className="text-[13px] font-bold" style={{ color: '#7DD3C0' }}>{count} selected</span>
      <div className="w-px h-4 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />

      {/* Move to Stage */}
      <div className="relative" ref={stageRef}>
        <button onClick={() => { setShowStageMenu(p => !p); setShowAssignMenu(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors hover:bg-white/10">
          <MoveRight className="w-3.5 h-3.5" /> Move to Stage <ChevronDown className="w-3 h-3" />
        </button>
        {showStageMenu && (
          <div className="absolute top-9 left-0 bg-white rounded-xl shadow-2xl overflow-hidden z-30 min-w-[180px]"
            style={{ border: '1px solid #E2E8F0' }}>
            {stages.map(s => (
              <button key={s.id} onClick={() => { onMoveStage(s.id); setShowStageMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-[#F8FAFC] text-left transition-colors"
                style={{ color: '#0F172A' }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color, boxShadow: `0 0 4px ${s.color}66` }} />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assign to User */}
      <div className="relative" ref={assignRef}>
        <button onClick={() => { setShowAssignMenu(p => !p); setShowStageMenu(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors hover:bg-white/10"
          style={{ color: '#93C5FD' }}>
          <UserCheck className="w-3.5 h-3.5" /> Assign <ChevronDown className="w-3 h-3" />
        </button>
        {showAssignMenu && (
          <div className="absolute top-9 left-0 bg-white rounded-xl shadow-2xl overflow-hidden z-30 min-w-[200px]"
            style={{ border: '1px solid #E2E8F0' }}>
            <div className="px-3 py-2 border-b" style={{ borderColor: '#F1F5F9' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Assign {count} lead{count > 1 ? 's' : ''} to</p>
            </div>
            {users.length === 0 && (
              <p className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>No users found</p>
            )}
            {users.map(u => (
              <button key={u.id}
                onClick={() => { onAssign(u.id, u.name); setShowAssignMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                  style={{ backgroundColor: T }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{u.name}</p>
                  {u.role && <p className="text-[10px] truncate" style={{ color: '#94A3B8' }}>{u.role}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={onDelete}
        disabled={isDeleting}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed min-w-[90px] justify-center"
        style={{ color: '#FCA5A5' }}>
        {isDeleting ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Deleting...
          </>
        ) : (
          <><Trash2 className="w-3.5 h-3.5" /> Delete</>
        )}
      </button>

      <div className="flex-1" />
      <button onClick={onClear} disabled={isDeleting} className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: 'rgba(255,255,255,0.4)' }}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Filter Panel (slide-in from right) ─────────────────────────────────────

const LEAD_SOURCES = ['organic', 'ctwa', 'whatsapp_ad', 'meta', 'referral', 'phone', 'other'] as const;
const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  organic:      { bg: '#F0FDF4', text: '#15803D' },
  ctwa:         { bg: '#EFF6FF', text: '#2563EB' },
  whatsapp_ad:  { bg: '#FEF9C3', text: '#A16207' },
  meta:         { bg: '#F5F3FF', text: '#6D28D9' },
  referral:     { bg: '#FFF7ED', text: '#C2410C' },
  phone:        { bg: '#F0FDF4', text: '#16A34A' },
  other:        { bg: '#F8FAFC', text: '#64748B' },
};

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  fStatuses: string[];
  setFStatuses: (v: string[]) => void;
  fSources: string[];
  setFSources: (v: string[]) => void;
  fUserMode: 'include' | 'exclude';
  setFUserMode: (v: 'include' | 'exclude') => void;
  fUserIds: string[];
  setFUserIds: (v: string[]) => void;
  fDestination: string;
  setFDestination: (v: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  users: CrmUser[];
  onClearAll: () => void;
}

function FilterPanel({
  open, onClose, sortBy, setSortBy,
  fStatuses, setFStatuses, fSources, setFSources,
  fUserMode, setFUserMode, fUserIds, setFUserIds,
  fDestination, setFDestination,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo,
  users, onClearAll,
}: FilterPanelProps) {
  const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'name',   label: 'Name A–Z' },
    { value: 'budget_asc',  label: 'Budget ↑' },
    { value: 'budget_desc', label: 'Budget ↓' },
  ];

  function toggleStatus(s: string) {
    setFStatuses(fStatuses.includes(s) ? fStatuses.filter(x => x !== s) : [...fStatuses, s]);
  }
  function toggleSource(s: string) {
    setFSources(fSources.includes(s) ? fSources.filter(x => x !== s) : [...fSources, s]);
  }
  function toggleUser(id: string) {
    setFUserIds(fUserIds.includes(id) ? fUserIds.filter(x => x !== id) : [...fUserIds, id]);
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}
      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 bg-white shadow-2xl flex flex-col"
        style={{
          width: 'min(360px, 100vw)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <p className="text-base font-bold" style={{ color: '#0F172A' }}>Filters</p>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* SORT */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Sort</p>
            <div className="space-y-1">
              {SORT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setSortBy(opt.value)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium text-left transition-colors"
                  style={{
                    backgroundColor: sortBy === opt.value ? T + '0c' : 'transparent',
                    color: sortBy === opt.value ? T : '#374151',
                  }}>
                  {opt.label}
                  {sortBy === opt.value && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: T }} />}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* LEAD STATUS */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Lead Status</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STATUS_COLORS).map(([s, colors]) => {
                const active = fStatuses.includes(s);
                return (
                  <button key={s} onClick={() => toggleStatus(s)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                    style={{
                      backgroundColor: active ? colors.bg : '#F8FAFC',
                      color: active ? colors.text : '#64748B',
                      border: `1.5px solid ${active ? colors.text + '55' : '#E2E8F0'}`,
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.text }} />
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* USERS */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Users</p>
            {/* Include / Exclude toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl mb-3 inline-flex" style={{ backgroundColor: '#F1F5F9' }}>
              {(['include', 'exclude'] as const).map(mode => (
                <button key={mode} onClick={() => setFUserMode(mode)}
                  className="px-4 py-1.5 rounded-lg text-[12px] font-bold capitalize transition-all"
                  style={fUserMode === mode
                    ? { backgroundColor: T, color: '#fff', boxShadow: `0 1px 4px ${T}44` }
                    : { color: '#64748B' }}>
                  {mode}
                </button>
              ))}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {/* Unassigned pseudo-user */}
              {(() => {
                const checked = fUserIds.includes('__unassigned__');
                return (
                  <label className="flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="checkbox" checked={checked} onChange={() => toggleUser('__unassigned__')}
                      className="w-4 h-4 rounded accent-teal-700 flex-shrink-0" />
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: '#94A3B8', color: '#fff' }}>?</div>
                    <span className="text-[13px] font-medium truncate italic" style={{ color: '#64748B' }}>Unassigned</span>
                  </label>
                );
              })()}
              {users.map(u => {
                const checked = fUserIds.includes(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="checkbox" checked={checked} onChange={() => toggleUser(u.id)}
                      className="w-4 h-4 rounded accent-teal-700 flex-shrink-0" />
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: T }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[13px] font-medium truncate" style={{ color: '#0F172A' }}>{u.name}</span>
                    <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: '#94A3B8' }}>{u.role}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* DATE RANGE */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Date Range</p>
            <div className="space-y-2">
              {[
                { label: 'From', val: filterDateFrom, set: setFilterDateFrom },
                { label: 'To',   val: filterDateTo,   set: setFilterDateTo },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="text-[11px] font-semibold block mb-1" style={{ color: '#64748B' }}>{label}</label>
                  <input type="date" value={val} onChange={e => set(e.target.value)}
                    className="w-full text-[13px] rounded-xl px-3 py-2 outline-none"
                    style={{ border: '1px solid #E2E8F0', color: '#0F172A' }} />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* LEAD SOURCE */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Lead Source</p>
            <div className="flex flex-wrap gap-2">
              {LEAD_SOURCES.map(s => {
                const active = fSources.includes(s);
                const colors = SOURCE_COLORS[s];
                return (
                  <button key={s} onClick={() => toggleSource(s)}
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all capitalize"
                    style={{
                      backgroundColor: active ? colors.bg : '#F8FAFC',
                      color: active ? colors.text : '#64748B',
                      border: `1.5px solid ${active ? colors.text + '55' : '#E2E8F0'}`,
                    }}>
                    {s.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* DESTINATION */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#94A3B8' }}>Destination</p>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#94A3B8' }} />
              <input
                type="text"
                value={fDestination}
                onChange={e => setFDestination(e.target.value)}
                placeholder="e.g. Maldives, Bali…"
                className="w-full pl-9 pr-4 py-2 text-[13px] rounded-xl outline-none"
                style={{ border: '1px solid #E2E8F0', color: '#0F172A' }}
              />
              {fDestination && (
                <button onClick={() => setFDestination('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClearAll}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-colors hover:bg-red-50"
            style={{ color: '#EF4444', border: '1px solid #FECACA' }}>
            Clear All
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: T }}>
            Apply &amp; Close
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Gallabox conversation iframe drawer ──────────────────────────────────────

function GallaboxDrawer({ phone, name, channelId, onClose }: {
  phone: string; name: string; channelId: string; onClose: () => void;
}) {
  const cleanPhone = phone.replace(/[\s+\-()]/g, '');
  const iframeUrl = channelId
    ? `https://conversation-widget.gallabox.com/conversations/phone/${cleanPhone}?name=${encodeURIComponent(name)}&channelId=${encodeURIComponent(channelId)}`
    : '';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-50 h-full bg-white flex flex-col"
        style={{ width: 'min(420px, 100vw)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0"
          style={{ background: '#134956' }}>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-white truncate">{name}</p>
            <p className="text-xs text-white/70 truncate">{phone}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
            style={{ color: 'white' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Iframe */}
        <div className="flex-1 overflow-hidden">
          {iframeUrl ? (
            <iframe
              src={iframeUrl}
              className="w-full h-full border-none"
              title={`Chat with ${name}`}
              allow="clipboard-write"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
              <p className="text-sm font-medium" style={{ color: '#64748B' }}>
                Gallabox Channel ID not configured.
              </p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>
                Go to CRM Settings → Gallabox tab to set the Channel ID.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface CrmUser { id: string; name: string; role: string }

export default function PipelinesPage() {
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [search, setSearch]                     = useState('');
  const [sortBy, setSortBy]                     = useState('newest');
  const [showFilterPanel, setShowFilterPanel]   = useState(false);
  const [fStatuses, setFStatuses]               = useState<string[]>([]);
  const [fSources, setFSources]                 = useState<string[]>([]);
  const [fUserMode, setFUserMode]               = useState<'include' | 'exclude'>('include');
  const [fUserIds, setFUserIds]                 = useState<string[]>([]);
  const [fDestination, setFDestination]         = useState('');
  const [showAddLead, setShowAddLead]           = useState(false);
  const [selectedLead, setSelectedLead]         = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set());
  const [isDeleting,  setIsDeleting]            = useState(false);
  const [selectingAll, setSelectingAll]         = useState(false);
  const [filterOwner, setFilterOwner]           = useState<string>('');
  const [filterDateFrom, setFilterDateFrom]     = useState('');
  const [filterDateTo, setFilterDateTo]         = useState('');
  const draggingLeadId = useRef<string | null>(null);
  const [moveLead, setMoveLead] = useState<Lead | null>(null);
  const [waPanel, setWaPanel]   = useState<{ phone: string; name: string } | null>(null);
  const [gallaboxChannelId, setGallaboxChannelId] = useState('');
  const [callState, setCallState] = useState<CallState>(null);
  const [callPopupState, setCallPopupState] = useState<{ leadId: string; leadName: string; elapsed: number; outcome: string } | null>(null);

  // Mobile drag state
  interface DragState {
    lead: Lead;
    ghostX: number; ghostY: number;   // current ghost position (fixed coords)
    startX: number; startY: number;   // initial touch position
    cardX: number; cardY: number;     // initial card position
    cardW: number; cardH: number;
    targetStageId: string | null;
  }
  const [mobileDrag, setMobileDrag] = useState<DragState | null>(null);
  const [mobileDragTargetId, setMobileDragTargetId] = useState<string | null>(null);
  const mobileDragRef = useRef<DragState | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [activeColumnIdx, setActiveColumnIdx] = useState(0);

  const qc = useQueryClient();

  // Load Gallabox channel ID from app settings
  useEffect(() => {
    fetch('/api/v1/app-settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data?.gallabox_channel_id) setGallaboxChannelId(d.data.gallabox_channel_id); })
      .catch(() => {});
  }, []);

  const { data: pipelinesData, isLoading: loadingPipelines } = usePipelines();
  const rawPipelines = (pipelinesData as Pipeline[] | undefined) ?? [];

  const resolvedPipelineId = activePipelineId ||
    (rawPipelines.find(p => p.is_default)?.id ?? rawPipelines[0]?.id ?? '');

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    // Quick user select (single include, existing behavior)
    if (filterOwner) p.set('owner_id', filterOwner);
    // Multi-user from panel overrides quick select
    if (fUserIds.length > 0) {
      const hasUnassigned = fUserIds.includes('__unassigned__');
      const realUserIds   = fUserIds.filter(id => id !== '__unassigned__');
      if (fUserMode === 'include') {
        if (realUserIds.length > 0) p.set('owner_ids', realUserIds.join(','));
        if (hasUnassigned)          p.set('include_unassigned', '1');
      } else {
        // Exclude mode: unassigned leads are naturally included when excluding named users
        if (realUserIds.length > 0) p.set('exclude_owner_ids', realUserIds.join(','));
      }
      p.delete('owner_id'); // panel takes precedence
    }
    if (filterDateFrom) p.set('date_from', filterDateFrom);
    if (filterDateTo)   p.set('date_to',   filterDateTo);
    return p;
  }, [filterOwner, fUserIds, fUserMode, filterDateFrom, filterDateTo]);

  const { data: pipelineDetail, isLoading: loadingDetail } = usePipeline(resolvedPipelineId, filterParams);
  // True per-stage counts from the API (not capped by the 300-lead limit)
  const apiStageCounts = useMemo<Record<string, number>>(
    () => ((pipelineDetail as { stageCounts?: Record<string, number> } | undefined)?.stageCounts ?? {}),
    [pipelineDetail],
  );
  const { data: usersData }      = useUsers();
  const users: CrmUser[]         = useMemo(() => (usersData as CrmUser[] | undefined) ?? [], [usersData]);

  const stageMutation = useLeadStageMutation(resolvedPipelineId, filterParams);
  const prefetchLead  = usePrefetchLead();

  const pipelines = useMemo<Pipeline[]>(() => rawPipelines.map(p =>
    p.id === resolvedPipelineId && pipelineDetail
      ? { ...p, stages: (pipelineDetail as Pipeline).stages, leads: (pipelineDetail as Pipeline).leads }
      : p
  ), [rawPipelines, resolvedPipelineId, pipelineDetail]);

  const activePipeline = useMemo(() => pipelines.find(p => p.id === resolvedPipelineId), [pipelines, resolvedPipelineId]);

  // Track active column index for mobile dots indicator
  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    const stageCount = activePipeline?.stages?.length ?? 0;
    const handleScroll = () => {
      // col width on mobile ≈ viewport - 40px; gap = 16px; left padding = 16px
      const colW = Math.max(240, el.offsetWidth - 40);
      const idx = Math.round(el.scrollLeft / (colW + 16));
      setActiveColumnIdx(Math.max(0, Math.min(idx, stageCount - 1)));
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [activePipeline?.stages?.length]);

  const handleDragStart = useCallback((e: React.DragEvent, leadId: string) => {
    draggingLeadId.current = leadId;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((stageId: string) => {
    const leadId = draggingLeadId.current;
    if (!leadId) return;
    draggingLeadId.current = null;
    stageMutation.mutate({ leadId, stageId });
  }, [stageMutation]);

  const handleMoveTap = useCallback((lead: Lead) => {
    setMoveLead(lead);
  }, []);

  const handleCall = useCallback((lead: Lead) => {
    window.location.href = `tel:${lead.phone}`;
    setCallState({ active: true, leadId: lead.id, leadName: lead.name, phone: lead.phone, elapsed: 0 });
  }, []);

  const handleWhatsAppChat = useCallback((lead: Lead) => {
    setWaPanel({ phone: lead.phone, name: lead.name });
  }, []);

  const handleSwipeStage = useCallback((lead: Lead, dir: 'prev' | 'next') => {
    const stages = activePipeline?.stages ?? [];
    const currentIdx = stages.findIndex(s => s.id === lead.stage_id);
    if (currentIdx === -1) return;
    const newIdx = dir === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (newIdx < 0 || newIdx >= stages.length) return;
    const targetStage = stages[newIdx];
    stageMutation.mutate({ leadId: lead.id, stageId: targetStage.id });
    toast.success(`Moved to ${targetStage.name}`);
  }, [activePipeline?.stages, stageMutation]);

  const handleLongPress = useCallback((lead: Lead, rect: DOMRect, touchX: number, touchY: number) => {
    const offsetX = touchX - rect.left;
    const offsetY = touchY - rect.top;

    const initial: DragState = {
      lead,
      ghostX: rect.left,
      ghostY: rect.top,
      startX: touchX,
      startY: touchY,
      cardX: rect.left, cardY: rect.top,
      cardW: rect.width, cardH: rect.height,
      targetStageId: lead.stage_id,
    };
    mobileDragRef.current = initial;
    setMobileDrag(initial);
    setMobileDragTargetId(lead.stage_id);

    // RAF-based auto-scroll — runs every frame while drag is active
    let lastTouchX = touchX;
    let rafId: number | null = null;

    function scrollLoop() {
      const board = boardScrollRef.current;
      if (!board || !mobileDragRef.current) return;
      const br = board.getBoundingClientRect();
      const edgeZone = 72;
      if (lastTouchX < br.left + edgeZone) {
        const speed = Math.ceil(((br.left + edgeZone - lastTouchX) / edgeZone) * 14);
        board.scrollLeft -= speed;
      } else if (lastTouchX > br.right - edgeZone) {
        const speed = Math.ceil(((lastTouchX - (br.right - edgeZone)) / edgeZone) * 14);
        board.scrollLeft += speed;
      }
      rafId = requestAnimationFrame(scrollLoop);
    }
    rafId = requestAnimationFrame(scrollLoop);

    function onMove(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      lastTouchX = t.clientX;
      const ghostX = t.clientX - offsetX;
      const ghostY = t.clientY - offsetY;

      // If finger enters Move To zone (bottom 120px) → open sheet immediately
      const inMoveZone = t.clientY > window.innerHeight - 120;
      if (inMoveZone && mobileDragRef.current) {
        const draggedLead = mobileDragRef.current.lead;
        cleanup();
        setMoveLead(draggedLead);
        return;
      }

      // Detect which stage column is under the finger
      const ghostEl = document.getElementById('drag-ghost');
      if (ghostEl) ghostEl.style.display = 'none';
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (ghostEl) ghostEl.style.display = '';
      const col = el?.closest('[data-stage-id]');
      const targetStageId = col?.getAttribute('data-stage-id') ?? mobileDragRef.current?.targetStageId ?? null;

      const next = { ...mobileDragRef.current!, ghostX, ghostY, targetStageId };
      mobileDragRef.current = next;
      setMobileDrag(next);
      setMobileDragTargetId(targetStageId);
    }

    function cleanup() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      dragCleanupRef.current = null;
      mobileDragRef.current = null;
      setMobileDrag(null);
      setMobileDragTargetId(null);
    }

    function onEnd() {
      const state = mobileDragRef.current;
      cleanup();
      if (!state) return;
      if (state.targetStageId && state.targetStageId !== state.lead.stage_id) {
        // Find target stage name for toast
        const allStages = (activePipeline?.stages ?? []);
        const targetStage = allStages.find(s => s.id === state.targetStageId);
        stageMutation.mutate({ leadId: state.lead.id, stageId: state.targetStageId });
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
        toast.success(`Moved to ${targetStage?.name ?? 'stage'}`);
      }
      // If dropped on same stage or no target — silently cancel (card snaps back via state cleanup)
    }

    function onCancel() {
      cleanup();
    }

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
    dragCleanupRef.current = onEnd;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageMutation, activePipeline?.stages]);

  // Clean up listeners if component unmounts mid-drag
  useEffect(() => () => { dragCleanupRef.current?.(); }, []);

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  async function toggleSelectAll() {
    // If anything is selected → deselect all and stop
    if (selectedIds.size > 0) { setSelectedIds(new Set()); return; }

    const loadedIds  = (activePipeline?.leads ?? []).map(l => l.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalLeads = (pipelineDetail as any)?.totalLeads as number | undefined;

    // If the count is unknown or nothing is truncated, select what's loaded
    if (!totalLeads || totalLeads <= loadedIds.length) {
      setSelectedIds(new Set(loadedIds));
      return;
    }

    // More leads exist than are loaded — fetch ALL ids from the server
    setSelectingAll(true);
    try {
      const qs  = filterParams.toString();
      // cache: 'no-store' prevents Safari/CDN from serving a stale cached response.
      // _t param busts any edge-level cache that ignores Cache-Control.
      const url = `/api/v1/pipelines/${resolvedPipelineId}?${qs ? qs + '&' : ''}ids_only=1&_t=${Date.now()}`;
      const res  = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { success?: boolean; data?: { ids?: string[]; leads?: { id: string }[] } };
      let ids: string[];
      if (json.success && Array.isArray(json.data?.ids) && json.data!.ids!.length > 0) {
        // Fast-path: server returned just the IDs (new API)
        ids = json.data!.ids!;
      } else if (json.success && Array.isArray(json.data?.leads)) {
        // Fallback: server returned full pipeline (old API without ids_only support)
        ids = (json.data!.leads as { id: string }[]).map(l => l.id);
      } else {
        ids = loadedIds;
      }
      setSelectedIds(new Set(ids));
    } catch {
      setSelectedIds(new Set(loadedIds));
    } finally {
      setSelectingAll(false);
    }
  }

  async function bulkMoveStage(stageId: string) {
    await Promise.all(Array.from(selectedIds).map(leadId =>
      fetch(`/api/v1/leads/${leadId}/stage`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      })
    ));
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });
  }

  const toggleSelectAllInStage = useCallback((stageId: string, stageLeads: Lead[]) => {
    const allSelected = stageLeads.every(l => selectedIds.has(l.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      stageLeads.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id));
      return next;
    });
  }, [selectedIds]);

  async function bulkDelete() {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} lead(s)? This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map(leadId =>
          fetch(`/api/v1/leads/${leadId}`, { method: 'DELETE' }).then(r => r.json())
        )
      );

      const failed = results.filter(r => !r.success).length;
      const deleted = count - failed;

      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });

      if (deleted > 0 && failed === 0) {
        toast.success(`${deleted} lead${deleted > 1 ? 's' : ''} deleted successfully`);
      } else if (deleted > 0 && failed > 0) {
        toast.info(`${deleted} deleted, ${failed} could not be deleted (permission denied)`);
      } else {
        toast.error('Could not delete lead(s) — you may not have permission');
      }
    } finally {
      setIsDeleting(false);
    }
  }

  async function bulkAssign(userId: string, userName: string) {
    const count   = selectedIds.size;
    const leadIds = Array.from(selectedIds);

    // 1. Reassign each lead's owner_id so it appears in the assignee's pipeline view
    const results = await Promise.all(
      leadIds.map(leadId =>
        fetch(`/api/v1/leads/${leadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner_id: userId }),
        }).then(r => r.json())
      )
    );

    // 2. Also update the linked CrmContact's assigned_to_id so the contact view stays in sync
    // Collect crm_contact_ids from the pipeline data (available in activePipeline.leads)
    const allPipelineLeads = activePipeline?.leads ?? [];
    const contactIds = leadIds
      .map(id => allPipelineLeads.find(l => l.id === id)?.crm_contact_id)
      .filter(Boolean) as string[];
    const uniqueContactIds = Array.from(new Set(contactIds));
    uniqueContactIds.forEach(contactId => {
      fetch(`/api/v1/crm/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to_id: userId }),
      }).catch(() => {});
    });

    const failed = results.filter(r => !r.success).length;
    const done   = count - failed;
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });
    if (done > 0 && failed === 0) {
      toast.success(`${done} lead${done > 1 ? 's' : ''} assigned to ${userName}`);
    } else if (done > 0) {
      toast.info(`${done} assigned, ${failed} failed`);
    } else {
      toast.error('Could not assign leads');
    }
  }

  const allLeads = useMemo(() => {
    let result = activePipeline?.leads ?? [];
    if (search)           result = result.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search));
    if (fStatuses.length > 0) result = result.filter(l => fStatuses.includes(l.status));
    if (fSources.length > 0)  result = result.filter(l => fSources.includes(l.source ?? 'organic'));
    if (fDestination)         result = result.filter(l => (l.destination_interest ?? '').toLowerCase().includes(fDestination.toLowerCase()));
    if (sortBy === 'newest')      result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'oldest')      result = [...result].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (sortBy === 'name')        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'budget_asc')  result = [...result].sort((a, b) => (a.budget_range ?? '').localeCompare(b.budget_range ?? ''));
    if (sortBy === 'budget_desc') result = [...result].sort((a, b) => (b.budget_range ?? '').localeCompare(a.budget_range ?? ''));
    return result;
  }, [activePipeline?.leads, search, fStatuses, fSources, fDestination, sortBy]);

  const leadsForStage = useCallback((stageId: string) =>
    allLeads.filter(l => l.stage_id === stageId),
  [allLeads]);

  function clearAllFilters() {
    setFStatuses([]);
    setFSources([]);
    setFUserIds([]);
    setFDestination('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterOwner('');
    setSortBy('newest');
  }

  if (loadingPipelines) return <KanbanSkeleton />;

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-lg font-semibold" style={{ color: '#0F172A' }}>No pipelines yet</p>
        <Link href="/admin/pipelines/config" className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: T }}>
          Configure Pipelines
        </Link>
      </div>
    );
  }

  const hasDateFilter   = !!(filterDateFrom || filterDateTo);
  const hasOwnerFilter  = !!filterOwner;

  // Count active filter categories for badge
  const activeFilterCount = [
    fStatuses.length > 0,
    fSources.length > 0,
    fUserIds.length > 0,
    hasDateFilter,
    !!fDestination,
    sortBy !== 'newest',
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8">

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white px-4 lg:px-8 pt-4 pb-3 space-y-3"
        style={{ borderBottom: '1px solid #EDF0F4' }}>

        {/* Row 1: Pipeline tabs + CTA */}
        <div className="flex items-center gap-2 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Pipeline tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl flex-shrink-0" style={{ backgroundColor: '#F1F5F9' }}>
            {pipelines.map(p => (
              <button key={p.id} onClick={() => { setActivePipelineId(p.id); setSelectedIds(new Set()); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0"
                style={resolvedPipelineId === p.id
                  ? { backgroundColor: '#fff', color: T, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }
                  : { color: '#64748B' }}>
                {p.name}
                {p.is_default && <Star className="w-2.5 h-2.5 opacity-50" />}
              </button>
            ))}
          </div>

          <div className="flex-1 hidden lg:block" />

          {/* Lead count badge — hidden on mobile to save space */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold flex-shrink-0"
            style={{ backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
            <Users className="w-3.5 h-3.5" />
            {loadingDetail && allLeads.length === 0
              ? <span className="inline-block w-16 h-3 rounded animate-pulse" style={{ backgroundColor: '#E2E8F0' }} />
              : <>{allLeads.length}{(pipelineDetail as Pipeline & { totalLeads?: number })?.totalLeads && (pipelineDetail as Pipeline & { totalLeads?: number }).totalLeads! > allLeads.length ? ` of ${(pipelineDetail as Pipeline & { totalLeads?: number }).totalLeads}` : ''} leads</>
            }
          </div>

          {/* Select all — hidden on mobile */}
          <button onClick={toggleSelectAll} disabled={selectingAll}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors hover:bg-[#F8FAFC] flex-shrink-0 disabled:opacity-60 disabled:cursor-wait"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            {selectingAll ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Selecting…
              </>
            ) : selectedIds.size > 0 ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <><CheckSquare className="w-3.5 h-3.5" style={{ color: T }} />{selectedIds.size} of {(pipelineDetail as any)?.totalLeads ?? selectedIds.size} selected</>
            ) : (
              <><Square className="w-3.5 h-3.5" />Select All</>
            )}
          </button>

          {/* New Lead */}
          {resolvedPipelineId && (
            <button onClick={() => setShowAddLead(true)}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-xl text-[13px] font-bold text-white transition-opacity hover:opacity-90 flex-shrink-0"
              style={{ backgroundColor: T, boxShadow: `0 2px 8px ${T}44` }}>
              <Plus className="w-4 h-4" /> <span className="hidden xs:inline">New Lead</span><span className="xs:hidden">Add</span>
            </button>
          )}

          {/* Configure — hidden on mobile */}
          <Link href="/admin/pipelines/config"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors hover:bg-[#F8FAFC] flex-shrink-0"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Configure
          </Link>
        </div>

        {/* Row 2: Search + Quick User + Filters button + active chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#94A3B8' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="pl-9 pr-4 py-2 text-[13px] rounded-xl outline-none transition-shadow focus:ring-2"
              style={{ border: '1px solid #E2E8F0', width: 180, color: '#0F172A' }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              </button>
            )}
          </div>

          {/* Quick user select */}
          <div className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all flex-shrink-0"
            style={{
              border: `1px solid ${hasOwnerFilter ? T + '55' : '#E2E8F0'}`,
              backgroundColor: hasOwnerFilter ? T + '0c' : 'white',
              color: hasOwnerFilter ? T : '#64748B',
            }}>
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
              className="outline-none bg-transparent text-[12px] font-semibold cursor-pointer"
              style={{ color: hasOwnerFilter ? T : '#64748B' }}>
              <option value="">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Filters button with badge */}
          <button
            onClick={() => setShowFilterPanel(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all flex-shrink-0"
            style={{
              border: `1px solid ${activeFilterCount > 0 ? T + '55' : '#E2E8F0'}`,
              backgroundColor: activeFilterCount > 0 ? T + '0c' : 'white',
              color: activeFilterCount > 0 ? T : '#64748B',
            }}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-extrabold text-white"
                style={{ backgroundColor: T }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Active filter chips */}
          {fStatuses.length > 0 && fStatuses.map(s => (
            <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: STATUS_COLORS[s]?.bg ?? '#F8FAFC', color: STATUS_COLORS[s]?.text ?? '#64748B', border: '1px solid currentColor' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s]?.text }} />
              {s}
              <button onClick={() => setFStatuses(fStatuses.filter(x => x !== s))} className="ml-0.5 hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          {fSources.length > 0 && fSources.map(src => (
            <span key={src} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: SOURCE_COLORS[src]?.bg ?? '#F8FAFC', color: SOURCE_COLORS[src]?.text ?? '#64748B', border: '1px solid currentColor' }}>
              {src.replace('_', ' ')}
              <button onClick={() => setFSources(fSources.filter(x => x !== src))} className="ml-0.5 hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          {hasDateFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: '#F0FDF4', color: '#15803D', border: '1px solid currentColor' }}>
              <Calendar className="w-2.5 h-2.5" />
              {filterDateFrom && filterDateTo ? `${filterDateFrom} – ${filterDateTo}` : filterDateFrom || filterDateTo}
              <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }} className="ml-0.5 hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
          {fDestination && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: '#F0F9FF', color: '#0369A1', border: '1px solid currentColor' }}>
              <MapPin className="w-2.5 h-2.5" />
              {fDestination}
              <button onClick={() => setFDestination('')} className="ml-0.5 hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {/* Clear all */}
          {(activeFilterCount > 0 || hasOwnerFilter) && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg transition-colors hover:bg-[#FEF2F2] flex-shrink-0"
              style={{ color: '#EF4444' }}>
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <BulkActionBar
            count={selectedIds.size}
            stages={activePipeline?.stages ?? []}
            users={users}
            onMoveStage={bulkMoveStage}
            onAssign={bulkAssign}
            onDelete={bulkDelete}
            onClear={() => setSelectedIds(new Set())}
            isDeleting={isDeleting}
          />
        )}
      </div>

      {/* ── Kanban Board ────────────────────────────────────────────────── */}

      {/* Mobile column dots indicator — lg:hidden */}
      {(activePipeline?.stages ?? []).length > 0 && (
        <div className="lg:hidden flex items-center justify-center gap-1.5 py-2 flex-shrink-0"
          style={{ backgroundColor: '#F0F4F8' }}>
          {(activePipeline?.stages ?? []).map((stage, i) => (
            <button
              key={stage.id}
              onClick={() => {
                const el = boardScrollRef.current;
                if (!el) return;
                const colW = Math.max(240, el.offsetWidth - 40);
                el.scrollTo({ left: i * (colW + 16), behavior: 'smooth' });
              }}
              className="transition-all duration-200"
              style={{
                width: i === activeColumnIdx ? 18 : 7,
                height: 7,
                borderRadius: 99,
                backgroundColor: i === activeColumnIdx ? stage.color : '#CBD5E1',
              }}
            />
          ))}
        </div>
      )}

      {/* Mobile stage jump — dropdown to jump to any column */}
      {(activePipeline?.stages ?? []).length > 1 && (
        <div className="lg:hidden flex items-center gap-2 px-4 py-2 flex-shrink-0"
          style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #EDF0F4' }}>
          <span className="text-[11px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: '#94A3B8' }}>Jump to</span>
          <div className="flex-1 relative">
            <select
              value={activeColumnIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                const el = boardScrollRef.current;
                if (!el) return;
                const colW = Math.max(240, el.offsetWidth - 40);
                el.scrollTo({ left: idx * (colW + 16), behavior: 'smooth' });
              }}
              className="w-full text-[13px] font-semibold rounded-xl px-3 py-2 outline-none appearance-none cursor-pointer"
              style={{ border: '1px solid #E2E8F0', color: '#0F172A', backgroundColor: '#fff' }}
            >
              {(activePipeline?.stages ?? []).map((stage, i) => (
                <option key={stage.id} value={i}>
                  {stage.name} ({apiStageCounts[stage.id] ?? leadsForStage(stage.id).length})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#94A3B8' }} />
          </div>
        </div>
      )}

      {/* scrollbar-gutter:stable reserves scrollbar space so it never overlaps columns */}
      <div ref={boardScrollRef} className="kanban-board flex-1 overflow-x-auto overflow-y-hidden"
        style={{ background: 'linear-gradient(160deg, #F0F4F8 0%, #EDF1F5 100%)', scrollbarGutter: 'stable',
          overscrollBehaviorX: 'none', scrollSnapType: 'x mandatory' }}>
        <div className="flex gap-4 h-full min-w-max items-start" style={{ padding: '20px 16px 0 16px' }}>
          {(activePipeline?.stages ?? []).map((stage, stageIdx) => {
            const stages     = activePipeline?.stages ?? [];
            const stageLeads = leadsForStage(stage.id);
            return (
              <KanbanColumn
                key={stage.id} stage={stage}
                leads={stageLeads}
                trueCount={apiStageCounts[stage.id]}
                loading={loadingDetail}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onLeadClick={setSelectedLead}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAllInStage={() => toggleSelectAllInStage(stage.id, stageLeads)}
                onPrefetch={prefetchLead}
                onLongPress={handleLongPress}
                onMoveTap={handleMoveTap}
                onCall={handleCall}
                onWhatsAppChat={handleWhatsAppChat}
                draggingLeadId={mobileDrag?.lead.id ?? null}
                isDragTarget={mobileDragTargetId === stage.id}
                onSwipeStage={handleSwipeStage}
                prevStage={stageIdx > 0 ? stages[stageIdx - 1] : null}
                nextStage={stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null}
              />
            );
          })}
          {(activePipeline?.stages ?? []).length === 0 && (
            <div className="flex items-center justify-center w-full">
              <p className="text-sm" style={{ color: '#94A3B8' }}>No stages configured.{' '}
                <Link href="/admin/pipelines/config" style={{ color: T }}>Configure pipeline →</Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Move-To bottom sheet (mobile long-press) */}
      {moveLead && (
        <MoveToSheet
          lead={moveLead}
          stages={activePipeline?.stages ?? []}
          stageCounts={Object.keys(apiStageCounts).length > 0 ? apiStageCounts : Object.fromEntries((activePipeline?.stages ?? []).map(s => [s.id, leadsForStage(s.id).length]))}
          onMove={(stageId) => {
            stageMutation.mutate({ leadId: moveLead.id, stageId });
            setMoveLead(null);
          }}
          onClose={() => setMoveLead(null)}
        />
      )}

      {showAddLead && resolvedPipelineId && (
        <AddLeadDrawer
          pipelineId={resolvedPipelineId}
          users={users}
          onClose={() => setShowAddLead(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })}
        />
      )}
      {/* Global call banner — persists even when drawer is closed */}
      {callState?.active && (
        <CallBanner
          leadName={callState.leadName}
          phone={callState.phone}
          initialElapsed={callState.elapsed}
          onEndCall={(elapsed) => { setCallPopupState({ leadId: callState.leadId, leadName: callState.leadName, elapsed, outcome: 'ANSWERED' }); setCallState(null); }}
          onNotAnswered={() => { setCallPopupState({ leadId: callState.leadId, leadName: callState.leadName, elapsed: 0, outcome: 'NO_ANSWER' }); setCallState(null); }}
        />
      )}

      {/* Global call log popup — shown after banner ends, even if drawer is closed */}
      {callPopupState && (
        <CallLogPopup
          leadId={callPopupState.leadId}
          leadName={callPopupState.leadName}
          initialElapsed={callPopupState.elapsed}
          initialOutcome={callPopupState.outcome}
          onClose={() => setCallPopupState(null)}
          onSaved={() => {
            setCallPopupState(null);
            qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });
          }}
        />
      )}

      {selectedLead && (
        <LeadDrawer
          leadId={selectedLead.id}
          stages={activePipeline?.stages ?? []}
          users={users.map(u => ({ id: u.id, name: u.name }))}
          onClose={() => setSelectedLead(null)}
          onUpdated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })}
          callState={callState}
          setCallState={setCallState}
        />
      )}

      {/* Mobile drag ghost + Move To button */}
      {mobileDrag && (() => {
        const cardStageColor = mobileDrag.lead.stage?.color ?? T;
        const nearMoveZone = mobileDrag.ghostY + mobileDrag.cardH > window.innerHeight - 120;
        return (
          <>
            {/* Dim overlay */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 9990, backgroundColor: 'rgba(0,0,0,0.35)', pointerEvents: 'none' }} />

            {/* Ghost card */}
            <div
              id="drag-ghost"
              style={{
                position: 'fixed',
                left: mobileDrag.ghostX,
                top: mobileDrag.ghostY,
                width: mobileDrag.cardW,
                pointerEvents: 'none',
                zIndex: 9999,
                transform: `rotate(2deg) scale(${nearMoveZone ? 0.92 : 1.03})`,
                opacity: nearMoveZone ? 0.7 : 0.95,
                filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.4))',
                borderRadius: 14,
                transition: 'transform 0.15s, opacity 0.15s',
              }}
            >
              <div style={{
                backgroundColor: '#fff',
                border: `3px solid ${cardStageColor}`,
                borderRadius: 14,
                borderLeft: `5px solid ${cardStageColor}`,
                padding: '13px 13px 11px',
              }}>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: cardStageColor }}>
                    {mobileDrag.lead.name.trim()[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#0F172A' }}>{mobileDrag.lead.name}</p>
                    <p className="text-[11px]" style={{ color: '#94A3B8' }}>{mobileDrag.lead.phone}</p>
                  </div>
                </div>
                {mobileDrag.lead.destination_interest && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="w-2.5 h-2.5" style={{ color: '#0369A1' }} />
                    <span className="text-[11px] font-medium" style={{ color: '#0369A1' }}>{mobileDrag.lead.destination_interest}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Move To target zone at bottom */}
            <div style={{
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              zIndex: 9995,
              pointerEvents: 'none',
              paddingBottom: 28,
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 60,
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                backgroundColor: nearMoveZone ? T : 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(12px)',
                borderRadius: 18,
                paddingTop: 16,
                paddingBottom: 16,
                paddingLeft: 24,
                paddingRight: 24,
                border: nearMoveZone ? `2px solid ${T}` : '2px solid rgba(255,255,255,0.18)',
                boxShadow: nearMoveZone ? `0 0 0 4px ${T}44, 0 8px 32px rgba(0,0,0,0.4)` : '0 4px 20px rgba(0,0,0,0.3)',
                transform: nearMoveZone ? 'scale(1.04)' : 'scale(1)',
                transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <ArrowRightLeft className="w-4 h-4 flex-shrink-0" style={{ color: '#fff' }} />
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  Move To
                </span>
              </div>
            </div>
          </>
        );
      })()}

      {/* MoveToSheet triggered when ghost is released over Move To zone */}

      {/* Gallabox conversation drawer */}
      {waPanel && (
        <GallaboxDrawer
          phone={waPanel.phone}
          name={waPanel.name}
          channelId={gallaboxChannelId}
          onClose={() => setWaPanel(null)}
        />
      )}

      {/* Filter panel (slide-in from right) */}
      <FilterPanel
        open={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        sortBy={sortBy}
        setSortBy={setSortBy}
        fStatuses={fStatuses}
        setFStatuses={setFStatuses}
        fSources={fSources}
        setFSources={setFSources}
        fUserMode={fUserMode}
        setFUserMode={setFUserMode}
        fUserIds={fUserIds}
        setFUserIds={setFUserIds}
        fDestination={fDestination}
        setFDestination={setFDestination}
        filterDateFrom={filterDateFrom}
        setFilterDateFrom={setFilterDateFrom}
        filterDateTo={filterDateTo}
        setFilterDateTo={setFilterDateTo}
        users={users}
        onClearAll={clearAllFilters}
      />
    </div>
  );
}
