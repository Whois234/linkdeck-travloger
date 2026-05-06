'use client';
import { useState, useRef, useCallback, useMemo, memo } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelines, usePipeline, useUsers, useLeadStageMutation, usePrefetchLead, QK } from '@/lib/query-hooks';
import {
  Plus, Search, Phone, MessageCircle, ChevronDown, X, User,
  Filter, ArrowUpDown, Trash2, MoveRight, CheckSquare, Square,
  Calendar, Users,
} from 'lucide-react';
import Link from 'next/link';
import { Stage, Lead, Pipeline, STATUS_COLORS, timeAgo } from './types';
import { KanbanSkeleton } from '@/components/Skeleton';

const LeadDrawer   = dynamic(() => import('./LeadDrawer'),   { ssr: false });
const AddLeadDrawer = dynamic(() => import('./AddLeadDrawer'), { ssr: false });


// ─── Lead Card ───────────────────────────────────────────────────────────────

const LeadCard = memo(function LeadCard({
  lead, stageColor, onDragStart, onClick, selected, onToggleSelect, onPrefetch,
}: {
  lead: Lead; stageColor: string;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onClick: (lead: Lead) => void;
  selected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onPrefetch: (leadId: string) => void;
}) {
  const isUntouched = (lead._count?.call_logs ?? 0) + (lead._count?.lead_notes ?? 0) === 0;
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onMouseEnter={() => onPrefetch(lead.id)}
      onClick={() => onClick(lead)}
      className="bg-white rounded-xl p-4 cursor-pointer transition-shadow hover:shadow-md select-none relative"
      style={{
        border: selected ? '1.5px solid #134956' : '1px solid #E2E8F0',
        borderLeft: `3px solid ${stageColor}`,
        backgroundColor: selected ? '#F0F9FF' : 'white',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={e => onToggleSelect(lead.id, e)}
        className="absolute top-3 right-3 z-10"
        title={selected ? 'Deselect' : 'Select'}
      >
        {selected
          ? <CheckSquare className="w-4 h-4" style={{ color: '#134956' }} />
          : <Square className="w-4 h-4" style={{ color: '#CBD5E1' }} />}
      </button>

      <div className="flex items-start justify-between gap-2 mb-2 pr-6">
        <p className="text-sm font-semibold leading-snug" style={{ color: '#0F172A' }}>{lead.name}</p>
        {isUntouched && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#DBEAFE', color: '#2563EB' }}>
            NEW
          </span>
        )}
      </div>
      {lead.destination_interest && (
        <p className="text-xs mb-1 truncate" style={{ color: '#64748B' }}>📍 {lead.destination_interest}</p>
      )}
      {lead.travel_month && (
        <p className="text-xs mb-1" style={{ color: '#64748B' }}>🗓 {lead.travel_month}</p>
      )}
      {lead.budget_range && (
        <p className="text-xs mb-2" style={{ color: '#64748B' }}>💰 {lead.budget_range}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px]" style={{ color: '#94A3B8' }}>{timeAgo(lead.created_at)}</p>
        <div className="flex gap-1">
          <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[#F0FDF4]" title="Call">
            <Phone className="w-3.5 h-3.5" style={{ color: '#16A34A' }} />
          </a>
          <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[#F0FDF4]" title="WhatsApp">
            <MessageCircle className="w-3.5 h-3.5" style={{ color: '#25D366' }} />
          </a>
        </div>
      </div>
    </div>
  );
});

// ─── Kanban Column ───────────────────────────────────────────────────────────

const KanbanColumn = memo(function KanbanColumn({
  stage, leads, onDragStart, onDrop, onLeadClick, selectedIds, onToggleSelect, onSelectAllInStage, onPrefetch,
}: {
  stage: Stage; leads: Lead[];
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDrop: (stageId: string) => void;
  onLeadClick: (lead: Lead) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onSelectAllInStage: (stageId: string, leads: Lead[]) => void;
  onPrefetch: (leadId: string) => void;
}) {
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [over, setOver] = useState(false);
  const allSelected = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  const visibleLeads = leads.slice(0, visibleCount);
  const hidden = leads.length - visibleCount;

  return (
    <div className="flex flex-col rounded-xl flex-shrink-0 w-[280px]"
      style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id); }}>
      <div className="px-4 py-3 rounded-t-xl flex items-center justify-between"
        style={{ borderBottom: `2px solid ${stage.color}`, backgroundColor: `${stage.color}18` }}>
        <div className="flex items-center gap-2">
          <button onClick={() => onSelectAllInStage(stage.id, leads)} title={allSelected ? 'Deselect all' : 'Select all in stage'}>
            {allSelected
              ? <CheckSquare className="w-3.5 h-3.5" style={{ color: '#134956' }} />
              : <Square className="w-3.5 h-3.5" style={{ color: '#CBD5E1' }} />}
          </button>
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
          <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{stage.name}</p>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: stage.color + '22', color: stage.color }}>
          {leads.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 transition-colors"
        style={{ minHeight: 120, backgroundColor: over ? `${stage.color}08` : undefined, maxHeight: 'calc(100vh - 220px)' }}>
        {visibleLeads.map(lead => (
          <LeadCard key={lead.id} lead={lead} stageColor={stage.color}
            onDragStart={onDragStart} onClick={onLeadClick}
            selected={selectedIds.has(lead.id)} onToggleSelect={onToggleSelect}
            onPrefetch={onPrefetch} />
        ))}
        {hidden > 0 && (
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="w-full py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-100"
            style={{ color: stage.color, border: `1px dashed ${stage.color}66` }}>
            Show {Math.min(hidden, PAGE_SIZE)} more of {hidden}
          </button>
        )}
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs"
            style={{ borderColor: over ? stage.color : '#E2E8F0', color: '#94A3B8' }}>
            Drop lead here
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

function BulkActionBar({
  count, stages, onMoveStage, onDelete, onClear,
}: {
  count: number; stages: Stage[];
  onMoveStage: (stageId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [showStageMenu, setShowStageMenu] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg"
      style={{ backgroundColor: '#0F172A', color: 'white' }}>
      <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#7DD3C0' }} />
      <span className="text-[#7DD3C0]">{count} selected</span>
      <div className="w-px h-4 bg-white/20" />

      {/* Move stage */}
      <div className="relative">
        <button onClick={() => setShowStageMenu(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors hover:bg-white/10">
          <MoveRight className="w-3.5 h-3.5" /> Move Stage <ChevronDown className="w-3 h-3" />
        </button>
        {showStageMenu && (
          <div className="absolute top-9 left-0 bg-white rounded-xl shadow-xl overflow-hidden z-10 min-w-[160px]"
            style={{ border: '1px solid #E2E8F0' }}>
            {stages.map(s => (
              <button key={s.id} onClick={() => { onMoveStage(s.id); setShowStageMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-[#F8FAFC] text-left"
                style={{ color: '#0F172A' }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <button onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 transition-colors hover:bg-white/10">
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>

      <div className="flex-1" />
      <button onClick={onClear} className="text-white/50 hover:text-white transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface CrmUser { id: string; name: string; role: string }

export default function PipelinesPage() {
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterOwner, setFilterOwner] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const draggingLeadId = useRef<string | null>(null);
  const qc = useQueryClient();

  // ─── React Query data ───────────────────────────────────────────────────────
  const { data: pipelinesData, isLoading: loadingPipelines } = usePipelines();
  const rawPipelines = (pipelinesData as Pipeline[] | undefined) ?? [];

  // Auto-select default pipeline on first load
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

  const { data: usersData } = useUsers();
  const users: CrmUser[] = useMemo(
    () => (usersData as CrmUser[] | undefined) ?? [],
    [usersData],
  );

  const stageMutation = useLeadStageMutation(resolvedPipelineId, filterParams);
  const prefetchLead  = usePrefetchLead();

  // Merge pipeline list with live detail data
  const pipelines = useMemo<Pipeline[]>(() => rawPipelines.map(p =>
    p.id === resolvedPipelineId && pipelineDetail
      ? { ...p, stages: (pipelineDetail as Pipeline).stages, leads: (pipelineDetail as Pipeline).leads }
      : p
  ), [rawPipelines, resolvedPipelineId, pipelineDetail]);

  const activePipeline = useMemo(
    () => pipelines.find(p => p.id === resolvedPipelineId),
    [pipelines, resolvedPipelineId],
  );

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
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
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
    if (!confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    await Promise.all(Array.from(selectedIds).map(leadId =>
      fetch(`/api/v1/leads/${leadId}`, { method: 'DELETE' })
    ));
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] });
  }

  // Filter + sort — memoised so it only re-runs when leads or filter state change
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

  if (loadingPipelines) {
    return <KanbanSkeleton />;
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-lg font-semibold" style={{ color: '#0F172A' }}>No pipelines yet</p>
        <Link href="/admin/pipelines/config" className="px-5 py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: '#134956' }}>
          Configure Pipelines
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-5 lg:-m-8">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white px-5 lg:px-8 py-4 space-y-3" style={{ borderBottom: '1px solid #E2E8F0' }}>
        {/* Row 1: Pipeline tabs + actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto">
            {pipelines.map(p => (
              <button key={p.id} onClick={() => { setActivePipelineId(p.id); setSelectedIds(new Set()); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0"
                style={{
                  backgroundColor: resolvedPipelineId === p.id ? '#134956' : '#F8FAFC',
                  color: resolvedPipelineId === p.id ? '#fff' : '#64748B',
                  border: '1px solid', borderColor: resolvedPipelineId === p.id ? '#134956' : '#E2E8F0',
                }}>
                {p.name}{p.is_default && <span className="ml-1.5 text-[10px] opacity-70">★</span>}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {/* Select all */}
          <button onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            {selectedIds.size === (activePipeline?.leads ?? []).length && selectedIds.size > 0
              ? <CheckSquare className="w-3.5 h-3.5" style={{ color: '#134956' }} />
              : <Square className="w-3.5 h-3.5" />}
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select All'}
          </button>
          {resolvedPipelineId && (
            <button onClick={() => setShowAddLead(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#134956' }}>
              <Plus className="w-4 h-4" /> New Lead
            </button>
          )}
          <Link href="/admin/pipelines/config"
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[#F8FAFC]"
            style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
            Configure
          </Link>
        </div>

        {/* Row 2: Search + filter + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..."
              className="pl-9 pr-4 py-2 text-sm rounded-lg outline-none" style={{ border: '1px solid #E2E8F0', width: 200 }} />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <button onClick={() => setShowFilters(p => !p)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ border: `1px solid ${filterStatus ? '#134956' : '#E2E8F0'}`, color: filterStatus ? '#134956' : '#64748B', backgroundColor: filterStatus ? '#F0F9FF' : 'white' }}>
              <Filter className="w-3.5 h-3.5" /> {filterStatus ? filterStatus : 'Status'}
            </button>
            {showFilters && (
              <div className="absolute top-10 left-0 bg-white rounded-xl shadow-xl z-20 overflow-hidden min-w-[160px]"
                style={{ border: '1px solid #E2E8F0' }}>
                <button onClick={() => { setFilterStatus(''); setShowFilters(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-[#F8FAFC]"
                  style={{ color: !filterStatus ? '#134956' : '#64748B' }}>All Statuses</button>
                {Object.keys(STATUS_COLORS).map(s => (
                  <button key={s} onClick={() => { setFilterStatus(s); setShowFilters(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-[#F8FAFC]"
                    style={{ color: filterStatus === s ? '#134956' : '#64748B' }}>{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Salesperson/owner filter */}
          <div className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ border: `1px solid ${filterOwner ? '#134956' : '#E2E8F0'}`, backgroundColor: filterOwner ? '#F0F9FF' : 'white', color: filterOwner ? '#134956' : '#64748B' }}>
            <Users className="w-3.5 h-3.5" />
            <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
              className="outline-none bg-transparent text-xs font-semibold" style={{ color: filterOwner ? '#134956' : '#64748B' }}>
              <option value="">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Date filter */}
          <div className="relative">
            <button onClick={() => setShowDateFilter(p => !p)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ border: `1px solid ${filterDateFrom || filterDateTo ? '#134956' : '#E2E8F0'}`, color: filterDateFrom || filterDateTo ? '#134956' : '#64748B', backgroundColor: filterDateFrom || filterDateTo ? '#F0F9FF' : 'white' }}>
              <Calendar className="w-3.5 h-3.5" /> Date
            </button>
            {showDateFilter && (
              <div className="absolute top-10 left-0 bg-white rounded-xl shadow-xl z-20 p-4 space-y-3 min-w-[220px]"
                style={{ border: '1px solid #E2E8F0' }}>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>From</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                    className="w-full text-xs rounded-lg px-2 py-2 mt-1 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>To</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                    className="w-full text-xs rounded-lg px-2 py-2 mt-1 outline-none" style={{ border: '1px solid #E2E8F0' }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setShowDateFilter(false); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Clear</button>
                  <button onClick={() => setShowDateFilter(false)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: '#134956' }}>Apply</button>
                </div>
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs font-semibold outline-none py-2 px-2 rounded-lg"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          <div className="flex-1" />
          <div className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg"
            style={{ backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
            <User className="w-3.5 h-3.5" />
            {allLeads.length} leads
          </div>
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

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full p-5 lg:p-8 min-w-max">
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
              />
            );
          })}
          {(activePipeline?.stages ?? []).length === 0 && (
            <div className="flex items-center justify-center w-full">
              <p className="text-sm" style={{ color: '#94A3B8' }}>No stages configured. Go to Pipeline Config to add stages.</p>
            </div>
          )}
        </div>
      </div>

      {showAddLead && resolvedPipelineId && (
        <AddLeadDrawer pipelineId={resolvedPipelineId} onClose={() => setShowAddLead(false)} onCreated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })} />
      )}
      {selectedLead && (
        <LeadDrawer
          leadId={selectedLead.id} stages={activePipeline?.stages ?? []}
          onClose={() => setSelectedLead(null)} onUpdated={() => qc.invalidateQueries({ queryKey: [...QK.pipeline(resolvedPipelineId), filterParams.toString()] })}
        />
      )}
    </div>
  );
}
