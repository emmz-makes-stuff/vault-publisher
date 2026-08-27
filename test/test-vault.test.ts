import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The committed `test-vault/` at the repository root is the standing fixture
 * for section 7 and beyond (DEVLOG, section 7, "Product Owner decisions,
 * 2026-08-27"). This is what keeps it from being scaffolding a CI workflow
 * alone touches: every publish, floor, and degradation property it was built
 * to demonstrate is asserted here too, over a real spawned CLI run.
 *
 * Markers below are the exact strings written into the vault's fixture
 * notes — grep-able, not eyeballed. `publish.config.yaml` deliberately
 * *names* every floor entry — `Journal`, `Private`, `.obsidian`, `.claude`
 * and `CLAUDE.md` — as folders/notes to publish alongside the real
 * published set. That's what proves the floor overrides configuration
 * rather than merely happening to agree with a config that never asked for
 * them; a config that simply never selects `Journal/` would leave its
 * exclusion untested — deleting an entry from `EXCLUSION_FLOOR` would
 * redden nothing, since allow-list selection alone already keeps it out.
 * See note-selection's "an excluded path SHALL NOT be published under any
 * configuration". All five floor entries are covered here.
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = path.join(repoRoot, "src", "index.ts");
const vaultRoot = path.join(repoRoot, "test-vault");
const configPath = path.join(vaultRoot, "publish.config.yaml");
const MARKER_FILENAME = ".vault-publisher-output";

const FLOOR_MARKERS = [
  "VP-TESTVAULT-FLOOR-JOURNAL-5r9x",
  "VP-TESTVAULT-FLOOR-PRIVATE-2w6t",
  "VP-TESTVAULT-FLOOR-OBSIDIAN-7h1z",
  "VP-TESTVAULT-FLOOR-ROOTCLAUDE-9f2k",
  "VP-TESTVAULT-FLOOR-DOTCLAUDE-3m8q",
];

const UNSELECTED_MARKERS = [
  "VP-TESTVAULT-UNSELECTED-TEAM-4d7p",
  "VP-TESTVAULT-UNSELECTED-ARCHIVE-8k3n",
];

const EXPECTED_PUBLISHED_FILES = [
  MARKER_FILENAME,
  "styles.css",
  "index.html",
  "Handbook/Onboarding.html",
  "Handbook/Policies/Leave Policy.html",
  "Handbook/Extras/Duplicate Note.html",
  "Handbook/More/Duplicate Note.html",
].sort();

function runCli(outputDir: string): { status: number | null; stdout: string; stderr: string } {
  const args = [entryPoint, "--vault", vaultRoot, "--config", configPath, "--output", outputDir];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Every file path under `dir`, recursive, relative to `dir`, POSIX
 * separators — walked by hand rather than `readdir`'s `recursive: true`,
 * matching `end-to-end-output.test.ts`'s reasoning: the sync and async
 * forms of Node's recursive readdir disagree on symlink descent, which a
 * confidentiality-relevant walk has no business depending on.
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

describe("the committed test-vault publishes exactly its selected set", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-test-vault-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("exits 0 and writes exactly the files publish.config.yaml names", async () => {
    const result = runCli(outputDir);
    expect(result.status).toBe(0);

    const actual = (await allFilesRelative(outputDir)).sort();
    expect(actual).toStrictEqual(EXPECTED_PUBLISHED_FILES);
  });

  it("refuses every floor entry the config explicitly names, warning per entry", () => {
    const result = runCli(outputDir);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      '[WARNING] publish.config.yaml: "Journal/" is excluded and will not publish',
    );
    expect(result.stderr).toContain(
      '[WARNING] publish.config.yaml: "Private/" is excluded and will not publish',
    );
    expect(result.stderr).toContain(
      '[WARNING] publish.config.yaml: ".obsidian/" is excluded and will not publish',
    );
    expect(result.stderr).toContain(
      '[WARNING] publish.config.yaml: ".claude/" is excluded and will not publish',
    );
    expect(result.stderr).toContain(
      '[WARNING] publish.config.yaml: "CLAUDE.md" is excluded and will not publish',
    );
  });

  it("never writes any exclusion-floor marker, anywhere in the output", async () => {
    const result = runCli(outputDir);
    expect(result.status).toBe(0);

    const files = await allFilesRelative(outputDir);
    expect(files.length).toBeGreaterThan(0); // guards against grepping an empty directory
    for (const marker of FLOOR_MARKERS) {
      for (const relativePath of files) {
        const content = await readFile(path.join(outputDir, relativePath), "utf8");
        expect(content).not.toContain(marker);
      }
    }
  });

  it("never writes either unselected-but-present note's marker", async () => {
    const result = runCli(outputDir);
    expect(result.status).toBe(0);

    const files = await allFilesRelative(outputDir);
    expect(files.length).toBeGreaterThan(0);
    for (const marker of UNSELECTED_MARKERS) {
      for (const relativePath of files) {
        const content = await readFile(path.join(outputDir, relativePath), "utf8");
        expect(content).not.toContain(marker);
      }
    }
  });

  it("warns on the unresolvable wikilink and renders it as plain text, not a route", async () => {
    const result = runCli(outputDir);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      '[WARNING] Index.md: wikilink to "Missing Page" could not be resolved and was rendered as plain text',
    );

    const indexHtml = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(indexHtml).toContain("Missing Page");
    expect(indexHtml).not.toMatch(/<a[^>]*>\s*Missing Page/);
  });

  it("warns on the ambiguous wikilink and renders it as plain text, not a route", async () => {
    const result = runCli(outputDir);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      '[WARNING] Index.md: wikilink to "Duplicate Note" is ambiguous between ' +
        "Handbook/Extras/Duplicate Note.md, Handbook/More/Duplicate Note.md and was rendered as plain text",
    );

    const indexHtml = await readFile(path.join(outputDir, "index.html"), "utf8");
    // The explorer nav legitimately links to both published "Duplicate
    // Note" pages by title, so the degradation check has to look at the
    // specific sentence the ambiguous wikilink produced, not "no anchor
    // anywhere contains this text" — that would also catch the nav.
    expect(indexHtml).toContain("share this name: Duplicate Note.</p>");
  });

  it("drops the Bases query block and warns, leaving no trace of it on the page", async () => {
    const result = runCli(outputDir);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("[WARNING] Index.md: Bases query block was dropped");

    const indexHtml = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(indexHtml).not.toContain("```base");
    expect(indexHtml).not.toContain("filters:");
  });
});
