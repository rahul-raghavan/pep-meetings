import { inspect } from 'node:util'

import { processMeeting } from '../lib/process-meeting'
import { createAdminClient } from '../lib/supabase-admin'

const POLL_INTERVAL_MS = parseInt(process.env.MEETING_WORKER_POLL_MS || '5000', 10)
const ERROR_DELAY_MS = parseInt(process.env.MEETING_WORKER_ERROR_MS || '15000', 10)
const CONCURRENCY = Math.max(1, parseInt(process.env.MEETING_WORKER_CONCURRENCY || '1', 10))

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function claimNextMeeting() {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('pep_claim_next_meeting')
  if (error) {
    console.error('[meeting-worker] claimNextMeeting RPC error', inspect(error, { depth: null, colors: false }))
    throw error
  }

  const row = Array.isArray(data) ? data[0] : null
  return row?.id as string | null
}

async function workerLoop(workerName: string) {
  for (;;) {
    try {
      const meetingId = await claimNextMeeting()
      if (!meetingId) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      console.log(`[meeting-worker:${workerName}] Claimed ${meetingId}`)
      const supabase = createAdminClient()
      const result = await processMeeting(meetingId, supabase)
      console.log(`[meeting-worker:${workerName}] ${meetingId} -> ${result.state}`)
    } catch (err) {
      const message = err instanceof Error
        ? `${err.message}\n${err.stack || ''}`
        : inspect(err, { depth: null, colors: false })
      console.error(`[meeting-worker:${workerName}] ${message}`)
      await sleep(ERROR_DELAY_MS)
    }
  }
}

async function main() {
  console.log(`[meeting-worker] Starting with concurrency=${CONCURRENCY}`)
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => workerLoop(String(i + 1)))
  )
}

main().catch((err) => {
  console.error('[meeting-worker] Fatal error', inspect(err, { depth: null, colors: false }))
  process.exit(1)
})
