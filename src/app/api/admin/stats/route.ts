import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertSuperAdmin, AccessError } from '@/lib/rbac'

// GET — lightweight stats for admin dashboard (super_admin only)
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    assertSuperAdmin(user)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const db = createServiceClient()

  // Get all meeting IDs that have at least one class
  const { data: assignedRows } = await db
    .from('pep_meeting_classes')
    .select('meeting_id')

  const assignedIds = new Set((assignedRows || []).map(r => r.meeting_id))

  // Count total meetings
  const { count: totalMeetings } = await db
    .from('pep_meetings')
    .select('id', { count: 'exact', head: true })

  const unassignedMeetingCount = (totalMeetings || 0) - assignedIds.size

  return NextResponse.json({ unassignedMeetingCount })
}
