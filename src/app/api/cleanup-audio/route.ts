import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// POST — delete audio files older than 48 hours
// Call this from a cron job (e.g., Vercel Cron, or manually)
// Protect with a secret token in production
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Find meetings with audio that are older than 48 hours and already completed
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: meetings, error } = await supabase
    .from('pep_meetings')
    .select('id, audio_storage_path')
    .not('audio_storage_path', 'is', null)
    .lt('created_at', cutoff)
    .in('status', ['completed', 'failed'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!meetings || meetings.length === 0) {
    return NextResponse.json({ deleted: 0, message: 'No audio files to clean up' })
  }

  let deleted = 0
  for (const meeting of meetings) {
    if (!meeting.audio_storage_path) continue

    const { error: deleteError } = await supabase.storage
      .from('meeting-audio')
      .remove([meeting.audio_storage_path])

    if (!deleteError) {
      // Clear the path so we don't try to delete again
      await supabase
        .from('pep_meetings')
        .update({ audio_storage_path: null, audio_file_size: null })
        .eq('id', meeting.id)
      deleted++
    }
  }

  return NextResponse.json({ deleted, total_checked: meetings.length })
}
