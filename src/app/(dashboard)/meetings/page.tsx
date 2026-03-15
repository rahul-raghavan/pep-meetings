'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClassSelector } from '@/components/class-selector'
import { MeetingThreadPicker } from '@/components/meeting-thread-picker'
import { getMeetingStatusLabel } from '@/lib/meeting-status'
import type { NewMeetingNotification } from '@/lib/meeting-notifications'
import type { ThreadOption } from '@/lib/meeting-threads'

type Meeting = {
  id: string
  title: string
  meeting_type: string
  meeting_date: string
  thread_id: string | null
  status: string
  needs_attention: boolean
  recorded_by_name: string
  can_edit: boolean
  summary_text: string | null
  overall_sentiment: string | null
  classes: { id: string; name: string }[]
  created_at: string
}

type UserClass = {
  id: string
  name: string
  campus_name: string
}

type MeetingRenderGroup = {
  id: string
  threadId: string | null
  meetings: Meeting[]
}

const TYPE_LABELS: Record<string, string> = {
  parent_teacher: 'Parent-Teacher',
  admission: 'Admission',
  training: 'Training',
  hr: 'HR',
  internal: 'Internal',
  other: 'Other',
}

// Display order for category groups
const TYPE_ORDER = ['admission', 'parent_teacher', 'training', 'hr', 'internal', 'other']

const STATUS_COLORS: Record<string, string> = {
  uploading: 'bg-yellow-100 text-yellow-800',
  queued: 'bg-sky-100 text-sky-800',
  transcribing: 'bg-blue-100 text-blue-800',
  analyzing: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

const SENTIMENT_STYLES: Record<string, string> = {
  'Positive': 'bg-green-100 text-green-800',
  'Neutral': 'bg-gray-100 text-gray-700',
  'Concerned': 'bg-amber-100 text-amber-800',
  'Tense': 'bg-red-100 text-red-800',
  'Collaborative': 'bg-blue-100 text-blue-800',
  'Enthusiastic': 'bg-purple-100 text-purple-800',
}

export default function MeetingsPage() {
  const router = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [userClasses, setUserClasses] = useState<UserClass[]>([])
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', meeting_type: '', meeting_date: '', class_ids: [] as string[] })
  const [threadEditingId, setThreadEditingId] = useState<string | null>(null)
  const [threadDraft, setThreadDraft] = useState<ThreadOption | null>(null)
  const [threadSaving, setThreadSaving] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [newMeetings, setNewMeetings] = useState<NewMeetingNotification[]>([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [markingSeen, setMarkingSeen] = useState(false)

  useEffect(() => {
    fetch('/api/user/classes').then(res => res.ok ? res.json() : []).then(setUserClasses).catch(() => {})
  }, [])

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (typeFilter) params.set('type', typeFilter)
    if (classFilter) params.set('class_id', classFilter)
    if (search) params.set('search', search)

    const res = await fetch(`/api/meetings?${params}`)
    const data = await res.json()
    setMeetings(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [typeFilter, classFilter, search])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true)
    try {
      const res = await fetch('/api/meetings/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNewMeetings(Array.isArray(data.meetings) ? data.meetings : [])
      setUnreadNotifications(typeof data.unreadCount === 'number' ? data.unreadCount : 0)
    } finally {
      setNotificationsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    fetchMeetings()
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  async function markNotificationsAsSeen() {
    setMarkingSeen(true)
    try {
      const res = await fetch('/api/meetings/notifications/mark-seen', { method: 'POST' })
      if (!res.ok) return
      setNewMeetings([])
      setUnreadNotifications(0)
      window.dispatchEvent(new CustomEvent('meeting-notifications-updated', {
        detail: { unreadCount: 0 },
      }))
    } finally {
      setMarkingSeen(false)
    }
  }

  function startEditing(meeting: Meeting) {
    setEditingId(meeting.id)
    setEditDraft({ title: meeting.title, meeting_type: meeting.meeting_type, meeting_date: meeting.meeting_date, class_ids: meeting.classes.map(c => c.id) })
  }

  function cancelEditing() {
    setEditingId(null)
    setEditDraft({ title: '', meeting_type: '', meeting_date: '', class_ids: [] })
  }

  function startThreadEditing(meeting: Meeting) {
    setThreadEditingId(meeting.id)
    setThreadDraft(null)
    setThreadError(null)
  }

  function cancelThreadEditing() {
    setThreadEditingId(null)
    setThreadDraft(null)
    setThreadError(null)
  }

  function retryTranscription(meetingId: string) {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'queued' } : m))
    fetch(`/api/meetings/${meetingId}/transcribe`, { method: 'POST' }).catch(() => {})
    router.push(`/meetings/${meetingId}`)
  }

  async function deleteMeeting(meetingId: string) {
    if (!confirm('Are you sure you want to delete this meeting? This cannot be undone.')) return
    const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' })
    if (res.ok) {
      setMeetings(prev => prev.filter(m => m.id !== meetingId))
      setExpandedId(null)
    }
  }

  async function saveEdits(meetingId: string) {
    if (!editDraft.title.trim()) return
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editDraft.title.trim(),
        meeting_type: editDraft.meeting_type,
        meeting_date: editDraft.meeting_date,
        class_ids: editDraft.class_ids,
      }),
    })
    if (res.ok) {
      const updatedClasses = userClasses
        .filter(c => editDraft.class_ids.includes(c.id))
        .map(c => ({ id: c.id, name: c.name }))
      setMeetings(prev => prev.map(m => m.id === meetingId ? {
        ...m,
        title: editDraft.title.trim(),
        meeting_type: editDraft.meeting_type,
        meeting_date: editDraft.meeting_date,
        classes: updatedClasses,
      } : m))
    }
    cancelEditing()
  }

  async function saveThread(meetingId: string) {
    if (!threadDraft) return

    setThreadSaving(true)
    setThreadError(null)

    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_with_meeting_id: threadDraft.id }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update thread')
      }

      await fetchMeetings()
      cancelThreadEditing()
      setExpandedId(meetingId)
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : 'Failed to update thread')
    } finally {
      setThreadSaving(false)
    }
  }

  async function clearThread(meetingId: string) {
    setThreadSaving(true)
    setThreadError(null)

    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_thread: true }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove thread')
      }

      await fetchMeetings()
      cancelThreadEditing()
      setExpandedId(meetingId)
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : 'Failed to remove thread')
    } finally {
      setThreadSaving(false)
    }
  }

  function buildRenderGroups(items: Meeting[]): MeetingRenderGroup[] {
    const threadMap = new Map<string, Meeting[]>()
    for (const meeting of items) {
      if (!meeting.thread_id) continue
      const existing = threadMap.get(meeting.thread_id) || []
      existing.push(meeting)
      threadMap.set(meeting.thread_id, existing)
    }

    const seenThreadIds = new Set<string>()
    const groups: MeetingRenderGroup[] = []

    for (const meeting of items) {
      if (!meeting.thread_id) {
        groups.push({ id: meeting.id, threadId: null, meetings: [meeting] })
        continue
      }

      if (seenThreadIds.has(meeting.thread_id)) continue
      seenThreadIds.add(meeting.thread_id)

      const threadMeetings = [...(threadMap.get(meeting.thread_id) || [meeting])]
        .sort((a, b) => {
          const byDate = new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime()
          if (byDate !== 0) return byDate
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })

      groups.push({
        id: meeting.thread_id,
        threadId: meeting.thread_id,
        meetings: threadMeetings,
      })
    }

    return groups
  }

  function renderMeetingCard(meeting: Meeting, options?: { nested?: boolean; first?: boolean; last?: boolean }) {
    const isExpanded = expandedId === meeting.id
    const isEditing = editingId === meeting.id
    const isThreadEditing = threadEditingId === meeting.id
    const nested = options?.nested || false

    return (
      <div
        key={meeting.id}
        className={`${
          nested
            ? `px-4 py-4 ${!options?.last ? 'border-b border-gray-100' : ''}`
            : `bg-pep-card rounded shadow-sm overflow-hidden transition-shadow hover:shadow-md ${meeting.needs_attention ? 'border-l-4 border-l-red-400' : ''}`
        }`}
      >
        <div
          onClick={() => { if (!isEditing) toggleExpand(meeting.id) }}
          className={`${nested ? '' : 'p-4'} ${isEditing ? '' : 'cursor-pointer'}`}
        >
          {isEditing ? (
            <div onClick={(e) => e.stopPropagation()} className="space-y-3">
              <input
                type="text"
                value={editDraft.title}
                onChange={(e) => setEditDraft(d => ({ ...d, title: e.target.value }))}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Escape') cancelEditing() }}
                placeholder="Meeting title"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={editDraft.meeting_type}
                  onChange={(e) => setEditDraft(d => ({ ...d, meeting_type: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 cursor-pointer"
                >
                  <option value="parent_teacher">Parent-Teacher</option>
                  <option value="admission">Admission</option>
                  <option value="training">Training</option>
                  <option value="hr">HR</option>
                  <option value="internal">Internal</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="date"
                  value={editDraft.meeting_date}
                  onChange={(e) => setEditDraft(d => ({ ...d, meeting_date: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                />
              </div>
              {userClasses.length > 0 && (
                <div>
                  <ClassSelector
                    value={editDraft.class_ids}
                    onChange={(classIds) => setEditDraft(d => ({ ...d, class_ids: classIds }))}
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={cancelEditing} className="text-sm text-pep-gray hover:underline cursor-pointer">Cancel</button>
                <button onClick={() => saveEdits(meeting.id)} className="text-sm bg-pep-blue text-white px-4 py-1.5 rounded uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer">Save</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {nested && (
                  <div className="flex flex-col items-center pt-1 shrink-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-pep-blue" />
                    {!options?.last && <span className="w-px flex-1 bg-pep-blue/20 mt-1 min-h-8" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-pep-gray truncate">{meeting.title}</h3>
                    {meeting.thread_id && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-pep-blue/10 text-pep-blue shrink-0">
                        Threaded
                      </span>
                    )}
                    {meeting.can_edit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditing(meeting) }}
                        className="text-pep-gray hover:text-pep-blue transition-colors shrink-0 cursor-pointer"
                        title="Edit"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                    {meeting.needs_attention && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-700 shrink-0">
                        Needs Attention
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-pep-gray">
                    <span>{new Date(meeting.meeting_date).toLocaleDateString()}</span>
                    <span className="text-gray-300 hidden sm:inline">|</span>
                    <span>{meeting.recorded_by_name}</span>
                    {meeting.classes.length > 0 && (
                      <>
                        <span className="text-gray-300 hidden sm:inline">|</span>
                        <span className="text-pep-blue">{meeting.classes.map(c => c.name).join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-medium px-2.5 py-1 rounded ${STATUS_COLORS[meeting.status] || 'bg-gray-100 text-gray-800'}`}>
                  {getMeetingStatusLabel(meeting.status)}
                </span>
                <svg
                  className={`w-4 h-4 text-pep-gray transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {isExpanded && (
          <div className={`pt-3 ${nested ? 'pl-[2.15rem]' : 'px-4 pb-4 border-t border-gray-100'} ${nested ? '' : ''}`}>
            {!nested && null}
            {meeting.summary_text ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-700">{meeting.summary_text}</p>
                  {meeting.overall_sentiment && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded shrink-0 ${SENTIMENT_STYLES[meeting.overall_sentiment] || 'bg-gray-100 text-gray-700'}`}>
                      {meeting.overall_sentiment}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="inline-block text-sm font-medium text-pep-coral hover:text-pep-coralhover hover:underline"
                  >
                    View full meeting &rarr;
                  </Link>
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isThreadEditing) {
                          cancelThreadEditing()
                        } else {
                          startThreadEditing(meeting)
                        }
                      }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      {meeting.thread_id ? 'Edit thread' : 'Add to thread'}
                    </button>
                  )}
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id) }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ) : meeting.status === 'completed' ? (
              <div className="space-y-2">
                <p className="text-sm text-pep-gray">No summary available for this meeting.</p>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="inline-block text-sm font-medium text-pep-coral hover:text-pep-coralhover hover:underline"
                  >
                    View full meeting &rarr;
                  </Link>
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isThreadEditing) {
                          cancelThreadEditing()
                        } else {
                          startThreadEditing(meeting)
                        }
                      }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      {meeting.thread_id ? 'Edit thread' : 'Add to thread'}
                    </button>
                  )}
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id) }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ) : ['queued', 'transcribing', 'analyzing'].includes(meeting.status) ? (
              <p className="text-sm text-blue-600">
                {meeting.status === 'queued'
                  ? 'Queued for background processing...'
                  : meeting.status === 'transcribing'
                    ? 'Transcription in progress...'
                    : 'Generating summary and action items...'}
              </p>
            ) : meeting.status === 'failed' ? (
              <div className="space-y-2">
                <p className="text-sm text-red-600">Processing failed.</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); retryTranscription(meeting.id) }}
                    className="text-sm font-medium text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                  >
                    Requeue Meeting
                  </button>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="text-sm font-medium text-pep-coral hover:text-pep-coralhover hover:underline"
                  >
                    View details &rarr;
                  </Link>
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isThreadEditing) {
                          cancelThreadEditing()
                        } else {
                          startThreadEditing(meeting)
                        }
                      }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      {meeting.thread_id ? 'Edit thread' : 'Add to thread'}
                    </button>
                  )}
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id) }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-pep-gray">Waiting for upload...</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); retryTranscription(meeting.id) }}
                    className="text-sm font-medium text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                  >
                    Requeue Meeting
                  </button>
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isThreadEditing) {
                          cancelThreadEditing()
                        } else {
                          startThreadEditing(meeting)
                        }
                      }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      {meeting.thread_id ? 'Edit thread' : 'Add to thread'}
                    </button>
                  )}
                  {meeting.can_edit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id) }}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}

            {isThreadEditing && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-4 pt-4 border-t border-gray-100 space-y-3"
              >
                <MeetingThreadPicker
                  value={threadDraft}
                  onChange={setThreadDraft}
                  excludeMeetingId={meeting.id}
                  helperText="Pick another meeting to join its thread."
                />
                <div className="flex flex-wrap items-center gap-3">
                  {meeting.thread_id && (
                    <button
                      onClick={() => clearThread(meeting.id)}
                      disabled={threadSaving}
                      className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Remove from thread
                    </button>
                  )}
                  <button
                    onClick={cancelThreadEditing}
                    disabled={threadSaving}
                    className="text-sm text-pep-gray hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveThread(meeting.id)}
                    disabled={threadSaving || !threadDraft}
                    className="text-sm bg-pep-blue text-white px-4 py-1.5 rounded uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {threadSaving ? 'Saving...' : 'Save Thread'}
                  </button>
                </div>
                {threadError && (
                  <p className="text-sm text-red-600">{threadError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-pep-gray">Meetings</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/meetings/record"
            className="border border-pep-coral text-pep-coral px-4 py-2 rounded font-medium uppercase tracking-wider text-sm hover:bg-pep-coral/5 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-pep-coral" />
            </span>
            Record
          </Link>
          <Link
            href="/meetings/bulk-upload"
            className="border border-pep-blue text-pep-blue px-4 py-2 rounded font-medium uppercase tracking-wider text-sm hover:bg-pep-blue/5 transition-colors text-center"
          >
            Bulk Upload
          </Link>
          <Link
            href="/meetings/new"
            className="bg-pep-blue text-white px-4 py-2 rounded font-medium uppercase tracking-wider text-sm hover:bg-pep-dark transition-colors text-center"
          >
            + New Meeting
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-pep-card rounded shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 focus:border-pep-blue"
          />
          <button
            type="submit"
            className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 cursor-pointer"
        >
          <option value="">All types</option>
          <option value="parent_teacher">Parent-Teacher</option>
          <option value="admission">Admission</option>
          <option value="training">Training</option>
          <option value="hr">HR</option>
          <option value="internal">Internal</option>
          <option value="other">Other</option>
        </select>
        {userClasses.length > 1 && (
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 cursor-pointer"
          >
            <option value="">All classes</option>
            {userClasses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {!notificationsLoading && unreadNotifications > 0 && (
        <div className="bg-pep-card rounded shadow-sm p-5 mb-5 border border-pep-blue/10">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">
                New Since Your Last Visit
              </h2>
              <p className="text-sm text-pep-gray mt-1">
                {unreadNotifications} meeting{unreadNotifications > 1 ? 's have' : ' has'} been added by other users in classes you can access.
              </p>
            </div>
            <button
              onClick={markNotificationsAsSeen}
              disabled={markingSeen}
              className="text-sm bg-pep-blue text-white px-4 py-2 rounded uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50"
            >
              {markingSeen ? 'Marking...' : 'Mark All Seen'}
            </button>
          </div>

          <div className="space-y-2">
            {newMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/meetings/${meeting.id}`}
                className="block rounded border border-gray-200 px-3 py-3 hover:border-pep-blue/30 hover:bg-pep-blue/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-pep-gray truncate">{meeting.title}</p>
                    <p className="text-xs text-pep-gray mt-1">
                      Added {new Date(meeting.created_at).toLocaleString()} by {meeting.recorded_by_name}
                    </p>
                    <p className="text-xs text-pep-blue mt-1">
                      {TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}
                      {meeting.classes.length > 0 ? ` · ${meeting.classes.map(c => c.name).join(', ')}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-pep-coral shrink-0">Open</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Meeting List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-pep-card rounded shadow-sm p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="bg-pep-card rounded shadow-sm p-8 text-center">
          <p className="text-pep-gray">No meetings found. Create your first meeting to get started.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {(() => {
            // Group meetings by type
            const grouped: Record<string, Meeting[]> = {}
            for (const m of meetings) {
              const key = m.meeting_type || 'other'
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(m)
            }

            // Render groups in defined order, skip empty ones
            return TYPE_ORDER
              .filter(type => grouped[type] && grouped[type].length > 0)
              .map(type => (
                <div key={type}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">
                      {TYPE_LABELS[type] || type}
                    </h2>
                    <span className="text-xs text-pep-gray bg-gray-100 px-2 py-0.5 rounded">
                      {grouped[type].length}
                    </span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                  <div className="space-y-3">
                    {buildRenderGroups(grouped[type]).map((group) => (
                      group.threadId ? (
                        <div
                          key={group.id}
                          className="bg-pep-card rounded shadow-sm overflow-hidden border border-pep-blue/10"
                        >
                          <div className="px-4 py-3 bg-pep-blue/5 border-b border-pep-blue/10 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.15em] text-pep-blue font-semibold">
                                Meeting Thread
                              </p>
                              <p className="text-xs text-pep-gray mt-1">
                                {group.meetings.length} linked meetings shown together
                              </p>
                            </div>
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-pep-blue/10 text-pep-blue">
                              Threaded
                            </span>
                          </div>
                          <div>
                            {group.meetings.map((meeting, index) =>
                              renderMeetingCard(meeting, {
                                nested: true,
                                first: index === 0,
                                last: index === group.meetings.length - 1,
                              })
                            )}
                          </div>
                        </div>
                      ) : (
                        renderMeetingCard(group.meetings[0])
                      )
                    ))}
                  </div>
                </div>
              ))
          })()}
        </div>
      )}
    </div>
  )
}
