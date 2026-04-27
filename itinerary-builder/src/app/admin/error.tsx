'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-xl p-6 text-center" style={{ border: '1px solid #E2E8F0' }}>
        <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>
          Something went wrong while loading admin.
        </p>
        <p className="text-xs mt-2" style={{ color: '#64748B' }}>
          {error?.message || 'Unexpected error'}
        </p>
        <button
          onClick={reset}
          className="mt-4 h-9 px-4 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#134956' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
