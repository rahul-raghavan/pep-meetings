'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { MeetingThreadPicker } from '@/components/meeting-thread-picker'
import { filenameToTitle } from '@/lib/filename-utils'
import type { ThreadOption } from '@/lib/meeting-threads'

type FileStatus = 'queued' | 'uploading' | 'transcribing' | 'completed' | 'failed'

type UserClass = {
  id: string
  name: string
  campus_name: string
}

type FileEntry = {
  id: string // client-side ID (random)
  file: File
  title: string
  meetingType: string
  classIds: string[]
  status: FileStatus
  error?: string
  meetingId?: string // set after meeting is created
}

const ACCEPTED_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/opus',
  'audio/aac', 'audio/x-aac', 'audio/amr', 'audio/3gpp', 'audio/3gpp2',
  'video/mpeg', 'video/mp4', 'video/3gpp', 'video/3gpp2', 'video/ogg', 'video/webm',
]
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.webm', '.ogg', '.opus', '.aac', '.mpeg', '.mpg', '.3gp', '.mp4', '.amr']

const STATUS_CONFIG: Record<FileStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'bg-gray-100 text-gray-600' },
  uploading: { label: 'Uploading...', color: 'bg-yellow-100 text-yellow-800' },
  transcribing: { label: 'Queued / Processing', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Done', color: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
}

const TYPE_LABELS: Record<string, string> = {
  parent_teacher: 'Parent-Teacher',
  admission: 'Admission',
  training: 'Training',
  hr: 'HR',
  internal: 'Internal',
  other: 'Other',
}

