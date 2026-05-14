import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';

if (!process.env.JWT_SECRET) {
  console.warn('[auth] WARNING: JWT_SECRET is not set. Using insecure fallback. Set JWT_SECRET in .env for production.');
}

// Lazy getter — evaluated at request time, not at module load / build time
function getJwtSecret() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is not set. This is a critical security error.');
  }
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production'
  );
}

export interface JWTPayload {
  sub: string;       // user id
  email: string;
  name: string;
  role: UserRole;
  agent_id?: string;
  module_access?: Array<{ key: string; perm: 'view' | 'edit' }> | null; // null = full role-based access
  iat?: number;
  exp?: number;
}

export async function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, expiresIn: string = '8h'): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as unknown as JWTPayload;
}

export async function getAuthUser(req: NextRequest): Promise<JWTPayload | null> {
  try {
    const cookie = req.cookies.get('travloger_token')?.value;
    const header = req.headers.get('authorization')?.replace('Bearer ', '');
    const token = cookie ?? header;
    if (!token) return null;
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export function requireRole(user: JWTPayload | null, ...roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function canEditRates(user: JWTPayload | null): boolean {
  return requireRole(user, UserRole.ADMIN, UserRole.OPS);
}

export function canOverrideCost(user: JWTPayload | null): boolean {
  return requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
}

export function canApproveDiscount(user: JWTPayload | null): boolean {
  return requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
}
