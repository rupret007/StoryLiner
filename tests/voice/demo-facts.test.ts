import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

describe("demo voice-facts hygiene", () => {
  it("does not invent a Trailer Swift voice in seed or mock pools", () => {
    const seed = readFileSync(join(root, "prisma/seed.ts"), "utf8");
    const mockLlm = readFileSync(join(root, "lib/services/llm/mock-adapter.ts"), "utf8");
    const openai = readFileSync(join(root, "lib/services/llm/openai-adapter.ts"), "utf8");

    expect(seed).not.toMatch(/trailer\s*swift/i);
    expect(mockLlm).not.toMatch(/trailer\s*swift/i);
    expect(openai).toMatch(/Never mention Trailer Swift/);
    expect(openai).not.toMatch(/you are trailer swift/i);
  });

  it("labels seed knowledge as demo-unconfirmed so it is not Jeff canon", () => {
    const seed = readFileSync(join(root, "prisma/seed.ts"), "utf8");
    expect(seed).toMatch(/DEMO — unconfirmed/);
    expect(seed).toMatch(/demo-unconfirmed/);
    expect(seed).toMatch(/Jeff owns canon/);
  });

  it("keeps Stalemate and Rad Dad as the only seeded bands", () => {
    const seed = readFileSync(join(root, "prisma/seed.ts"), "utf8");
    expect(seed).toMatch(/slug: "stalemate"/);
    expect(seed).toMatch(/slug: "rad-dad"/);
    expect(seed).not.toMatch(/slug: "trailer-swift"/);
  });
});
