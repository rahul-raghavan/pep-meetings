-- Migration 011: Add category column to action items for logical grouping
ALTER TABLE pep_action_items
ADD COLUMN IF NOT EXISTS category TEXT;
