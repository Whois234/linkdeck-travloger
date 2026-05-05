'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, GripVertical, Check, X, Loader2, Star, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  status: boolean;
}

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  status: boolean;
  stages: Stage[];
}

const PRESET_COLORS = [
  '#64748B', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
          style={{ backgroundColor: c, border: value === c ? '2px solid #0F172A' : '2px solid transparent' }}
        >
          {value === c && <Check className="w-3 h-3 text-white" />}
        </button>
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-6 h-6 rounded-full cursor-pointer border-0 p-0 overflow-hidden"
        title="Custom color"
        style={{ appearance: 'none' }}
      />
    </div>
  );
}

export default function PipelineConfigPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');

  // New pipeline form
  const [newPipelineName, setNewPipelineName] = useState('');
  const [creatingPipeline, setCreatingPipeline] = useState(false);

  // New stage form
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#64748B');
  const [creatingStage, setCreatingStage] = useState(false);

  // Inline edit
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editStageName, setEditStageName] = useState('');
  const [editStageColor, setEditStageColor] = useState('');
  const [savingStage, setSavingStage] = useState(false);

  // Drag for reorder
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/v1/pipelines');
    const d = await res.json();
    if (d.success) {
      setPipelines(d.data);
      if (!selectedId && d.data.length > 0) {
        const def = d.data.find((p: Pipeline) => p.is_default) ?? d.data[0];
        setSelectedId(def.id);
      }
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, []);

  const selected = pipelines.find(p => p.id === selectedId);

  async function createPipeline() {
    if (!newPipelineName.trim()) return;
    setCreatingPipeline(true);
    const res = await fetch('/api/v1/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPipelineName.trim() }),
    });
    const d = await res.json();
    setCreatingPipeline(false);
    setNewPipelineName('');
    if (d.success) {
      await load();
      setSelectedId(d.data.id);
    }
  }

  async function setDefault(pipelineId: string) {
    await fetch(`/api/v1/pipelines/${pipelineId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    });
    load();
  }

  async function deletePipeline(pipelineId: string) {
    if (!confirm('Delete this pipeline? Leads in it will not be deleted.')) return;
    await fetch(`/api/v1/pipelines/${pipelineId}`, { method: 'DELETE' });
    load();
    setSelectedId('');
  }

  async function createStage() {
    if (!newStageName.trim() || !selectedId) return;
    setCreatingStage(true);
    await fetch(`/api/v1/pipelines/${selectedId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStageName.trim(), color: newStageColor }),
    });
    setNewStageName('');
    setNewStageColor('#64748B');
    setCreatingStage(false);
    load();
  }

  async function startEditStage(stage: Stage) {
    setEditingStageId(stage.id);
    setEditStageName(stage.name);
    setEditStageColor(stage.color);
  }

  async function saveStage() {
    if (!editingStageId || !selectedId) return;
    setSavingStage(true);
    await fetch(`/api/v1/pipelines/${selectedId}/stages/${editingStageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editStageName, color: editStageColor }),
    });
    setSavingStage(false);
    setEditingStageId(null);
    load();
  }

  async function deleteStage(stageId: string) {
    if (!selectedId) return;
    if (!confirm('Delete this stage? Leads in this stage will become unsorted.')) return;
    await fetch(`/api/v1/pipelines/${selectedId}/stages/${stageId}`, { method: 'DELETE' });
    load();
  }

  async function reorderStages(stages: Stage[]) {
    if (!selectedId) return;
    await fetch(`/api/v1/pipelines/${selectedId}/stages`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: stages.map((s, i) => ({ id: s.id, order: i + 1 })) }),
    });
    load();
  }

  function handleDrop(toIdx: number) {
    if (draggingIdx === null || !selected) return;
    const stages = [...selected.stages];
    const [moved] = stages.splice(draggingIdx, 1);
    stages.splice(toIdx, 0, moved);
    setDraggingIdx(null);
    setDragOverIdx(null);
    reorderStages(stages);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#134956' }} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pipelines" className="flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-80" style={{ color: '#64748B' }}>
          <ChevronLeft className="w-4 h-4" /> Pipelines
        </Link>
        <span style={{ color: '#CBD5E1' }}>/</span>
        <p className="text-xl font-bold" style={{ color: '#0F172A' }}>Pipeline Configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Pipeline list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
              <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Pipelines</p>
            </div>
            <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {pipelines.filter(p => p.status).map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-[#F8FAFC]"
                  style={{ backgroundColor: selectedId === p.id ? '#F0F9FF' : undefined }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{p.name}</p>
                      {p.is_default && <Star className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#F59E0B', fill: '#F59E0B' }} />}
                    </div>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{p.stages.length} stages</p>
                  </div>
                  <div className="flex gap-1">
                    {!p.is_default && (
                      <button
                        onClick={e => { e.stopPropagation(); setDefault(p.id); }}
                        className="p-1.5 rounded-md text-xs hover:bg-[#FEF3C7] transition-colors"
                        title="Set as default"
                      >
                        <Star className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); deletePipeline(p.id); }}
                      className="p-1.5 rounded-md hover:bg-[#FEF2F2] transition-colors"
                      title="Delete pipeline"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#DC2626' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* New pipeline */}
            <div className="px-4 py-4" style={{ borderTop: '1px solid #F1F5F9' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: '#64748B' }}>New Pipeline</p>
              <div className="flex gap-2">
                <input
                  value={newPipelineName}
                  onChange={e => setNewPipelineName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createPipeline()}
                  placeholder="Pipeline name..."
                  className="flex-1 text-sm rounded-lg px-3 py-2 outline-none"
                  style={{ border: '1px solid #D1D5DB' }}
                />
                <button onClick={createPipeline} disabled={creatingPipeline || !newPipelineName.trim()}
                  className="p-2 rounded-lg text-white flex items-center justify-center"
                  style={{ backgroundColor: '#134956', opacity: !newPipelineName.trim() ? 0.5 : 1 }}>
                  {creatingPipeline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Stage management */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-2xl flex items-center justify-center h-64" style={{ border: '1px solid #E2E8F0' }}>
              <p className="text-sm" style={{ color: '#94A3B8' }}>Select a pipeline to configure stages</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{selected.name} — Stages</p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Drag to reorder · Click to edit</p>
                </div>
              </div>

              {/* Stage list */}
              <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                {selected.stages.filter(s => s.status !== false).map((stage, idx) => (
                  <div
                    key={stage.id}
                    draggable
                    onDragStart={() => setDraggingIdx(idx)}
                    onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={() => handleDrop(idx)}
                    className="transition-colors"
                    style={{ backgroundColor: dragOverIdx === idx ? '#F0F9FF' : undefined, opacity: draggingIdx === idx ? 0.5 : 1 }}
                  >
                    {editingStageId === stage.id ? (
                      <div className="px-4 py-4 space-y-3">
                        <input
                          value={editStageName}
                          onChange={e => setEditStageName(e.target.value)}
                          className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                          style={{ border: '1px solid #D1D5DB' }}
                          autoFocus
                        />
                        <ColorPicker value={editStageColor} onChange={setEditStageColor} />
                        <div className="flex gap-2">
                          <button onClick={() => setEditingStageId(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
                            <X className="w-3.5 h-3.5 inline mr-1" />Cancel
                          </button>
                          <button onClick={saveStage} disabled={savingStage}
                            className="flex-1 py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1"
                            style={{ backgroundColor: '#134956' }}>
                            {savingStage && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <Check className="w-3.5 h-3.5" />Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <GripVertical className="w-4 h-4 cursor-grab flex-shrink-0" style={{ color: '#CBD5E1' }} />
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                        <div className="flex-1 min-w-0" onClick={() => startEditStage(stage)} style={{ cursor: 'pointer' }}>
                          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{stage.name}</p>
                          <p className="text-xs" style={{ color: '#94A3B8' }}>Order {stage.order}</p>
                        </div>
                        <button onClick={() => deleteStage(stage.id)}
                          className="p-1.5 rounded-md hover:bg-[#FEF2F2] transition-colors"
                          title="Delete stage">
                          <Trash2 className="w-3.5 h-3.5" style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {selected.stages.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm" style={{ color: '#94A3B8' }}>No stages yet. Add one below.</p>
                  </div>
                )}
              </div>

              {/* Add stage */}
              <div className="px-5 py-5 space-y-3" style={{ borderTop: '1px solid #F1F5F9', backgroundColor: '#FAFAFA' }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Add Stage</p>
                <input
                  value={newStageName}
                  onChange={e => setNewStageName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createStage()}
                  placeholder="Stage name (e.g. Negotiating)"
                  className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                  style={{ border: '1px solid #D1D5DB' }}
                />
                <ColorPicker value={newStageColor} onChange={setNewStageColor} />
                <button
                  onClick={createStage}
                  disabled={creatingStage || !newStageName.trim()}
                  className="w-full py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#134956', opacity: !newStageName.trim() ? 0.5 : 1 }}
                >
                  {creatingStage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Stage
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
