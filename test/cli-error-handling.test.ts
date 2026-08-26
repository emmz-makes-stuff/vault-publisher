import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const integrationVaultConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "integration-vault",
  "publish.config.yaml",
);

/**
 * `publishSite`'s only known throw (`OutputPathCollisionError`) needs two
 * real vault files whose output paths collide — the vault-root `Index.md`
 * and a literal `index.md` beside it — and every machine this repo runs on
 * (this one included) has a case-insensitive filesystem, so those two
 * cannot coexist as distinct directory entries to walk for real. `writeSite`
 * is mocked to throw the same error it throws in production instead, so
 * this test exercises `main()`'s real catch/print/exitCode handling of a
 * real `publishSite` failure — the only thing that couldn't be exercised
 * with real files here.
 */
vi.mock("../src/writer.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/writer.ts")>("../src/writer.ts");
  return {
    ...actual,
    writeSite: vi.fn((): Promise<void> => {
      throw new actual.OutputPathCollisionError(
        'output path collision: notes "Index.md" and "index.md" all resolve to output path "index.html"',
      );
    }),
  };
});

describe("main() — publishSite failures use the same convention loadConfig errors do", () => {
  let outputDir: string;
  let stderrChunks: string[];
  const originalExitCode = process.exitCode;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-cli-collision-"));
    process.exitCode = undefined;
    stderrChunks = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderrChunks.push(chunk.toString());
      return true;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    await rm(outputDir, { recursive: true, force: true });
  });

  it("prints a clean message, sets a non-zero exit code, no stack trace, and still reports warnings collected before the failure", async () => {
    const { main } = await import("../src/cli.ts");
    await main(["node", "index.ts", integrationVaultConfigPath, outputDir]);

    const stderr = stderrChunks.join("");
    const lines = stderr.trim().split("\n");

    expect(process.exitCode).toBe(1);
    expect(stderr).toContain(
      'output path collision: notes "Index.md" and "index.md" all resolve to output path "index.html"',
    );
    // No stack-trace frame — a Node error's stack lines are indented "at …".
    expect(lines.some((line) => /^\s*at /.test(line))).toBe(false);
    // A warning discovered while rendering, before the write that failed,
    // still reaches the output rather than being discarded with the crash.
    expect(stderr).toContain(
      '[WARNING] Index.md: wikilink to "Confidential Client" could not be resolved and was rendered as plain text',
    );
  });
});
