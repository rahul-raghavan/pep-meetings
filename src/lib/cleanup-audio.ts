import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_AUDIO_RETENTION_HOURS = 6
const DEFAULT_AUDIO_CLEANUP_BATCH_SIZE = 100

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getCompletedAudioRetentionHours() {
  return parsePositiveInt(process.env.MEETING_AUDIO_RETENTION_HOURS, DEFAULT_AUDIO_RETENTION_HOURS)
}

export function getAudioCleanupBatchSize() {
  return parsePositiveInt(process.env.MEETING_AUDIO_CLEANUP_BATCH_SIZE, DEFAULT_AUDIO_CLEANUP_BATCH_SIZE)
}

type CleanupOptions = {
  batchSize?: number
  now?: Date
  retentionHours?: number
}

type CleanupResult = {
  deleted: number
  failed: number
  checked: number
  cutoffIso: string
  retentionHours: number
}

export async function cleanupCompletedMeetingAudio(
  supabase: SupabaseClient,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const retentionHours = options.retentionHours ?? getCompletedAudioRetentionHours()
  const batchSize = options.batchSize ?? getAudioCleanupBatchSize()
  const now = options.now ?? new Date()
  const cutoffIso = new Date(now.getTime() - retentionHours * 60 * 60 * 1000).toISOString()

  const { data: meetings, error } = await supabase
    .from('pep_meetings')
    .select('id, audio_storage_path, completed_at')
    .eq('status', 'completed')
    .not('audio_storage_path', 'is', null)
    .not('completed_at', 'is', null)
    .lt('completed_at', cutoffIso)
    .order('completed_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    throw new Error(`Failed to load meetings for audio cleanup: ${error.message}`)
  }

  let deleted = 0
  let failed = 0

  for (const meeting of meetings || []) {
    if (!meeting.audio_storage_path) continue

    const { error: deleteError } = await supabase.storage
      .from('meeting-audio')
      .remove([meeting.audio_storage_path])

    if (deleteError) {
      failed++
      console.error(`[audio-cleanup] Failed to delete ${meeting.audio_storage_path} for meeting ${meeting.id}: ${deleteError.message}`)
      continue
    }

    const { error: updateError } = await supabase
      .from('pep_meetings')
      .update({
        audio_storage_path: null,
        audio_file_size: null,
        audio_mime_type: null,
      })
      .eq('id', meeting.id)

    if (updateError) {
      failed++
      console.error(`[audio-cleanup] Deleted storage object but failed to clear metadata for meeting ${meeting.id}: ${updateError.message}`)
      continue
    }

    deleted++
  }

  return {
    deleted,
    failed,
    checked: meetings?.length || 0,
    cutoffIso,
    retentionHours,
  }
}
