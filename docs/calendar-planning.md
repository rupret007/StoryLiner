# Calendar planning — September 5, 2026

## Product change

Calendar now puts an evening post, show and stream under the day an operator
expects in Central time, and displays their actual clock times. Previously,
grouping used the UTC date while headings used the host timezone. Splitting a
formatted date on a comma could display the year in place of the time.

For example, `2026-09-06T00:30:00Z` belongs under **Sat, Sep 5, 2026** at
**7:30 PM CDT**. It should not appear under September 6 with `2026` where the
clock belongs. The Calendar header states the display convention:
**Central time (America/Chicago)**. This matches Campaign Builder and Studio.

Post and stream cards display their saved scheduled time. Show cards display
the saved **Event**, **Doors** and **Set** times. Missing optional doors/set
times say **Not saved**. If a saved related time is on another Chicago day,
its full date is displayed as well. Event time is the saved `eventDate` instant;
it is not substituted for missing doors or set data.

Cards still sort by absolute timestamp. At daylight-saving end, the two 1:30 AM
instants remain in order and display **CDT** and **CST** separately. Day headings
and times use the same zone regardless of the application host's timezone.
Native `time` elements retain machine-readable dates/ISO instants.

## Boundaries

- The query window remains now through 30 × 24 hours. It is not a month view,
  a calendar-day range or an overdue queue. Existing status/cancellation filters
  remain intact; refreshing the page obtains a new snapshot.
- America/Chicago is an app display convention. The schema has no per-event
  timezone field. Saved timestamps and other screens' scheduling-input behavior
  are unchanged; no event timezone is inferred from a venue or band.
- Show cards remain grouped by `eventDate`; optional doors/set fields add
  context and do not relocate the event or create extra schedule entries.
- Existing possible-write badges/warnings and exact post-review links remain.
  Stream cards stay informational; no new detail-route navigation or prefetch
  introduces generation on read.
- This slice uses only the Calendar's existing three database reads. It adds no
  save, scheduling, publishing, worker, provider, clipboard or storage operation.
  Existing single-operator/loopback access limitations remain.
- Linked campaign generation remains mock-only and its owner privacy decision
  stays held. No provider adapter or export fields changed. Never auto-publish.

## Verification and handoff

`tests/services/calendar-timeline.test.ts` covers Chicago/UTC midnight and year
boundaries, spring transition, both fall-back hour instants, same/cross-day
related fields, host timezone independence and explicit invalid-date failure.

`tests/workflow/calendar-timeline-ui.test.tsx` renders the actual async Calendar
against synthetic Prisma rows. It checks mixed-item grouping and ordering,
clock labels/ISO values, optional and cross-day event facts, existing read
filters, queue warnings/review links, no stream link and the empty state. No
database or provider is contacted by these tests.

The draft PR and coordination AFTER record contain executed full-suite,
TypeScript/lint/build, browser fixture and hosted PostgreSQL evidence. Local
visual fixtures render this component and its actual styles with synthetic
rows and blocked networking; they do not prove production authentication or
provider delivery. A successful hosted run is not permission to publish or
deploy.

Karen review should check date/day parity, fall-back labels, preservation of
queue warnings, explicit missing facts and the absence of new write/provider
paths. Keep the new PR an OPEN DRAFT until separately reviewed. Parked #27,
voices, seeds, schema, dependencies, workflows and scheduling actions remain
untouched. No merge, tag, signing, release, deploy, Pages, send/post, spending
or live customer operation is part of this work.
