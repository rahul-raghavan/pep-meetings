import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'
import { splitAudio } from '@/lib/split-audio'
import { analyzeMeeting } from '@/lib/analyze-meeting'

export const maxDuration = 900 // 15 minutes to allow for rate-limit retries

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
    await assertMeetingEdit(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const supabase = createServiceClient()

  // Get meeting with audio path
  const { data: meeting } = await supabase
    .from('pep_meetings')
    .select('*')
    .eq('id', id)
    .single()

  if (!meeting || !meeting.audio_storage_path) {
    return NextResponse.json({ error: 'Meeting or audio not found' }, { status: 404 })
  }

  // Update status to processing
  await supabase
    .from('pep_meetings')
    .update({ status: 'processing', error_message: null })
    .eq('id', id)

  try {
    // Download audio from Supabase Storage
    const { data: audioData, error: downloadError } = await supabase.storage
      .from('meeting-audio')
      .download(meeting.audio_storage_path)

    if (downloadError || !audioData) {
      throw new Error(`Failed to download audio: ${downloadError?.message}`)
    }

    // Split long audio into 45-minute chunks to avoid Voxtral 429 capacity errors
    const audioBuffer = Buffer.from(await audioData.arrayBuffer())
    const chunks = await splitAudio(audioBuffer)

    // Derive extension and MIME from storage path for small unsplit files.
    // splitAudio re-encodes to MP3 when it actually splits, but passes through as-is
    // for files under the size limit, so we need the original format.
    const MIME_MAP: Record<string, string> = {
      mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
      webm: 'audio/webm', ogg: 'audio/ogg', opus: 'audio/opus',
      aac: 'audio/aac', '3gp': 'audio/3gpp', mp4: 'audio/mp4',
      mpeg: 'audio/mpeg', mpg: 'audio/mpeg', amr: 'audio/amr',
    }
    const storagePath = meeting.audio_storage_path as string
    const storageExt = storagePath.split('.').pop()?.toLowerCase() || 'mp3'
    // If splitAudio actually split (>1 chunk), chunks are re-encoded to MP3
    const ext = chunks.length > 1 ? 'mp3' : storageExt
    const mimeType = chunks.length > 1 ? 'audio/mpeg' : (MIME_MAP[storageExt] || 'audio/mpeg')
    console.log(`[transcribe] Meeting ${id}: ${chunks.length} chunk(s) to transcribe`)

    const MAX_ATTEMPTS = 5
    const BASE_DELAY_MS = 30_000 // 30 seconds, doubles each retry
    const allSegments: Segment[] = []
    let speakerOffset = 0 // offset speaker IDs so chunks don't collide

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx]
      console.log(`[transcribe] Processing chunk ${chunkIdx + 1}/${chunks.length} (offset ${chunk.startOffsetSec}s)`)

      let transcription: Record<string, unknown> | null = null

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const formData = new FormData()
        formData.append('file', new Blob([new Uint8Array(chunk.buffer)], { type: mimeType }), `audio.${ext}`)
        formData.append('model', 'voxtral-mini-latest')
        formData.append('diarize', 'true')
        formData.append('timestamp_granularities', 'segment')

        const voxtralResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
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
          console.log(`Voxtral 429 on chunk ${chunkIdx + 1} attempt ${attempt}/${MAX_ATTEMPTS} for meeting ${id}. Retrying in ${delaySec}s...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }

        throw new Error(`Voxtral API error: ${voxtralResponse.status} ${errorText}`)
      }

      if (!transcription) {
        throw new Error(`Voxtral transcription failed for chunk ${chunkIdx + 1} after all retry attempts`)
      }

      // Parse segments from this chunk
      const chunkSegments = parseVoxtralSegments(transcription)

      // Find the highest speaker number in this chunk so we can offset the next chunk
      let maxSpeakerInChunk = 0
      for (const seg of chunkSegments) {
        const num = parseInt(seg.speaker.replace('SPEAKER_', ''), 10)
        if (num > maxSpeakerInChunk) maxSpeakerInChunk = num
      }

      // Offset timestamps and speaker IDs, then add to combined list
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

      // Bump speaker offset so next chunk's speakers get unique IDs
      speakerOffset += maxSpeakerInChunk
    }

    const segments = allSegments

    // Clear old transcript data (action items + summary are cleared by analyzeMeeting)
    await supabase.from('pep_transcript_segments').delete().eq('meeting_id', id)

    // Insert new segments
    if (segments.length > 0) {
      const { error: insertError } = await supabase
        .from('pep_transcript_segments')
        .insert(segments.map((seg, i) => ({
          meeting_id: id,
          speaker_label: seg.speaker,
          text: seg.text,
          start_time: seg.start,
          end_time: seg.end,
          segment_index: i,
        })))

      if (insertError) throw new Error(`Failed to save segments: ${insertError.message}`)

      // Auto-create participant entries for each unique speaker
      const uniqueSpeakers = [...new Set(segments.map(s => s.speaker))]
      const { data: existingParticipants } = await supabase
        .from('pep_meeting_participants')
        .select('speaker_label')
        .eq('meeting_id', id)

      const existingLabels = new Set((existingParticipants || []).map(p => p.speaker_label))
      const newSpeakers = uniqueSpeakers.filter(s => !existingLabels.has(s))

      if (newSpeakers.length > 0) {
        await supabase
          .from('pep_meeting_participants')
          .insert(newSpeakers.map(label => ({
            meeting_id: id,
            speaker_label: label,
            display_name: null,
            role: null,
          })))
      }

      // Remove stale participants whose speaker_label no longer appears in the new transcript
      const { data: allParticipants } = await supabase
        .from('pep_meeting_participants')
        .select('id, speaker_label')
        .eq('meeting_id', id)

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

    // Now run AI analysis (thick summary + deep analysis for admission/parent_teacher)
    await analyzeMeeting(id, segments, supabase, meeting.meeting_type)

    // Mark as completed
    await supabase
      .from('pep_meetings')
      .update({ status: 'completed' })
      .eq('id', id)

    return NextResponse.json({ success: true, segment_count: segments.length })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Unknown error'
    // Show a friendly message for rate limits, keep raw message for debugging
    const is429 = rawMessage.includes('429') || rawMessage.includes('capacity')
    const userMessage = is429
      ? 'Mistral servers are at capacity. Please try again in a few minutes using the Retry button.'
      : rawMessage
    await supabase
      .from('pep_meetings')
      .update({ status: 'failed', error_message: userMessage })
      .eq('id', id)
    if (is429) console.log(`Voxtral capacity exhausted for meeting ${id} after all retries. Raw: ${rawMessage}`)

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}

type Segment = { speaker: string; text: string; start: number; end: number }

function parseVoxtralSegments(response: Record<string, unknown>): Segment[] {
  // Voxtral V2 returns segments with speaker_id, start, end, text
  const rawSegments = response.segments as Array<{
    speaker_id?: string
    start?: number
    end?: number
    text?: string
  }> | undefined

  if (rawSegments && rawSegments.length > 0) {
    return rawSegments.map(seg => ({
      // Voxtral uses "Speaker 1", "Speaker 2" — normalize to "SPEAKER_01" format
      speaker: seg.speaker_id
        ? `SPEAKER_${seg.speaker_id.replace(/\D/g, '').padStart(2, '0')}`
        : 'SPEAKER_00',
      text: (seg.text || '').trim(),
      start: seg.start || 0,
      end: seg.end || 0,
    })).filter(seg => seg.text.length > 0)
  }

  // Fallback: if no segments, treat entire text as one segment
  const text = response.text as string
  if (text) {
    return [{ speaker: 'SPEAKER_01', text: text.trim(), start: 0, end: 0 }]
  }
  return []
}

