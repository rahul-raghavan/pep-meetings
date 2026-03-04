import { createServiceClient } from './supabase-server'
import type { MeetingUser } from './auth'

// Allowed email domains (validated on sign-in — independent of locations)
export const ALLOWED_DOMAINS = ['pepschoolv2.com', 'accelschool.in', 'ribbons.education']

export function isAllowedDomain(email: string): boolean {
  const domain = email.split('@')[1] || ''
  return ALLOWED_DOMAINS.includes(domain)
}

// Check if user can access a specific meeting. Throws 403 if not.
export async function assertMeetingAccess(user: MeetingUser, meetingId: string): Promise<void> {
  if (user.role === 'super_admin') return

  const db = createServiceClient()

  // Check meeting exists
  const { data: meeting } = await db
    .from('pep_meetings')
    .select('id, recorded_by')
    .eq('id', meetingId)
    .single()

  if (!meeting) {
    throw new AccessError('Meeting not found', 404)
  }

  // Get the classes this meeting belongs to
  const { data: meetingClasses } = await db
    .from('pep_meeting_classes')
    .select('class_id')
    .eq('meeting_id', meetingId)

  // Unassigned meetings (no classes): allow if user is the creator, deny otherwise
  if (!meetingClasses || meetingClasses.length === 0) {
    if (meeting.recorded_by === user.id) return
    throw new AccessError('Access denied', 403)
  }

  const meetingClassIds = meetingClasses.map(mc => mc.class_id)

  // Check if user belongs to ANY of these classes
  const { data: membership } = await db
    .from('pep_user_classes')
    .select('id')
    .eq('user_id', user.id)
    .in('class_id', meetingClassIds)
    .limit(1)

  if (!membership || membership.length === 0) {
    throw new AccessError('Access denied', 403)
  }
}

// Check if user is admin of a specific class (or super_admin)
// Admin must be assigned to the same location as the classroom
export async function assertClassAdmin(user: MeetingUser, classId: string): Promise<void> {
  if (user.role === 'super_admin') return

  if (user.role !== 'admin') {
    throw new AccessError('Admin access required', 403)
  }

  // Admin must be in the same location as the classroom
  const db = createServiceClient()
  const { data: cls } = await db
    .from('pep_classes')
    .select('campus_id')
    .eq('id', classId)
    .single()

  if (!cls || !user.campus_id || cls.campus_id !== user.campus_id) {
    throw new AccessError('Access denied to this classroom', 403)
  }
}

// Check if user can edit a specific meeting (uploader + admins only). Throws 403 if not.
export async function assertMeetingEdit(user: MeetingUser, meetingId: string): Promise<void> {
  if (user.role === 'super_admin' || user.role === 'admin') return

  const db = createServiceClient()
  const { data: meeting } = await db
    .from('pep_meetings')
    .select('recorded_by')
    .eq('id', meetingId)
    .single()

  if (!meeting) {
    throw new AccessError('Meeting not found', 404)
  }

  if (meeting.recorded_by !== user.id) {
    throw new AccessError('Edit access denied', 403)
  }
}

// Check if user is super_admin
export function assertSuperAdmin(user: MeetingUser): void {
  if (user.role !== 'super_admin') {
    throw new AccessError('Super admin access required', 403)
  }
}

// Get class IDs the user can access. Super_admin gets all.
export async function getAccessibleClassIds(user: MeetingUser): Promise<string[] | 'all'> {
  if (user.role === 'super_admin') return 'all'

  const db = createServiceClient()
  const { data } = await db
    .from('pep_user_classes')
    .select('class_id')
    .eq('user_id', user.id)

  return (data || []).map(row => row.class_id)
}

// Custom error class with HTTP status
export class AccessError extends Error {
  status: number
  constructor(message: string, status: number = 403) {
    super(message)
    this.status = status
    this.name = 'AccessError'
  }
}
