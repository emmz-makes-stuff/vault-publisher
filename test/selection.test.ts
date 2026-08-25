import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublishConfig } from "../src/config.js";
import {
  collectCandidatePaths,
  EXCLUSION_FLOOR,
  isWithinVaultBoundary,
  listVaultNotes,
  resolveSelection,
} from "../src/selection.js";

const fixtureVault = fileURLToPath(new URL("./fixtures/selection-vault", import.meta.url));
const audienceFixtureVault = fileURLToPath(new URL("./fixtures/audience-vault", import.meta.url));

function config(partial: Partial<PublishConfig>): PublishConfig {
  return { folders: [], notes: [], ...partial };
}

const vaultPaths = [
  "CLAUDE.md",
  "Handbook/Index.md",
  "Handbook/Onboarding.md",
  "Handbook/Private/Notes.md",
  "Journal/2026-01-01.md",
  "Meetings/2026/Notes.md",
  "Private/Secret.md",
  "Unrelated/Note.md",
];

describe("resolveSelection — 3.3 declared selection", () => {
  it("publishes every note within a selected folder, including subfolders", () => {
    const { published } = resolveSelection(config({ folders: ["Meetings/2026"] }), vaultPaths);

    expect(published).toContain("Meetings/2026/Notes.md");
  });

  it("publishes a selected individual note but not its siblings", () => {
    const { published } = resolveSelection(config({ notes: ["Handbook/Index.md"] }), vaultPaths);

    expect(published).toStrictEqual(["Handbook/Index.md"]);
    expect(published).not.toContain("Handbook/Onboarding.md");
  });

  it("does not publish a note covered by no folder and named by no entry", () => {
    const { published } = resolveSelection(config({ folders: ["Meetings/2026"] }), vaultPaths);

    expect(vaultPaths).toContain("Unrelated/Note.md");
    expect(published).not.toContain("Unrelated/Note.md");
  });

  it("reports an entry that matches nothing in the vault as unmatched", () => {
    const { published, unmatched } = resolveSelection(
      config({ notes: ["Nonexistent.md"] }),
      vaultPaths,
    );

    expect(published).toStrictEqual([]);
    expect(unmatched).toStrictEqual(["Nonexistent.md"]);
  });
});

describe("resolveSelection — 3.4 exclusion floor overrides configuration", () => {
  it("withholds every note in an excluded folder named directly, and still publishes the rest", () => {
    expect(vaultPaths).toContain("Journal/2026-01-01.md");

    const { published } = resolveSelection(
      config({ folders: ["Journal", "Handbook"] }),
      vaultPaths,
    );

    expect(published).not.toContain("Journal/2026-01-01.md");
    expect(published).toContain("Handbook/Index.md");
    expect(published).toContain("Handbook/Onboarding.md");
  });

  it("withholds an excluded file named directly, and still publishes a sibling entry", () => {
    expect(vaultPaths).toContain("CLAUDE.md");

    const { published } = resolveSelection(
      config({ notes: ["CLAUDE.md", "Handbook/Index.md"] }),
      vaultPaths,
    );

    expect(published).not.toContain("CLAUDE.md");
    expect(published).toContain("Handbook/Index.md");
  });

  it("matches the floor case-insensitively", () => {
    const paths = [...vaultPaths, "Handbook/private/lowercase.md"];

    const { published } = resolveSelection(config({ folders: ["Handbook"] }), paths);

    expect(paths).toContain("Handbook/private/lowercase.md");
    expect(published).not.toContain("Handbook/private/lowercase.md");
  });
});

