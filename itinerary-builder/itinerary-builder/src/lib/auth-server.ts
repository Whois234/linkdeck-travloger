import { cookies } from 'next/headers';
import { verifyToken, JWTPayload } from './auth';

/** Read the auth user from the request cookie inside a Server Component or Route Handler. */
export async function getServerUser(): Promise<JWTPayload | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get('travloger_token')?.value;
    if (!token) return null;
    return await verifyToken(token);
  } catch {
    return null;
  }
}
