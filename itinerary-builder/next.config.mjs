/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,

  // Prevent Prisma from being bundled — it must run as a native Node module
  serverExternalPackages: ['@prisma/client', 'prisma'],

  // Tree-shake large icon/component libraries at build time
  experimental: {
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

export default nextConfig;
