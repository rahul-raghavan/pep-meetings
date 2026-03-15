import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth'
import { getAccessibleClassIds } from '@/lib/rbac'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim()
  const excludeId = searchParams.get('exclude_id')
  const limitParam = parseInt(searchParams.get('limit') || '8', 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 20) : 8

  const db = createServiceClient()

  const accessibleClasses = await getAccessibleClassIds(user)
  let meetingIdFilter: string[] | null = null
  const { data: ownMeetingRows } = await db
    .from('pep_meetings')
    .select('id')
    .eq('recorded_by', user.id)

  const ownMeetingIds = (ownMeetingRows || []).map(row => row.id)

  if (accessibleClasses !== 'all') {
    const classMeetingIds = accessibleClasses.length > 0
      ? await db
        .from('pep_meeting_classes')
        .select('meeting_id')
        .in('class_id', accessibleClasses)
      : { data: [] as { meeting_id: string }[] }

    const merged = [
      ...new Set([
        ...((classMeetingIds.data || []).map(row => row.meeting_id)),
        ...ownMeetingIds,
      ]),
    ]

    if (merged.length === 0) {
      return NextResponse.json([])
    }

    meetingIdFilter = merged
  }

  let query = db
    .from('pep_meetings')
    .select('id, title, meeting_date, meeting_type, thread_id, recorded_by, pep_meeting_users!recorded_by(name)')
    .order('meeting_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (meetingIdFilter) {
    query = query.in('id', meetingIdFilter)
  }

  if (search) query = query.ilike('title', `%${search}%`)
  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const options = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    meeting_date: row.meeting_date as string,
    meeting_type: row.meeting_type as string,
    thread_id: row.thread_id as string | null,
    recorded_by_name: ((row.pep_meeting_users as Record<string, unknown> | null)?.name as string) || 'Unknown',
  }))

  return NextResponse.json(options)
}
