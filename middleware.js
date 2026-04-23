import { NextResponse } from 'next/server';

function parseAllowedUsers() {
  return String(process.env.AUTHORIZED_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Teknoblog Radar"'
    }
  });
}

function isAuthorized(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;

  const encoded = header.slice(6).trim();
  const decoded = atob(encoded);
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return false;

  const username = decoded.slice(0, separatorIndex).trim().toLowerCase();
  const password = decoded.slice(separatorIndex + 1);
  const allowedUsers = parseAllowedUsers();
  const expectedPassword = String(process.env.RADAR_ACCESS_CODE || '');

  return Boolean(username && expectedPassword) && allowedUsers.includes(username) && password === expectedPassword;
}

function hasValidCronToken(request) {
  const token = request.nextUrl.searchParams.get('token') || request.headers.get('x-cron-token') || '';
  const expected = String(process.env.CRON_TOKEN || '');
  return Boolean(expected) && token === expected;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon-') ||
    pathname.startsWith('/manifest')
  ) {
    return NextResponse.next();
  }

  if (
    pathname === '/api/run-pipeline' ||
    pathname === '/api/ingest' ||
    pathname === '/api/score' ||
    pathname === '/api/sources'
  ) {
    if (hasValidCronToken(request)) return NextResponse.next();
  }

  if (!isAuthorized(request)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)']
};
