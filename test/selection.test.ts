import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PublishConfig } from "../src/config.js";
import { EXCLUSION_FLOOR, listVaultNotes, resolveSelection } from "../src/selection.js";

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
