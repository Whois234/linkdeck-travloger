import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { ArrowRight, Loader2 } from 'lucide-react';

function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).filter(Boolean).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

function TravlogerMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="#144a57"/>
      <path d="M20 8 L32 14 L32 26 L20 32 L8 26 L8 14 Z" fill="none" stroke="#E8A020" strokeWidth="2"/>
      <circle cx="20" cy="20" r="5" fill="#E8A020"/>
      <path d="M20 8 L20 15 M20 25 L20 32 M8 14 L14 17 M26 23 L32 26 M8 26 L14 23 M26 17 L32 14" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">

      {/* Left panel — Travloger brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center p-12"
        style={{ backgroundColor: 'var(--teal)' }}>

        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, #E8A020 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }} />

        {/* Gold top bar */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'var(--gold)' }} />

        <div className="relative z-10 max-w-md text-center">
          <div className="flex justify-center mb-6">
            <TravlogerMark size={72} />
          </div>
          <div className="mb-2">
            <span className="text-4xl font-black text-white tracking-tight">LinkDeck</span>
          </div>
          <div className="text-xs font-bold tracking-[0.3em] uppercase mb-6" style={{ color: 'var(--gold)' }}>
            by Travloger
          </div>
          <p className="text-white/70 text-base leading-relaxed mb-8">
            Share itineraries. Know who opened them.<br />
            Close more bookings.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {['📄 Upload PDFs', '🔗 Unique Links', '✅ Track Opens', '📱 WhatsApp Ready'].map(f => (
              <span key={f} className="text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ backgroundColor: 'rgba(232,160,32,0.15)', color: 'var(--gold)', border: '1px solid rgba(232,160,32,0.3)' }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom brand line */}
        <div className="absolute bottom-6 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          travloger.in · You Travel, We Capture
        </div>
      </div>

      {/* Right panel — Login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-sm animate-fade-in-up">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <TravlogerMark size={36} />
            <div>
              <div className="font-black text-lg leading-none" style={{ color: 'var(--teal)' }}>LinkDeck</div>
              <div className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--gold)' }}>by Travloger</div>
            </div>
          </div>

          <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--teal)' }}>Welcome back</h2>
          <p className="text-sm text-slate-500 mb-8">Sign in to your LinkDeck dashboard</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm font-medium"
              style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
              data-testid="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@travloger.in"
                className="mt-1.5 rounded-lg border-slate-200 focus:ring-2"
                data-testid="login-email-input" required />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 rounded-lg border-slate-200"
                data-testid="login-password-input" required />
            </div>
            <Button type="submit"
              className="w-full rounded-lg font-bold h-11 text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--teal)' }}
              disabled={submitting}
              data-testid="login-submit-button">
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>
              }
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            LinkDeck is a private tool for <span className="font-semibold" style={{ color: 'var(--teal)' }}>Travloger</span> team only.
          </p>
        </div>
      </div>
    </div>
  );
}
