-- A notice to the cohort is the most common thing a coordinator posts, and it
-- was landing under "Other". Postgres cannot add an enum value inside a
-- transaction block in older versions, so this runs as its own statement;
-- IF NOT EXISTS keeps a re-run harmless.
ALTER TYPE "ResourceCategory" ADD VALUE IF NOT EXISTS 'announcement';
