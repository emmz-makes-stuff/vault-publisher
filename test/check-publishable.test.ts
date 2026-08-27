import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * scripts/check-publishable.sh is the publishability gate: it greps the
 * tracked tree (or explicit paths, for these tests) for anything that would
 * leak the client-confidential vault this repository publishes — generic
 * hostname/email patterns needing no secret, plus literal identifiers read
 * from a list. See DEVLOG.md, section 7, "Publishability gate".
 *
 * Every fixture string below is invented. None of it is the real vault name,
 * a real hostname, or a real identifier — a fixture containing the real
 * thing would put it back in the repository this tool exists to keep it out
 * of.
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = path.join(repoRoot, "scripts", "check-publishable.sh");

let scratchDir: string;

beforeEach(async () => {
  scratchDir = await mkdtemp(path.join(tmpdir(), "check-publishable-"));
});

afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

// Trimmed PATH so `#!/usr/bin/env bash` resolves to the platform's stock
// interpreter (macOS: /bin/bash 3.2) rather than a newer Homebrew bash that
// happens to be ahead on this machine's ambient PATH. bash 3.2 rejects a bare
// `"${array[@]}"` expansion of an empty array under `set -u` — a real
// portability hazard the script must survive, not an artifact of dev-machine
// PATH order. See DEVLOG section 7, reviewer finding on the publishability
// gate.
const TRIMMED_PATH = "/usr/bin:/bin";

function run(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  const merged: NodeJS.ProcessEnv = { ...process.env };
  merged.PUBLISHABLE_LIST_OPTIONAL = undefined;
  merged.PATH = TRIMMED_PATH;
  for (const [key, value] of Object.entries(env)) {
    merged[key] = value;
  }
  const result = spawnSync(scriptPath, args, { encoding: "utf8", env: merged });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

async function writeIdentifierList(lines: string[]): Promise<string> {
  const listPath = path.join(scratchDir, "identifiers.txt");
  await writeFile(listPath, lines.join("\n") + "\n", "utf8");
  return listPath;
}

describe("check-publishable.sh", () => {
  it("exits 0 over a clean tree with a non-empty identifier list", async () => {
    await writeFile(path.join(scratchDir, "note.md"), "nothing interesting here\n", "utf8");
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status, stdout } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).toBe(0);
    expect(stdout).toMatch(/scanned 1 file/);
  });

  it("fails on a planted *.workers.dev hostname", async () => {
    await writeFile(
      path.join(scratchDir, "note.md"),
      "the address is fictional-example.workers.dev\n",
      "utf8",
    );
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status, stdout } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).not.toBe(0);
    expect(stdout).toContain("fictional-example.workers.dev");
  });

  it("fails on a planted bare email address", async () => {
    await writeFile(path.join(scratchDir, "note.md"), "contact person@example.com\n", "utf8");
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status, stdout } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).not.toBe(0);
    expect(stdout).toContain("person@example.com");
  });

  it("allows noreply@anthropic.com through the email pattern", async () => {
    await writeFile(
      path.join(scratchDir, "note.md"),
      "Co-Authored-By: Claude <noreply@anthropic.com>\n",
      "utf8",
    );
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).toBe(0);
  });

  it("allows noreply@notify.cloudflare.com through the email pattern", async () => {
    await writeFile(
      path.join(scratchDir, "note.md"),
      "sent by noreply@notify.cloudflare.com\n",
      "utf8",
    );
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).toBe(0);
  });

  it("does not trip on the honest DEVLOG placeholder forms", async () => {
    await writeFile(
      path.join(scratchDir, "note.md"),
      "see <team>.cloudflareaccess.com and *.workers.dev and " +
        "<WORKER_NAME>.<YOUR_SUBDOMAIN>.workers.dev\n",
      "utf8",
    );
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).toBe(0);
  });

  it("fails on a planted literal identifier read from $VP_IDENTIFIERS", async () => {
    await writeFile(
      path.join(scratchDir, "note.md"),
      "mentions FictionalClientName-Zephyr in passing\n",
      "utf8",
    );
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status, stdout } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).not.toBe(0);
    expect(stdout).toContain("FictionalClientName-Zephyr");
  });

  it("matches literal identifiers case-insensitively", async () => {
    await writeFile(
      path.join(scratchDir, "note.md"),
      "mentions fictionalclientname-zephyr in passing\n",
      "utf8",
    );
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).not.toBe(0);
  });

  it("fails when the identifier list is missing and PUBLISHABLE_LIST_OPTIONAL is unset", async () => {
    await writeFile(path.join(scratchDir, "note.md"), "nothing interesting here\n", "utf8");
    const missingListPath = path.join(scratchDir, "does-not-exist.txt");

    const { status, stderr } = run([scratchDir], {
      VP_IDENTIFIERS: missingListPath,
      PUBLISHABLE_LIST_OPTIONAL: undefined,
    });

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/ERROR/);
  });

  it("skips loudly and exits 0 when the list is missing and PUBLISHABLE_LIST_OPTIONAL=1", async () => {
    await writeFile(path.join(scratchDir, "note.md"), "nothing interesting here\n", "utf8");
    const missingListPath = path.join(scratchDir, "does-not-exist.txt");

    const { status, stdout, stderr } = run([scratchDir], {
      VP_IDENTIFIERS: missingListPath,
      PUBLISHABLE_LIST_OPTIONAL: "1",
    });

    expect(status).toBe(0);
    expect(stdout + stderr).toMatch(/SKIPPED/);
  });

  it("fails when the list is present but only comments/blank lines", async () => {
    await writeFile(path.join(scratchDir, "note.md"), "nothing interesting here\n", "utf8");
    const listPath = await writeIdentifierList(["# just a comment", "", "   "]);

    const { status, stderr } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/ERROR/);
  });

  it("fails on an empty scan set even with PUBLISHABLE_LIST_OPTIONAL=1", async () => {
    const emptyDir = path.join(scratchDir, "empty");
    await mkdir(emptyDir);

    const { status, stdout, stderr } = run([emptyDir], {
      VP_IDENTIFIERS: "/dev/null",
      PUBLISHABLE_LIST_OPTIONAL: "1",
    });

    expect(status).not.toBe(0);
    expect(stdout + stderr).toMatch(/scanned 0 file/);
  });

  it("prints the number of files scanned on a passing run", async () => {
    await writeFile(path.join(scratchDir, "a.md"), "clean\n", "utf8");
    await writeFile(path.join(scratchDir, "b.md"), "also clean\n", "utf8");
    const listPath = await writeIdentifierList(["FictionalClientName-Zephyr"]);

    const { status, stdout } = run([scratchDir], { VP_IDENTIFIERS: listPath });

    expect(status).toBe(0);
    expect(stdout).toMatch(/scanned 2 file/);
  });
});
