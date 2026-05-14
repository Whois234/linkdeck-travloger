'use client';
import { useEffect } from 'react';

// Polls this URL every 3s until the snapshot is ready, then hard-reloads.
export default function SnapshotPending({ token }: { token: string }) {
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/public/itinerary/${token}`);
        if (res.ok) {
          clearInterval(id);
          window.location.reload();
        }
      } catch { /* network blip — keep polling */ }
    }, 3000);
    return () => clearInterval(id);
  }, [token]);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#F8FAFC',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        {/* Logo */}
        <div style={{ marginBottom: '32px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/travloger-logo-icon.jpeg" alt="Travloger"
            style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'cover', display: 'inline-block', marginBottom: '10px' }} />
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#134956', letterSpacing: '0.08em', textTransform: 'uppercase' }}>travloger.in</p>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '20px', padding: '40px 32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0',
        }}>
          {/* Spinner */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <circle cx="24" cy="24" r="20" stroke="#E2E8F0" strokeWidth="4"/>
              <path d="M44 24a20 20 0 00-20-20" stroke="#134956" strokeWidth="4" strokeLinecap="round"/>
            </svg>
          </div>

          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: '0 0 10px' }}>
            Preparing Your Itinerary
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, margin: '0 0 6px' }}>
            Your personalised travel plan is being generated.
          </p>
          <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.5, margin: 0 }}>
            This usually takes a few seconds. This page will update automatically.
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#CBD5E1', marginTop: '20px' }}>
          © {new Date().getFullYear()} Travloger India. All rights reserved.
        </p>
      </div>
    </div>
  );
}
