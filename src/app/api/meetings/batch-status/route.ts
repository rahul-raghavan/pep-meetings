import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { getAccessibleClassIds } from '@/lib/rbac'

// POST — get statuses for a batch of meeting IDs (filtered by access)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { ids } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  // Cap at 50 to prevent abuse
  const limitedIds = ids.slice(0, 50)

  const db = createServiceClient()

  // Get all requested meetings
  const { data: allMeetings, error } = await db
    .from('pep_meetings')
    .select('id, status, error_message, recorded_by')
    .in('id', limitedIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Scope by accessible classes
  const accessibleClasses = await getAccessibleClassIds(user)

  let accessibleMeetings = allMeetings || []

  if (accessibleClasses !== 'all') {
    if (accessibleClasses.length === 0) {
      // Only allow meetings the user recorded that have no classes (upload window)
      accessibleMeetings = accessibleMeetings.filter(m => m.recorded_by === user.id)
    } else {
      // Get class assignments for these meetings
      const { data: mcRows } = await db
        .from('pep_meeting_classes')
        .select('meeting_id, class_id')
        .in('meeting_id', limitedIds)

      const meetingClassMap = new Map<string, string[]>()
      for (const row of mcRows || []) {
        if (!meetingClassMap.has(row.meeting_id)) meetingClassMap.set(row.meeting_id, [])
        meetingClassMap.get(row.meeting_id)!.push(row.class_id)
      }

      const accessSet = new Set(accessibleClasses)
      accessibleMeetings = accessibleMeetings.filter(m => {
        const mClasses = meetingClassMap.get(m.id) || []
        // User can see if: has class access OR (no classes yet AND user recorded it)
        if (mClasses.length === 0 && m.recorded_by === user.id) return true
        return mClasses.some(cid => accessSet.has(cid))
      })
    }
  }

  // Build a map of id → { status, error_message }
  const statuses: Record<string, { status: string; error_message: string | null }> = {}
  for (const row of accessibleMeetings) {
    statuses[row.id] = { status: row.status, error_message: row.error_message }
  }

  return NextResponse.json({ statuses })
}
