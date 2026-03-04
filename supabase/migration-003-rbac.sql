-- PEP Meetings — Migration 003: RBAC (Campuses, Classes, Roles)
-- Safe to re-run (uses IF NOT EXISTS, DROP IF EXISTS, etc.)

-- ============================================================
-- 1. NEW TABLES
-- ============================================================

-- pep_campuses — one row per school campus
CREATE TABLE IF NOT EXISTS pep_campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 3 campuses
INSERT INTO pep_campuses (name, domain) VALUES
  ('PEP School', 'pepschoolv2.com'),
  ('Accel School', 'accelschool.in'),
  ('Ribbons', 'ribbons.education')
ON CONFLICT (domain) DO NOTHING;

-- pep_classes — e.g., "Butterfly", "Sunshine"
CREATE TABLE IF NOT EXISTS pep_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES pep_campuses(id),
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classes_campus_id ON pep_classes(campus_id);

-- pep_user_classes — many-to-many link between users and classes
CREATE TABLE IF NOT EXISTS pep_user_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES pep_meeting_users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES pep_classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_user_classes_user_id ON pep_user_classes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_classes_class_id ON pep_user_classes(class_id);

-- ============================================================
-- 2. ALTER EXISTING TABLES
-- ============================================================

-- Add campus_id to pep_meeting_users (nullable initially for backfill)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pep_meeting_users' AND column_name = 'campus_id'
  ) THEN
    ALTER TABLE pep_meeting_users ADD COLUMN campus_id UUID REFERENCES pep_campuses(id);
  END IF;
END $$;

-- Change role CHECK constraint: rename 'staff' to 'user', add 'super_admin'
-- Drop old constraint FIRST, then update data, then add new constraint
ALTER TABLE pep_meeting_users DROP CONSTRAINT IF EXISTS pep_meeting_users_role_check;
UPDATE pep_meeting_users SET role = 'user' WHERE role = 'staff';
ALTER TABLE pep_meeting_users ADD CONSTRAINT pep_meeting_users_role_check
  CHECK (role IN ('super_admin', 'admin', 'user'));

-- Add class_id to pep_meetings (nullable — existing meetings start unassigned)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pep_meetings' AND column_name = 'class_id'
  ) THEN
    ALTER TABLE pep_meetings ADD COLUMN class_id UUID REFERENCES pep_classes(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_class_id ON pep_meetings(class_id);

-- ============================================================
-- 3. BACKFILL EXISTING DATA
-- ============================================================

-- Backfill campus_id from email domain
UPDATE pep_meeting_users u
SET campus_id = c.id
FROM pep_campuses c
WHERE u.campus_id IS NULL
  AND u.email LIKE '%@' || c.domain;

-- Bootstrap super_admin for rahul@pepschoolv2.com
UPDATE pep_meeting_users SET role = 'super_admin'
WHERE email = 'rahul@pepschoolv2.com';

-- ============================================================
-- 4. TRIGGERS for new tables
-- ============================================================

DROP TRIGGER IF EXISTS update_campuses_updated_at ON pep_campuses;
DROP TRIGGER IF EXISTS update_classes_updated_at ON pep_classes;

CREATE TRIGGER update_campuses_updated_at BEFORE UPDATE ON pep_campuses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON pep_classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. RLS HELPER FUNCTIONS
-- ============================================================

-- Get the pep_meeting_users.id for the current auth user
CREATE OR REPLACE FUNCTION pep_current_user_id() RETURNS UUID AS $$
  SELECT id FROM pep_meeting_users WHERE auth_id = auth.uid() AND is_active = true LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the role for the current auth user
CREATE OR REPLACE FUNCTION pep_current_user_role() RETURNS TEXT AS $$
  SELECT role FROM pep_meeting_users WHERE auth_id = auth.uid() AND is_active = true LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Can the current user see a meeting with the given class_id?
-- super_admin sees all. Others see meetings whose class_id is in their pep_user_classes.
-- NULL class_id -> super_admin only.
CREATE OR REPLACE FUNCTION pep_can_see_meeting(meeting_class_id UUID) RETURNS BOOLEAN AS $$
  SELECT
    CASE
      WHEN pep_current_user_role() = 'super_admin' THEN true
      WHEN meeting_class_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1 FROM pep_user_classes uc
        WHERE uc.user_id = pep_current_user_id()
          AND uc.class_id = meeting_class_id
      )
    END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 6. DROP OLD RLS POLICIES (re-runnable)
