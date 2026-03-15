'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ClassSelector } from '@/components/class-selector'

export default function NewMeetingPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [meetingType, setMeetingType] = useState('parent_teacher')
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [classIds, setClassIds] = useState<string[]>([])
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [step, setStep] = useState<'details' | 'uploading' | 'done'>('details')
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!audioFile) { setError('Please select an audio file'); return }

    setError('')
    setStep('uploading')
    setUploadProgress('Creating meeting...')

    try {
      // Step 1: Create meeting
      const createRes = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          meeting_type: meetingType,
          meeting_date: meetingDate,
          notes,
          class_ids: classIds,
        }),
      })
      if (!createRes.ok) {
        let msg = `Failed to create meeting (${createRes.status})`
        try { const err = await createRes.json(); msg = err.error || msg } catch {}
        throw new Error(msg)
      }
      const meeting = await createRes.json()

      // Step 2: Upload audio
      setUploadProgress('Uploading audio file...')
      const formData = new FormData()
      formData.append('audio', audioFile)

      const uploadRes = await fetch(`/api/meetings/${meeting.id}/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) {
        let msg = `Failed to upload audio (${uploadRes.status})`
        try { const err = await uploadRes.json(); msg = err.error || msg } catch {}
        throw new Error(msg)
      }

      setStep('done')
      router.push(`/meetings/${meeting.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStep('details')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setAudioFile(file)
      setError('')
    }
  }

  if (step === 'uploading') {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <div className="bg-pep-card rounded shadow-sm p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-pep-blue border-t-transparent mb-4" />
          <h2 className="text-lg font-semibold text-pep-gray mb-2">Uploading Meeting</h2>
          <p className="text-pep-gray">{uploadProgress}</p>
          <p className="text-sm text-pep-gray mt-2">You&apos;ll be redirected once the audio is safely queued.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-pep-gray mb-6">New Meeting</h1>

      <form onSubmit={handleSubmit} className="bg-pep-card rounded shadow-sm p-6 space-y-5">
        {error && (
          <div className="bg-red-50 text-red-700 rounded px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <ClassSelector value={classIds} onChange={setClassIds} />

        <div>
          <label className="block text-sm font-medium text-pep-gray mb-1">Title</label>
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
            <label className="block text-sm font-medium text-pep-gray mb-1">Type</label>
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
            <label className="block text-sm font-medium text-pep-gray mb-1">Date</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-pep-gray mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any context about this meeting..."
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-pep-gray mb-1">Audio File</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded p-6 text-center cursor-pointer hover:border-pep-blue/40 transition-colors"
          >
            {audioFile ? (
              <div>
                <p className="font-medium text-pep-gray">{audioFile.name}</p>
                <p className="text-sm text-pep-gray mt-1">
                  {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-pep-gray">Click to select an audio file</p>
                <p className="text-xs text-pep-gray mt-1">MP3, M4A, WAV, WebM, OGG, AAC, MPEG, or 3GP (max 50 MB)</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.m4a,.wav,.webm,.ogg,.opus,.aac,.mpeg,.mpg,.3gp,.mp4,audio/*,video/mpeg,video/mp4,video/3gpp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-pep-blue text-white rounded px-4 py-3 font-medium hover:bg-pep-dark transition-colors cursor-pointer uppercase tracking-wider"
        >
          Create Meeting & Queue
        </button>
      </form>
    </div>
  )
}
