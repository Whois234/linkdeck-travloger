'use client';
import { useState, useRef, useCallback, useMemo, memo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelines, usePipeline, useUsers, useLeadStageMutation, usePrefetchLead, QK } from '@/lib/query-hooks';
import {
  Plus, Search, Phone, ChevronDown, X, Filter, ArrowUpDown, Trash2,
  MoveRight, CheckSquare, Square, Calendar, Users, MapPin, Wallet,
  MessageCircle, SlidersHorizontal, Star, Clock, FileText, PhoneCall,
  CheckCircle2, Eye, ArrowRightLeft,
} from 'lucide-react';
import Link from 'next/link';
import { Stage, Lead, Pipeline, STATUS_COLORS, formatDateTime } from './types';
import type { CallState } from './LeadDrawer';
import { KanbanSkeleton } from '@/components/Skeleton';

const LeadDrawer      = dynamic(() => import('./LeadDrawer'),    { ssr: false });
const AddLeadDrawer   = dynamic(() => import('./AddLeadDrawer'), { ssr: false });
const CallBanner      = dynamic(() => import('./LeadDrawer').then(m => ({ default: m.CallBanner })),      { ssr: false });
const CallLogPopup    = dynamic(() => import('./LeadDrawer').then(m => ({ default: m.CallLogPopup })),    { ssr: false });

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
  onLongPress, onMoveTap, onCall, isDragging,
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
  isDragging: boolean;
}) {
  const callCount  = lead._count?.call_logs ?? 0;
  const noteCount  = lead._count?.lead_notes ?? 0;
  const isNew      = callCount + noteCount === 0;
  const topQuote   = lead.quotes?.[0];
  const quoteViewed   = topQuote && (topQuote.status === 'PUBLISHED' || topQuote.status === 'VIEWED') && topQuote.events.some(e => e.event_type === 'quote_viewed');
  const quoteApproved = topQuote?.status === 'APPROVED' || topQuote?.status === 'ACCEPTED';

  const cardRef        = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress   = useRef(false);
  const touchMoved     = useRef(false);
  const startTouchRef  = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startTouchRef.current = { x: t.clientX, y: t.clientY };
    touchMoved.current   = false;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      if (touchMoved.current) return;
      didLongPress.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      const rect = cardRef.current?.getBoundingClientRect() ?? new DOMRect();
      const st = startTouchRef.current ?? { x: rect.left, y: rect.top };
      onLongPress(lead, rect, st.x, st.y);
    }, 400);
  }

  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    const st = startTouchRef.current;
    if (st) {
      const dx = Math.abs(t.clientX - st.x);
      const dy = Math.abs(t.clientY - st.y);
      if (dx > 6 || dy > 6) {
        touchMoved.current = true;
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      }
    }
  }

  function onTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  return (
    <div
      ref={cardRef}
      data-lead-id={lead.id}
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onMouseEnter={() => onPrefetch(lead.id)}
      onClick={() => { if (!didLongPress.current) onClick(lead); }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="group relative cursor-pointer select-none transition-all duration-150"
      style={{
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
            <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F0FDF4]" title="WhatsApp">
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
  stage, leads, onDragStart, onDrop, onLeadClick, selectedIds, onToggleSelect, onSelectAllInStage, onPrefetch,
  onLongPress, onMoveTap, onCall, draggingLeadId,
}: {
  stage: Stage; leads: Lead[];
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
  draggingLeadId: string | null;
}) {
  const PAGE_SIZE   = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [over, setOver] = useState(false);
  const isOver = over;
  const allSelected  = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  const visibleLeads = leads.slice(0, visibleCount);
  const hidden       = leads.length - visibleCount;

  return (
    <div
      data-stage-id={stage.id}
      className="flex flex-col flex-shrink-0 rounded-2xl overflow-hidden"
      style={{
        width: 284,
        backgroundColor: '#F6F8FA',
        border: `1px solid ${isOver ? stage.color + '88' : '#E2E8F0'}`,
        boxShadow: isOver ? `0 0 0 3px ${stage.color}33, 0 4px 16px ${stage.color}22` : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id); }}
    >
      {/* Column Header */}
      <div className="px-4 pt-3.5 pb-3 flex items-center justify-between"
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
          {leads.length}
        </div>
      </div>

      {/* Cards */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-2.5 transition-colors"
        style={{ minHeight: 100, maxHeight: 'calc(100vh - 230px)', backgroundColor: isOver ? `${stage.color}08` : undefined, transition: 'background-color 0.15s' }}>
        {visibleLeads.map(lead => (
          <LeadCard key={lead.id} lead={lead} stageColor={stage.color}
            onDragStart={onDragStart} onClick={onLeadClick}
            selected={selectedIds.has(lead.id)} onToggleSelect={onToggleSelect}
            onPrefetch={onPrefetch}
            onLongPress={onLongPress} onMoveTap={onMoveTap} onCall={onCall}
            isDragging={draggingLeadId === lead.id} />
        ))}

        {hidden > 0 && (
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="w-full py-2.5 rounded-xl text-[12px] font-bold transition-colors hover:bg-white"
            style={{ color: stage.color, border: `1.5px dashed ${stage.color}55`, backgroundColor: `${stage.color}08` }}>
            Show {Math.min(hidden, PAGE_SIZE)} more
          </button>
        )}

        {leads.length === 0 && (
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

function BulkActionBar({ count, stages, onMoveStage, onDelete, onClear }: {
  count: number; stages: Stage[];
  onMoveStage: (stageId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [showStageMenu, setShowStageMenu] = useState(false);
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg"
      style={{ backgroundColor: '#0C1B29', color: 'white', border: '1px solid #1e3347' }}>
      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#7DD3C022' }}>
        <CheckSquare className="w-3.5 h-3.5" style={{ color: '#7DD3C0' }} />
      </div>
      <span className="text-[13px] font-bold" style={{ color: '#7DD3C0' }}>{count} selected</span>
      <div className="w-px h-4 mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />

      <div className="relative">
        <button onClick={() => setShowStageMenu(p => !p)}
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

      <button onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors hover:bg-white/10"
        style={{ color: '#FCA5A5' }}>
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>

      <div className="flex-1" />
      <button onClick={onClear} className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.4)' }}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Filter Pill ─────────────────────────────────────────────────────────────

function FilterPill({ icon: Icon, label, active, onClick }: {
  icon: React.ElementType; label: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all"
      style={{
        border: `1px solid ${active ? T + '55' : '#E2E8F0'}`,
        backgroundColor: active ? T + '0c' : 'white',
        color: active ? T : '#64748B',
        boxShadow: active ? `0 0 0 1px ${T}22` : undefined,
      }}>
      <Icon className="w-3.5 h-3.5" />
      {label}
      <ChevronDown className="w-3 h-3 opacity-50" />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface CrmUser { id: string; name: string; role: string }

export default function PipelinesPage() {
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [search, setSearch]                     = useState('');
  const [sortBy, setSortBy]                     = useState<'newest' | 'oldest' | 'name'>('newest');
  const [filterStatus, setFilterStatus]         = useState<string>('');
  const [showFilters, setShowFilters]           = useState(false);
  const [showAddLead, setShowAddLead]           = useState(false);
  const [selectedLead, setSelectedLead]         = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set());
  const [filterOwner, setFilterOwner]           = useState<string>('');
  const [filterDateFrom, setFilterDateFrom]     = useState('');
  const [filterDateTo, setFilterDateTo]         = useState('');
  const [showDateFilter, setShowDateFilter]     = useState(false);
  const [showSortMenu, setShowSortMenu]         = useState(false);
  const draggingLeadId = useRef<string | null>(null);
  const [moveLead, setMoveLead] = useState<Lead | null>(null);
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
  const mobileDragRef = useRef<DragState | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<((e?: TouchEvent) => void) | null>(null);

  const qc = useQueryClient();

  const { data: pipelinesData, isLoading: loadingPipelines } = usePipelines();
  const rawPipelines = (pipelinesData as Pipeline[] | undefined) ?? [];

  const resolvedPipelineId = activePipelineId ||
    (rawPipelines.find(p => p.is_default)?.id ?? rawPipelines[0]?.id ?? '');

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filterOwner)    p.set('owner_id',  filterOwner);
    if (filterDateFrom) p.set('date_from', filterDateFrom);
    if (filterDateTo)   p.set('date_to',   filterDateTo);
    return p;
  }, [filterOwner, filterDateFrom, filterDateTo]);

  const { data: pipelineDetail } = usePipeline(resolvedPipelineId, filterParams);
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

  const handleLongPress = useCallback((lead: Lead, rect: DOMRect, touchX: number, touchY: number) => {
    // Offset within card where finger is resting
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

    function onMove(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      const ghostX = t.clientX - offsetX;
      const ghostY = t.clientY - offsetY;

      // Auto-scroll the board horizontally when near edges
      const board = boardScrollRef.current;
      if (board) {
        const br = board.getBoundingClientRect();
        const edgeZone = 80;
        if (t.clientX < br.left + edgeZone) board.scrollLeft -= 8;
        else if (t.clientX > br.right - edgeZone) board.scrollLeft += 8;
      }

      // Detect which stage is under the ghost centre
      const midX = t.clientX;
      const midY = t.clientY;
      // Temporarily hide ghost for hit test
      const ghostEl = document.getElementById('drag-ghost');
      if (ghostEl) ghostEl.style.display = 'none';
      const el = document.elementFromPoint(midX, midY);
      if (ghostEl) ghostEl.style.display = '';
      const col = el?.closest('[data-stage-id]');
      const targetStageId = col?.getAttribute('data-stage-id') ?? mobileDragRef.current?.targetStageId ?? null;

      // Keep targetStageId for column-drop fallback, but don't override if near move zone
      const next = { ...mobileDragRef.current!, ghostX, ghostY, targetStageId };
      mobileDragRef.current = next;
      setMobileDrag(next);
    }

    function onEnd(e?: TouchEvent) {
      const state = mobileDragRef.current;
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      dragCleanupRef.current = null;
      mobileDragRef.current = null;
      setMobileDrag(null);

      if (!state) return;

      // If finger lifted in the Move To zone (bottom 130px) → open MoveToSheet
      const touch = e?.changedTouches[0];
      const nearMoveZone = touch && (touch.clientY + (state.cardH / 2) > window.innerHeight - 130);
      if (nearMoveZone) {
        setMoveLead(state.lead);
        return;
      }

      // Otherwise commit if hovering a different stage column
      if (state.targetStageId && state.targetStageId !== state.lead.stage_id) {
        stageMutation.mutate({ leadId: state.lead.id, stageId: state.targetStageId });
      }
    }

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    dragCleanupRef.current = onEnd;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageMutation]);

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

  function toggleSelectAll() {
    const allIds = (activePipeline?.leads ?? []).map(l => l.id);
    setSelectedIds(selectedIds.size === allIds.length ? new Set() : new Set(allIds));
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
    if (!confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    await Promise.all(Array.from(selectedIds).map(leadId =>
      fetch(`/api/v1/leads/${leadId}`, { method: 'DELETE' })
    ));
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });
  }

  const allLeads = useMemo(() => {
    let result = activePipeline?.leads ?? [];
    if (search)       result = result.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search));
    if (filterStatus) result = result.filter(l => l.status === filterStatus);
    if (sortBy === 'newest') result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'oldest') result = [...result].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (sortBy === 'name')   result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [activePipeline?.leads, search, filterStatus, sortBy]);

  const leadsForStage = useCallback((stageId: string) =>
    allLeads.filter(l => l.stage_id === stageId),
  [allLeads]);

  const SORT_LABELS: Record<string, string> = { newest: 'Newest first', oldest: 'Oldest first', name: 'Name A–Z' };

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

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8">

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white px-5 lg:px-8 pt-4 pb-3 space-y-3"
        style={{ borderBottom: '1px solid #EDF0F4' }}>

        {/* Row 1: Pipeline tabs + CTA */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Pipeline tabs */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl" style={{ backgroundColor: '#F1F5F9' }}>
            {pipelines.map(p => (
              <button key={p.id} onClick={() => { setActivePipelineId(p.id); setSelectedIds(new Set()); }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0"
                style={resolvedPipelineId === p.id
                  ? { backgroundColor: '#fff', color: T, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }
                  : { color: '#64748B' }}>
                {p.name}
                {p.is_default && <Star className="w-2.5 h-2.5 opacity-50" />}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Lead count badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold"
            style={{ backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
            <Users className="w-3.5 h-3.5" />
            {allLeads.length} leads
          </div>

          {/* Select all */}
          <button onClick={toggleSelectAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            {selectedIds.size > 0 && selectedIds.size === (activePipeline?.leads ?? []).length
              ? <CheckSquare className="w-3.5 h-3.5" style={{ color: T }} />
              : <Square className="w-3.5 h-3.5" />}
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select All'}
          </button>

          {/* New Lead */}
          {resolvedPipelineId && (
            <button onClick={() => setShowAddLead(true)}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-[13px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: T, boxShadow: `0 2px 8px ${T}44` }}>
              <Plus className="w-4 h-4" /> New Lead
            </button>
          )}

          {/* Configure */}
          <Link href="/admin/pipelines/config"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Configure
          </Link>
        </div>

        {/* Row 2: Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#94A3B8' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="pl-9 pr-4 py-2 text-[13px] rounded-xl outline-none transition-shadow focus:ring-2"
              style={{ border: '1px solid #E2E8F0', width: 210, color: '#0F172A' }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="relative">
            <FilterPill icon={Filter} label={filterStatus || 'Status'} active={!!filterStatus} onClick={() => setShowFilters(p => !p)} />
            {showFilters && (
              <div className="absolute top-11 left-0 bg-white rounded-2xl shadow-2xl z-20 overflow-hidden min-w-[170px] py-1.5"
                style={{ border: '1px solid #E2E8F0' }}>
                <button onClick={() => { setFilterStatus(''); setShowFilters(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium hover:bg-[#F8FAFC] transition-colors"
                  style={{ color: !filterStatus ? T : '#64748B' }}>
                  All Statuses
                </button>
                {Object.keys(STATUS_COLORS).map(s => (
                  <button key={s} onClick={() => { setFilterStatus(s); setShowFilters(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium hover:bg-[#F8FAFC] transition-colors text-left"
                    style={{ color: filterStatus === s ? T : '#64748B' }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[s]?.text ?? '#94A3B8' }} />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Owner filter */}
          <div className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all"
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

          {/* Date filter */}
          <div className="relative">
            <FilterPill icon={Calendar} label="Date" active={hasDateFilter} onClick={() => setShowDateFilter(p => !p)} />
            {showDateFilter && (
              <div className="absolute top-11 left-0 bg-white rounded-2xl shadow-2xl z-20 p-4 space-y-3 min-w-[230px]"
                style={{ border: '1px solid #E2E8F0' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Date Range</p>
                {[['From', filterDateFrom, setFilterDateFrom], ['To', filterDateTo, setFilterDateTo]].map(([lbl, val, setter]) => (
                  <div key={lbl as string}>
                    <label className="text-[11px] font-semibold" style={{ color: '#64748B' }}>{lbl as string}</label>
                    <input type="date" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                      className="w-full text-[13px] rounded-xl px-3 py-2 mt-1 outline-none"
                      style={{ border: '1px solid #E2E8F0', color: '#0F172A' }} />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setShowDateFilter(false); }}
                    className="flex-1 py-2 rounded-xl text-[12px] font-semibold transition-colors hover:bg-[#F8FAFC]"
                    style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Clear</button>
                  <button onClick={() => setShowDateFilter(false)}
                    className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white"
                    style={{ backgroundColor: T }}>Apply</button>
                </div>
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <FilterPill icon={ArrowUpDown} label={SORT_LABELS[sortBy]} active={sortBy !== 'newest'} onClick={() => setShowSortMenu(p => !p)} />
            {showSortMenu && (
              <div className="absolute top-11 right-0 bg-white rounded-2xl shadow-2xl z-20 overflow-hidden min-w-[160px] py-1.5"
                style={{ border: '1px solid #E2E8F0' }}>
                {(['newest', 'oldest', 'name'] as const).map(opt => (
                  <button key={opt} onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-medium hover:bg-[#F8FAFC] transition-colors text-left"
                    style={{ color: sortBy === opt ? T : '#64748B' }}>
                    {SORT_LABELS[opt]}
                    {sortBy === opt && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: T }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear all filters */}
          {(filterStatus || hasOwnerFilter || hasDateFilter) && (
            <button
              onClick={() => { setFilterStatus(''); setFilterOwner(''); setFilterDateFrom(''); setFilterDateTo(''); }}
              className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg transition-colors hover:bg-[#FEF2F2]"
              style={{ color: '#EF4444' }}>
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <BulkActionBar
            count={selectedIds.size}
            stages={activePipeline?.stages ?? []}
            onMoveStage={bulkMoveStage}
            onDelete={bulkDelete}
            onClear={() => setSelectedIds(new Set())}
          />
        )}
      </div>

      {/* ── Kanban Board ────────────────────────────────────────────────── */}
      <div ref={boardScrollRef} className="flex-1 overflow-x-auto overflow-y-hidden"
        style={{ background: 'linear-gradient(160deg, #F0F4F8 0%, #EDF1F5 100%)' }}>
        <div className="flex gap-4 h-full p-5 lg:p-8 min-w-max items-start">
          {(activePipeline?.stages ?? []).map(stage => {
            const stageLeads = leadsForStage(stage.id);
            return (
              <KanbanColumn
                key={stage.id} stage={stage}
                leads={stageLeads}
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
                draggingLeadId={mobileDrag?.lead.id ?? null}
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
          stageCounts={Object.fromEntries((activePipeline?.stages ?? []).map(s => [s.id, leadsForStage(s.id).length]))}
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
          onClose={() => setSelectedLead(null)}
          onUpdated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })}
          callState={callState}
          setCallState={setCallState}
        />
      )}

      {/* Mobile drag ghost + Move To button */}
      {mobileDrag && (() => {
        const cardStageColor = mobileDrag.lead.stage?.color ?? T;
        // Detect if ghost is hovering over the Move To zone (bottom 130px of screen)
        const nearMoveZone = mobileDrag.ghostY + mobileDrag.cardH > window.innerHeight - 130;
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
                  {nearMoveZone ? 'Release to choose stage' : 'Move To'}
                </span>
              </div>
            </div>
          </>
        );
      })()}

      {/* MoveToSheet triggered when ghost is released over Move To zone */}
    </div>
  );
}