-- ============================================================

DO $$ BEGIN
  -- pep_meeting_users
  DROP POLICY IF EXISTS "Authenticated users can read all" ON pep_meeting_users;
  DROP POLICY IF EXISTS "Active users can read all" ON pep_meeting_users;

  -- pep_meetings
  DROP POLICY IF EXISTS "Active users can read meetings" ON pep_meetings;
  DROP POLICY IF EXISTS "Active users can insert meetings" ON pep_meetings;
  DROP POLICY IF EXISTS "Active users can update meetings" ON pep_meetings;

  -- pep_meeting_participants
  DROP POLICY IF EXISTS "Active users can read participants" ON pep_meeting_participants;
  DROP POLICY IF EXISTS "Active users can manage participants" ON pep_meeting_participants;

  -- pep_transcript_segments
  DROP POLICY IF EXISTS "Active users can read segments" ON pep_transcript_segments;
  DROP POLICY IF EXISTS "Active users can manage segments" ON pep_transcript_segments;

  -- pep_action_items
  DROP POLICY IF EXISTS "Active users can read action items" ON pep_action_items;
  DROP POLICY IF EXISTS "Active users can manage action items" ON pep_action_items;

  -- pep_meeting_summaries
  DROP POLICY IF EXISTS "Active users can read summaries" ON pep_meeting_summaries;
  DROP POLICY IF EXISTS "Active users can manage summaries" ON pep_meeting_summaries;

  -- New tables
  DROP POLICY IF EXISTS "Active users can read campuses" ON pep_campuses;
  DROP POLICY IF EXISTS "Active users can read classes" ON pep_classes;
  DROP POLICY IF EXISTS "Admins can manage classes" ON pep_classes;
  DROP POLICY IF EXISTS "Active users can read user_classes" ON pep_user_classes;
  DROP POLICY IF EXISTS "Admins can manage user_classes" ON pep_user_classes;
END $$;

-- ============================================================
-- 7. NEW RLS POLICIES
-- ============================================================

-- pep_meeting_users: authenticated users can read (needed for auth bootstrap)
CREATE POLICY "Authenticated users can read all" ON pep_meeting_users
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- pep_meetings: scoped by class
CREATE POLICY "Users can see meetings in their classes" ON pep_meetings
  FOR SELECT USING (pep_can_see_meeting(class_id));

CREATE POLICY "Active users can insert meetings" ON pep_meetings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Users can update meetings in their classes" ON pep_meetings
  FOR UPDATE USING (pep_can_see_meeting(class_id));

-- pep_meeting_participants: scoped through parent meeting
CREATE POLICY "Users can read participants of visible meetings" ON pep_meeting_participants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

CREATE POLICY "Users can manage participants of visible meetings" ON pep_meeting_participants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

-- pep_transcript_segments: scoped through parent meeting
CREATE POLICY "Users can read segments of visible meetings" ON pep_transcript_segments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

CREATE POLICY "Users can manage segments of visible meetings" ON pep_transcript_segments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

-- pep_action_items: scoped through parent meeting
CREATE POLICY "Users can read action items of visible meetings" ON pep_action_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

CREATE POLICY "Users can manage action items of visible meetings" ON pep_action_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

-- pep_meeting_summaries: scoped through parent meeting
CREATE POLICY "Users can read summaries of visible meetings" ON pep_meeting_summaries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

CREATE POLICY "Users can manage summaries of visible meetings" ON pep_meeting_summaries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meetings m WHERE m.id = meeting_id AND pep_can_see_meeting(m.class_id))
  );

-- pep_campuses: all active users can read
ALTER TABLE pep_campuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can read campuses" ON pep_campuses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

-- pep_classes: all active users can read, admins+ can manage
ALTER TABLE pep_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can read classes" ON pep_classes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Admins can manage classes" ON pep_classes
  FOR ALL USING (
    pep_current_user_role() IN ('super_admin', 'admin')
  );

-- pep_user_classes: all active users can read, admins+ can manage
ALTER TABLE pep_user_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can read user_classes" ON pep_user_classes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Admins can manage user_classes" ON pep_user_classes
  FOR ALL USING (
    pep_current_user_role() IN ('super_admin', 'admin')
  );
