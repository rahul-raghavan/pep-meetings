import type { SupabaseClient } from '@supabase/supabase-js'

import type { MeetingUser } from '@/lib/auth'
import { getAccessibleClassIds } from '@/lib/rbac'

export type NewMeetingNotification = {
  id: string
  title: string
  meeting_type: string
  meeting_date: string
  created_at: string
  recorded_by_name: string
  classes: { id: string; name: string }[]
}

type JoinedClass = {
  id: string
  name: string
}

export async function ensureNotificationState(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: existing, error: existingError } = await db
    .from('pep_meeting_notification_state')
    .select('last_seen_at')
    .eq('user_id', userId)
    .single()

  if (existing && !existingError) {
    return existing.last_seen_at as string
  }

  const nowIso = new Date().toISOString()

  const { error: insertError } = await db
    .from('pep_meeting_notification_state')
    .upsert({ user_id: userId, last_seen_at: nowIso })

  if (insertError) {
    throw new Error(insertError.message)
  }

  return nowIso
}

export async function markNotificationsSeen(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  const nowIso = new Date().toISOString()
  const { error } = await db
    .from('pep_meeting_notification_state')
    .upsert({ user_id: userId, last_seen_at: nowIso })

  if (error) {
    throw new Error(error.message)
  }

  return nowIso
}

export async function getNewMeetingsSinceLastSeen(
  db: SupabaseClient,
  user: MeetingUser,
  limit = 8
): Promise<{ unreadCount: number; lastSeenAt: string; meetings: NewMeetingNotification[] }> {
  const lastSeenAt = await ensureNotificationState(db, user.id)
  const accessibleClasses = await getAccessibleClassIds(user)

  let accessibleMeetingIds: string[] | 'all' = 'all'
  if (accessibleClasses !== 'all') {
    if (accessibleClasses.length === 0) {
      return { unreadCount: 0, lastSeenAt, meetings: [] }
    }

    const { data: mcRows } = await db
      .from('pep_meeting_classes')
      .select('meeting_id')
      .in('class_id', accessibleClasses)

    accessibleMeetingIds = [...new Set((mcRows || []).map(row => row.meeting_id))]
    if (accessibleMeetingIds.length === 0) {
      return { unreadCount: 0, lastSeenAt, meetings: [] }
    }
  }

  let countQuery = db
    .from('pep_meetings')
    .select('*', { count: 'exact', head: true })
    .gt('created_at', lastSeenAt)
    .neq('recorded_by', user.id)

  let dataQuery = db
    .from('pep_meetings')
    .select('id, title, meeting_type, meeting_date, created_at, pep_meeting_users!recorded_by(name)')
    .gt('created_at', lastSeenAt)
    .neq('recorded_by', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (accessibleMeetingIds !== 'all') {
    countQuery = countQuery.in('id', accessibleMeetingIds)
    dataQuery = dataQuery.in('id', accessibleMeetingIds)
  }

  const [{ count }, { data, error }] = await Promise.all([
    countQuery,
    dataQuery,
  ])

  if (error) {
    throw new Error(error.message)
  }

  const meetingIds = (data || []).map(row => row.id as string)
  const classMap: Record<string, { id: string; name: string }[]> = {}

  if (meetingIds.length > 0) {
    const { data: classRows } = await db
      .from('pep_meeting_classes')
      .select('meeting_id, pep_classes(id, name)')
      .in('meeting_id', meetingIds)

    for (const row of classRows || []) {
      const joined = row.pep_classes as unknown
      const cls = Array.isArray(joined)
        ? (joined[0] as JoinedClass | undefined)
        : (joined as JoinedClass | null)
      if (!cls) continue
      if (!classMap[row.meeting_id]) classMap[row.meeting_id] = []
      classMap[row.meeting_id].push({ id: cls.id, name: cls.name })
    }
  }

  const meetings = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    meeting_type: row.meeting_type as string,
    meeting_date: row.meeting_date as string,
    created_at: row.created_at as string,
    recorded_by_name: ((row.pep_meeting_users as Record<string, unknown> | null)?.name as string) || 'Unknown',
    classes: classMap[row.id as string] || [],
  }))

  return {
    unreadCount: count || 0,
    lastSeenAt,
    meetings,
  }
}
