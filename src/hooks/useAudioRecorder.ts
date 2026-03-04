'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  saveMetadata,
  saveChunk,
  getRecoverySessions,
  rebuildBlob,
  clearSession,
  type RecordingMetadata,
} from '@/lib/recording-store'

export type RecorderState =
  | 'idle'
  | 'requesting-mic'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'stopped'

type AudioDevice = { deviceId: string; label: string }

function negotiateMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  // Prefer webm/opus (Chrome, Firefox), fall back to mp4 (Safari)
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return '' // let browser pick default
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0) // seconds
  const [audioLevel, setAudioLevel] = useState(0) // 0-100
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null)
  const [mimeType, setMimeType] = useState('')
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [recoverySessions, setRecoverySessions] = useState<RecordingMetadata[]>([])

  // Refs for things we need in callbacks but don't want to trigger re-renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)
  const pauseStartRef = useRef<number>(0)
  const chunkIndexRef = useRef<number>(0)
  const sessionIdRef = useRef<string>('')
  const chunksRef = useRef<Blob[]>([])

  // Check for recovery sessions on mount
  useEffect(() => {
    getRecoverySessions()
      .then(setRecoverySessions)
      .catch(() => {}) // IndexedDB might not be available
  }, [])

  // Enumerate mic devices
  useEffect(() => {
    async function enumerate() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mics = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`,
          }))
        setAudioDevices(mics)
        if (mics.length === 1) setSelectedDeviceId(mics[0].deviceId)
      } catch {
        // Permission not yet granted — labels will be empty until mic is accessed
      }
    }
    enumerate()
  }, [])

  // Audio level animation loop
  const startLevelMonitor = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.fftSize)
    function tick() {
      analyser.getByteTimeDomainData(data)
      // RMS calculation
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      setAudioLevel(Math.min(100, Math.round(rms * 300)))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const stopLevelMonitor = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }
    setAudioLevel(0)
  }, [])

  // Duration timer — wall-clock based
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    pausedDurationRef.current = 0
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current
      setDuration(Math.floor(elapsed / 1000))
    }, 250)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    stopLevelMonitor()
    stopTimer()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    mediaRecorderRef.current = null
  }, [stopLevelMonitor, stopTimer])

  const startRecording = useCallback(
    async (metadata: {
      title: string
      meetingType: string
      meetingDate: string
      classIds: string[]
      notes: string
    }) => {
      setError(null)

      // Check browser support
      if (typeof MediaRecorder === 'undefined') {
        setError('Your browser does not support audio recording.')
        return
      }

      setState('requesting-mic')

      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : true,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream

        // Re-enumerate devices now that we have permission (labels will be populated)
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mics = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`,
          }))
        setAudioDevices(mics)

        // Audio level analyser
        const audioCtx = new AudioContext()
        audioContextRef.current = audioCtx
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        analyserRef.current = analyser

        // Negotiate MIME
        const mime = negotiateMime()
        setMimeType(mime)

        // Session ID for IndexedDB
        const sessionId = `rec-${Date.now()}`
        sessionIdRef.current = sessionId
        chunkIndexRef.current = 0
        chunksRef.current = []

        // Save metadata to IndexedDB for crash recovery
        await saveMetadata({
          sessionId,
          title: metadata.title,
          meetingType: metadata.meetingType,
          meetingDate: metadata.meetingDate,
          classIds: metadata.classIds,
          notes: metadata.notes,
          mimeType: mime,
          startedAt: Date.now(),
        }).catch(() => {}) // Non-fatal if IDB fails

        // Create MediaRecorder
        const recorder = new MediaRecorder(stream, {
          mimeType: mime || undefined,
          audioBitsPerSecond: 48_000,
        })
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data)
            const idx = chunkIndexRef.current++
            // Save to IndexedDB (fire-and-forget but catch errors)
            saveChunk(sessionId, idx, e.data).catch(() => {})
          }
        }

        recorder.onerror = () => {
          setError('Recording error occurred. Please try again.')
          cleanup()
          setState('idle')
        }

        recorder.onstop = () => {
          // Build final blob from all chunks
          const blob = new Blob(chunksRef.current, {
            type: mime || 'audio/webm',
          })
          setFinalBlob(blob)
          cleanup()
          setState('stopped')
        }

        // Start recording — fire ondataavailable every 10 seconds
        recorder.start(10_000)
        startLevelMonitor(analyser)
        startTimer()
        setState('recording')
      } catch (err) {
        cleanup()
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setError(
            'Microphone access was denied. Please allow microphone access in your browser settings and try again.'
          )
        } else if (
          err instanceof DOMException &&
          err.name === 'NotFoundError'
        ) {
          setError('No microphone found. Please connect a microphone and try again.')
        } else {
          setError('Could not start recording. Please try again.')
        }
        setState('idle')
      }
    },
    [selectedDeviceId, cleanup, startLevelMonitor, startTimer]
  )

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      pauseStartRef.current = Date.now()
      stopLevelMonitor()
      setState('paused')
    }
  }, [stopLevelMonitor])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      pausedDurationRef.current += Date.now() - pauseStartRef.current
      mediaRecorderRef.current.resume()
      if (analyserRef.current) startLevelMonitor(analyserRef.current)
      setState('recording')
    }
  }, [startLevelMonitor])

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      // Request any remaining data
      mediaRecorderRef.current.requestData()
      mediaRecorderRef.current.stop()
      stopTimer()
      stopLevelMonitor()
      // onstop handler will set state to 'stopped' and build the blob
    }
  }, [stopTimer, stopLevelMonitor])

  const discardRecording = useCallback(() => {
    cleanup()
    setFinalBlob(null)
    setDuration(0)
    if (sessionIdRef.current) {
      clearSession(sessionIdRef.current).catch(() => {})
    }
    setState('idle')
  }, [cleanup])

  const recoverSession = useCallback(
    async (sessionId: string) => {
      try {
        const blob = await rebuildBlob(sessionId)
        if (!blob || blob.size === 0) {
          setError('Recovery failed — no audio data found.')
          await clearSession(sessionId).catch(() => {})
          setRecoverySessions((prev) =>
            prev.filter((s) => s.sessionId !== sessionId)
          )
          return null
        }
        // Get the metadata for mimeType
        const sessions = await getRecoverySessions()
        const meta = sessions.find((s) => s.sessionId === sessionId)
        if (meta) setMimeType(meta.mimeType)
        sessionIdRef.current = sessionId
        setFinalBlob(blob)
        setState('stopped')
        return meta || null
      } catch {
        setError('Could not recover recording.')
        return null
      }
    },
    []
  )

  const discardRecoverySession = useCallback(async (sessionId: string) => {
    await clearSession(sessionId).catch(() => {})
    setRecoverySessions((prev) =>
      prev.filter((s) => s.sessionId !== sessionId)
    )
  }, [])

  const clearCurrentSession = useCallback(() => {
    if (sessionIdRef.current) {
      clearSession(sessionIdRef.current).catch(() => {})
    }
    setFinalBlob(null)
    setDuration(0)
    setState('idle')
  }, [])

  return {
    state,
    error,
    setError,
    duration,
    audioLevel,
    finalBlob,
    mimeType,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    recoverySessions,
    recoverSession,
    discardRecoverySession,
    clearCurrentSession,
  }
}
