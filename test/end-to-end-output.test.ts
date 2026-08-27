import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `6.4` verifies end to end, through a spawned publish, that the output
 * directory holds *exactly* the published set — and, per the Product
 * Owner's decision recorded in the DEVLOG ahead of this block, that a
 * republish into a reused directory makes that true again rather than
 * merely warning. §5's supervisor reproduced the hazard this closes:
 * publish, drop a note from the config, publish again into the same
 * directory — the dropped note kept serving its page and its full body.
 * Every reuse test here therefore runs the CLI *twice into the same
 * directory*, on purpose — a fresh directory each time is the one
 * configuration where this hazard is invisible.
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = path.join(repoRoot, "src", "index.ts");
const vaultRoot = path.join(repoRoot, "test", "fixtures", "end-to-end-vault");
const fullConfigPath = path.join(vaultRoot, "publish.config.yaml");
const reducedConfigPath = path.join(vaultRoot, "publish.config.reduced.yaml");
const ONBOARDING_BODY_MARKER = "ONBOARDING-BODY-MARKER-7f3c9a";
const MARKER_FILENAME = ".vault-publisher-output";

function runCli(
  configPath: string,
  outputDir: string,
): { status: number | null; stdout: string; stderr: string } {
  const args = [entryPoint, "--vault", vaultRoot, "--config", configPath, "--output", outputDir];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Every path under `dir`, recursive, relative to `dir` with POSIX
 * separators — walked by hand rather than `readdir`'s `recursive: true`
 * option: the sync and async forms of Node's recursive readdir disagree on
 * whether they descend a symlinked directory, and a check this
 * security-relevant has no business resting on which one happened to be in
 * scope (see `no-client-js.test.ts`, which takes the same posture).
 */
async function allFilesRelative(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await allFilesRelative(path.join(dir, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

describe("end to end — the output directory holds exactly the published set, nothing else", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-e2e-exact-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("matches the full expected file set exactly, in both directions", async () => {
    const result = runCli(fullConfigPath, outputDir);
    expect(result.status).toBe(0);

    const actual = (await allFilesRelative(outputDir)).sort();
    const expected = [
      MARKER_FILENAME,
      "styles.css",
      "index.html",
      "Handbook/Onboarding.html",
    ].sort();

    expect(actual).toStrictEqual(expected);
  });
});

describe("end to end — reusing the output directory after dropping a note from the config", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-e2e-reuse-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("stops serving the dropped note's file and its body text, anywhere in the tree", async () => {
    const first = runCli(fullConfigPath, outputDir);
    expect(first.status).toBe(0);
    const onboardingPath = path.join(outputDir, "Handbook", "Onboarding.html");
    await expect(readFile(onboardingPath, "utf8")).resolves.toContain(ONBOARDING_BODY_MARKER);

    const second = runCli(reducedConfigPath, outputDir);
    expect(second.status).toBe(0);

    await expect(readFile(onboardingPath, "utf8")).rejects.toThrow();

    const remainingFiles = await allFilesRelative(outputDir);
    for (const relativePath of remainingFiles) {
      const content = await readFile(path.join(outputDir, relativePath), "utf8").catch(() => "");
      expect(content).not.toContain(ONBOARDING_BODY_MARKER);
    }

    expect(remainingFiles.sort()).toStrictEqual(
      [MARKER_FILENAME, "styles.css", "index.html"].sort(),
    );
  });
});

describe("end to end — the guard refuses a non-empty output directory with no marker", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-e2e-guard-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("exits non-zero with a clean message and leaves every pre-existing file byte-identical", async () => {
    await mkdir(path.join(outputDir, "someone-elses-stuff"), { recursive: true });
    await writeFile(path.join(outputDir, "index.html"), "not ours", "utf8");
    await writeFile(
      path.join(outputDir, "someone-elses-stuff", "important.txt"),
      "do not delete me",
      "utf8",
    );

    const before = new Map<string, string>();
    for (const relativePath of await allFilesRelative(outputDir)) {
      before.set(relativePath, await readFile(path.join(outputDir, relativePath), "utf8"));
    }

    const result = runCli(fullConfigPath, outputDir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain("\n    at "); // no raw Node stack trace
    expect(result.stderr.trim().length).toBeGreaterThan(0);

    const after = new Map<string, string>();
    for (const relativePath of await allFilesRelative(outputDir)) {
      after.set(relativePath, await readFile(path.join(outputDir, relativePath), "utf8"));
    }
    expect(after).toStrictEqual(before);
  });
});

describe("end to end — refuses an output directory that is the vault root or inside it", () => {
  it("refuses the vault root itself: non-zero, nothing written, nothing deleted", async () => {
    const before = (await allFilesRelative(vaultRoot)).sort();

    const result = runCli(fullConfigPath, vaultRoot);

    expect(result.status).not.toBe(0);
    const after = (await allFilesRelative(vaultRoot)).sort();
    expect(after).toStrictEqual(before);
    expect(after).not.toContain(MARKER_FILENAME);
  });

  it("refuses a non-empty directory inside the vault: non-zero, nothing written, nothing deleted", async () => {
    const insideVault = path.join(vaultRoot, "Handbook");
    const before = (await allFilesRelative(insideVault)).sort();

    const result = runCli(fullConfigPath, insideVault);

    expect(result.status).not.toBe(0);
    const after = (await allFilesRelative(insideVault)).sort();
    expect(after).toStrictEqual(before);
  });

  // An *empty* directory freshly created inside the vault would sail past
  // `ensureOutputDirectoryReadyForPublish`'s marker guard on its own — that
  // guard has nothing to object to in an empty directory. This isolates
  // the vault-containment refusal from the marker guard: only the
  // containment check stands between this directory and being written to.
  it("refuses a freshly created, empty directory inside the vault, with nothing to guard it but containment", async () => {
    const emptyInsideVault = path.join(vaultRoot, "empty-dir-inside-vault-for-containment-test");
    await mkdir(emptyInsideVault, { recursive: true });

    try {
      const result = runCli(fullConfigPath, emptyInsideVault);

      expect(result.status).not.toBe(0);
      expect(await allFilesRelative(emptyInsideVault)).toStrictEqual([]);
    } finally {
      await rm(emptyInsideVault, { recursive: true, force: true });
    }
  });
});

// The reviewer's reproduction for `6.4`'s remediation: `--output` given as a
// symlink whose *target* is a real, already-marked directory inside the
// vault. A naive `path.resolve` comparison never sees this — the symlink's
// own path never shares a prefix with the vault root — while `readdir`/`rm`
// follow it straight through to the real, in-vault target. This isolates
// the real-path resolution the fix adds from every other guard: the marker
// is present (so the reuse-clearing branch is what's on the line, not the
// unrecognised-directory refusal) and the target is genuinely inside the
// vault (so this is the write-side mirror of the read-side symlink hazard
// `isWithinVaultBoundary` already defends against).
describe("end to end — a symlinked --output whose target sits inside the vault", () => {
  it("refuses through the symlink, leaving the real in-vault file byte-identical and writing nothing", async () => {
    const targetInsideVault = path.join(vaultRoot, "symlink-target-inside-vault");
    const outputSymlink = await mkdtemp(path.join(tmpdir(), "vault-publisher-e2e-symlink-"));
    await rm(outputSymlink, { recursive: true, force: true }); // symlink() requires the link path to not exist
    const preexistingContent = "TOP_SECRET_CLIENT_DATA_MUST_SURVIVE";
    const secretPath = path.join(targetInsideVault, "secret-leftover.txt");

    await mkdir(targetInsideVault, { recursive: true });
    await writeFile(path.join(targetInsideVault, MARKER_FILENAME), "", "utf8");
    await writeFile(secretPath, preexistingContent, "utf8");

    try {
      await symlink(targetInsideVault, outputSymlink, "dir");

      const result = runCli(fullConfigPath, outputSymlink);

      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain("\n    at "); // no raw Node stack trace
      expect(result.stderr.trim().length).toBeGreaterThan(0);

      await expect(readFile(secretPath, "utf8")).resolves.toBe(preexistingContent);

      const remainingFiles = (await allFilesRelative(targetInsideVault)).sort();
      expect(remainingFiles).toStrictEqual([MARKER_FILENAME, "secret-leftover.txt"].sort());
      expect(remainingFiles).not.toContain("index.html");
    } finally {
      await rm(outputSymlink, { recursive: true, force: true });
      await rm(targetInsideVault, { recursive: true, force: true });
    }
  });
});

// The reviewer's second reproduction, after the first fix: `--output`
// itself does not exist yet, so `realpath` on the full path throws `ENOENT`
// — but a *parent* of that not-yet-created path is a symlink whose target
// is real and inside the vault. A leaf-only fallback (plain `path.resolve`
// on `ENOENT`) never dereferences that parent, so the resulting location is
// physically inside the vault while the string comparison never sees it.
describe("end to end — a not-yet-created --output reached through a symlinked ancestor inside the vault", () => {
  it("refuses when the symlink is the immediate parent, writing nothing inside the vault", async () => {
    const realParentInsideVault = path.join(vaultRoot, "real-parent-inside-vault");
    const parentSymlink = await mkdtemp(path.join(tmpdir(), "vault-publisher-e2e-parent-symlink-"));
    await rm(parentSymlink, { recursive: true, force: true });

    await mkdir(realParentInsideVault, { recursive: true });

    try {
      await symlink(realParentInsideVault, parentSymlink, "dir");
      const notYetCreatedOutput = path.join(parentSymlink, "not-yet-created-output");

      const result = runCli(fullConfigPath, notYetCreatedOutput);

      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain("\n    at ");
      expect(result.stderr.trim().length).toBeGreaterThan(0);

      expect(await allFilesRelative(realParentInsideVault)).toStrictEqual([]);
    } finally {
      await rm(parentSymlink, { recursive: true, force: true });
      await rm(realParentInsideVault, { recursive: true, force: true });
    }
  });

  it("refuses when the symlink is several levels above a chain of not-yet-created segments", async () => {
    const realAncestorInsideVault = path.join(vaultRoot, "real-ancestor-inside-vault");
    const ancestorSymlink = await mkdtemp(
      path.join(tmpdir(), "vault-publisher-e2e-ancestor-symlink-"),
    );
    await rm(ancestorSymlink, { recursive: true, force: true });

    await mkdir(realAncestorInsideVault, { recursive: true });

    try {
      await symlink(realAncestorInsideVault, ancestorSymlink, "dir");
      // Neither `deeply` nor `nested` nor `output` exists yet — the whole
      // remainder past the symlink is a chain of nonexistent segments.
      const notYetCreatedOutput = path.join(ancestorSymlink, "deeply", "nested", "output");

      const result = runCli(fullConfigPath, notYetCreatedOutput);

      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain("\n    at ");
      expect(result.stderr.trim().length).toBeGreaterThan(0);

      expect(await allFilesRelative(realAncestorInsideVault)).toStrictEqual([]);
    } finally {
      await rm(ancestorSymlink, { recursive: true, force: true });
      await rm(realAncestorInsideVault, { recursive: true, force: true });
    }
  });
});
