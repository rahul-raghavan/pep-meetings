'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClassSelector } from '@/components/class-selector'
import { MeetingThreadPicker } from '@/components/meeting-thread-picker'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import type { ThreadOption } from '@/lib/meeting-threads'
import type { RecordingMetadata } from '@/lib/recording-store'

type PageState = 'setup' | 'recording' | 'paused' | 'preview' | 'uploading'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function RecordMeetingPage() {
  const router = useRouter()
  const recorder = useAudioRecorder()

  // Form state
  const [title, setTitle] = useState('')
  const [meetingType, setMeetingType] = useState('parent_teacher')
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState('')
  const [classIds, setClassIds] = useState<string[]>([])
  const [threadMeeting, setThreadMeeting] = useState<ThreadOption | null>(null)

  // Upload state
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadError, setUploadError] = useState('')

  // Derive page state from recorder state
  const [pageState, setPageState] = useState<PageState>('setup')

  useEffect(() => {
    switch (recorder.state) {
      case 'recording':
        setPageState('recording')
        break
      case 'paused':
        setPageState('paused')
        break
      case 'stopped':
        setPageState('preview')
        break
      default:
        if (pageState !== 'uploading') setPageState('setup')
    }
  }, [recorder.state]) // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving during recording
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pageState === 'recording' || pageState === 'paused') {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [pageState])

  const handleStartRecording = useCallback(() => {
    if (!title.trim()) {
      recorder.setError('Please enter a meeting title before recording.')
      return
    }
      recorder.startRecording({
        title: title.trim(),
        meetingType,
        meetingDate,
        classIds,
        notes,
        threadMeeting,
      })
  }, [title, meetingType, meetingDate, classIds, notes, threadMeeting, recorder])

  const handleRecoverSession = useCallback(
    async (session: RecordingMetadata) => {
      const meta = await recorder.recoverSession(session.sessionId)
      if (meta) {
        setTitle(meta.title)
        setMeetingType(meta.meetingType)
        setMeetingDate(meta.meetingDate)
        setClassIds(meta.classIds)
        setNotes(meta.notes)
        setThreadMeeting(meta.threadMeeting || null)
      }
    },
    [recorder]
  )

  const handleUpload = useCallback(async () => {
    if (!recorder.finalBlob) return

    setUploadError('')
    setPageState('uploading')

    try {
      // Step 1: Create meeting
      setUploadProgress('Creating meeting...')
      const createRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          meeting_type: meetingType,
          meeting_date: meetingDate,
          notes,
          class_ids: classIds,
          thread_with_meeting_id: threadMeeting?.id || null,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(err.error || 'Failed to create meeting')
      }
      const meeting = await createRes.json()

      // Step 2: Upload audio
      setUploadProgress('Uploading audio file...')
      const ext = recorder.mimeType.includes('mp4') ? 'm4a' : 'webm'
      const file = new File(
        [recorder.finalBlob],
        `recording-${meetingDate}.${ext}`,
        { type: recorder.mimeType || 'audio/webm' }
      )
      const formData = new FormData()
      formData.append('audio', file)

      const uploadRes = await fetch(`/api/meetings/${meeting.id}/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) {
        const err = await uploadRes.json()
        throw new Error(err.error || 'Failed to upload audio')
      }

      // Clear IndexedDB and redirect
      recorder.clearCurrentSession()
      router.push(`/meetings/${meeting.id}`)
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Something went wrong'
      )
      setPageState('preview')
    }
  }, [recorder, title, meetingType, meetingDate, notes, classIds, threadMeeting, router])

  // Memoize blob URL to avoid creating a new one every render (and leaking old ones)
  const previewBlobUrl = useMemo(() => {
    if (recorder.finalBlob) return URL.createObjectURL(recorder.finalBlob)
    return null
  }, [recorder.finalBlob])

  // Revoke blob URL on cleanup
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    }
  }, [previewBlobUrl])

  // ── Uploading state ──
  if (pageState === 'uploading') {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <div className="bg-pep-card rounded shadow-sm p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-pep-blue border-t-transparent mb-4" />
          <h2 className="text-lg font-semibold text-pep-gray mb-2">
            Uploading Recording
          </h2>
          <p className="text-pep-gray">{uploadProgress}</p>
          <p className="text-sm text-pep-gray mt-2">
            You&apos;ll be redirected once the audio is safely queued.
          </p>
        </div>
      </div>
    )
  }

  // ── Preview state (after stop) ──
  if (pageState === 'preview' && recorder.finalBlob && previewBlobUrl) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-pep-gray mb-6">
          Review Recording
        </h1>

        <div className="bg-pep-card rounded shadow-sm p-6 space-y-5">
          {uploadError && (
            <div className="bg-red-50 text-red-700 rounded px-4 py-3 text-sm">
              {uploadError}
            </div>
          )}

          <div className="space-y-1">
            <h2 className="font-semibold text-pep-gray">{title}</h2>
            <p className="text-sm text-pep-gray">
              {formatDuration(recorder.duration)} &middot;{' '}
              {formatBytes(recorder.finalBlob.size)}
            </p>
          </div>

          {/* Audio player */}
          <audio controls src={previewBlobUrl} className="w-full" />

          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              className="flex-1 bg-pep-blue text-white rounded px-4 py-3 font-medium hover:bg-pep-dark transition-colors cursor-pointer uppercase tracking-wider"
            >
              Upload &amp; Queue
            </button>
            <button
              onClick={() => {
                recorder.discardRecording()
                setPageState('setup')
              }}
              className="border border-gray-300 text-pep-gray rounded px-4 py-3 font-medium hover:bg-gray-50 transition-colors cursor-pointer uppercase tracking-wider"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Recording / Paused state ──
  if (pageState === 'recording' || pageState === 'paused') {
    return (
      <div className="max-w-xl mx-auto mt-8">
        <div className="bg-pep-card rounded shadow-sm p-8 text-center space-y-6">
          {/* Timer */}
          <div className="text-5xl font-mono font-bold text-pep-gray tabular-nums">
            {formatDuration(recorder.duration)}
          </div>

          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2">
            {pageState === 'recording' ? (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="text-sm font-medium text-red-600">
                  Recording
                </span>
              </>
            ) : (
              <>
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="text-sm font-medium text-yellow-600">
                  Paused
                </span>
              </>
            )}
          </div>

          {/* Audio level bars */}
          <div className="flex items-end justify-center gap-1 h-10">
            {Array.from({ length: 20 }).map((_, i) => {
              const threshold = (i / 20) * 100
              const active =
                pageState === 'recording' && recorder.audioLevel > threshold
              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    active ? 'bg-pep-blue' : 'bg-gray-200'
                  }`}
                  style={{
                    height: active
                      ? `${Math.max(8, (recorder.audioLevel / 100) * 40)}px`
                      : '8px',
                  }}
                />
              )
            })}
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            {pageState === 'recording' ? (
              <>
                <button
                  onClick={recorder.pauseRecording}
                  className="flex items-center gap-2 border border-gray-300 text-pep-gray rounded px-6 py-3 font-medium hover:bg-gray-50 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause
                </button>
                <button
                  onClick={recorder.stopRecording}
                  className="flex items-center gap-2 bg-red-600 text-white rounded px-6 py-3 font-medium hover:bg-red-700 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={recorder.resumeRecording}
                  className="flex items-center gap-2 bg-pep-blue text-white rounded px-6 py-3 font-medium hover:bg-pep-dark transition-colors cursor-pointer uppercase tracking-wider"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Resume
                </button>
                <button
                  onClick={recorder.stopRecording}
                  className="flex items-center gap-2 bg-red-600 text-white rounded px-6 py-3 font-medium hover:bg-red-700 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Setup state (default) ──
  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-pep-gray">Record Meeting</h1>
        <Link
          href="/meetings"
          className="text-sm text-pep-gray hover:text-pep-gray transition-colors"
        >
          &larr; Back
        </Link>
      </div>

      {/* Recovery banner */}
      {recorder.recoverySessions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-4 mb-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            Unfinished recording found
          </p>
          {recorder.recoverySessions.map((session) => (
            <div
              key={session.sessionId}
              className="flex items-center justify-between gap-3"
            >
              <div className="text-sm text-amber-700">
                <span className="font-medium">{session.title}</span>
                <span className="text-amber-600 ml-2">
                  {new Date(session.startedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleRecoverSession(session)}
                  className="text-sm font-medium text-pep-coral hover:text-pep-coralhover cursor-pointer"
                >
                  Resume Upload
                </button>
                <button
                  onClick={() =>
                    recorder.discardRecoverySession(session.sessionId)
                  }
                  className="text-sm text-pep-gray hover:text-red-600 cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-pep-card rounded shadow-sm p-6 space-y-5">
        {(recorder.error || uploadError) && (
          <div className="bg-red-50 text-red-700 rounded px-4 py-3 text-sm">
            {recorder.error || uploadError}
          </div>
        )}

        <ClassSelector value={classIds} onChange={setClassIds} />

        <div>
          <label className="block text-sm font-medium text-pep-gray mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Parent-Teacher Meeting - Grade 5A"
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 focus:border-pep-blue"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-pep-gray mb-1">
              Type
            </label>
            <select
              value={meetingType}
              onChange={(e) => setMeetingType(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 cursor-pointer"
            >
              <option value="parent_teacher">Parent-Teacher</option>
              <option value="admission">Admission</option>
              <option value="training">Training</option>
              <option value="hr">HR</option>
              <option value="internal">Internal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-pep-gray mb-1">
              Date
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-pep-gray mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any context about this meeting..."
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 resize-none"
          />
        </div>

        <MeetingThreadPicker
          value={threadMeeting}
          onChange={setThreadMeeting}
        />

        {/* Mic selector */}
        {recorder.audioDevices.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-pep-gray mb-1">
              Microphone
            </label>
            <select
              value={recorder.selectedDeviceId}
              onChange={(e) => recorder.setSelectedDeviceId(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 cursor-pointer"
            >
              {recorder.audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleStartRecording}
          disabled={recorder.state === 'requesting-mic'}
          className="w-full bg-red-600 text-white rounded px-4 py-3 font-medium hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wider"
        >
          {recorder.state === 'requesting-mic' ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Requesting microphone...
            </>
          ) : (
            <>
              <span className="relative flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-pep-card" />
              </span>
              Start Recording
            </>
          )}
        </button>
      </div>
    </div>
  )
}
