# StoryLiner Architecture

## Domain Overview

StoryLiner is a single-operator band management tool structured around two core domain objects:

- **Band** — the identity boundary. Everything scoped to a band (voice profile, knowledge, campaigns, drafts, posts, analytics) is completely isolated from other bands.
- **Draft** — the unit of work. All generated content is a draft first, in review second, published last.

## Folder Structure

```
app/
  (app)/              App shell routes (sidebar + topbar layout)
    dashboard/
    bands/
    content-studio/
    campaign-builder/
    calendar/
    review-queue/
    scheduled-posts/
    published-posts/
    livestreams/
    analytics/
    settings/
    integrations/
  layout.tsx           Root HTML shell
  page.tsx             Redirect to /dashboard

components/
  ui/                  shadcn/ui primitives
  storyliner/          Domain-specific components (BandChip, PlatformIcon, etc.)
    nav/               Sidebar + topbar

lib/
  prisma.ts            Singleton Prisma client
  utils.ts             Shared utilities
  schemas/             Zod schemas for input validation
    band.ts
    content.ts
    livestream.ts
  services/
    llm/               LLM service abstraction
      types.ts         Interface definitions
      mock-adapter.ts  Local development adapter
      openai-adapter.ts Real adapter stub
      index.ts         Adapter factory
    content/
      generate.ts      Content generation pipeline
      rewrite.ts       Rewrite directive pipeline
    guardrails/
      policy.ts        Hard guardrail enforcement
    publish/
      validate.ts      Platform character limit + pre-publish validation
    livestream/
      secrets.ts       Stream key encryption seam (stub)
  adapters/
    social/
      base.ts          Abstract SocialProviderAdapter + capability types
      mock-adapter.ts  Mock implementations per platform
      index.ts         Adapter factory
    livestream/
      base.ts          Abstract LivestreamProviderAdapter
      mock-adapter.ts  Mock implementations
      index.ts         Adapter factory
  analytics/
    heuristics.ts      Transparent analytics report builder
  jobs/
    scheduler.ts       Job creation helpers
    handlers/
      publish-post.ts  PUBLISH_POST job handler

prisma/
  schema.prisma        Full data model
  seed.ts              Realistic seed data

scripts/
  worker.ts            Background job poll loop
```

## Data Flow: Content Generation

```
User (Content Studio)
  → generateContentAction (server action)
  → generateContentSchema.parse() (Zod validation)
  → generateContent() (service layer)
    → LLMAdapter.generateContent() (mock or real)
    → checkHardGuardrails() (always runs)
    → prisma.generationRun.create()
    → prisma.draft.create(status: IN_REVIEW)
    → prisma.draftVersion.create(version: 1)
  → Draft sent to /review-queue
```

## Data Flow: Review → Publish

```
Review Queue (IN_REVIEW drafts)
  → approve / edit / rewrite / reject / archive / duplicate

Approve:
  → prisma.draft.update(status: APPROVED)

Schedule (approved drafts only):
  → validateDraftForPlatform() (character limits, risk check)
  → schedulePublishJob() → prisma.job.create()
  → prisma.scheduledPost.create()
  → prisma.draft.update(status: SCHEDULED)

Worker (every 5 seconds):
  → prisma.job.findMany(status: PENDING, runAt: lte now)
  → handlePublishPost()
    → SocialProviderAdapter.publish()
    → prisma.publishedPost.create()
    → prisma.publishLog.create()
    → prisma.draft.update(status: PUBLISHED)
```

## Adapter Pattern

Every integration is behind an abstract interface. Adapters declare their capabilities:

```typescript
interface SocialAdapterCapabilities {
  canDirectPublish: boolean;
  canSchedule: boolean;
  canDraftOnly: boolean;
  canDeletePost: boolean;
  supportsMedia: boolean;
  supportsHashtags: boolean;
  maxCaptionLength: number;
  maxHashtags: number;
}
```

The publisher checks `getDegradationWarning()` before executing. If a platform only supports draft creation (TikTok), it degrades gracefully and logs a warning instead of failing.

## Guardrail Architecture

Hard guardrails run **after every generation**, regardless of LLM adapter. They check:

1. LinkedIn-influencer phrasing patterns
2. Obvious AI phrase patterns
3. Fake accomplishment claims
4. Exclamation mark count
5. Emoji count vs. band tolerance
6. Cross-band voice leakage (other band names in caption)
7. Auto-publish protection (always off)

Guardrail violations populate `draft.riskFlags` and `draft.riskLevel` but do not block generation — they surface in the review queue UI so the human can decide.

## Band Voice Separation

