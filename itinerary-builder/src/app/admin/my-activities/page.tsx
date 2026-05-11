'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/PageHeader';
import { CheckCircle2, Clock, AlertTriangle, Bell, Phone, Calendar, FileText, Coffee, Users as UsersIcon, Loader2 } from 'lucide-react';

interface TaskLead { id: string; name: string; phone: string }
interface TaskOwner { id: string; name: string; email: string }
interface Task {
  id: string; type: string; notes: string | null; status: string;
  due_time: string; created_at: string; notified: boolean; is_overdue: boolean;
  lead: TaskLead; owner: TaskOwner | null;
}
interface Notif {
  id: string; message: string; event_type: string | null;
  is_read: boolean; created_at: string; quote_id: string | null;
}
interface ApiResp {
  tasks: Task[]; notifications: Notif[]; unreadCount: number;
  scope: 'me' | 'all'; canSeeAll: boolean; currentUserId: string;
}

const TYPE_LABEL: Record<string, string> = {
  call: 'Call', follow_up: 'Follow-up', send_quote: 'Send Quote', meeting: 'Meeting', other: 'Other',
};
const TYPE_ICON: Record<string, React.ElementType> = {
  call: Phone, follow_up: Clock, send_quote: FileText, meeting: UsersIcon, other: Coffee,
};
const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#FEF3C7', text: '#B45309', label: 'Pending' },
  overdue:   { bg: '#FEE2E2', text: '#DC2626', label: 'Overdue' },
  done:      { bg: '#DCFCE7', text: '#15803D', label: 'Completed' },
  completed: { bg: '#DCFCE7', text: '#15803D', label: 'Completed' },
};

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MyActivitiesPage() {
  const [tab, setTab] = useState<'tasks' | 'notifications'>('tasks');
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'done'>('pending');
  const [scope, setScope] = useState<'me' | 'all'>('me');
  const [completing, setCompleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    params.set('scope', scope);
    const res = await fetch(`/api/v1/my-activities?${params}`);
    const d = await res.json();
    if (d.success) setData(d.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default scope to "me" when the user can't see all
  useEffect(() => {
    if (data && !data.canSeeAll && scope !== 'me') setScope('me');
  }, [data, scope]);

  async function completeTask(t: Task) {
    setCompleting(t.id);
    await fetch(`/api/v1/leads/${t.lead.id}/tasks?taskId=${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    setCompleting(null);
    load();
  }

  async function markAllNotifsRead() {
    await fetch('/api/v1/notifications/read-all', { method: 'POST' });
    load();
  }

  const tasks = data?.tasks ?? [];
  const notifs = data?.notifications ?? [];

  const stats = useMemo(() => {
    const now = new Date();
    let pending = 0, overdue = 0, done = 0;
    tasks.forEach(t => {
      if (t.status === 'done' || t.status === 'completed') done++;
      else if (t.status === 'overdue' || (t.status === 'pending' && new Date(t.due_time) < now)) overdue++;
      else pending++;
    });
    return { pending, overdue, done, total: tasks.length };
  }, [tasks]);

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="My Activities"
        subtitle="Tasks, reminders and notifications assigned to you"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'My Activities' }]}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Open',    value: stats.pending, color: '#B45309', bg: '#FEF3C7', Icon: Clock },
          { label: 'Overdue', value: stats.overdue, color: '#DC2626', bg: '#FEE2E2', Icon: AlertTriangle },
          { label: 'Done',    value: stats.done,    color: '#15803D', bg: '#DCFCE7', Icon: CheckCircle2 },
          { label: 'Unread',  value: data?.unreadCount ?? 0, color: '#1D4ED8', bg: '#DBEAFE', Icon: Bell },
        ].map(({ label, value, color, bg, Icon }) => (
          <div key={label} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3" style={{ border: '1px solid #E2E8F0' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: '#0F172A' }}>{value}</p>
              <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#94A3B8' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + filters */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
        <div className="flex items-center justify-between px-5 py-3 flex-wrap gap-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: '#F1F5F9' }}>
            {(['tasks', 'notifications'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize"
                style={{
                  backgroundColor: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? '#0F172A' : '#64748B',
                  boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}>
                {t === 'tasks' ? `Tasks${stats.total ? ` (${stats.total})` : ''}` : `Notifications${(data?.unreadCount ?? 0) ? ` (${data?.unreadCount})` : ''}`}
              </button>
            ))}
          </div>

          {tab === 'tasks' && (
            <div className="flex items-center gap-2 flex-wrap">
              {data?.canSeeAll && (
                <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: '#F1F5F9' }}>
                  {(['me', 'all'] as const).map(s => (
                    <button key={s} onClick={() => setScope(s)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all capitalize"
                      style={{
                        backgroundColor: scope === s ? '#fff' : 'transparent',
                        color: scope === s ? '#0F172A' : '#64748B',
                        boxShadow: scope === s ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}>
                      {s === 'me' ? 'My Tasks' : 'All Users'}
                    </button>
                  ))}
                </div>
              )}
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-8 px-3 rounded-lg border text-xs font-medium bg-white"
                style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
                <option value="pending">Open</option>
                <option value="overdue">Overdue</option>
                <option value="done">Completed</option>
                <option value="all">All Statuses</option>
              </select>
            </div>
          )}
          {tab === 'notifications' && (data?.unreadCount ?? 0) > 0 && (
            <button onClick={markAllNotifsRead}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#F8FAFC]"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: '#134956' }} />
          </div>
        ) : tab === 'tasks' ? (
          tasks.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No tasks here</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                {statusFilter === 'pending' ? 'You\'re all caught up.' : `No ${statusFilter} tasks.`}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Task', 'Related Lead', 'Due', 'Status', ...(scope === 'all' ? ['Owner'] : []), 'Created', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => {
                  const Icon = TYPE_ICON[t.type] ?? Coffee;
                  const effectiveStatus = t.is_overdue ? 'overdue' : t.status;
                  const badge = STATUS_BADGE[effectiveStatus] ?? STATUS_BADGE.pending;
                  const isDone = t.status === 'done' || t.status === 'completed';
                  return (
                    <tr key={t.id} className="hover:bg-[#F8FAFC] transition-colors" style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0F7F9' }}>
                            <Icon className="w-4 h-4" style={{ color: '#134956' }} />
                          </div>
                          <div>
                            <p className="font-semibold" style={{ color: '#0F172A' }}>{TYPE_LABEL[t.type] ?? t.type}</p>
                            {t.notes && <p className="text-[11px] mt-0.5 truncate max-w-[280px]" style={{ color: '#94A3B8' }}>{t.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/admin/pipelines?lead=${t.lead.id}`} className="font-medium hover:underline" style={{ color: '#134956' }}>{t.lead.name}</Link>
                        <p className="text-[11px] font-mono" style={{ color: '#94A3B8' }}>{t.lead.phone}</p>
                      </td>
                      <td className="px-5 py-3 text-xs whitespace-nowrap" style={{ color: t.is_overdue ? '#DC2626' : '#64748B' }}>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {fmtDateTime(t.due_time)}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: badge.bg, color: badge.text }}>
                          {badge.label}
                        </span>
                      </td>
                      {scope === 'all' && (
                        <td className="px-5 py-3 text-xs" style={{ color: '#64748B' }}>
                          {t.owner ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                                {t.owner.name.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ color: '#0F172A' }}>{t.owner.name}</span>
                            </div>
                          ) : '—'}
                        </td>
                      )}
                      <td className="px-5 py-3 text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>{fmtDateTime(t.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        {!isDone && (
                          <button onClick={() => completeTask(t)} disabled={completing === t.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-[#DCFCE7] disabled:opacity-50"
                            style={{ border: '1px solid #BBF7D0', color: '#15803D' }}>
                            {completing === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : (
          notifs.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
              <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>No notifications</p>
            </div>
          ) : (
            <div>
              {notifs.map(n => (
                <Link key={n.id} href={n.quote_id ? `/admin/quotes/${n.quote_id}` : '/admin/my-activities'}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-[#F8FAFC] transition-colors"
                  style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: n.is_read ? '#CBD5E1' : '#3B82F6' }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.is_read ? '' : 'font-semibold'}`} style={{ color: n.is_read ? '#64748B' : '#0F172A' }}>{n.message}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>{fmtDateTime(n.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
