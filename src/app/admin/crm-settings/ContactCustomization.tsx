'use client';
import { useEffect, useState, useRef } from 'react';
import {
  GripVertical, Plus, Pencil, Trash2, X, Check, Loader2, Tag as TagIcon, ListPlus,
} from 'lucide-react';

const T = '#134956';

interface ContactField {
  id: string; key: string; label: string; type: string;
  required: boolean; options: string[] | null; placeholder: string | null;
  sort_order: number; is_system: boolean; status: boolean;
}

interface ContactTag {
  id: string; name: string; color: string; status: boolean;
}

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: 'text',        label: 'Text' },
  { value: 'email',       label: 'Email' },
  { value: 'phone',       label: 'Phone' },
  { value: 'number',      label: 'Number' },
  { value: 'date',        label: 'Date' },
  { value: 'select',      label: 'Single Select' },
  { value: 'multiselect', label: 'Multi Select' },
  { value: 'textarea',    label: 'Long Text' },
  { value: 'url',         label: 'URL' },
];

const inp = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const inpStyle = { borderColor: '#E2E8F0' };

// ═══════════════════════════════════════════════════════════════════════
// CONTACT FIELDS TAB
// ═══════════════════════════════════════════════════════════════════════

export function ContactFieldsTab() {
  const [fields, setFields]   = useState<ContactField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactField | null>(null);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const dragId = useRef<string | null>(null);

  const [form, setForm] = useState({
    key: '', label: '', type: 'text', required: false, options: '', placeholder: '',
  });

  async function load() {
    setLoading(true);
    const r = await fetch('/api/v1/crm/contact-fields');
    const d = await r.json();
    if (d.success) setFields(d.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ key: '', label: '', type: 'text', required: false, options: '', placeholder: '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(f: ContactField) {
    setEditing(f);
    setForm({
      key:         f.key,
      label:       f.label,
      type:        f.type,
      required:    f.required,
      options:     (f.options ?? []).join(', '),
      placeholder: f.placeholder ?? '',
    });
    setError('');
    setShowForm(true);
  }

  async function save() {
    setSaving(true); setError('');
    const optList = form.options.split(',').map(o => o.trim()).filter(Boolean);
    const payload = {
      label:       form.label,
      type:        form.type,
      required:    form.required,
      placeholder: form.placeholder || null,
      options:     (form.type === 'select' || form.type === 'multiselect') ? optList : null,
      ...(editing ? {} : { key: form.key.toLowerCase() }),
    };
    const url    = editing ? `/api/v1/crm/contact-fields/${editing.id}` : '/api/v1/crm/contact-fields';
    const method = editing ? 'PATCH' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data   = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Save failed'); return; }
    setShowForm(false);
    load();
  }

  async function del(f: ContactField) {
    if (f.is_system) { alert('System fields cannot be deleted.'); return; }
    if (!confirm(`Delete field "${f.label}"? Existing contact data for this field will become inaccessible.`)) return;
    await fetch(`/api/v1/crm/contact-fields/${f.id}`, { method: 'DELETE' });
    load();
  }

  function onDragStart(id: string) { dragId.current = id; }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  async function onDrop(targetId: string) {
    if (!dragId.current || dragId.current === targetId) return;
    const fromIdx = fields.findIndex(f => f.id === dragId.current);
    const toIdx   = fields.findIndex(f => f.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...fields];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setFields(next);
    dragId.current = null;
    await fetch('/api/v1/crm/contact-fields/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next.map(f => f.id) }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Contact Fields</h2>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Add, rename and reorder the fields shown on every contact. Drag the handle to move a row up or down.</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: T }}>
          <Plus className="w-4 h-4" /> Add Field
        </button>
      </div>

      {/* Field list */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: T }} /></div>
        ) : fields.length === 0 ? (
          <div className="py-12 text-center">
            <ListPlus className="w-8 h-8 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No contact fields yet</p>
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Add your first custom field to get started.</p>
          </div>
        ) : (
          <div>
            {fields.map(f => (
              <div key={f.id}
                draggable
                onDragStart={() => onDragStart(f.id)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(f.id)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors"
                style={{ borderBottom: '1px solid #F1F5F9', cursor: 'grab' }}>
                <button className="w-6 h-6 flex items-center justify-center text-[#94A3B8] cursor-grab" title="Drag to reorder">
                  <GripVertical className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{f.label}</p>
                    {f.required && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FEE2E2', color: '#B91C1C' }}>REQUIRED</span>}
                    {f.is_system && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E0F2FE', color: '#0369A1' }}>SYSTEM</span>}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                    <span className="font-mono">{f.key}</span> · {FIELD_TYPES.find(t => t.value === f.type)?.label ?? f.type}
                    {f.options && f.options.length > 0 && ` · ${f.options.length} options`}
                  </p>
                </div>
                <button onClick={() => openEdit(f)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]"
                  style={{ color: '#94A3B8' }}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!f.is_system && (
                  <button onClick={() => del(f)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2]"
                    style={{ color: '#94A3B8' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-[480px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
              <p className="font-bold" style={{ color: '#0F172A' }}>{editing ? 'Edit Field' : 'Add Contact Field'}</p>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {error && <p className="text-xs p-2.5 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</p>}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Label *</label>
                <input className={inp} style={inpStyle} value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Anniversary Date" autoFocus />
              </div>
              {!editing && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Key * <span className="font-normal text-[10px]" style={{ color: '#94A3B8' }}>(snake_case, immutable)</span></label>
                  <input className={inp} style={inpStyle} value={form.key} onChange={e => setForm(p => ({ ...p, key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() }))} placeholder="anniversary_date" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Type</label>
                <select className={inp} style={inpStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {(form.type === 'select' || form.type === 'multiselect') && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Options <span className="font-normal text-[10px]" style={{ color: '#94A3B8' }}>(comma-separated)</span></label>
                  <input className={inp} style={inpStyle} value={form.options} onChange={e => setForm(p => ({ ...p, options: e.target.value }))} placeholder="Honeymoon, Family, Adventure" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Placeholder</label>
                <input className={inp} style={inpStyle} value={form.placeholder} onChange={e => setForm(p => ({ ...p, placeholder: e.target.value }))} placeholder="e.g. dd-mm-yyyy" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.required} onChange={e => setForm(p => ({ ...p, required: e.target.checked }))} style={{ accentColor: T }} />
                <span className="text-sm" style={{ color: '#0F172A' }}>Required when creating a contact</span>
              </label>
            </div>
            <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => setShowForm(false)} className="flex-1 h-9 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.label || (!editing && !form.key)}
                className="flex-1 h-9 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: T }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editing ? 'Save Changes' : 'Add Field'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TAGS TAB
// ═══════════════════════════════════════════════════════════════════════

const TAG_COLORS = ['#22C55E', '#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B'];

export function ContactTagsTab() {
  const [tags, setTags]       = useState<ContactTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactTag | null>(null);
  const [form, setForm]       = useState({ name: '', color: TAG_COLORS[0] });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/v1/crm/contact-tags');
    const d = await r.json();
    if (d.success) setTags(d.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', color: TAG_COLORS[0] });
    setError('');
    setShowForm(true);
  }
  function openEdit(t: ContactTag) {
    setEditing(t);
    setForm({ name: t.name, color: t.color });
    setError('');
    setShowForm(true);
  }
  async function save() {
    setSaving(true); setError('');
    const url    = editing ? `/api/v1/crm/contact-tags/${editing.id}` : '/api/v1/crm/contact-tags';
    const method = editing ? 'PATCH' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data   = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Save failed'); return; }
    setShowForm(false);
    load();
  }
  async function del(t: ContactTag) {
    if (!confirm(`Delete tag "${t.name}"? It will be removed from all contacts that carry it.`)) return;
    await fetch(`/api/v1/crm/contact-tags/${t.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Tags</h2>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Create coloured tags you can apply to contacts and filter by.</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: T }}>
          <Plus className="w-4 h-4" /> Add Tag
        </button>
      </div>

      <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #E2E8F0' }}>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: T }} /></div>
        ) : tags.length === 0 ? (
          <div className="py-8 text-center">
            <TagIcon className="w-8 h-8 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No tags yet</p>
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Create tags like "VIP", "Lost", "Repeat Customer" — then assign them on the contacts page.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map(t => (
              <div key={t.id} className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: t.color + '20', color: t.color, border: `1px solid ${t.color}40` }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
                <button onClick={() => openEdit(t)} className="opacity-0 group-hover:opacity-100 hover:opacity-80 ml-0.5" title="Edit">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => del(t)} className="opacity-0 group-hover:opacity-100 hover:opacity-80" title="Delete">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl w-[400px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
              <p className="font-bold" style={{ color: '#0F172A' }}>{editing ? 'Edit Tag' : 'Add Tag'}</p>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {error && <p className="text-xs p-2.5 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</p>}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Name *</label>
                <input className={inp} style={inpStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="VIP" maxLength={40} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#374151' }}>Colour</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform"
                      style={{ backgroundColor: c, transform: form.color === c ? 'scale(1.1)' : 'scale(1)', boxShadow: form.color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none' }}>
                      {form.color === c && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
              {form.name && (
                <div className="pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>Preview</p>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: form.color + '20', color: form.color, border: `1px solid ${form.color}40` }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: form.color }} />
                    {form.name}
                  </span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => setShowForm(false)} className="flex-1 h-9 rounded-lg text-sm font-semibold" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 h-9 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: T }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editing ? 'Save' : 'Add Tag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
