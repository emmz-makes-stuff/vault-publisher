import { mkdtempSync } from "node:fs";
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

const createdOutputDirs: string[] = [];

afterEach(() => {
  for (const dir of createdOutputDirs.splice(0)) {
    rm(dir, { recursive: true, force: true }).catch(() => {
      // Best-effort cleanup only — a leftover temp dir here is inert, unlike
      // one this suite might mistake for asserted-on output.
    });
  }
});

/**
 * Runs the real CLI with a config path and an explicit vault root — every
 * required flag is present, so this is the "the arguments are all fine, the
 * config content is what's under test" path. `vaultRoot` defaults to the
 * config's own directory, matching every fixture vault's layout (the config
 * lives inside the vault it describes).
 */
function runCli(
  configPath: string,
  vaultRoot: string = path.dirname(configPath),
): { status: number | null; stdout: string; stderr: string } {
  // Node 24 strips TypeScript syntax natively, so the source runs directly —
  // no build step, no dist/ output to go stale against these tests.
  const outputDir = mkdtempSync(path.join(tmpdir(), "vault-publisher-cli-run-"));
  createdOutputDirs.push(outputDir);
  const result = spawnSync(
    process.execPath,
    [entryPoint, "--vault", vaultRoot, "--config", configPath, "--output", outputDir],
    { encoding: "utf8" },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runCliWithOutput(
  configPath: string,
  outputDir: string,
  vaultRoot: string = path.dirname(configPath),
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [entryPoint, "--vault", vaultRoot, "--config", configPath, "--output", outputDir],
    { encoding: "utf8" },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runCliRawArgs(args: readonly string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [entryPoint, ...args], { encoding: "utf8" });
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

describe("CLI entry point — 6.3 util.parseArgs surface", () => {
  let outputDirForMissingVault: string;

  beforeEach(() => {
    outputDirForMissingVault = mkdtempSync(path.join(tmpdir(), "vault-publisher-argtest-"));
    createdOutputDirs.push(outputDirForMissingVault);
  });

  it("--help prints usage to stdout, exits 0, and does nothing else", () => {
    const result = runCliRawArgs(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("usage: vault-publisher");
    expect(result.stdout).toContain("--vault");
    expect(result.stdout).toContain("--config");
    expect(result.stdout).toContain("--output");
    expect(result.stderr).toBe("");
  });

  it("--help short-circuits even when other required flags are also missing", () => {
    // --help alone, with no --vault/--config/--output, still succeeds — help
    // is not just "a valid combination of flags happens to satisfy it".
    const result = runCliRawArgs(["--help", "--vault", "/nonexistent"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("usage: vault-publisher");
  });

  it("exits non-zero with a clean message and no stack trace when --output is missing", () => {
    const result = runCliRawArgs([
      "--vault",
      path.dirname(integrationVaultConfigPath),
      "--config",
      integrationVaultConfigPath,
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output");
    const lines = result.stderr.trim().split("\n");
    expect(lines.some((line) => /^\s*at /.test(line))).toBe(false);
  });

  it("exits non-zero with a clean message and no stack trace when --vault is missing", async () => {
    const result = runCliRawArgs([
      "--config",
      integrationVaultConfigPath,
      "--output",
      outputDirForMissingVault,
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--vault");
    const lines = result.stderr.trim().split("\n");
    expect(lines.some((line) => /^\s*at /.test(line))).toBe(false);
    await expect(
      readFile(path.join(outputDirForMissingVault, "index.html"), "utf8"),
    ).rejects.toThrow();
  });

  it("exits non-zero with a clean message and no stack trace when --config is missing", () => {
    const result = runCliRawArgs(["--vault", path.dirname(integrationVaultConfigPath)]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--config");
  });

  it("exits non-zero with a clean message and no stack trace on an unknown flag", () => {
    const result = runCliRawArgs([
      "--vault",
      path.dirname(integrationVaultConfigPath),
      "--config",
      integrationVaultConfigPath,
      "--output",
      outputDirForMissingVault,
      "--bogus",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
    const lines = result.stderr.trim().split("\n");
    expect(lines.some((line) => /^\s*at /.test(line))).toBe(false);
  });

  it("rejects an unexpected positional argument instead of ignoring it", () => {
    const result = runCliRawArgs([
      "--vault",
      path.dirname(integrationVaultConfigPath),
      "--config",
      integrationVaultConfigPath,
      "--output",
      outputDirForMissingVault,
      "extra-positional",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
  });
});

const vaultRootFloorFixtureRoot = path.join(repoRoot, "test", "fixtures", "vault-root-floor");
const reparentedIntoPrivateConfigPath = path.join(
  vaultRootFloorFixtureRoot,
  "reparented-into-private.config.yaml",
);
const nestedHandbookConfigPath = path.join(
  vaultRootFloorFixtureRoot,
  "nested-handbook.config.yaml",
);

describe("CLI entry point — --vault reparented past the exclusion floor", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-floor-root-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("refuses a --vault whose resolved path has a floor-folder segment, and publishes nothing", async () => {
    // Pointing --vault at .../Private reclassifies "Confidential Client.md"
    // as a top-level note the config can name directly, unless the floor
    // segment in --vault's own path is caught before selection ever runs.
    const result = runCliWithOutput(
      reparentedIntoPrivateConfigPath,
      outputDir,
      path.join(vaultRootFloorFixtureRoot, "Private"),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--vault");
    await expect(
      readFile(path.join(outputDir, "Confidential Client.html"), "utf8"),
    ).rejects.toThrow();
  });

  it("still publishes when --vault names a legitimate nested subfolder with no floor segment", async () => {
    const result = runCliWithOutput(
      nestedHandbookConfigPath,
      outputDir,
      path.join(vaultRootFloorFixtureRoot, "Handbook"),
    );

    expect(result.status).toBe(0);
    const html = await readFile(path.join(outputDir, "Article.html"), "utf8");
    expect(html).toContain("Article");
  });
});
