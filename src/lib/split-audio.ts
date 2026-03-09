import { execFile } from 'child_process'
import { writeFile, unlink, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

import { execFileSync } from 'child_process'

// On deployed platforms (Railway/Linux), ffmpeg-static's bundled binary often
// doesn't work. Prefer system ffmpeg if available, fall back to ffmpeg-static.
function getFfmpegPath(): string {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return 'ffmpeg'
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('ffmpeg-static')
  }
}
const ffmpegPath = getFfmpegPath()

const CHUNK_DURATION_SEC = 45 * 60 // 45 minutes

export type AudioChunk = {
  buffer: Buffer
  startOffsetSec: number
}

/**
 * Get the duration of an audio file in seconds using ffmpeg.
 * Parses "Duration: HH:MM:SS.xx" from ffmpeg's stderr output.
 */
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-i', filePath, '-hide_banner', '-f', 'null', '-'],
      { timeout: 60_000 },
      (error, _stdout, stderr) => {
        // ffmpeg writes info to stderr even on success; exit code 0 or 1 is fine
        const output = stderr || ''
        const match = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
        if (match) {
          const hours = parseInt(match[1], 10)
          const minutes = parseInt(match[2], 10)
          const seconds = parseInt(match[3], 10)
          const centiseconds = parseInt(match[4], 10)
          const total = hours * 3600 + minutes * 60 + seconds + centiseconds / 100
          resolve(total)
        } else {
          console.error('[split-audio] Could not parse duration from ffmpeg output:', output.slice(0, 500))
          reject(new Error(`Could not detect audio duration`))
        }
      }
    )
  })
}

/**
 * Extract a chunk of audio from a file using ffmpeg.
 * Uses -ss (start) and -t (duration) to cut without re-encoding.
 */
async function extractChunk(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegPath,
      [
        '-ss', String(startSec),
        '-t', String(durationSec),
        '-i', inputPath,
        '-vn',        // strip video
        '-acodec', 'libmp3lame', // re-encode to real MP3 (handles m4a/wav/webm inputs)
        '-ab', '128k',
        '-ar', '16000',
        '-ac', '1',    // mono — fine for speech
        '-y',
        outputPath,
      ],
      { timeout: 120_000 },
      (error, _stdout, stderr) => {
        if (error) {
          console.error('[split-audio] ffmpeg chunk extraction failed:', stderr)
          reject(new Error(`ffmpeg chunk extraction failed: ${error.message}`))
        } else {
          resolve()
        }
      }
    )
  })
}

/**
 * Split an audio buffer into 45-minute chunks.
 *
 * - If the audio is <= 45 minutes, returns a single chunk (no splitting).
 * - If longer, splits into 45-minute pieces using ffmpeg.
 *
 * Each chunk includes its startOffsetSec so the caller can adjust timestamps.
 */
export async function splitAudio(inputBuffer: Buffer): Promise<AudioChunk[]> {
  // Voxtral accepts up to 25MB. If the file is under that, skip ffmpeg entirely
  // and send it as-is. We only need ffmpeg for large files that need splitting.
  const VOXTRAL_LIMIT = 25 * 1024 * 1024
  if (inputBuffer.length < VOXTRAL_LIMIT) {
    console.log(`[split-audio] File is ${(inputBuffer.length / 1024 / 1024).toFixed(1)}MB — under 25MB, skipping ffmpeg`)
    return [{ buffer: inputBuffer, startOffsetSec: 0 }]
  }

  const id = randomUUID()
  const inputPath = join(tmpdir(), `pep-split-in-${id}`)
  const chunkPaths: string[] = []

  try {
    await writeFile(inputPath, inputBuffer)

    const durationSec = await getAudioDuration(inputPath)
    console.log(`[split-audio] Duration: ${(durationSec / 60).toFixed(1)} minutes`)

    // No splitting needed for short audio, but still compress to get under 25MB
    if (durationSec <= CHUNK_DURATION_SEC) {
      const compressedPath = join(tmpdir(), `pep-split-compressed-${id}.mp3`)
      chunkPaths.push(compressedPath)
      await extractChunk(inputPath, compressedPath, 0, durationSec)
      const compressedBuffer = await readFile(compressedPath)
      console.log(`[split-audio] Compressed ${(inputBuffer.length / 1024 / 1024).toFixed(1)}MB → ${(compressedBuffer.length / 1024 / 1024).toFixed(1)}MB`)
      return [{ buffer: compressedBuffer, startOffsetSec: 0 }]
    }

    const chunkCount = Math.ceil(durationSec / CHUNK_DURATION_SEC)
    console.log(`[split-audio] Splitting into ${chunkCount} chunks of ${CHUNK_DURATION_SEC / 60} min`)

    const chunks: AudioChunk[] = []

    for (let i = 0; i < chunkCount; i++) {
      const startSec = i * CHUNK_DURATION_SEC
      const remaining = durationSec - startSec
      const chunkDuration = Math.min(CHUNK_DURATION_SEC, remaining)

      const chunkPath = join(tmpdir(), `pep-split-chunk-${id}-${i}.mp3`)
      chunkPaths.push(chunkPath)

      await extractChunk(inputPath, chunkPath, startSec, chunkDuration)

      const chunkBuffer = await readFile(chunkPath)
      console.log(
        `[split-audio] Chunk ${i + 1}/${chunkCount}: ${(startSec / 60).toFixed(0)}-${((startSec + chunkDuration) / 60).toFixed(0)} min, ${(chunkBuffer.length / 1024 / 1024).toFixed(1)}MB`
      )

      chunks.push({ buffer: chunkBuffer, startOffsetSec: startSec })
    }

    return chunks
  } finally {
    // Clean up all temp files
    await unlink(inputPath).catch(() => {})
    for (const p of chunkPaths) {
      await unlink(p).catch(() => {})
    }
  }
}
