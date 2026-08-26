import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { buildNavigationTree } from "../src/navigation.js";
import { renderPage } from "../src/page.js";
import { renderNoteToHast } from "../src/pipeline.js";
import { listVaultNotes, resolveSelection } from "../src/selection.js";
import { WarningCollector } from "../src/warnings.js";
import { buildNoteIndex } from "../src/wikilinks.js";

const vaultRoot = fileURLToPath(new URL("./fixtures/integration-vault", import.meta.url));

/**
 * 5.5 — the vault root's `Index.md` rendered as the site's front page,
 * under exactly the rendering rules any other page gets: the same
 * `renderNoteToHast` -> `renderPage` composition `index.ts`'s wiring uses,
 * exercised here against a real fixture vault rather than hand-built
 * strings, so this is also the "one fixture exercises a full page end to
 * end" widening the §4 supervisor asked for — wikilinks (resolved and
 * degraded), a callout, a table, task checkboxes, a dropped Bases block,
 * and the frontmatter table all render on the one page this test compares.
 */
async function renderFrontPage(): Promise<{ html: string; collector: WarningCollector }> {
  const config = await loadConfig(`${vaultRoot}/publish.config.yaml`);
  const vaultPaths = await listVaultNotes(vaultRoot);
  const { published } = resolveSelection(config, vaultPaths);

  const collector = new WarningCollector();
  const titleByNotePath = new Map<string, string>();
  let indexMarkdown = "";
  let indexFrontmatter: Record<string, unknown> = {};

  for (const notePath of published) {
    const markdown = await readFile(`${vaultRoot}/${notePath}`, "utf8");
    const frontmatter = parseFrontmatter(markdown, notePath, collector);
    const title = frontmatter["title"];
    if (typeof title === "string") {
      titleByNotePath.set(notePath, title);
    }
    if (notePath === "Index.md") {
      indexMarkdown = markdown;
      indexFrontmatter = frontmatter;
    }
  }

  const navigation = buildNavigationTree(published, titleByNotePath);
  const noteIndex = buildNoteIndex(published);
  const noteHast = await renderNoteToHast(
    indexMarkdown,
    { noteId: "Index.md", noteIndex, collector },
    indexFrontmatter,
  );

  const html = renderPage({
    notePath: "Index.md",
    titleByNotePath,
    navigation,
    noteContent: noteHast.children,
  });

  return { html, collector };
}

describe("front page — 5.5 the vault root's Index.md, same rules as any other page", () => {
  it("matches the golden HTML for the whole page", async () => {
    const expected = await readFile(
      fileURLToPath(new URL("./fixtures/site/index-page.html", import.meta.url)),
      "utf8",
    );

    const { html } = await renderFrontPage();

    expect(`${html}\n`).toBe(expected);
  });

  it("degrades its link to an unpublished note to plain text, with no href and no route", async () => {
    const { html } = await renderFrontPage();

    expect(html).toContain("Confidential Client");
    expect(html).not.toContain('href="/Private');
    expect(html).not.toContain("/Private/Confidential%20Client.html");
  });

  it("resolves its link to a published sibling note", async () => {
    const { html } = await renderFrontPage();

    expect(html).toContain('<a href="/Handbook/Onboarding.html">Onboarding</a>');
  });

  it("emits one warning for the degraded link and one for the dropped Bases block", async () => {
    const { collector } = await renderFrontPage();

    expect(collector.all()).toStrictEqual([
      {
        note: "Index.md",
        message:
          'wikilink to "Confidential Client" could not be resolved and was rendered as plain text',
      },
      { note: "Index.md", message: "Bases query block was dropped" },
    ]);
  });
});
