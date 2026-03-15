import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'
import { createServiceClient } from '@/lib/supabase-server'

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

  // Get meeting with audio path
  const { data: meeting } = await supabase
    .from('pep_meetings')
    .select('*')
    .eq('id', id)
    .single()

  if (!meeting || !meeting.audio_storage_path) {
    return NextResponse.json({ error: 'Meeting or audio not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const { error: queueError } = await supabase
    .from('pep_meetings')
    .update({
      status: 'queued',
      queued_at: now,
      processing_started_at: null,
      completed_at: null,
      next_retry_at: null,
      error_message: null,
    })
    .eq('id', id)

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    status: 'queued',
    message: 'Audio uploaded and queued for background transcription.',
  })
}
