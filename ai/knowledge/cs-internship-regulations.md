# CS Industrial Attachment — Regulations and Guidance

> **This file is the assistant's source of truth.** It is chunked by heading,
> embedded, and stored in `knowledge_passage`; the AESIS Assistant answers from
> these passages and cites the section it used.
>
> It lives under `ai/` because the AI service's Docker build context is that
> directory — a document outside it would not ship in the image. The service
> ingests every `ai/knowledge/*.md` on startup, skipping anything unchanged, so
> editing this file and deploying is the whole workflow.
>
> Nothing here should be aspirational. If a rule is not actually enforced by the
> system or the department, do not write it down — a confidently wrong answer
> about a deadline is worse than "I don't know".

## Weekly attendance minimum

Interns are expected to attend their placement on the cohort's configured
working days, which default to Monday to Friday. The coordinator sets a minimum
number of logged hours per week in Cohort Settings; when it is set to 0 there is
no minimum and no intern is ever flagged as short.

Hours are recorded per week on the logbook entry. The intern dashboard compares
hours logged against the configured minimum multiplied by the weeks that have
come due, not against the whole programme — so an intern is never shown as
behind on hours they do not yet owe.

## Logbook structure

The week is the unit of submission and the day is the unit of work. Each working
day carries a description of the work done and the new skills learnt; the week
carries the hours logged and a weekly report in the intern's own words.

A day may also carry itemised activities with competency tags, and file
attachments as evidence. Attachments may be PDF, DOCX, PNG or JPEG, up to 10 MB
each, and at most 10 per week.

## Submission deadlines

A week's deadline is the last day of that week. The system reminds an intern 48
hours and 24 hours before a week closes, by in-app notification and email.

A week that has not started cannot be submitted or logged in advance. A day in
the future cannot be logged at all.

## Logging a day late

Late logging is always allowed while the week is still the intern's — there is
no cut-off after which a missed day becomes impossible to record. A day logged
after its own date is marked late for the supervisor, showing how many days
late, but it is never refused and it never affects a grade on its own.

The honest answer to "can I still log last Tuesday?" is yes, and it will be
visible as late.

## Missing a submission

A missed week is not a penalty event. It raises an advisory risk signal that the
academic supervisor sees, and it lowers the intern's engagement percentage —
submitted weeks over weeks due. Persistent gaps escalate the risk tier, which
exists to start a conversation early, not to punish.

## What happens after a week is submitted

A submitted week goes to the academic supervisor, who either acknowledges it or
returns it for revision with a written comment.

Acknowledging is terminal: the week locks and its days can no longer be edited.
Returning re-opens the week — the intern edits the days and resubmits, and the
version number increases so the history of what changed is preserved.

A returned week is fully editable. If it appears not to be, that is a fault to
report, not a rule.

## Quality and relevance scores

Quality and relevance scores are **advisory and never a grade**. They are
produced by the AI enrichment pass over what the intern logged, scored 0–100,
and they exist to tell a supervisor where to look first.

No score changes a mark. The final grade comes from the assessment components
the coordinator configures, weighted to total 100, and it is set by people.

## Plagiarism and originality

Submitted entries are compared against other entries for unusual similarity.
A high similarity raises a flag for the supervisor to look at; it is not an
accusation and it is not automatic. Write entries in your own words describing
what you personally did.

## Final grade components

The final grade is made of four components, weighted by the coordinator and
always summing to 100: the industry supervisor's assessment, the academic
supervisor's assessment, the project report, and the weekly logbook.

Each component is scored on a 0–100 scale and contributes its weighted share.
A grade is signed off, then released; until it is released the intern cannot see
it.

## Company attestation

At the end of the placement the host company confirms the intern completed the
attachment as described. This is done through a secure single-use link sent to
the company supervisor, who does not need an AESIS account.

## Absences

An intern may record an absence against a working day, as sick leave or
permitted absence. A recorded absence and a work entry cannot both exist for the
same day. An absence means the day is not counted as missing.

## Public holidays and non-working days

The coordinator declares public holidays and other non-working days for the
cohort. A declared holiday beats the weekly working-day pattern, so nobody is
ever flagged for not logging on one. Holidays that fall on the same date every
year can be marked recurring.

## Changing placement

If an intern transfers to another company, the attachment is continuous: week
numbering does not restart, and weeks completed at the previous company still
count toward the total. The logbook is anchored on the first placement's start
date for the whole chain.

## Who can see what

An intern sees only their own placement and logbook. An academic supervisor sees
only the interns assigned to them. The coordinator has read-only oversight of
the whole cohort and never writes or transitions a logbook entry. The company
supervisor sees only the placements they are attached to.

## Getting help

Questions about a specific mark, a deadline extension, or a placement problem go
to the academic supervisor first, and to the programme coordinator if
unresolved. The assistant does not have access to marks and cannot grant
extensions.