export default function BulkUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [meetingType, setMeetingType] = useState('parent_teacher')
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0])
  const [defaultClassIds, setDefaultClassIds] = useState<string[]>([])
  const [defaultThreadMeeting, setDefaultThreadMeeting] = useState<ThreadOption | null>(null)
  const [userClasses, setUserClasses] = useState<UserClass[]>([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep a ref that always has the latest files — solves stale closure in setInterval
  const filesRef = useRef(files)
  useEffect(() => {
    filesRef.current = files
  }, [files])

  // Fetch user's classes on mount
  useEffect(() => {
    async function fetchClasses() {
      const res = await fetch('/api/user/classes')
      if (res.ok) {
        const data = await res.json()
        setUserClasses(data)
        // Auto-select if only one class
        if (data.length === 1) {
          setDefaultClassIds([data[0].id])
        }
      }
      setClassesLoading(false)
    }
    fetchClasses()
  }, [])

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // Ref for default classes so addFiles always sees the latest
  const defaultClassIdsRef = useRef(defaultClassIds)
  useEffect(() => {
    defaultClassIdsRef.current = defaultClassIds
  }, [defaultClassIds])

  // Ref for meetingType so addFiles always sees the latest
  const meetingTypeRef = useRef(meetingType)
  useEffect(() => {
    meetingTypeRef.current = meetingType
  }, [meetingType])

  function addFiles(newFiles: FileList | File[]) {
    const entries: FileEntry[] = []
    for (const file of Array.from(newFiles)) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(ext)) {
        continue // skip non-audio files silently
      }
      entries.push({
        id: crypto.randomUUID(),
        file,
        title: filenameToTitle(file.name),
        meetingType: meetingTypeRef.current,
        classIds: [...defaultClassIdsRef.current],
        status: 'queued',
      })
    }
    if (entries.length > 0) {
      setFiles((prev) => [...prev, ...entries])
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function updateFile(id: string, updates: Partial<FileEntry>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  function toggleFileClass(fileId: string, classId: string) {
    setFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f
      const has = f.classIds.includes(classId)
      return {
        ...f,
        classIds: has ? f.classIds.filter(id => id !== classId) : [...f.classIds, classId],
      }
    }))
  }

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files)
      // Reset input so the same files can be selected again
      e.target.value = ''
    }
  }

  // Process one file: create meeting → upload → fire transcription
  async function processFile(entry: FileEntry): Promise<{ meetingId?: string; success: boolean }> {
    updateFile(entry.id, { status: 'uploading' })

    try {
      // Step 1: Create meeting
      const createRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: entry.title,
          meeting_type: entry.meetingType,
          meeting_date: meetingDate,
          class_ids: entry.classIds,
          thread_with_meeting_id: defaultThreadMeeting?.id || null,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(err.error || 'Failed to create meeting')
      }
      const meeting = await createRes.json()
      updateFile(entry.id, { meetingId: meeting.id })

      // Step 2: Upload audio
      const formData = new FormData()
      formData.append('audio', entry.file)
      const uploadRes = await fetch(`/api/meetings/${meeting.id}/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) {
        const err = await uploadRes.json()
        throw new Error(err.error || 'Failed to upload audio')
      }

      updateFile(entry.id, { status: 'transcribing' })
      return { meetingId: meeting.id, success: true }
    } catch (err) {
      updateFile(entry.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Something went wrong',
      })
      return { success: false }
    }
  }

  // Start the whole batch with 2 concurrent upload workers
  async function handleUploadAll() {
    if (files.length === 0) return
    setIsProcessing(true)

    const queuedFiles = files.filter(f => f.status === 'queued')
    let nextIndex = 0

    async function worker() {
      while (nextIndex < queuedFiles.length) {
        const entry = queuedFiles[nextIndex++]
        await processFile(entry)
      }
    }

    // Run 2 workers concurrently
    const UPLOAD_CONCURRENCY = 2
    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queuedFiles.length) }, () => worker())
    await Promise.all(workers)

    // Start polling for remaining transcriptions
    startPolling()
  }

  function startPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current)

    pollingRef.current = setInterval(async () => {
      // Read from ref to get latest files (avoids stale closure)
      const currentFiles = filesRef.current
      const transcribingFiles = currentFiles.filter(
        (f) => f.status === 'transcribing' && f.meetingId
      )

      if (transcribingFiles.length === 0) {
        // All done — stop polling
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        setIsProcessing(false)
        return
      }

      const ids = transcribingFiles.map((f) => f.meetingId!)

      try {
        const res = await fetch('/api/meetings/batch-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        })
        if (!res.ok) return

        const { statuses } = await res.json()
        setFiles((prev) =>
          prev.map((f) => {
            if (!f.meetingId || !statuses[f.meetingId]) return f
            const s = statuses[f.meetingId]
            if (s.status === 'completed' || s.status === 'failed') {
              return { ...f, status: s.status, error: s.error_message || undefined }
            }
            return f
          })
        )
      } catch {
        // Polling error — just try again next interval
      }
    }, 5000)
  }

  // Re-trigger polling whenever files change (to pick up newly transcribing files)
  useEffect(() => {
    const hasTranscribing = files.some((f) => f.status === 'transcribing')
    if (hasTranscribing && !pollingRef.current) {
      startPolling()
    }
  }, [files])

  async function retryFile(entry: FileEntry) {
    setIsProcessing(true)
    try {
      // Keep existing meetingId if the meeting was already created (avoids duplicates)
      updateFile(entry.id, { status: 'queued', error: undefined })
      const result = await processFile({ ...entry, status: 'queued', error: undefined })
      if (result.success) {
        startPolling()
      }
    } finally {
      // Always reset processing state so UI doesn't get stuck
      const currentFiles = filesRef.current
      const stillProcessing = currentFiles.some(f =>
        f.id !== entry.id && (f.status === 'uploading' || f.status === 'transcribing')
      )
      if (!stillProcessing) {
        setIsProcessing(false)
      }
    }
  }

  const hasMultipleClasses = userClasses.length > 1
  const queuedCount = files.filter((f) => f.status === 'queued').length
  const completedCount = files.filter((f) => f.status === 'completed').length
  const failedCount = files.filter((f) => f.status === 'failed').length
  const allDone = files.length > 0 && queuedCount === 0 && !files.some((f) => f.status === 'uploading' || f.status === 'transcribing')

  // Check if any queued file is missing a class (only matters when user has classes)
  const hasMissingClass = userClasses.length > 0 && files.some((f) => f.status === 'queued' && f.classIds.length === 0)

  if (classesLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-32 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  if (userClasses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/meetings" className="text-pep-gray hover:text-pep-gray transition-colors">
            &larr;
          </Link>
          <h1 className="text-2xl font-bold text-pep-gray">Bulk Upload</h1>
        </div>
        <div className="bg-amber-50 text-amber-800 rounded px-4 py-3 text-sm">
          You haven&apos;t been assigned to any classes yet. Ask your admin to assign you to a class before uploading.
        </div>
      </div>
    )
  }

  // Helper to get class names for display
  function classNames(ids: string[]) {
    return ids
      .map(id => userClasses.find(uc => uc.id === id))
      .filter(Boolean)
      .map(c => c!.name)
      .join(', ')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/meetings" className="text-pep-gray hover:text-pep-gray transition-colors">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold text-pep-gray">Bulk Upload</h1>
      </div>

      {/* Shared settings */}
      <div className="bg-pep-card rounded shadow-sm p-5 mb-4 space-y-4">
        {/* Single class — just show it */}
        {userClasses.length === 1 && (
          <div className="text-sm text-pep-gray py-1">
            Class: <span className="font-medium text-pep-gray">{userClasses[0].name}</span>
            <span className="text-pep-gray ml-1">({userClasses[0].campus_name})</span>
          </div>
        )}

        {/* Multiple classes — default class checkboxes */}
        {hasMultipleClasses && (
          <div>
            <label className="block text-sm font-medium text-pep-gray mb-1.5">Default Classes</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {userClasses.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={defaultClassIds.includes(c.id)}
                    onChange={() => {
                      const newIds = defaultClassIds.includes(c.id)
                        ? defaultClassIds.filter(id => id !== c.id)
                        : [...defaultClassIds, c.id]
                      setDefaultClassIds(newIds)
                      // Update all queued files to the new defaults
                      setFiles((prev) =>
                        prev.map((f) => f.status === 'queued' ? { ...f, classIds: [...newIds] } : f)
                      )
                    }}
                    disabled={isProcessing}
                    className="h-4 w-4 rounded border-gray-300 text-pep-blue focus:ring-pep-blue/20 cursor-pointer disabled:opacity-50"
                  />
                  <span className="text-sm text-pep-gray">{c.name}</span>
                  <span className="text-xs text-pep-gray">({c.campus_name})</span>
                </label>
              ))}
            </div>
            {files.length > 0 && (
              <p className="text-xs text-pep-gray mt-1">You can change classes per file below</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-pep-gray mb-1">Default Type</label>
            <select
              value={meetingType}
              onChange={(e) => {
                const newType = e.target.value
                setMeetingType(newType)
                // Update all queued files to the new default
                setFiles((prev) =>
                  prev.map((f) => f.status === 'queued' ? { ...f, meetingType: newType } : f)
                )
              }}
              disabled={isProcessing}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 cursor-pointer disabled:opacity-50"
            >
              <option value="parent_teacher">Parent-Teacher</option>
              <option value="admission">Admission</option>
              <option value="training">Training</option>
              <option value="hr">HR</option>
              <option value="internal">Internal</option>
              <option value="other">Other</option>
            </select>
            {files.length > 0 && (
              <p className="text-xs text-pep-gray mt-1">You can change type per file below</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-pep-gray mb-1">Meeting Date</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              disabled={isProcessing}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 disabled:opacity-50"
            />
          </div>
        </div>

        <MeetingThreadPicker
          value={defaultThreadMeeting}
          onChange={setDefaultThreadMeeting}
          disabled={isProcessing}
          label="Default thread (optional)"
          helperText="If set, every meeting in this batch will be linked to the selected existing meeting."
        />
      </div>

      {/* Drop zone — hide during processing and when all done */}
      {!isProcessing && !allDone && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded p-8 text-center cursor-pointer transition-colors mb-4 ${
            isDragOver
              ? 'border-pep-blue bg-pep-blue/5'
              : 'border-gray-200 hover:border-pep-blue/40'
          }`}
        >
          <p className="text-pep-gray font-medium">
            {files.length === 0
              ? 'Drag and drop audio files here'
              : 'Drop more files or click to add'}
          </p>
          <p className="text-sm text-pep-gray mt-1">MP3, M4A, WAV, WebM, OGG, Opus, AAC, MPEG, or 3GP (max 50 MB each)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.m4a,.wav,.webm,.ogg,.opus,.aac,.mpeg,.mpg,.3gp,.mp4,audio/*,video/mpeg,video/mp4,video/3gpp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2 mb-4">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="bg-pep-card rounded shadow-sm px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-pep-gray truncate">{entry.title}</p>
                  <p className="text-xs text-pep-gray mt-0.5">
                    {entry.file.name} &middot; {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  {entry.error && (
                    <p className="text-xs text-red-600 mt-0.5">{entry.error}</p>
                  )}
                </div>

                <span className={`text-xs font-medium px-2.5 py-1 rounded whitespace-nowrap ${STATUS_CONFIG[entry.status].color}`}>
                  {STATUS_CONFIG[entry.status].label}
                </span>

                {/* Remove button (only when queued and not processing) */}
                {entry.status === 'queued' && !isProcessing && (
                  <button
                    onClick={() => removeFile(entry.id)}
                    className="text-pep-gray hover:text-red-500 transition-colors text-lg leading-none cursor-pointer"
                    title="Remove"
                  >
                    &times;
                  </button>
                )}

                {/* Retry button (only when failed) */}
                {entry.status === 'failed' && (
                  <button
                    onClick={() => retryFile(entry)}
                    className="text-xs text-pep-coral hover:text-pep-coralhover cursor-pointer"
                  >
                    Retry
                  </button>
                )}
              </div>

              {/* Per-file settings (only when queued and not processing) */}
              {entry.status === 'queued' && !isProcessing && (
                <div className="mt-2 pt-2 border-t border-gray-50 space-y-2">
                  {hasMultipleClasses && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {userClasses.map((c) => (
                        <label key={c.id} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={entry.classIds.includes(c.id)}
                            onChange={() => toggleFileClass(entry.id, c.id)}
                            className={`h-3.5 w-3.5 rounded border-gray-300 text-pep-blue focus:ring-pep-blue/20 cursor-pointer ${
                              entry.classIds.length === 0 ? 'border-amber-300' : ''
                            }`}
                          />
                          <span className="text-xs text-pep-gray">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={entry.meetingType}
                      onChange={(e) => updateFile(entry.id, { meetingType: e.target.value })}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-pep-gray focus:outline-none focus:ring-1 focus:ring-pep-blue/20 cursor-pointer"
                    >
                      <option value="parent_teacher">Parent-Teacher</option>
                      <option value="admission">Admission</option>
                      <option value="training">Training</option>
                      <option value="other">Other</option>
                    </select>
                    {defaultThreadMeeting && (
                      <span className="text-xs text-pep-blue truncate">
                        Threaded to {defaultThreadMeeting.title}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Show class + type after processing starts (read-only) */}
              {entry.status !== 'queued' && (
                <div className="flex items-center gap-2 mt-1">
                  {entry.classIds.length > 0 && (
                    <span className="text-xs text-pep-gray">{classNames(entry.classIds)}</span>
                  )}
                  <span className="text-xs text-pep-gray">
                    &middot; {TYPE_LABELS[entry.meetingType] || entry.meetingType}
                  </span>
                  {defaultThreadMeeting && (
                    <span className="text-xs text-pep-blue">
                      &middot; Threaded
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Warning if some files are missing a class */}
      {hasMissingClass && !isProcessing && (
        <div className="bg-amber-50 text-amber-800 rounded px-4 py-3 text-sm mb-4">
          Some files don&apos;t have a class selected. Please assign at least one class to each file before uploading.
        </div>
      )}

      {/* Progress summary */}
      {isProcessing && (
        <div className="bg-blue-50 rounded px-4 py-3 mb-4 text-sm text-blue-800">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
            <span>
              Processing... {completedCount}/{files.length} done
              {failedCount > 0 && `, ${failedCount} failed`}
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {!isProcessing && !allDone && (
          <button
            onClick={handleUploadAll}
            disabled={queuedCount === 0 || hasMissingClass}
            className="flex-1 bg-pep-blue text-white rounded px-4 py-3 font-medium uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Upload All ({queuedCount} {queuedCount === 1 ? 'file' : 'files'})
          </button>
        )}

        {allDone && (
          <div className="flex-1 space-y-3">
            <div className="bg-green-50 rounded px-4 py-3 text-sm text-green-800">
              All done! {completedCount} meeting{completedCount !== 1 ? 's' : ''} processed
              {failedCount > 0 && ` (${failedCount} failed)`}.
            </div>
            <Link
              href="/meetings"
              className="block w-full bg-pep-blue text-white rounded px-4 py-3 font-medium uppercase tracking-wider text-center hover:bg-pep-dark transition-colors"
            >
              Go to Meetings
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
