import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/pipeline.js";
import { WarningCollector } from "../src/warnings.js";
import { buildNoteIndex, type WikilinkContext } from "../src/wikilinks.js";

const embedNoteIndex = (): ReturnType<typeof buildNoteIndex> =>
  buildNoteIndex([
    "Assets/photo.png",
    "Assets/report.pdf",
    "Handbook/Transclude Note.md",
    "Handbook/Handbook Note.md",
  ]);

/**
 * A real (empty) wikilink context for tests that exercise other pipeline
 * stages — `wikilinks` is a required parameter of `renderMarkdown` (4.
 * remediation B2), so nothing here can omit it to skip `remarkWikilinks`
 * and `remarkDropBases`.
 */
const noWikilinks = (noteId = "Home.md"): WikilinkContext => ({
  noteId,
  noteIndex: buildNoteIndex([]),
  collector: new WarningCollector(),
});

const fixturesDir = fileURLToPath(new URL("./fixtures/pipeline", import.meta.url));
const wikilinkFixturesDir = fileURLToPath(new URL("./fixtures/wikilinks", import.meta.url));

describe("renderMarkdown", () => {
  it("renders a table and a task list matching the golden HTML", async () => {
    const markdown = await readFile(`${fixturesDir}/table-and-tasks.md`, "utf8");
    const expected = await readFile(`${fixturesDir}/table-and-tasks.html`, "utf8");

    const html = await renderMarkdown(markdown, noWikilinks());

    expect(`${html}\n`).toBe(expected);
  });

  it("renders task checkboxes as disabled inputs the reader cannot change", async () => {
    const html = await renderMarkdown("- [ ] Todo\n- [x] Done\n", noWikilinks());

    expect(html).toContain('<input type="checkbox" disabled>');
    expect(html).toContain('<input type="checkbox" checked disabled>');
  });

  it("escapes Markdown that looks like HTML instead of passing it through", async () => {
    const html = await renderMarkdown(
      "<script>alert('x')</script>\n\nHello & welcome",
      noWikilinks(),
    );

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&#x26; welcome");
  });
});

describe("renderMarkdown wikilinks", () => {
  it("renders plain, aliased and heading links to a published note matching the golden HTML", async () => {
    const markdown = await readFile(`${wikilinkFixturesDir}/resolved.md`, "utf8");
    const expected = await readFile(`${wikilinkFixturesDir}/resolved.html`, "utf8");
    const noteIndex = buildNoteIndex(["Handbook/Handbook Note.md"]);
    const collector = new WarningCollector();

    const html = await renderMarkdown(markdown, { noteId: "Home.md", noteIndex, collector });

    expect(`${html}\n`).toBe(expected);
  });

  it("emits no warnings when every wikilink resolves", async () => {
    const markdown = await readFile(`${wikilinkFixturesDir}/resolved.md`, "utf8");
    const noteIndex = buildNoteIndex(["Handbook/Handbook Note.md"]);
    const collector = new WarningCollector();

    await renderMarkdown(markdown, { noteId: "Home.md", noteIndex, collector });

    expect(collector.all()).toStrictEqual([]);
  });

  describe("degraded links (unselected, absent, aliased-unresolvable)", () => {
    async function renderDegraded(): Promise<{ html: string; collector: WarningCollector }> {
      const markdown = await readFile(`${wikilinkFixturesDir}/degraded.md`, "utf8");
      const noteIndex = buildNoteIndex(["Handbook/Other.md"]);
      const collector = new WarningCollector();
      const html = await renderMarkdown(markdown, { noteId: "Home.md", noteIndex, collector });
      return { html, collector };
    }

    it("matches the golden HTML", async () => {
      const expected = await readFile(`${wikilinkFixturesDir}/degraded.html`, "utf8");
      const { html } = await renderDegraded();

      expect(`${html}\n`).toBe(expected);
    });

    it("emits no <a> tag for any degraded wikilink", async () => {
      const { html } = await renderDegraded();

      expect(html).not.toContain("<a ");
    });

    it("emits no href attribute for any degraded wikilink", async () => {
      const { html } = await renderDegraded();

      expect(html).not.toContain("href");
    });

    it("never emits the confidential target name behind an unresolvable alias", async () => {
      const { html } = await renderDegraded();

      expect(html).not.toContain("Confidential Target");
      expect(html).not.toContain("Confidential%20Target");
    });

    it("emits one warning per degraded wikilink, each naming the containing note", async () => {
      const { collector } = await renderDegraded();

      expect(collector.all()).toStrictEqual([
        {
          note: "Home.md",
          message:
            'wikilink to "Unselected Note" could not be resolved and was rendered as plain text',
        },
        {
          note: "Home.md",
          message:
            'wikilink to "Missing Note" could not be resolved and was rendered as plain text',
        },
        {
          note: "Home.md",
          message:
            'wikilink to "Confidential Target" could not be resolved and was rendered as plain text',
        },
      ]);
    });
  });

  describe("ambiguous target", () => {
    async function renderAmbiguous(): Promise<{ html: string; collector: WarningCollector }> {
      const markdown = await readFile(`${wikilinkFixturesDir}/ambiguous.md`, "utf8");
      const noteIndex = buildNoteIndex(["Handbook/Duplicate Note.md", "Clients/Duplicate Note.md"]);
      const collector = new WarningCollector();
      const html = await renderMarkdown(markdown, { noteId: "Home.md", noteIndex, collector });
      return { html, collector };
    }

    it("matches the golden HTML", async () => {
      const expected = await readFile(`${wikilinkFixturesDir}/ambiguous.html`, "utf8");
      const { html } = await renderAmbiguous();

      expect(`${html}\n`).toBe(expected);
    });

    it("emits no <a> tag for an ambiguous wikilink", async () => {
      const { html } = await renderAmbiguous();

      expect(html).not.toContain("<a ");
    });

    it("emits one warning naming every candidate", async () => {
      const { collector } = await renderAmbiguous();

      expect(collector.all()).toStrictEqual([
        {
          note: "Home.md",
          message:
            'wikilink to "Duplicate Note" is ambiguous between Handbook/Duplicate Note.md, Clients/Duplicate Note.md and was rendered as plain text',
        },
      ]);
    });
  });

  it("degrades a wikilink to plain text when its target is not in the published index", async () => {
    const collector = new WarningCollector();

    const html = await renderMarkdown("See [[Some Note]] for details.", {
      noteId: "Home.md",
      noteIndex: buildNoteIndex([]),
      collector,
    });

    expect(html).toContain("Some Note");
    expect(html).not.toContain("[[");
    expect(html).not.toContain("<a ");
    expect(collector.all()).toStrictEqual([
      {
        note: "Home.md",
        message: 'wikilink to "Some Note" could not be resolved and was rendered as plain text',
      },
    ]);
  });

  it("renders a wikilink as plain text, not a nested <a>, when it sits inside a Markdown link", async () => {
    const noteIndex = buildNoteIndex(["Handbook/Wikilink Target.md"]);
    const collector = new WarningCollector();

    const html = await renderMarkdown(
      "[Some text with [[Wikilink Target]] inside](https://example.com)\n",
      { noteId: "Home.md", noteIndex, collector },
    );

    // The inner wikilink resolves, but nesting an <a> inside the outer
    // Markdown link's <a> is invalid HTML — a browser repairs it by closing
    // the outer anchor early, silently breaking the author's link. So the
    // inner wikilink renders as plain text instead of a second anchor.
    expect(html).toBe(
      '<p><a href="https://example.com">Some text with Wikilink Target inside</a></p>',
    );
    expect(collector.all()).toStrictEqual([]);
  });
});

