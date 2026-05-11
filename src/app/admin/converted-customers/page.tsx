'use client';
import { useEffect, useState } from 'react';
import { Search, Phone, Mail, UserCheck, ExternalLink, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';

interface Stage { id: string; name: string; color: string }
interface Lead  { id: string; name: string; status: string; created_at: string; converted_at: string | null; stage: Stage | null }
interface Owner { id: string; name: string; email: string }

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  is_converted: boolean;
  converted_at: string | null;
  created_at: string;
  owner: Owner | null;
  leads: Lead[];
}

export default function ConvertedCustomersPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ converted: 'true' });
    if (search) params.set('search', search);
    try {
      const res  = await fetch(`/api/v1/crm/contacts?${params}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setContacts(list);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const safeContacts = Array.isArray(contacts) ? contacts : [];
  const totalDeals = safeContacts.reduce((sum, c) => sum + (Array.isArray(c.leads) ? c.leads.length : 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Converted Customers</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>Contacts with at least one won deal — use for marketing &amp; cross-selling</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>
          <UserCheck className="w-4 h-4" />
          {contacts.length} converted
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Customers',  value: contacts.length,  color: '#22C55E', bg: '#DCFCE7' },
          { label: 'Total Won Deals',  value: totalDeals,        color: '#3B82F6', bg: '#DBEAFE' },
          { label: 'Avg Deals / Cust', value: contacts.length ? (totalDeals / contacts.length).toFixed(1) : '0', color: '#8B5CF6', bg: '#EDE9FE' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl px-5 py-4 flex items-center gap-3" style={{ border: '1px solid #E2E8F0' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: s.bg }}>
              <TrendingUp className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: '#0F172A' }}>{s.value}</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
        <input
          type="text"
          placeholder="Search converted customers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ border: '1px solid #E2E8F0', backgroundColor: '#fff', color: '#0F172A' }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>Loading...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16">
          <UserCheck className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No converted customers yet</p>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Move a lead to the "Won ✓" stage to mark them as converted.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map(contact => {
            const isOpen = expanded.has(contact.id);
            return (
              <div key={contact.id} className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: '#22C55E' }}>
                    {contact.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{contact.name}</p>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>Won</span>
                    </div>
                    <div className="flex items-center gap-4 mt-0.5">
                      <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                        <Phone className="w-3 h-3" />{contact.phone}
                      </span>
                      {contact.email && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
                          <Mail className="w-3 h-3" />{contact.email}
                        </span>
                      )}
                    </div>
                    {contact.converted_at && (
                      <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                        Converted {new Date(contact.converted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Owner */}
                  <div className="hidden md:flex flex-col items-end gap-1 text-right">
                    <span className="text-xs" style={{ color: '#94A3B8' }}>Owner</span>
                    <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{contact.owner?.name ?? '—'}</span>
                  </div>

                  {/* Deals + expand */}
                  <div className="flex items-center gap-3">
                    <div className="text-center hidden sm:block">
                      <p className="text-lg font-bold" style={{ color: '#0F172A' }}>{contact.leads.length}</p>
                      <p className="text-[10px]" style={{ color: '#94A3B8' }}>deals</p>
                    </div>
                    <button
                      onClick={() => toggleExpand(contact.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F8FAFC]"
                      style={{ color: '#64748B' }}
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Deals panel */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                    {contact.leads.length === 0 ? (
                      <p className="px-5 py-3 text-xs" style={{ color: '#94A3B8' }}>No deals.</p>
                    ) : (
                      <div className="px-5 py-3 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>All Deals</p>
                        {contact.leads.map(lead => (
                          <div key={lead.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-2.5" style={{ border: '1px solid #E2E8F0' }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{lead.name}</p>
                              <p className="text-xs" style={{ color: '#94A3B8' }}>
                                {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                            {lead.stage && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white flex-shrink-0"
                                style={{ backgroundColor: lead.stage.color }}>
                                {lead.stage.name}
                              </span>
                            )}
                            <a
                              href={`/admin/pipelines?lead=${lead.id}`}
                              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F8FAFC] flex-shrink-0"
                              style={{ color: '#94A3B8' }}
                              title="View in pipeline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
