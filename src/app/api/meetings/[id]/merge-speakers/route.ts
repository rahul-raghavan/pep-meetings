import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'

// POST — merge one speaker into another (reassign all segments)
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

  const body = await request.json()
  const { from_speaker, to_speaker } = body

  if (!from_speaker || !to_speaker) {
    return NextResponse.json({ error: 'from_speaker and to_speaker are required' }, { status: 400 })
  }

  if (from_speaker === to_speaker) {
    return NextResponse.json({ error: 'Cannot merge a speaker into itself' }, { status: 400 })
  }

  const db = createServiceClient()

  // Update all segments from the old speaker to the new speaker
  const { error: updateError } = await db
    .from('pep_transcript_segments')
    .update({ speaker_label: to_speaker })
    .eq('meeting_id', id)
    .eq('speaker_label', from_speaker)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Remove the old participant entry
  await db
    .from('pep_meeting_participants')
    .delete()
    .eq('meeting_id', id)
    .eq('speaker_label', from_speaker)

  // Return updated data
  const [segmentsRes, participantsRes] = await Promise.all([
    db.from('pep_transcript_segments').select('*').eq('meeting_id', id).order('segment_index'),
    db.from('pep_meeting_participants').select('*').eq('meeting_id', id),
  ])

  return NextResponse.json({
    segments: segmentsRes.data || [],
    participants: participantsRes.data || [],
  })
}
