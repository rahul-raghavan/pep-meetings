import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'

// PATCH — update speaker labels
export async function PATCH(
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
  const { speakers } = body as {
    speakers: Array<{ speaker_label: string; display_name: string; role?: string }>
  }

  if (!speakers || !Array.isArray(speakers)) {
    return NextResponse.json({ error: 'speakers array is required' }, { status: 400 })
  }

  const db = createServiceClient()

  // Upsert each speaker
  for (const speaker of speakers) {
    await db
      .from('pep_meeting_participants')
      .upsert({
        meeting_id: id,
        speaker_label: speaker.speaker_label,
        display_name: speaker.display_name || null,
        role: speaker.role || null,
      }, { onConflict: 'meeting_id,speaker_label' })
  }

  // Return updated participants
  const { data } = await db
    .from('pep_meeting_participants')
    .select('*')
    .eq('meeting_id', id)

  return NextResponse.json(data)
}
