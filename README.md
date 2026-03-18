# StoryLiner

AI-powered promo and livestream copilot for bands.

Built for musicians who are strong at making music and performing, but need help with promotion, social consistency, writing captions, and staying active between shows.

## Overview

StoryLiner is a single-operator tool managing two distinct bands — **Stalemate** (original indie rock, dry and scene-rooted) and **Rad Dad** (pop punk cover band, nostalgic and crowd-first) — with completely separate voice profiles, content rules, and publishing workflows.

Everything lands in a review queue before it can be published. Nothing auto-publishes.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui, dark-mode-first |
| Database | PostgreSQL via Prisma ORM |
| Validation | Zod |
| Jobs | Postgres-backed job queue + in-process worker |
| LLM | Mock adapter (default) / OpenAI adapter (stubbed) |
| Social | Mock adapter (default) / Real adapters for Facebook, Instagram, YouTube |

## Requirements

- Node.js 20+
- PostgreSQL 15+ (local or Docker)
- npm

## Local Setup

### 1. Install dependencies

```bash
npm install --ignore-scripts
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
- Set `DATABASE_URL` to your Postgres connection string
- Leave `LLM_ADAPTER=mock` and `SOCIAL_ADAPTER=mock` for local development

### 3. Create the database

```bash
# If using PostgreSQL locally
createdb storyliner

# Or with psql
psql -c "CREATE DATABASE storyliner;"
```

### 4. Push the schema and generate Prisma client

```bash
npm run db:push
npx prisma generate
```

### 5. Seed the database

```bash
npm run db:seed
```

Seed creates:
- Stalemate and Rad Dad with full voice profiles, tone rules, and banned phrases
- Knowledge entries for each band
- Platform accounts (mock/disconnected)
- Upcoming events and show campaigns
- Realistic drafts in the review queue at various stages
- Published posts with engagement metrics
- Analytics snapshots
- Rad Dad livestream event with full run-of-show and destinations

### 6. Run the app

Web server only:
```bash
npm run dev
```

Web server + background worker (required for scheduled post processing):
```bash
npm run dev:all
```

App runs at [http://localhost:3000](http://localhost:3000)

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run worker` | Start background job worker (polls every 5s) |
| `npm run dev:all` | Dev server + worker concurrently |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed with realistic band data |
| `npm run db:studio` | Open Prisma Studio |
| `npm test` | Run Jest tests |

## Application Sections

| Route | Description |
|---|---|
| `/dashboard` | Overview: review queue status, scheduled posts, upcoming streams, recently published |
| `/bands` | All bands with stats |
| `/bands/[id]` | Band detail: voice profile, platforms, knowledge entries, in-review drafts |
| `/content-studio` | Generate platform-specific content with band voice, tone, and context |
| `/campaign-builder` | View and manage campaign groupings |
| `/calendar` | Upcoming posts, events, and streams in one view |
| `/review-queue` | Approve / reject / edit / rewrite / schedule / archive drafts |
| `/scheduled-posts` | Posts queued for publishing with reschedule support |
| `/published-posts` | Published post history with engagement metrics |
| `/livestreams` | Livestream events, run-of-show, AI banter prompts, gear checklist |
| `/analytics` | Heuristic-based pattern insights and timing recommendations |
| `/integrations` | Social provider adapter status and real API connection guide |
| `/settings` | Adapter mode, guardrail policy display |

## Content Pipeline

```
Generate → Guard → Review → Approve → Schedule → Publish
```

1. **Generate** — Content Studio calls `lib/services/content/generate.ts` → LLM adapter → draft created with `IN_REVIEW` status
2. **Guard** — Hard guardrails run on every generated caption (`lib/services/guardrails/policy.ts`)
3. **Review** — All drafts land in `/review-queue` — approve, reject, edit, rewrite, or archive
4. **Rewrite** — Apply directives (`funnier`, `morePunk`, `noHashtags`, etc.) via `lib/services/content/rewrite.ts` — creates new version, recomputes risk, back to review
5. **Approve** — Sets status to `APPROVED`, draft moves to the Approved tab for scheduling
6. **Schedule** — Select a platform account and future datetime; creates `ScheduledPost` + `Job` in a single transaction
7. **Publish** — Worker processes due jobs via social adapter → `PublishedPost` record created → metrics visible

## Review Queue

All review actions use `router.refresh()` (no hard page reloads). Destructive actions (reject, archive) require confirmation dialogs.

