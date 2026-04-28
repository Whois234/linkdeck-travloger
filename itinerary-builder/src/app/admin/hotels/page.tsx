'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { Modal } from '@/components/admin/Modal';
import { Plus, Search, Star, ChevronRight, Building2 } from 'lucide-react';

const HOTEL_TYPES = ['HOTEL','RESORT','VILLA','HOMESTAY','HOUSEBOAT'];
const HOTEL_CATS  = ['BUDGET','STANDARD','DELUXE','PREMIUM','LUXURY'];

interface Dest  { id: string; name: string }
interface Hotel {
  id: string; hotel_name: string; hotel_type: string; category_label: string;
  star_rating?: number | null; destination: { name: string }; destination_id: string;
  status: boolean; address?: string | null; images?: string[] | null;
  room_categories?: { id: string }[];
}

const EMPTY = { hotel_name:'', destination_id:'', hotel_type:'HOTEL', category_label:'STANDARD', star_rating:'3', address:'', hotel_description:'' };
const inp   = 'w-full h-9 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white';
const sel   = 'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white appearance-none';
const lbl   = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]';
const inpSt = { borderColor:'#E2E8F0' };
const T     = '#134956';

const CAT_BADGE: Record<string,{bg:string;text:string}> = {
  BUDGET:   {bg:'#F1F5F9',text:'#475569'}, STANDARD:{bg:'#DBEAFE',text:'#1D4ED8'},
  DELUXE:   {bg:'#CCFBF1',text:'#0F766E'}, PREMIUM: {bg:'#EDE9FE',text:'#6D28D9'},
  LUXURY:   {bg:'#FEF3C7',text:'#B45309'},
};

export default function HotelsPage() {
  const router  = useRouter();
  const [rows, setRows]       = useState<Hotel[]>([]);
  const [dests, setDests]     = useState<Dest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({...EMPTY});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [catFilter, setCatFilter] = useState('');

  async function load() {
    setLoading(true);
    const [hr, dr] = await Promise.all([fetch('/api/v1/hotels'), fetch('/api/v1/destinations')]);
    const [hd, dd] = await Promise.all([hr.json(), dr.json()]);
    if (hd.success) setRows(hd.data);
    if (dd.success) setDests(dd.data);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  async function handleSave() {
    setSaving(true); setError('');
    const payload = { ...form, star_rating: form.star_rating ? Number(form.star_rating) : null };
    const res  = await fetch('/api/v1/hotels',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Save failed'); }
    else { setShowForm(false); load(); router.push(`/admin/hotels/${data.data.id}`); }
    setSaving(false);
  }

  const filtered = rows.filter(r => {
    const matchQ = !search || r.hotel_name.toLowerCase().includes(search.toLowerCase()) || r.destination.name.toLowerCase().includes(search.toLowerCase());
    const matchC = !catFilter || r.category_label === catFilter;
    return matchQ && matchC;
  });

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Hotels"
        subtitle="Manage hotel inventory, room categories and rates"
        crumbs={[{label:'Admin',href:'/admin'},{label:'Hotels'}]}
        action={
          <button onClick={()=>{ setForm({...EMPTY}); setError(''); setShowForm(true); }}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90"
            style={{backgroundColor:T}}>
            <Plus className="w-4 h-4" /> Add Hotel
          </button>
        }
      />

      {/* Filters bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search hotels…"
            className="w-64 h-9 pl-9 pr-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
            style={inpSt} />
        </div>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
          className="h-9 px-3 pr-8 rounded-lg border text-sm focus:outline-none bg-white appearance-none"
          style={inpSt}>
          <option value="">All Categories</option>
          {HOTEL_CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <p className="text-sm text-[#94A3B8] ml-auto">{loading ? 'Loading…' : `${filtered.length} hotel${filtered.length!==1?'s':''}`}</p>
      </div>

      {/* Hotel cards grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:T}} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl" style={{border:'1px solid #E2E8F0'}}>
          <Building2 className="w-10 h-10 mx-auto mb-3 text-[#CBD5E1]" />
          <p className="font-semibold text-sm text-[#0F172A]">No hotels found</p>
          <p className="text-sm mt-1 text-[#64748B]">{search||catFilter ? 'Try a different search' : 'Add your first hotel'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(h=>{
            const cat  = CAT_BADGE[h.category_label] ?? CAT_BADGE.STANDARD;
            const hero = h.images?.[0];
            const roomCount = h.room_categories?.length ?? 0;
            return (
              <div key={h.id} onClick={()=>router.push(`/admin/hotels/${h.id}`)}
                className="bg-white rounded-2xl overflow-hidden cursor-pointer group transition-all hover:-translate-y-0.5"
                style={{border:'1px solid #E2E8F0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
                {/* Hero image */}
                <div className="aspect-video bg-[#F1F5F9] relative overflow-hidden">
                  {hero ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hero} alt={h.hotel_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="w-8 h-8 text-[#CBD5E1]" />
                    </div>
                  )}
                  <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{backgroundColor:cat.bg, color:cat.text}}>{h.category_label}</span>
                </div>
                {/* Card body */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm text-[#0F172A] leading-tight line-clamp-1">{h.hotel_name}</p>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 text-[#CBD5E1] group-hover:text-[#134956] transition-colors mt-0.5" />
                  </div>
                  <p className="text-xs text-[#94A3B8] mb-2">{h.destination.name} · {h.hotel_type}</p>
                  <div className="flex items-center gap-3">
                    {h.star_rating ? (
                      <div className="flex items-center gap-0.5">
                        {Array.from({length:h.star_rating}).map((_,i)=>(
                          <Star key={i} className="w-3 h-3 fill-current text-amber-400" />
                        ))}
                      </div>
                    ) : null}
                    <span className="text-[11px] text-[#94A3B8]">{roomCount} room type{roomCount!==1?'s':''}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Hotel Modal */}
      <Modal open={showForm} onClose={()=>setShowForm(false)} title="Add New Hotel" subtitle="Fill in the basic details — you can add rooms and rates after creating." maxWidth="max-w-lg">
        {error && <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{backgroundColor:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA'}}>{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={lbl}>Hotel Name <span className="text-red-500">*</span></label>
            <input className={inp} style={inpSt} value={form.hotel_name} onChange={e=>setForm(p=>({...p,hotel_name:e.target.value}))} placeholder="The Leela Palace" />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Destination <span className="text-red-500">*</span></label>
            <select className={sel} style={inpSt} value={form.destination_id} onChange={e=>setForm(p=>({...p,destination_id:e.target.value}))}>
              <option value="">Select destination…</option>
              {dests.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Hotel Type</label>
            <select className={sel} style={inpSt} value={form.hotel_type} onChange={e=>setForm(p=>({...p,hotel_type:e.target.value}))}>
              {HOTEL_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Category</label>
            <select className={sel} style={inpSt} value={form.category_label} onChange={e=>setForm(p=>({...p,category_label:e.target.value}))}>
              {HOTEL_CATS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Star Rating</label>
            <select className={sel} style={inpSt} value={form.star_rating} onChange={e=>setForm(p=>({...p,star_rating:e.target.value}))}>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{n} Star{n>1?'s':''}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Address</label>
            <input className={inp} style={inpSt} value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="Full address" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-5" style={{borderTop:'1px solid #F1F5F9'}}>
          <button onClick={()=>setShowForm(false)} className="h-9 px-4 rounded-lg text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]" style={{border:'1px solid #E2E8F0'}}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90" style={{backgroundColor:T}}>
            {saving ? 'Creating…' : 'Create & Configure →'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
