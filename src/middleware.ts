import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CORS for ingest and gtm.js endpoints (public, cross-origin)
  if (pathname === '/api/ingest' || pathname === '/api/gtm.js') {
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-GTM-Token',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-GTM-Token');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/ingest', '/api/gtm.js'],
};
