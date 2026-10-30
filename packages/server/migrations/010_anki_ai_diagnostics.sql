-- Failure diagnostics are private to the check owner and absent on old records.
-- Keep score/result semantics unchanged: diagnostic excerpts are not valid evaluations.
ALTER TABLE anki_ai_checks ADD COLUMN diagnostic jsonb;
ALTER TABLE anki_ai_checks ADD CONSTRAINT anki_ai_diagnostic_object
 CHECK (diagnostic IS NULL OR (jsonb_typeof(diagnostic)='object' AND octet_length(diagnostic::text)<=131072));
ALTER TABLE anki_ai_checks ADD CONSTRAINT anki_ai_deleted_diagnostic_cleared
 CHECK (status<>'deleted' OR diagnostic IS NULL);
