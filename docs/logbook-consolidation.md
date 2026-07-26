# Logbook consolidation — daily + weekly into one pipeline

> Design doc. Decided 2026-07-25 (S87). Execute in phases; each phase is its own commit and
> leaves the app working. Update the status column as phases land.

## Why

The repo grew three overlapping pipelines for the same thing — a student's record of work:

| Table | Module | Key | Holds | Fate |
|---|---|---|---|---|
| `logbook_submissions` | legacy `logbook/` | `(placementId, weekNumber)` | status, Mongo text ref, AI analysis, feedback | **retire** |
| `logbook_entry` | `entries/` | `(placementId, weekNumber)` | state machine, `entry_event` audit, enrichment, objectives, grading | **keep — the spine** |
| `entry_days` | `entries/` | `(entryId, date)` | day status + `logged_late`, **no content** | **absorb into `daily_entry`** |
| `daily_entry` | `siwes/` | `(studentId, workDate)` | day content (work done, skills, sketch) | **keep — becomes the week's child** |
| `weekly_summary` | `siwes/` | `(studentId, weekNumber)` | weekly narrative text | **fold into `EntryReflection`** |

Three concrete defects this causes:

1. **Two week-numbering schemes.** `logbook_entry.weekNumber` is placement-relative;
   `weekly_summary.weekNumber` is student-relative and deliberately survives transfers
   (`siwes.calendar.ts::weekNumberFor`, anchored on the supersedes-chain start). After a transfer,
   "week 7" denotes two different weeks.
2. **A day exists twice.** `entry_days` says whether a day was logged; `daily_entry` says what was
   done. No FK relates them — two answers to "did the student log Tuesday?".
3. **Daily content is unreviewable.** Submit/acknowledge/return, the append-only `entry_event` log,
   enrichment and grading all hang off `logbook_entry`. The daily logbook has no state machine, so
   nothing a student writes daily can be acknowledged or graded through the existing spine.

Prod row counts as of 2026-07-25 make this the cheapest possible moment: `daily_entry` **0**,
`weekly_summary` **0**, `entry_days` **2**, `logbook_entry` **4**, `logbook_submissions` 24.

## Target shape

```
logbook_entry            ← the week. state machine, audit, enrichment, objectives, grading
  ├─ daily_entry         ← the day. content + status + logged_late   (entry_days absorbed)
  ├─ entry_reflection    ← the weekly narrative                      (weekly_summary folded in)
  ├─ entry_activity, entry_attachment, entry_objective, ai_assessment, enrichment_queue
  └─ entry_event         ← append-only audit (unchanged)
```

**Week numbers become student-relative everywhere.** `logbook_entry` is rekeyed from
`(placementId, weekNumber)` to `(studentId, weekNumber)`, so a transferred student's logbook stays
continuous and matches the chain-aware calendar built in S84.

## Decisions (locked)

- Days hang off the week — one week object, one state machine.
- Student-relative week numbering wins.
- Legacy `modules/logbook/` is retired in this work.
- **Reuse, don't rebuild:** `entry.stateMachine.ts` (`resolveTransition`), `entries.policy.ts`
  (`assertPlacementAccess`), `siwes.calendar.ts` (`weekNumberFor`, `weeksInAttachment`,
  admissibility). No new libraries.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Schema + migration | todo |
| 2 | Backend: fold `siwes` service into the entries spine | todo |
| 3 | Frontend: one logbook UI | todo |
| 4 | Retire legacy `logbook/` | todo |

### Phase 1 — Schema + migration

Additive first, destructive last, in one migration:

1. `logbook_entry`: add `student_id` (nullable) → backfill from `placements.student_id` → set
   `NOT NULL` + FK. Add `@@unique([studentId, weekNumber])`; **drop** `@@unique([placementId, weekNumber])`.
   Keep `placement_id` — a week still belongs to the placement it was worked under.
2. `daily_entry`: add `entry_id` FK → `logbook_entry(id) ON DELETE CASCADE`; add `status DayStatus`
   and `logged_late boolean` (columns lifted from `entry_days`). Keep `@@unique([studentId, workDate])`
   — it is the real-world rule (a student works one day once) and survives transfers.
3. Backfill `daily_entry.entry_id` by `(studentId, weekNumberFor(workDate, chainStart))`, creating the
   owning `logbook_entry` row where one does not exist.
4. Fold `weekly_summary.reportText` into `entry_reflection` for the matching week.
5. **Destructive, and the reason this needs explicit sign-off before it runs:** `DROP TABLE entry_days`,
   `DROP TABLE weekly_summary`. Both are empty or near-empty on prod today (0 and 2 rows), but per
   `CLAUDE.md` no destructive migration ships without approval — re-confirm at execution time.

Preserve the existing DB teeth: `created_at` immutability trigger and the `siwes_no_delete()`
delete-denial trigger on `daily_entry` must survive the alter (recreate them if the column changes
force a drop).

### Phase 2 — Backend

- `modules/siwes/siwes.service.ts`: daily upsert resolves (or creates) the owning `logbook_entry`
  for that student-week, then writes the day against it. Admissibility rules stay exactly where they
  are (`siwes.calendar.ts`) — this phase moves ownership, not rules.
- Day writes must respect the week's state: `isEditable` is `draft | returned` only, so a day inside
  an `acknowledged` (terminal) week is locked. Route the check through `resolveTransition` /
  `assertPlacementAccess` rather than re-deriving it.
- Weekly narrative writes move from `weekly_summary` to `entry_reflection`.
- `GET /placements/:id/calendar` reads days via the entry join; response shape stays the same so the
  frontend keeps working through Phase 2.
- Submitting a week validates its days (missing-day flags already computed by the calendar).

### Phase 3 — Frontend

Merge `/student/daily-logbook` and the weekly entry UI into one page: the week is the container
(status pill, submit/reopen actions), days are rows inside it, the weekly report is the narrative
field on that same week. Reviewer side: `SiwesCalendarPanel` and the weekly review panel become one
component. Keep surfacing backend 422/409 messages verbatim.

### Phase 4 — Retire legacy `logbook/`

`logbook_submissions` shares the `(placement, week)` key with `logbook_entry` and is the third
source of truth. Freeze writes, migrate anything still referenced by coordinator dashboards, unwire
`/api/v1/logbook`, then drop the module. Historical `logbook_analyses` rows stay (S82 precedent).

## Verification

Per phase: `npx prisma validate`, `tsc --noEmit`, `npm run lint`, and
`npx jest src/modules/entries src/modules/siwes src/modules/finalization --runInBand` (this box needs
`--runInBand`; parallel workers flake the DB-integration connect hook).

Migration specifically: replay the full chain into a clean database (what CI does), **and** apply it
to a copy of prod data — CI starting from empty is exactly the blind spot that caused the S87 outage.
Assert afterwards: no day without an owning week, no week without a student, week numbers continuous
across a transfer chain, and both `daily_entry` triggers still present.
