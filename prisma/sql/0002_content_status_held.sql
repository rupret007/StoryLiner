-- Review-queue Hold. Parks a draft. Does not publish.
-- Prefer `npx prisma db push`. ADD VALUE cannot run inside a transaction
-- on some Postgres versions — run this statement alone if applying by hand.

ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'HELD';
