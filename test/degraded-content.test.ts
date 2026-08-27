import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `6.1`/`6.2` observe the warning reporter through a spawned publish, not
 * through `WarningCollector` directly — a unit test that pushes a warning
 * and reads it back proves the collector works even if the pipeline never
 * pushes into it. Every assertion here reads the `[WARNING]` lines and the
 * written HTML a real child process actually produced.
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = path.join(repoRoot, "src", "index.ts");
const degradedConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "degraded-content-vault",
  "publish.config.yaml",
);
const cleanConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "warnings-vault",
  "publish.config.yaml",
);

function runCli(
  configPath: string,
  outputDir: string,
): { status: number | null; stdout: string; stderr: string } {
  const args = [
    entryPoint,
    "--vault",
    path.dirname(configPath),
    "--config",
    configPath,
    "--output",
    outputDir,
  ];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("6.1 — degradation warnings observed through a spawned publish", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-degraded-observe-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("reports an unresolved wikilink, naming the containing note", () => {
    // Degradation warnings are only ever pushed while rendering a note, and
    // rendering only happens when an output directory is given — the
    // stopgap two-argument invocation skips site generation entirely
    // (block `6.3`'s to remove). This block observes the warnings a real
    // publish produces, so it drives the CLI the way a real publish does.
    const result = runCli(degradedConfigPath, outputDir);

    expect(result.stderr).toContain(
      '[WARNING] Index.md: wikilink to "Missing Note" could not be resolved and was rendered as plain text',
    );
  });

  it("reports a dropped Bases query block, naming the containing note", () => {
    const result = runCli(degradedConfigPath, outputDir);

    expect(result.stderr).toContain("[WARNING] Index.md: Bases query block was dropped");
  });

  it("reports no degradation warning line when every link resolves and no block is dropped", () => {
    // warnings-vault has unmatched-entry and floor-withheld warnings — those
    // are selection-level, not degradation, and this scenario permits them
    // to appear. None of its published notes carry a wikilink or a Bases
    // block, so no degradation line should appear alongside them. An output
    // dir is required here, not optional: degradation warnings are only
    // ever pushed while rendering runs, and rendering is skipped entirely
    // when the third positional is absent — without it this test can never
    // observe a real degradation push, only its own absence.
    const result = runCli(cleanConfigPath, outputDir);

    expect(result.status).toBe(0);
    const lines = result.stderr.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/wikilink to|embed of|Bases query block was dropped/);
    }
  });
});

describe("6.2 — warnings never fail a publish", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-degraded-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("exits 0, ships the degraded page, and reports every warning, for a vault producing many warnings", async () => {
    const result = runCli(degradedConfigPath, outputDir);

    expect(result.status).toBe(0);

    const lines = result.stderr.trim().split("\n");
    expect(lines).toContain(
      '[WARNING] Index.md: wikilink to "Missing Note" could not be resolved and was rendered as plain text',
    );
    expect(lines).toContain(
      '[WARNING] Index.md: wikilink to "Also Missing" could not be resolved and was rendered as plain text',
    );
    expect(lines).toContain("[WARNING] Index.md: Bases query block was dropped");

    const page = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(page).toContain("<title>Degraded Content</title>");
    // The unresolved link is plain text, not an anchor — asserting exit 0
    // alone would not distinguish a real publish from one that silently
    // wrote nothing.
    expect(page).toContain("See Missing Note and Also Missing for pages that do not exist.");
    expect(page).not.toContain('<a href="/Missing Note.html">');
    expect(page).not.toMatch(/<a[^>]*>Missing Note<\/a>/);
    expect(page).not.toContain('<a href="/Also Missing.html">');
    expect(page).not.toMatch(/<a[^>]*>Also Missing<\/a>/);
  });
});
