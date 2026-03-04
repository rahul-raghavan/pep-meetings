import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

// GET — returns current user's class assignments
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  // Super admin gets all classes
  if (user.role === 'super_admin') {
    const { data, error } = await db
      .from('pep_classes')
      .select('id, name, campus_id, pep_campuses(name)')
      .eq('is_active', true)
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const classes = (data || []).map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      campus_name: (c.pep_campuses as Record<string, unknown>)?.name || 'Unknown',
    }))

    return NextResponse.json(classes)
  }

  // Regular users and admins get their assigned classes
  const { data, error } = await db
    .from('pep_user_classes')
    .select('class_id, pep_classes(id, name, campus_id, pep_campuses(name))')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const classes = (data || []).map((uc: Record<string, unknown>) => {
    const cls = uc.pep_classes as Record<string, unknown>
    return {
      id: cls?.id,
      name: cls?.name,
      campus_name: (cls?.pep_campuses as Record<string, unknown>)?.name || 'Unknown',
    }
  })

  return NextResponse.json(classes)
}
