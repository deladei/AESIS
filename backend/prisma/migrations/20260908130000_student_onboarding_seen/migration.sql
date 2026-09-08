-- First-run logbook walkthrough: remember who has already seen it.
--
-- Null means "has not finished the walkthrough", so it is shown on the next
-- sign-in. This lives on the server rather than in localStorage so it does not
-- reappear when a student opens the app on a different device or browser.
--
-- Additive and nullable, so every existing row is untouched and reads as
-- "not yet seen". That is the right default for a walkthrough nobody has been
-- offered yet: the students already enrolled get it once, then never again.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarded_at" TIMESTAMP(3);
