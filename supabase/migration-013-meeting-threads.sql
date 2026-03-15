-- Migration 013: Meeting threads
-- Adds optional thread grouping so related meetings can be linked visually now
-- and summarized together later.

CREATE TABLE IF NOT EXISTS pep_meeting_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  created_by UUID NOT NULL REFERENCES pep_meeting_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pep_meeting_threads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pep_meetings' AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE pep_meetings
      ADD COLUMN thread_id UUID REFERENCES pep_meeting_threads(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meeting_threads_created_by ON pep_meeting_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_thread_id ON pep_meetings(thread_id);

DROP TRIGGER IF EXISTS update_meeting_threads_updated_at ON pep_meeting_threads;
CREATE TRIGGER update_meeting_threads_updated_at
  BEFORE UPDATE ON pep_meeting_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  DROP POLICY IF EXISTS "Active users can read meeting threads" ON pep_meeting_threads;
  DROP POLICY IF EXISTS "Active users can insert meeting threads" ON pep_meeting_threads;
  DROP POLICY IF EXISTS "Active users can update meeting threads" ON pep_meeting_threads;
END $$;

CREATE POLICY "Active users can read meeting threads" ON pep_meeting_threads
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can insert meeting threads" ON pep_meeting_threads
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can update meeting threads" ON pep_meeting_threads
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );
