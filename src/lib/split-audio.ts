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
 * Prefer the container-level duration, then fall back to the final decoded
 * progress timestamp for recordings where ffmpeg reports "Duration: N/A".
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
        const total = parseDurationFromFfmpegOutput(output)

        if (total !== null) {
          resolve(total)
        } else {
          console.error('[split-audio] Could not parse duration from ffmpeg output:', output.slice(0, 500))
          reject(new Error(`Could not detect audio duration`))
        }
      }
    )
  })
}

function parseDurationFromFfmpegOutput(output: string): number | null {
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
  if (durationMatch) {
    return timestampPartsToSeconds(durationMatch[1], durationMatch[2], durationMatch[3], durationMatch[4])
  }

  const progressMatches = [...output.matchAll(/time=(\d+):(\d+):(\d+)\.(\d+)/g)]
  const finalProgressMatch = progressMatches.at(-1)
  if (finalProgressMatch) {
    return timestampPartsToSeconds(
      finalProgressMatch[1],
      finalProgressMatch[2],
      finalProgressMatch[3],
      finalProgressMatch[4]
    )
  }

  return null
}

function timestampPartsToSeconds(hoursRaw: string, minutesRaw: string, secondsRaw: string, fractionalRaw: string): number {
  const hours = parseInt(hoursRaw, 10)
  const minutes = parseInt(minutesRaw, 10)
  const seconds = parseInt(secondsRaw, 10)
  const fractional = parseInt(fractionalRaw, 10) / 10 ** fractionalRaw.length

  return hours * 3600 + minutes * 60 + seconds + fractional
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
  const VOXTRAL_LIMIT = 25 * 1024 * 1024
  const id = randomUUID()
  const inputPath = join(tmpdir(), `pep-split-in-${id}`)
  const chunkPaths: string[] = []

  try {
    await writeFile(inputPath, inputBuffer)

    const durationSec = await getAudioDuration(inputPath)
    const sizeMb = (inputBuffer.length / 1024 / 1024).toFixed(1)
    console.log(`[split-audio] Input: ${sizeMb}MB, ${(durationSec / 60).toFixed(1)} minutes`)

    // Short files under the size limit can go straight to Voxtral.
    // Duration still matters: long low-bitrate recordings can be <25MB but
    // still need chunking to avoid provider-side capacity/rate-limit failures.
    if (inputBuffer.length < VOXTRAL_LIMIT && durationSec <= CHUNK_DURATION_SEC) {
      console.log('[split-audio] Under 25MB and under 45 minutes — skipping ffmpeg')
      return [{ buffer: inputBuffer, startOffsetSec: 0 }]
    }

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