describe("resolveSelection — 3.5 excluded folder nested inside a selected folder", () => {
  it("publishes the selected folder's own notes while withholding the nested excluded folder", () => {
    expect(vaultPaths).toContain("Handbook/Private/Notes.md");

    const { published } = resolveSelection(config({ folders: ["Handbook"] }), vaultPaths);

    expect(published).not.toContain("Handbook/Private/Notes.md");
    expect(published).toContain("Handbook/Index.md");
    expect(published).toContain("Handbook/Onboarding.md");
  });

  it("completes normally when an excluded folder is absent from the vault, and still excludes it once created", () => {
    const withoutPrivate = vaultPaths.filter((p) => p !== "Private/Secret.md");
    expect(withoutPrivate).not.toContain("Private/Secret.md");

    const cfg = config({ folders: ["Handbook", "Private"] });

    const before = resolveSelection(cfg, withoutPrivate);
    expect(before.published).toContain("Handbook/Index.md");
    expect(before.unmatched).toContain("Private");

    const afterCreation = [...withoutPrivate, "Private/NewSecret.md"];
    const after = resolveSelection(cfg, afterCreation);

    expect(after.published).not.toContain("Private/NewSecret.md");
    expect(after.unmatched).not.toContain("Private");
  });
});

describe("EXCLUSION_FLOOR", () => {
  it("is fixed in code, not derived from configuration", () => {
    expect(EXCLUSION_FLOOR).toStrictEqual([
      "CLAUDE.md",
      ".claude/",
      ".obsidian/",
      "Journal/",
      "Private/",
    ]);
  });

  it("contains only single-segment entries", () => {
    for (const entry of EXCLUSION_FLOOR) {
      const segment = entry.endsWith("/") ? entry.slice(0, -1) : entry;
      expect(segment).not.toContain("/");
    }
  });

  // Data-driven from the constant itself: a new entry gets this coverage
  // automatically, rather than needing someone to remember to add a case.
  // The old version of this suite asserted only the list's literal
  // contents — it caught that the list changed, not that the list worked.
  describe.each(EXCLUSION_FLOOR)("entry %s", (entry) => {
    const isFolder = entry.endsWith("/");
    const segment = isFolder ? entry.slice(0, -1) : entry;

    it("withholds it at the vault root, while an unrelated sibling still publishes", () => {
      const target = isFolder ? `${segment}/Note.md` : segment;
      const paths = [target, "Sibling/Note.md"];
      const cfg = config(
        isFolder ? { folders: [segment, "Sibling"] } : { notes: [segment], folders: ["Sibling"] },
      );

      expect(paths).toContain(target);

      const { published } = resolveSelection(cfg, paths);

      expect(published).not.toContain(target);
      expect(published).toContain("Sibling/Note.md");
    });

    it("withholds it nested inside a selected folder, while the folder's other notes still publish", () => {
      const target = isFolder ? `Handbook/${segment}/Note.md` : `Handbook/${segment}`;
      const paths = [target, "Handbook/Sibling.md"];
      const cfg = config({ folders: ["Handbook"] });

      expect(paths).toContain(target);

      const { published } = resolveSelection(cfg, paths);

      expect(published).not.toContain(target);
      expect(published).toContain("Handbook/Sibling.md");
    });
  });
});

describe("isWithinVaultBoundary — B1 pure boundary predicate", () => {
  it("allows a path with no symlink anywhere along it", () => {
    const result = isWithinVaultBoundary(
      "/vault",
      "/vault",
      "/vault/Handbook/Index.md",
      "/vault/Handbook/Index.md",
    );

    expect(result).toBe(true);
  });

  it("allows a note when the vault root itself sits under a symlinked ancestor", () => {
    // Exactly the fixtures' own situation on macOS: os.tmpdir() resolves
    // through /tmp -> /private/tmp. A naive absolute-prefix containment
    // check would misfire here and wrongly exclude everything; comparing
    // relative-to-root paths on both sides is what keeps this case safe.
    const result = isWithinVaultBoundary(
      "/tmp/scratch/vault",
      "/private/tmp/scratch/vault",
      "/tmp/scratch/vault/Handbook/Index.md",
      "/private/tmp/scratch/vault/Handbook/Index.md",
    );

    expect(result).toBe(true);
  });

  it("drops a path that resolves inside the vault but under a different name (an alias for an excluded folder)", () => {
    const result = isWithinVaultBoundary(
      "/vault",
      "/vault",
      "/vault/Handbook/AliasToPrivate/Secret.md",
      "/vault/Private/Secret.md",
    );

    expect(result).toBe(false);
  });

  it("drops a path that resolves entirely outside the vault", () => {
    const result = isWithinVaultBoundary(
      "/vault",
      "/vault",
      "/vault/Handbook/Escape/Leaked.md",
      "/outside/Leaked.md",
    );

    expect(result).toBe(false);
  });
});

