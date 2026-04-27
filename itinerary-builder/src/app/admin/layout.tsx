'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, MapPin, Map, Building2, Car, Activity, BookOpen,
  ListPlus, ScrollText, Image, Users, DollarSign,
  Layout, CalendarDays, Layers, FileText, Menu, LogOut,
  Bell, ChevronDown, Tag, Briefcase, Settings, User, X,
} from 'lucide-react';

const NAV = [
  {
    group: 'MASTERS',
    items: [
      { label: 'States', href: '/admin/states', icon: MapPin },
      { label: 'Destinations', href: '/admin/destinations', icon: Map },
      { label: 'Suppliers', href: '/admin/suppliers', icon: Tag },
      { label: 'Hotels', href: '/admin/hotels', icon: Building2 },
      { label: 'Vehicle Types', href: '/admin/vehicle-types', icon: Car },
      { label: 'Vehicle Rates', href: '/admin/vehicle-package-rates', icon: Car },
      { label: 'Activities', href: '/admin/activities', icon: Activity },
      { label: 'Day Plans', href: '/admin/day-plans', icon: BookOpen },
      { label: 'Inclusions / Excl.', href: '/admin/inclusions-exclusions', icon: ListPlus },
      { label: 'Policies', href: '/admin/policies', icon: ScrollText },
      { label: 'Media Library', href: '/admin/media-library', icon: Image },
      { label: 'Agents', href: '/admin/agents', icon: Briefcase },
      { label: 'Pricing Rules', href: '/admin/pricing-rules', icon: DollarSign },
    ],
  },
  {
    group: 'ITINERARY',
    items: [
      { label: 'Private Templates', href: '/admin/private-templates', icon: Layout },
      { label: 'Group Templates', href: '/admin/group-templates', icon: Layers },
      { label: 'Group Batches', href: '/admin/group-batches', icon: CalendarDays },
    ],
  },
  {
    group: 'QUOTES',
    items: [
      { label: 'All Quotes', href: '/admin/quotes', icon: FileText },
    ],
  },
  {
    group: 'CRM',
    items: [
      { label: 'Leads', href: '/admin/leads', icon: DollarSign },
      { label: 'Customers', href: '/admin/customers', icon: Users },
    ],
  },
  {
    group: 'SETTINGS',
    items: [
      { label: 'Users', href: '/admin/users', icon: User },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

interface AuthUser { name: string; email: string; role: string }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/v1/auth/me').then(r => r.json()).then(d => {
      if (d.success) setUser(d.data);
    }).catch(() => {});
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleLogout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function getBreadcrumb() {
    if (!pathname) return 'Dashboard';
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 1) return 'Dashboard';
    const section = parts[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (parts.length === 3 && parts[2] !== 'create') return `${section} / Detail`;
    if (parts.length > 2) {
      const sub = parts[2].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `${section} / ${sub}`;
    }
    return section;
  }

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? 'AU';

  const SidebarContent = () => (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#0D3340' }}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
            ✈
          </div>
          <div>
            <p className="font-bold text-white text-[15px] leading-tight tracking-tight">Travloger</p>
            <p className="text-[11px] mt-0.5 font-medium" style={{ color: '#7DD3C0' }}>Itinerary Builder</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 scrollbar-thin">
        {/* Dashboard */}
        <Link
          href="/admin"
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
            pathname === '/admin'
              ? 'bg-[#134956] text-white'
              : 'text-[#94A3B8] hover:bg-[#1a5568] hover:text-white'
          }`}
        >
          <LayoutDashboard className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${pathname === '/admin' ? 'text-white' : 'text-[#64748B] group-hover:text-white'}`} />
          Dashboard
        </Link>

        {NAV.map(({ group, items }) => (
          <div key={group} className="pt-5">
            <p className="px-3 mb-1.5 text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {group}
            </p>
            <div className="space-y-0.5">
              {items.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                      active
                        ? 'bg-[#134956] text-white'
                        : 'text-[#94A3B8] hover:bg-[#1a5568] hover:text-white'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${active ? 'text-white' : 'text-[#64748B] group-hover:text-white'}`} />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white truncate leading-tight">{user?.name ?? 'Admin User'}</p>
            <p className="text-[11px] font-medium truncate leading-tight" style={{ color: 'rgba(255,255,255,0.35)' }}>{user?.role ?? 'ADMIN'}</p>
          </div>
          <button onClick={handleLogout} title="Sign out" className="p-1.5 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0">
            <LogOut className="w-[15px] h-[15px]" style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 h-full w-[240px] z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="flex-shrink-0 h-16 bg-white flex items-center px-5 lg:px-8 gap-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <button className="lg:hidden p-2 rounded-lg transition-colors hover:bg-[#F8FAFC]" onClick={() => setSidebarOpen(true)} style={{ color: '#64748B' }}>
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: '#64748B' }}>
              <span className="font-medium">Admin</span>
              <span className="mx-1.5" style={{ color: '#CBD5E1' }}>›</span>
              <span className="font-semibold" style={{ color: '#0F172A' }}>{getBreadcrumb()}</span>
            </p>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">

            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => { setShowNotifications(v => !v); setShowUserMenu(false); }}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[#F8FAFC]"
                style={{ border: '1px solid #E2E8F0', color: showNotifications ? '#134956' : '#64748B' }}
              >
                <Bell className="w-4 h-4" />
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-11 w-80 bg-white rounded-xl z-50 overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Notifications</p>
                    <button onClick={() => setShowNotifications(false)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: '#94A3B8' }}><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="py-8 px-4 text-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#F1F5F9' }}>
                      <Bell className="w-5 h-5" style={{ color: '#94A3B8' }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>All caught up!</p>
                    <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>No new notifications at this time.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-6 mx-1" style={{ backgroundColor: '#E2E8F0' }} />

            {/* User menu */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => { setShowUserMenu(v => !v); setShowNotifications(false); }}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors hover:bg-[#F8FAFC]"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                  {initials}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-[13px] font-semibold leading-tight" style={{ color: '#0F172A' }}>{user?.name ?? 'Admin User'}</p>
                  <p className="text-[11px] leading-tight font-medium" style={{ color: '#64748B' }}>{user?.role ?? 'ADMIN'}</p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 hidden sm:block transition-transform ${showUserMenu ? 'rotate-180' : ''}`} style={{ color: '#94A3B8' }} />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-12 w-56 bg-white rounded-xl z-50 overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                  {/* User info */}
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{user?.name ?? 'Admin User'}</p>
                        <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{user?.email ?? ''}</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <Link href="/admin/profile" onClick={() => setShowUserMenu(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[#F8FAFC]" style={{ color: '#64748B' }}>
                      <User className="w-4 h-4" />
                      My Profile
                    </Link>
                    <Link href="/admin/settings" onClick={() => setShowUserMenu(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[#F8FAFC]" style={{ color: '#64748B' }}>
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                  </div>

                  <div style={{ borderTop: '1px solid #F1F5F9' }}>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[#FEF2F2] text-left"
                      style={{ color: '#DC2626' }}
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
