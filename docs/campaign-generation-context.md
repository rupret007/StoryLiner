# Saved campaign context → guarded draft

## Product change

Campaign Builder's existing **Generate** link now opens the exact campaign in
Content Studio. The Studio previews the saved band, campaign type/description,
target date and linked event facts. Saved fields are read-only; an optional
operator note cannot overwrite them. A campaign target date is labelled separately
from the event's show date, including when the campaign has no event.

Unavailable, inactive, cancelled, cross-band or malformed links stop the linked
path. No other band is silently selected. The existing **Create a standalone
draft** / **Start unlinked draft** paths remain available; there is no new campaign
editor, customer page, scheduler or provider integration.

## Source and persistence contract

- `campaign-context.ts` makes one bounded, shared projection and a fixed-order
  receipt from existing Band, voice-profile, Campaign and Event records.
- The server resolves active band ownership and campaign/event consistency
  itself. Browser-supplied canonical facts are rejected for linked requests;
  only the separate operator note is accepted. Linked type must match the saved
  campaign type.
- Generation validates the displayed receipt before calling the mock adapter.
  After generation, a serializable transaction re-reads and compares the source
  again, then creates GenerationRun, Draft and DraftVersion atomically. A late
  insert failure cannot leave a partial draft/run.
- The effective facts remain top-level in `GenerationRun.inputContext` for the
  existing review desk; additive `source` records origin IDs, receipt and the
  display-time convention. `promptSent` explicitly identifies metadata, not a
  fabricated verbatim prompt.
- Drafts remain `IN_REVIEW`. This path creates no scheduling, publishing or job
  records. Existing guardrails still run.

Receipts are comparisons, **not secrets, authorization or proof that a source
will never change later**. The final transaction uses PostgreSQL serializable
snapshot semantics, not a permanent source lock. Future edits do not rewrite a
previous generated snapshot. Review remains a separate human step.

Dates display in **America/Chicago** as an explicit app convention. The Event
model does not store an event timezone; this is not a claim about one. Raw ISO
timestamps stay in the receipt. Missing saved facts are labelled as missing and
are not replaced with a guessed Saturday, venue or 8pm. The unlinked mock content
pools, band voices and seed facts are unchanged.

## Privacy and deployment boundary

New campaign/event-linked generation is **mock-only**. The configured mode is
checked before adapter construction, and the selected adapter must also be mock
before it receives the linked context. There is no live-provider test or new data
export in this slice. Existing unlinked adapter behavior is unchanged.

The proposed optional live prompt expansion was stopped by auto-review: it would
send additional saved campaign/event fields to the configured provider. That
portion remains **held for explicit owner privacy approval**, not completed or
implicitly authorized by a green mock test. Do not remove the gate or modify
provider settings as part of a review cleanup.

The application remains loopback-only / single-operator with its existing
request-level authentication limitations. Same-band validation is data integrity,
not a new multi-user security model. No credentials, database schema, dependency
lockfile, worker settings or parked Fault Lines #27 work were changed.

## Studio recovery

Generation is single-flight within the mounted Studio session; controls are held
while the request is pending. The displayed result is pinned to the submitted
band/campaign/type/platform and opens the exact draft in the existing Review
Queue. A background fact refresh holds generation and keeps local notes, media
and an existing result until a deliberate facts reload.

A source-change failure retains input and requires **Reload campaign facts**.
The Studio action returns fixed, allowlisted result codes for expected context
and privacy stops; it does not rely on thrown server-error text surviving a
production build. Unrecognized failures return no database/provider error detail.
An unknown result or 60-second deadline is not treated as cancellation: a draft
may still arrive. Check Review Queue before explicitly allowing a new attempt.
There is no automatic retry, cross-tab lock or server-side idempotency promise.
Leaving/reloading the page can discard session input; this is not durable backup.

## Verification

The normal `npm test` suite includes actual Studio DOM and Campaign Builder
rendering tests plus service, projection and mock-adapter tests. Full typecheck,
lint and production build remain required. Fixture visual checks use the actual
client/styles at desktop and narrow mobile widths, with router/action boundaries
mocked and all browser network requests blocked. They are not a live-app test.

The separate `npm run test:postgres` gate uses actual Prisma/PostgreSQL reads,
writes and rollback; only the LLM is mocked. It requires all of:

- An empty, disposable PostgreSQL database `storyliner_campaign_test`, synthetic
  role/password `storyliner_fixture`, client endpoint `127.0.0.1:59319` (or
  `localhost:59319`), no URL query parameters.
- `STORYLINER_POSTGRES_FIXTURE=1`, `LLM_ADAPTER=mock`, `SOCIAL_ADAPTER=mock`;
  no local `.env` files or provider credentials.
- Schema-only setup in that fresh fixture database, not seed data or an operator
  reset. The suite refuses a populated user/band/job database and cleans up only
  the fixture rows and trigger it creates.

The hosted required `postgres-fixtures` job provisions its own PostgreSQL 15
service. `STORYLINER_POSTGRES_FIXTURE_LAYOUT=docker` accounts for the guarded
client loopback port mapping to the private service interface on 5432; it does
not accept a different client database or arbitrary endpoint. Build depends on
this job as well as the existing Jest and lint/typecheck jobs.

Local runtime and exact-head hosted results belong in the draft PR and coord
AFTER record. A green build is not a clean dependency audit, live-provider
acceptance, deployment, or permission to merge. Known dependency advisories from
the preceding review-edit slice remain a separate compatibility task.

## Handoff / remaining work

Karen: review ownership/receipt failures, retained-input recovery, mock-only gate,
atomic persistence and fixture boundary. Keep the PR draft and unmerged.

Owner decision: whether the optional live AI adapter may receive the newly linked
campaign/event facts and operator note. If approved later, implement explicit
provider parity and no-fabrication tests in a separate scoped change. General
campaign CRUD, durable recovery and multi-user auth remain outside this slice.
The later [Calendar planning slice](calendar-planning.md) applies the explicit
Chicago display convention to Calendar; it does not change scheduling inputs,
add per-event timezone data or expand provider access. The [review desk facts
slice](review-desk-facts.md) shows those same saved facts — and honest gaps —
on the existing review snapshot. Never auto-publish.