| Action | Description |
|---|---|
| Approve | Marks draft as APPROVED, ready to schedule |
| Schedule | Opens account + datetime picker (approved drafts only) |
| Reject | Requires confirmation; marks as REJECTED |
| Edit | Direct caption edit inline, creates new version |
| Rewrite | Apply a tone directive, recomputes risk signals, creates new version |
| Duplicate | Creates a copy back in review for variant testing |
| Archive | Requires confirmation; removes from active queue |

Scheduling validation enforces:
- Account must belong to the same band
- Account platform must match the draft platform
- Account must be active
- Schedule time must be in the future
- All operations are transactional (no orphan jobs)

## Adapter System

### LLM Adapters

Controlled by `LLM_ADAPTER` in `.env.local`:

| Value | Behavior |
|---|---|
| `mock` (default) | Uses per-band realistic content pools with distinct Stalemate / Rad Dad voices |
| `openai` | Stubbed in `lib/services/llm/openai-adapter.ts` — implement prompt assembly to enable |

### Social Provider Adapters

Controlled by `SOCIAL_ADAPTER` in `.env.local`:

| Value | Behavior |
|---|---|
| `mock` (default) | Full simulated publish flow, capability flags per platform, no real API calls |
| `real` | Returns real adapters for Facebook, Instagram, YouTube; other platforms fall back to mock |

#### Real adapter platforms (as of current sprint)

| Platform | Real Adapter | Notes |
|---|---|---|
| Facebook | `lib/adapters/social/real/facebook-adapter.ts` | `POST /{pageId}/feed` via Meta Graph API v18.0 |
| Instagram | `lib/adapters/social/real/instagram-adapter.ts` | Two-step media container publish via Meta Content Publishing API. Requires image/video. |
| YouTube | `lib/adapters/social/real/youtube-adapter.ts` | Text posts → `isDraftOnly=true` (community post API removed). Video URL → updates video description. |
| Bluesky | Mock fallback | Real adapter planned next sprint |
| TikTok | Mock fallback | Video required for real publish |
| Twitch | Mock fallback | Helix API planned |

#### Setting up real adapters

1. Set `SOCIAL_ADAPTER=real` in `.env.local`
2. Add credentials per platform (see `.env.example` for variable names)
3. Restart dev server — `/integrations` shows per-platform credential status
4. Platforms without credentials degrade gracefully

#### Enabling Facebook
```
FACEBOOK_PAGE_ACCESS_TOKEN=...   # Long-lived Page Access Token
FACEBOOK_PAGE_ID=...             # Numeric Page ID
```

#### Enabling Instagram
```
FACEBOOK_PAGE_ACCESS_TOKEN=...       # Same user token connected to IG Business Account
INSTAGRAM_BUSINESS_ACCOUNT_ID=...    # IG Business Account numeric ID
```

#### Enabling YouTube
```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...   # Offline refresh token via OAuth consent flow
```

### Draft-Only Platforms

When a platform adapter sets `isDraftOnly=true` in the publish result (e.g. YouTube text posts, TikTok), the worker:
- Marks the job as complete
- Keeps the draft in `APPROVED` status (not `PUBLISHED`)
- Adds a `reviewNotes` timestamp indicating manual publish is needed
- Does NOT create a `PublishedPost` record

This prevents draft submissions from appearing as live published posts in analytics.

## Analytics

StoryLiner uses transparent heuristics — no fake ML claims:
- Groups published post data by campaign type, tone, platform, day of week, and hour
- Calculates average engagement rates per group (minimum 2 data points)
- Reports best and worst patterns with low/medium/high confidence based on sample size
- All reasoning shown inline next to each recommendation

## Hard Guardrails

Enforced at `lib/services/guardrails/policy.ts` on every generation and rewrite:

| Rule | Detail |
|---|---|
| No LinkedIn phrasing | Detects "excited to announce", "honored to share", "game-changer", etc. |
| No AI phrases | Detects "dive into", "delve into", "in the realm of", etc. |
| No fake accomplishments | Detects "chart-topping", "critically acclaimed", "award-winning", etc. |
| Exclamation overuse | Flags captions with more than 4 exclamation marks |
| Emoji overuse | Checked against per-band `emojiTolerance` setting |
| Band voice separation | Flags if the other band's name appears in the caption |

Guardrail violations populate `draft.riskFlags` and surface in the review queue UI. They do not block generation — the human decides.

## Data Model

19 Prisma models covering the full content lifecycle:

