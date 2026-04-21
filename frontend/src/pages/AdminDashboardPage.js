import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import {
  Archive,
  Download,
  Eye,
  FileText,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LinkIcon,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis
} from 'recharts';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainingSeconds = value % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatSessionOrdinal(value) {
  const number = Number(value || 0);
  if (!number) return '--';
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  const suffixMap = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${number}${suffixMap[number % 10] || 'th'}`;
}

function csvEscape(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function TravlogerMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="#144a57"/>
      <path d="M20 8 L32 14 L32 26 L20 32 L8 26 L8 14 Z" fill="none" stroke="#E8A020" strokeWidth="2"/>
      <circle cx="20" cy="20" r="5" fill="#E8A020"/>
      <path d="M20 8 L20 15 M20 25 L20 32 M8 14 L14 17 M26 23 L32 26 M8 26 L14 23 M26 17 L32 14" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const MODULES = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'pdfs', label: 'PDFs', icon: FileText },
  { key: 'users', label: 'Users', icon: ShieldCheck },
];

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState({ total_users: 0, total_pdfs: 0, total_links: 0, opened_links: 0 });
  const [analytics, setAnalytics] = useState({
    summary: {},
    links_by_pdf: [],
    opens_by_hour: [],
    time_by_pdf: [],
    archived_time_by_pdf: [],
    user_daily_activity: [],
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [activeModule, setActiveModule] = useState('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [resettingId, setResettingId] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState('');
  const [deletingPdfId, setDeletingPdfId] = useState('');
  const [reactivatingPdfId, setReactivatingPdfId] = useState('');
  const [permanentlyDeletingPdfId, setPermanentlyDeletingPdfId] = useState('');
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState('');

  const fetchAdminData = useCallback(async () => {
    try {
      const analyticsParams = analyticsDays === -1
        ? { days: 0, start_date: customStartDate || undefined, end_date: customEndDate || undefined }
        : { days: analyticsDays };

      const [usersRes, statsRes, contactsRes, analyticsRes, activityRes] = await Promise.all([
        axios.get(`${API}/admin/users`, { withCredentials: true }),
        axios.get(`${API}/admin/stats`, { withCredentials: true }),
        axios.get(`${API}/admin/contacts`, { withCredentials: true }),
        axios.get(`${API}/admin/analytics`, {
          withCredentials: true,
          params: analyticsParams,
        }),
        axios.get(`${API}/admin/recent-activity`, {
          withCredentials: true,
          params: { limit: 12 },
        }),
      ]);

      setUsers(usersRes.data || []);
      setStats(statsRes.data || {});
      setContacts(contactsRes.data || []);
      setAnalytics(analyticsRes.data || {});
      setRecentActivity(activityRes.data?.items || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  }, [analyticsDays, customStartDate, customEndDate]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const userCount = useMemo(() => users.length, [users]);
  const contactCount = useMemo(() => contacts.length, [contacts]);

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile' || deviceType === 'Tablet') return Smartphone;
    return Monitor;
  };

  const goToModule = (key) => {
    setActiveModule(key);
    setNavOpen(false);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post(`${API}/admin/users`, {
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
      }, { withCredentials: true });
      toast.success('User created with temporary password');
      setCreateOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (item) => {
    const newPassword = window.prompt(`Enter a new password for ${item.email}`);
    if (!newPassword) return;

    setResettingId(item.id);
    try {
      await axios.post(`${API}/admin/users/${item.id}/reset-password`, {
        password: newPassword,
      }, { withCredentials: true });
      toast.success('Password reset successfully');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setResettingId('');
    }
  };

  const handleDeleteRecentSession = async (sessionId) => {
    if (!sessionId) return;
    if (!window.confirm('Delete this recent session from admin activity?')) return;
    setDeletingSessionId(sessionId);
    try {
      await axios.delete(`${API}/admin/recent-activity/${sessionId}`, { withCredentials: true });
      setRecentActivity((current) => current.filter((item) => item.session_id !== sessionId));
      toast.success('Session deleted');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete session');
    } finally {
      setDeletingSessionId('');
    }
  };

  const handleDeleteAnalyticsPdf = async (pdfId) => {
    if (!pdfId) return;
    if (!window.confirm('Archive this PDF from admin analytics? Existing customer links will still work.')) return;
    setDeletingPdfId(pdfId);
    try {
      await axios.delete(`${API}/admin/pdfs/${pdfId}`, { withCredentials: true });
      toast.success('PDF archived');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to archive PDF');
    } finally {
      setDeletingPdfId('');
    }
  };

  const handleReactivatePdf = async (pdfId) => {
    if (!pdfId) return;
    setReactivatingPdfId(pdfId);
    try {
      await axios.post(`${API}/admin/pdfs/${pdfId}/reactivate`, {}, { withCredentials: true });
      toast.success('PDF reactivated');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reactivate PDF');
    } finally {
      setReactivatingPdfId('');
    }
  };

  const handlePermanentlyDeletePdf = async (pdfId) => {
    if (!pdfId) return;
    if (!window.confirm('Permanently delete this archived PDF? This cannot be undone.')) return;
    setPermanentlyDeletingPdfId(pdfId);
    try {
      await axios.delete(`${API}/admin/pdfs/${pdfId}/permanent`, { withCredentials: true });
      toast.success('PDF permanently deleted');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to permanently delete PDF');
    } finally {
      setPermanentlyDeletingPdfId('');
    }
  };

  const exportRecentActivityCsv = () => {
    const rows = [
      ['Customer Name', 'Phone', 'PDF', 'Session', 'Time Spent', 'Opened At', 'Device', 'Platform', 'Browser', 'Location'],
      ...recentActivity.map((item) => [
        item.customer_name,
        item.customer_phone,
        item.pdf_name,
        `${formatSessionOrdinal(item.session_number)} session`,
        formatDuration(item.duration_seconds),
        formatDate(item.started_at),
        item.device_type || '--',
        item.platform || '--',
        item.browser || '--',
        item.location_label || '--',
      ]),
    ];
    downloadCsv('travloger-admin-recent-activity.csv', rows);
    toast.success('Recent activity CSV downloaded');
  };

  const openEditContact = (contact) => {
    setEditingContact(contact);
    setContactName(contact.customer_name || '');
    setContactPhone(contact.customer_phone || '');
    setContactDialogOpen(true);
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!editingContact?.id) return;
    setSavingContact(true);
    try {
      await axios.put(`${API}/admin/contacts/${editingContact.id}`, {
        customer_name: contactName,
        customer_phone: contactPhone,
      }, { withCredentials: true });
      toast.success('Contact updated');
      setContactDialogOpen(false);
      setEditingContact(null);
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update contact');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!contactId) return;
    if (!window.confirm('Delete this contact from admin contacts?')) return;
    setDeletingContactId(contactId);
    try {
      await axios.delete(`${API}/admin/contacts/${contactId}`, { withCredentials: true });
      toast.success('Contact deleted');
      setContacts((current) => current.filter((item) => item.id !== contactId));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete contact');
    } finally {
      setDeletingContactId('');
    }
  };

  const renderStatsGrid = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {[
        { label: 'Users', value: stats.total_users, icon: Users, accent: 'var(--teal)' },
        { label: 'Contacts', value: contactCount, icon: Users, accent: '#475569' },
        { label: 'PDFs', value: stats.total_pdfs, icon: FileText, accent: 'var(--gold)' },
        { label: 'Opened', value: stats.opened_links, icon: Eye, accent: '#16a34a' },
      ].map((s) => (
        <div key={s.label} className="bg-white rounded-xl p-5 border" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{s.label}</span>
            <s.icon className="w-4 h-4" style={{ color: s.accent }} />
          </div>
          <span className="text-3xl font-black" style={{ color: s.accent }}>{s.value || 0}</span>
        </div>
      ))}
    </div>
  );

  const renderDashboardModule = () => (
    <>
      {renderStatsGrid()}
      <section className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Itinerary Analytics</h2>
            <p className="text-sm text-slate-500 mt-1">Track link creation, open timing, and average viewing time.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={analyticsDays}
              onChange={e => setAnalyticsDays(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={0}>All time</option>
              <option value={-1}>Custom range</option>
            </select>
            {analyticsDays === -1 && (
              <>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="h-9 w-[150px] rounded-lg border-slate-200 text-sm"
                />
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="h-9 w-[150px] rounded-lg border-slate-200 text-sm"
                />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Total Opens', value: analytics.summary?.total_opens || 0 },
            { label: 'Avg Opens / Link', value: analytics.summary?.avg_opens_per_link || 0 },
            { label: 'Tracked Sessions', value: analytics.summary?.tracked_sessions || 0 },
            { label: 'Avg Time Spent', value: formatDuration(analytics.summary?.avg_time_seconds || 0) },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-xl p-4 border" style={{ borderColor: '#e5e7eb' }}>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{item.label}</div>
              <div className="text-2xl font-black mt-2" style={{ color: 'var(--teal)' }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--teal)' }}>Links Created By PDF</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.links_by_pdf || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="pdf_name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip />
                  <Bar dataKey="links" fill="#144a57" name="Links" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="opens" fill="#E8A020" name="Opens" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--teal)' }}>When Customers Open Links</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.opens_by_hour || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip />
                  <Line type="monotone" dataKey="opens" stroke="#E8A020" strokeWidth={3} dot={{ r: 3 }} name="Opens" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5 mt-4" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-bold" style={{ color: 'var(--teal)' }}>User Link Creation By Day</h3>
              <p className="text-sm text-slate-500 mt-1">See which user created how many links on a given day and how many of those links were opened.</p>
            </div>
            {analyticsDays === -1 && (
              <Badge className="rounded-full" style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
                Custom range applied
              </Badge>
            )}
          </div>
          {(analytics.user_daily_activity || []).length === 0 ? (
            <div className="h-80 flex items-center justify-center text-center text-sm text-slate-400">
              No user link activity found for the selected date range.
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.user_daily_activity || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_label" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip
                    formatter={(value, name) => [value, name === 'links_created' ? 'Links Created' : name === 'opened_links' ? 'Opened Links' : 'Total Opens']}
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload;
                      return item ? `${item.date_label} · ${item.user_name}` : '';
                    }}
                  />
                  <Bar dataKey="links_created" fill="#144a57" name="Links Created" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="opened_links" fill="#E8A020" name="Opened Links" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border overflow-x-auto mt-4" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Recent Activity</h3>
                <p className="text-sm text-slate-500 mt-1">Latest customer opens with session order, watch time, device, and approximate location.</p>
              </div>
              <Button variant="outline" onClick={exportRecentActivityCsv} className="rounded-lg border-slate-200 text-slate-600">
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Customer</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Phone</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">PDF</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Session</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Time Spent</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Opened At</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Device</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Location</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentActivity.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">
                    No recent activity yet.
                  </TableCell>
                </TableRow>
              ) : recentActivity.map((item) => {
                const DeviceIcon = getDeviceIcon(item.device_type);
                return (
                  <TableRow key={item.session_id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                    <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{item.customer_name}</TableCell>
                    <TableCell className="text-sm text-slate-600">{item.customer_phone}</TableCell>
                    <TableCell className="text-sm text-slate-500 max-w-[220px] truncate">{item.pdf_name}</TableCell>
                    <TableCell className="text-sm text-slate-600">{formatSessionOrdinal(item.session_number)} session</TableCell>
                    <TableCell className="text-sm text-slate-600">{formatDuration(item.duration_seconds)}</TableCell>
                    <TableCell className="text-xs text-slate-400">{formatDate(item.started_at)}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <DeviceIcon className="w-4 h-4" />
                        <span>{item.device_type} · {item.platform}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {item.location_label ? (
                        <div className="flex items-center gap-2">
                          <Globe2 className="w-4 h-4" />
                          <span>{item.location_label}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300"> </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRecentSession(item.session_id)}
                        disabled={deletingSessionId === item.session_id}
                        className="rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                      >
                        {deletingSessionId === item.session_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );

  const renderContactsModule = () => (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Contacts</h2>
          <p className="text-sm text-slate-500 mt-1">All captured contacts across users. Admin can edit or delete contacts from here.</p>
        </div>
        <Badge className="rounded-full" style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
          {contactCount} contacts
        </Badge>
      </div>
      <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Contact</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Phone</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Owner</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Latest PDF</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Links</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Opened</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Total Opens</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Last Linked</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Last Opened</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-slate-400">
                  No contacts available yet.
                </TableCell>
              </TableRow>
            ) : contacts.map((contact) => (
              <TableRow key={contact.id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{contact.customer_name}</TableCell>
                <TableCell className="text-sm text-slate-600">{contact.customer_phone}</TableCell>
                <TableCell>
                  <div className="text-sm text-slate-600">{contact.user_name}</div>
                  <div className="text-xs text-slate-400">{contact.user_email}</div>
                </TableCell>
                <TableCell className="text-sm text-slate-500 max-w-[200px] truncate">{contact.latest_pdf_name || '--'}</TableCell>
                <TableCell className="text-sm text-slate-600">{contact.total_links || 0}</TableCell>
                <TableCell className="text-sm text-slate-600">{contact.opened_links || 0}</TableCell>
                <TableCell className="text-sm text-slate-600">{contact.total_opens || 0}</TableCell>
                <TableCell className="text-xs text-slate-400">{formatDate(contact.last_link_created_at)}</TableCell>
                <TableCell className="text-xs text-slate-400">{formatDate(contact.latest_opened_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditContact(contact)}
                      className="rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteContact(contact.id)}
                      disabled={deletingContactId === contact.id}
                      className="rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                    >
                      {deletingContactId === contact.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );

  const renderPdfsModule = () => (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>PDFs</h2>
        <p className="text-sm text-slate-500 mt-1">Manage active and archived PDFs from one place.</p>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
          <div>
            <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Active PDFs</h3>
            <p className="text-sm text-slate-500 mt-1">Only live PDFs stay here. Archived ones move to the separate section below.</p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">PDF</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Tracked Sessions</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Total Time</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Avg Time</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(analytics.time_by_pdf || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">No active PDF analytics yet.</TableCell>
              </TableRow>
            ) : (
              (analytics.time_by_pdf || []).map((item) => (
                <TableRow key={item.pdf_id || item.pdf_name} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                  <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{item.pdf_name}</TableCell>
                  <TableCell className="text-sm text-slate-600">{item.sessions}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatDuration(item.total_time_seconds)}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatDuration(item.avg_time_seconds)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAnalyticsPdf(item.pdf_id)}
                      disabled={!item.pdf_id || deletingPdfId === item.pdf_id}
                      className="rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      {deletingPdfId === item.pdf_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <div>
              <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Archived PDFs</h3>
              <p className="text-sm text-slate-500 mt-1">Archived PDFs stay here until you reactivate or permanently delete them.</p>
            </div>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">PDF</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Archived At</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Tracked Sessions</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Total Time</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Avg Time</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(analytics.archived_time_by_pdf || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">No archived PDFs yet.</TableCell>
              </TableRow>
            ) : (
              (analytics.archived_time_by_pdf || []).map((item) => (
                <TableRow key={`archived-${item.pdf_id || item.pdf_name}`} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                  <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{item.pdf_name}</TableCell>
                  <TableCell className="text-xs text-slate-400">{formatDate(item.archived_at)}</TableCell>
                  <TableCell className="text-sm text-slate-600">{item.sessions}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatDuration(item.total_time_seconds)}</TableCell>
                  <TableCell className="text-sm text-slate-600">{formatDuration(item.avg_time_seconds)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReactivatePdf(item.pdf_id)}
                        disabled={!item.pdf_id || reactivatingPdfId === item.pdf_id || permanentlyDeletingPdfId === item.pdf_id}
                        className="rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        {reactivatingPdfId === item.pdf_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePermanentlyDeletePdf(item.pdf_id)}
                        disabled={!item.pdf_id || permanentlyDeletingPdfId === item.pdf_id || reactivatingPdfId === item.pdf_id}
                        className="rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        {permanentlyDeletingPdfId === item.pdf_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );

  const renderUsersModule = () => (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Users</h2>
          <p className="text-sm text-slate-500 mt-1">Manage user accounts and reset passwords.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="rounded-full" style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
            {userCount} registered users
          </Badge>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg font-bold text-white" style={{ backgroundColor: 'var(--teal)' }}>
                <UserPlus className="w-4 h-4 mr-2" /> Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
              <DialogHeader>
                <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>
                  Create User
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Name</Label>
                  <Input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="e.g. Sales Agent" className="mt-1.5 rounded-lg border-slate-200" required />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</Label>
                  <Input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="agent@travloger.in" className="mt-1.5 rounded-lg border-slate-200" required />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Temporary Password</Label>
                  <Input value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Enter temporary password" className="mt-1.5 rounded-lg border-slate-200" required />
                  <p className="text-xs text-slate-400 mt-1">Share this password with the user. They can log in with it immediately.</p>
                </div>
                <Button type="submit" disabled={creating} className="w-full rounded-lg font-bold text-white" style={{ backgroundColor: 'var(--teal)' }}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">User ID</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Email</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Name</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Role</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Password</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Created</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((item) => (
              <TableRow key={item.id} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: '#f1f5f9' }}>
                <TableCell className="text-xs font-mono text-slate-500">{item.id}</TableCell>
                <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{item.email}</TableCell>
                <TableCell className="text-sm text-slate-600">{item.name || '--'}</TableCell>
                <TableCell>
                  <Badge className="rounded-full" style={{ backgroundColor: item.role === 'admin' ? '#fef3c7' : '#e0f2fe', color: item.role === 'admin' ? '#b45309' : '#0369a1' }}>
                    {item.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-500">{item.password_status}</TableCell>
                <TableCell className="text-xs text-slate-400">{formatDate(item.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResetPassword(item)}
                    disabled={resettingId === item.id}
                    className="rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  >
                    {resettingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1.5" />}
                    Reset
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--teal)' }} />
      </div>
    );
  }

  const activeModuleTitle = MODULES.find((module) => module.key === activeModule)?.label || 'Dashboard';

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--off-white)' }}>
      <header style={{ backgroundColor: 'var(--teal)', boxShadow: '0 2px 12px rgba(20,74,87,0.18)' }} className="sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 rounded-lg text-white hover:bg-white/10 hover:text-white"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="border-r border-slate-200 bg-white px-0">
                <SheetHeader className="px-5 pb-2">
                  <SheetTitle className="flex items-center gap-3" style={{ color: 'var(--teal)' }}>
                    <TravlogerMark size={30} />
                    <span>Admin Modules</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="px-3 py-3 space-y-1">
                  {MODULES.map((module) => {
                    const Icon = module.icon;
                    const isActive = activeModule === module.key;
                    return (
                      <button
                        key={module.key}
                        type="button"
                        onClick={() => goToModule(module.key)}
                        className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
                        style={{
                          backgroundColor: isActive ? 'rgba(20,74,87,0.08)' : 'transparent',
                          color: isActive ? 'var(--teal)' : '#475569',
                        }}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-semibold">{module.label}</span>
                      </button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>

            <TravlogerMark size={36} />
            <div className="leading-tight">
              <div className="text-white font-bold text-base tracking-tight">LinkDeck Admin</div>
              <div className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
                {activeModuleTitle}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
              <ShieldCheck className="w-3 h-3" style={{ color: 'var(--gold)' }} />
              {user?.email}
            </div>
            <Button onClick={logout} className="text-xs font-semibold rounded" style={{ color: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div style={{ height: 3, background: 'linear-gradient(90deg, var(--gold), var(--teal-light), var(--gold))' }} />

      <main className="max-w-[1400px] mx-auto px-5 md:px-10 py-8">
        {activeModule === 'dashboard' && renderDashboardModule()}
        {activeModule === 'contacts' && renderContactsModule()}
        {activeModule === 'pdfs' && renderPdfsModule()}
        {activeModule === 'users' && renderUsersModule()}
      </main>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
          <DialogHeader>
            <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>
              Edit Contact
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveContact} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact Name</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} className="mt-1.5 rounded-lg border-slate-200" required />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</Label>
              <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="mt-1.5 rounded-lg border-slate-200" required />
            </div>
            <Button type="submit" disabled={savingContact} className="w-full rounded-lg font-bold text-white" style={{ backgroundColor: 'var(--teal)' }}>
              {savingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Contact'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
