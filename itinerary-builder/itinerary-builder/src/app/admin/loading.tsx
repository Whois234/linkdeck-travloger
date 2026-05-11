export default function AdminLoading() {
  return (
    <div className="space-y-6 max-w-[1400px] animate-pulse">
      <div className="h-36 rounded-xl bg-slate-100" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-xl bg-slate-100" />)}
      </div>
      <div className="h-64 rounded-xl bg-slate-100" />
    </div>
  );
}
