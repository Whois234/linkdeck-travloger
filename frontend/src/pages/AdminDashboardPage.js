import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  FolderOpen,
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
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Map,
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
  { key: 'dashboard',       label: 'Dashboard',       icon: LayoutDashboard, path: '/dashboard' },
  { key: 'contacts',        label: 'Contacts',         icon: Users,           path: '/contacts' },
  { key: 'recent_activity', label: 'Recent Activity',  icon: Globe2,          path: '/recent-activity' },
  { key: 'pdfs',            label: 'PDFs',             icon: FileText,        path: '/pdfs' },
  { key: 'users',           label: 'Users',            icon: ShieldCheck,     path: '/users' },
  { key: 'tripdeck',        label: 'TripDeck',         icon: Map,             href: '/tripdeck' },
];

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeModule = MODULES.find((m) => m.path === pathname)?.key || 'dashboard';
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [archivedFolders, setArchivedFolders] = useState([]);
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
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityLimit, setActivityLimit] = useState(20);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [newUserActive, setNewUserActive] = useState(true);
  const [newUserModuleAccess, setNewUserModuleAccess] = useState({ dashboard: 'edit', pdfs: 'edit', contacts: 'edit', tripdeck: 'edit' });
  const [resettingId, setResettingId] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState('');
  const [deletingPdfId, setDeletingPdfId] = useState('');
  const [reactivatingPdfId, setReactivatingPdfId] = useState('');
  const [permanentlyDeletingPdfId, setPermanentlyDeletingPdfId] = useState('');
  const [archivingFolderId, setArchivingFolderId] = useState('');
  const [reactivatingFolderId, setReactivatingFolderId] = useState('');
  const [deletingFolderId, setDeletingFolderId] = useState('');
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactDetailOpen, setContactDetailOpen] = useState(false);
  const [detailContact, setDetailContact] = useState(null);
  const [contactLinks, setContactLinks] = useState([]);
  const [contactLinksLoading, setContactLinksLoading] = useState(false);
  const [contactActiveView, setContactActiveView] = useState(null); // null | 'links' | 'sessions'
  const [pdfSearch, setPdfSearch] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState('');
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState('user');
  const [editUserActive, setEditUserActive] = useState(true);
  const [editModuleAccess, setEditModuleAccess] = useState({ dashboard: 'edit', pdfs: 'edit', contacts: 'edit' });
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState('__none__');
  const [uploading, setUploading] = useState(false);

  const fetchAdminData = useCallback(async () => {
    try {
      const analyticsParams = analyticsDays === -1
        ? { days: 0, start_date: customStartDate || undefined, end_date: customEndDate || undefined }
        : { days: analyticsDays };

      const [usersRes, statsRes, contactsRes, analyticsRes, activityRes, foldersRes, archivedFoldersRes] = await Promise.all([
        axios.get(`${API}/admin/users`, { withCredentials: true }),
        axios.get(`${API}/admin/stats`, { withCredentials: true }),
        axios.get(`${API}/admin/contacts`, { withCredentials: true, params: contactSearch ? { search: contactSearch } : undefined }),
        axios.get(`${API}/admin/analytics`, {
          withCredentials: true,
          params: analyticsParams,
        }),
        axios.get(`${API}/admin/recent-activity`, {
          withCredentials: true,
          params: { limit: activityLimit === 'all' ? 9999 : activityLimit },
        }),
        axios.get(`${API}/folders`, { withCredentials: true }),
        axios.get(`${API}/folders`, { withCredentials: true, params: { status: 'archived' } }),
      ]);

      setUsers(usersRes.data || []);
      setStats(statsRes.data || {});
      setContacts(contactsRes.data || []);
      setAnalytics(analyticsRes.data || {});
      setRecentActivity(activityRes.data?.items || []);
      setActivityTotal(activityRes.data?.total || 0);
      setFolders(Array.isArray(foldersRes.data) ? foldersRes.data : []);
      setArchivedFolders(Array.isArray(archivedFoldersRes.data) ? archivedFoldersRes.data : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  }, [analyticsDays, customStartDate, customEndDate, contactSearch, activityLimit]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const userCount = useMemo(() => users.length, [users]);
  const contactCount = useMemo(() => contacts.length, [contacts]);
  const filteredContacts = useMemo(() => {
    const needle = contactSearch.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((contact) =>
      [contact.customer_name, contact.customer_phone, contact.user_name, contact.latest_pdf_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [contacts, contactSearch]);

  const activePdfItems = useMemo(() => {
    const needle = pdfSearch.trim().toLowerCase();
    const items = analytics.time_by_pdf || [];
    if (!needle) return items;
    return items.filter((item) =>
      [item.pdf_name, item.folder_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [analytics.time_by_pdf, pdfSearch]);

  const archivedPdfItems = useMemo(() => {
    const needle = pdfSearch.trim().toLowerCase();
    const items = analytics.archived_time_by_pdf || [];
    if (!needle) return items;
    return items.filter((item) =>
      [item.pdf_name, item.folder_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [analytics.archived_time_by_pdf, pdfSearch]);

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile' || deviceType === 'Tablet') return Smartphone;
    return Monitor;
  };

  const goToModule = (key) => {
    const module = MODULES.find((m) => m.key === key);
    navigate(module?.href || module?.path || '/dashboard');
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
        role: newUserRole,
        active: newUserActive,
        module_access: newUserModuleAccess,
      }, { withCredentials: true });
      toast.success('User created with temporary password');
      setCreateOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setNewUserActive(true);
      setNewUserModuleAccess({ dashboard: 'edit', pdfs: 'edit', contacts: 'edit' });
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

  const openContactDetail = async (contact) => {
    setDetailContact(contact);
    setContactLinks([]);
    setContactActiveView(null);
    setContactDetailOpen(true);
    setContactLinksLoading(true);
    try {
      const res = await axios.get(`${API}/admin/contacts/${contact.id}/links`, { withCredentials: true });
      setContactLinks(Array.isArray(res.data) ? res.data : []);
    } catch {
      // non-critical, modal still works
    } finally {
      setContactLinksLoading(false);
    }
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

  const openEditUser = (item) => {
    setEditingUser(item);
    setEditUserName(item.name || '');
    setEditUserRole(item.role || 'user');
    setEditUserActive(item.active !== false);
    setEditModuleAccess({ dashboard: 'edit', pdfs: 'edit', contacts: 'edit', tripdeck: 'edit', ...item.module_access });
    setUserDialogOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser?.id) return;
    setUpdatingUserId(editingUser.id);
    try {
      await axios.put(`${API}/admin/users/${editingUser.id}`, {
        name: editUserName,
        role: editUserRole,
        active: editUserActive,
        module_access: editModuleAccess,
      }, { withCredentials: true });
      toast.success('User updated');
      setUserDialogOpen(false);
      setEditingUser(null);
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update user');
    } finally {
      setUpdatingUserId('');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!userId || !window.confirm('Delete this user account?')) return;
    setDeletingUserId(userId);
    try {
      await axios.delete(`${API}/admin/users/${userId}`, { withCredentials: true });
      toast.success('User deleted');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user');
    } finally {
      setDeletingUserId('');
    }
  };

  const handleToggleUserActive = async (item) => {
    if (!item?.id) return;
    const nextActive = !(item.active !== false);
    const label = nextActive ? 'reactivate' : 'deactivate';
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${item.email}?`)) return;
    setUpdatingUserId(item.id);
    try {
      await axios.put(`${API}/admin/users/${item.id}`, { active: nextActive }, { withCredentials: true });
      toast.success(nextActive ? 'User reactivated' : 'User deactivated');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${label} user`);
    } finally {
      setUpdatingUserId('');
    }
  };

  const openFolderDialog = (folder = null) => {
    setEditingFolder(folder);
    setFolderName(folder?.name || '');
    setFolderDialogOpen(true);
  };

  const handleSaveFolder = async (e) => {
    e.preventDefault();
    setSavingFolder(true);
    try {
      if (editingFolder?.id) {
        await axios.put(`${API}/admin/folders/${editingFolder.id}`, { name: folderName }, { withCredentials: true });
        toast.success('Folder updated');
      } else {
        await axios.post(`${API}/admin/folders`, { name: folderName }, { withCredentials: true });
        toast.success('Folder created');
      }
      setFolderDialogOpen(false);
      setEditingFolder(null);
      setFolderName('');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save folder');
    } finally {
      setSavingFolder(false);
    }
  };

  const handleArchiveFolder = async (folderId) => {
    if (!folderId || !window.confirm('Archive this folder and all PDFs inside it?')) return;
    setArchivingFolderId(folderId);
    try {
      await axios.delete(`${API}/admin/folders/${folderId}`, { withCredentials: true });
      toast.success('Folder archived');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to archive folder');
    } finally {
      setArchivingFolderId('');
    }
  };

  const handleReactivateFolder = async (folderId) => {
    if (!folderId) return;
    setReactivatingFolderId(folderId);
    try {
      await axios.post(`${API}/admin/folders/${folderId}/reactivate`, {}, { withCredentials: true });
      toast.success('Folder reactivated');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reactivate folder');
    } finally {
      setReactivatingFolderId('');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!folderId || !window.confirm('Permanently delete this folder? PDFs will move out of the folder.')) return;
    setDeletingFolderId(folderId);
    try {
      await axios.delete(`${API}/admin/folders/${folderId}/permanent`, { withCredentials: true });
      toast.success('Folder deleted');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete folder');
    } finally {
      setDeletingFolderId('');
    }
  };

  const handleUploadPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.name.toLowerCase().endsWith('.pdf') && (!file.type || file.type === 'application/pdf');
    if (!isPdf) {
      toast.error('Only PDF files are allowed');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const initiateRes = await axios.post(`${API}/pdfs/upload/initiate`, {
        file_name: file.name,
        file_size: file.size,
        content_type: file.type || 'application/pdf',
        folder_id: uploadFolderId === '__none__' ? null : uploadFolderId,
      }, { withCredentials: true });
      const { id, upload_url, upload_fields } = initiateRes.data;
      const formData = new FormData();
      Object.entries(upload_fields || {}).forEach(([key, value]) => formData.append(key, value));
      formData.append('file', file);
      const uploadResponse = await fetch(upload_url, { method: 'POST', body: formData });
      if (!uploadResponse.ok) {
        throw new Error((await uploadResponse.text()) || `Upload failed with ${uploadResponse.status}`);
      }
      await axios.post(`${API}/pdfs/upload/complete`, { pdf_id: id }, { withCredentials: true });
      toast.success('PDF uploaded');
      setUploadDialogOpen(false);
      setUploadFolderId('__none__');
      fetchAdminData();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Failed to upload PDF');
    } finally {
      setUploading(false);
      e.target.value = '';
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
      <div className="relative max-w-sm mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={contactSearch}
          onChange={(e) => setContactSearch(e.target.value)}
          placeholder="Search contacts, owner, phone, or PDF..."
          className="pl-9 rounded-lg border-slate-200"
        />
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
            {filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-slate-400">
                  No contacts available yet.
                </TableCell>
              </TableRow>
            ) : filteredContacts.map((contact) => (
              <TableRow key={contact.id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                <TableCell>
                  <button
                    onClick={() => openContactDetail(contact)}
                    className="font-semibold text-left hover:underline"
                    style={{ color: 'var(--teal)' }}
                  >
                    {contact.customer_name}
                  </button>
                </TableCell>
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

  const renderRecentActivityModule = () => (
    <section className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Recent Activity</h3>
            <p className="text-sm text-slate-500 mt-1">
              Latest customer opens with session order, watch time, device, and approximate location.
            </p>
            <p className="text-xs font-semibold mt-1" style={{ color: 'var(--teal)' }}>
              {activityTotal > 0 && (
                <>Total: <span className="font-black">{activityTotal.toLocaleString('en-IN')}</span> opens · showing {recentActivity.length}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Rows:</label>
              <select
                value={activityLimit}
                onChange={(e) => setActivityLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="text-sm rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'var(--teal)' }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value="all">All</option>
              </select>
            </div>
            <Button variant="outline" onClick={exportRecentActivityCsv} className="rounded-lg border-slate-200 text-slate-600">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Customer</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Phone</TableHead>
            <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Owner</TableHead>
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
              <TableCell colSpan={10} className="py-10 text-center text-sm text-slate-400">
                No recent activity yet.
              </TableCell>
            </TableRow>
          ) : recentActivity.map((item) => {
            const DeviceIcon = getDeviceIcon(item.device_type);
            return (
              <TableRow key={item.session_id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{item.customer_name}</TableCell>
                <TableCell className="text-sm text-slate-600">{item.customer_phone}</TableCell>
                <TableCell className="text-sm text-slate-500">{item.owner_name || '--'}</TableCell>
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
                  ) : <span className="text-slate-300"> </span>}
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
    </section>
  );

  const renderPdfsModule = () => (
    <section className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>PDFs</h2>
          <p className="text-sm text-slate-500 mt-1">Manage folders, active PDFs, and archived PDFs from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openFolderDialog()} className="rounded-lg border-slate-200 text-slate-600">
            <FolderOpen className="w-4 h-4 mr-2" /> Create Folder
          </Button>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg text-white font-semibold" style={{ backgroundColor: 'var(--teal)' }}>
                <Upload className="w-4 h-4 mr-2" /> Upload PDF
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
              <DialogHeader>
                <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>Upload PDF</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Folder</Label>
                  <select
                    value={uploadFolderId}
                    onChange={(e) => setUploadFolderId(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600"
                  >
                    <option value="__none__">No folder</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                </div>
                <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors hover:border-[var(--teal)]" style={{ borderColor: '#cbd5e1' }}>
                  <Upload className="w-10 h-10 mb-3" style={{ color: 'var(--teal)' }} />
                  <span className="font-semibold text-sm" style={{ color: 'var(--teal)' }}>
                    {uploading ? 'Uploading...' : 'Click to select PDF'}
                  </span>
                  <span className="text-xs mt-1 text-slate-400">Max 100MB</span>
                  <input type="file" accept=".pdf" onChange={handleUploadPdf} className="hidden" disabled={uploading} />
                </label>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active Folders', value: folders.length, accent: 'var(--teal)' },
            { label: 'Archived Folders', value: archivedFolders.length, accent: '#b45309' },
            { label: 'Active PDFs', value: activePdfItems.length, accent: '#0369a1' },
            { label: 'Archived PDFs', value: archivedPdfItems.length, accent: '#64748b' },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-xl border p-4" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{item.label}</div>
              <div className="mt-2 text-2xl font-black" style={{ color: item.accent }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={pdfSearch}
              onChange={(e) => setPdfSearch(e.target.value)}
              placeholder="Search folders or PDFs..."
              className="pl-9 rounded-lg border-slate-200"
            />
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.2fr_0.95fr] gap-4">
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Folders</h3>
                <p className="text-sm text-slate-500 mt-1">Group PDFs by destination or campaign.</p>
              </div>
              <Badge className="rounded-full" style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
                {folders.length} active
              </Badge>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Folder</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Active PDFs</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Archived PDFs</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-slate-400">No folders created yet.</TableCell>
                </TableRow>
              ) : folders.filter((folder) => !pdfSearch || folder.name.toLowerCase().includes(pdfSearch.toLowerCase())).map((folder) => (
                <TableRow key={folder.id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                  <TableCell>
                    <div className="font-semibold" style={{ color: 'var(--teal)' }}>{folder.name}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Shared to users automatically</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
                      {folder.active_pdfs || 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                      {folder.archived_pdfs || 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openFolderDialog(folder)} className="rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleArchiveFolder(folder.id)} disabled={archivingFolderId === folder.id} className="rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-50">
                        {archivingFolderId === folder.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteFolder(folder.id)} disabled={deletingFolderId === folder.id} className="rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50">
                        {deletingFolderId === folder.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Archived Folders</h3>
                <p className="text-sm text-slate-500 mt-1">Reactivate or permanently delete archived folders.</p>
              </div>
              <Badge className="rounded-full" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                {archivedFolders.length} archived
              </Badge>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Folder</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Archived At</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archivedFolders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-slate-400">No archived folders yet.</TableCell>
                </TableRow>
              ) : archivedFolders.filter((folder) => !pdfSearch || folder.name.toLowerCase().includes(pdfSearch.toLowerCase())).map((folder) => (
                <TableRow key={`archived-${folder.id}`} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                  <TableCell>
                    <div className="font-semibold" style={{ color: 'var(--teal)' }}>{folder.name}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Use reactivate to bring this back live</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-400 whitespace-nowrap">{formatDate(folder.archived_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleReactivateFolder(folder.id)} disabled={reactivatingFolderId === folder.id} className="rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50">
                        {reactivatingFolderId === folder.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteFolder(folder.id)} disabled={deletingFolderId === folder.id} className="rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50">
                        {deletingFolderId === folder.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Active PDFs</h3>
              <p className="text-sm text-slate-500 mt-1">Only live PDFs stay here. Archived ones move to the separate section below.</p>
            </div>
            <Badge className="rounded-full" style={{ backgroundColor: 'rgba(14,165,233,0.08)', color: '#0369a1' }}>
              {activePdfItems.length} live
            </Badge>
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
            {activePdfItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">No active PDF analytics yet.</TableCell>
              </TableRow>
            ) : (
              activePdfItems.map((item) => (
                <TableRow key={item.pdf_id || item.pdf_name} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                  <TableCell>
                    <div className="font-semibold" style={{ color: 'var(--teal)' }}>{item.pdf_name}</div>
                    <div className="text-xs text-slate-400">{item.folder_name || 'Unfoldered'}</div>
                  </TableCell>
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <div>
                <h3 className="font-bold" style={{ color: 'var(--teal)' }}>Archived PDFs</h3>
                <p className="text-sm text-slate-500 mt-1">Archived PDFs stay here until you reactivate or permanently delete them.</p>
              </div>
            </div>
            <Badge className="rounded-full" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>
              {archivedPdfItems.length} archived
            </Badge>
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
            {archivedPdfItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">No archived PDFs yet.</TableCell>
              </TableRow>
            ) : (
              archivedPdfItems.map((item) => (
                <TableRow key={`archived-${item.pdf_id || item.pdf_name}`} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                  <TableCell>
                    <div className="font-semibold" style={{ color: 'var(--teal)' }}>{item.pdf_name}</div>
                    <div className="text-xs text-slate-400">{item.folder_name || 'Unfoldered'}</div>
                  </TableCell>
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
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Role</Label>
                  <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</Label>
                  <select value={newUserActive ? 'active' : 'inactive'} onChange={(e) => setNewUserActive(e.target.value === 'active')} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                    <option value="active">Active</option>
                    <option value="inactive">Deactivated</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Module Access</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {['dashboard', 'pdfs', 'contacts', 'tripdeck'].map((moduleKey) => (
                      <div key={`new-${moduleKey}`}>
                        <Label className="text-xs font-medium text-slate-500 capitalize">{moduleKey}</Label>
                        <select
                          value={newUserModuleAccess[moduleKey] || 'none'}
                          onChange={(e) => setNewUserModuleAccess((current) => ({ ...current, [moduleKey]: e.target.value }))}
                          className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
                        >
                          <option value="none">Hidden</option>
                          <option value="view">View only</option>
                          <option value="edit">Full edit</option>
                        </select>
                      </div>
                    ))}
                  </div>
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
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Status</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Module Access</TableHead>
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
                <TableCell>
                  <Badge className="rounded-full" style={{ backgroundColor: item.active ? '#dcfce7' : '#fee2e2', color: item.active ? '#16a34a' : '#dc2626' }}>
                    {item.active ? 'Active' : 'Deactivated'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {Object.entries(item.module_access || {}).map(([key, value]) => `${key}:${value}`).join(' · ')}
                </TableCell>
                <TableCell className="text-sm text-slate-500">{item.password_status}</TableCell>
                <TableCell className="text-xs text-slate-400">{formatDate(item.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditUser(item)} className="rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleUserActive(item)}
                      disabled={updatingUserId === item.id}
                      className={`rounded-lg ${item.active ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'}`}
                    >
                      {updatingUserId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : item.active ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                    </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteUser(item.id)}
                      disabled={deletingUserId === item.id}
                      className="rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                    >
                      {deletingUserId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
        {activeModule === 'recent_activity' && renderRecentActivityModule()}
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
      {/* Contact Detail Modal */}
      <Dialog open={contactDetailOpen} onOpenChange={(o) => { setContactDetailOpen(o); if (!o) setContactActiveView(null); }}>
        <DialogContent className="rounded-xl border max-w-lg max-h-[88vh] overflow-y-auto" style={{ borderColor: '#e5e7eb' }}>
          <DialogHeader>
            <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>Contact Details</DialogTitle>
          </DialogHeader>
          {detailContact && (
            <div className="space-y-5 pt-1">
              {/* Avatar + name + phone */}
              <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(20,74,87,0.06)' }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0" style={{ backgroundColor: 'var(--teal)' }}>
                  {(detailContact.customer_name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 text-lg truncate">{detailContact.customer_name}</div>
                  <div className="text-sm text-slate-500">{detailContact.customer_phone}</div>
                  {detailContact.customer_phone && (
                    <a href={`https://wa.me/${detailContact.customer_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold mt-1 inline-flex items-center gap-1" style={{ color: '#16a34a' }}>
                      Open WhatsApp →
                    </a>
                  )}
                </div>
              </div>

              {/* Owner */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Assigned To</div>
                <div className="text-sm font-semibold text-slate-700">{detailContact.user_name}</div>
                <div className="text-xs text-slate-400">{detailContact.user_email}</div>
              </div>

              {/* Clickable stat cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Links Created', value: detailContact.total_links || 0, color: 'var(--teal)', view: 'links' },
                  { label: 'Links Opened', value: detailContact.opened_links || 0, color: '#4a90d9', view: 'sessions' },
                  { label: 'Total Opens', value: detailContact.total_opens || 0, color: 'var(--gold)', view: 'sessions' },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setContactActiveView(contactActiveView === s.view ? null : s.view)}
                    className="rounded-xl p-3 text-center transition-all hover:opacity-90 active:scale-95"
                    style={{
                      backgroundColor: contactActiveView === s.view ? `${s.color}15` : '#f8fafc',
                      border: `1px solid ${contactActiveView === s.view ? s.color : '#e5e7eb'}`,
                    }}
                  >
                    <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
                    <div className="text-[10px] mt-1" style={{ color: s.color }}>
                      {contactActiveView === s.view ? '▲ hide' : '▼ details'}
                    </div>
                  </button>
                ))}
              </div>

              {/* Links detail panel */}
              {contactActiveView === 'links' && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
                  <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500" style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    PDFs & Links Shared
                  </div>
                  {contactLinksLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                  ) : contactLinks.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No links created yet.</p>
                  ) : (
                    <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
                      {contactLinks.map((link) => (
                        <div key={link.id} className="px-4 py-3">
                          <div className="font-semibold text-sm text-slate-700 truncate">{link.pdf_name}</div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${link.opened ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {link.opened ? `✓ Opened ${link.open_count}×` : 'Not opened yet'}
                            </span>
                            <span className="text-xs text-slate-400">Shared {formatDate(link.created_at)}</span>
                            {link.last_opened_at && <span className="text-xs text-slate-400">Last: {formatDate(link.last_opened_at)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sessions detail panel */}
              {contactActiveView === 'sessions' && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
                  <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500" style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    All Sessions
                  </div>
                  {contactLinksLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                  ) : contactLinks.every((l) => l.sessions.length === 0) ? (
                    <p className="text-sm text-slate-400 text-center py-6">No sessions recorded yet.</p>
                  ) : (
                    <div className="divide-y max-h-64 overflow-y-auto" style={{ borderColor: '#f1f5f9' }}>
                      {contactLinks.flatMap((link) =>
                        link.sessions.map((s) => (
                          <div key={`${link.id}-s${s.session_number}`} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-600">
                                {formatSessionOrdinal(s.session_number)} session
                              </span>
                              <span className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
                                {formatDuration(s.duration_seconds)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 truncate">{link.pdf_name}</div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-slate-400">
                              {s.device_type && <span>{s.device_type}</span>}
                              {s.browser && <span>· {s.browser}</span>}
                              {s.os && <span>· {s.os}</span>}
                              {s.location_label && <span>· {s.location_label}</span>}
                              {s.started_at && <span>· {formatDate(s.started_at)}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Latest PDF */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Latest PDF</div>
                <div className="text-sm text-slate-700 truncate">{detailContact.latest_pdf_name || '--'}</div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: 'Last Linked', value: detailContact.last_link_created_at },
                  { label: 'Last Opened', value: detailContact.latest_opened_at },
                  { label: 'Contact Created', value: detailContact.created_at },
                ].map((t) => (
                  <div key={t.label}>
                    <div className="text-[11px] text-slate-400">{t.label}</div>
                    <div className="text-xs font-medium text-slate-600">{t.value ? formatDate(t.value) : '--'}</div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 rounded-lg border-slate-200 text-slate-600" onClick={() => { setContactDetailOpen(false); openEditContact(detailContact); }}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
                <Button variant="outline" className="flex-1 rounded-lg text-red-500 border-red-200 hover:bg-red-50" onClick={() => { setContactDetailOpen(false); handleDeleteContact(detailContact.id); }}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
          <DialogHeader>
            <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveUser} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Name</Label>
              <Input value={editUserName} onChange={(e) => setEditUserName(e.target.value)} className="mt-1.5 rounded-lg border-slate-200" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Role</Label>
                <select value={editUserRole} onChange={(e) => setEditUserRole(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</Label>
                <select value={editUserActive ? 'active' : 'inactive'} onChange={(e) => setEditUserActive(e.target.value === 'active')} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
                  <option value="active">Active</option>
                  <option value="inactive">Deactivated</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Module Access</Label>
              <div className="grid grid-cols-4 gap-3">
                {['dashboard', 'pdfs', 'contacts', 'tripdeck'].map((moduleKey) => (
                  <div key={moduleKey}>
                    <Label className="text-xs font-medium text-slate-500 capitalize">{moduleKey}</Label>
                    <select
                      value={editModuleAccess[moduleKey] || 'none'}
                      onChange={(e) => setEditModuleAccess((current) => ({ ...current, [moduleKey]: e.target.value }))}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
                    >
                      <option value="none">Hidden</option>
                      <option value="view">View only</option>
                      <option value="edit">Full edit</option>
                    </select>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                ⓘ Changes take effect the next time the user refreshes or re-logs in.
              </p>
            </div>
            <Button type="submit" disabled={updatingUserId === editingUser?.id} className="w-full rounded-lg font-bold text-white" style={{ backgroundColor: 'var(--teal)' }}>
              {updatingUserId === editingUser?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save User'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
          <DialogHeader>
            <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>{editingFolder ? 'Edit Folder' : 'Create Folder'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveFolder} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Folder Name</Label>
              <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} className="mt-1.5 rounded-lg border-slate-200" required />
            </div>
            <Button type="submit" disabled={savingFolder} className="w-full rounded-lg font-bold text-white" style={{ backgroundColor: 'var(--teal)' }}>
              {savingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : editingFolder ? 'Save Folder' : 'Create Folder'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
