import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

// GET — list locations with stats (user count, classroom count)
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const db = createServiceClient()

  const { data: locations, error } = await db
    .from('pep_campuses')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allLocationIds = (locations || []).map(loc => loc.id)

  // Bulk fetch all classes and user-class rows in 2 queries instead of N
  let classesByCampus: Record<string, string[]> = {}
  let usersByCampus: Record<string, Set<string>> = {}

  if (allLocationIds.length > 0) {
    const [classesRes, ucRes] = await Promise.all([
      db.from('pep_classes').select('id, campus_id').in('campus_id', allLocationIds),
      db.from('pep_user_classes').select('user_id, pep_classes!inner(campus_id)').in('pep_classes.campus_id', allLocationIds),
    ])

    for (const cls of classesRes.data || []) {
      if (!classesByCampus[cls.campus_id]) classesByCampus[cls.campus_id] = []
      classesByCampus[cls.campus_id].push(cls.id)
    }

    for (const row of ucRes.data || []) {
      const cls = row.pep_classes as unknown as Record<string, unknown>
      const campusId = cls?.campus_id as string
      if (!campusId) continue
      if (!usersByCampus[campusId]) usersByCampus[campusId] = new Set()
      usersByCampus[campusId].add(row.user_id)
    }
  }

  const enriched = (locations || []).map(loc => ({
    ...loc,
    user_count: usersByCampus[loc.id]?.size || 0,
    class_count: classesByCampus[loc.id]?.length || 0,
  }))

  return NextResponse.json(enriched)
}

// POST — create a new location (super_admin only)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
  }

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('pep_campuses')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create "Admin" and "Admissions" classes for the new location
  await db
    .from('pep_classes')
    .upsert(
      [
        { name: 'Admin', campus_id: data.id },
        { name: 'Admissions', campus_id: data.id },
      ],
      { onConflict: 'name,campus_id' }
    )

  return NextResponse.json(data)
}

// PATCH — rename a location (super_admin only)
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
  }

  const { id, name } = await request.json()
  if (!id) return NextResponse.json({ error: 'Location ID is required' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('pep_campuses')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — delete an empty location (super_admin only)
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Location ID is required' }, { status: 400 })

  const db = createServiceClient()

  // Check for classrooms
  const { count: classCount } = await db
    .from('pep_classes')
    .select('id', { count: 'exact', head: true })
    .eq('campus_id', id)

  if (classCount && classCount > 0) {
    return NextResponse.json({ error: 'Cannot delete a location that has classrooms. Remove them first.' }, { status: 400 })
  }

  // Check for users
  const { count: userCount } = await db
    .from('pep_meeting_users')
    .select('id', { count: 'exact', head: true })
    .eq('campus_id', id)

  if (userCount && userCount > 0) {
    return NextResponse.json({ error: 'Cannot delete a location that has users assigned. Reassign them first.' }, { status: 400 })
  }

  const { error } = await db.from('pep_campuses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
