import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production'
);

export interface JWTPayload {
  sub: string;       // user id
  email: string;
  name: string;
  role: UserRole;
  agent_id?: string;
  module_access?: string[] | null;  // null = full role-based access; array = restricted to those modules
  iat?: number;
  exp?: number;
}

export async function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
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
