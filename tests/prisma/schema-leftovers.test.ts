import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attachDraftMediaSchema, generateContentSchema } from "@/lib/schemas/content";

const root = join(__dirname, "../..");

function readRepo(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

describe("Draft.mediaUrls leftovers", () => {
  it("schema documents mediaUrls as String[] with an empty default", () => {
    const schema = readRepo("prisma/schema.prisma");
    expect(schema).toMatch(/mediaUrls\s+String\[\]\s+@default\(\[\]\)/);
    expect(schema).toMatch(/enum ContentStatus[\s\S]*HELD/);
  });

  it("documents prisma db push as the supported path", () => {
    const docs = readRepo("prisma/README.md");
    expect(docs).toMatch(/prisma db push/);
    expect(docs).toMatch(/Draft\.mediaUrls/);
    expect(docs).toMatch(/ContentStatus\.HELD/);
    expect(docs).toMatch(/does not publish/i);
  });

  it("ships additive SQL for older local databases", () => {
    const mediaSql = readRepo("prisma/sql/0001_draft_media_urls.sql");
    const heldSql = readRepo("prisma/sql/0002_content_status_held.sql");
    expect(mediaSql).toMatch(/ADD COLUMN IF NOT EXISTS "mediaUrls"/);
    expect(heldSql).toMatch(/ADD VALUE IF NOT EXISTS 'HELD'/);
  });

  it("generation and attach schemas accept mediaUrls", () => {
    const generated = generateContentSchema.safeParse({
      bandId: "clhf5gt0000000test0bandid01",
      campaignType: "SHOW_ANNOUNCEMENT",
      platform: "INSTAGRAM",
      mediaUrls: ["https://cdn.example.com/show.jpg"],
    });
    expect(generated.success).toBe(true);

    const attached = attachDraftMediaSchema.safeParse({
      draftId: "clhf5gt0000000test0draftid1",
      mediaUrls: ["https://cdn.example.com/show.jpg"],
      reviewedSnapshot: {
        updatedAt: "2026-09-03T11:00:00.000Z",
        fingerprint: '{"v":1,"r":"LOW","c":"Thursday at The Hive.","h":[],"m":[],"f":[]}',
      },
    });
    expect(attached.success).toBe(true);

    const missingReceipt = attachDraftMediaSchema.safeParse({
      draftId: "clhf5gt0000000test0draftid1",
      mediaUrls: ["https://cdn.example.com/show.jpg"],
    });
    expect(missingReceipt.success).toBe(false);
  });
});
