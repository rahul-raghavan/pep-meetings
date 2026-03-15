/**
 * IndexedDB wrapper for crash-recovery of in-progress recordings.
 * Chunks are saved every ~10s so if the browser/tab crashes, we can rebuild the audio.
 */

import type { ThreadOption } from '@/lib/meeting-threads'

const DB_NAME = 'pep-recordings'
const DB_VERSION = 1
const CHUNKS_STORE = 'chunks'
const META_STORE = 'metadata'

export type RecordingMetadata = {
  sessionId: string
  title: string
  meetingType: string
  meetingDate: string
  classIds: string[]
  notes: string
  threadMeeting: ThreadOption | null
  mimeType: string
  startedAt: number // timestamp
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        db.createObjectStore(CHUNKS_STORE, { keyPath: ['sessionId', 'index'] })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'sessionId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveMetadata(meta: RecordingMetadata): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put(meta)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveChunk(
  sessionId: string,
  index: number,
  data: Blob
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readwrite')
    tx.objectStore(CHUNKS_STORE).put({ sessionId, index, data })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getRecoverySessions(): Promise<RecordingMetadata[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function rebuildBlob(sessionId: string): Promise<Blob | null> {
  const db = await openDB()
  const meta = await new Promise<RecordingMetadata | undefined>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get(sessionId)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (!meta) return null

  // Use IDBKeyRange to query only this session's chunks (key is [sessionId, index])
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity])
  const sessionChunks = await new Promise<{ sessionId: string; index: number; data: Blob }[]>(
    (resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, 'readonly')
      const req = tx.objectStore(CHUNKS_STORE).getAll(range)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }
  )

  // Already sorted by key, but ensure order
  sessionChunks.sort((a, b) => a.index - b.index)

  if (sessionChunks.length === 0) return null

  return new Blob(
    sessionChunks.map((c) => c.data),
    { type: meta.mimeType }
  )
}

export async function clearSession(sessionId: string): Promise<void> {
  const db = await openDB()

  // Delete metadata
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).delete(sessionId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  // Delete all chunks for this session using key range
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity])
  const chunks = await new Promise<{ sessionId: string; index: number }[]>(
    (resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, 'readonly')
      const req = tx.objectStore(CHUNKS_STORE).getAllKeys(range)
      req.onsuccess = () =>
        resolve(req.result.map((key) => {
          const [sid, idx] = key as unknown as [string, number]
          return { sessionId: sid, index: idx }
        }))
      req.onerror = () => reject(req.error)
    }
  )

  if (chunks.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, 'readwrite')
      const store = tx.objectStore(CHUNKS_STORE)
      for (const chunk of chunks) {
        store.delete([chunk.sessionId, chunk.index])
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}
