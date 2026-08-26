import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
const absentFloorConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "absent-floor-vault",
  "publish.config.yaml",
);
const noFrontPageConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "no-front-page-vault",
  "publish.config.yaml",
);

function runCli(configPath: string): { status: number | null; stdout: string; stderr: string } {
  // Node 24 strips TypeScript syntax natively, so the source runs directly —
  // no build step, no dist/ output to go stale against these tests.
  const result = spawnSync(process.execPath, [entryPoint, configPath], {
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runCliWithOutput(
  configPath: string,
  outputDir: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [entryPoint, configPath, outputDir], {
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const integrationVaultConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "integration-vault",
  "publish.config.yaml",
);

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
    expect(lines).toContain(
      '[WARNING] Index.md: is not in the published set; the site has no front page and "/" will serve nothing',
    );
    // Exactly these four — a matched, non-excluded entry (Handbook) earns no line.
    expect(lines).toHaveLength(4);
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

describe("CLI entry point — B4 floored entry absent from the vault", () => {
  it("reports an excluded folder that does not yet exist as excluded, not as unmatched", () => {
    const result = runCli(absentFloorConfigPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");

    const lines = result.stderr.trim().split("\n");
    expect(lines).toContain(
      '[WARNING] publish.config.yaml: "Private/" is excluded and will not publish',
    );
    expect(lines).not.toContain(
      '[WARNING] publish.config.yaml: no path in the vault matches "Private"',
    );
    expect(lines).toContain(
      '[WARNING] Index.md: is not in the published set; the site has no front page and "/" will serve nothing',
    );
    expect(lines).toHaveLength(2);
  });
});

describe("CLI entry point — block B: published wired through to a written site", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-cli-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("skips site generation entirely when no output directory is given — existing two-argument callers see unchanged behaviour", () => {
    const result = runCli(integrationVaultConfigPath);

    expect(result.status).toBe(0);
  });

  it("writes the front page and a nested page when an output directory is given", async () => {
    const result = runCliWithOutput(integrationVaultConfigPath, outputDir);

    expect(result.status).toBe(0);

    const frontPage = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(frontPage).toContain("<title>Welcome</title>");
    expect(frontPage).toContain('<a href="/Handbook/Onboarding.html">Onboarding</a>');

    const onboarding = await readFile(path.join(outputDir, "Handbook", "Onboarding.html"), "utf8");
    expect(onboarding).toContain("Welcome to the handbook.");
  });

  it("never writes a page for a note the exclusion floor withheld", async () => {
    runCliWithOutput(integrationVaultConfigPath, outputDir);

    await expect(
      readFile(path.join(outputDir, "Private", "Confidential Client.html"), "utf8"),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(outputDir, "Handbook", "Private", "Confidential Notes.html"), "utf8"),
    ).rejects.toThrow();
  });

  it("still reports warnings on stderr and exits 0 when writing a site", () => {
    const result = runCliWithOutput(integrationVaultConfigPath, outputDir);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      '[WARNING] Index.md: wikilink to "Confidential Client" could not be resolved and was rendered as plain text',
    );
  });

  it("writes styles.css to the output root, the same file every page links", async () => {
    const result = runCliWithOutput(integrationVaultConfigPath, outputDir);

    expect(result.status).toBe(0);

    const stylesheet = await readFile(path.join(outputDir, "styles.css"), "utf8");
    expect(stylesheet).toContain(".explorer");
  });
});

describe("CLI entry point — warns when the vault's own Index.md is not published", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-no-front-page-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("warns and still exits 0 — a publish with no root note is odd but valid", () => {
    const result = runCli(noFrontPageConfigPath);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      '[WARNING] Index.md: is not in the published set; the site has no front page and "/" will serve nothing',
    );
  });

  it("writes no index.html when Index.md is not published, even though the site otherwise writes", async () => {
    const result = runCliWithOutput(noFrontPageConfigPath, outputDir);

    expect(result.status).toBe(0);
    await expect(readFile(path.join(outputDir, "index.html"), "utf8")).rejects.toThrow();
    const onboarding = await readFile(path.join(outputDir, "Handbook", "Onboarding.html"), "utf8");
    expect(onboarding).toContain("Welcome to the handbook.");
  });
});
