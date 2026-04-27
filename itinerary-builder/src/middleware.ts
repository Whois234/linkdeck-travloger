import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always skip Next.js internals/assets to avoid breaking app-router data requests.
  if (pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  // Public routes
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/itinerary') ||
    pathname.startsWith('/api/v1/auth') ||
    pathname.startsWith('/api/v1/public')
  ) {
    return NextResponse.next();
  }

  // Protected admin routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/v1')) {
    const token =
      req.cookies.get('travloger_token')?.value ??
      req.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login?reason=session_expired', req.url));
    }

    try {
      await verifyToken(token);
      return NextResponse.next();
    } catch {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login?reason=session_expired', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
