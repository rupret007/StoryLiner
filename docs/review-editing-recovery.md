# Review editing recovery

## Product change

Unfinished caption and media edits belong to one draft, not whichever review
card is opened next. The existing Review Queue and focused review desk now keep
those edits together while the reviewer moves between drafts and queue tabs.
No new page, provider, database table, or publishing workflow was added.

- **Save caption** and **Save media** are separate explicit writes. A successful
  caption save does not discard an unfinished media edit, or vice versa.
- **Discard edits** returns to the saved version. It is not a publish action.
- Approve, Hold, Deny, Copy, Archive, Rewrite, and Schedule pause while local
  edits or a save outcome need attention. Unsaved work is not a fake loading
  spinner. Existing review-decision labels and consequences remain in place.
- A newer saved version is shown alongside **Your edits**. **Keep my edits**
  stages a choice; it does not save, approve, schedule, or publish. A draft that
  is no longer editable cannot be forced back into editing.
- A save failure keeps the input. Refresh the saved version, compare it with
  the local edits, and explicitly choose what to keep before trying again.
- Changing the first media URL retains the other attached URLs. A list with
  any invalid nonblank URL is rejected entirely, never partially saved.

## What is actually protected

`components/storyliner/review-edit-session.ts` holds an in-memory session per
draft within `ReviewQueueClient`. Each save captures its original draft ID,
band/platform, edit base, exact review receipt, submitted field, and request
token. The original `updatedAt` plus creative fingerprint goes to the existing
server action. Refreshed props cannot silently lend old input a new receipt.

Both existing actions return the confirmed scalar draft row from their
transaction. The client checks that it matches the captured request before
advancing its base, keeps the other unfinished field, and does not let a late
completion alter the newly focused draft. A delayed older page response cannot
roll a confirmed base backward. A genuinely newer snapshot still requires
review; there is no automatic conflict merge or retry.

The server remains authoritative: caption/media saves compare-and-set the
reviewed timestamp, refuse immutable statuses, return changed creative to
`IN_REVIEW`, clear the approval stamp, and preserve possible-live-write notes.
The URL check reuses the existing media sanitizer and schema. Whitespace and
exact duplicate URLs can be normalized; invalid entries cannot be silently
dropped from a successful save.

## Recovery limits

- This is not durable autosave. There is no localStorage, sessionStorage,
  IndexedDB, or extra draft store. Save before reloading or closing the page.
- In-app links leaving the review page ask before discarding unfinished work.
  Browser close/reload warnings are best-effort and browser-controlled, not a
  promise of recovery after a crash or a destroyed page session.
  Browser-history or programmatic navigation that unmounts the review page is
  not a durable recovery path; there is no history trap or global routing patch.
- A save-response deadline does not cancel the server write. An unconfirmed
  result may have committed; refresh and compare instead of replaying it.
- Tests use offline fixtures and mocked action/database collaborators. They do
  not prove a live provider interaction or real database rollback.
- StoryLiner remains single-operator and loopback-only. This slice does not make
  it suitable for a public, shared, or tunneled deployment.

## Verification and handoff

The existing suite covers the server review/schedule/publish boundaries. New
tests execute the actual React review screen through DOM interactions and
rerenders, plus the real media action against fixture collaborators:

- `tests/workflow/review-editing-ui.test.tsx`
- `tests/workflow/review-decision-blocked-ui.test.tsx`
- `tests/workflow/media-edit-integrity.test.ts`

Run the repository gates with mock adapters and an unused fixture database URL:

```sh
npx prisma generate
npm test -- --runInBand
npm run lint
npx tsc --noEmit
npm run build
```

Do not run `db:push`, seed, or a worker against an owner's environment to verify
this slice. CI evidence belongs to the exact draft-PR tip, not the base branch.

Local verification on 2026-09-05, based on main
`460287cbcca717df9d2db45040359c0fc8210688`:

- Full Jest suite: 39 suites / 455 tests passed, including 23 actual review-UI
  scenarios, 17 new media-integrity tests, and 4 blocked-control render cases.
- TypeScript and the production Next.js build passed. Repository lint passed
  with existing warnings outside the edited paths; focused edited-path lint
  passed.
- A temporary Chromium fixture rendered the actual review component and styles
  at desktop, 390px, and 320px. Unsaved/comparison screens were inspected; no
  page errors or horizontal overflow. Actions/router were fixtures and network
  requests were blocked. This was not a live-app or provider test.
- The unchanged production dependency audit reported five affected packages
  (four high, one moderate). No dependency upgrades or lockfile changes are
  included. A green build is not a clean dependency-audit claim.

Jest now compiles TSX for actual component tests and excludes generated `.next`
output so a prior standalone build cannot act as a second module source. No
source test paths are excluded.

## Next work, not included

Campaign Builder currently links campaign context into Content Studio without
fully carrying it through the existing generation controls. A future focused
product session should validate band/campaign/event consistency and carry
verified event facts into generation. Do not mix that work into edit recovery.
Calendar date/time display consistency is also separate.

The unchanged dependency baseline has outstanding advisory findings. Review
those separately with a compatible dependency plan; this PR does not claim a
clean dependency audit or change the lockfile.

Parked Fault Lines PR #27 remains untouched. No band voices, seed facts, live
adapters, credentials, worker settings, merge, tag, release, or deployment were
changed. Nothing was published.
