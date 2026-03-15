-- Migration 012: Add queued/transcribing/analyzing states and worker metadata

ALTER TABLE pep_meetings
  DROP CONSTRAINT IF EXISTS pep_meetings_status_check;

ALTER TABLE pep_meetings
  ADD CONSTRAINT pep_meetings_status_check
  CHECK (status IN ('uploading', 'queued', 'transcribing', 'analyzing', 'completed', 'failed'));

ALTER TABLE pep_meetings
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meetings_queue_ready
  ON pep_meetings(status, next_retry_at, queued_at, created_at);

CREATE OR REPLACE FUNCTION pep_claim_next_meeting()
RETURNS TABLE (id UUID)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT m.id
    FROM pep_meetings m
    WHERE m.audio_storage_path IS NOT NULL
      AND (
        (
          m.status = 'queued'
          AND (m.next_retry_at IS NULL OR m.next_retry_at <= now())
        )
        OR (
          m.status IN ('transcribing', 'analyzing')
          AND m.processing_started_at < now() - interval '45 minutes'
        )
      )
    ORDER BY COALESCE(m.queued_at, m.created_at), m.created_at, m.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE pep_meetings m
    SET status = 'transcribing',
        processing_started_at = now(),
        error_message = NULL,
        attempt_count = COALESCE(m.attempt_count, 0) + 1
    FROM candidate
    WHERE m.id = candidate.id
    RETURNING m.id
  )
  SELECT claimed.id FROM claimed;
END;
$$;
