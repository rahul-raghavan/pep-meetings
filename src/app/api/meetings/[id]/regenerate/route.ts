import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'
import { analyzeMeeting } from '@/lib/analyze-meeting'

export const maxDuration = 120 // 2 minutes — no audio processing, just GPT call

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
    await assertMeetingEdit(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const supabase = createServiceClient()

  // Load existing transcript segments from DB
  const { data: dbSegments, error: segError } = await supabase
    .from('pep_transcript_segments')
    .select('speaker_label, text, start_time, end_time')
    .eq('meeting_id', id)
    .order('segment_index', { ascending: true })

  if (segError) {
    return NextResponse.json({ error: `Failed to load segments: ${segError.message}` }, { status: 500 })
  }

  if (!dbSegments || dbSegments.length === 0) {
    return NextResponse.json({ error: 'No transcript found for this meeting. Transcribe it first.' }, { status: 400 })
  }

  // Convert DB rows to the Segment format analyzeMeeting expects
  const segments = dbSegments.map(row => ({
    speaker: row.speaker_label,
    text: row.text,
    start: row.start_time,
    end: row.end_time,
  }))

  try {
    await analyzeMeeting(id, segments, supabase)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