describe("renderMarkdown callouts", () => {
  it("renders each recognised callout type matching the golden HTML", async () => {
    const markdown = await readFile(`${fixturesDir}/callouts.md`, "utf8");
    const expected = await readFile(`${fixturesDir}/callouts.html`, "utf8");

    const html = await renderMarkdown(markdown, noWikilinks());

    expect(`${html}\n`).toBe(expected);
  });

  it("carries a type-distinguishing class for each callout type", async () => {
    const markdown = await readFile(`${fixturesDir}/callouts.md`, "utf8");

    const html = await renderMarkdown(markdown, noWikilinks());

    for (const type of [
      "warning",
      "important",
      "danger",
      "note",
      "abstract",
      "tip",
      "quote",
      "success",
      "info",
    ]) {
      expect(html).toContain(`callout-${type}`);
    }
  });

  it("leaves a blockquote with no [!type] marker as an ordinary blockquote", async () => {
    const html = await renderMarkdown("> Not a callout, just an ordinary quote.\n", noWikilinks());

    expect(html).toBe("<blockquote>\n<p>Not a callout, just an ordinary quote.</p>\n</blockquote>");
  });

  it("falls back to a capitalised type name when no title is given", async () => {
    const html = await renderMarkdown("> [!info]\n> Some info, no title given.\n", noWikilinks());

    expect(html).toContain('<p class="callout-title">Info</p>');
  });
});

describe("renderMarkdown dropped Bases blocks", () => {
  async function renderBases(): Promise<{ html: string; collector: WarningCollector }> {
    const markdown = await readFile(`${fixturesDir}/bases.md`, "utf8");
    const collector = new WarningCollector();
    const html = await renderMarkdown(markdown, {
      noteId: "Home.md",
      noteIndex: embedNoteIndex(),
      collector,
    });
    return { html, collector };
  }

  it("matches the golden HTML, block absent, surrounding content intact", async () => {
    const expected = await readFile(`${fixturesDir}/bases.html`, "utf8");
    const { html } = await renderBases();

    expect(`${html}\n`).toBe(expected);
  });

  it("emits no trace of the dropped block, in any form", async () => {
    const { html } = await renderBases();

    expect(html).not.toContain("base");
    expect(html).not.toContain("filters");
    expect(html).not.toContain("status");
  });

  it("still renders the content before and after the block", async () => {
    const { html } = await renderBases();

    expect(html).toContain("Some intro text before the block.");
    expect(html).toContain("Some outro text after the block.");
  });

  it("emits one warning naming the containing note", async () => {
    const { collector } = await renderBases();

    expect(collector.all()).toStrictEqual([
      { note: "Home.md", message: "Bases query block was dropped" },
    ]);
  });
});

