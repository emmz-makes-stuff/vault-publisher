import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = path.join(repoRoot, "src", "index.ts");
const fixturesDir = path.join(repoRoot, "test", "fixtures", "config");
const warningsConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "warnings-vault",
  "publish.config.yaml",
);
const warningsExcludedNotePath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "warnings-vault",
  "CLAUDE.md",
);

function runCli(configPath: string): { status: number | null; stdout: string; stderr: string } {
  // Node 24 strips TypeScript syntax natively, so the source runs directly —
  // no build step, no dist/ output to go stale against these tests.
  const result = spawnSync(process.execPath, [entryPoint, configPath], {
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("CLI entry point", () => {
  it("exits non-zero and writes nothing to stdout on malformed config", () => {
    const result = runCli(path.join(fixturesDir, "malformed.yaml"));

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
  });

  it("exits non-zero and writes nothing to stdout when the config is unreadable", () => {
    // A directory passed as the config path cannot be read as a file.
    const result = runCli(fixturesDir);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
  });

  it("exits zero on a valid config", () => {
    const result = runCli(path.join(fixturesDir, "valid.yaml"));

    expect(result.status).toBe(0);
  });
});

describe("CLI entry point — 3.6 unmatched and floor-withheld warnings", () => {
  it("reports each unmatched entry and each directly-excluded entry on stderr, and still exits 0", () => {
    const result = runCli(warningsConfigPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");

    const lines = result.stderr.trim().split("\n");
    expect(lines).toContain(
      '[WARNING] publish.config.yaml: no path in the vault matches "Handbook/Missing.md"',
    );
    expect(lines).toContain(
      '[WARNING] publish.config.yaml: "Journal/" is excluded and will not publish',
    );
    expect(lines).toContain(
      '[WARNING] publish.config.yaml: "CLAUDE.md" is excluded and will not publish',
    );
    // Exactly these three — a matched, non-excluded entry (Handbook) earns no line.
    expect(lines).toHaveLength(3);
  });

  it("covers a notes: entry naming a directly-excluded file, not just a folders: entry", async () => {
    // Prove the fixture actually contains the excluded file this test claims,
    // not an absent path that would make the warning vacuous.
    const content = await readFile(warningsExcludedNotePath, "utf8");
    expect(content).toContain("Invented Root File");

    const result = runCli(warningsConfigPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      '[WARNING] publish.config.yaml: "CLAUDE.md" is excluded and will not publish',
    );
  });
});
