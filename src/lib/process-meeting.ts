import type { SupabaseClient } from '@supabase/supabase-js'

import { analyzeMeeting } from '@/lib/analyze-meeting'
import { splitAudio } from '@/lib/split-audio'

type Segment = { speaker: string; text: string; start: number; end: number }

type MeetingRecord = {
  id: string
  audio_storage_path: string | null
  meeting_type: string | null
  attempt_count: number | null
}

type ProcessMeetingResult = {
  analysisWarning?: string
  segmentCount?: number
  state: 'completed' | 'requeued'
}

const RETRYABLE_TRANSCRIPTION_DELAY_MINUTES = 5

export async function processMeeting(
  id: string,
  supabase: SupabaseClient
): Promise<ProcessMeetingResult> {
  const { data: meeting } = await supabase
    .from('pep_meetings')
    .select('id, audio_storage_path, meeting_type, attempt_count')
    .eq('id', id)
    .single()

  if (!meeting || !meeting.audio_storage_path) {
    throw new Error('Meeting or audio not found')
  }

  await supabase
    .from('pep_meetings')
    .update({
      status: 'transcribing',
      error_message: null,
    })
    .eq('id', id)

  try {
    const segments = await transcribeMeetingAudio(meeting, supabase)

    await supabase
      .from('pep_meetings')
      .update({
        status: 'analyzing',
        error_message: null,
      })
      .eq('id', id)

    try {
      await analyzeMeeting(id, segments, supabase, meeting.meeting_type || undefined)

      await supabase
        .from('pep_meetings')
        .update({
          status: 'completed',
          error_message: null,
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq('id', id)

      return { segmentCount: segments.length, state: 'completed' }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Unknown error'
      const userMessage = getAnalysisErrorMessage(rawMessage)

      console.error(`[worker] Analysis failed after transcript saved for meeting ${id}: ${rawMessage}`)

      await supabase
        .from('pep_meetings')
        .update({
          status: 'completed',
          error_message: userMessage,
          completed_at: new Date().toISOString(),
          last_error_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq('id', id)

      return {
        analysisWarning: userMessage,
        segmentCount: segments.length,
        state: 'completed',
      }
    }
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Unknown error'
    const userMessage = getTranscriptionErrorMessage(rawMessage)

    if (isRetryableTranscriptionError(rawMessage)) {
      const nextRetryAt = new Date(Date.now() + RETRYABLE_TRANSCRIPTION_DELAY_MINUTES * 60_000).toISOString()
      await supabase
        .from('pep_meetings')
        .update({
          status: 'queued',
          error_message: userMessage,
          queued_at: new Date().toISOString(),
          processing_started_at: null,
          next_retry_at: nextRetryAt,
          last_error_at: new Date().toISOString(),
        })
        .eq('id', id)

      return { state: 'requeued' }
    }

    await supabase
      .from('pep_meetings')
      .update({
        status: 'failed',
        error_message: userMessage,
        last_error_at: new Date().toISOString(),
        next_retry_at: null,
      })
      .eq('id', id)

    throw err
  }
}

async function transcribeMeetingAudio(
  meeting: MeetingRecord,
  supabase: SupabaseClient
): Promise<Segment[]> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from('meeting-audio')
    .download(meeting.audio_storage_path as string)

  if (downloadError || !audioData) {
    throw new Error(`Failed to download audio: ${downloadError?.message}`)
  }

  let audioBuffer: Buffer | null = Buffer.from(await audioData.arrayBuffer())
  const chunks = await splitAudio(audioBuffer)
  audioBuffer = null

  const MIME_MAP: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
    webm: 'audio/webm', ogg: 'audio/ogg', opus: 'audio/opus',
    aac: 'audio/aac', '3gp': 'audio/3gpp', mp4: 'audio/mp4',
    mpeg: 'audio/mpeg', mpg: 'audio/mpeg', amr: 'audio/amr',
  }
  const storagePath = meeting.audio_storage_path as string
  const storageExt = storagePath.split('.').pop()?.toLowerCase() || 'mp3'
  const ext = chunks.length > 1 ? 'mp3' : storageExt
  const mimeType = chunks.length > 1 ? 'audio/mpeg' : (MIME_MAP[storageExt] || 'audio/mpeg')
  console.log(`[transcribe] Meeting ${meeting.id}: ${chunks.length} chunk(s) to transcribe`)

  const MAX_ATTEMPTS = 5
  const BASE_DELAY_MS = 30_000
  const allSegments: Segment[] = []
  let speakerOffset = 0

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx]
    console.log(`[transcribe] Processing chunk ${chunkIdx + 1}/${chunks.length} (offset ${chunk.startOffsetSec}s)`)

    let transcription: Record<string, unknown> | null = null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const formData = new FormData()
      formData.append('file', new Blob([new Uint8Array(chunk.buffer)], { type: mimeType }), `audio.${ext}`)
      formData.append('model', 'voxtral-mini-2602')
      formData.append('diarize', 'true')
      formData.append('timestamp_granularities', 'segment')

      const voxtralResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
        body: formData,
      })

      if (voxtralResponse.ok) {
        transcription = await voxtralResponse.json()
        break
      }

      const errorText = await voxtralResponse.text()

      if (voxtralResponse.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = voxtralResponse.headers.get('retry-after')
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt - 1)
        const delaySec = Math.round(delayMs / 1000)
        console.log(`Voxtral 429 on chunk ${chunkIdx + 1} attempt ${attempt}/${MAX_ATTEMPTS} for meeting ${meeting.id}. Retrying in ${delaySec}s...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }

      throw new Error(`Voxtral API error: ${voxtralResponse.status} ${errorText}`)
    }

    if (!transcription) {
      throw new Error(`Voxtral transcription failed for chunk ${chunkIdx + 1} after all retry attempts`)
    }

    const chunkSegments = parseVoxtralSegments(transcription)

    let maxSpeakerInChunk = 0
    for (const seg of chunkSegments) {
      const num = parseInt(seg.speaker.replace('SPEAKER_', ''), 10)
      if (num > maxSpeakerInChunk) maxSpeakerInChunk = num
    }

    for (const seg of chunkSegments) {
      const originalNum = parseInt(seg.speaker.replace('SPEAKER_', ''), 10)
      const offsetNum = originalNum + speakerOffset
      allSegments.push({
        speaker: `SPEAKER_${String(offsetNum).padStart(2, '0')}`,
        text: seg.text,
        start: seg.start + chunk.startOffsetSec,
        end: seg.end + chunk.startOffsetSec,
      })
    }

    speakerOffset += maxSpeakerInChunk
    chunk.buffer = Buffer.alloc(0)
  }

  await supabase.from('pep_transcript_segments').delete().eq('meeting_id', meeting.id)

  if (allSegments.length > 0) {
    const { error: insertError } = await supabase
      .from('pep_transcript_segments')
      .insert(allSegments.map((seg, i) => ({
        meeting_id: meeting.id,
        speaker_label: seg.speaker,
        text: seg.text,
        start_time: seg.start,
        end_time: seg.end,
        segment_index: i,
      })))

    if (insertError) throw new Error(`Failed to save segments: ${insertError.message}`)

    const uniqueSpeakers = [...new Set(allSegments.map(s => s.speaker))]
    const { data: existingParticipants } = await supabase
      .from('pep_meeting_participants')
      .select('speaker_label')
      .eq('meeting_id', meeting.id)

    const existingLabels = new Set((existingParticipants || []).map(p => p.speaker_label))
    const newSpeakers = uniqueSpeakers.filter(s => !existingLabels.has(s))

    if (newSpeakers.length > 0) {
      await supabase
        .from('pep_meeting_participants')
        .insert(newSpeakers.map(label => ({
          meeting_id: meeting.id,
          speaker_label: label,
          display_name: null,
          role: null,
        })))
    }

    const { data: allParticipants } = await supabase
      .from('pep_meeting_participants')
      .select('id, speaker_label')
      .eq('meeting_id', meeting.id)

    const staleIds = (allParticipants || [])
      .filter(p => !uniqueSpeakers.includes(p.speaker_label))
      .map(p => p.id)

    if (staleIds.length > 0) {
      await supabase
        .from('pep_meeting_participants')
        .delete()
        .in('id', staleIds)
    }
  }

  return allSegments
}

function parseVoxtralSegments(response: Record<string, unknown>): Segment[] {
  const rawSegments = response.segments as Array<{
    speaker_id?: string
    start?: number
    end?: number
    text?: string
  }> | undefined

  if (rawSegments && rawSegments.length > 0) {
    return rawSegments.map(seg => ({
      speaker: seg.speaker_id
        ? `SPEAKER_${seg.speaker_id.replace(/\D/g, '').padStart(2, '0')}`
        : 'SPEAKER_00',
      text: (seg.text || '').trim(),
      start: seg.start || 0,
      end: seg.end || 0,
    })).filter(seg => seg.text.length > 0)
  }

  const text = response.text as string
  if (text) {
    return [{ speaker: 'SPEAKER_01', text: text.trim(), start: 0, end: 0 }]
  }
  return []
}

function isOpenAIQuotaError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('platform.openai.com')
    || lower.includes('openai')
    || lower.includes('current quota')
    || lower.includes('billing details')
    || lower.includes('insufficient_quota')
}

function isRetryableTranscriptionError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('voxtral api error: 429')
    || lower.includes('voxtral transcription failed')
    || lower.includes('capacity')
    || lower.includes('rate limit')
}

function getAnalysisErrorMessage(rawMessage: string): string {
  if (isOpenAIQuotaError(rawMessage)) {
    return 'Transcript saved, but AI summary failed because the OpenAI account is out of quota. Add credits, then click Regenerate Analysis.'
  }
  return `Transcript saved, but AI summary failed: ${rawMessage}`
}

function getTranscriptionErrorMessage(rawMessage: string): string {
  if (isOpenAIQuotaError(rawMessage)) {
    return 'AI summary failed because the OpenAI account is out of quota. The transcript may still be available once processing finishes.'
  }

  if (isRetryableTranscriptionError(rawMessage)) {
    return 'Queued for retry because the transcription provider is rate-limited or at capacity.'
  }

  return rawMessage
}
