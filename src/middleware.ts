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
      
      const payload = verified.payload as Record<string, unknown>;
      userRole = payload.role as string;
      const shiftType = payload.shiftType as number | undefined;

      // Auto-logout based on shift time
      if (shiftType) {
        // Get current hour in Jakarta time (WIB)
        const now = new Date();
        const jakartaStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
        // jakartaStr looks like "9/27/2026, 00:29:43"
        const hourMatch = jakartaStr.match(/ (\d+):/);
        const hour = hourMatch ? parseInt(hourMatch[1], 10) : now.getUTCHours() + 7;

        if (shiftType === 1) {
          // Shift 1: 09:00 - 17:00. Force logout if hour >= 17 or < 8
          if (hour >= 17 || hour < 8) isValidSession = false;
        } else if (shiftType === 2) {
          // Shift 2: 14:30 - 23:00. Force logout if hour >= 23 or < 14
          if (hour >= 23 || hour < 14) isValidSession = false;
        }
      }

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
