-- Release guard for final grades — DB teeth, same philosophy as the
-- assessment-token verification trigger: the app layer already enforces these
-- rules, but for an examinable unit worth 100 marks no application code path
-- (present or future) may be able to
--   1. release a grade that was never signed off,
--   2. release a grade with a missing component (the industry supervisor who
--      never returned the form is the likely real case — silently releasing a
--      total computed from three of four components is the worst failure), or
--   3. change ANY column of a released grade. A released grade is terminal;
--      correcting it means a new release process, not a quiet UPDATE.

CREATE OR REPLACE FUNCTION fn_final_grade_release_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'released' THEN
    RAISE EXCEPTION 'released final grade is immutable';
  END IF;

  IF NEW.status = 'released' THEN
    IF NEW.signed_off_by_id IS NULL THEN
      RAISE EXCEPTION 'cannot release: grade was not signed off';
    END IF;
    IF NEW.industry_weighted   IS NULL
    OR NEW.university_weighted IS NULL
    OR NEW.report_weighted     IS NULL
    OR NEW.logbook_weighted    IS NULL
    OR NEW.total               IS NULL THEN
      RAISE EXCEPTION 'cannot release: a grade component is missing';
    END IF;
    IF NEW.released_at IS NULL THEN
      NEW.released_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_final_grade_release_guard ON "final_grades";
CREATE TRIGGER trg_final_grade_release_guard
  BEFORE UPDATE ON "final_grades"
  FOR EACH ROW
  EXECUTE FUNCTION fn_final_grade_release_guard();

-- INSERT cannot skip the gate either: a row may not be born released.
CREATE OR REPLACE FUNCTION fn_final_grade_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'released' THEN
    RAISE EXCEPTION 'a final grade cannot be created already released';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_final_grade_insert_guard ON "final_grades";
CREATE TRIGGER trg_final_grade_insert_guard
  BEFORE INSERT ON "final_grades"
  FOR EACH ROW
  EXECUTE FUNCTION fn_final_grade_insert_guard();
