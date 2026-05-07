import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,

  experimental: {
    // Prevent Prisma and MCP SDK from being bundled — must stay as native Node modules
    serverComponentsExternalPackages: ['@prisma/client', 'prisma', '@modelcontextprotocol/sdk'],
    // Tree-shake large icon/component libraries at build time
    optimizePackageImports: ['lucide-react', '@radix-ui/react-accordion', '@radix-ui/react-dialog'],
  },

  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    // Serve modern formats (WebP/AVIF) automatically — cuts image size 30-60%
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 604800, // 7 days
  },

  async headers() {
    return [
      // ── Security headers (all routes) ─────────────────────────────────────
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking — this app is never embedded in an iframe
          { key: 'X-Frame-Options',        value: 'DENY' },
          // Block MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Restrict referrer to same-origin only — no customer data in Referer headers
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          // HSTS — force HTTPS for 1 year (only meaningful behind TLS, ignored on localhost)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Lock down browser feature access
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },

      // ── Caching ────────────────────────────────────────────────────────────
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path(.*\\.(?:ico|png|jpg|jpeg|svg|webp|avif|woff|woff2|ttf|otf))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      // Customer itinerary pages — short SWR so republished quotes show quickly
      {
        source: '/itinerary/:token*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }],
      },
      {
        source: '/quotations/:token*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
