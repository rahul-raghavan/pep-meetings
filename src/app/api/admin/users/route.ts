import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

// GET — list users with their location, classrooms
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const db = createServiceClient()

  let query = db
    .from('pep_meeting_users')
    .select('*, pep_campuses(id, name)')
    .order('name')

  // Admins only see users in their location
  if (user.role === 'admin') {
    if (!user.campus_id) return NextResponse.json([])
    query = query.eq('campus_id', user.campus_id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allUserIds = (data || []).map(u => u.id)

  // Bulk fetch all class assignments in one query
  let classMap: Record<string, { id: string; name: string }[]> = {}
  if (allUserIds.length > 0) {
    const { data: allClassData } = await db
      .from('pep_user_classes')
      .select('user_id, class_id, pep_classes(id, name)')
      .in('user_id', allUserIds)

    for (const uc of allClassData || []) {
      const cls = uc.pep_classes as unknown as Record<string, unknown>
      if (!cls) continue
      if (!classMap[uc.user_id]) classMap[uc.user_id] = []
      classMap[uc.user_id].push({ id: cls.id as string, name: cls.name as string })
    }
  }

  const enriched = (data || []).map(u => ({
    ...u,
    campus_name: (u.pep_campuses as Record<string, unknown>)?.name || null,
    classes: classMap[u.id] || [],
    pep_campuses: undefined,
  }))

  return NextResponse.json(enriched)
}

// POST — create a new user (super_admin only)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can create users' }, { status: 403 })
  }

  const { name, email, role, campus_id, class_ids } = await request.json()

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

  const validRoles = ['user', 'admin', 'super_admin']
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const db = createServiceClient()

  // Check if email already exists
  const { data: existing } = await db
    .from('pep_meeting_users')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  // Create user with null auth_id — will be linked when they sign in
  const { data: newUser, error: insertError } = await db
    .from('pep_meeting_users')
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role || 'user',
      campus_id: campus_id || null,
      auth_id: null,
    })
    .select()
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Assign classes if provided
  if (Array.isArray(class_ids) && class_ids.length > 0) {
    await db
      .from('pep_user_classes')
      .insert(class_ids.map((cid: string) => ({ user_id: newUser.id, class_id: cid })))
  }

  return NextResponse.json(newUser)
}

// PATCH — update a user (role, active status, location, classroom assignments)
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { user_id, role, is_active, campus_id, class_ids } = body

  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const db = createServiceClient()

  // Get the target user
  const { data: targetUser } = await db
    .from('pep_meeting_users')
    .select('id, campus_id, role')
    .eq('id', user_id)
    .single()

  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // ---- Permission checks for admins ----
  if (user.role === 'admin') {
    // Admin can only manage users in their location
    if (targetUser.campus_id !== user.campus_id) {
      return NextResponse.json({ error: 'You can only manage users in your location' }, { status: 403 })
    }
    // Admin cannot change roles, active status, or location — only class assignments
    if (role !== undefined || is_active !== undefined || campus_id !== undefined) {
      return NextResponse.json({ error: 'Admins can only assign users to classrooms' }, { status: 403 })
    }
  }

  // ---- Permission checks for super_admin ----
  if (user.role === 'super_admin') {
    // Prevent demoting yourself
    if (user_id === user.id && role && role !== 'super_admin') {
      return NextResponse.json({ error: 'You cannot demote yourself' }, { status: 400 })
    }
  }

  // Update user fields (super_admin only for role/active/location)
  const updates: Record<string, unknown> = {}
  if (role !== undefined) updates.role = role
  if (is_active !== undefined) updates.is_active = is_active
  if (campus_id !== undefined) updates.campus_id = campus_id || null

  if (Object.keys(updates).length > 0) {
    const { error } = await db
      .from('pep_meeting_users')
      .update(updates)
      .eq('id', user_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update classroom assignments if provided
  if (Array.isArray(class_ids)) {
    // Admin can only assign classrooms in their location
    if (user.role === 'admin') {
      for (const cid of class_ids) {
        const { data: cls } = await db.from('pep_classes').select('campus_id').eq('id', cid).single()
        if (!cls || cls.campus_id !== user.campus_id) {
          return NextResponse.json({ error: 'You can only assign classrooms in your location' }, { status: 403 })
        }
      }
    }

    // Upsert new assignments
    if (class_ids.length > 0) {
      await db
        .from('pep_user_classes')
        .upsert(
          class_ids.map((cid: string) => ({ user_id, class_id: cid })),
          { onConflict: 'user_id,class_id' }
        )
    }

    // Remove assignments not in the new list
    const { data: existingAssignments } = await db
      .from('pep_user_classes')
      .select('id, class_id')
      .eq('user_id', user_id)

    const staleIds = (existingAssignments || [])
      .filter(a => !class_ids.includes(a.class_id))
      .map(a => a.id)

    if (staleIds.length > 0) {
      await db.from('pep_user_classes').delete().in('id', staleIds)
    }
  }

  return NextResponse.json({ success: true })
}
