import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

// GET — list all classrooms with location name and member count
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const db = createServiceClient()

  let query = db
    .from('pep_classes')
    .select('*, pep_campuses(id, name)')
    .eq('is_active', true)
    .order('name')

  // Admins only see classrooms in their location(s)
  if (user.role === 'admin') {
    if (user.campus_id) {
      query = query.eq('campus_id', user.campus_id)
    } else {
      // Admin without a campus_id — find campuses from their class assignments
      const { data: userClasses } = await db
        .from('pep_user_classes')
        .select('pep_classes(campus_id)')
        .eq('user_id', user.id)

      const campusIds = [...new Set(
        (userClasses || [])
          .map(uc => (uc.pep_classes as unknown as Record<string, unknown>)?.campus_id as string)
          .filter(Boolean)
      )]

      if (campusIds.length === 0) return NextResponse.json([])
      query = query.in('campus_id', campusIds)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allClassIds = (data || []).map(cls => cls.id)

  // Bulk fetch member counts in one query
  let memberCountMap: Record<string, number> = {}
  if (allClassIds.length > 0) {
    const { data: ucRows } = await db
      .from('pep_user_classes')
      .select('class_id')
      .in('class_id', allClassIds)

    for (const row of ucRows || []) {
      memberCountMap[row.class_id] = (memberCountMap[row.class_id] || 0) + 1
    }
  }

  const enriched = (data || []).map(cls => ({
    ...cls,
    campus_name: (cls.pep_campuses as Record<string, unknown>)?.name || 'Unknown',
    member_count: memberCountMap[cls.id] || 0,
    pep_campuses: undefined,
  }))

  return NextResponse.json(enriched)
}

// POST — create a new classroom (super_admin only)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can create classrooms' }, { status: 403 })
  }

  const { name, campus_id } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!campus_id) return NextResponse.json({ error: 'Location is required' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('pep_classes')
    .insert({ name: name.trim(), campus_id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A classroom with this name already exists at this location' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PATCH — rename a classroom (super_admin only)
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can rename classrooms' }, { status: 403 })
  }

  const { id, name } = await request.json()
  if (!id) return NextResponse.json({ error: 'Classroom ID is required' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('pep_classes')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A classroom with this name already exists at this location' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE — delete an empty classroom (super_admin only)
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can delete classrooms' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Classroom ID is required' }, { status: 400 })

  const db = createServiceClient()

  // Check if classroom has members
  const { count: memberCount } = await db
    .from('pep_user_classes')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', id)

  if (memberCount && memberCount > 0) {
    return NextResponse.json({ error: 'Remove or reassign members first before deleting this classroom.' }, { status: 400 })
  }

  // Check if classroom has any meetings via junction table
  const { count: meetingCount } = await db
    .from('pep_meeting_classes')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', id)

  if (meetingCount && meetingCount > 0) {
    return NextResponse.json({ error: 'Cannot delete a classroom that has meetings. Reassign them first.' }, { status: 400 })
  }

  const { error } = await db.from('pep_classes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
