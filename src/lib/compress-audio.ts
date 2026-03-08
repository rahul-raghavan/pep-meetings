import { execFile } from 'child_process'
import { writeFile, unlink, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// Use ffmpeg-static if available, otherwise fall back to system ffmpeg (e.g. on Railway)
let ffmpegPath: string
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ffmpegPath = require('ffmpeg-static')
} catch {
  ffmpegPath = 'ffmpeg'
}

const COMPRESSION_THRESHOLD = 10 * 1024 * 1024 // 10MB
const SUPABASE_FILE_LIMIT = 50 * 1024 * 1024 // 50MB

export function shouldCompress(size: number): boolean {
  return size > COMPRESSION_THRESHOLD
}

/**
 * Compress audio to 48kbps mono MP3 using ffmpeg.
 * Optimized for speech: mono, 16kHz sample rate, low bitrate.
 * A 72MB file typically compresses to ~10-15MB.
 */
export async function compressAudio(
  inputBuffer: Buffer,
  originalName: string
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const id = randomUUID()
  const inputPath = join(tmpdir(), `pep-audio-in-${id}`)
  const outputPath = join(tmpdir(), `pep-audio-out-${id}.mp3`)

  try {
    await writeFile(inputPath, inputBuffer)

    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegPath,
        [
          '-i', inputPath,
          '-vn',        // strip video (some containers like .mpeg have video tracks)
          '-ac', '1',   // mono — speech doesn't need stereo
          '-ar', '16000', // 16kHz sample rate — optimal for speech recognition
          '-ab', '48k', // 48kbps bitrate — plenty for voice
          '-f', 'mp3',  // output as MP3
          '-y',         // overwrite output if exists
          outputPath,
        ],
        { timeout: 120_000 }, // 2 minute timeout
        (error, _stdout, stderr) => {
          if (error) {
            console.error(`[compress-audio] ffmpeg failed for ${originalName}:`, stderr)
            reject(new Error(`ffmpeg compression failed: ${error.message}`))
          } else {
            resolve()
          }
        }
      )
    })

    const compressedBuffer = await readFile(outputPath)
    const ratio = ((1 - compressedBuffer.length / inputBuffer.length) * 100).toFixed(1)
    console.log(
      `[compress-audio] ${originalName}: ${(inputBuffer.length / 1024 / 1024).toFixed(1)}MB → ${(compressedBuffer.length / 1024 / 1024).toFixed(1)}MB (${ratio}% reduction)`
    )

    return {
      buffer: compressedBuffer,
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    }
  } finally {
    // Clean up temp files no matter what
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}

export { SUPABASE_FILE_LIMIT }
