import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { isAllowedDomain } from '@/lib/rbac'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const searchParams = url.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // Use forwarded host (set by reverse proxies like Railway) to get the real public origin
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${error}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Domain validation — reject if not an allowed school domain
        if (!user.email || !isAllowedDomain(user.email)) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`)
        }

        const serviceClient = createServiceClient()

        const { data: existingUser } = await serviceClient
          .from('pep_meeting_users')
          .select('id')
          .eq('auth_id', user.id)
          .single()

        if (!existingUser) {
          // Check for a pre-created user (invited by super_admin, no auth_id yet)
          const { data: preCreated } = await serviceClient
            .from('pep_meeting_users')
            .select('id')
            .eq('email', user.email!)
            .is('auth_id', null)
            .single()

          if (preCreated) {
            // Link this Google account to the pre-created record
            await serviceClient
              .from('pep_meeting_users')
              .update({
                auth_id: user.id,
                name: user.user_metadata?.full_name || user.email!.split('@')[0],
              })
              .eq('id', preCreated.id)
          } else {
            // Brand new user — create record
            const role = user.email === 'rahul@pepschoolv2.com' ? 'super_admin' : 'user'

            await serviceClient.from('pep_meeting_users').insert({
              email: user.email,
              name: user.user_metadata?.full_name || user.email!.split('@')[0] || 'Unknown',
              auth_id: user.id,
              role,
              campus_id: null,
            })
          }
        }
      }

      return NextResponse.redirect(`${origin}/meetings`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
