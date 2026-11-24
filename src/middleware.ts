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

      // Auto-logout otomatis di luar jam operasional mall (08:00 - 23:00 WIB) khusus CREW_STORE
      // SUPERVISOR & Developer (22054178) bebas akses 24 jam.
      if (!isSuperOrDev) {
        const now = new Date();
        const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const hour = wib.getUTCHours();

        if (hour >= 23 || hour < 8) {
          isValidSession = false;
          if (!isAuthPage) {
            const redirectUrl = new URL('/login?reason=shift_ended', request.url);
            const response = NextResponse.redirect(redirectUrl);
            response.cookies.set("token", "", { maxAge: 0, path: "/" });
            return response;
          }
        }
      }
    } catch (e) {
      isValidSession = false;
    }
  }

  const isSuperOrDev = userRole === 'SUPERVISOR' || userNik === '22054178';

  // 1. Redirect logged-in users away from /login (kecuali sedang diarahkan karena logout/kick/shift berakhir)
  if (isAuthPage) {
    const authReason = request.nextUrl.searchParams.get('reason') || '';
    const forceStayReasons = ['logged_out_all', 'device_switched', 'session_expired_cart_saved', 'shift_ended'];
    if (forceStayReasons.includes(authReason)) {
      const response = NextResponse.next();
      response.cookies.set('token', '', { maxAge: 0, path: '/' });
      response.cookies.set('sessionId', '', { maxAge: 0, path: '/' });
      return response;
    }
    if (isValidSession) {
      if (isSuperOrDev) return NextResponse.redirect(new URL('/spv-gateway', request.url));
      if (userJobTitle === 'Gudang Stock') return NextResponse.redirect(new URL('/warehouse', request.url));
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 1b. Sembunyikan Kiosk Cek Harga sementara waktu
  if (pathname.startsWith('/cek-harga')) {
    if (isValidSession) {
      if (isSuperOrDev) return NextResponse.redirect(new URL('/spv-gateway', request.url));
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
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
  matcher: ['/((?!_next/static|_next/image|assets|favicon.ico|suko-logo.png|api/py_live|api/py_wa_cs|api/webhook/wa-cs|api/auth/login|api/auth/check-nik|api/auth/logout-all).*)'],
};
