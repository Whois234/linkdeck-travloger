// GET /api/v1/_health — returns the Vercel commit SHA and build env so we can
// verify exactly which deployment is serving the production URL.
// No auth required; only returns harmless build metadata.

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    success: true,
    data: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
      commit_short: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown').slice(0, 7),
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
      built_at: process.env.VERCEL_GIT_COMMIT_DATE ?? 'unknown',
      deployment_url: process.env.VERCEL_URL ?? 'unknown',
      env: process.env.VERCEL_ENV ?? 'unknown',
      node_env: process.env.NODE_ENV ?? 'unknown',
      now: new Date().toISOString(),
    },
  });
}
