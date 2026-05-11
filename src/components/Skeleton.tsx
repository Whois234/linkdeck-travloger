'use client';

/** Single pulsing skeleton block */
export function Skeleton({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ backgroundColor: '#E2E8F0', ...style }}
    />
  );
}

/** 3-column Kanban skeleton shown while pipelines load */
export function KanbanSkeleton() {
  return (
    <div className="flex gap-4 p-6 overflow-x-auto">
      {[0, 1, 2].map(col => (
        <div key={col} className="flex-shrink-0 w-[280px] rounded-xl p-3 space-y-3"
          style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          {/* Column header */}
          <div className="flex items-center justify-between px-1 py-2">
            <div className="flex items-center gap-2">
              <Skeleton style={{ width: 10, height: 10, borderRadius: 9999 }} />
              <Skeleton style={{ width: 80, height: 14 }} />
            </div>
            <Skeleton style={{ width: 24, height: 20, borderRadius: 9999 }} />
          </div>
          {/* Cards */}
          {Array.from({ length: col === 1 ? 4 : 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 space-y-2.5"
              style={{ border: '1px solid #E2E8F0', borderLeft: '3px solid #E2E8F0' }}>
              <Skeleton style={{ width: '70%', height: 14 }} />
              <Skeleton style={{ width: '50%', height: 12 }} />
              <Skeleton style={{ width: '40%', height: 12 }} />
              <div className="flex items-center justify-between pt-1">
                <Skeleton style={{ width: 60, height: 11 }} />
                <div className="flex gap-1">
                  <Skeleton style={{ width: 24, height: 24, borderRadius: 6 }} />
                  <Skeleton style={{ width: 24, height: 24, borderRadius: 6 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Drawer skeleton shown while lead data loads */
export function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[520px] bg-white flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex-shrink-0 space-y-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton style={{ width: '55%', height: 20 }} />
              <Skeleton style={{ width: '40%', height: 14 }} />
            </div>
            <Skeleton style={{ width: 32, height: 32, borderRadius: 8 }} />
          </div>
          {/* Stage + action row */}
          <div className="flex items-center gap-2">
            <Skeleton style={{ width: 90, height: 26, borderRadius: 9999 }} />
            <div className="flex-1" />
            <Skeleton style={{ width: 64, height: 30, borderRadius: 8 }} />
            <Skeleton style={{ width: 50, height: 30, borderRadius: 8 }} />
            <Skeleton style={{ width: 76, height: 30, borderRadius: 8 }} />
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            {[80, 90, 70, 70, 80, 72].map((w, i) => (
              <Skeleton key={i} style={{ width: w, height: 30, borderRadius: 6 }} />
            ))}
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                <Skeleton style={{ width: '40%', height: 10 }} />
                <Skeleton style={{ width: '65%', height: 14 }} />
              </div>
            ))}
          </div>
          <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
            <Skeleton style={{ width: '25%', height: 10 }} />
            <Skeleton style={{ width: '45%', height: 14 }} />
          </div>
          <Skeleton style={{ width: '100%', height: 42, borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}

/** Table skeleton shown while contacts load */
export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-3.5" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <Skeleton style={{ width: 16, height: 16, borderRadius: 4 }} />
          <Skeleton style={{ width: 32, height: 32, borderRadius: 9999 }} />
          <div className="flex-1 space-y-1.5">
            <Skeleton style={{ width: `${40 + (i % 3) * 15}%`, height: 14 }} />
            <Skeleton style={{ width: `${30 + (i % 4) * 10}%`, height: 12 }} />
          </div>
          <Skeleton style={{ width: 90, height: 12 }} />
          <Skeleton style={{ width: 70, height: 12 }} />
          <Skeleton style={{ width: 60, height: 22, borderRadius: 9999 }} />
          <Skeleton style={{ width: 24, height: 24, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}
