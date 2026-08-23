-- Leftover additive column from the fail-closed live-publish work.
-- Safe to re-run. Empty array means caption-only.
-- Prefer `npx prisma db push` unless you are patching an older local DB by hand.

ALTER TABLE "Draft"
  ADD COLUMN IF NOT EXISTS "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
