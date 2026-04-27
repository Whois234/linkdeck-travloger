'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('reason') === 'session_expired';

  // If already logged in, redirect to admin
  useEffect(() => {
    fetch('/api/v1/auth/me').then(r => {
      if (r.ok) router.replace('/admin');
    }).catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Invalid email or password'); return; }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Left panel 55% ── */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col relative overflow-hidden"
        style={{ backgroundColor: '#0D3340' }}
      >
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        {/* Radial glow */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 80% 60% at 40% 50%, rgba(19,73,86,0.6) 0%, transparent 70%)',
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-14 py-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}>
              ✈
            </div>
            <div>
              <p className="font-bold text-white text-[17px] tracking-tight">travloger.in</p>
              <p className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>Itinerary Builder</p>
            </div>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="max-w-[440px]">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 text-xs font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Admin Dashboard
              </div>

              {/* Quote */}
              <h1 className="text-white font-bold text-4xl leading-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
                Premium Itineraries.
              </h1>
              <h1 className="font-bold text-4xl leading-tight mb-6" style={{ letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>
                Delivered in Seconds.
              </h1>
              <p className="text-base leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Build and send beautiful, personalised travel proposals in minutes — not hours.
              </p>

              {/* Stats pills */}
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: '✈', label: '500+ Trips Planned' },
                  { icon: '⭐', label: '4.9 Google Rating' },
                  { icon: '👥', label: 'Happy Travellers' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}>
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom decorative destination cards */}
          <div className="flex gap-3 pb-2">
            {['Kerala', 'Rajasthan', 'Goa', 'Himachal'].map((dest, i) => (
              <div key={dest} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.07)', opacity: 1 - i * 0.15 }}>
                {dest}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel 45% ── */}
      <div className="flex-1 lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-20 py-12 bg-white">
        <div className="w-full max-w-[400px] mx-auto">

          {/* Session expired banner */}
          {sessionExpired && (
            <div className="mb-6 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2.5" style={{ backgroundColor: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              Your session expired. Please sign in again.
            </div>
          )}

          {/* Logo (mobile + right panel) */}
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: '#134956' }}>✈</div>
            <span className="font-bold text-[16px]" style={{ color: '#134956' }}>travloger.in</span>
          </div>

          {/* Heading */}
          <h2 className="font-bold mb-1" style={{ fontSize: '28px', color: '#0F172A', letterSpacing: '-0.02em' }}>Welcome back</h2>
          <p className="text-sm mb-8" style={{ color: '#94A3B8' }}>Sign in to your workspace</p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748B' }}>Email Address</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@travloger.in"
                className="w-full h-11 px-4 rounded-xl border text-sm placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors"
                style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#64748B' }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 px-4 pr-11 rounded-xl border text-sm placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#134956]/20 focus:border-[#134956] transition-colors"
                  style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#94A3B8' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#134956]"
                />
                <span className="text-sm font-medium" style={{ color: '#475569' }}>Remember me</span>
              </label>
              <button type="button" className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: '#134956' }}>
                Forgot password?
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2.5"
              style={{ backgroundColor: '#134956' }}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs mt-10" style={{ color: '#CBD5E1' }}>
            Travloger Itinerary Builder · v1.0
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
