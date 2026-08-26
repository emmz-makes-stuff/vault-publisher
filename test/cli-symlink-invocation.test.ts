import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = path.join(repoRoot, "src", "index.ts");
const integrationVaultConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "integration-vault",
  "publish.config.yaml",
);

/**
 * The entry point used to decide whether to run `main()` by comparing
 * `import.meta.url` (the module's resolved real path) against
 * `process.argv[1]` (the path as given). Every other CLI test in this
 * suite spawns `entryPoint` by its real path, so that comparison was never
 * false anywhere the suite could see — invoked through a symlink it is
 * false, `main()` never runs, and the process exits 0 having written and
 * printed nothing. This test is the only one in the suite that spawns
 * through a symlink, precisely so that failure mode can't hide again
 * behind an entry point that only ever gets invoked by its real path.
 */
describe("CLI entry point — invoked through a symlink", () => {
  let symlinkDir: string;
  let symlinkedEntryPoint: string;
  let outputDir: string;

  beforeEach(async () => {
    symlinkDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-symlink-"));
    symlinkedEntryPoint = path.join(symlinkDir, "index.ts");
    await symlink(entryPoint, symlinkedEntryPoint);
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-symlink-out-"));
  });

  afterEach(async () => {
    await rm(symlinkDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });

  it("still runs and writes the site when the entry point is reached through a symlink", async () => {
    const result = spawnSync(
      process.execPath,
      [symlinkedEntryPoint, integrationVaultConfigPath, outputDir],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);

    const frontPage = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(frontPage).toContain("<title>Welcome</title>");
  });
});