describe("listVaultNotes — B1 the vault boundary against a symlink escape", () => {
  let scratchRoot: string;
  let vaultDir: string;
  let outsideDir: string;

  beforeAll(async () => {
    // Real symlinks, created here rather than committed: git does not carry
    // one reliably across platforms, and a fixture directory this sensitive
    // should not hold one at rest.
    scratchRoot = await mkdtemp(path.join(tmpdir(), "vault-publisher-symlink-"));
    vaultDir = path.join(scratchRoot, "vault");
    outsideDir = path.join(scratchRoot, "outside");

    await mkdir(path.join(vaultDir, "Handbook"), { recursive: true });
    await mkdir(path.join(vaultDir, "Private"), { recursive: true });
    await mkdir(outsideDir, { recursive: true });

    await writeFile(path.join(vaultDir, "Handbook", "Index.md"), "# Invented handbook page\n");
    await writeFile(path.join(vaultDir, "Private", "Secret.md"), "# Invented private note\n");
    await writeFile(path.join(outsideDir, "Leaked.md"), "# Invented note outside the vault\n");

    // A directory symlink aliasing the excluded `Private/` folder under a
    // name the floor does not know — the floor matches by segment name, so
    // this evades it unless the walk itself refuses to descend the alias.
    await symlink(
      path.join(vaultDir, "Private"),
      path.join(vaultDir, "Handbook", "AliasToPrivate"),
    );
    // A directory symlink pointing entirely outside the vault.
    await symlink(outsideDir, path.join(vaultDir, "Handbook", "Escape"));
    // A file symlink aliasing an excluded file directly — governed
    // entirely by `isWithinVaultBoundary`, not by the directory-descent
    // guard, since it is never a directory to refuse to descend.
    await symlink(
      path.join(vaultDir, "Private", "Secret.md"),
      path.join(vaultDir, "Handbook", "DirectAlias.md"),
    );
    // A file symlink pointing directly to a file outside the vault.
    await symlink(
      path.join(outsideDir, "Leaked.md"),
      path.join(vaultDir, "Handbook", "DirectEscape.md"),
    );
  });

  afterAll(async () => {
    await rm(scratchRoot, { recursive: true, force: true });
  });

  it("the fixture really does contain the four symlinks the tests below rely on", async () => {
    const alias = await lstat(path.join(vaultDir, "Handbook", "AliasToPrivate"));
    const escape = await lstat(path.join(vaultDir, "Handbook", "Escape"));
    const directAlias = await lstat(path.join(vaultDir, "Handbook", "DirectAlias.md"));
    const directEscape = await lstat(path.join(vaultDir, "Handbook", "DirectEscape.md"));

    expect(alias.isSymbolicLink()).toBe(true);
    expect(escape.isSymbolicLink()).toBe(true);
    expect(directAlias.isSymbolicLink()).toBe(true);
    expect(directEscape.isSymbolicLink()).toBe(true);
  });

  it("does not publish a note reached through a symlinked directory alias of an excluded folder", async () => {
    const walked = await listVaultNotes(vaultDir);

    expect(walked).not.toContain("Handbook/AliasToPrivate/Secret.md");
  });

  it("does not publish a note reached through a symlinked directory pointing outside the vault", async () => {
    const walked = await listVaultNotes(vaultDir);

    expect(walked).not.toContain("Handbook/Escape/Leaked.md");
  });

  it("does not publish a note that is itself a symlink aliasing an excluded file", async () => {
    const walked = await listVaultNotes(vaultDir);

    expect(walked).not.toContain("Handbook/DirectAlias.md");
  });

  it("does not publish a note that is itself a symlink pointing outside the vault", async () => {
    const walked = await listVaultNotes(vaultDir);

    expect(walked).not.toContain("Handbook/DirectEscape.md");
  });

  it("still publishes the vault's real, non-aliased notes", async () => {
    const walked = await listVaultNotes(vaultDir);

    expect(walked).toContain("Handbook/Index.md");
    expect(walked).toContain("Private/Secret.md");
  });

  it("collectCandidatePaths never returns a path reached through a symlinked directory", async () => {
    const candidates: string[] = [];
    await collectCandidatePaths(vaultDir, candidates);
    const relativeCandidates = candidates
      .map((absolutePath) => path.relative(vaultDir, absolutePath))
      .sort();

    // The walk itself, before the boundary check ever runs on its output —
    // this is the descent-skip's own contract: a symlinked directory is
    // never opened, so nothing reached only through one can appear here.
    expect(relativeCandidates).not.toContain(path.join("Handbook", "AliasToPrivate", "Secret.md"));
    expect(relativeCandidates).not.toContain(path.join("Handbook", "Escape", "Leaked.md"));
    expect(relativeCandidates).toContain(path.join("Handbook", "Index.md"));
    expect(relativeCandidates).toContain(path.join("Private", "Secret.md"));
  });
});

