-- PEP Meetings — Migration 004: Restructure campuses → locations
-- Campuses are now physical locations (HSR, Whitefield, etc.), NOT email domains.
-- Email domain validation stays in app code only.

-- ============================================================
-- 1. CLEAR FK REFERENCES to old campus rows
-- ============================================================

-- Null out campus_id on users (will be reassigned by super_admin)
UPDATE pep_meeting_users SET campus_id = NULL;

-- pep_classes should be empty at this point, but clear just in case
DELETE FROM pep_user_classes;
DELETE FROM pep_classes;

-- ============================================================
-- 2. DELETE old domain-based campus rows
-- ============================================================
DELETE FROM pep_campuses;

-- ============================================================
-- 3. DROP the domain column (no longer relevant)
-- ============================================================
ALTER TABLE pep_campuses DROP COLUMN IF EXISTS domain;

-- ============================================================
-- 4. SEED with location-based campuses
-- ============================================================
INSERT INTO pep_campuses (name) VALUES
  ('HSR'),
  ('Whitefield'),
  ('Sarjapura'),
  ('Varthur'),
  ('Kokapet');

-- ============================================================
-- 5. Make class names unique within a campus (not globally)
-- ============================================================
-- Drop the global unique constraint on class name
ALTER TABLE pep_classes DROP CONSTRAINT IF EXISTS pep_classes_name_key;

-- Add a composite unique constraint (campus_id + name)
ALTER TABLE pep_classes ADD CONSTRAINT pep_classes_campus_name_unique UNIQUE (campus_id, name);
