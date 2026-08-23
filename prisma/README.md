# Prisma / database

StoryLiner uses **`prisma db push`** as the supported local and compose path. There is no checked-in migrate history yet. Do not invent a second schema.

## After you pull

```bash
npx prisma generate
npm run db:push
```

`db:push` applies `schema.prisma` to the current `DATABASE_URL`. It is additive for this repo:

| Change | Why |
|---|---|
| `Draft.mediaUrls String[] @default([])` | Worker can forward public https media. Empty means caption-only. |
| `ContentStatus.HELD` | Review-queue Hold. Parks a draft. Does not publish. |

If `db push` reports the database is already in sync, you are done.

## Existing databases created before mediaUrls

If a local DB was pushed before PR #3, `Draft.mediaUrls` may be missing. Either:

```bash
npm run db:push
```

or apply the leftover SQL by hand:

```bash
psql "$DATABASE_URL" -f prisma/sql/0001_draft_media_urls.sql
psql "$DATABASE_URL" -f prisma/sql/0002_content_status_held.sql
```

Then `npx prisma generate`.

## What not to do

- Do not run `prisma migrate reset` against a live database.
- Do not treat seed knowledge as Jeff-approved canon. Historical demo facts are tagged `demo-unconfirmed`.
- `db:push` does not publish anything. Publishing still requires Approve → Schedule → worker, and only Facebook / Instagram / YouTube can go live.
