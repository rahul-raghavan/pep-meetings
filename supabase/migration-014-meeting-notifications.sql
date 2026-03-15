-- Migration 014: Per-user meeting notification state
-- Tracks when each user last cleared "new meeting" notifications.

CREATE TABLE IF NOT EXISTS pep_meeting_notification_state (
  user_id UUID PRIMARY KEY REFERENCES pep_meeting_users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pep_meeting_notification_state ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_meeting_notification_state_updated_at ON pep_meeting_notification_state;
CREATE TRIGGER update_meeting_notification_state_updated_at
  BEFORE UPDATE ON pep_meeting_notification_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  DROP POLICY IF EXISTS "Active users can read notification state" ON pep_meeting_notification_state;
  DROP POLICY IF EXISTS "Active users can insert notification state" ON pep_meeting_notification_state;
  DROP POLICY IF EXISTS "Active users can update notification state" ON pep_meeting_notification_state;
END $$;

CREATE POLICY "Active users can read notification state" ON pep_meeting_notification_state
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can insert notification state" ON pep_meeting_notification_state
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can update notification state" ON pep_meeting_notification_state
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );
