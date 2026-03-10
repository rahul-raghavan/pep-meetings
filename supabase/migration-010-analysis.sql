-- Migration 010: Add deep analysis column to meeting summaries
ALTER TABLE pep_meeting_summaries
ADD COLUMN IF NOT EXISTS analysis JSONB;
