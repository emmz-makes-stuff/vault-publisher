import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { renderMarkdown } from "../src/pipeline.js";
import { listVaultNotes, resolveSelection } from "../src/selection.js";
import { WarningCollector } from "../src/warnings.js";
import { buildNoteIndex } from "../src/wikilinks.js";

const vaultRoot = fileURLToPath(new URL("./fixtures/integration-vault", import.meta.url));

/**
 * Section 4 remediation B3: every other test in this suite builds its note
 * index from string literals, so nothing exercised `resolveSelection`'s
 * real output feeding `buildNoteIndex` and then `renderMarkdown` — the gap
 * the supervisor's B1 finding (an unreachable image branch) slipped
 * through. This walks a real fixture vault end to end: `loadConfig` →
 * `resolveSelection` → `buildNoteIndex` → `renderMarkdown`.
 *
 * Two different excluded notes are covered deliberately, because they prove
 * different things: `Private/Confidential Client.md` is withheld only
 * because it never matches a selected folder, so this alone does not
 * exercise `EXCLUSION_FLOOR` — the reviewer proved that by disabling floor
 * filtering and watching this test still pass. `Handbook/Private/
 * Confidential Notes.md` sits *inside* the selected `Handbook` folder; the
 * floor is the only thing keeping it out, so a broken floor turns this note
 * up in `published` and, from there, in the rendered page.
 */
describe("pipeline integration — §3 selection feeding §4 rendering", () => {
  it("publishes a selected note, resolves a link to a published sibling, and degrades links to a never-selected note and a floor-withheld note, both with no route", async () => {
    const config = await loadConfig(`${vaultRoot}/publish.config.yaml`);
    const vaultPaths = await listVaultNotes(vaultRoot);
    const { published } = resolveSelection(config, vaultPaths);

    expect(published).toContain("Handbook/Index.md");
    expect(published).toContain("Handbook/Onboarding.md");
    expect(published).not.toContain("Private/Confidential Client.md");
    expect(published).not.toContain("Handbook/Private/Confidential Notes.md");

    const noteIndex = buildNoteIndex(published);
    const collector = new WarningCollector();
    const markdown = await readFile(`${vaultRoot}/Handbook/Index.md`, "utf8");

    const html = await renderMarkdown(markdown, {
      noteId: "Handbook/Index.md",
      noteIndex,
      collector,
    });

    expect(html).toContain('<a href="/Handbook/Onboarding.html">Onboarding</a>');
    expect(html.match(/<a /g)).toHaveLength(1);

    // Neither excluded note's path leaves any trace, plain or
    // percent-encoded — the "no route" rule this section exists to
    // enforce, exercised against the real published set rather than a
    // hand-built index that could not reproduce the defect it once hid.
    expect(html).not.toContain("Private/Confidential Client");
    expect(html).not.toContain("Private%2FConfidential%20Client");
    expect(html).not.toContain("Confidential%20Client");
    expect(html).not.toContain("Handbook/Private/Confidential Notes");
    expect(html).not.toContain("Handbook%2FPrivate%2FConfidential%20Notes");
    expect(html).not.toContain("Confidential%20Notes");

    expect(collector.all()).toStrictEqual([
      {
        note: "Handbook/Index.md",
        message:
          'wikilink to "Confidential Client" could not be resolved and was rendered as plain text',
      },
      {
        note: "Handbook/Index.md",
        message:
          'wikilink to "Confidential Notes" could not be resolved and was rendered as plain text',
      },
    ]);
  });
});
