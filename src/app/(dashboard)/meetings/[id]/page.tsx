'use client'

import { useEffect, useState, useRef, use, useMemo } from 'react'
import Link from 'next/link'

type Participant = {
  id: string
  speaker_label: string
  display_name: string | null
  role: string | null
}

type Segment = {
  id: string
  speaker_label: string
  text: string
  start_time: number
  end_time: number
  segment_index: number
}

type ActionItem = {
  id: string
  description: string
  assigned_to: string | null
  due_date: string | null
  is_completed: boolean
  source_segment_index: number | null
  category: string | null
}

type TopicSection = {
  topic: string
  summary: string
  sentiment: string
}

type KeyQuote = {
  speaker: string
  quote: string
  why_it_matters: string
}

type AdmissionAnalysis = {
  overall_read: string
  parent_concerns: { concern: string; detail: string; priority: number }[]
  school_assessment: {
    strengths: string[]
    weaknesses: string[]
    missed_opportunities: string[]
  }
  red_flags: string[]
  green_flags: string[]
  alignment_rating: {
    score: number
    reasoning: string
    why_not_higher: string
    why_not_lower: string
  }
  key_quotes: KeyQuote[]
  suggestions: string[]
}

type ParentTeacherAnalysis = {
  overall_read: string
  parent_communication: {
    concerns: { concern: string; detail: string }[]
    celebrations: { item: string; detail: string }[]
    questions_requests: string[]
    unspoken_signals: string[]
  }
  teacher_assessment: {
    strengths: string[]
    weaknesses: string[]
    missed_opportunities: string[]
  }
  alignment_rating: {
    score: number
    reasoning: string
    why_not_higher: string
    why_not_lower: string
  }
  key_quotes: KeyQuote[]
  followup_email: string
  suggestions: string[]
}

type Analysis = AdmissionAnalysis | ParentTeacherAnalysis | null

type Summary = {
  summary: string
  key_decisions: string[]
  topic_sections?: TopicSection[]
  overall_sentiment?: string
  analysis?: Analysis
} | null

type Meeting = {
  id: string
  title: string
  meeting_type: string
  meeting_date: string
  status: string
  error_message: string | null
  recorded_by_name: string
  notes: string | null
  needs_attention: boolean
  can_edit: boolean
  classes: { id: string; name: string }[]
  segments: Segment[]
  participants: Participant[]
  action_items: ActionItem[]
  summary: Summary
}

const SENTIMENT_STYLES: Record<string, string> = {
  'Positive': 'bg-green-100 text-green-800',
  'Neutral': 'bg-gray-100 text-gray-700',
  'Concerned': 'bg-amber-100 text-amber-800',
  'Tense': 'bg-red-100 text-red-800',
  'Collaborative': 'bg-blue-100 text-blue-800',
  'Enthusiastic': 'bg-purple-100 text-purple-800',
}

const SPEAKER_COLORS = [
  'text-speaker-1 bg-speaker-1/10 border-speaker-1/20',
  'text-speaker-2 bg-speaker-2/10 border-speaker-2/20',
  'text-speaker-3 bg-speaker-3/10 border-speaker-3/20',
  'text-speaker-4 bg-speaker-4/10 border-speaker-4/20',
  'text-speaker-5 bg-speaker-5/10 border-speaker-5/20',
  'text-speaker-6 bg-speaker-6/10 border-speaker-6/20',
  'text-speaker-7 bg-speaker-7/10 border-speaker-7/20',
  'text-speaker-8 bg-speaker-8/10 border-speaker-8/20',
]

const SPEAKER_NAME_COLORS = [
  'text-speaker-1',
  'text-speaker-2',
  'text-speaker-3',
  'text-speaker-4',
  'text-speaker-5',
  'text-speaker-6',
  'text-speaker-7',
  'text-speaker-8',
]

const ROLE_OPTIONS = ['teacher', 'parent', 'student', 'admin', 'counselor', 'other']

const TYPE_LABELS: Record<string, string> = {
  parent_teacher: 'Parent-Teacher',
  admission: 'Admission',
  training: 'Training',
  hr: 'HR',
  internal: 'Internal',
  other: 'Other',
}

