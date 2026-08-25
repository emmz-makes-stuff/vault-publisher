import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = path.join(repoRoot, "src", "index.ts");
const fixturesDir = path.join(repoRoot, "test", "fixtures", "config");

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
