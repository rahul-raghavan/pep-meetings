-- Migration 005: Allow pre-created users (invited by super_admin before they sign in)
-- auth_id becomes nullable so a user record can exist before their first Google sign-in.
-- When they sign in, the callback will match by email and fill in auth_id.

ALTER TABLE pep_meeting_users ALTER COLUMN auth_id DROP NOT NULL;
