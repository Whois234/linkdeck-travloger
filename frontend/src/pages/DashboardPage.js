import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import {
  Upload, Link2, Copy, Trash2, FileText, ExternalLink, LogOut, Search, Filter,
  CheckCircle, XCircle, Eye, Loader2, FileUp, LinkIcon, MapPin
} from 'lucide-react';
console.log("fix applied");

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SITE_URL = process.env.REACT_APP_SITE_URL || process.env.REACT_APP_BACKEND_URL;

// Format phone → wa.me link: strip non-digits, prepend 91 if 10-digit Indian number
function toWaLink(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `https://wa.me/91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `https://wa.me/${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `https://wa.me/91${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const [pdfsRes, linksRes, statsRes] = await Promise.all([
        axios.get(`${API}/pdfs`, { withCredentials: true }),
        axios.get(`${API}/links`, { withCredentials: true, params }),
        axios.get(`${API}/dashboard/stats`, { withCredentials: true }),
      ]);
      setPdfs(pdfsRes.data?.data || pdfsRes.data || []);
      setLinks(linksRes.data);
      setStats(statsRes.data);
    } catch (err) {
      if (err.response?.status === 401) return;
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, searchQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API}/pdfs/upload`, formData, {
        withCredentials: true,
      });
      toast.success('PDF uploaded successfully');
      setUploadOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
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
    if (!window.confirm('Delete this PDF and all its links?')) return;
    try {
      await axios.delete(`${API}/pdfs/${pdfId}`, { withCredentials: true });
      toast.success('PDF deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete PDF');
    }
  };

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
    const url = `${SITE_URL}/view/${linkId}`;
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
                      <span className="text-xs mt-1 text-slate-400">Max 50MB</span>
                      <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} data-testid="upload-file-input" />
                    </label>
                  </div>
                </DialogContent>
              </Dialog>
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
                            <TooltipContent><p>Delete PDF</p></TooltipContent>
                          </Tooltip>
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

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
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
            </div>

            {/* Links Table */}
            {links.length === 0 ? (
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
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10">Last Opened</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500 h-10 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(links) ? links : []).map((link) => (
                      <TableRow key={link.id} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: '#f1f5f9' }} data-testid={`link-row-${link.id}`}>

                        {/* Customer Name */}
                        <TableCell className="font-semibold" style={{ color: 'var(--teal)' }}>{link.customer_name}</TableCell>

                        {/* Phone */}
                        <TableCell className="text-slate-600 text-sm font-mono">{link.customer_phone}</TableCell>

                        {/* PDF Name */}
                        <TableCell>
                          <span className="text-xs text-slate-500 truncate max-w-[140px] inline-block">{link.pdf_name}</span>
                        </TableCell>

                        {/* Status Badge */}
                        <TableCell>
                          {link.opened ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                              style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}
                              data-testid={`link-status-${link.id}`}>
                              <Eye className="w-3 h-3" /> Opened
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                              data-testid={`link-status-${link.id}`}>
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

                        {/* Last Opened */}
                        <TableCell className="text-slate-400 text-xs">{formatDate(link.last_opened_at)}</TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">

                            {/* WhatsApp Button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={toWaLink(link.customer_phone)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="wa-btn inline-flex items-center justify-center h-8 w-8 rounded-lg transition-all"
                                  style={{ backgroundColor: '#25D366', color: 'white' }}
                                  data-testid={`wa-link-${link.id}`}
                                >
                                  <WhatsAppIcon size={15} />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent><p>WhatsApp {link.customer_name}</p></TooltipContent>
                            </Tooltip>

                            {/* Copy Link */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => copyLink(link.id)}
                                  className="h-8 w-8 p-0 rounded-lg hover:bg-blue-50"
                                  style={{ color: 'var(--teal)' }}
                                  data-testid={`copy-link-${link.id}`}>
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Copy link</p></TooltipContent>
                            </Tooltip>

                            {/* Open in new tab */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a href={`${SITE_URL}/view/${link.id}`} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                  data-testid={`open-link-${link.id}`}>
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent><p>Preview link</p></TooltipContent>
                            </Tooltip>

                            {/* Delete */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteLink(link.id)}
                                  className="h-8 w-8 p-0 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                                  data-testid={`delete-link-${link.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Delete link</p></TooltipContent>
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