function AlignmentBadge({ score }: { score: number }) {
  const colors =
    score <= 2
      ? 'bg-red-100 text-red-800 border-red-200'
      : score === 3
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-green-100 text-green-800 border-green-200'

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded border ${colors}`}>
      {score}/5
    </span>
  )
}

function AnalysisSection({ analysis, meetingType }: { analysis: Analysis; meetingType: string }) {
  if (!analysis) return null

  const isAdmission = meetingType === 'admission'
  const isPT = meetingType === 'parent_teacher'
  const [emailCopied, setEmailCopied] = useState(false)

  if (!isAdmission && !isPT) return null

  return (
    <div className="space-y-4 mt-2">
      <div className="border-t border-gray-200 pt-4">
        <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-4">
          Deep Analysis
        </h2>
      </div>

      {/* Overall Read */}
      <div className="bg-pep-card rounded shadow-sm p-5">
        <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-2">
          Overall Read
        </h3>
        <p className="text-sm text-gray-700">{analysis.overall_read}</p>
      </div>

      {/* PT: Alignment Rating — shown early for parent-teacher */}
      {isPT && analysis.alignment_rating && (
        <div className="bg-pep-card rounded shadow-sm p-5">
          <div className="flex items-start justify-between mb-3">
            <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">
              Parent-School Alignment
            </h3>
            <AlignmentBadge score={analysis.alignment_rating.score} />
          </div>
          <p className="text-sm text-gray-700 mb-3">{analysis.alignment_rating.reasoning}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1">Why not higher?</p>
              <p className="text-gray-600">{analysis.alignment_rating.why_not_higher}</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1">Why not lower?</p>
              <p className="text-gray-600">{analysis.alignment_rating.why_not_lower}</p>
            </div>
          </div>
        </div>
      )}

      {/* Admission: Parent Concerns */}
      {isAdmission && 'parent_concerns' in analysis && analysis.parent_concerns?.length > 0 && (
        <div className="bg-pep-card rounded shadow-sm p-5">
          <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">
            Parent Concerns
          </h3>
          <div className="space-y-3">
            {(analysis as AdmissionAnalysis).parent_concerns.map((c, i) => (
              <div key={i} className="border-l-2 border-amber-300 pl-3">
                <p className="text-sm font-medium text-pep-gray">{i + 1}. {c.concern}</p>
                <p className="text-sm text-gray-600 mt-0.5">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admission: Red/Green Flags */}
      {isAdmission && 'red_flags' in analysis && (
        (() => {
          const a = analysis as AdmissionAnalysis
          const hasFlags = (a.red_flags?.length > 0) || (a.green_flags?.length > 0)
          if (!hasFlags) return null
          return (
            <div className="bg-pep-card rounded shadow-sm p-5">
              <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">
                At a Glance
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {a.green_flags?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-1.5">Green Flags</p>
                    <ul className="space-y-1.5">
                      {a.green_flags.map((f, i) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-green-500 shrink-0 mt-0.5">&#10003;</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.red_flags?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-red-700 mb-1.5">Red Flags</p>
                    <ul className="space-y-1.5">
                      {a.red_flags.map((f, i) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-red-400 shrink-0 mt-0.5">&#10007;</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )
        })()
      )}

      {/* Parent-Teacher: What the Parent is Communicating */}
      {isPT && 'parent_communication' in analysis && (
        <div className="bg-pep-card rounded shadow-sm p-5">
          <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">
            What the Parent is Communicating
          </h3>
          {(() => {
            const pc = (analysis as ParentTeacherAnalysis).parent_communication
            return (
              <div className="space-y-4">
                {pc.concerns?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1.5">Concerns</p>
                    <div className="space-y-2">
                      {pc.concerns.map((c, i) => (
                        <div key={i} className="border-l-2 border-amber-300 pl-3">
                          <p className="text-sm font-medium text-pep-gray">{c.concern}</p>
                          <p className="text-sm text-gray-600 mt-0.5">{c.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pc.celebrations?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1.5">Celebrations</p>
                    <div className="space-y-2">
                      {pc.celebrations.map((c, i) => (
                        <div key={i} className="border-l-2 border-green-300 pl-3">
                          <p className="text-sm font-medium text-pep-gray">{c.item}</p>
                          <p className="text-sm text-gray-600 mt-0.5">{c.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pc.questions_requests?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1.5">Questions & Requests</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {pc.questions_requests.map((q, i) => (
                        <li key={i} className="text-sm text-gray-700">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {pc.unspoken_signals?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1.5">Reading Between the Lines</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {pc.unspoken_signals.map((s, i) => (
                        <li key={i} className="text-sm text-gray-600 italic">{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Admission: School Assessment — full layout */}
      {isAdmission && (analysis as AdmissionAnalysis).school_assessment && (() => {
        const assessment = (analysis as AdmissionAnalysis).school_assessment
        return (
          <div className="bg-pep-card rounded shadow-sm p-5">
            <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">
              How the School Came Across
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {assessment.strengths?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-1.5">Strengths</p>
                  <ul className="space-y-1">
                    {assessment.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-1.5">
                        <span className="text-green-500 shrink-0">+</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {assessment.weaknesses?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-700 mb-1.5">Weaknesses</p>
                  <ul className="space-y-1">
                    {assessment.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-1.5">
                        <span className="text-red-400 shrink-0">-</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {assessment.missed_opportunities?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1.5">Missed Opportunities</p>
                <ul className="space-y-1">
                  {assessment.missed_opportunities.map((m, i) => (
                    <li key={i} className="text-sm text-gray-600 italic">{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })()}

      {/* PT: Compact feedback — teacher assessment + missed opportunities + suggestions in one card */}
      {isPT && (() => {
        const assessment = (analysis as ParentTeacherAnalysis).teacher_assessment
        const suggestions = analysis.suggestions
        if (!assessment && (!suggestions || suggestions.length === 0)) return null
        return (
          <div className="bg-pep-card rounded shadow-sm p-5">
            <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">
              Feedback & Next Steps
            </h3>
            <div className="space-y-3">
              {assessment?.strengths?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-1">What went well</p>
                  <ul className="space-y-0.5">
                    {assessment.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-1.5">
                        <span className="text-green-500 shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {((assessment?.weaknesses?.length ?? 0) > 0 || (assessment?.missed_opportunities?.length ?? 0) > 0) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">Could be better</p>
                  <ul className="space-y-0.5">
                    {assessment?.weaknesses?.map((w, i) => (
                      <li key={`w-${i}`} className="text-sm text-gray-700 flex gap-1.5">
                        <span className="text-amber-500 shrink-0">-</span>{w}
                      </li>
                    ))}
                    {assessment?.missed_opportunities?.map((m, i) => (
                      <li key={`m-${i}`} className="text-sm text-gray-600 flex gap-1.5">
                        <span className="text-amber-400 shrink-0">-</span>{m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {suggestions && suggestions.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-pep-blue mb-1">Next steps</p>
                  <ul className="space-y-0.5">
                    {suggestions.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-1.5">
                        <span className="text-pep-blue shrink-0">&rarr;</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Alignment Rating — admission only (PT is shown above, after Overall Read) */}
      {isAdmission && analysis.alignment_rating && (
        <div className="bg-pep-card rounded shadow-sm p-5">
          <div className="flex items-start justify-between mb-3">
            <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">
              Family-School Alignment
            </h3>
            <AlignmentBadge score={analysis.alignment_rating.score} />
          </div>
          <p className="text-sm text-gray-700 mb-3">{analysis.alignment_rating.reasoning}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1">Why not higher?</p>
              <p className="text-gray-600">{analysis.alignment_rating.why_not_higher}</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-1">Why not lower?</p>
              <p className="text-gray-600">{analysis.alignment_rating.why_not_lower}</p>
            </div>
          </div>
        </div>
      )}

      {/* Key Quotes */}
      {'key_quotes' in analysis && analysis.key_quotes?.length > 0 && (
        <div className="bg-pep-card rounded shadow-sm p-5">
          <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">
            Key Quotes
          </h3>
          <div className="space-y-3">
            {analysis.key_quotes.map((q: KeyQuote, i: number) => (
              <div key={i} className="border-l-2 border-pep-blue/30 pl-3">
                <p className="text-sm text-gray-700 italic">&ldquo;{q.quote}&rdquo;</p>
                <p className="text-xs text-pep-gray mt-1">
                  <span className="font-medium">{q.speaker}</span>
                  {q.why_it_matters && <span className="text-gray-400"> &mdash; {q.why_it_matters}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PT: Follow-up Email Draft */}
      {isPT && 'followup_email' in analysis && (analysis as ParentTeacherAnalysis).followup_email && (
        <div className="bg-pep-card rounded shadow-sm p-5">
          <div className="flex items-start justify-between mb-2">
            <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">
              Follow-up Email Draft
            </h3>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText((analysis as ParentTeacherAnalysis).followup_email)
                setEmailCopied(true)
                setTimeout(() => setEmailCopied(false), 2000)
              }}
              className="text-xs text-pep-blue hover:underline cursor-pointer shrink-0"
            >
              {emailCopied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
          <div className="bg-gray-50 rounded p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
            {(analysis as ParentTeacherAnalysis).followup_email}
          </div>
        </div>
      )}

      {/* Suggestions — admission only (PT suggestions are in the Feedback card above) */}
      {isAdmission && analysis.suggestions?.length > 0 && (
        <div className="bg-pep-card rounded shadow-sm p-5">
          <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-2">
            Suggestions
          </h3>
          <ul className="list-disc pl-5 space-y-1">
            {analysis.suggestions.map((s, i) => (
              <li key={i} className="text-sm text-gray-700">{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [speakerEditing, setSpeakerEditing] = useState(false)
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<string, { name: string; role: string }>>({})
  const [savingSpeakers, setSavingSpeakers] = useState(false)
  const [mergeFrom, setMergeFrom] = useState('')
  const [mergeTo, setMergeTo] = useState('')
  const [merging, setMerging] = useState(false)
  const [newActionItem, setNewActionItem] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [showEmailDraft, setShowEmailDraft] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'transcript'>('summary')
  const [regenerating, setRegenerating] = useState(false)
  const [selectedForEmail, setSelectedForEmail] = useState<Set<string>>(new Set())
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [replaceResult, setReplaceResult] = useState<string | null>(null)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchMeeting()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [id])

  // Poll every 5s while meeting is processing, stop once it completes/fails
  useEffect(() => {
    if (meeting?.status === 'processing') {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const res = await fetch(`/api/meetings/${id}`)
          if (res.ok) {
            const data = await res.json()
            setMeeting(data)
            initSpeakerDrafts(data.participants)
            if (data.status !== 'processing') {
              if (pollingRef.current) clearInterval(pollingRef.current)
              pollingRef.current = null
            }
          }
        }, 5000)
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [meeting?.status, id])

  async function fetchMeeting() {
    setLoading(true)
    const res = await fetch(`/api/meetings/${id}`)
    if (res.ok) {
      const data = await res.json()
      setMeeting(data)
      initSpeakerDrafts(data.participants)
      // Select all action items for email by default
      setSelectedForEmail(new Set(data.action_items.map((ai: ActionItem) => ai.id)))
    }
    setLoading(false)
  }

  function initSpeakerDrafts(participants: Participant[]) {
    const drafts: Record<string, { name: string; role: string }> = {}
    for (const p of participants) {
      drafts[p.speaker_label] = {
        name: p.display_name || '',
        role: p.role || '',
      }
    }
    setSpeakerDrafts(drafts)
  }

  // Precompute speaker maps for O(1) lookups instead of O(n) per call
  const uniqueSpeakers = useMemo(
    () => [...new Set(meeting?.segments.map(s => s.speaker_label) || [])],
    [meeting?.segments]
  )

  const speakerMap = useMemo(() => {
    const map: Record<string, { name: string; role: string | null; colorIndex: number }> = {}
    for (const label of uniqueSpeakers) {
      const participant = meeting?.participants.find(p => p.speaker_label === label)
      map[label] = {
        name: participant?.display_name || label.replace('SPEAKER_', 'Speaker '),
        role: participant?.role || null,
        colorIndex: uniqueSpeakers.indexOf(label) % SPEAKER_COLORS.length,
      }
    }
    return map
  }, [meeting?.participants, uniqueSpeakers])

  function getSpeakerName(label: string): string {
    return speakerMap[label]?.name || label.replace('SPEAKER_', 'Speaker ')
  }

  function getSpeakerRole(label: string): string | null {
    return speakerMap[label]?.role || null
  }

  // Replace speaker labels with display names in summary text
  // Handles: SPEAKER_01, Speaker_01, Speaker 01, Speaker 1, etc.
  function replaceSpeakerLabels(text: string): string {
    return text.replace(/Speaker[_ ]?\d+/gi, (match) => {
      const num = match.replace(/\D/g, '').padStart(2, '0')
      return getSpeakerName(`SPEAKER_${num}`)
    })
  }

  function getSpeakerColorIndex(label: string): number {
    return speakerMap[label]?.colorIndex ?? 0
  }

  async function saveSpeakers() {
    setSavingSpeakers(true)
    const speakers = Object.entries(speakerDrafts).map(([label, draft]) => ({
      speaker_label: label,
      display_name: draft.name,
      role: draft.role || null,
    }))

    const res = await fetch(`/api/meetings/${id}/speakers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakers }),
    })

    if (res.ok) {
      await fetchMeeting()
      setSpeakerEditing(false)
    }
    setSavingSpeakers(false)
  }

  async function mergeSpeakers() {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return
    setMerging(true)

    const res = await fetch(`/api/meetings/${id}/merge-speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_speaker: mergeFrom, to_speaker: mergeTo }),
    })

    if (res.ok) {
      const data = await res.json()
      setMeeting(prev => prev ? {
        ...prev,
        segments: data.segments,
        participants: data.participants,
      } : null)
      if (data.participants) initSpeakerDrafts(data.participants)
      setMergeFrom('')
      setMergeTo('')
    }
    setMerging(false)
  }

  async function regenerateAnalysis() {
    if (!meeting) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/regenerate`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to regenerate analysis')
        return
      }
      // Refetch meeting data to show updated summary + action items
      const meetingRes = await fetch(`/api/meetings/${meeting.id}`)
      if (meetingRes.ok) {
        const data = await meetingRes.json()
        setMeeting(data)
        initSpeakerDrafts(data.participants)
      }
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setRegenerating(false)
    }
  }

  async function handleFindReplace(e: React.FormEvent) {
    e.preventDefault()
    if (!findText.trim()) return
    setReplacing(true)
    setReplaceResult(null)
    try {
      const res = await fetch(`/api/meetings/${id}/find-replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ find: findText, replace: replaceText }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReplaceResult(data.error || 'Something went wrong')
        return
      }
      const { segments, summary, action_items } = data.replaced
      const parts: string[] = []
      if (segments > 0) parts.push(`${segments} transcript segment${segments > 1 ? 's' : ''}`)
      if (summary) parts.push('summary')
      if (action_items > 0) parts.push(`${action_items} action item${action_items > 1 ? 's' : ''}`)
      setReplaceResult(parts.length > 0 ? `Updated ${parts.join(', ')}` : 'No matches found')
      if (parts.length > 0) fetchMeeting()
    } catch {
      setReplaceResult('Something went wrong')
    } finally {
      setReplacing(false)
    }
  }

  function downloadTranscript() {
    if (!meeting) return

    const lines = meeting.segments.map(seg => {
      const name = getSpeakerName(seg.speaker_label)
      const role = getSpeakerRole(seg.speaker_label)
      const speaker = role ? `${name} (${role})` : name
      return `[${formatTime(seg.start_time)}] ${speaker}: ${seg.text}`
    })

    // Add header
    const header = [
      meeting.title,
      `Date: ${new Date(meeting.meeting_date).toLocaleDateString()}`,
      `Type: ${TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}`,
      `Recorded by: ${meeting.recorded_by_name}`,
      '',
      '---',
      '',
    ]

    // Add summary if available
    const summarySection: string[] = []
    if (meeting.summary) {
      summarySection.push(
        'SUMMARY',
        replaceSpeakerLabels(meeting.summary.summary),
        ...(meeting.summary.overall_sentiment ? [`Overall sentiment: ${meeting.summary.overall_sentiment}`] : []),
        '',
      )

      // Topic sections
      if (meeting.summary.topic_sections && meeting.summary.topic_sections.length > 0) {
        for (const section of meeting.summary.topic_sections) {
          summarySection.push(
            `## ${section.topic} [${section.sentiment}]`,
            replaceSpeakerLabels(section.summary),
            '',
          )
        }
      }

      if (meeting.summary.key_decisions?.length > 0) {
        summarySection.push(
          'KEY DECISIONS',
          ...meeting.summary.key_decisions.map(d => `- ${replaceSpeakerLabels(d)}`),
          '',
        )
      }

      summarySection.push('---', '')
    }

    // Add action items if any
    const actionSection = meeting.action_items.length > 0 ? [
      'ACTION ITEMS',
      ...meeting.action_items.map(ai => {
        const status = ai.is_completed ? '[x]' : '[ ]'
        return `${status} ${ai.description}`
      }),
      '',
      '---',
      '',
    ] : []

    const content = [...header, ...summarySection, ...actionSection, 'TRANSCRIPT', '', ...lines].join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${meeting.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}-transcript.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function toggleActionItem(item: ActionItem) {
    const res = await fetch(`/api/meetings/${id}/action-items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, is_completed: !item.is_completed }),
    })
    if (res.ok) {
      const updated = await res.json()
      setMeeting(prev => prev ? {
        ...prev,
        action_items: prev.action_items.map(ai => ai.id === updated.id ? updated : ai),
      } : null)
    }
  }

  async function addActionItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newActionItem.trim()) return

    const res = await fetch(`/api/meetings/${id}/action-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newActionItem, assigned_to: null }),
    })
    if (res.ok) {
      const item = await res.json()
      setMeeting(prev => prev ? { ...prev, action_items: [...prev.action_items, item] } : null)
      setNewActionItem('')
    }
  }

  async function deleteActionItem(itemId: string) {
    const res = await fetch(`/api/meetings/${id}/action-items?item_id=${itemId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setMeeting(prev => prev ? {
        ...prev,
        action_items: prev.action_items.filter(ai => ai.id !== itemId),
      } : null)
    }
  }

  async function saveActionItemEdit(itemId: string) {
    if (!editingText.trim()) return
    const res = await fetch(`/api/meetings/${id}/action-items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, description: editingText.trim() }),
    })
    if (res.ok) {
      const updated = await res.json()
      setMeeting(prev => prev ? {
        ...prev,
        action_items: prev.action_items.map(ai => ai.id === updated.id ? updated : ai),
      } : null)
    }
    setEditingItemId(null)
    setEditingText('')
  }

  function generateEmailBody(): string {
    if (!meeting) return ''
    const selectedItems = meeting.action_items.filter(ai => selectedForEmail.has(ai.id))
    const lines = selectedItems.map((ai, i) => {
      let line = `${i + 1}. ${ai.description}`
      if (ai.due_date) line += ` — due ${new Date(ai.due_date).toLocaleDateString()}`
      return line
    })
    return [
      `Hi,`,
      ``,
      `Here are the action items from our meeting:`,
      ``,
      ...lines,
      ``,
      `Please let me know if you have any questions.`,
      ``,
      `Thanks`,
    ].join('\n')
  }

  function openEmailDraft() {
    setEmailDraft(generateEmailBody())
    setShowEmailDraft(true)
    setEmailCopied(false)
  }

  async function copyEmailToClipboard() {
    await navigator.clipboard.writeText(emailDraft)
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 2000)
  }

  async function retryTranscription() {
    setMeeting(prev => prev ? { ...prev, status: 'processing', error_message: null } : null)
    const res = await fetch(`/api/meetings/${id}/transcribe`, { method: 'POST' })
    await fetchMeeting()
    void res
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="text-center py-12">
        <p className="text-pep-gray">Meeting not found.</p>
        <Link href="/meetings" className="text-pep-blue mt-2 inline-block">Back to meetings</Link>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-4">
        <div>
          <Link href="/meetings" className="text-sm text-pep-gray hover:text-pep-blue mb-1 inline-block">&larr; Back to meetings</Link>
          <h1 className="text-2xl font-bold text-pep-gray">{meeting.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-pep-gray">
            <span>{new Date(meeting.meeting_date).toLocaleDateString()}</span>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span>{TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}</span>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span>by {meeting.recorded_by_name}</span>
            {meeting.classes.length > 0 && (
              <>
                <span className="text-gray-300 hidden sm:inline">|</span>
                <span className="text-pep-blue">{meeting.classes.map(c => c.name).join(', ')}</span>
              </>
            )}
          </div>
          {meeting.notes && <p className="text-sm text-pep-gray mt-2">{meeting.notes}</p>}
        </div>
        {/* Action buttons */}
        {meeting.status === 'completed' && meeting.segments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {meeting.can_edit && (
              <button
                onClick={() => { setShowFindReplace(v => !v); setReplaceResult(null) }}
                className="bg-pep-card border border-gray-200 text-pep-gray px-4 py-2 rounded text-sm font-medium uppercase tracking-wider hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Find &amp; Replace
              </button>
            )}
            <button
              onClick={downloadTranscript}
              className="bg-pep-card border border-gray-200 text-pep-gray px-4 py-2 rounded text-sm font-medium uppercase tracking-wider hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Download TXT
            </button>
          </div>
        )}
      </div>

      {/* Find & Replace bar */}
      {showFindReplace && (
        <form onSubmit={handleFindReplace} className="bg-pep-card rounded shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Find..."
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
              autoFocus
            />
            <input
              type="text"
              placeholder="Replace with..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
            />
            <button
              type="submit"
              disabled={replacing || !findText.trim()}
              className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              {replacing ? 'Replacing...' : 'Replace All'}
            </button>
          </div>
          {replaceResult && (
            <p className="text-xs text-pep-gray mt-2">{replaceResult}</p>
          )}
        </form>
      )}

      {/* Processing / Failed states */}
      {meeting.status === 'processing' && (
        <div className="bg-blue-50 rounded p-6 mb-4 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-pep-blue border-t-transparent mb-3" />
          <p className="text-blue-800 font-medium">Sit back and relax — we&apos;re working on it</p>
          <p className="text-sm text-blue-600 mt-1">
            Your audio is being transcribed and analyzed. This typically takes 3-5 minutes.
            <br />
            You can leave this page and come back — the work continues in the background.
          </p>
        </div>
      )}

      {meeting.status === 'failed' && (
        <div className="bg-red-50 rounded p-6 mb-4">
          <p className="text-red-800 font-medium">Transcription failed</p>
          <p className="text-sm text-red-600 mt-1">{meeting.error_message || 'Unknown error'}</p>
          <button
            onClick={retryTranscription}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
          >
            Retry Transcription
          </button>
        </div>
      )}

      {meeting.status === 'uploading' && meeting.segments.length === 0 && (
        <div className="bg-yellow-50 rounded p-6 mb-4 text-center">
          <p className="text-yellow-800 font-medium">Waiting for audio upload</p>
        </div>
      )}

      {/* Speaker Labeling + Merge */}
      {meeting.participants.length > 0 && (
        <div className="bg-pep-card rounded shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">
              Speakers ({uniqueSpeakers.length})
            </h2>
            {!speakerEditing ? (
              meeting.can_edit && (
                <button
                  onClick={() => setSpeakerEditing(true)}
                  className="text-sm text-pep-blue hover:underline cursor-pointer"
                >
                  Edit speakers
                </button>
              )
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setSpeakerEditing(false)}
                  className="text-sm text-pep-gray hover:underline cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSpeakers}
                  disabled={savingSpeakers}
                  className="text-sm bg-pep-blue text-white px-3 py-1 rounded uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingSpeakers ? 'Saving...' : 'Save names'}
                </button>
              </div>
            )}
          </div>

          {speakerEditing ? (
            <div className="space-y-4">
              {/* Name editing */}
              <div className="space-y-3">
                {meeting.participants.map((p) => (
                  <div key={p.speaker_label} className="flex flex-col sm:flex-row gap-2">
                    <span className={`text-sm font-mono sm:w-28 ${SPEAKER_NAME_COLORS[getSpeakerColorIndex(p.speaker_label)]}`}>
                      {p.speaker_label}
                    </span>
                    <input
                      type="text"
                      placeholder="Name (e.g., Mrs. Sharma)"
                      value={speakerDrafts[p.speaker_label]?.name || ''}
                      onChange={(e) => setSpeakerDrafts(prev => ({
                        ...prev,
                        [p.speaker_label]: { ...prev[p.speaker_label], name: e.target.value },
                      }))}
                      className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                    />
                    <select
                      value={speakerDrafts[p.speaker_label]?.role || ''}
                      onChange={(e) => setSpeakerDrafts(prev => ({
                        ...prev,
                        [p.speaker_label]: { ...prev[p.speaker_label], role: e.target.value },
                      }))}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm cursor-pointer"
                    >
                      <option value="">Role</option>
                      {ROLE_OPTIONS.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Merge speakers */}
              {uniqueSpeakers.length > 1 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-pep-gray mb-2">
                    Merge speakers (fix over-split diarization)
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-sm text-pep-gray">Change</span>
                    <select
                      value={mergeFrom}
                      onChange={(e) => setMergeFrom(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm cursor-pointer"
                    >
                      <option value="">Select speaker...</option>
                      {uniqueSpeakers.map(s => (
                        <option key={s} value={s}>
                          {getSpeakerName(s)} ({s})
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-pep-gray">into</span>
                    <select
                      value={mergeTo}
                      onChange={(e) => setMergeTo(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm cursor-pointer"
                    >
                      <option value="">Select speaker...</option>
                      {uniqueSpeakers.filter(s => s !== mergeFrom).map(s => (
                        <option key={s} value={s}>
                          {getSpeakerName(s)} ({s})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={mergeSpeakers}
                      disabled={!mergeFrom || !mergeTo || merging}
                      className="bg-pep-gold text-pep-gray px-3 py-1.5 rounded text-sm font-medium uppercase tracking-wider hover:bg-pep-gold/80 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {merging ? 'Merging...' : 'Merge'}
                    </button>
                  </div>
                  <p className="text-xs text-pep-gray mt-1">
                    This reassigns all segments from one speaker to another. Useful when the AI split one person into multiple speakers.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {meeting.participants.map((p) => {
                const colorIdx = getSpeakerColorIndex(p.speaker_label)
                return (
                  <span key={p.speaker_label} className={`text-sm px-3 py-1 rounded border ${SPEAKER_COLORS[colorIdx]}`}>
                    {p.display_name || p.speaker_label.replace('SPEAKER_', 'Speaker ')}
                    {p.role && <span className="opacity-60 ml-1">({p.role})</span>}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      {meeting.status === 'completed' && (
        <>
          <div className="flex gap-1 mb-4 overflow-x-auto">
            {(['summary', 'actions', 'transcript'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded text-sm font-medium uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab ? 'bg-pep-blue text-white' : 'bg-pep-card text-pep-gray hover:bg-gray-50'
                }`}
              >
                {tab === 'transcript' ? 'Transcript' : tab === 'actions' ? `Action Items (${meeting.action_items.length})` : 'Summary'}
              </button>
            ))}
          </div>

          {/* Transcript Tab */}
          {activeTab === 'transcript' && (
            <div className="bg-pep-card rounded shadow-sm p-5 space-y-3">
              {meeting.segments.length === 0 ? (
                <p className="text-pep-gray text-center py-6">No transcript segments found.</p>
              ) : (
                meeting.segments.map((seg) => {
                  const colorIdx = getSpeakerColorIndex(seg.speaker_label)
                  const name = getSpeakerName(seg.speaker_label)
                  const role = getSpeakerRole(seg.speaker_label)
                  return (
                    <div key={seg.id} className="flex gap-3">
                      <span className="text-xs text-pep-gray w-10 pt-1 text-right shrink-0 font-mono">
                        {formatTime(seg.start_time)}
                      </span>
                      <div className="flex-1">
                        <span className={`text-sm font-semibold ${SPEAKER_NAME_COLORS[colorIdx]}`}>
                          {name}
                          {role && <span className="font-normal opacity-60 ml-1">({role})</span>}
                          :
                        </span>{' '}
                        <span className="text-sm text-gray-700">{seg.text}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Action Items Tab */}
          {activeTab === 'actions' && (
            <div className="bg-pep-card rounded shadow-sm p-5">
              {meeting.action_items.length === 0 ? (
                <p className="text-pep-gray text-center py-4">No action items yet.</p>
              ) : (
                <div className="mb-4">
                  <p className="text-xs text-pep-gray mb-3">
                    Check items to include in the email draft. Click an item to edit it.
                  </p>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setSelectedForEmail(new Set(meeting.action_items.map(ai => ai.id)))}
                      className="text-xs text-pep-blue hover:underline cursor-pointer"
                    >
                      Select all
                    </button>
                    <span className="text-xs text-gray-300">|</span>
                    <button
                      onClick={() => setSelectedForEmail(new Set())}
                      className="text-xs text-pep-blue hover:underline cursor-pointer"
                    >
                      Deselect all
                    </button>
                    <span className="text-xs text-gray-400 ml-auto">
                      {selectedForEmail.size} of {meeting.action_items.length} selected
                    </span>
                  </div>

                  {/* Group items by category */}
                  {(() => {
                    const groups: { category: string; items: ActionItem[] }[] = []
                    const seen = new Set<string>()
                    for (const item of meeting.action_items) {
                      const cat = item.category || 'General'
                      if (!seen.has(cat)) {
                        seen.add(cat)
                        groups.push({ category: cat, items: [] })
                      }
                      groups.find(g => g.category === cat)!.items.push(item)
                    }

                    // If there's only one group and it's "General", don't show the header
                    const showGroupHeaders = groups.length > 1 || groups[0]?.category !== 'General'

                    return (
                      <div className="space-y-4">
                        {groups.map((group) => (
                          <div key={group.category}>
                            {showGroupHeaders && (
                              <p className="text-xs font-semibold uppercase tracking-wider text-pep-gray mb-2">
                                {group.category}
                              </p>
                            )}
                            <div className="space-y-1">
                              {group.items.map((item) => (
                                <div key={item.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedForEmail.has(item.id)}
                                    onChange={() => {
                                      setSelectedForEmail(prev => {
                                        const next = new Set(prev)
                                        if (next.has(item.id)) next.delete(item.id)
                                        else next.add(item.id)
                                        return next
                                      })
                                    }}
                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-pep-blue cursor-pointer"
                                  />
                                  <div className="flex-1">
                                    {editingItemId === item.id ? (
                                      <form
                                        onSubmit={(e) => { e.preventDefault(); saveActionItemEdit(item.id) }}
                                        className="flex gap-2"
                                      >
                                        <input
                                          type="text"
                                          value={editingText}
                                          onChange={(e) => setEditingText(e.target.value)}
                                          autoFocus
                                          onKeyDown={(e) => { if (e.key === 'Escape') { setEditingItemId(null); setEditingText('') } }}
                                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                                        />
                                        <button type="submit" className="text-xs text-pep-blue hover:underline cursor-pointer">Save</button>
                                        <button type="button" onClick={() => { setEditingItemId(null); setEditingText('') }} className="text-xs text-pep-gray hover:underline cursor-pointer">Cancel</button>
                                      </form>
                                    ) : (
                                      <p
                                        onClick={() => { setEditingItemId(item.id); setEditingText(item.description) }}
                                        className="text-sm text-pep-gray cursor-pointer rounded px-1 -mx-1 hover:bg-gray-50"
                                        title="Click to edit"
                                      >
                                        {item.description}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => deleteActionItem(item.id)}
                                    className="text-xs text-pep-coral hover:text-pep-coralhover cursor-pointer shrink-0"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Add manual action item */}
              <form onSubmit={addActionItem} className="flex gap-2 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  placeholder="Add an action item..."
                  value={newActionItem}
                  onChange={(e) => setNewActionItem(e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                />
                <button
                  type="submit"
                  className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer"
                >
                  Add
                </button>
              </form>

              {/* Generate email from selected items */}
              {meeting.action_items.length > 0 && (
                <div className="pt-3 mt-3 border-t border-gray-100">
                  {!showEmailDraft ? (
                    <button
                      onClick={openEmailDraft}
                      disabled={selectedForEmail.size === 0}
                      className="w-full border border-gray-200 text-pep-gray px-4 py-2.5 rounded text-sm font-medium uppercase tracking-wider hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {selectedForEmail.size === 0
                        ? 'Select items to generate email'
                        : `Generate Email (${selectedForEmail.size} items)`}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-pep-gray">Email draft</p>
                        <button
                          onClick={() => setShowEmailDraft(false)}
                          className="text-xs text-pep-gray hover:underline cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                      <textarea
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        rows={10}
                        className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 resize-y font-mono"
                      />
                      <button
                        onClick={copyEmailToClipboard}
                        className="w-full bg-pep-blue text-white px-4 py-2.5 rounded text-sm font-medium uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer"
                      >
                        {emailCopied ? 'Copied!' : 'Copy to Clipboard'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {meeting.summary ? (
                <>
                  {meeting.can_edit && (
                    <div className="flex justify-end">
                      <button
                        onClick={regenerateAnalysis}
                        disabled={regenerating}
                        className="text-xs text-gray-500 hover:text-pep-gray border border-gray-200 hover:border-gray-300 rounded px-3 py-1.5 uppercase tracking-wider transition-colors disabled:opacity-50"
                      >
                        {regenerating ? 'Regenerating...' : 'Regenerate Analysis'}
                      </button>
                    </div>
                  )}
                  {/* Overall summary + sentiment */}
                  <div className="bg-pep-card rounded shadow-sm p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">Overview</h3>
                      {meeting.summary.overall_sentiment && (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded ${SENTIMENT_STYLES[meeting.summary.overall_sentiment] || 'bg-gray-100 text-gray-700'}`}>
                          {meeting.summary.overall_sentiment}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{replaceSpeakerLabels(meeting.summary.summary)}</p>
                    {meeting.needs_attention && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">
                        This meeting has been flagged for attention due to tense or concerning topics.
                      </div>
                    )}
                  </div>

                  {/* Topic sections with sentiment */}
                  {meeting.summary.topic_sections && meeting.summary.topic_sections.length > 0 && (
                    <div className="space-y-3">
                      {meeting.summary.topic_sections.map((section, i) => (
                        <div key={i} className="bg-pep-card rounded shadow-sm p-5">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">{section.topic}</h3>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded shrink-0 ml-3 ${SENTIMENT_STYLES[section.sentiment] || 'bg-gray-100 text-gray-700'}`}>
                              {section.sentiment}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{replaceSpeakerLabels(section.summary)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Key decisions */}
                  {meeting.summary.key_decisions && meeting.summary.key_decisions.length > 0 && (
                    <div className="bg-pep-card rounded shadow-sm p-5">
                      <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-2">Key Decisions</h3>
                      <ul className="list-disc pl-5 space-y-1">
                        {meeting.summary.key_decisions.map((d, i) => (
                          <li key={i} className="text-sm text-gray-700">{replaceSpeakerLabels(d)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Deep Analysis — only shows when analysis exists */}
                  {meeting.summary.analysis && (
                    <AnalysisSection
                      analysis={meeting.summary.analysis}
                      meetingType={meeting.meeting_type}
                    />
                  )}
                </>
              ) : (
                <div className="bg-pep-card rounded shadow-sm p-5">
                  <p className="text-pep-gray text-center py-6">No summary available.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
