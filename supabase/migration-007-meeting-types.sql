-- Migration 007: Add 'hr' and 'internal' meeting types

ALTER TABLE pep_meetings DROP CONSTRAINT IF EXISTS pep_meetings_meeting_type_check;
ALTER TABLE pep_meetings ADD CONSTRAINT pep_meetings_meeting_type_check
  CHECK (meeting_type IN ('parent_teacher', 'admission', 'training', 'hr', 'internal', 'other'));
