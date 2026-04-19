-- Add an "other" kind so drivers can track reminders that don't fit
-- the built-in document set (annual truck wash, tire rotation, tag
-- renewal, etc.). The notes column already captures the user-typed
-- description, so no new column is needed.

alter type compliance_kind add value if not exists 'other';

notify pgrst, 'reload schema';
