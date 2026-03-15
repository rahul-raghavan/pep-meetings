import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth'
import { markNotificationsSeen } from '@/lib/meeting-notifications'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  try {
    const lastSeenAt = await markNotificationsSeen(db, user.id)
    return NextResponse.json({ success: true, last_seen_at: lastSeenAt })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark notifications as seen' },
      { status: 500 }
    )
  }
}
