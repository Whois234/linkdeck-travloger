export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-slate-100" />
          <div className="h-4 w-64 rounded bg-slate-100" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-100" />
      </div>
      <div className="h-12 w-full rounded-xl bg-slate-100" />
      <div className="h-[500px] w-full rounded-xl bg-slate-100" />
    </div>
  );
}