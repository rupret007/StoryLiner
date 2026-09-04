import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("local deployment boundary", () => {
  const root = join(__dirname, "../..");
  const compose = readFileSync(join(root, "compose.yaml"), "utf8");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const architecture = readFileSync(join(root, "docs/architecture.md"), "utf8");
  const qualityReview = readFileSync(join(root, "docs/quality-review.md"), "utf8");

  it("publishes the unauthenticated app to IPv4 loopback only", () => {
    expect(compose).toMatch(/^\s*- "127\.0\.0\.1:3000:3000"\s*$/m);
    expect(compose).not.toMatch(/^\s*- "3000:3000"\s*$/m);
    expect(compose).not.toMatch(/^\s*- "0\.0\.0\.0:3000:3000"\s*$/m);
  });

  it("does not publish Postgres or the worker on a host port", () => {
    const databaseBlock = compose.slice(
      compose.indexOf("  db:"),
      compose.indexOf("  migrate:")
    );
    const workerBlock = compose.slice(compose.indexOf("  worker:"));
    expect(databaseBlock).not.toMatch(/^\s+ports:\s*$/m);
    expect(workerBlock).not.toMatch(/^\s+ports:\s*$/m);
  });

  it("documents loopback as a safety fence, not authentication", () => {
    for (const document of [readme, architecture, qualityReview]) {
      expect(document).toMatch(/127\.0\.0\.1/);
      expect(document).toMatch(/request-level auth|request-level operator auth/i);
    }
    expect(readme).toMatch(/Do not expose this port to a LAN or the public internet/i);
    expect(architecture).toMatch(/loopback is not authentication/i);
  });
});
