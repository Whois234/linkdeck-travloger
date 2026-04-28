/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gzip/Brotli compression for all responses
  compress: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
    // Cache remote images for 7 days on Vercel
    minimumCacheTTL: 604800,
  },

  // Cache-control headers for static assets and API routes
  async headers() {
    return [
      // Immutable cache for hashed Next.js static chunks (_next/static)
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Public assets (images, fonts, icons in /public)
      {
        source: '/:path(.*\\.(?:ico|png|jpg|jpeg|svg|webp|woff|woff2|ttf|otf))',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      // Public itinerary pages — short SWR so updates are visible quickly
      {
        source: '/itinerary/:token*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, stale-while-revalidate=300',
          },
        ],
      },
      // API routes — no caching by default
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
