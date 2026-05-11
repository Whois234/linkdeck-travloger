'use client';
import { PageHeader } from '@/components/admin/PageHeader';
import { Building2, Globe, Palette, Bell, Shield, ChevronRight } from 'lucide-react';

const cardShadow = { boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' };

const SETTING_GROUPS = [
  {
    icon: Building2,
    iconBg: '#F0F9FF',
    iconColor: '#134956',
    title: 'Company Information',
    subtitle: 'Business name, address, GST, and contact details',
    badge: 'Coming Soon',
    badgeStyle: { backgroundColor: '#FEF3C7', color: '#B45309' },
  },
  {
    icon: Globe,
    iconBg: '#F0FDF4',
    iconColor: '#15803D',
    title: 'Regional Settings',
    subtitle: 'Currency, timezone, date format, and language',
    badge: 'Coming Soon',
    badgeStyle: { backgroundColor: '#FEF3C7', color: '#B45309' },
  },
  {
    icon: Palette,
    iconBg: '#FDF4FF',
    iconColor: '#9333EA',
    title: 'Branding & Theme',
    subtitle: 'Logo, brand colours, and itinerary template style',
    badge: 'Coming Soon',
    badgeStyle: { backgroundColor: '#FEF3C7', color: '#B45309' },
  },
  {
    icon: Bell,
    iconBg: '#FFF7ED',
    iconColor: '#EA580C',
    title: 'Notifications',
    subtitle: 'Email alerts, quote reminders, and system notifications',
    badge: 'Coming Soon',
    badgeStyle: { backgroundColor: '#FEF3C7', color: '#B45309' },
  },
  {
    icon: Shield,
    iconBg: '#FEF2F2',
    iconColor: '#DC2626',
    title: 'Security',
    subtitle: 'Two-factor authentication, session management, and access control',
    badge: 'Coming Soon',
    badgeStyle: { backgroundColor: '#FEF3C7', color: '#B45309' },
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="Settings"
        subtitle="Configure your workspace, branding and preferences"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Settings' }]}
      />

      <div className="space-y-3">
        {SETTING_GROUPS.map(({ icon: Icon, iconBg, iconColor, title, subtitle, badge, badgeStyle }) => (
          <div
            key={title}
            className="bg-white rounded-xl border p-5 flex items-center gap-4 cursor-default select-none"
            style={{ borderColor: '#E2E8F0', ...cardShadow }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
              <Icon className="w-5 h-5" style={{ color: iconColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide" style={badgeStyle}>{badge}</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{subtitle}</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#CBD5E1' }} />
          </div>
        ))}
      </div>

      {/* Version info */}
      <div className="mt-8 pt-5" style={{ borderTop: '1px solid #E2E8F0' }}>
        <p className="text-xs text-center" style={{ color: '#CBD5E1' }}>Travloger Itinerary Builder · v1.0.0</p>
      </div>
    </div>
  );
}
