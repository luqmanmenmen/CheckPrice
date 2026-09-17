import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || "super-secret-key-maxdisplay-321";
  return new TextEncoder().encode(secret);
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Public paths
  if (
    pathname.startsWith('/login') || 
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/api/upload') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
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
    const role = (verified.payload as any).role;

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
  } catch (err) {
    // Invalid token
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|assets|favicon.ico).*)'],
}