`User` → `Band` → `BandVoiceProfile`, `KnowledgeEntry`, `PlatformAccount`, `Campaign`, `Draft`, `DraftVersion`, `ScheduledPost`, `PublishedPost`, `AnalyticsSnapshot`, `MediaAssetReference`, `GenerationRun`, `PromptTemplate`, `Event`, `LivestreamEvent`, `LivestreamRunOfShowItem`, `LivestreamDestination`, `Job`, `PublishLog`

Key constraints:
- All band-specific data scoped strictly by `bandId` (no cross-band data leakage)
- `DraftVersion` has a `@@unique([draftId, version])` constraint (safe concurrent rewrites)
- `ScheduledPost` has a `@@unique` on `draftId` (one active schedule per draft)
- Schedule creation is fully transactional (job + scheduled post + draft status update)

## Tests

```bash
npm test
```

112 tests across 8 suites:

| Suite | Coverage |
|---|---|
| `tests/guardrails/policy.test.ts` | Hard guardrail policy enforcement |
| `tests/services/mock-llm.test.ts` | Mock LLM adapter generation, rewrite, risk assessment |
| `tests/services/platform-validate.test.ts` | Platform character limit validation |
| `tests/services/rewrite-draft.test.ts` | Hashtag derivation, risk level computation |
| `tests/adapters/social.test.ts` | Mock adapter capabilities and graceful degradation |
| `tests/adapters/real-social.test.ts` | Real adapter contract shape, isDraftOnly semantics, credential validation |
| `tests/workflow/schedule-approved-draft.test.ts` | Scheduling schema validation, future-time gates |
| `tests/jobs/publish-post.test.ts` | Draft-only adapter publish result semantics |

## Project Structure

```
app/
  (app)/               App shell with sidebar + topbar layout
    dashboard/         Overview stats and quick actions
    bands/             Band list and detail pages
    content-studio/    Generation UI (client component)
    review-queue/      Review workflow (client component + server actions)
    scheduled-posts/   Scheduled queue with reschedule dialog
    ...

lib/
  adapters/
    social/
      base.ts          SocialProviderAdapter abstract class
      mock-adapter.ts  Mock implementations (default)
      index.ts         Adapter factory (mock/real)
      real/            Real API adapters
        credentials.ts    Env-based credential loader
        facebook-adapter.ts
        instagram-adapter.ts
        youtube-adapter.ts
    livestream/        Livestream provider abstraction
  services/
    llm/               LLM service (mock + OpenAI stub)
    content/           generate.ts, rewrite.ts pipelines
    guardrails/        policy.ts hard guardrail enforcement
    publish/           Platform validation
  jobs/
    scheduler.ts       Job creation helpers
    handlers/
      publish-post.ts  PUBLISH_POST handler with isDraftOnly logic
  schemas/             Zod input validation schemas
  analytics/           Transparent heuristics report builder

prisma/
  schema.prisma        Full data model (19 models)
  seed.ts              Realistic seed data for Stalemate and Rad Dad

scripts/
  worker.ts            Background job poll loop (every 5s)

tests/
  adapters/            Adapter capability + contract tests
  guardrails/          Guardrail policy unit tests
  services/            Service logic tests
  workflow/            Scheduling validation tests
  jobs/                Publish handler semantic tests

docs/
  architecture.md      Full architecture reference and API hookup guide
```

## Environment Variables

See `.env.example` for all variables. Minimum for local dev:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/storyliner"
LLM_ADAPTER="mock"
SOCIAL_ADAPTER="mock"
```

## Architecture Reference

See [`docs/architecture.md`](docs/architecture.md) for:
- Full data flow diagrams for content generation and review → publish
- Adapter pattern documentation
- Band voice separation enforcement details
- Analytics heuristics explanation
- Per-platform real API hookup notes (Facebook, Instagram, Bluesky, TikTok, YouTube, Twitch)
- OpenAI adapter prompt structure guide
- Auth/roles and production deployment guidance

## Roadmap

- [ ] OpenAI real LLM adapter with band-specific prompt templates
- [ ] Bluesky real adapter (AT Protocol, app password auth)
- [ ] TikTok real adapter (video draft creation)
- [ ] OAuth connect-account flow for social platforms in `/integrations`
- [ ] Livestream creation form
- [ ] Multi-operator auth (NextAuth.js + role-based access)
- [ ] Encrypted stream destination credential storage
- [ ] Worker deployment as separate process with pg_notify
