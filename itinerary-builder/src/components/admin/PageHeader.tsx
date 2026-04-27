import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface Crumb { label: string; href?: string }

interface Props {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, crumbs, action }: Props) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        {crumbs && crumbs.length > 0 && (
          <nav className="flex items-center gap-1 mb-2">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.href ? (
                  <Link
                    href={c.href}
                    className="text-xs font-medium transition-colors"
                    style={{ color: '#94A3B8' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#64748B')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-xs font-semibold" style={{ color: '#64748B' }}>{c.label}</span>
                )}
                {i < crumbs.length - 1 && <ChevronRight className="w-3 h-3" style={{ color: '#CBD5E1' }} />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#0F172A' }}>{title}</h1>
        {subtitle && <p className="text-sm mt-1 font-medium" style={{ color: '#64748B' }}>{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  );
}
