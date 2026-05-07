'use client';
import { useState, useRef, useCallback, useMemo, memo } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelines, usePipeline, useUsers, useLeadStageMutation, usePrefetchLead, QK } from '@/lib/query-hooks';
import {
  Plus, Search, Phone, ChevronDown, X, Filter, ArrowUpDown, Trash2,
  MoveRight, CheckSquare, Square, Calendar, Users, MapPin, Wallet,
  MessageCircle, SlidersHorizontal, Star, Clock, FileText, PhoneCall, GripVertical,
  CheckCircle2, Eye,
} from 'lucide-react';
import Link from 'next/link';
import { Stage, Lead, Pipeline, STATUS_COLORS, formatDateTime } from './types';
import { KanbanSkeleton } from '@/components/Skeleton';

const LeadDrawer    = dynamic(() => import('./LeadDrawer'),    { ssr: false });
const AddLeadDrawer = dynamic(() => import('./AddLeadDrawer'), { ssr: false });

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

// ─── Lead Card ───────────────────────────────────────────────────────────────

const LeadCard = memo(function LeadCard({
  lead, stageColor, onDragStart, onClick, selected, onToggleSelect, onPrefetch,
  onGripTouchInit,
}: {
  lead: Lead; stageColor: string;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onClick: (lead: Lead) => void;
  selected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onPrefetch: (leadId: string) => void;
  onGripTouchInit: (leadId: string, name: string, startX: number, startY: number) => void;
}) {
  const callCount  = lead._count?.call_logs ?? 0;
  const noteCount  = lead._count?.lead_notes ?? 0;
  const isNew      = callCount + noteCount === 0;
  const topQuote   = lead.quotes?.[0];
  const quoteViewed   = topQuote && (topQuote.status === 'PUBLISHED' || topQuote.status === 'VIEWED') && topQuote.events.some(e => e.event_type === 'quote_viewed');
  const quoteApproved = topQuote?.status === 'APPROVED' || topQuote?.status === 'ACCEPTED';

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onMouseEnter={() => onPrefetch(lead.id)}
      onClick={() => onClick(lead)}
      className="group relative cursor-pointer select-none transition-all duration-150"
      style={{
        backgroundColor: selected ? '#EFF8FF' : '#fff',
        border: selected ? `1.5px solid ${T}` : '1px solid #E8EDF2',
        borderRadius: 14,
        boxShadow: selected
          ? `0 0 0 3px ${T}18, 0 2px 8px rgba(0,0,0,0.06)`
          : '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
        borderLeft: `3px solid ${stageColor}`,
        padding: '13px 13px 11px',
      }}
    >
      {/* Grip handle — mobile only. Touchstart here kicks off native drag tracking in the page. */}
      <div
        onTouchStart={e => {
          e.stopPropagation();
          const t = e.touches[0];
          onGripTouchInit(lead.id, lead.name, t.clientX, t.clientY);
        }}
        onClick={e => e.stopPropagation()}
        className="absolute top-0 bottom-0 left-0 flex items-center justify-center md:hidden"
        style={{ width: 28, borderRadius: '14px 0 0 14px', cursor: 'grab', zIndex: 10, touchAction: 'none' }}
        title="Drag to move"
      >
        <GripVertical className="w-3.5 h-3.5" style={{ color: stageColor, opacity: 0.7 }} />
      </div>

      {/* Checkbox overlay — shows on hover or when selected */}
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
      <div className="flex items-start gap-2.5 mb-2.5 pr-6 md:pl-0 pl-5">
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
            <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F0FDF4]" title="Call">
              <Phone className="w-3 h-3" style={{ color: '#16A34A' }} />
            </a>
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
  onGripTouchInit, touchOver,
}: {
  stage: Stage; leads: Lead[];
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDrop: (stageId: string) => void;
  onLeadClick: (lead: Lead) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onSelectAllInStage: (stageId: string, leads: Lead[]) => void;
  onPrefetch: (leadId: string) => void;
  onGripTouchInit: (leadId: string, name: string, startX: number, startY: number) => void;
  touchOver: boolean;
}) {
  const PAGE_SIZE   = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [over, setOver] = useState(false);
  const isOver = over || touchOver;
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
            onGripTouchInit={onGripTouchInit} />
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
  const [touchDrag, setTouchDrag] = useState<{ leadId: string; name: string; x: number; y: number; overStageId: string | null } | null>(null);
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

  // Native touch drag — registered on document so { passive: false } works,
  // allowing e.preventDefault() to actually block scroll while dragging.
  const handleGripTouchInit = useCallback((leadId: string, name: string, startX: number, startY: number) => {
    let decided  = false;
    let dragging = false;

    function getStageAt(x: number, y: number) {
      const el = document.elementFromPoint(x, y);
      return el?.closest('[data-stage-id]')?.getAttribute('data-stage-id') ?? null;
    }

    function onMove(e: TouchEvent) {
      const t = e.touches[0];

      if (!decided) {
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (dx < 8 && dy < 8) return; // not enough movement yet
        decided = true;

        if (dx > dy * 1.2) {
          // Horizontal swipe — let board scroll, abort drag
          cleanup();
          return;
        }

        dragging = true;
        if (navigator.vibrate) navigator.vibrate(30);
        setTouchDrag({ leadId, name, x: t.clientX, y: t.clientY, overStageId: null });
      }

      if (!dragging) return;
      e.preventDefault(); // works because listener is { passive: false }

      const overStageId = getStageAt(t.clientX, t.clientY);
      setTouchDrag({ leadId, name, x: t.clientX, y: t.clientY, overStageId });
    }

    function onEnd(e: TouchEvent) {
      if (dragging) {
        const t = e.changedTouches[0];
        const stageId = getStageAt(t.clientX, t.clientY);
        if (stageId) stageMutation.mutate({ leadId, stageId });
      }
      cleanup();
    }

    function cleanup() {
      dragging = false;
      setTouchDrag(null);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onEnd);
    }

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onEnd,  { passive: false });
  }, [stageMutation]);

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
      <div className="flex-1 overflow-x-auto overflow-y-hidden"
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
                onGripTouchInit={handleGripTouchInit}
                touchOver={touchDrag?.overStageId === stage.id}
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

      {/* Touch drag ghost */}
      {touchDrag && (() => {
        const overStage = touchDrag.overStageId
          ? activePipeline?.stages.find(s => s.id === touchDrag.overStageId)
          : null;
        return (
          <div
            className="fixed z-50 pointer-events-none select-none"
            style={{
              left: touchDrag.x - 140,
              top: touchDrag.y - 36,
              transform: 'rotate(1.5deg) scale(1.05)',
              transition: 'transform 0.1s',
            }}
          >
            <div className="rounded-2xl shadow-2xl overflow-hidden"
              style={{ width: 240, border: `2px solid ${overStage?.color ?? T}`, opacity: 0.96 }}>
              <div className="px-3 py-2.5"
                style={{ backgroundColor: overStage?.color ?? T, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                <p className="text-[11px] font-bold text-white opacity-80 uppercase tracking-wider">
                  {overStage ? `→ ${overStage.name}` : 'Moving…'}
                </p>
              </div>
              <div className="px-3 py-2.5 bg-white">
                <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{touchDrag.name}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {showAddLead && resolvedPipelineId && (
        <AddLeadDrawer
          pipelineId={resolvedPipelineId}
          onClose={() => setShowAddLead(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })}
        />
      )}
      {selectedLead && (
        <LeadDrawer
          leadId={selectedLead.id}
          stages={activePipeline?.stages ?? []}
          onClose={() => setSelectedLead(null)}
          onUpdated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })}
        />
      )}
    </div>
  );
}
