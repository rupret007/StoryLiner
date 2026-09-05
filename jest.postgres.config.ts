import type { Config } from "jest";
import baseConfig from "./jest.config";
import { existsSync } from "node:fs";
import { join } from "node:path";

// This opt-in suite must never borrow an operator database or provider environment.
const fixtureUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (
  process.env.STORYLINER_POSTGRES_FIXTURE !== "1" ||
  fixtureUrl.protocol !== "postgresql:" ||
  !["localhost", "127.0.0.1"].includes(fixtureUrl.hostname) ||
  fixtureUrl.port !== "59319" ||
  fixtureUrl.pathname !== "/storyliner_campaign_test" ||
  fixtureUrl.username !== "storyliner_fixture" ||
  fixtureUrl.password !== "storyliner_fixture" ||
  fixtureUrl.search || fixtureUrl.hash ||
  ![undefined, "docker"].includes(process.env.STORYLINER_POSTGRES_FIXTURE_LAYOUT) ||
  process.env.LLM_ADAPTER !== "mock" || process.env.SOCIAL_ADAPTER !== "mock"
) {
  throw new Error("PostgreSQL proof requires the explicit isolated StoryLiner fixture endpoint and mock adapters.");
}

for (const name of [
  ".env", ".env.local", ".env.test", ".env.test.local", ".env.development",
  ".env.development.local", ".env.production", ".env.production.local", "prisma/.env",
]) {
  if (existsSync(join(__dirname, name))) {
    throw new Error("PostgreSQL proof refuses local environment files.");
  }
}
for (const name of [
  "OPENAI_API_KEY", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ID",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
]) {
  if (process.env[name]) throw new Error("PostgreSQL proof refuses provider credentials.");
}

const config: Config = {
  ...baseConfig,
  testEnvironment: "node",
  testMatch: ["**/tests/integration/*.postgres.ts"],
  maxWorkers: 1,
  testTimeout: 20_000,
  collectCoverage: false,
};

export default config;