Voice isolation is enforced at multiple levels:
1. **Schema**: All band-specific config (voiceProfile, bannedPhrases, toneRules) is scoped by `bandId` with foreign key constraints
2. **Generation**: Band voice profile is always fetched and passed to the LLM adapter — never shared
3. **Guardrails**: Cross-band name check in `checkBandVoiceSeparation()`
4. **UI**: Band selector always explicit — generation never runs without confirming the band

## Analytics Heuristics

No fake ML. All signals are computable from raw post data:

- Group by: campaignType, toneVariant, platform, dayOfWeek, hourOfDay
- Metric: average `engagementRate` per group
- Minimum: 2 data points to surface a pattern
- Confidence: `low` (<5 posts), `medium` (5-10), `high` (>10)
- Transparency: every recommendation includes the heuristic reasoning in the UI

## Job Queue

The Postgres job queue uses a simple poll model:

```
Job table: id, type, status, payload, runAt, retryCount, maxRetries, nextRetryAt
Worker: findMany(status=PENDING, runAt<=now) → updateMany(status=RUNNING) → execute → update(status=DONE|FAILED)
Retry: exponential backoff (30s * 2^retryCount), up to maxRetries
```

For production, consider:
- Moving the worker to a separate process/container
- Using pg_notify for push-based polling instead of interval polling
- Adding a dead-letter queue for persistent failures

## Livestream Module

Each `LivestreamEvent` has:
- `LivestreamRunOfShowItem[]` — ordered segments with banter/engagement prompts
- `LivestreamDestination[]` — platform-specific RTMP metadata (stream key stored server-side only)
- AI-generated talking points and engagement prompts per stream (generated on page load from LLM adapter)

Stream key and RTMP URL are stored in plaintext in the mock adapter. For production:
- Encrypt with `ENCRYPTION_KEY` via `lib/services/livestream/secrets.ts`
- Use a secrets vault (Vault, AWS Secrets Manager) for production deployments

## Real API Hookup Guide

### Adding a real social adapter

1. Create `lib/adapters/social/real/[platform]-adapter.ts`
2. Extend `SocialProviderAdapter`
3. Implement `publish()`, `deletePost()`, `validateCredentials()`
4. Set accurate `capabilities` flags
5. Update `lib/adapters/social/index.ts` to return the real adapter when `SOCIAL_ADAPTER !== "mock"`
6. Add required env vars to `.env.example`

Platform-specific notes:
- **Facebook**: `POST /v18.0/{page-id}/feed` via Graph API. Requires `pages_manage_posts` permission.
- **Instagram**: `POST /v18.0/{ig-user-id}/media` + `POST /{ig-user-id}/media_publish` via Meta Content Publishing API. Requires `instagram_content_publish` permission.
- **Bluesky**: `POST /xrpc/com.atproto.repo.createRecord` with lexicon `app.bsky.feed.post`. AT Protocol — no OAuth, use app password.
- **TikTok**: Video required for direct posts. Text posts can use Content Posting API as drafts. Requires `video.publish` scope.
- **YouTube**: `POST /youtube/v3/videos` for upload, `PUT /youtube/v3/videos` for metadata update. OAuth 2.0.
- **Twitch**: Channel title update via `PATCH /helix/channels`. Clip creation via EventSub webhooks.

### Wiring the OpenAI adapter

1. Open `lib/services/llm/openai-adapter.ts`
2. Install the SDK: `npm install openai`
3. Build system prompts using `BandVoiceProfile.toneDescription`, `toneRules`, `bannedPhrases`, and `campaignType`
4. Parse JSON response and map to `GeneratedContent` interface
5. Set `LLM_ADAPTER=openai` and `OPENAI_API_KEY` in `.env.local`

Recommended prompt structure:
```
SYSTEM: You are a social media operator for {band.name}. 
  Voice: {voiceProfile.toneDescription}
  Rules: {voiceProfile.toneRules.join('\n')}
  Never: {voiceProfile.bannedPhrases.join(', ')}
  Platform: {platform} — max {charLimit} chars
  
USER: Write a {campaignType} caption in {contentLength} length for {platform}.
  Context: {context}
  Tone: {toneVariant}
  Output JSON: { caption, hashtags[], ctaText, altText, imagePrompt, fanReplies[] }
```

### Auth / Roles (post-MVP)

For multi-operator teams:
1. Add `NextAuth.js` with credential provider
2. Add `role` field to `User` model (`OWNER` | `EDITOR` | `VIEWER`)
3. Wrap server actions with role checks
4. Add audit log model (`AuditEvent`) for all publish and approve actions

### Production Deployment

- Database: Use managed Postgres (Supabase, Neon, Railway, RDS)
- Worker: Deploy as a separate Node.js process or Fly.io Machine
- Env secrets: Use platform-native secret management, never commit `.env.local`
- Encryption key: Generate with `openssl rand -base64 32`, rotate annually