describe("renderMarkdown embeds — no attachment, image or otherwise, is ever published", () => {
  async function renderEmbeds(): Promise<{ html: string; collector: WarningCollector }> {
    const markdown = await readFile(`${wikilinkFixturesDir}/embeds.md`, "utf8");
    const collector = new WarningCollector();
    const html = await renderMarkdown(markdown, {
      noteId: "Home.md",
      noteIndex: embedNoteIndex(),
      collector,
    });
    return { html, collector };
  }

  it("matches the golden HTML", async () => {
    const expected = await readFile(`${wikilinkFixturesDir}/embeds.html`, "utf8");
    const { html } = await renderEmbeds();

    expect(`${html}\n`).toBe(expected);
  });

  it("degrades an embedded image to plain text with no <img> element, src, or path", async () => {
    const { html } = await renderEmbeds();

    expect(html).toContain("An embedded image: photo.png");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("src=");
    expect(html).not.toContain("/Assets/photo.png");
  });

  it("uses the alias as the degraded plain text for an aliased image embed", async () => {
    const { html } = await renderEmbeds();

    expect(html).toContain("An aliased embedded image: A caption");
  });

  it("emits no <img> tag anywhere on the page", async () => {
    const { html } = await renderEmbeds();

    expect(html).not.toContain("<img");
  });

  it("emits no trace of the unpublished image's path", async () => {
    const { html } = await renderEmbeds();

    expect(html).not.toContain("Assets/Secret");
    expect(html).not.toContain("Assets%2FSecret");
  });

  it("never inlines the body of a transcluded note — only its bare name as plain text", async () => {
    const { html } = await renderEmbeds();

    expect(html).toContain("Transclude Note");
    expect(html).not.toContain("<a ");
  });

  it("emits no route for a non-image attachment", async () => {
    const { html } = await renderEmbeds();

    expect(html).not.toContain("href");
    expect(html).not.toContain("/Assets/report.pdf");
    expect(html).not.toContain("Assets%2Freport.pdf");
  });

  it("warns once per unresolved, transcluded, or otherwise unpublishable embed, naming the containing note", async () => {
    const { collector } = await renderEmbeds();

    expect(collector.all()).toStrictEqual([
      {
        note: "Home.md",
        message:
          'embed of "photo.png" is an attachment and cannot be published; it was rendered as plain text',
      },
      {
        note: "Home.md",
        message:
          'embed of "photo.png" is an attachment and cannot be published; it was rendered as plain text',
      },
      {
        note: "Home.md",
        message:
          'embed of "Secret Diagram.png" could not be resolved and was rendered as plain text',
      },
      {
        note: "Home.md",
        message:
          'embed of "Missing Photo.png" could not be resolved and was rendered as plain text',
      },
      {
        note: "Home.md",
        message:
          'embed of "Transclude Note" is a note; transclusion is not supported and it was rendered as plain text',
      },
      {
        note: "Home.md",
        message:
          'embed of "report.pdf" is an attachment and cannot be published; it was rendered as plain text',
      },
    ]);
  });
});

describe("renderMarkdown frontmatter table", () => {
  it("matches the golden HTML for a note carrying some of the fields", async () => {
    const markdown = await readFile(`${fixturesDir}/frontmatter-table.md`, "utf8");
    const expected = await readFile(`${fixturesDir}/frontmatter-table.html`, "utf8");

    const html = await renderMarkdown(markdown, noWikilinks(), {
      type: "reference",
      area: "Handbook",
      owner: "R&D <Team>",
      tags: ["ops", "confidential & internal"],
      secret: "should never appear",
    });

    expect(`${html}\n`).toBe(expected);
  });

  it("omits a field outside the fixed set", async () => {
    const html = await renderMarkdown("Body.\n", noWikilinks(), {
      type: "reference",
      secret: "should never appear",
      another_unlisted_field: "also never appears",
    });

    expect(html).not.toContain("secret");
    expect(html).not.toContain("should never appear");
    expect(html).not.toContain("another_unlisted_field");
    expect(html).not.toContain("also never appears");
  });

  it("escapes an HTML metacharacter in a frontmatter value", async () => {
    const html = await renderMarkdown("Body.\n", noWikilinks(), { owner: "R&D <Team>" });

    expect(html).not.toContain("<Team>");
    expect(html).toContain("&#x26;");
    expect(html).toContain("&#x3C;");
  });

  it("renders no table element for a note with no frontmatter", async () => {
    const html = await renderMarkdown("Body.\n", noWikilinks());

    expect(html).not.toContain("<table");
  });

  it("renders no table element for a note whose frontmatter has none of the listed fields", async () => {
    const html = await renderMarkdown("Body.\n", noWikilinks(), { secret: "unlisted" });

    expect(html).not.toContain("<table");
  });
});
