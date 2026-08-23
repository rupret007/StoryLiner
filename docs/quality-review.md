# StoryLiner quality review (tip/main → this branch)

Review of `rupret007/StoryLiner` for Jeff Story. Scope: guardrails, no auto-publish, adapter safety, tests, types, demo-fact drift.

**Main CI (watched):** lint PR #1 is merged (`669e98d`). Latest `main` CI is green (lint + `tsc` + build). Older `main` pushes (March 2026) were red until the ESLint config landed. CI still did **not** run Jest until this branch.

**Pipeline (unchanged, still required):** Generate → Guard → Review → Approve → Schedule → Publish. Nothing auto-publishes. Bob drafts here; live post only after a separate yes (approve + schedule + connected real account).

**Not done (by request):** no auto-post, no Trailer Swift voice, no real X adapter.

---

## P0

### 1. Real Facebook publish could fire against disconnected seed/demo accounts

**Evidence:** `handlePublishPost` called `adapter.publish()` whenever a `SCHEDULED` job was due. Seed Facebook accounts are `isConnected: false` but `isActive: true`. With `SOCIAL_ADAPTER=real` and `FACEBOOK_*` env vars set, approving + scheduling a demo Stalemate/Rad Dad caption would POST to the real Page.

**Fix:** `assertSafeToLivePublish()` refuses real FB/IG/YT writes unless the platform account is active **and** `isConnected`. Wired into schedule + worker. UI already labeled disconnected accounts `(mock)`.

### 2. Reschedule could reset a RUNNING publish job → double-publish

**Evidence:** `reschedulePost` set `job.status = "PENDING"` while `scheduledPost.status` was still `SCHEDULED`. The worker claims the job (`RUNNING`) before it flips the scheduled row. A reschedule during that window re-queued the same post.

**Fix:** only reschedule while the job is `PENDING` (`updateMany` claim). RUNNING/DONE/FAILED is rejected.

---

## P1

### 3. Guardrails documented as always-on were only half-wired

**Evidence:** `docs/architecture.md` lists band-voice separation, emoji tolerance, and auto-publish protection. `generate.ts` / `rewrite.ts` only called `checkHardGuardrails`. `checkBandVoiceSeparation` and `checkAutoPublishGuard` existed solely in unit tests. Manual caption edit did not recompute risk.

**Fix:** `evaluateGuardrails()` on generate, rewrite, and caption edit. Voice check is case-insensitive. Auto-publish is passed `false` explicitly. Draft status remains `IN_REVIEW`.

### 4. `SOCIAL_ADAPTER=real` treated missing adapters as live mock success

**Evidence:** factory fell back to `allMockAdapters[platform]` for Bluesky/TikTok/Twitch/Twitter. Mock Facebook/Bluesky `canDirectPublish: true`, so the worker marked drafts `PUBLISHED` even though nothing went live.

**Fix:** unsupported real-mode platforms now return a draft-only fallback (`real-fallback-draft-only-*`). Worker keeps those drafts `APPROVED` with a manual-publish note.

### 5. Twitter/X enum reused the Facebook mock (live-shaped)

**Evidence:** `allMockAdapters.TWITTER = mockFacebookAdapter` with `canDirectPublish: true`. Schema/UI leftover; no real X adapter (correct). Unsafe stub.

**Fix:** dedicated `mock-twitter` draft-only stub. No real X client.

### 6. Facebook native scheduled publish could mark unpublished posts as live

**Evidence:** `FacebookRealAdapter.publish()` set `published=false` + `scheduled_publish_time` when `scheduledFor` was in the future. `handlePublishPost` treats `isDraftOnly !== true` as live `PUBLISHED`.

**Fix:** refuse native FB schedule. StoryLiner's job queue is the only scheduler. Worker posts only when the job is due.

### 7. YouTube adapter could overwrite a live video description

**Evidence:** `updateVideoDescription` is a real write. Tests mocked `extractYouTubeVideoId` to always return an id. Worker does not currently forward `mediaUrls` (so this path is dormant), but any later media wiring would mutate live videos by default.

**Fix:** require `accountMetadata.allowVideoDescriptionUpdate === true`. Otherwise `isDraftOnly`.

### 8. Facebook page tokens from `PlatformAccount.metadata`

**Evidence:** `getFacebookCredentials()` accepted `accountMetadata.pageAccessToken` (plaintext JSON in Postgres).

**Fix:** tokens from env only. `pageId` may still come from metadata for routing.

### 9. Worker retry filter was broken; unimplemented jobs marked DONE

