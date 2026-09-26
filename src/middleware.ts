import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || "super-secret-key-maxdisplay-321";
  return new TextEncoder().encode(secret);
};

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;
  
  const isAuthPage = pathname.startsWith('/login');

  // Verify the token if it exists
  let isValidSession = false;
  let userRole = '';

  if (token) {
    try {
      const secret = getJwtSecretKey();
      const verified = await jwtVerify(token, secret);
      isValidSession = true;
      userRole = (verified.payload as Record<string, unknown>).role as string;
    } catch (e) {
      isValidSession = false;
    }
  }

  // 1. Redirect logged-in users away from /login
  if (isAuthPage) {
    if (isValidSession) {
      if (userRole === 'WAREHOUSE') return NextResponse.redirect(new URL('/warehouse', request.url));
      if (userRole === 'SUPER_ADMIN') return NextResponse.redirect(new URL('/spv-gateway', request.url));
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 2. Protect all other pages (except API, static files, and public assets)
  // 2. Protect all other pages (except API, static files, and public assets)
  if (!isValidSession) {
    if (
      !pathname.startsWith('/api') && 
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/assets') &&
      !pathname.startsWith('/suko-logo.png') &&
      !pathname.startsWith('/favicon.ico')
    ) {
       return NextResponse.redirect(new URL('/login', request.url));
    }
  } else {
    // 3. RBAC: Role-Based Access Control
    // WAREHOUSE role should be routed to /warehouse
    if (userRole === 'WAREHOUSE' && pathname === '/') {
      return NextResponse.redirect(new URL('/warehouse', request.url));
    }
    // SA role cannot access warehouse or super-admin
    if (userRole === 'SA' && (pathname.startsWith('/warehouse') || pathname.startsWith('/super-admin'))) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // SUPER_ADMIN (SUPERVISOR) has full access, no restriction needed!
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|assets|favicon.ico|suko-logo.png|api/auth/login|api/auth/check-nik).*)'],
};
