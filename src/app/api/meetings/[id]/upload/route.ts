import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'
import { compressAudio, shouldCompress, SUPABASE_FILE_LIMIT } from '@/lib/compress-audio'

// Compression can take 10-20s for large files — allow up to 120s
export const maxDuration = 120

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

  const db = createServiceClient()

  // Verify meeting exists
  const { data: meeting } = await db
    .from('pep_meetings')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const file = formData.get('audio') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  const allowedTypes = [
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
    'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/opus',
    'audio/aac', 'audio/x-aac', 'audio/amr', 'audio/3gpp', 'audio/3gpp2',
    'video/mpeg', 'video/mp4', 'video/3gpp', 'video/3gpp2', 'video/ogg', 'video/webm',
  ]
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav|webm|ogg|opus|mpeg|mpg|mp4|3gp|3gpp|aac|amr)$/i)) {
    return NextResponse.json({ error: 'Unsupported audio format. Use mp3, m4a, wav, webm, ogg, aac, mpeg, or 3gp.' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  let buffer = Buffer.from(arrayBuffer)
  let mimeType = file.type
  let ext = file.name.split('.').pop() || 'mp3'

  // Compress large files to stay under Supabase's 50MB storage limit
  if (shouldCompress(buffer.length)) {
    try {
      console.log(`[upload] Compressing ${file.name} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)...`)
      const compressed = await compressAudio(buffer, file.name)
      buffer = Buffer.from(compressed.buffer)
      mimeType = compressed.mimeType
      ext = compressed.extension
      console.log(`[upload] Compression complete: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`)
    } catch (err) {
      console.error('[upload] Compression failed, trying original:', err)
      // Fall back to original — but if it's over 50MB, we can't upload it
      if (buffer.length > SUPABASE_FILE_LIMIT) {
        return NextResponse.json(
          { error: 'File is too large (over 50MB) and compression failed. Please try a smaller file or convert it to MP3 first.' },
          { status: 413 }
        )
      }
    }
  }

  // Upload to Supabase Storage
  const storagePath = `${id}/audio.${ext}`

  const { error: uploadError } = await db.storage
    .from('meeting-audio')
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Update meeting record — store the actual size in storage (compressed if applicable)
  const { error: updateError } = await db
    .from('pep_meetings')
    .update({
      audio_storage_path: storagePath,
      audio_file_size: buffer.length,
      audio_mime_type: mimeType,
      status: 'queued',
      queued_at: new Date().toISOString(),
      processing_started_at: null,
      completed_at: null,
      attempt_count: 0,
      next_retry_at: null,
      last_error_at: null,
      error_message: null,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, storage_path: storagePath })
}
