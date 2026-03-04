-- Migration 002: Enhanced summary with sentiment analysis
-- Run this in the Supabase SQL Editor

-- Add needs_attention flag to meetings
ALTER TABLE pep_meetings ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_meetings_needs_attention ON pep_meetings(needs_attention) WHERE needs_attention = true;

-- Add topic_sections and overall_sentiment to summaries
-- topic_sections: JSONB array of { topic, summary, sentiment }
-- overall_sentiment: text label for the whole meeting
ALTER TABLE pep_meeting_summaries ADD COLUMN IF NOT EXISTS topic_sections JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pep_meeting_summaries ADD COLUMN IF NOT EXISTS overall_sentiment TEXT;
