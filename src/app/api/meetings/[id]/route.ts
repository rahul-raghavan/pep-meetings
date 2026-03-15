import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'
import { assignMeetingToThread, clearMeetingThread, getThreadForMeeting } from '@/lib/meeting-threads'

// GET — full meeting detail with transcript, participants, action items, summary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const db = createServiceClient()

  const [meetingRes, segmentsRes, participantsRes, actionItemsRes, summaryRes, classesRes] = await Promise.all([
    db.from('pep_meetings').select('*, pep_meeting_users!recorded_by(name)').eq('id', id).single(),
    db.from('pep_transcript_segments').select('*').eq('meeting_id', id).order('segment_index'),
    db.from('pep_meeting_participants').select('*').eq('meeting_id', id),
    db.from('pep_action_items').select('*').eq('meeting_id', id).order('created_at'),
    db.from('pep_meeting_summaries').select('*').eq('meeting_id', id).single(),
    db.from('pep_meeting_classes').select('pep_classes(id, name)').eq('meeting_id', id),
  ])

  if (meetingRes.error) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }

  const classes = (classesRes.data || []).map((row: Record<string, unknown>) => {
    const cls = row.pep_classes as Record<string, unknown>
    return { id: cls?.id, name: cls?.name }
  })

  const can_edit =
    user.role === 'super_admin' ||
    user.role === 'admin' ||
    meetingRes.data.recorded_by === user.id

  let queuePosition: number | null = null
  let activeCount = 0
  const thread = await getThreadForMeeting(db, user, meetingRes.data.thread_id || null)

  if (['queued', 'transcribing', 'analyzing'].includes(meetingRes.data.status)) {
    const [{ count: active }, { count: queuedAhead }] = await Promise.all([
      db
        .from('pep_meetings')
        .select('*', { count: 'exact', head: true })
        .in('status', ['transcribing', 'analyzing']),
      meetingRes.data.status === 'queued' && meetingRes.data.queued_at
        ? db
          .from('pep_meetings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'queued')
          .lt('queued_at', meetingRes.data.queued_at)
        : Promise.resolve({ count: null }),
    ])

    activeCount = active || 0
    queuePosition = meetingRes.data.status === 'queued'
      ? (queuedAhead || 0) + 1
      : 0
  }

  return NextResponse.json({
    ...meetingRes.data,
    recorded_by_name: (meetingRes.data.pep_meeting_users as Record<string, unknown>)?.name || 'Unknown',
    can_edit,
    classes,
    pep_meeting_users: undefined,
    segments: segmentsRes.data || [],
    participants: participantsRes.data || [],
    action_items: actionItemsRes.data || [],
    summary: summaryRes.data || null,
    thread,
    queue_position: queuePosition,
    active_processing_count: activeCount,
  })
}

// PATCH — update meeting fields (title, meeting_type, meeting_date, notes, class_ids, thread)
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

  const db = createServiceClient()

  // Update meeting fields
  const allowed: Record<string, unknown> = {}
  for (const key of ['title', 'meeting_type', 'meeting_date', 'notes']) {
    if (key in body) allowed[key] = body[key]
  }

  if (Object.keys(allowed).length > 0) {
    const { error } = await db
      .from('pep_meetings')
      .update(allowed)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update class associations if provided
  if (Array.isArray(body.class_ids)) {
    // Only admins and super_admins can change class assignments
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only admins can change class assignments' }, { status: 403 })
    }

    // For admins (non-super), validate membership in each class
    if (user.role === 'admin') {
      for (const cid of body.class_ids) {
        const { data: membership } = await db
          .from('pep_user_classes')
          .select('id')
          .eq('user_id', user.id)
          .eq('class_id', cid)
          .single()

        if (!membership) {
          return NextResponse.json({ error: 'You are not assigned to one of the selected classes' }, { status: 403 })
        }
      }
    }

    // Remove existing
    await db.from('pep_meeting_classes').delete().eq('meeting_id', id)

    // Insert new
    if (body.class_ids.length > 0) {
      await db
        .from('pep_meeting_classes')
        .insert(body.class_ids.map((cid: string) => ({ meeting_id: id, class_id: cid })))
    }
  }

  if (body.clear_thread === true) {
    try {
      await clearMeetingThread(db, id)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to clear meeting thread' },
        { status: 500 }
      )
    }
  } else if (typeof body.thread_with_meeting_id === 'string' && body.thread_with_meeting_id.trim()) {
    try {
      await assignMeetingToThread(db, user, id, body.thread_with_meeting_id)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to update meeting thread' },
        { status: 400 }
      )
    }
  }

  // Return updated meeting
  const { data } = await db.from('pep_meetings').select().eq('id', id).single()
  return NextResponse.json(data)
}

// DELETE — remove meeting, its related records, and audio file
export async function DELETE(
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

  const db = createServiceClient()

  // Get meeting to find audio path
  const { data: meeting } = await db
    .from('pep_meetings')
    .select('audio_storage_path')
    .eq('id', id)
    .single()

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }

  // Delete audio from storage if it exists
  if (meeting.audio_storage_path) {
    await db.storage.from('meeting-audio').remove([meeting.audio_storage_path])
  }

  // Delete related records in order (children first)
  await db.from('pep_action_items').delete().eq('meeting_id', id)
  await db.from('pep_meeting_summaries').delete().eq('meeting_id', id)
  await db.from('pep_transcript_segments').delete().eq('meeting_id', id)
  await db.from('pep_meeting_participants').delete().eq('meeting_id', id)
  await db.from('pep_meeting_classes').delete().eq('meeting_id', id)

  // Delete the meeting itself
  const { error } = await db.from('pep_meetings').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
