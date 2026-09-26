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
  let userJobTitle = '';

  if (token) {
    try {
      const secret = getJwtSecretKey();
      const verified = await jwtVerify(token, secret);
      isValidSession = true;
      
      const payload = verified.payload as Record<string, unknown>;
      userRole = payload.role as string;
      userJobTitle = payload.jobTitle as string || '';
      const shiftType = payload.shiftType as number | undefined;

      // Auto-logout based on shift time - ONLY FOR CREW STORE
      if (shiftType && userRole !== 'SUPERVISOR') {
        // Get current hour in Jakarta time (WIB)
        const now = new Date();
        const jakartaStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
        // jakartaStr looks like "9/27/2026, 00:29:43" or "9/27/2026, 24:29:43"
        const hourMatch = jakartaStr.match(/ (24|\d+):/);
        let hour = hourMatch ? parseInt(hourMatch[1], 10) : now.getUTCHours() + 7;
        if (hour === 24) hour = 0; // Fix edge case for 24:00

        // Shift 1: Pagi (09:00 - 17:00)
        if (shiftType === 1) {
          // Jika di luar jam 08:00 - 17:59
          if (hour >= 17 || hour < 8) isValidSession = false;
        } 
        // Shift 2: Siang (14:30 - 23:00)
        else if (shiftType === 2) {
          // Jika di luar jam 14:00 - 23:59
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
      if (userRole === 'SUPERVISOR') return NextResponse.redirect(new URL('/spv-gateway', request.url));
      if (userJobTitle === 'Gudang Stock') return NextResponse.redirect(new URL('/warehouse', request.url));
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 2. Protect all other pages
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
    // Gudang Stock should be routed to /warehouse
    if (userRole === 'CREW_STORE' && userJobTitle === 'Gudang Stock' && pathname === '/') {
      return NextResponse.redirect(new URL('/warehouse', request.url));
    }
    // Crew store cannot access warehouse if they are not gudang stock
    if (userRole === 'CREW_STORE' && userJobTitle !== 'Gudang Stock' && pathname.startsWith('/warehouse')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // CREW_STORE cannot access super-admin
    if (userRole === 'CREW_STORE' && pathname.startsWith('/super-admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // SUPERVISOR has full access, no restriction needed!
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|assets|favicon.ico|suko-logo.png|api/auth/login|api/auth/check-nik).*)'],
};
