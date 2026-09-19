import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || "super-secret-key-maxdisplay-321";
  return new TextEncoder().encode(secret);
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Public paths - no auth required
  if (
    pathname.startsWith('/login') || 
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/api/upload') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.webp') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const verified = await jwtVerify(token, getJwtSecretKey());
    const role = (verified.payload as Record<string, unknown>).role;

    // RBAC: Warehouse role can only access /warehouse
    if (role === 'WAREHOUSE' && pathname === '/') {
      return NextResponse.redirect(new URL('/warehouse', request.url))
    }
    // RBAC: SA cannot access warehouse or super-admin
    if (role === 'SA' && (pathname.startsWith('/warehouse') || pathname.startsWith('/super-admin'))) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // RBAC: SUPER_ADMIN should be routed to /super-admin
    if (role === 'SUPER_ADMIN' && pathname !== '/super-admin' && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/super-admin', request.url))
    }

    return NextResponse.next()
  } catch {
    // Invalid token
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|assets|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg|.*\\.webp|.*\\.ico).*)',
  ],
}
