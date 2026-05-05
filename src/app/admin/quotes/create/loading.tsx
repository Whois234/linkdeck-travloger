export default function CreateQuoteLoading() {
  return (
    <div className="animate-pulse space-y-6 max-w-5xl">
      <div className="h-10 w-56 rounded-lg bg-slate-100" />
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 w-24 rounded-full bg-slate-100" />)}
      </div>
      <div className="h-[600px] rounded-xl bg-slate-100" />
    </div>
  );
}
