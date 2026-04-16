import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Loader2, LogOut, ShieldCheck, Users, FileText, LinkIcon, Eye } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total_users: 0, total_pdfs: 0, total_links: 0, opened_links: 0 });
  const [loading, setLoading] = useState(true);

  const fetchAdminData = useCallback(async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${API}/admin/users`, { withCredentials: true }),
        axios.get(`${API}/admin/stats`, { withCredentials: true }),
      ]);
      setUsers(usersRes.data || []);
      setStats(statsRes.data || {});
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdminData(); }, [fetchAdminData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--teal)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--off-white)' }}>
      <header style={{ backgroundColor: 'var(--teal)', boxShadow: '0 2px 12px rgba(20,74,87,0.18)' }} className="sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TravlogerMark size={36} />
            <div className="leading-tight">
              <div className="text-white font-bold text-base tracking-tight">LinkDeck Admin</div>
              <div className="text-xs font-medium tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
                User Control Panel
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Users', value: stats.total_users, icon: Users, accent: 'var(--teal)' },
            { label: 'PDFs', value: stats.total_pdfs, icon: FileText, accent: '#475569' },
            { label: 'Links', value: stats.total_links, icon: LinkIcon, accent: 'var(--gold)' },
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

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: 'var(--teal)' }}>Registered Users</h2>
            <Badge className="rounded-full" style={{ backgroundColor: 'rgba(20,74,87,0.08)', color: 'var(--teal)' }}>
              Passwords are encrypted
            </Badge>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>
    </div>
  );
}
