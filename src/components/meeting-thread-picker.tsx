'use client'

import { useEffect, useState } from 'react'
import type { ThreadOption } from '@/lib/meeting-threads'

type ThreadMeetingOption = ThreadOption

const TYPE_LABELS: Record<string, string> = {
  parent_teacher: 'Parent-Teacher',
  admission: 'Admission',
  training: 'Training',
  hr: 'HR',
  internal: 'Internal',
  other: 'Other',
}

type MeetingThreadPickerProps = {
  value: ThreadMeetingOption | null
  onChange: (meeting: ThreadMeetingOption | null) => void
  disabled?: boolean
  excludeMeetingId?: string
  label?: string
  helperText?: string
}

export function MeetingThreadPicker({
  value,
  onChange,
  disabled = false,
  excludeMeetingId,
  label = 'Thread with an existing meeting (optional)',
  helperText = 'Pick an earlier meeting to visually connect this one to the same thread.',
}: MeetingThreadPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ThreadMeetingOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || disabled) return

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('search', query.trim())
        if (excludeMeetingId) params.set('exclude_id', excludeMeetingId)
        params.set('limit', query.trim() ? '10' : '6')

        const res = await fetch(`/api/meetings/thread-options?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error('Failed to load meetings')
        }

        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setResults([])
        setError(err instanceof Error ? err.message : 'Failed to load meetings')
      } finally {
        setLoading(false)
      }
    }, query.trim() ? 250 : 0)

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [disabled, excludeMeetingId, open, query])

  return (
    <div>
      <label className="block text-sm font-medium text-pep-gray mb-1">{label}</label>

      {value && !open ? (
        <div className="border border-pep-blue/20 bg-pep-blue/5 rounded px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-pep-gray truncate">{value.title}</p>
              <p className="text-xs text-pep-gray mt-1">
                {new Date(value.meeting_date).toLocaleDateString()} &middot; {TYPE_LABELS[value.meeting_type] || value.meeting_type} &middot; {value.recorded_by_name}
              </p>
              <p className="text-xs text-pep-blue mt-1">
                {value.thread_id ? 'This meeting will join the existing thread.' : 'This will start a new thread with the selected meeting.'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={disabled}
                className="text-xs text-pep-blue hover:underline cursor-pointer disabled:opacity-50"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={disabled}
                className="text-xs text-pep-gray hover:underline cursor-pointer disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (!open) setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              disabled={disabled}
              placeholder="Search by meeting title..."
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 focus:border-pep-blue disabled:opacity-50"
            />
            {open && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setQuery('')
                  setError('')
                }}
                className="text-sm text-pep-gray hover:underline cursor-pointer shrink-0"
              >
                Cancel
              </button>
            )}
          </div>

          <p className="text-xs text-pep-gray">{helperText}</p>

          {open && (
            <div className="border border-gray-200 rounded max-h-56 overflow-y-auto bg-white">
              {loading ? (
                <p className="text-sm text-pep-gray px-3 py-3">Loading meetings...</p>
              ) : error ? (
                <p className="text-sm text-red-600 px-3 py-3">{error}</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-pep-gray px-3 py-3">
                  {query.trim() ? 'No matching meetings found.' : 'No recent meetings available.'}
                </p>
              ) : (
                results.map((meeting) => (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => {
                      onChange(meeting)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="w-full text-left px-3 py-3 border-b border-gray-100 last:border-b-0 hover:bg-pep-blue/5 transition-colors cursor-pointer"
                  >
                    <p className="text-sm font-medium text-pep-gray">{meeting.title}</p>
                    <p className="text-xs text-pep-gray mt-1">
                      {new Date(meeting.meeting_date).toLocaleDateString()} &middot; {TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type} &middot; {meeting.recorded_by_name}
                    </p>
                    <p className="text-xs text-pep-blue mt-1">
                      {meeting.thread_id ? 'Join existing thread' : 'Start a new thread from this meeting'}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
