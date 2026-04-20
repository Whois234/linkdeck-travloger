import { Fragment, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import {
  Upload, Link2, Copy, Trash2, FileText, ExternalLink, LogOut, Search, Filter,
  CheckCircle, XCircle, Eye, Loader2, FileUp, LinkIcon, MapPin, ArrowUpDown,
  Smartphone, Monitor, Globe2, Archive, Download, ChevronDown, ChevronUp,
  LayoutGrid, Plus, Users
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SITE_URL = process.env.REACT_APP_SITE_URL || window.location.origin;

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainingSeconds = value % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getLinkId(link) {
  return link?._id ?? link?.id ?? '';
}

function formatSessionOrdinal(value) {
  const number = Number(value || 0);
  if (!number) return '--';
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  const suffixMap = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${number}${suffixMap[number % 10] || 'th'}`;
}

function formatPageBreakdown(pageBreakdown = []) {
  if (!Array.isArray(pageBreakdown) || pageBreakdown.length === 0) return '--';
  return pageBreakdown
    .slice()
    .sort((a, b) => b.duration_seconds - a.duration_seconds)
    .slice(0, 3)
    .map((item) => `P${item.page_number} (${formatDuration(item.duration_seconds)})`)
    .join(', ');
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

function buildTrackingLink(linkId) {
  return `${SITE_URL}/view/${linkId}`;
}

// Format phone → wa.me link: strip non-digits, prepend 91 if 10-digit Indian number
function toWaLink(phone, message = '') {
  const digits = phone.replace(/\D/g, '');
  const textParam = message ? `?text=${encodeURIComponent(message)}` : '';
  if (digits.length === 10) return `https://wa.me/91${digits}${textParam}`;
  if (digits.length === 12 && digits.startsWith('91')) return `https://wa.me/${digits}${textParam}`;
  if (digits.length === 11 && digits.startsWith('0')) return `https://wa.me/91${digits.slice(1)}${textParam}`;
  return `https://wa.me/${digits}${textParam}`;
}

// Travloger teal/gold logo mark as inline SVG
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

// WhatsApp SVG icon
function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [pdfs, setPdfs] = useState([]);
  const [archivedPdfs, setArchivedPdfs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [links, setLinks] = useState([]);
  const [stats, setStats] = useState({ total_pdfs: 0, total_links: 0, opened_links: 0, unopened_links: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('recently_created');
  const [searchQuery, setSearchQuery] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [expandedLinkId, setExpandedLinkId] = useState('');
  const [insightsByLink, setInsightsByLink] = useState({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tripdecks, setTripdecks] = useState([]);
  const [tripdeckOpen, setTripdeckOpen] = useState(false);
  const [tripdeckTitle, setTripdeckTitle] = useState('');
  const [tripdeckDescription, setTripdeckDescription] = useState('');
  const [creatingTripDeck, setCreatingTripDeck] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (sortBy) params.sort = sortBy;
      const [pdfsRes, archivedRes, contactsRes, linksRes, statsRes, tripdecksRes] = await Promise.allSettled([
        axios.get(`${API}/pdfs`, { withCredentials: true }),
        axios.get(`${API}/pdfs/archived`, { withCredentials: true }),
        axios.get(`${API}/contacts`, { withCredentials: true }),
        axios.get(`${API}/links`, { withCredentials: true, params }),
        axios.get(`${API}/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API}/tripdeck`, { withCredentials: true }),
      ]);

      const pdfsData = pdfsRes.status === 'fulfilled' ? (pdfsRes.value.data?.data || pdfsRes.value.data || []) : [];
      const archivedData = archivedRes.status === 'fulfilled' ? (Array.isArray(archivedRes.value.data) ? archivedRes.value.data : []) : [];
      const contactsData = contactsRes.status === 'fulfilled' ? (Array.isArray(contactsRes.value.data) ? contactsRes.value.data : []) : [];
      const linksData = linksRes.status === 'fulfilled' ? (Array.isArray(linksRes.value.data) ? linksRes.value.data : []) : [];
      const statsData = statsRes.status === 'fulfilled'
        ? (statsRes.value.data || { total_pdfs: 0, total_links: 0, opened_links: 0, unopened_links: 0 })
        : { total_pdfs: 0, total_links: 0, opened_links: 0, unopened_links: 0 };
      const tripdecksData = tripdecksRes.status === 'fulfilled' ? (Array.isArray(tripdecksRes.value.data) ? tripdecksRes.value.data : []) : [];

      const normalizedLinks = linksData.map((link) => ({
        ...link,
        _id: getLinkId(link),
      }));

      setPdfs(pdfsData);
      setArchivedPdfs(archivedData);
      setContacts(contactsData);
      setLinks(normalizedLinks);
      setStats(statsData);
      setTripdecks(tripdecksData);

      const criticalFailures = [pdfsRes, linksRes, statsRes].filter((result) => result.status === 'rejected');
      if (criticalFailures.length > 0) {
        throw criticalFailures[0].reason;
      }

      if (contactsRes.status === 'rejected') {
        console.warn('Contacts endpoint unavailable; continuing without contacts section.', contactsRes.reason);
      }
    } catch (err) {
      if (err.response?.status === 401) return;
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, searchQuery, sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.name.toLowerCase().endsWith('.pdf') && (!file.type || file.type === 'application/pdf');
    if (!isPdf) {
      toast.error('Only PDF files are allowed');
      e.target.value = '';
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File too large. Max 100MB.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const initiateRes = await axios.post(`${API}/pdfs/upload/initiate`, {
        file_name: file.name,
        file_size: file.size,
        content_type: file.type || 'application/pdf',
      }, {
        withCredentials: true,
      });
      const { id, upload_url, upload_fields, upload_method, content_type } = initiateRes.data;

      if ((upload_method || '').toLowerCase() === 'post' && upload_fields) {
        const formData = new FormData();
        Object.entries(upload_fields).forEach(([key, value]) => {
          formData.append(key, value);
        });
        formData.append('file', file);
        const uploadResponse = await fetch(upload_url, {
          method: 'POST',
          body: formData,
        });
        if (!uploadResponse.ok) {
          const responseText = await uploadResponse.text();
          throw new Error(responseText || `S3 upload failed with status ${uploadResponse.status}`);
        }
      } else {
        await axios.put(upload_url, file, {
          headers: {
            'Content-Type': content_type || 'application/pdf',
          },
        });
      }

      await axios.post(`${API}/pdfs/upload/complete`, {
        pdf_id: id,
      }, {
        withCredentials: true,
      });

      toast.success('PDF uploaded successfully');
      setUploadOpen(false);
      await fetchData();

    } catch (err) {
      const detail = err.response?.data?.detail
        || err.message
        || 'Upload failed';
      toast.error(detail.slice(0, 180));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };


  const handleCreateLink = async (e) => {
    e.preventDefault();
    if (!selectedPdf || !customerName.trim() || !customerPhone.trim()) {
      toast.error('All fields are required');
      return;
    }
    setCreatingLink(true);
    try {
      await axios.post(`${API}/links`, {
        pdf_id: selectedPdf,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
      }, { withCredentials: true });
      toast.success('Link created successfully');
      setLinkOpen(false);
      setCustomerName('');
      setCustomerPhone('');
      setSelectedPdf('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create link');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleDeletePdf = async (pdfId) => {
    if (!window.confirm('Archive this PDF? It will be removed from active PDFs, but customers can still open the existing link and your analytics will stay available.')) return;
    try {
      await axios.delete(`${API}/pdfs/${pdfId}`, { withCredentials: true });
      toast.success('PDF archived');
      fetchData();
    } catch {
      toast.error('Failed to archive PDF');
    }
  };

  const handleCreateTripDeck = async (e) => {
    e.preventDefault();
    if (!tripdeckTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    setCreatingTripDeck(true);
    try {
      await axios.post(`${API}/tripdeck`, {
        title: tripdeckTitle.trim(),
        description: tripdeckDescription.trim() || undefined,
      }, { withCredentials: true });
      toast.success('TripDeck created!');
      setTripdeckOpen(false);
      setTripdeckTitle('');
      setTripdeckDescription('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create TripDeck');
    } finally {
      setCreatingTripDeck(false);
    }
  };

  const handleArchiveTripDeck = async (id, currentStatus) => {
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    const label = newStatus === 'archived' ? 'archive' : 'restore';
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} this TripDeck?`)) return;
    try {
      await axios.patch(`${API}/tripdeck/${id}`, { status: newStatus }, { withCredentials: true });
      toast.success(`TripDeck ${label}d`);
      fetchData();
    } catch {
      toast.error(`Failed to ${label} TripDeck`);
    }
  };

  const handleDeleteTripDeck = async (id) => {
    if (!window.confirm('Permanently delete this TripDeck? This cannot be undone.')) return;
    try {
      await axios.delete(`${API}/tripdeck/${id}`, { withCredentials: true });
      toast.success('TripDeck deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete TripDeck');
    }
  };

  const filteredLinks = (Array.isArray(links) ? links : []).filter((link) => {
    if (!customStartDate && !customEndDate) return true;
    if (!link?.created_at) return false;
    const createdAt = new Date(link.created_at);
    if (Number.isNaN(createdAt.getTime())) return false;
    if (customStartDate) {
      const start = new Date(`${customStartDate}T00:00:00`);
      if (createdAt < start) return false;
    }
    if (customEndDate) {
      const end = new Date(`${customEndDate}T23:59:59`);
      if (createdAt > end) return false;
    }
    return true;
  });

  const handleDeleteLink = async (linkId) => {
    if (!window.confirm('Delete this link?')) return;
    try {
      await axios.delete(`${API}/links/${linkId}`, { withCredentials: true });
      toast.success('Link deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete link');
    }
  };

  const copyLink = (linkId) => {
    const url = buildTrackingLink(linkId);
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const loadInsights = async (linkId) => {
    if (!linkId) return;
    if (expandedLinkId === linkId) {
      setExpandedLinkId('');
      return;
    }
    setExpandedLinkId(linkId);
    if (insightsByLink[linkId]) return;
    setInsightsLoading(true);
    try {
      const { data } = await axios.get(`${API}/links/${linkId}/insights`, { withCredentials: true });
      setInsightsByLink((current) => ({ ...current, [linkId]: data }));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load customer insights');
    } finally {
      setInsightsLoading(false);
    }
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile' || deviceType === 'Tablet') return Smartphone;
    return Monitor;
  };

  const exportLinksCsv = () => {
    const rows = [
      ['Customer Name', 'Phone', 'PDF', 'PDF Status', 'Opened', 'Open Count', 'Session Count', 'Total Time', 'Last Opened', 'Latest Device', 'Latest Platform', 'Latest Location', 'Created At'],
      ...links.map((link) => [
        link.customer_name,
        link.customer_phone,
        link.pdf_name,
        link.pdf_archived ? 'Archived' : link.pdf_deleted ? 'Expired' : 'Active',
        link.opened ? 'Yes' : 'No',
        link.open_count || 0,
        link.session_count || 0,
        formatDuration(link.total_time_seconds),
        formatDate(link.last_opened_at),
        link.latest_device || '--',
        link.latest_platform || '--',
        link.latest_location || '--',
        formatDate(link.created_at),
      ]),
    ];
    downloadCsv('travloger-customer-links.csv', rows);
    toast.success('Customer analytics CSV downloaded');
  };

  const exportInsightSessionsCsv = () => {
    const selectedInsight = insightsByLink[expandedLinkId];
    if (!selectedInsight) return;
    const rows = [
      ['Customer Name', 'Phone', 'PDF', 'Session', 'Opened At', 'Last Seen', 'Time Spent', 'Device', 'Platform', 'Browser', 'Location', 'Screen Size', 'Top Pages'],
      ...selectedInsight.sessions.map((session) => [
        selectedInsight.link.customer_name,
        selectedInsight.link.customer_phone,
        selectedInsight.link.pdf_name,
        `${formatSessionOrdinal(session.session_number)} session`,
        formatDate(session.started_at),
        formatDate(session.last_seen_at),
        formatDuration(session.duration_seconds),
        session.device_type || '--',
        session.platform || '--',
        session.browser || '--',
        session.location_label || '--',
        session.screen_width && session.screen_height ? `${session.screen_width}x${session.screen_height}` : '--',
        formatPageBreakdown(session.page_breakdown),
      ]),
    ];
    downloadCsv(`travloger-${selectedInsight.link.customer_name || 'customer'}-sessions.csv`, rows);
    toast.success('Session insights CSV downloaded');
  };

  const openSessionDetail = (link, session) => {
    setSelectedSessionDetail({
      customer_name: link.customer_name,
      pdf_name: link.pdf_name,
      session,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--off-white)' }}>
        <div className="flex flex-col items-center gap-3">
          <TravlogerMark size={48} />
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--teal)' }} />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--off-white)' }} data-testid="dashboard-page">

        {/* ── HEADER ── */}
        <header style={{ backgroundColor: 'var(--teal)', boxShadow: '0 2px 12px rgba(20,74,87,0.18)' }} className="sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-5 md:px-10 h-16 flex items-center justify-between">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <TravlogerMark size={36} />
              <div className="leading-tight">
                <div className="text-white font-bold text-base tracking-tight" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  LinkDeck
                </div>
                <div className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
                  by Travloger
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
                <MapPin className="w-3 h-3" style={{ color: 'var(--gold)' }} />
                {user?.email}
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                style={{ color: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(255,255,255,0.08)' }}
                data-testid="logout-button"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          </div>
        </header>

        {/* ── GOLD STRIPE ── */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--gold), var(--teal-light), var(--gold))' }} />

        <main className="max-w-[1400px] mx-auto px-5 md:px-10 py-8">
          {/* ── STATS ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total PDFs',  value: stats.total_pdfs,     icon: FileText,    accent: 'var(--teal)' },
              { label: 'Total Links', value: stats.total_links,    icon: LinkIcon,    accent: '#475569' },
              { label: 'Opened',      value: stats.opened_links,   icon: CheckCircle, accent: '#16a34a' },
              { label: 'Not Opened',  value: stats.unopened_links, icon: XCircle,     accent: '#dc2626' },
            ].map((s, i) => (
              <div key={i}
                className="bg-white rounded-xl p-5 border animate-fade-in-up"
                style={{ borderColor: '#e5e7eb', animationDelay: `${i * 70}ms`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
                data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>{s.label}</span>
                  <s.icon className="w-4 h-4" style={{ color: s.accent }} />
                </div>
                <span className="text-3xl font-black" style={{ color: s.accent, fontFamily: 'DM Sans, sans-serif' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* ── PDFs SECTION ── */}
          <section className="mb-8 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Your PDFs</h2>
              <div className="flex items-center gap-2">
                <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="font-semibold text-white rounded-lg flex items-center gap-2"
                      style={{ backgroundColor: 'var(--teal)' }}
                      data-testid="upload-pdf-button"
                    >
                      <Upload className="w-4 h-4" /> Upload PDF
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
                    <DialogHeader>
                      <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>Upload Itinerary PDF</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors hover:border-[var(--teal)]"
                        style={{ borderColor: '#cbd5e1' }}>
                        <FileUp className="w-10 h-10 mb-3" style={{ color: 'var(--teal)' }} />
                        <span className="font-semibold text-sm" style={{ color: 'var(--teal)' }}>
                          {uploading ? 'Uploading...' : 'Click to select PDF'}
                        </span>
                        <span className="text-xs mt-1 text-slate-400">Max 100MB</span>
                        <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} data-testid="upload-file-input" />
                      </label>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={tripdeckOpen} onOpenChange={setTripdeckOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="font-semibold text-white rounded-lg flex items-center gap-2"
                      style={{ backgroundColor: 'var(--gold)' }}
                      data-testid="create-tripdeck-button"
                    >
                      <Plus className="w-4 h-4" /> Create TripDeck
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
                    <DialogHeader>
                      <div className="flex items-center gap-3 mb-1">
                        <LayoutGrid className="w-6 h-6" style={{ color: 'var(--gold)' }} />
                        <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>Create TripDeck</DialogTitle>
                      </div>
                    </DialogHeader>
                    <form onSubmit={handleCreateTripDeck} className="space-y-4 pt-1">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title <span className="text-red-400">*</span></Label>
                        <Input
                          value={tripdeckTitle}
                          onChange={(e) => setTripdeckTitle(e.target.value)}
                          placeholder="e.g. Rajasthan Heritage Tour 2025"
                          className="mt-1.5 rounded-lg border-slate-200 focus:ring-2"
                          style={{ '--tw-ring-color': 'var(--teal)' }}
                          data-testid="tripdeck-title-input"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description <span className="text-slate-300 font-normal normal-case">(optional)</span></Label>
                        <Input
                          value={tripdeckDescription}
                          onChange={(e) => setTripdeckDescription(e.target.value)}
                          placeholder="A short description for your branded landing page"
                          className="mt-1.5 rounded-lg border-slate-200"
                          data-testid="tripdeck-description-input"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full rounded-lg font-bold h-11 text-white"
                        style={{ backgroundColor: 'var(--gold)' }}
                        disabled={creatingTripDeck}
                        data-testid="create-tripdeck-submit"
                      >
                        {creatingTripDeck ? <Loader2 className="w-4 h-4 animate-spin" /> : '✦ Create TripDeck'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {pdfs.length === 0 ? (
              <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#e5e7eb' }}>
                <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: '#cbd5e1' }} />
                <p className="font-semibold text-slate-500">No PDFs uploaded yet</p>
                <p className="text-xs mt-1 text-slate-400">Upload your first itinerary PDF to get started</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">File Name</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Size</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Links</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Uploaded</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(pdfs) ? pdfs : []).map((pdf) => (
                      <TableRow key={pdf.id} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: '#f1f5f9' }} data-testid={`pdf-row-${pdf.id}`}>
                        <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gold)' }} />
                            <span className="truncate max-w-[220px]">{pdf.file_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">{formatFileSize(pdf.file_size)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
                            {pdf.link_count} links
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs">{formatDate(pdf.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => handleDeletePdf(pdf.id)}
                                className="h-8 w-8 p-0 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                                data-testid={`delete-pdf-${pdf.id}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Archive PDF</p></TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* ── TRIPDECK SECTION ── */}
          <section className="mb-8 animate-fade-in-up" style={{ animationDelay: '340ms' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5" style={{ color: 'var(--gold)' }} />
                <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>TripDecks</h2>
              </div>
            </div>

            {tripdecks.length === 0 ? (
              <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#e5e7eb' }}>
                <LayoutGrid className="w-12 h-12 mx-auto mb-3" style={{ color: '#cbd5e1' }} />
                <p className="font-semibold text-slate-500">No TripDecks yet</p>
                <p className="text-xs mt-1 text-slate-400">Create your first branded multi-destination landing page</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Title</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-center">Destinations</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-center">Opens</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-center">Responses</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Status</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Created</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tripdecks.map((td) => (
                      <TableRow key={td._id || td.id} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: '#f1f5f9' }} data-testid={`tripdeck-row-${td._id || td.id}`}>
                        <TableCell>
                          <div className="font-semibold truncate max-w-[220px]" style={{ color: 'var(--teal)' }}>{td.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-mono truncate max-w-[220px]">/{td.slug}</div>
                          {td.description && (
                            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{td.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black"
                            style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
                            {td.destinations?.length ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black"
                            style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
                            {td.view_count ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black"
                            style={{ backgroundColor: td.response_count > 0 ? 'rgba(232,160,32,0.12)' : '#f1f5f9', color: td.response_count > 0 ? 'var(--gold)' : '#94a3b8' }}>
                            {td.response_count ?? 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          {td.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                              style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                              style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                              Archived
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs">{formatDate(td.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={`${SITE_URL}/deck/${td.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                  data-testid={`view-tripdeck-${td._id || td.id}`}
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent><p>View public page</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm"
                                  onClick={() => handleArchiveTripDeck(td._id || td.id, td.status)}
                                  className="h-8 w-8 p-0 rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-50"
                                  data-testid={`archive-tripdeck-${td._id || td.id}`}>
                                  <Archive className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>{td.status === 'archived' ? 'Restore' : 'Archive'}</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm"
                                  onClick={() => handleDeleteTripDeck(td._id || td.id)}
                                  className="h-8 w-8 p-0 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                                  data-testid={`delete-tripdeck-${td._id || td.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Delete TripDeck</p></TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* ── LINKS SECTION ── */}
          <section className="animate-fade-in-up" style={{ animationDelay: '380ms' }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Tracking Links</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={exportLinksCsv}
                  className="rounded-lg border-slate-200 text-slate-600"
                >
                  <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
                <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="font-semibold text-white rounded-lg flex items-center gap-2"
                      style={{ backgroundColor: 'var(--gold)' }}
                      disabled={pdfs.length === 0}
                      data-testid="generate-link-button"
                    >
                      <Link2 className="w-4 h-4" /> Generate Link
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
                    <DialogHeader>
                      <div className="flex items-center gap-3 mb-1">
                        <TravlogerMark size={28} />
                        <DialogTitle className="font-bold text-xl" style={{ color: 'var(--teal)' }}>
                          Create Tracking Link
                        </DialogTitle>
                      </div>
                    </DialogHeader>
                    <form onSubmit={handleCreateLink} className="space-y-4 pt-1">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Select Itinerary PDF</Label>
                        <Select value={selectedPdf} onValueChange={setSelectedPdf}>
                          <SelectTrigger className="mt-1.5 rounded-lg border-slate-200" data-testid="select-pdf-trigger">
                            <SelectValue placeholder="Choose a PDF" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {(Array.isArray(pdfs) ? pdfs : []).map(pdf => (
                              <SelectItem key={pdf.id} value={pdf.id} className="rounded-lg">{pdf.file_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Name</Label>
                        <Input value={customerName} onChange={e => setCustomerName(e.target.value)}
                          placeholder="e.g. Rahul Sharma"
                          className="mt-1.5 rounded-lg border-slate-200 focus:ring-2"
                          style={{ '--tw-ring-color': 'var(--teal)' }}
                          data-testid="customer-name-input" required />
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer WhatsApp Number</Label>
                        <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                          placeholder="e.g. 8328046859"
                          className="mt-1.5 rounded-lg border-slate-200"
                          data-testid="customer-phone-input" required />
                        <p className="text-xs text-slate-400 mt-1">Enter 10-digit Indian number — WhatsApp link auto-generates</p>
                      </div>
                      <Button type="submit"
                        className="w-full rounded-lg font-bold h-11 text-white"
                        style={{ backgroundColor: 'var(--teal)' }}
                        disabled={creatingLink}
                        data-testid="create-link-submit">
                        {creatingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : '✦ Create Tracking Link'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="pl-10 rounded-lg border-slate-200"
                  data-testid="search-links-input" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px] rounded-lg border-slate-200" data-testid="filter-status-trigger">
                  <Filter className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Links</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="not_opened">Not Opened</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[220px] rounded-lg border-slate-200">
                  <ArrowUpDown className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="recently_created">Recently Created</SelectItem>
                  <SelectItem value="recently_opened">Recently Opened</SelectItem>
                  <SelectItem value="time_spent">Most Time Spent</SelectItem>
                  <SelectItem value="most_opened">Most Opens</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-[150px] rounded-lg border-slate-200 text-sm"
                aria-label="Start date filter"
              />
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-[150px] rounded-lg border-slate-200 text-sm"
                aria-label="End date filter"
              />
              {(customStartDate || customEndDate) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="rounded-lg border-slate-200 text-slate-600"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Links Table */}
            {filteredLinks.length === 0 ? (
              <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#e5e7eb' }}>
                <Link2 className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-semibold text-slate-500">No links found</p>
                <p className="text-xs mt-1 text-slate-400">
                  {pdfs.length === 0 ? 'Upload a PDF first, then generate links' : 'Generate your first tracking link'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Customer</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Phone</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">PDF</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Status</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-center">Opens</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Time Spent</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Last Opened</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLinks.map((link) => {
                      const linkId = getLinkId(link);
                      const isExpanded = expandedLinkId === linkId;
                      const insight = insightsByLink[linkId];
                      const trackingUrl = linkId ? buildTrackingLink(linkId) : '';
                      const whatsappMessage = trackingUrl
                        ? `Hi,\n\nYour itinerary is ready ✨\n\n${trackingUrl}\n\nGive it a quick look—slots and prices may change soon, so we can finalize once you confirm 👍`
                        : '';

                      return (
                      <Fragment key={linkId || `${link.customer_phone}-${link.created_at}`}>
                        <TableRow key={linkId || `${link.customer_phone}-${link.created_at}`} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: '#f1f5f9' }} data-testid={`link-row-${linkId || 'missing-id'}`}>

                          {/* Customer Name */}
                          <TableCell>
                            <div className="flex items-start gap-2 min-w-[180px]">
                              <button
                                type="button"
                                onClick={() => loadInsights(linkId)}
                                className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                                aria-label={isExpanded ? 'Hide sessions' : 'Show sessions'}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => loadInsights(linkId)}
                                  className="font-semibold text-left hover:underline"
                                  style={{ color: 'var(--teal)' }}
                                >
                                  {link.customer_name}
                                </button>
                                <div className="mt-1 text-[11px] text-slate-400">
                                  Created {formatDate(link.created_at)}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Phone */}
                          <TableCell className="text-slate-600 text-sm font-mono">{link.customer_phone}</TableCell>

                          {/* PDF Name */}
                          <TableCell>
                            <div className="max-w-[170px]">
                              <span className="text-xs text-slate-500 truncate max-w-[170px] inline-block">{link.pdf_name}</span>
                              {link.pdf_archived && (
                                <div className="text-[11px] font-semibold mt-1" style={{ color: '#b45309' }}>
                                  Archived itinerary
                                </div>
                              )}
                              {link.pdf_deleted && !link.pdf_archived && (
                                <div className="text-[11px] font-semibold mt-1" style={{ color: '#b45309' }}>
                                  Itinerary unavailable
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Status Badge */}
                          <TableCell>
                            {link.opened ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                                style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}
                                data-testid={`link-status-${linkId || 'missing-id'}`}>
                                <Eye className="w-3 h-3" /> Opened
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                                data-testid={`link-status-${linkId || 'missing-id'}`}>
                                <XCircle className="w-3 h-3" /> Not Opened
                              </span>
                            )}
                          </TableCell>

                          {/* Open Count */}
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black"
                              style={{ backgroundColor: link.open_count > 0 ? 'rgba(20,74,87,0.1)' : '#f1f5f9', color: link.open_count > 0 ? 'var(--teal)' : '#94a3b8' }}>
                              {link.open_count}
                            </span>
                          </TableCell>

                          {/* Total Time Spent */}
                          <TableCell className="text-slate-500 text-xs">
                            <div className="font-bold" style={{ color: 'var(--teal)' }}>{formatDuration(link.total_time_seconds)}</div>
                            <div className="text-slate-400">{link.session_count || 0} sessions</div>
                            {link.latest_location && link.latest_location !== 'Unknown' && (
                              <div className="text-slate-400 mt-1 truncate max-w-[140px]">{link.latest_location}</div>
                            )}
                          </TableCell>

                          {/* Last Opened */}
                          <TableCell className="text-slate-400 text-xs">{formatDate(link.last_opened_at)}</TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={toWaLink(link.customer_phone, whatsappMessage)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="wa-btn inline-flex items-center justify-center h-8 w-8 rounded-lg transition-all"
                                    style={{ backgroundColor: '#25D366', color: 'white' }}
                                    data-testid={`wa-link-${linkId || 'missing-id'}`}
                                  >
                                    <WhatsAppIcon size={15} />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent><p>WhatsApp {link.customer_name}</p></TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => copyLink(linkId)}
                                    className="h-8 w-8 p-0 rounded-lg hover:bg-blue-50"
                                    style={{ color: 'var(--teal)' }}
                                    disabled={!linkId}
                                    data-testid={`copy-link-${linkId || 'missing-id'}`}>
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Copy link</p></TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={linkId ? `${SITE_URL}/view/${linkId}` : '#'}
                                    target="_blank"
                                    rel={linkId ? 'noopener noreferrer' : undefined}
                                    className={`inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                                      linkId
                                        ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                        : 'text-slate-300 pointer-events-none'
                                    }`}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent><p>Preview link</p></TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => handleDeleteLink(linkId)}
                                    className="h-8 w-8 p-0 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                                    disabled={!linkId}
                                    data-testid={`delete-link-${linkId || 'missing-id'}`}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Delete link</p></TooltipContent>
                              </Tooltip>

                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="border-b" style={{ borderColor: '#e2e8f0', backgroundColor: '#fafcfd' }}>
                            <TableCell colSpan={8} className="px-5 py-4">
                              <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                  <div className="text-sm font-semibold" style={{ color: 'var(--teal)' }}>
                                    {link.customer_name} session history
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    All previous opens, with exact start time and time spent in each session.
                                  </div>
                                  {insight?.link?.page_breakdown?.length > 0 && (
                                    <div className="mt-2 text-xs text-slate-500">
                                      Most viewed pages: <span className="font-semibold" style={{ color: 'var(--teal)' }}>{formatPageBreakdown(insight.link.page_breakdown)}</span>
                                    </div>
                                  )}
                                </div>
                                {insight && insight.sessions?.length > 0 && (
                                  <Button variant="outline" onClick={exportInsightSessionsCsv} className="rounded-lg border-slate-200 text-slate-600">
                                    <Download className="w-4 h-4 mr-2" /> Export Sessions CSV
                                  </Button>
                                )}
                              </div>
                              {insightsLoading && !insight ? (
                                <div className="py-6 flex items-center justify-center">
                                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--teal)' }} />
                                </div>
                              ) : insight?.sessions?.length ? (
                                <div className="overflow-hidden rounded-lg border" style={{ borderColor: '#e5e7eb' }}>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                                        <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Session</TableHead>
                                        <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Opened At</TableHead>
                                        <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Time Spent</TableHead>
                                        <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Device</TableHead>
                                        <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Location</TableHead>
                                        <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Top Pages</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {insight.sessions.map((session) => {
                                        const DeviceIcon = getDeviceIcon(session.device_type);
                                        return (
                                          <TableRow key={session.session_id} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                                            <TableCell>
                                              <button
                                                type="button"
                                                onClick={() => openSessionDetail(link, session)}
                                                className="font-semibold hover:underline"
                                                style={{ color: 'var(--teal)' }}
                                              >
                                                {formatSessionOrdinal(session.session_number)} session
                                              </button>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-500">{formatDate(session.started_at)}</TableCell>
                                            <TableCell className="text-sm font-semibold text-slate-600">{formatDuration(session.duration_seconds)}</TableCell>
                                            <TableCell className="text-xs text-slate-500">
                                              <div className="flex items-center gap-2">
                                                <DeviceIcon className="w-4 h-4" />
                                                <span>{session.device_type} · {session.platform}</span>
                                              </div>
                                              <div className="text-slate-400 mt-1">{session.browser}</div>
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-500">
                                              {session.location_label ? (
                                                <div className="flex items-center gap-2">
                                                  <Globe2 className="w-4 h-4" />
                                                  <span>{session.location_label}</span>
                                                </div>
                                              ) : (
                                                <span className="text-slate-300"> </span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-500">{formatPageBreakdown(session.page_breakdown)}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : (
                                <div className="rounded-lg border px-4 py-6 text-center text-sm text-slate-400" style={{ borderColor: '#e5e7eb' }}>
                                  No sessions yet for this customer.
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )})}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="mt-8 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon className="w-5 h-5" style={{ color: 'var(--gold)' }} />
              <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Contacts</h2>
            </div>
            {contacts.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: '#e5e7eb' }}>
                <Users className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="font-semibold text-slate-500">No contacts yet</p>
                <p className="text-xs mt-1 text-slate-400">Contacts are automatically added here when you generate a tracking link.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Contact</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Phone</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Latest PDF</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Links</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Opened Links</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Total Opens</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Last Linked</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Last Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow key={contact.id || `${contact.customer_phone}-${contact.created_at || ''}`} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                        <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{contact.customer_name}</TableCell>
                        <TableCell className="text-slate-600 text-sm font-mono">{contact.customer_phone}</TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-[220px] truncate">{contact.latest_pdf_name || '--'}</TableCell>
                        <TableCell className="text-sm text-slate-600">{contact.total_links || 0}</TableCell>
                        <TableCell className="text-sm text-slate-600">{contact.opened_links || 0}</TableCell>
                        <TableCell className="text-sm text-slate-600">{contact.total_opens || 0}</TableCell>
                        <TableCell className="text-xs text-slate-400">{formatDate(contact.last_link_created_at)}</TableCell>
                        <TableCell className="text-xs text-slate-400">{formatDate(contact.latest_opened_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="mt-8 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-4">
              <Archive className="w-5 h-5" style={{ color: 'var(--gold)' }} />
              <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Archived PDFs</h2>
            </div>
            {archivedPdfs.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: '#e5e7eb' }}>
                <Archive className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="font-semibold text-slate-500">No archived PDFs yet</p>
                <p className="text-xs mt-1 text-slate-400">Archived itineraries stay here with their customer analytics and old public links.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-x-auto" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">PDF</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Archived At</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Links</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Opens</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Sessions</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Total Time</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Last Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archivedPdfs.map((pdf) => (
                      <TableRow key={`${pdf.pdf_id || pdf.pdf_name}-${pdf.pdf_deleted_at || ''}`} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                        <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{pdf.pdf_name}</TableCell>
                        <TableCell className="text-xs text-slate-400">{formatDate(pdf.pdf_deleted_at)}</TableCell>
                        <TableCell className="text-sm text-slate-600">{pdf.link_count || 0}</TableCell>
                        <TableCell className="text-sm text-slate-600">{pdf.total_opens || 0}</TableCell>
                        <TableCell className="text-sm text-slate-600">{pdf.tracked_sessions || 0}</TableCell>
                        <TableCell className="text-sm text-slate-600">{formatDuration(pdf.total_time_seconds)}</TableCell>
                        <TableCell className="text-xs text-slate-400">{formatDate(pdf.latest_opened_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <Dialog open={Boolean(selectedSessionDetail)} onOpenChange={(open) => {
            if (!open) setSelectedSessionDetail(null);
          }}>
            <DialogContent className="max-w-xl rounded-xl border" style={{ borderColor: '#e5e7eb' }}>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold" style={{ color: 'var(--teal)' }}>
                  {selectedSessionDetail
                    ? `${selectedSessionDetail.customer_name} · ${formatSessionOrdinal(selectedSessionDetail.session.session_number)} session`
                    : 'Session pages'}
                </DialogTitle>
              </DialogHeader>
              {selectedSessionDetail && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3" style={{ borderColor: '#e5e7eb', backgroundColor: '#f8fafc' }}>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Opened At</div>
                      <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--teal)' }}>
                        {formatDate(selectedSessionDetail.session.started_at)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: '#e5e7eb', backgroundColor: '#f8fafc' }}>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Time Spent</div>
                      <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--teal)' }}>
                        {formatDuration(selectedSessionDetail.session.duration_seconds)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b hover:bg-transparent" style={{ borderColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Page</TableHead>
                          <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Time Spent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedSessionDetail.session.page_breakdown?.length ? (
                          selectedSessionDetail.session.page_breakdown.map((page) => (
                            <TableRow key={`${selectedSessionDetail.session.session_id}-${page.page_number}`} className="border-b hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
                              <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>
                                Page {page.page_number}
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">{formatDuration(page.duration_seconds)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={2} className="py-10 text-center text-sm text-slate-400">
                              No page-wise timing available for this session.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-slate-400">
                    Page timing is currently stored in whole seconds. Sub-second values like `0.5s` are not yet captured.
                  </p>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Footer */}
          <div className="mt-12 text-center pb-4">
            <p className="text-xs text-slate-400">
              <span className="font-semibold" style={{ color: 'var(--teal)' }}>LinkDeck</span> by{' '}
              <a href="https://travloger.in" target="_blank" rel="noopener noreferrer"
                className="font-semibold hover:underline" style={{ color: 'var(--gold)' }}>
                Travloger.in
              </a>
              {' '}· You Travel, We Capture
            </p>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
