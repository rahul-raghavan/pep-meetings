-- Migration 006: Allow meetings to belong to multiple classes
-- Changes from single class_id on pep_meetings to a junction table pep_meeting_classes.

-- 1. Create the junction table
CREATE TABLE IF NOT EXISTS pep_meeting_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES pep_meetings(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES pep_classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_classes_meeting ON pep_meeting_classes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_classes_class ON pep_meeting_classes(class_id);

-- 2. Migrate existing data (only if the old class_id column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pep_meetings' AND column_name = 'class_id'
  ) THEN
    INSERT INTO pep_meeting_classes (meeting_id, class_id)
    SELECT id, class_id FROM pep_meetings WHERE class_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3. Drop ALL old policies that reference class_id (must happen BEFORE dropping the column)

-- Policies on pep_meetings
DROP POLICY IF EXISTS "Users can see meetings in their classes" ON pep_meetings;
DROP POLICY IF EXISTS "Users can update meetings in their classes" ON pep_meetings;

-- Policies on pep_meeting_participants
DROP POLICY IF EXISTS "Users can read participants of visible meetings" ON pep_meeting_participants;
DROP POLICY IF EXISTS "Users can manage participants of visible meetings" ON pep_meeting_participants;

-- Policies on pep_transcript_segments
DROP POLICY IF EXISTS "Users can read segments of visible meetings" ON pep_transcript_segments;
DROP POLICY IF EXISTS "Users can manage segments of visible meetings" ON pep_transcript_segments;

-- Policies on pep_action_items
DROP POLICY IF EXISTS "Users can read action items of visible meetings" ON pep_action_items;
DROP POLICY IF EXISTS "Users can manage action items of visible meetings" ON pep_action_items;

-- Policies on pep_meeting_summaries
DROP POLICY IF EXISTS "Users can read summaries of visible meetings" ON pep_meeting_summaries;
DROP POLICY IF EXISTS "Users can manage summaries of visible meetings" ON pep_meeting_summaries;

-- 4. Drop the old function (takes UUID arg) and the old column
DROP FUNCTION IF EXISTS pep_can_see_meeting(UUID);
ALTER TABLE pep_meetings DROP COLUMN IF EXISTS class_id;

-- Also drop the old index (no longer relevant)
DROP INDEX IF EXISTS idx_meetings_class_id;

-- 5. Create the new RLS helper function (takes meeting_id, checks junction table)
CREATE OR REPLACE FUNCTION pep_can_see_meeting(p_meeting_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- super_admin sees all
  IF pep_current_user_role() = 'super_admin' THEN RETURN TRUE; END IF;
  -- Check if meeting has any classes the user belongs to
  RETURN EXISTS (
    SELECT 1 FROM pep_meeting_classes mc
    JOIN pep_user_classes uc ON uc.class_id = mc.class_id
    WHERE mc.meeting_id = p_meeting_id
    AND uc.user_id = pep_current_user_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 6. Recreate ALL policies using the new junction-table-based function
--    (DROP first in case a previous partial run already created some)

-- pep_meetings
DROP POLICY IF EXISTS "Users can see meetings in their classes" ON pep_meetings;
CREATE POLICY "Users can see meetings in their classes"
  ON pep_meetings FOR SELECT
  USING (pep_can_see_meeting(id));

DROP POLICY IF EXISTS "Users can update meetings in their classes" ON pep_meetings;
CREATE POLICY "Users can update meetings in their classes"
  ON pep_meetings FOR UPDATE
  USING (pep_can_see_meeting(id));

-- pep_meeting_participants
DROP POLICY IF EXISTS "Users can read participants of visible meetings" ON pep_meeting_participants;
CREATE POLICY "Users can read participants of visible meetings"
  ON pep_meeting_participants FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

DROP POLICY IF EXISTS "Users can manage participants of visible meetings" ON pep_meeting_participants;
CREATE POLICY "Users can manage participants of visible meetings"
  ON pep_meeting_participants FOR ALL
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

-- pep_transcript_segments
DROP POLICY IF EXISTS "Users can read segments of visible meetings" ON pep_transcript_segments;
CREATE POLICY "Users can read segments of visible meetings"
  ON pep_transcript_segments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

DROP POLICY IF EXISTS "Users can manage segments of visible meetings" ON pep_transcript_segments;
CREATE POLICY "Users can manage segments of visible meetings"
  ON pep_transcript_segments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

-- pep_action_items
DROP POLICY IF EXISTS "Users can read action items of visible meetings" ON pep_action_items;
CREATE POLICY "Users can read action items of visible meetings"
  ON pep_action_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

DROP POLICY IF EXISTS "Users can manage action items of visible meetings" ON pep_action_items;
CREATE POLICY "Users can manage action items of visible meetings"
  ON pep_action_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

-- pep_meeting_summaries
DROP POLICY IF EXISTS "Users can read summaries of visible meetings" ON pep_meeting_summaries;
CREATE POLICY "Users can read summaries of visible meetings"
  ON pep_meeting_summaries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

DROP POLICY IF EXISTS "Users can manage summaries of visible meetings" ON pep_meeting_summaries;
CREATE POLICY "Users can manage summaries of visible meetings"
  ON pep_meeting_summaries FOR ALL
  USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.id))
  );

-- 7. RLS on the new junction table itself
ALTER TABLE pep_meeting_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see meeting-class links" ON pep_meeting_classes;
CREATE POLICY "Users can see meeting-class links"
  ON pep_meeting_classes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

DROP POLICY IF EXISTS "Admins can manage meeting-class links" ON pep_meeting_classes;
CREATE POLICY "Admins can manage meeting-class links"
  ON pep_meeting_classes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM pep_meeting_users u
      WHERE u.auth_id = auth.uid() AND u.is_active = true
      AND u.role IN ('admin', 'super_admin')
    )
  );
