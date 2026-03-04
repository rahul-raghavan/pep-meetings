'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Meeting = {
  id: string
  title: string
  meeting_type: string
  meeting_date: string
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

const TYPE_LABELS: Record<string, string> = {
  parent_teacher: 'Parent-Teacher',
  admission: 'Admission',
  training: 'Training',
  hr: 'HR',
  internal: 'Internal',
  other: 'Other',
}

const STATUS_COLORS: Record<string, string> = {
  uploading: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
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
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [userClasses, setUserClasses] = useState<UserClass[]>([])
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', meeting_type: '', meeting_date: '' })

  useEffect(() => {
    fetch('/api/user/classes').then(res => res.ok ? res.json() : []).then(setUserClasses).catch(() => {})
  }, [])

  useEffect(() => {
    fetchMeetings()
  }, [typeFilter, classFilter])

  async function fetchMeetings() {
    setLoading(true)
    const params = new URLSearchParams()
    if (typeFilter) params.set('type', typeFilter)
    if (classFilter) params.set('class_id', classFilter)
    if (search) params.set('search', search)

    const res = await fetch(`/api/meetings?${params}`)
    const data = await res.json()
    setMeetings(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    fetchMeetings()
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function startEditing(meeting: Meeting) {
    setEditingId(meeting.id)
    setEditDraft({ title: meeting.title, meeting_type: meeting.meeting_type, meeting_date: meeting.meeting_date })
  }

  function cancelEditing() {
    setEditingId(null)
    setEditDraft({ title: '', meeting_type: '', meeting_date: '' })
  }

  async function retryTranscription(meetingId: string) {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'processing' } : m))
    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcribe`, { method: 'POST' })
      if (res.ok) {
        setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'completed' } : m))
        fetchMeetings()
      } else {
        setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'failed' } : m))
      }
    } catch {
      setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'failed' } : m))
    }
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
      }),
    })
    if (res.ok) {
      setMeetings(prev => prev.map(m => m.id === meetingId ? {
        ...m,
        title: editDraft.title.trim(),
        meeting_type: editDraft.meeting_type,
        meeting_date: editDraft.meeting_date,
      } : m))
    }
    cancelEditing()
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
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const isExpanded = expandedId === meeting.id
            const isEditing = editingId === meeting.id

            return (
              <div
                key={meeting.id}
                className={`bg-pep-card rounded shadow-sm overflow-hidden transition-shadow hover:shadow-md ${meeting.needs_attention ? 'border-l-4 border-l-red-400' : ''}`}
              >
                {/* Card header — clickable to expand */}
                <div
                  onClick={() => { if (!isEditing) toggleExpand(meeting.id) }}
                  className={`p-4 ${isEditing ? '' : 'cursor-pointer'}`}
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
                      <div className="flex gap-2 justify-end">
                        <button onClick={cancelEditing} className="text-sm text-pep-gray hover:underline cursor-pointer">Cancel</button>
                        <button onClick={() => saveEdits(meeting.id)} className="text-sm bg-pep-blue text-white px-4 py-1.5 rounded uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-pep-gray truncate">{meeting.title}</h3>
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
                          <span>{TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}</span>
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
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded ${STATUS_COLORS[meeting.status] || 'bg-gray-100 text-gray-800'}`}>
                          {meeting.status}
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

                {/* Expanded section — summary preview */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="pt-3">
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
                                onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id) }}
                                className="text-sm text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ) : meeting.status === 'processing' ? (
                        <p className="text-sm text-blue-600">Transcription in progress...</p>
                      ) : meeting.status === 'failed' ? (
                        <div className="space-y-2">
                          <p className="text-sm text-red-600">Transcription failed.</p>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); retryTranscription(meeting.id) }}
                              className="text-sm font-medium text-pep-coral hover:text-pep-coralhover hover:underline cursor-pointer"
                            >
                              Retry Transcription
                            </button>
                            <Link
                              href={`/meetings/${meeting.id}`}
                              className="text-sm font-medium text-pep-coral hover:text-pep-coralhover hover:underline"
                            >
                              View details &rarr;
                            </Link>
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
                              Retry Transcription
                            </button>
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
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
