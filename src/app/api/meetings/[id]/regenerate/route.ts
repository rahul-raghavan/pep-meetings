import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'
import { analyzeMeeting } from '@/lib/analyze-meeting'

export const maxDuration = 300 // 5 minutes — GPT thick summary + Claude deep analysis

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

  // Load meeting type for deep analysis
  const { data: meeting } = await supabase
    .from('pep_meetings')
    .select('meeting_type')
    .eq('id', id)
    .single()

  // Load speaker display names so the LLM uses real names in the summary
  const { data: participants } = await supabase
    .from('pep_meeting_participants')
    .select('speaker_label, display_name')
    .eq('meeting_id', id)

  const nameMap: Record<string, string> = {}
  for (const p of participants || []) {
    if (p.display_name) nameMap[p.speaker_label] = p.display_name
  }

  // Convert DB rows to the Segment format analyzeMeeting expects
  // Use display names when available so the LLM generates better summaries
  const segments = dbSegments.map(row => ({
    speaker: nameMap[row.speaker_label] || row.speaker_label,
    text: row.text,
    start: row.start_time,
    end: row.end_time,
  }))

  try {
    await analyzeMeeting(id, segments, supabase, meeting?.meeting_type)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
