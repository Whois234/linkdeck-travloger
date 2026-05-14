'use client';
import { useEffect } from 'react';

// Top-level error boundary — catches errors thrown anywhere in the app shell,
// including errors that escape /admin/error.tsx. Renders its own <html>/<body>
// because the root layout has already failed to render.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, surface to whatever error tracker is wired up.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[global-error]', error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#F8FAFC', color: '#0F172A' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480, width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 24 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
            <p style={{ marginTop: 8, color: '#64748B', fontSize: 14, lineHeight: 1.5 }}>
              An unexpected error occurred. Try again, or reload the page. If it keeps happening, copy the error reference below and share it with support.
            </p>
            {error.digest && (
              <p style={{ marginTop: 12, fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: '#94A3B8', wordBreak: 'break-all' }}>
                Reference: {error.digest}
              </p>
            )}
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button
                onClick={() => reset()}
                style={{ height: 38, padding: '0 16px', borderRadius: 8, backgroundColor: '#134956', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{ height: 38, padding: '0 16px', borderRadius: 8, backgroundColor: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 14, fontWeight: 600, lineHeight: '38px', textDecoration: 'none' }}
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
