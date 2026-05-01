import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// On serverless (Vercel), each cold start creates a new process.
// connection_limit=1 prevents connection pool exhaustion across concurrent lambdas.
// pool_timeout=10 avoids hanging requests when the DB is slow.
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? '';
  const datasourceUrl = url.includes('?')
    ? `${url}&connection_limit=1&pool_timeout=10`
    : `${url}?connection_limit=1&pool_timeout=10`;

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
    datasources: { db: { url: datasourceUrl } },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
