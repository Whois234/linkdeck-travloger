// In-memory rate limiter. Fine for a single-instance deploy; swap for Redis
// (e.g. @upstash/ratelimit) when scaling horizontally.
//
// Usage:
//   const r = rateLimit({ key: `login:${ip}`, max: 5, windowMs: 60_000 });
//   if (!r.ok) return new Response('Too many requests', { status: 429, headers: { 'Retry-After': String(r.retryAfter) } });

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

// Periodic GC so an attacker can't grow the map unboundedly. Runs at most once
// per minute on demand (no setInterval — keeps this module SSR/edge-friendly).
let lastGc = 0;
function gc(now: number) {
  if (now - lastGc < 60_000) return;
  lastGc = now;
  buckets.forEach((v, k) => { if (v.reset <= now) buckets.delete(k); });
}

export function rateLimit({ key, max, windowMs }: { key: string; max: number; windowMs: number }) {
  const now = Date.now();
  gc(now);

  const existing = buckets.get(key);
  if (!existing || existing.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > max) {
    const retryAfter = Math.max(1, Math.ceil((existing.reset - now) / 1000));
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining: max - existing.count, retryAfter: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
