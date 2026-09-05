import type { Config } from "jest";

const names = [
  "DATABASE_URL", "STORYLINER_POSTGRES_FIXTURE", "STORYLINER_POSTGRES_FIXTURE_LAYOUT",
  "LLM_ADAPTER", "SOCIAL_ADAPTER", "OPENAI_API_KEY", "FACEBOOK_PAGE_ACCESS_TOKEN",
  "FACEBOOK_PAGE_ID", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN",
] as const;
let previous: Map<string, string | undefined>;

beforeEach(() => {
  previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.STORYLINER_POSTGRES_FIXTURE = "1";
  process.env.DATABASE_URL = "postgresql://storyliner_fixture:storyliner_fixture@127.0.0.1:59319/storyliner_campaign_test";
  process.env.LLM_ADAPTER = "mock";
  process.env.SOCIAL_ADAPTER = "mock";
});

afterEach(() => {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function config() {
  let value!: Config;
  await jest.isolateModulesAsync(async () => {
    value = (await import("../../jest.postgres.config")).default;
  });
  return value;
}

describe("dedicated PostgreSQL fixture gate before Prisma or database access", () => {
  it.each([undefined, "docker"])("accepts only the isolated endpoint with layout %s", async (layout) => {
    if (layout !== undefined) process.env.STORYLINER_POSTGRES_FIXTURE_LAYOUT = layout;
    const verified = await config();
    expect(verified.testMatch).toEqual(["**/tests/integration/*.postgres.ts"]);
    expect(verified.maxWorkers).toBe(1);
  });

  it.each(["production", "", "Docker", "remote"])("rejects unrecognized layout %s", async (layout) => {
    process.env.STORYLINER_POSTGRES_FIXTURE_LAYOUT = layout;
    await expect(config()).rejects.toThrow(/explicit isolated/);
  });

  it.each([
    "postgresql://storyliner_fixture:storyliner_fixture@127.0.0.1:5432/storyliner_campaign_test",
    "postgresql://storyliner_fixture:storyliner_fixture@192.168.1.2:59319/storyliner_campaign_test",
    "postgresql://storyliner_fixture:storyliner_fixture@127.0.0.1:59319/storyliner",
    "postgresql://operator:storyliner_fixture@127.0.0.1:59319/storyliner_campaign_test",
    "postgresql://storyliner_fixture:owner-password@127.0.0.1:59319/storyliner_campaign_test",
    "postgresql://storyliner_fixture:storyliner_fixture@127.0.0.1:59319/storyliner_campaign_test?schema=other",
  ])("rejects an endpoint outside the exact synthetic fixture: %s", async (url) => {
    process.env.DATABASE_URL = url;
    await expect(config()).rejects.toThrow(/explicit isolated/);
  });

  it("requires explicit opt-in, even for an otherwise valid fixture endpoint", async () => {
    delete process.env.STORYLINER_POSTGRES_FIXTURE;
    await expect(config()).rejects.toThrow(/explicit isolated/);
  });

  it.each(["LLM_ADAPTER", "SOCIAL_ADAPTER"])("refuses non-mock %s", async (name) => {
    process.env[name] = name === "LLM_ADAPTER" ? "openai" : "real";
    await expect(config()).rejects.toThrow(/explicit isolated/);
  });

  it("refuses a provider credential before loading any real database test", async () => {
    process.env.OPENAI_API_KEY = "synthetic-not-a-real-key";
    await expect(config()).rejects.toThrow(/provider credentials/);
  });
});
