import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth'
import { getNewMeetingsSinceLastSeen } from '@/lib/meeting-notifications'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  try {
    const result = await getNewMeetingsSinceLastSeen(db, user)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load notifications' },
      { status: 500 }
    )
  }
}
