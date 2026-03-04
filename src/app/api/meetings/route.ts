import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { getAccessibleClassIds } from '@/lib/rbac'

// POST — create a meeting
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, meeting_type, meeting_date, notes, class_ids } = body

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const db = createServiceClient()

  // Validate class_ids if provided — user must belong to each class
  let classIdsArray: string[] = Array.isArray(class_ids) ? class_ids : []

  // Non-super_admin must have at least one class assigned
  if (classIdsArray.length === 0 && user.role !== 'super_admin') {
    const { data: userClasses } = await db
      .from('pep_user_classes')
      .select('class_id')
      .eq('user_id', user.id)

    const userClassIds = (userClasses || []).map(uc => uc.class_id)
    if (userClassIds.length === 1) {
      classIdsArray = userClassIds
    } else if (userClassIds.length > 1) {
      return NextResponse.json({ error: 'Please select at least one class for this meeting' }, { status: 400 })
    } else {
      return NextResponse.json({ error: 'You are not assigned to any classes. Please ask an admin to add you to a class before creating meetings.' }, { status: 400 })
    }
  }

  if (classIdsArray.length > 0 && user.role !== 'super_admin') {
    for (const cid of classIdsArray) {
      const { data: membership } = await db
        .from('pep_user_classes')
        .select('id')
        .eq('user_id', user.id)
        .eq('class_id', cid)
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'You are not assigned to one of the selected classes' }, { status: 403 })
      }
    }
  }

  // Create meeting
  const { data, error } = await db
    .from('pep_meetings')
    .insert({
      title,
      meeting_type: meeting_type || 'other',
      meeting_date: meeting_date || new Date().toISOString().split('T')[0],
      recorded_by: user.id,
      status: 'uploading',
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Insert class associations
  if (classIdsArray.length > 0) {
    await db
      .from('pep_meeting_classes')
      .insert(classIdsArray.map(cid => ({ meeting_id: data.id, class_id: cid })))
  }

  return NextResponse.json(data)
}

// GET — list meetings with optional filters, scoped by class access
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const meetingType = searchParams.get('type')
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const classFilter = searchParams.get('class_id')

  const db = createServiceClient()

  // Determine which meeting IDs the user can access
  const accessibleClasses = await getAccessibleClassIds(user)
  let accessibleMeetingIds: string[] | 'all' = 'all'

  if (accessibleClasses !== 'all') {
    if (accessibleClasses.length === 0) {
      return NextResponse.json([])
    }
    const { data: mcRows } = await db
      .from('pep_meeting_classes')
      .select('meeting_id')
      .in('class_id', accessibleClasses)

    accessibleMeetingIds = [...new Set((mcRows || []).map(r => r.meeting_id))]
    if (accessibleMeetingIds.length === 0) {
      return NextResponse.json([])
    }
  }

  // If filtering by a specific class, narrow down meeting IDs
  let classFilterMeetingIds: string[] | null = null
  if (classFilter) {
    const { data: filterRows } = await db
      .from('pep_meeting_classes')
      .select('meeting_id')
      .eq('class_id', classFilter)

    classFilterMeetingIds = (filterRows || []).map(r => r.meeting_id)
    if (classFilterMeetingIds.length === 0) {
      return NextResponse.json([])
    }
  }

  // Combine access + filter
  let meetingIdFilter: string[] | null = null
  if (accessibleMeetingIds !== 'all' && classFilterMeetingIds) {
    // Intersection
    const accessSet = new Set(accessibleMeetingIds)
    meetingIdFilter = classFilterMeetingIds.filter(id => accessSet.has(id))
  } else if (accessibleMeetingIds !== 'all') {
    meetingIdFilter = accessibleMeetingIds
  } else if (classFilterMeetingIds) {
    meetingIdFilter = classFilterMeetingIds
  }

  let query = db
    .from('pep_meetings')
    .select('*, pep_meeting_users!recorded_by(name), pep_meeting_summaries(summary, overall_sentiment)')
    .order('meeting_date', { ascending: false })

  if (meetingIdFilter) {
    if (meetingIdFilter.length === 0) return NextResponse.json([])
    query = query.in('id', meetingIdFilter)
  }

  if (meetingType) query = query.eq('meeting_type', meetingType)
  if (status) query = query.eq('status', status)
  if (search) query = query.ilike('title', `%${search}%`)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const meetingIds = (data || []).map(m => m.id)

  // Get class associations for all returned meetings
  let classMap: Record<string, { id: string; name: string }[]> = {}
  if (meetingIds.length > 0) {
    const { data: mcData } = await db
      .from('pep_meeting_classes')
      .select('meeting_id, pep_classes(id, name)')
      .in('meeting_id', meetingIds)

    for (const row of mcData || []) {
      const cls = row.pep_classes as unknown as Record<string, unknown> | null
      if (!cls) continue
      if (!classMap[row.meeting_id]) classMap[row.meeting_id] = []
      classMap[row.meeting_id].push({ id: cls.id as string, name: cls.name as string })
    }
  }

  // Flatten the joins
  const meetings = (data || []).map((m: Record<string, unknown>) => {
    const summaryData = m.pep_meeting_summaries as Record<string, unknown> | null
    const can_edit =
      user.role === 'super_admin' ||
      user.role === 'admin' ||
      m.recorded_by === user.id

    return {
      ...m,
      recorded_by_name: (m.pep_meeting_users as Record<string, unknown>)?.name || 'Unknown',
      can_edit,
      summary_text: summaryData?.summary || null,
      overall_sentiment: summaryData?.overall_sentiment || null,
      classes: classMap[m.id as string] || [],
      pep_meeting_users: undefined,
      pep_meeting_summaries: undefined,
    }
  })

  return NextResponse.json(meetings)
}
