import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, BarChart2, Users, Eye, FileText,
  Clock, Monitor, Globe, Smartphone, Laptop,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatDuration(seconds) {
  if (!seconds) return '0s';
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

/* ── Reusable bar chart ── */
function HBar({ label, count, max, color = 'var(--teal)', subtitle }) {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-28 shrink-0 text-xs text-slate-600 truncate text-right" title={label}>{label}</div>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-10 shrink-0 text-xs font-semibold text-slate-700 text-right">{count}</div>
      {subtitle && <div className="w-16 shrink-0 text-[10px] text-slate-400">{subtitle}</div>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border p-5 flex items-start gap-4" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>{value}</div>
        <div className="text-sm text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function SectionCard({ title, children, empty, emptyMsg }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: '#f1f5f9' }}>
        <h3 className="font-bold text-sm" style={{ color: 'var(--teal)' }}>{title}</h3>
      </div>
      <div className="px-5 py-4">
        {empty
          ? <p className="text-sm text-slate-400 text-center py-4">{emptyMsg || 'No data yet.'}</p>
          : children}
      </div>
    </div>
  );
}

/* ── Hourly / day-of-week vertical bar chart ── */
function VBar({ items, labelKey, countKey, color = 'var(--teal)' }) {
  const max = Math.max(...items.map((i) => i[countKey]), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {items.map((item, idx) => {
        const pct = Math.max(2, Math.round((item[countKey] / max) * 100));
        return (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1" title={`${item[labelKey]}: ${item[countKey]}`}>
            <div className="w-full flex items-end justify-center" style={{ height: '72px' }}>
              <div
                className="w-full rounded-t transition-all"
                style={{ height: `${pct}%`, backgroundColor: item[countKey] > 0 ? color : '#e2e8f0' }}
              />
            </div>
            <div className="text-[9px] text-slate-400 truncate w-full text-center">{item[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Daily trend mini chart ── */
function TrendChart({ data }) {
  if (!data || data.length === 0) return <p className="text-sm text-slate-400 text-center py-4">No data yet.</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-20">
      {data.map((d, i) => {
        const pct = Math.max(2, Math.round((d.count / max) * 100));
        return (
          <div key={i} className="flex-1 flex flex-col items-center" title={`${d.date}: ${d.count}`}>
            <div className="w-full" style={{ height: '72px', display: 'flex', alignItems: 'flex-end' }}>
              <div className="w-full rounded-t" style={{ height: `${pct}%`, backgroundColor: 'var(--teal)', opacity: 0.75 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Device donut-style pills ── */
function DevicePills({ devices }) {
  const total = devices.reduce((s, d) => s + d.count, 0);
  const COLORS = { Desktop: '#144a57', Mobile: '#E8A020', Tablet: '#4a90d9', Unknown: '#94a3b8' };
  return (
    <div className="space-y-3">
      {devices.map((d) => {
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        const color = COLORS[d.name] || '#94a3b8';
        return (
          <div key={d.name} className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <div className="flex-1 text-sm text-slate-600">{d.name}</div>
            <div className="text-xs text-slate-400">{d.count}</div>
            <div className="w-10 text-right text-xs font-semibold" style={{ color }}>{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

export default function GateAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/gate-analytics`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--off-white)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const noData = !data || data.total_submissions === 0;

  return (
    <div className="min-h-screen bg-[var(--off-white)] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div>
          <Link to="/tripdeck" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Back to Gate Links
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <BarChart2 className="h-5 w-5" style={{ color: 'var(--gold)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>Analytics</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Aggregated insights from all your gated PDF submissions.
          </p>
        </div>

        {noData ? (
          <div className="bg-white rounded-xl border py-20 text-center" style={{ borderColor: '#e5e7eb' }}>
            <BarChart2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No submissions yet. Share your gate links to start seeing analytics.</p>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Total Submissions" value={data.total_submissions} color="var(--teal)" />
              <StatCard icon={Eye} label="Total PDF Opens" value={data.total_opens} color="#4a90d9" />
              <StatCard icon={FileText} label="Gate Links" value={data.total_links} color="var(--gold)" />
              <StatCard icon={Clock} label="Avg. Time Spent" value={formatDuration(data.avg_time_spent)} sub="per submission" color="#7c3aed" />
            </div>

            {/* Top PDFs */}
            <SectionCard title="Top PDFs by Submissions" empty={!data.pdfs?.length}>
              <div className="space-y-1">
                {data.pdfs.map((p) => (
                  <div key={p.name}>
                    <HBar
                      label={p.name}
                      count={p.submissions}
                      max={data.pdfs[0]?.submissions || 1}
                      color="var(--teal)"
                      subtitle={`~${formatDuration(p.avg_time)} avg`}
                    />
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Geo + Device row */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Countries */}
              <SectionCard title="Top Countries" empty={!data.countries?.length}>
                <div className="space-y-1">
                  {data.countries.map((c) => (
                    <HBar key={c.name} label={c.name} count={c.count} max={data.countries[0]?.count || 1} color="#4a90d9" />
                  ))}
                </div>
              </SectionCard>

              {/* Cities */}
              <SectionCard title="Top Cities / Regions" empty={!data.cities?.length}>
                <div className="space-y-1">
                  {data.cities.map((c) => (
                    <HBar key={c.name} label={c.name} count={c.count} max={data.cities[0]?.count || 1} color="#0891b2" />
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* Device / OS / Browser row */}
            <div className="grid md:grid-cols-3 gap-4">
              {/* Devices */}
              <SectionCard title="Devices" empty={!data.devices?.length}>
                <DevicePills devices={data.devices} />
              </SectionCard>

              {/* OS */}
              <SectionCard title="Operating Systems" empty={!data.os?.length}>
                <div className="space-y-1">
                  {data.os.map((o) => (
                    <HBar key={o.name} label={o.name} count={o.count} max={data.os[0]?.count || 1} color="#7c3aed" />
                  ))}
                </div>
              </SectionCard>

              {/* Browsers */}
              <SectionCard title="Browsers" empty={!data.browsers?.length}>
                <div className="space-y-1">
                  {data.browsers.map((b) => (
                    <HBar key={b.name} label={b.name} count={b.count} max={data.browsers[0]?.count || 1} color="var(--gold)" />
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* Time activity row */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Hourly activity */}
              <SectionCard title="Activity by Hour of Day (24h)">
                <VBar items={data.hourly} labelKey="label" countKey="count" color="var(--teal)" />
                <p className="text-[10px] text-slate-400 mt-2 text-center">
                  Peak: {(() => {
                    const peak = [...(data.hourly || [])].sort((a, b) => b.count - a.count)[0];
                    return peak?.count > 0 ? `${peak.label} (${peak.count} submissions)` : 'No data';
                  })()}
                </p>
              </SectionCard>

              {/* Day of week */}
              <SectionCard title="Activity by Day of Week">
                <VBar items={data.day_of_week} labelKey="label" countKey="count" color="var(--gold)" />
                <p className="text-[10px] text-slate-400 mt-2 text-center">
                  Most active: {(() => {
                    const peak = [...(data.day_of_week || [])].sort((a, b) => b.count - a.count)[0];
                    return peak?.count > 0 ? `${peak.label} (${peak.count} submissions)` : 'No data';
                  })()}
                </p>
              </SectionCard>
            </div>

            {/* Daily trend */}
            <SectionCard title={`Submission Trend (last ${data.daily_trend?.length || 0} days)`} empty={!data.daily_trend?.length}>
              <TrendChart data={data.daily_trend} />
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-slate-400">{data.daily_trend?.[0]?.date}</span>
                <span className="text-[10px] text-slate-400">{data.daily_trend?.[data.daily_trend.length - 1]?.date}</span>
              </div>
            </SectionCard>
          </>
        )}

      </div>
    </div>
  );
}
