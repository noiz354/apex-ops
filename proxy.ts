import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'apex_session';

const PUBLIC_PREFIXES = ['/login', '/signup', '/api'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