describe("listVaultNotes over a real on-disk fixture vault", () => {
  it("walks the filesystem and feeds resolveSelection, which still enforces the floor", async () => {
    const walked = await listVaultNotes(fixtureVault);

    // Prove the walk itself actually found the excluded paths — not that
    // selection logic never ran over them.
    expect(walked).toContain("CLAUDE.md");
    expect(walked).toContain("Journal/2026-01-01.md");
    expect(walked).toContain("Handbook/Private/Notes.md");
    expect(walked).toContain("Private/Secret.md");
    expect(walked).toContain(".claude/instructions.md");
    expect(walked).toContain(".obsidian/workspace.md");
    expect(walked).toContain("Handbook/Index.md");
    expect(walked).toContain("Unrelated/Note.md");

    const cfg = config({
      folders: ["Handbook", "Meetings/2026", "Journal"],
      notes: ["CLAUDE.md"],
    });

    const { published, unmatched } = resolveSelection(cfg, walked);

    expect(published).toContain("Handbook/Index.md");
    expect(published).toContain("Handbook/Onboarding.md");
    expect(published).toContain("Meetings/2026/Notes.md");

    expect(published).not.toContain("CLAUDE.md");
    expect(published).not.toContain("Journal/2026-01-01.md");
    expect(published).not.toContain("Handbook/Private/Notes.md");
    expect(published).not.toContain("Private/Secret.md");
    expect(published).not.toContain(".claude/instructions.md");
    expect(published).not.toContain(".obsidian/workspace.md");
    expect(published).not.toContain("Unrelated/Note.md");

    // Every entry matched something in the vault; the floor filtered
    // afterward without producing a false unmatched report.
    expect(unmatched).toStrictEqual([]);
  });
});

describe("resolveSelection — 3.7 audience frontmatter has no effect on selection", () => {
  it("does not publish a note carrying audience: public that configuration does not select", async () => {
    const content = await readFile(`${audienceFixtureVault}/Outside/NotSelected.md`, "utf8");
    expect(content).toContain("audience: public");

    const walked = await listVaultNotes(audienceFixtureVault);
    expect(walked).toContain("Outside/NotSelected.md");

    const { published } = resolveSelection(config({ folders: ["Handbook"] }), walked);

    expect(published).not.toContain("Outside/NotSelected.md");
  });

  it("publishes a selected note carrying audience: private, and a selected note with no audience key", async () => {
    const withAudience = await readFile(`${audienceFixtureVault}/Handbook/Selected.md`, "utf8");
    expect(withAudience).toContain("audience: private");

    const withoutAudience = await readFile(
      `${audienceFixtureVault}/Handbook/NoAudienceKey.md`,
      "utf8",
    );
    expect(withoutAudience).not.toContain("audience:");

    const walked = await listVaultNotes(audienceFixtureVault);
    expect(walked).toContain("Handbook/Selected.md");
    expect(walked).toContain("Handbook/NoAudienceKey.md");

    const { published } = resolveSelection(config({ folders: ["Handbook"] }), walked);

    expect(published).toContain("Handbook/Selected.md");
    expect(published).toContain("Handbook/NoAudienceKey.md");
  });
});
