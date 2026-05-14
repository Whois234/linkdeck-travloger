export default function HotelsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 w-40 rounded-lg bg-slate-100" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-44 rounded-xl bg-slate-100" />)}
      </div>
    </div>
  );
}
