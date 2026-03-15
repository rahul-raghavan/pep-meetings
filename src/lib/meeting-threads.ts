import type { SupabaseClient } from '@supabase/supabase-js'

import type { MeetingUser } from '@/lib/auth'
import { assertMeetingAccess, getAccessibleClassIds } from '@/lib/rbac'

export type ThreadMeetingSummary = {
  id: string
  title: string
  meeting_date: string
  meeting_type: string
  status: string
  recorded_by_name: string
}

export type ThreadOption = {
  id: string
  title: string
  meeting_date: string
  meeting_type: string
  recorded_by_name: string
  thread_id: string | null
}

type ThreadRow = {
  id: string
  title: string | null
}

export async function assignMeetingToThread(
  db: SupabaseClient,
  user: MeetingUser,
  meetingId: string,
  threadWithMeetingId: string
): Promise<string> {
  await assertMeetingAccess(user, threadWithMeetingId)

  const { data: targetMeeting, error: targetError } = await db
    .from('pep_meetings')
    .select('id, title, thread_id')
    .eq('id', threadWithMeetingId)
    .single()

  if (targetError || !targetMeeting) {
    throw new Error('Selected thread meeting was not found')
  }

  if (targetMeeting.id === meetingId) {
    throw new Error('A meeting cannot be threaded to itself')
  }

  let threadId = targetMeeting.thread_id as string | null

  if (!threadId) {
    const { data: createdThread, error: createThreadError } = await db
      .from('pep_meeting_threads')
      .insert({
        title: targetMeeting.title,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (createThreadError || !createdThread) {
      throw new Error(createThreadError?.message || 'Failed to create meeting thread')
    }

    threadId = createdThread.id

    const { error: attachExistingError } = await db
      .from('pep_meetings')
      .update({ thread_id: threadId })
      .eq('id', threadWithMeetingId)

    if (attachExistingError) {
      throw new Error(attachExistingError.message)
    }
  }

  const { error: attachNewError } = await db
    .from('pep_meetings')
    .update({ thread_id: threadId })
    .eq('id', meetingId)

  if (attachNewError) {
    throw new Error(attachNewError.message)
  }

  if (!threadId) {
    throw new Error('Failed to resolve meeting thread')
  }

  return threadId
}

export async function clearMeetingThread(
  db: SupabaseClient,
  meetingId: string
): Promise<void> {
  const { error } = await db
    .from('pep_meetings')
    .update({ thread_id: null })
    .eq('id', meetingId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function getThreadForMeeting(
  db: SupabaseClient,
  user: MeetingUser,
  threadId: string | null
): Promise<{ id: string; title: string | null; meetings: ThreadMeetingSummary[] } | null> {
  if (!threadId) return null

  const [threadRes, meetings] = await Promise.all([
    db
      .from('pep_meeting_threads')
      .select('id, title')
      .eq('id', threadId)
      .single(),
    getAccessibleThreadMeetings(db, user, threadId),
  ])

  if (threadRes.error || !threadRes.data) return null

  return {
    ...(threadRes.data as ThreadRow),
    meetings,
  }
}

export async function getAccessibleThreadMeetings(
  db: SupabaseClient,
  user: MeetingUser,
  threadId: string
): Promise<ThreadMeetingSummary[]> {
  const { data: rows, error } = await db
    .from('pep_meetings')
    .select('id, title, meeting_date, meeting_type, status, recorded_by, pep_meeting_users!recorded_by(name)')
    .eq('thread_id', threadId)
    .order('meeting_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error || !rows) return []

  if (user.role === 'super_admin') {
    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      meeting_date: row.meeting_date as string,
      meeting_type: row.meeting_type as string,
      status: row.status as string,
      recorded_by_name: ((row.pep_meeting_users as Record<string, unknown> | null)?.name as string) || 'Unknown',
    }))
  }

  const meetingIds = rows.map((row: Record<string, unknown>) => row.id as string)
  const accessibleClasses = await getAccessibleClassIds(user)
  const accessibleClassSet = new Set(accessibleClasses === 'all' ? [] : accessibleClasses)

  const { data: classRows } = await db
    .from('pep_meeting_classes')
    .select('meeting_id, class_id')
    .in('meeting_id', meetingIds)

  const classMap = new Map<string, string[]>()
  for (const row of classRows || []) {
    const ids = classMap.get(row.meeting_id) || []
    ids.push(row.class_id)
    classMap.set(row.meeting_id, ids)
  }

  return rows
    .filter((row: Record<string, unknown>) => {
      if ((row.recorded_by as string) === user.id) return true

      const classIds = classMap.get(row.id as string) || []
      if (classIds.length === 0) return false

      return classIds.some((classId) => accessibleClassSet.has(classId))
    })
    .map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      meeting_date: row.meeting_date as string,
      meeting_type: row.meeting_type as string,
      status: row.status as string,
      recorded_by_name: ((row.pep_meeting_users as Record<string, unknown> | null)?.name as string) || 'Unknown',
    }))
}
