import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // For API routes, just refresh the session (no redirects)
  if (request.nextUrl.pathname.startsWith('/api')) {
    return supabaseResponse
  }

  // If not logged in and trying to access protected routes, redirect to login
  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/callback')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If logged in and on login page, redirect to meetings
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/meetings'
    return NextResponse.redirect(url)
  }

  // Admin route protection: check user role
  if (user && request.nextUrl.pathname.startsWith('/admin')) {
    // Use service role key to query user role (can't use anon client here due to RLS chicken-egg)
    const serviceClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return [] },
          setAll() {},
        },
      }
    )

    const { data: meetingUser } = await serviceClient
      .from('pep_meeting_users')
      .select('role')
      .eq('auth_id', user.id)
      .eq('is_active', true)
      .single()

    if (!meetingUser || (meetingUser.role !== 'admin' && meetingUser.role !== 'super_admin')) {
      const url = request.nextUrl.clone()
      url.pathname = '/meetings'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
