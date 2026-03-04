import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { getAccessibleClassIds } from '@/lib/rbac'

// GET — cross-meeting action items, scoped by class access
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const completed = searchParams.get('completed')
  const search = searchParams.get('search')

  const db = createServiceClient()

  // Get accessible meeting IDs via class membership
  const accessibleClasses = await getAccessibleClassIds(user)
  let meetingIds: string[]

  if (accessibleClasses === 'all') {
    // Super admin — get all meetings
    const { data: meetings } = await db.from('pep_meetings').select('id')
    meetingIds = (meetings || []).map(m => m.id)
  } else {
    if (accessibleClasses.length === 0) {
      return NextResponse.json([])
    }
    const { data: mcRows } = await db
      .from('pep_meeting_classes')
      .select('meeting_id')
      .in('class_id', accessibleClasses)

    meetingIds = [...new Set((mcRows || []).map(r => r.meeting_id))]
  }

  if (meetingIds.length === 0) {
    return NextResponse.json([])
  }

  let query = db
    .from('pep_action_items')
    .select('*, pep_meetings!meeting_id(id, title, meeting_date, meeting_type)')
    .in('meeting_id', meetingIds)
    .order('created_at', { ascending: false })

  if (completed === 'true') {
    query = query.eq('is_completed', true)
  } else if (completed === 'false') {
    query = query.eq('is_completed', false)
  }

  if (search) {
    query = query.ilike('description', `%${search}%`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data || []).map((item: Record<string, unknown>) => ({
    ...item,
    meeting: item.pep_meetings,
    pep_meetings: undefined,
  }))

  return NextResponse.json(items)
}
