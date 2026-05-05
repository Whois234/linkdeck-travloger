'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { ImageUploader } from '@/components/admin/ImageUploader';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Image as ImageIcon, X, Bed, Calendar, CheckCircle2,
  Download, Upload, FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';

/* ── Shared style tokens ── */
const inp = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const inpSt = { borderColor: '#E2E8F0' };
const sel = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const card = { border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
const T = '#134956';

/* ── Types ── */
interface HotelDetail {
  id: string; hotel_name: string; hotel_type: string; category_label: string;
  star_rating?: number | null; destination: { id: string; name: string };
  destination_id: string; address?: string | null; phone?: string | null;
  email?: string | null; hotel_description?: string | null; internal_notes?: string | null;
  images?: string[] | null; amenities?: string[] | null; status: boolean;
}
interface RoomCategory {
  id: string; room_category_name: string; description?: string | null;
  max_adults: number; max_children: number; max_total_occupancy: number;
  extra_bed_allowed: boolean; cwb_allowed: boolean; cwob_allowed: boolean;
  bed_type?: string | null; status: boolean;
}
interface HotelRate {
  id: string; room_category_id: string; meal_plan_id: string;
  season_name?: string | null; valid_from: string; valid_to: string;
  single_occupancy_cost: number; double_occupancy_cost: number;
  triple_occupancy_cost?: number | null; quad_occupancy_cost?: number | null;
  extra_adult_cost?: number | null; child_with_bed_cost?: number | null;
  child_without_bed_cost?: number | null; weekend_surcharge?: number | null;
  tax_included: boolean; notes?: string | null; status: boolean;
  meal_plan: { id: string; code: string; name: string };
}
interface MealPlan { id: string; code: string; name: string }

const HOTEL_TYPES = ['HOTEL','RESORT','VILLA','HOMESTAY','HOUSEBOAT'];
const HOTEL_CATS  = ['BUDGET','STANDARD','DELUXE','PREMIUM','LUXURY'];
const BED_TYPES   = ['Single','Twin','Double','Queen','King','Bunk'];

const EMPTY_ROOM = {
  room_category_name: '', description: '', max_adults: 2, max_children: 2,
  max_total_occupancy: 3, extra_bed_allowed: false, cwb_allowed: false,
  cwob_allowed: false, bed_type: '',
};
const EMPTY_RATE = {
  season_name: '', valid_from: '', valid_to: '', meal_plan_id: '',
  single_occupancy_cost: '', double_occupancy_cost: '',
  triple_occupancy_cost: '', quad_occupancy_cost: '',
  extra_adult_cost: '', child_with_bed_cost: '', child_without_bed_cost: '',
  weekend_surcharge: '', tax_included: false, notes: '',
};

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN'); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }

/* ─── Hotel Room + Rate Excel Import/Export ──────────────────────────────── */
const ROOM_RATE_COLS = [
  { label: 'Room Category *',             example: 'Deluxe Room' },
  { label: 'Bed Type',                    example: 'King' },
  { label: 'Max Adults',                  example: '2' },
  { label: 'Max Children',               example: '1' },
  { label: 'Max Total Occupancy',         example: '3' },
  { label: 'Extra Bed Allowed (YES/NO)',   example: 'YES' },
  { label: 'Child With Bed Allowed (YES/NO)', example: 'YES' },
  { label: 'Child Without Bed Allowed (YES/NO)', example: 'YES' },
  { label: 'Meal Plan Code * (EP/CP/MAP/AP/FAP)', example: 'MAP' },
  { label: 'Season Name',                 example: 'Peak Season' },
  { label: 'Valid From (YYYY-MM-DD) *',   example: '2026-01-01' },
  { label: 'Valid To (YYYY-MM-DD) *',     example: '2026-12-31' },
  { label: 'Single Occupancy Cost (₹) *', example: '3500' },
  { label: 'Double Occupancy Cost (₹) *', example: '5000' },
  { label: 'Triple Occupancy Cost (₹)',   example: '6500' },
  { label: 'Quad Occupancy Cost (₹)',     example: '8000' },
  { label: 'Extra Adult Cost (₹)',        example: '1200' },
  { label: 'Child With Bed Cost (₹)',     example: '800' },
  { label: 'Child Without Bed Cost (₹)',  example: '400' },
  { label: 'Weekend Surcharge (₹)',       example: '500' },
  { label: 'Tax Included (YES/NO)',        example: 'NO' },
  { label: 'Notes',                       example: 'Mountain view rooms' },
];

function HotelExcelIO({
  hotelId, hotelName, rooms, rates, mealPlans, onDone,
}: {
  hotelId: string;
  hotelName: string;
  rooms: RoomCategory[];
  rates: HotelRate[];
  mealPlans: MealPlan[];
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  function downloadTemplate() {
    const header  = ROOM_RATE_COLS.map(c => c.label);
    const example = ROOM_RATE_COLS.map(c => c.example);
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    ws['!cols'] = ROOM_RATE_COLS.map(() => ({ wch: 28 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rooms & Rates');
    XLSX.writeFile(wb, `${hotelName.replace(/\s+/g, '_')}_Rooms_Rates_Template.xlsx`);
  }

  function exportData() {
    if (!rooms.length) { alert('No room categories to export.'); return; }
    const rowsOut: Record<string, string | number>[] = [];
    for (const room of rooms) {
      const roomRates = rates.filter(r => r.room_category_id === room.id);
      if (roomRates.length === 0) {
        // Room with no rates — export just the room row
        rowsOut.push({
          'Room Category *': room.room_category_name,
          'Bed Type': room.bed_type ?? '',
          'Max Adults': room.max_adults,
          'Max Children': room.max_children,
          'Max Total Occupancy': room.max_total_occupancy,
          'Extra Bed Allowed (YES/NO)': room.extra_bed_allowed ? 'YES' : 'NO',
          'Child With Bed Allowed (YES/NO)': room.cwb_allowed ? 'YES' : 'NO',
          'Child Without Bed Allowed (YES/NO)': room.cwob_allowed ? 'YES' : 'NO',
          'Meal Plan Code * (EP/CP/MAP/AP/FAP)': '',
          'Season Name': '', 'Valid From (YYYY-MM-DD) *': '', 'Valid To (YYYY-MM-DD) *': '',
          'Single Occupancy Cost (₹) *': '', 'Double Occupancy Cost (₹) *': '',
          'Triple Occupancy Cost (₹)': '', 'Quad Occupancy Cost (₹)': '',
          'Extra Adult Cost (₹)': '', 'Child With Bed Cost (₹)': '',
          'Child Without Bed Cost (₹)': '', 'Weekend Surcharge (₹)': '',
          'Tax Included (YES/NO)': '', 'Notes': '',
        });
      } else {
        for (const rate of roomRates) {
          rowsOut.push({
            'Room Category *': room.room_category_name,
            'Bed Type': room.bed_type ?? '',
            'Max Adults': room.max_adults,
            'Max Children': room.max_children,
            'Max Total Occupancy': room.max_total_occupancy,
            'Extra Bed Allowed (YES/NO)': room.extra_bed_allowed ? 'YES' : 'NO',
            'Child With Bed Allowed (YES/NO)': room.cwb_allowed ? 'YES' : 'NO',
            'Child Without Bed Allowed (YES/NO)': room.cwob_allowed ? 'YES' : 'NO',
            'Meal Plan Code * (EP/CP/MAP/AP/FAP)': rate.meal_plan.code,
            'Season Name': rate.season_name ?? '',
            'Valid From (YYYY-MM-DD) *': rate.valid_from.slice(0, 10),
            'Valid To (YYYY-MM-DD) *': rate.valid_to.slice(0, 10),
            'Single Occupancy Cost (₹) *': rate.single_occupancy_cost,
            'Double Occupancy Cost (₹) *': rate.double_occupancy_cost,
            'Triple Occupancy Cost (₹)': rate.triple_occupancy_cost ?? '',
            'Quad Occupancy Cost (₹)': rate.quad_occupancy_cost ?? '',
            'Extra Adult Cost (₹)': rate.extra_adult_cost ?? '',
            'Child With Bed Cost (₹)': rate.child_with_bed_cost ?? '',
            'Child Without Bed Cost (₹)': rate.child_without_bed_cost ?? '',
            'Weekend Surcharge (₹)': rate.weekend_surcharge ?? '',
            'Tax Included (YES/NO)': rate.tax_included ? 'YES' : 'NO',
            'Notes': rate.notes ?? '',
          });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rowsOut, { header: ROOM_RATE_COLS.map(c => c.label) });
    ws['!cols'] = ROOM_RATE_COLS.map(() => ({ wch: 28 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rooms & Rates');
    XLSX.writeFile(wb, `${hotelName.replace(/\s+/g, '_')}_Rooms_Rates_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setResult(null);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

    // Strip example row
    const dataRows = parsed.filter((r, i) => {
      if (i === 0) {
        const vals = Object.values(r).map(v => String(v).trim());
        const examples = ROOM_RATE_COLS.map(c => c.example);
        return !examples.every((ex, j) => !ex || vals[j] === ex);
      }
      return true;
    }).filter(r => Object.values(r).some(v => String(v).trim() !== ''));

    let ok = 0, failed = 0;

    // Room category cache: name → id (existing or just-created)
    const roomCache = new Map<string, string>(rooms.map(r => [r.room_category_name.toLowerCase(), r.id]));

    for (const row of dataRows) {
      const catName = (row['Room Category *'] ?? '').trim();
      if (!catName) { failed++; continue; }

      // Ensure room category exists
      let roomId = roomCache.get(catName.toLowerCase());
      if (!roomId) {
        try {
          const res = await fetch(`/api/v1/hotels/${hotelId}/room-categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              room_category_name: catName,
              bed_type: row['Bed Type'] || null,
              max_adults: Number(row['Max Adults']) || 2,
              max_children: Number(row['Max Children']) || 1,
              max_total_occupancy: Number(row['Max Total Occupancy']) || 3,
              extra_bed_allowed: (row['Extra Bed Allowed (YES/NO)'] ?? '').toUpperCase() === 'YES',
              cwb_allowed: (row['Child With Bed Allowed (YES/NO)'] ?? '').toUpperCase() === 'YES',
              cwob_allowed: (row['Child Without Bed Allowed (YES/NO)'] ?? '').toUpperCase() === 'YES',
            }),
          });
          if (res.ok) { const d = await res.json(); roomId = d.data?.id; if (roomId) roomCache.set(catName.toLowerCase(), roomId); }
        } catch { /* continue */ }
      }
      if (!roomId) { failed++; continue; }

      // If no rate columns filled, skip rate creation (just room)
      const mpCode = (row['Meal Plan Code * (EP/CP/MAP/AP/FAP)'] ?? '').trim().toUpperCase();
      const validFrom = (row['Valid From (YYYY-MM-DD) *'] ?? '').trim();
      const validTo   = (row['Valid To (YYYY-MM-DD) *'] ?? '').trim();
      const singleCost = row['Single Occupancy Cost (₹) *'];
      const doubleCost = row['Double Occupancy Cost (₹) *'];

      if (!mpCode || !validFrom || !validTo || !singleCost || !doubleCost) {
        ok++; // room created/found — rate row skipped (no rate data)
        continue;
      }

      const mp = mealPlans.find(m => m.code.toUpperCase() === mpCode);
      if (!mp) { failed++; continue; }

      try {
        const res = await fetch(`/api/v1/hotels/${hotelId}/rates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_category_id: roomId,
            meal_plan_id: mp.id,
            season_name: row['Season Name'] || null,
            valid_from: new Date(validFrom).toISOString(),
            valid_to:   new Date(validTo).toISOString(),
            single_occupancy_cost: Number(singleCost),
            double_occupancy_cost: Number(doubleCost),
            triple_occupancy_cost: row['Triple Occupancy Cost (₹)'] ? Number(row['Triple Occupancy Cost (₹)']) : null,
            quad_occupancy_cost:   row['Quad Occupancy Cost (₹)'] ? Number(row['Quad Occupancy Cost (₹)']) : null,
            extra_adult_cost:      row['Extra Adult Cost (₹)'] ? Number(row['Extra Adult Cost (₹)']) : null,
            child_with_bed_cost:   row['Child With Bed Cost (₹)'] ? Number(row['Child With Bed Cost (₹)']) : null,
            child_without_bed_cost: row['Child Without Bed Cost (₹)'] ? Number(row['Child Without Bed Cost (₹)']) : null,
            weekend_surcharge:     row['Weekend Surcharge (₹)'] ? Number(row['Weekend Surcharge (₹)']) : null,
            tax_included: (row['Tax Included (YES/NO)'] ?? '').toUpperCase() === 'YES',
            notes: row['Notes'] || null,
          }),
        });
        if (res.ok) ok++; else failed++;
      } catch { failed++; }
    }

    setImporting(false);
    setResult({ ok, failed });
    if (fileRef.current) fileRef.current.value = '';
    if (ok > 0) onDone();
  }

  const btn = 'flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {result && (
        <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: result.failed ? '#FEF3C7' : '#DCFCE7', color: result.failed ? '#B45309' : '#15803D' }}>
          ✓ {result.ok} rows imported{result.failed ? ` · ${result.failed} failed` : ''}
        </span>
      )}
      <button onClick={downloadTemplate} className={btn} style={{ border: '1px solid #E2E8F0', color: '#134956', background: '#F0F7F9' }}>
        <FileSpreadsheet className="w-3 h-3" /> Template
      </button>
      <label className={`${btn} cursor-pointer`} style={{ border: '1px solid #134956', color: '#134956', background: 'white' }}>
        <Upload className="w-3 h-3" /> {importing ? 'Importing…' : 'Import'}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={importing} />
      </label>
      <button onClick={exportData} className={btn} style={{ border: '1px solid #E2E8F0', color: '#64748B', background: 'white' }}>
        <Download className="w-3 h-3" /> Export
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function HotelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [hotel, setHotel] = useState<HotelDetail | null>(null);
  const [rooms, setRooms] = useState<RoomCategory[]>([]);
  const [rates, setRates] = useState<HotelRate[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'rooms' | 'images'>('overview');

  /* overview form */
  const [ovForm, setOvForm] = useState({ hotel_name: '', hotel_type: 'HOTEL', category_label: 'STANDARD', star_rating: '3', address: '', phone: '', email: '', hotel_description: '', internal_notes: '' });
  const [ovSaving, setOvSaving] = useState(false);
  const [ovErr, setOvErr] = useState('');

  /* room category form */
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editRoom, setEditRoom] = useState<RoomCategory | null>(null);
  const [roomForm, setRoomForm] = useState({ ...EMPTY_ROOM });
  const [roomSaving, setRoomSaving] = useState(false);
  const [roomErr, setRoomErr] = useState('');

  /* rate form */
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateForRoom, setRateForRoom] = useState<string>('');
  const [editRate, setEditRate] = useState<HotelRate | null>(null);
  const [rateForm, setRateForm] = useState({ ...EMPTY_RATE });
  const [rateSaving, setRateSaving] = useState(false);
  const [rateErr, setRateErr] = useState('');

  /* expanded rooms */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /* image management */
  const [imageUrl, setImageUrl] = useState('');
  const [imagesSaving, setImagesSaving] = useState(false);

  /* toast */
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  /* ── Loaders ── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [hr, rr, mr] = await Promise.all([
      fetch(`/api/v1/hotels/${id}`),
      fetch(`/api/v1/hotels/${id}/room-categories`),
      fetch('/api/v1/meal-plans'),
    ]);
    const [hd, rd, md] = await Promise.all([hr.json(), rr.json(), mr.json()]);
    if (hd.success) {
      const h = hd.data;
      setHotel(h);
      setOvForm({
        hotel_name: h.hotel_name, hotel_type: h.hotel_type, category_label: h.category_label,
        star_rating: h.star_rating?.toString() ?? '3', address: h.address ?? '',
        phone: h.phone ?? '', email: h.email ?? '',
        hotel_description: h.hotel_description ?? '', internal_notes: h.internal_notes ?? '',
      });
    }
    if (rd.success) setRooms(rd.data);
    if (md.success) setMealPlans(md.data);
    setLoading(false);
  }, [id]);

  const loadRates = useCallback(async () => {
    const r = await fetch(`/api/v1/hotels/${id}/rates`);
    const d = await r.json();
    if (d.success) setRates(d.data);
  }, [id]);

  useEffect(() => { loadAll(); loadRates(); }, [loadAll, loadRates]);

  /* ── Overview save ── */
  async function saveOverview() {
    setOvSaving(true); setOvErr('');
    const payload = {
      ...ovForm,
      star_rating: ovForm.star_rating ? Number(ovForm.star_rating) : null,
      // Zod rejects empty string for email/phone — send null instead
      email: ovForm.email?.trim() || null,
      phone: ovForm.phone?.trim() || null,
      address: ovForm.address?.trim() || null,
    };
    const res = await fetch(`/api/v1/hotels/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!res.ok) { setOvErr(d.error ?? 'Save failed'); showToast(d.error ?? 'Save failed', 'error'); }
    else { setHotel(prev => prev ? { ...prev, ...d.data } : d.data); showToast('Hotel details saved!'); }
    setOvSaving(false);
  }

  /* ── Room Category CRUD ── */
  function openAddRoom() { setEditRoom(null); setRoomForm({ ...EMPTY_ROOM }); setRoomErr(''); setShowRoomForm(true); }
  function openEditRoom(r: RoomCategory) {
    setEditRoom(r);
    setRoomForm({ room_category_name: r.room_category_name, description: r.description ?? '', max_adults: r.max_adults, max_children: r.max_children, max_total_occupancy: r.max_total_occupancy, extra_bed_allowed: r.extra_bed_allowed, cwb_allowed: r.cwb_allowed, cwob_allowed: r.cwob_allowed, bed_type: r.bed_type ?? '' });
    setRoomErr(''); setShowRoomForm(true);
  }
  async function saveRoom() {
    setRoomSaving(true); setRoomErr('');
    const payload = { ...roomForm, bed_type: roomForm.bed_type || null, description: roomForm.description || null };
    const url = editRoom ? `/api/v1/hotels/${id}/room-categories/${editRoom.id}` : `/api/v1/hotels/${id}/room-categories`;
    const res = await fetch(url, { method: editRoom ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!res.ok) { setRoomErr(d.error ?? 'Save failed'); } else { setShowRoomForm(false); loadAll(); showToast(editRoom ? 'Room category updated!' : 'Room category added!'); }
    setRoomSaving(false);
  }
  async function deleteRoom(roomId: string) {
    if (!confirm('Deactivate this room category?')) return;
    await fetch(`/api/v1/hotels/${id}/room-categories/${roomId}`, { method: 'DELETE' });
    loadAll();
  }

  /* ── Rate CRUD ── */
  function openAddRate(roomId: string) {
    setRateForRoom(roomId); setEditRate(null);
    setRateForm({ ...EMPTY_RATE, meal_plan_id: mealPlans[0]?.id ?? '' });
    setRateErr(''); setShowRateForm(true);
  }
  function openEditRate(rate: HotelRate) {
    setEditRate(rate); setRateForRoom(rate.room_category_id);
    setRateForm({
      season_name: rate.season_name ?? '', valid_from: rate.valid_from.split('T')[0], valid_to: rate.valid_to.split('T')[0],
      meal_plan_id: rate.meal_plan.id,
      single_occupancy_cost: rate.single_occupancy_cost.toString(),
      double_occupancy_cost: rate.double_occupancy_cost.toString(),
      triple_occupancy_cost: rate.triple_occupancy_cost?.toString() ?? '',
      quad_occupancy_cost: rate.quad_occupancy_cost?.toString() ?? '',
      extra_adult_cost: rate.extra_adult_cost?.toString() ?? '',
      child_with_bed_cost: rate.child_with_bed_cost?.toString() ?? '',
      child_without_bed_cost: rate.child_without_bed_cost?.toString() ?? '',
      weekend_surcharge: rate.weekend_surcharge?.toString() ?? '',
      tax_included: rate.tax_included, notes: rate.notes ?? '',
    });
    setRateErr(''); setShowRateForm(true);
  }
  async function saveRate() {
    setRateSaving(true); setRateErr('');
    const n = (v: string) => v === '' ? null : Number(v);
    const payload: Record<string, unknown> = {
      room_category_id: rateForRoom,
      meal_plan_id: rateForm.meal_plan_id,
      season_name: rateForm.season_name || null,
      valid_from: new Date(rateForm.valid_from).toISOString(),
      valid_to: new Date(rateForm.valid_to).toISOString(),
      single_occupancy_cost: Number(rateForm.single_occupancy_cost),
      double_occupancy_cost: Number(rateForm.double_occupancy_cost),
      triple_occupancy_cost: n(rateForm.triple_occupancy_cost),
      quad_occupancy_cost: n(rateForm.quad_occupancy_cost),
      extra_adult_cost: n(rateForm.extra_adult_cost),
      child_with_bed_cost: n(rateForm.child_with_bed_cost),
      child_without_bed_cost: n(rateForm.child_without_bed_cost),
      weekend_surcharge: n(rateForm.weekend_surcharge),
      tax_included: rateForm.tax_included,
      notes: rateForm.notes || null,
    };
    const url = editRate ? `/api/v1/hotels/${id}/rates/${editRate.id}` : `/api/v1/hotels/${id}/rates`;
    const res = await fetch(url, { method: editRate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!res.ok) { setRateErr(d.error ?? 'Save failed'); } else { setShowRateForm(false); loadRates(); showToast(editRate ? 'Rate updated!' : 'Rate added!'); }
    setRateSaving(false);
  }
  async function deleteRate(rateId: string) {
    if (!confirm('Remove this rate?')) return;
    await fetch(`/api/v1/hotels/${id}/rates/${rateId}`, { method: 'DELETE' });
    loadRates();
  }

  /* ── Image management ── */
  async function addImage() {
    if (!imageUrl.trim() || !hotel) return;
    const newImages = [...(hotel.images ?? []), imageUrl.trim()];
    setImagesSaving(true);
    const res = await fetch(`/api/v1/hotels/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: newImages }) });
    const d = await res.json();
    if (d.success) { setHotel(prev => prev ? { ...prev, images: newImages } : prev); setImageUrl(''); }
    setImagesSaving(false);
  }
  async function removeImage(idx: number) {
    if (!hotel) return;
    const newImages = (hotel.images ?? []).filter((_, i) => i !== idx);
    const res = await fetch(`/api/v1/hotels/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: newImages }) });
    const d = await res.json();
    if (d.success) { setHotel(prev => prev ? { ...prev, images: newImages } : prev); showToast('Image removed'); }
  }
  async function moveImageToFirst(idx: number) {
    if (!hotel || idx === 0) return;
    const imgs = [...(hotel.images ?? [])];
    const [item] = imgs.splice(idx, 1);
    imgs.unshift(item);
    const res = await fetch(`/api/v1/hotels/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: imgs }) });
    const d = await res.json();
    if (d.success) { setHotel(prev => prev ? { ...prev, images: imgs } : prev); showToast('Hero image updated!'); }
  }

  /* ── helpers ── */
  function ratesForRoom(roomId: string) { return rates.filter(r => r.room_category_id === roomId); }
  function toggleExpand(roomId: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(roomId)) s.delete(roomId); else s.add(roomId);
      return s;
    });
  }

  /* ═══ RENDER ═══ */
  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: T }} />
    </div>
  );
  if (!hotel) return <div className="py-20 text-center text-sm text-[#64748B]">Hotel not found.</div>;

  const tabCls = (t: string) => `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'text-white' : 'text-[#64748B] hover:bg-[#F1F5F9]'}`;
  const tabSt = (t: string) => tab === t ? { backgroundColor: T } : {};

  return (
    <div className="max-w-[1100px]">
      <PageHeader
        title={hotel.hotel_name}
        subtitle={`${hotel.hotel_type} · ${hotel.destination.name}`}
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Hotels', href: '/admin/hotels' }, { label: hotel.hotel_name }]}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
        {(['overview', 'rooms', 'images'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={tabCls(t)} style={tabSt(t)}>
            {t === 'overview' ? 'Overview' : t === 'rooms' ? `Room Categories (${rooms.length})` : `Images (${hotel.images?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {tab === 'overview' && (
        <div className="bg-white rounded-2xl p-6" style={card}>
          {ovErr && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{ovErr}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={lbl}>Hotel Name <span className="text-red-500">*</span></label>
              <input className={inp} style={inpSt} value={ovForm.hotel_name} onChange={e => setOvForm(p => ({ ...p, hotel_name: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Hotel Type</label>
              <select className={sel} style={inpSt} value={ovForm.hotel_type} onChange={e => setOvForm(p => ({ ...p, hotel_type: e.target.value }))}>
                {HOTEL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Category</label>
              <select className={sel} style={inpSt} value={ovForm.category_label} onChange={e => setOvForm(p => ({ ...p, category_label: e.target.value }))}>
                {HOTEL_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Star Rating</label>
              <select className={sel} style={inpSt} value={ovForm.star_rating} onChange={e => setOvForm(p => ({ ...p, star_rating: e.target.value }))}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} Star{n>1?'s':''}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Phone</label>
              <input className={inp} style={inpSt} value={ovForm.phone} onChange={e => setOvForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98000 00000" />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input className={inp} style={inpSt} value={ovForm.email} onChange={e => setOvForm(p => ({ ...p, email: e.target.value }))} placeholder="hotel@example.com" />
            </div>
            <div>
              <label className={lbl}>Address</label>
              <input className={inp} style={inpSt} value={ovForm.address} onChange={e => setOvForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Description (customer visible)</label>
              <textarea className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white resize-none" style={inpSt} rows={3} value={ovForm.hotel_description} onChange={e => setOvForm(p => ({ ...p, hotel_description: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Internal Notes (not shown to customer)</label>
              <textarea className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white resize-none" style={inpSt} rows={2} value={ovForm.internal_notes} onChange={e => setOvForm(p => ({ ...p, internal_notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            {ovErr && <p className="text-xs font-medium text-red-600">{ovErr}</p>}
            <button onClick={saveOverview} disabled={ovSaving}
              className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: T }}>
              {ovSaving ? 'Saving…' : <><CheckCircle2 className="w-4 h-4" /> Save Changes</>}
            </button>
          </div>
        </div>
      )}

      {/* ═══ ROOM CATEGORIES TAB ═══ */}
      {tab === 'rooms' && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <p className="text-sm font-medium text-[#64748B]">{rooms.length} room categor{rooms.length !== 1 ? 'ies' : 'y'}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <HotelExcelIO
                hotelId={id}
                hotelName={hotel.hotel_name}
                rooms={rooms}
                rates={rates}
                mealPlans={mealPlans}
                onDone={loadRates}
              />
              <button onClick={openAddRoom} className="flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
                <Plus className="w-4 h-4" /> Add Room Category
              </button>
            </div>
          </div>

          {rooms.length === 0 ? (
            <div className="bg-white rounded-2xl py-16 text-center" style={card}>
              <Bed className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
              <p className="font-semibold text-sm text-[#0F172A]">No room categories yet</p>
              <p className="text-sm mt-1 text-[#64748B]">Add a room category to start entering rates</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rooms.map(room => {
                const roomRates = ratesForRoom(room.id);
                const isOpen = expanded.has(room.id);
                return (
                  <div key={room.id} className="bg-white rounded-2xl overflow-hidden" style={card}>
                    {/* Room header row */}
                    <div className="flex items-center gap-3 px-5 py-3.5" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(room.id)}>
                      {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-[#94A3B8]" /> : <ChevronRight className="w-4 h-4 flex-shrink-0 text-[#94A3B8]" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[#0F172A]">{room.room_category_name}</span>
                          {room.bed_type && <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{room.bed_type}</span>}
                          {room.cwb_allowed && <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>CWB</span>}
                          {room.cwob_allowed && <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>CWOB</span>}
                          {room.extra_bed_allowed && <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: '#EDE9FE', color: '#6D28D9' }}>Extra Bed</span>}
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          Max {room.max_adults} adults · {room.max_children} children · {room.max_total_occupancy} total · {roomRates.length} rate{roomRates.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEditRoom(room)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#134956]"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteRoom(room.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626]"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    {/* Expanded rates */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid #F1F5F9' }}>
                        {roomRates.length === 0 ? (
                          <div className="py-8 text-center">
                            <p className="text-sm text-[#94A3B8]">No rates added yet</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                  {['Season','Valid From','Valid To','Meal Plan','Solo','Double','Triple','Quad','CWB','CWOB','Wknd','Tax',''].map(h => (
                                    <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider whitespace-nowrap text-[#64748B]">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {roomRates.map(rate => (
                                  <tr key={rate.id} className="hover:bg-[#F8FAFC]" style={{ borderBottom: '1px solid #F1F5F9' }}>
                                    <td className="px-3 py-2 font-medium text-[#0F172A] whitespace-nowrap">{rate.season_name || '—'}</td>
                                    <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{fmtDate(rate.valid_from)}</td>
                                    <td className="px-3 py-2 text-[#64748B] whitespace-nowrap">{fmtDate(rate.valid_to)}</td>
                                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-md font-semibold" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>{rate.meal_plan.code}</span></td>
                                    <td className="px-3 py-2 font-medium text-[#0F172A] whitespace-nowrap">{fmt(rate.single_occupancy_cost)}</td>
                                    <td className="px-3 py-2 font-medium text-[#0F172A] whitespace-nowrap">{fmt(rate.double_occupancy_cost)}</td>
                                    <td className="px-3 py-2 text-[#64748B]">{rate.triple_occupancy_cost ? fmt(rate.triple_occupancy_cost) : '—'}</td>
                                    <td className="px-3 py-2 text-[#64748B]">{rate.quad_occupancy_cost ? fmt(rate.quad_occupancy_cost) : '—'}</td>
                                    <td className="px-3 py-2 text-[#64748B]">{rate.child_with_bed_cost ? fmt(rate.child_with_bed_cost) : '—'}</td>
                                    <td className="px-3 py-2 text-[#64748B]">{rate.child_without_bed_cost ? fmt(rate.child_without_bed_cost) : '—'}</td>
                                    <td className="px-3 py-2 text-[#64748B]">{rate.weekend_surcharge ? fmt(rate.weekend_surcharge) : '—'}</td>
                                    <td className="px-3 py-2">
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={rate.tax_included ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F1F5F9', color: '#64748B' }}>
                                        {rate.tax_included ? 'Incl.' : 'Excl.'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex gap-1">
                                        <button onClick={() => openEditRate(rate)} className="w-6 h-6 rounded flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#134956]"><Pencil className="w-3 h-3" /></button>
                                        <button onClick={() => deleteRate(rate.id)} className="w-6 h-6 rounded flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626]"><Trash2 className="w-3 h-3" /></button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                          <button onClick={() => openAddRate(room.id)} className="flex items-center gap-1.5 text-xs font-semibold hover:opacity-80" style={{ color: T }}>
                            <Plus className="w-3.5 h-3.5" /> Add Rate for {room.room_category_name}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ IMAGES TAB ═══ */}
      {tab === 'images' && (
        <div className="bg-white rounded-2xl p-6" style={card}>
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#0F172A] mb-1">Hotel Images</p>
            <p className="text-xs text-[#64748B]">First image is used as the hero. Upload images directly — they are stored on AWS S3.</p>
          </div>

          {/* Upload using S3 */}
          <div className="mb-6">
            <ImageUploader
              folder="hotels"
              placeholder="Upload hotel photo (click or drag & drop)"
              sizeHint="1200 × 800 px (3:2) — shown in package cards"
              onChange={async (url) => {
                if (!url || !hotel) return;
                const newImages = [...(hotel.images ?? []), url];
                setImagesSaving(true);
                const res = await fetch(`/api/v1/hotels/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: newImages }) });
                const d = await res.json();
                if (d.success) { setHotel(prev => prev ? { ...prev, images: newImages } : prev); showToast('Image uploaded & saved!'); }
                else showToast('Failed to save image', 'error');
                setImagesSaving(false);
              }}
            />
          </div>

          {/* Image grid */}
          {!hotel.images || hotel.images.length === 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ border: '2px dashed #E2E8F0' }}>
              <ImageIcon className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
              <p className="text-sm font-medium text-[#64748B]">No images added yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {hotel.images.map((url, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Hotel ${i+1}`} className="w-full h-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: T }}>Hero</span>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {i !== 0 && (
                      <button onClick={() => moveImageToFirst(i)} className="text-[10px] font-bold px-2 py-1 rounded-md bg-white text-[#134956]">Set Hero</button>
                    )}
                    <button onClick={() => removeImage(i)} className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-[#DC2626]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ ROOM CATEGORY MODAL ═══ */}
      <Modal open={showRoomForm} onClose={() => setShowRoomForm(false)} title={editRoom ? 'Edit Room Category' : 'Add Room Category'} maxWidth="max-w-xl">
        {roomErr && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{roomErr}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={lbl}>Room Category Name <span className="text-red-500">*</span></label>
            <input className={inp} style={inpSt} value={roomForm.room_category_name} onChange={e => setRoomForm(p => ({ ...p, room_category_name: e.target.value }))} placeholder="Deluxe Lake View" />
          </div>
          <div>
            <label className={lbl}>Max Adults</label>
            <input type="number" className={inp} style={inpSt} min={1} max={6} value={roomForm.max_adults} onChange={e => setRoomForm(p => ({ ...p, max_adults: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={lbl}>Max Children</label>
            <input type="number" className={inp} style={inpSt} min={0} max={4} value={roomForm.max_children} onChange={e => setRoomForm(p => ({ ...p, max_children: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={lbl}>Max Total Occupancy</label>
            <input type="number" className={inp} style={inpSt} min={1} value={roomForm.max_total_occupancy} onChange={e => setRoomForm(p => ({ ...p, max_total_occupancy: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={lbl}>Bed Type</label>
            <select className={sel} style={inpSt} value={roomForm.bed_type} onChange={e => setRoomForm(p => ({ ...p, bed_type: e.target.value }))}>
              <option value="">Select…</option>
              {BED_TYPES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>Description</label>
            <textarea className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white resize-none" style={inpSt} rows={2} value={roomForm.description} onChange={e => setRoomForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="col-span-2 flex gap-6">
            {([['extra_bed_allowed', 'Extra Bed Allowed'], ['cwb_allowed', 'CWB (Child with Bed)'], ['cwob_allowed', 'CWOB (Child without Bed)']] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={roomForm[key]} onChange={e => setRoomForm(p => ({ ...p, [key]: e.target.checked }))} className="rounded" />
                <span className="text-sm text-[#334155]">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowRoomForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={saveRoom} disabled={roomSaving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: T }}>{roomSaving ? 'Saving…' : editRoom ? 'Update' : 'Add Room'}</button>
        </div>
      </Modal>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white transition-all"
          style={{ backgroundColor: toast.type === 'success' ? '#16a34a' : '#DC2626', minWidth: 220 }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {toast.msg}
        </div>
      )}

      {/* ═══ RATE MODAL ═══ */}
      <Modal open={showRateForm} onClose={() => setShowRateForm(false)} title={editRate ? 'Edit Rate' : 'Add Rate'} subtitle={rooms.find(r => r.id === rateForRoom)?.room_category_name} maxWidth="max-w-2xl">
        {rateErr && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{rateErr}</div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="col-span-2 sm:col-span-3">
            <label className={lbl}>Season Name</label>
            <input className={inp} style={inpSt} value={rateForm.season_name} onChange={e => setRateForm(p => ({ ...p, season_name: e.target.value }))} placeholder="Peak Season 2025" />
          </div>
          <div>
            <label className={lbl}>Valid From <span className="text-red-500">*</span></label>
            <input type="date" className={inp} style={inpSt} value={rateForm.valid_from} onChange={e => setRateForm(p => ({ ...p, valid_from: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Valid To <span className="text-red-500">*</span></label>
            <input type="date" className={inp} style={inpSt} value={rateForm.valid_to} onChange={e => setRateForm(p => ({ ...p, valid_to: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Meal Plan <span className="text-red-500">*</span></label>
            <select className={sel} style={inpSt} value={rateForm.meal_plan_id} onChange={e => setRateForm(p => ({ ...p, meal_plan_id: e.target.value }))}>
              <option value="">Select…</option>
              {mealPlans.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-3 pt-2" style={{ borderTop: '1px solid #F1F5F9' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] mb-3">Occupancy Pricing (per room per night)</p>
          </div>
          <div>
            <label className={lbl}>Solo (1 adult) <span className="text-red-500">*</span></label>
            <input type="number" className={inp} style={inpSt} value={rateForm.single_occupancy_cost} onChange={e => setRateForm(p => ({ ...p, single_occupancy_cost: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className={lbl}>Double (2 adults) <span className="text-red-500">*</span></label>
            <input type="number" className={inp} style={inpSt} value={rateForm.double_occupancy_cost} onChange={e => setRateForm(p => ({ ...p, double_occupancy_cost: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <label className={lbl}>Triple (3 adults)</label>
            <input type="number" className={inp} style={inpSt} value={rateForm.triple_occupancy_cost} onChange={e => setRateForm(p => ({ ...p, triple_occupancy_cost: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className={lbl}>Quad (4 adults)</label>
            <input type="number" className={inp} style={inpSt} value={rateForm.quad_occupancy_cost} onChange={e => setRateForm(p => ({ ...p, quad_occupancy_cost: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className={lbl}>Extra Adult</label>
            <input type="number" className={inp} style={inpSt} value={rateForm.extra_adult_cost} onChange={e => setRateForm(p => ({ ...p, extra_adult_cost: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className={lbl}>Weekend Surcharge</label>
            <input type="number" className={inp} style={inpSt} value={rateForm.weekend_surcharge} onChange={e => setRateForm(p => ({ ...p, weekend_surcharge: e.target.value }))} placeholder="Per room" />
          </div>

          <div className="col-span-2 sm:col-span-3 pt-2" style={{ borderTop: '1px solid #F1F5F9' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] mb-3">Child Rates</p>
          </div>
          <div>
            <label className={lbl}>CWB (Child with Bed)</label>
            <input type="number" className={inp} style={inpSt} value={rateForm.child_with_bed_cost} onChange={e => setRateForm(p => ({ ...p, child_with_bed_cost: e.target.value }))} placeholder="Per child" />
          </div>
          <div>
            <label className={lbl}>CWOB (Child w/o Bed)</label>
            <input type="number" className={inp} style={inpSt} value={rateForm.child_without_bed_cost} onChange={e => setRateForm(p => ({ ...p, child_without_bed_cost: e.target.value }))} placeholder="Per child" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rateForm.tax_included} onChange={e => setRateForm(p => ({ ...p, tax_included: e.target.checked }))} className="rounded" />
              <span className="text-sm font-medium text-[#334155]">Tax Included in rates</span>
            </label>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className={lbl}>Notes</label>
            <input className={inp} style={inpSt} value={rateForm.notes} onChange={e => setRateForm(p => ({ ...p, notes: e.target.value }))} placeholder="E.g. Rates apply for direct bookings only" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button onClick={() => setShowRateForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{ border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={saveRate} disabled={rateSaving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: T }}>
            <Calendar className="w-3.5 h-3.5 inline mr-1.5" />{rateSaving ? 'Saving…' : editRate ? 'Update Rate' : 'Add Rate'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
