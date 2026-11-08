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
  let userNik = '';
  let userJobTitle = '';

  if (token) {
    try {
      const secret = getJwtSecretKey();
      const verified = await jwtVerify(token, secret);
      isValidSession = true;
      
      const payload = verified.payload as Record<string, unknown>;
      userRole = (payload.role as string) || '';
      userNik = (payload.nik as string) || '';
      userJobTitle = (payload.jobTitle as string) || '';
      const shiftType = payload.shiftType as number | undefined;

      const isSuperOrDev = userRole === 'SUPERVISOR' || userNik === '22054178';

      // Auto-logout based on shift time - HANYA UNTUK CREW STORE BIASA (Bukan Supervisor / Developer)
      if (shiftType && !isSuperOrDev) {
        // Get current hour in Jakarta time (WIB)
        const now = new Date();
        const jakartaStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour12: false });
        const hourMatch = jakartaStr.match(/ (24|\d+):/);
        let hour = hourMatch ? parseInt(hourMatch[1], 10) : now.getUTCHours() + 7;
        if (hour === 24) hour = 0; // Fix edge case for 24:00

        // Shift 1: Pagi (08:00 - 17:59)
        if (shiftType === 1) {
          if (hour >= 17 || hour < 8) isValidSession = false;
        } 
        // Shift 2: Siang (14:00 - 23:59)
        else if (shiftType === 2) {
          if (hour >= 23 || hour < 14) isValidSession = false;
        }
      }

    } catch (e) {
      isValidSession = false;
    }
  }

  const isSuperOrDev = userRole === 'SUPERVISOR' || userNik === '22054178';

  // 1. Redirect logged-in users away from /login
  if (isAuthPage) {
    if (isValidSession) {
      if (isSuperOrDev) return NextResponse.redirect(new URL('/spv-gateway', request.url));
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
      !pathname.startsWith('/favicon.ico') &&
      !pathname.startsWith('/cek-harga')
    ) {
       return NextResponse.redirect(new URL('/login', request.url));
    }
  } else {
    // 3. RBAC: Role-Based Access Control
    // Gudang Stock should be able to access both /warehouse and /
    if (userRole === 'CREW_STORE' && !isSuperOrDev && userJobTitle !== 'Gudang Stock' && pathname.startsWith('/warehouse')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // CREW_STORE biasa tidak boleh akses super-admin (Kecuali Supervisor / NIK Developer 22054178)
    if (userRole === 'CREW_STORE' && !isSuperOrDev && pathname.startsWith('/super-admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // SUPERVISOR / Developer memiliki akses penuh!
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|assets|favicon.ico|suko-logo.png|cek-harga|api/auth/login|api/auth/check-nik).*)'],
};
