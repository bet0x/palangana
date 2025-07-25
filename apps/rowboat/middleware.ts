import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { auth0 } from "./app/lib/auth0";

const corsOptions = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-client-id, Authorization',
}


export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // Check if the request path starts with /api/auth/
  if (request.nextUrl.pathname.startsWith('/auth')) {
    return await auth0.middleware(request);
  }

  // Check if the request path starts with /api/
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Handle preflighted requests
    if (request.method === 'OPTIONS') {
      const preflightHeaders = {
        'Access-Control-Allow-Origin': '*',
        ...corsOptions,
      }
      return NextResponse.json({}, { headers: preflightHeaders });
    }

    // Handle simple requests
    const response = NextResponse.next();

    // Set CORS headers for all origins
    response.headers.set('Access-Control-Allow-Origin', '*');

    Object.entries(corsOptions).forEach(([key, value]) => {
      response.headers.set(key, value);
    })

    return response;
  }

  if (request.nextUrl.pathname.startsWith('/projects') ||
    request.nextUrl.pathname.startsWith('/billing') ||
    request.nextUrl.pathname.startsWith('/onboarding')) {
    // Skip auth check if USE_AUTH is not enabled
    if (process.env.USE_AUTH === 'true') {
      return await auth0.middleware(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};