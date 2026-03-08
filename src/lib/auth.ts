import { createClient, createServiceClient } from './supabase-server'
import { isAllowedDomain } from './rbac'

export type MeetingUser = {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'admin' | 'user'
  auth_id: string
  is_active: boolean
  campus_id: string | null
}

export async function getCurrentUser(): Promise<MeetingUser | null> {
  // Use regular client just to check if user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Use service client for ALL database queries (bypasses RLS).
  // The pep_meeting_users SELECT policy is self-referencing — you need to exist
  // in the table to read from it — which creates a chicken-and-egg problem.
  const db = createServiceClient()

  // 1. Look up by auth_id (already signed in before)
  const { data } = await db
    .from('pep_meeting_users')
    .select('*')
    .eq('auth_id', user.id)
    .eq('is_active', true)
    .single()

  if (data) return data

  const email = user.email || ''

  // 2. Check for a pre-created user (invited by super_admin, auth_id is null)
  const { data: preCreated } = await db
    .from('pep_meeting_users')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .is('auth_id', null)
    .single()

  if (preCreated) {
    // Link this Google account to the pre-created record
    const { data: linked } = await db
      .from('pep_meeting_users')
      .update({ auth_id: user.id, name: user.user_metadata?.full_name || preCreated.name })
      .eq('id', preCreated.id)
      .select()
      .single()

    return linked
  }

  // 3. Domain check — only allow known school domains
  if (!isAllowedDomain(email)) {
    return null
  }

  // Determine role: bootstrap super_admin for rahul@pepschoolv2.com
  const role = email === 'rahul@pepschoolv2.com' ? 'super_admin' : 'user'

  // Auto-create user. Location (campus_id) is NULL until super_admin assigns it.
  const { data: newUser } = await db
    .from('pep_meeting_users')
    .insert({
      email,
      name: user.user_metadata?.full_name || email.split('@')[0] || 'Unknown',
      auth_id: user.id,
      role,
      campus_id: null,
    })
    .select()
    .single()

  return newUser
}