**Evidence:** `retryCount: { lt: prisma.job.fields.maxRetries ? undefined : 3 }` — DMMF field metadata is truthy, so the filter was `{ lt: undefined }`. Unimplemented recap/clip/reminder jobs still flipped to `DONE`.

**Fix:** due jobs are `PENDING` + `runAt <= now` only. Unimplemented types fail with `retryCount = maxRetries` (no silent success, no retry loop).

### 10. Approve/reject had no status guard

**Evidence:** `approveDraft` could move `SCHEDULED` / `PUBLISHED` back to `APPROVED`.

**Fix:** approve/reject only from `IN_REVIEW`.

### 11. `scheduleJob` defaulted `runAt` to now

**Evidence:** helper defaulted to immediate run. Review-queue path used an explicit future time; the helper was a footgun.

**Fix:** `runAt` is required.

### 12. Jest was not in CI; factory tests did not `await` async `getSocialAdapter`

**Evidence:** `.github/workflows/ci.yml` ran lint/tsc/build only. `tests/adapters/real-social.test.ts` assigned the Promise and read `.adapterName`.

**Fix:** CI `test` job (`prisma generate` + `npm test`). Factory tests await.

### 13. Seed was not idempotent; campaign name drifted

**Evidence:** README/deploy claim upsert-safe seed. Knowledge/events/drafts used `create()` every run. Campaign title was `"Burlington Bar — May Show"` while `eventDate` is `now + 14d`.

**Fix:** skip knowledge/events/drafts when already present. Rename campaign to `"Burlington Bar show"`. Historical seed facts (2019 / Mr. Brightside / etc.) were **not** rewritten — those may be Jeff locks.

### 14. Mock LLM Stalemate CTA used banned FOMO copy

**Evidence:** `ctaText: "Grab tickets before they're gone"` vs Stalemate banned phrases (`grab your tickets now`, `don't miss out`).

**Fix:** band-specific CTAs. No Trailer Swift voice added.

---

## P2 (not fixed)

| Item | Evidence |
|---|---|
| No auth on server actions | Any reachable client can approve/schedule. Post-MVP in architecture docs. |
| Tokens/stream keys in DB plaintext | `PlatformAccount.metadata`, `LivestreamDestination.streamKey`. |
| Worker does not forward `mediaUrls` | **Fixed on main (PR #3).** Worker sanitizes and forwards `mediaUrls`. See `prisma/README.md`. |
| OpenAI campaign prompts hardcode Stalemate vs Rad Dad | Still hardcoded fallbacks. Trailer Swift remains absent — do not invent a voice. Prompts now forbid inventing a third band or extra history. |
| Seed demo facts vs unknown Jeff locks | **Honesty pass:** knowledge rows are prefixed and tagged `demo-unconfirmed`. Voice locks were not rewritten. See `docs/voice-facts.md`. |
| `datetime-local` `min` uses UTC slice | TZ skew on schedule picker. |
| Instagram `canDirectPublish: true` vs no-media draft-only | Capability/docs mismatch. |
| Mock YouTube `canDirectPublish: true` vs real YouTube draft-only | Adapter drift. |
| High-risk drafts can be approved | By design (“human decides”) but no extra confirm. |
| `checkBandVoiceSeparation` substring match | Short names could false-positive. |
| Facebook `if (!response)` dead code | `fetch` does not return null. |
| No NextAuth / audit log | Architecture “post-MVP”. |

---

## Guardrail / adapter safety (current)

- Generate always creates `IN_REVIEW`.
- Real live write requires connected + active account (FB/IG/YT only).
- Facebook/Instagram/YouTube are the only real adapters.
- Twitter/X, Bluesky, TikTok, Twitch: draft-only in real mode; Twitter mock is draft-only.
- YouTube live description update is opt-in metadata, not default.
- Worker never treats unimplemented jobs as success.

---

## Tests added/updated

- `tests/guardrails/policy.test.ts` — evaluateGuardrails, emoji, case-insensitive voice
- `tests/services/publish-safety.test.ts` — connected-account gate, reschedule states
- `tests/services/rewrite-draft.test.ts` — imports real `deriveHashtags` / `riskLevelFromFlags`
- `tests/services/mock-llm.test.ts` — Stalemate CTA must not be FOMO
- `tests/adapters/social.test.ts` — Twitter stub is not Facebook
- `tests/adapters/real-social.test.ts` — await factory; draft-only fallback
- `lib/adapters/social/real/facebook-adapter.test.ts` — refuse native schedule
- `lib/adapters/social/real/youtube-adapter.test.ts` — description update requires explicit allow
