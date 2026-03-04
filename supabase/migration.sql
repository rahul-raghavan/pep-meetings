-- PEP Meetings Database Migration
-- Safe to run on a shared Supabase database (pepopslog, pep-tasks, etc.)
-- All table names are prefixed to avoid conflicts

-- 1. pep_meeting_users — staff accounts
CREATE TABLE IF NOT EXISTS pep_meeting_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  auth_id UUID UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_users_auth_id ON pep_meeting_users(auth_id);
CREATE INDEX IF NOT EXISTS idx_meeting_users_email ON pep_meeting_users(email);

-- 2. pep_meetings — one row per meeting
CREATE TABLE IF NOT EXISTS pep_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'other' CHECK (meeting_type IN ('parent_teacher', 'admission', 'training', 'other')),
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID NOT NULL REFERENCES pep_meeting_users(id),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'completed', 'failed')),
  error_message TEXT,
  audio_storage_path TEXT,
  audio_file_size BIGINT,
  audio_mime_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_recorded_by ON pep_meetings(recorded_by);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON pep_meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_date ON pep_meetings(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_type ON pep_meetings(meeting_type);

-- 3. pep_meeting_participants — speaker label mapping
CREATE TABLE IF NOT EXISTS pep_meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES pep_meetings(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  display_name TEXT,
  role TEXT CHECK (role IN ('parent', 'teacher', 'student', 'admin', 'counselor', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, speaker_label)
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting_id ON pep_meeting_participants(meeting_id);

-- 4. pep_transcript_segments — every diarized segment
CREATE TABLE IF NOT EXISTS pep_transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES pep_meetings(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  text TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  segment_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_segments_meeting_id ON pep_transcript_segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_segments_meeting_order ON pep_transcript_segments(meeting_id, segment_index);

-- 5. pep_action_items — extracted + manually added
CREATE TABLE IF NOT EXISTS pep_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES pep_meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  assigned_to TEXT,
  due_date DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  source_segment_index INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id ON pep_action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_completed ON pep_action_items(is_completed);

-- 6. pep_meeting_summaries — AI-generated summary
CREATE TABLE IF NOT EXISTS pep_meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE NOT NULL REFERENCES pep_meetings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_decisions JSONB DEFAULT '[]'::jsonb,
  raw_llm_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_summaries_meeting_id ON pep_meeting_summaries(meeting_id);

-- Auto-update updated_at trigger function (safe to re-run — uses CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers first so this migration is re-runnable
DROP TRIGGER IF EXISTS update_meeting_users_updated_at ON pep_meeting_users;
DROP TRIGGER IF EXISTS update_meetings_updated_at ON pep_meetings;
DROP TRIGGER IF EXISTS update_participants_updated_at ON pep_meeting_participants;
DROP TRIGGER IF EXISTS update_action_items_updated_at ON pep_action_items;
DROP TRIGGER IF EXISTS update_summaries_updated_at ON pep_meeting_summaries;

CREATE TRIGGER update_meeting_users_updated_at BEFORE UPDATE ON pep_meeting_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON pep_meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON pep_meeting_participants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_action_items_updated_at BEFORE UPDATE ON pep_action_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_summaries_updated_at BEFORE UPDATE ON pep_meeting_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE pep_meeting_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_meeting_summaries ENABLE ROW LEVEL SECURITY;

-- Drop policies first so this migration is re-runnable
DO $$ BEGIN
  DROP POLICY IF EXISTS "Active users can read all" ON pep_meeting_users;
  DROP POLICY IF EXISTS "Authenticated users can read all" ON pep_meeting_users;
  DROP POLICY IF EXISTS "Active users can read meetings" ON pep_meetings;
  DROP POLICY IF EXISTS "Active users can insert meetings" ON pep_meetings;
  DROP POLICY IF EXISTS "Active users can update meetings" ON pep_meetings;
  DROP POLICY IF EXISTS "Active users can read participants" ON pep_meeting_participants;
  DROP POLICY IF EXISTS "Active users can manage participants" ON pep_meeting_participants;
  DROP POLICY IF EXISTS "Active users can read segments" ON pep_transcript_segments;
  DROP POLICY IF EXISTS "Active users can manage segments" ON pep_transcript_segments;
  DROP POLICY IF EXISTS "Active users can read action items" ON pep_action_items;
  DROP POLICY IF EXISTS "Active users can manage action items" ON pep_action_items;
  DROP POLICY IF EXISTS "Active users can read summaries" ON pep_meeting_summaries;
  DROP POLICY IF EXISTS "Active users can manage summaries" ON pep_meeting_summaries;
END $$;

-- Authenticated users can read the users table (can't self-reference this table in its own policy)
CREATE POLICY "Authenticated users can read all" ON pep_meeting_users
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Active users can read meetings" ON pep_meetings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can insert meetings" ON pep_meetings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can update meetings" ON pep_meetings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can read participants" ON pep_meeting_participants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can manage participants" ON pep_meeting_participants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can read segments" ON pep_transcript_segments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can manage segments" ON pep_transcript_segments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can read action items" ON pep_action_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can manage action items" ON pep_action_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can read summaries" ON pep_meeting_summaries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

CREATE POLICY "Active users can manage summaries" ON pep_meeting_summaries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM pep_meeting_users u WHERE u.auth_id = auth.uid() AND u.is_active = true)
  );

-- Create Supabase Storage bucket for meeting audio (ignore if already exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-audio', 'meeting-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop first so re-runnable)
DROP POLICY IF EXISTS "Authenticated users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read audio" ON storage.objects;

CREATE POLICY "Authenticated users can upload audio" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-audio');

CREATE POLICY "Authenticated users can read audio" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'meeting-audio');
