'use client';
import { useEffect, useState } from 'react';
import { Search, Phone, Mail, User, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';

interface Stage { id: string; name: string; color: string }
interface Lead  { id: string; name: string; status: string; created_at: string; stage: Stage | null }
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

const STATUS_COLORS: Record<string, string> = {
  NEW:       '#3B82F6',
  CONTACTED: '#F59E0B',
  QUOTED:    '#8B5CF6',
  WON:       '#22C55E',
  LOST:      '#EF4444',
};

export default function ContactsPage() {
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
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const res  = await fetch(`/api/v1/crm/contacts?${params}`);
    const data = await res.json();
    if (data.success) setContacts(data.data);
    setLoading(false);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Contacts</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>All CRM contacts — one contact per phone number</p>
        </div>
        <div className="text-sm font-medium px-3 py-1.5 rounded-full" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>
          {contacts.length} contacts
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
        <input
          type="text"
          placeholder="Search by name, phone or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ border: '1px solid #E2E8F0', backgroundColor: '#fff', color: '#0F172A' }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16">
          <User className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>No contacts found</p>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Contacts are created automatically when a lead is added.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map(contact => {
            const isOpen = expanded.has(contact.id);
            return (
              <div key={contact.id} className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                {/* Contact row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: contact.is_converted ? '#22C55E' : '#134956' }}>
                    {contact.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{contact.name}</p>
                      {contact.is_converted && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>Converted</span>
                      )}
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
                  </div>

                  {/* Owner */}
                  <div className="hidden md:flex flex-col items-end gap-1 text-right">
                    <span className="text-xs" style={{ color: '#94A3B8' }}>Owner</span>
                    <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{contact.owner?.name ?? '—'}</span>
                  </div>

                  {/* Deals count + expand */}
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
                      <p className="px-5 py-3 text-xs" style={{ color: '#94A3B8' }}>No deals yet.</p>
                    ) : (
                      <div className="px-5 py-3 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>Deals</p>
                        {contact.leads.map(lead => (
                          <div key={lead.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-2.5" style={{ border: '1px solid #E2E8F0' }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{lead.name}</p>
                              <p className="text-xs" style={{ color: '#94A3B8' }}>
                                {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                            {lead.stage ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white flex-shrink-0"
                                style={{ backgroundColor: lead.stage.color }}>
                                {lead.stage.name}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
                                style={{ backgroundColor: STATUS_COLORS[lead.status] ?? '#94A3B8', color: '#fff' }}>
                                {lead.status}
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
