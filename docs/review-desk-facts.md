# Review desk saved facts — September 6, 2026

## Product change

After Campaign Builder → Studio linked generation (#37), the review desk still
read only venue, city, and show date from `GenerationRun.inputContext`. Saved
doors, set time, ticket URL, campaign target date, operator note, and the
honest missing-fact list never reached the snapshot Jeff decides on. Voice
rules and banned phrases were truncated. Scheduled-for used the host timezone
instead of the America/Chicago convention already used by Studio and Calendar.

The existing review desk now shows the same saved campaign/event facts Studio
generated with. Missing doors, set, venue, city, or ticket links say **Not
saved** (or the no-event line when the campaign has no event). Unlinked drafts
stay unlinked and do not grow a fake missing-event list. Scheduled-for uses
**America/Chicago** with CDT/CST. The full voice and never-say lists are
visible. Nothing on this desk publishes.

## Boundaries

- This is a display of the generation snapshot. It does not re-fetch live
  campaign/event rows, invent Saturday/8pm, or rewrite captions.
- Ticket URLs display only when they are public https. Generation receipts are
  not shown. Linked generation remains mock-only under the existing owner
  privacy hold.
- Calendar grouping from #38 is unchanged. Schedule *input* stays
  `datetime-local` in the browser. No schema, worker, adapter, seed, or voice
  lock was rewritten.
- Approve / Hold / Deny / Schedule still never publish. Parked Fault Lines #27
  stays untouched. No X adapter.

## Verification and handoff

`tests/services/review-desk.test.ts` covers saved/unlinked/no-event facts,
derived missing facts, refused ticket URLs, full voice lists, and host-timezone
independence for Scheduled for.

`tests/workflow/review-desk-facts-ui.test.tsx` renders the actual review desk
against a synthetic linked snapshot and an unlinked snapshot. No database or
provider is contacted.

Linked generation now also stores `missingFacts` on `inputContext` so the desk
can show the same gap list Studio had. Older linked rows without that list
derive the same labels from present/absent saved fields plus `source.eventId`.

Karen review should check missing-fact honesty, Central scheduled-for, full
voice visibility, and the absence of new write/provider paths. Keep the PR an
OPEN DRAFT until separately reviewed. No merge, tag, signing, release, deploy,
Pages, send/post, spend, or live customer operation is part of this work.
