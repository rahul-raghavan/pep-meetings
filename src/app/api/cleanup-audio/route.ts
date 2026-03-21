import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { cleanupCompletedMeetingAudio } from '@/lib/cleanup-audio'

// POST — delete completed-meeting audio older than the configured retention window
// Can be called manually or from an external scheduler if desired.
// Protect with a secret token in production
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const result = await cleanupCompletedMeetingAudio(supabase)
  return NextResponse.json(result)
}
