import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/pipeline.js";
import { WarningCollector } from "../src/warnings.js";
import { buildNoteIndex } from "../src/wikilinks.js";

const embedNoteIndex = (): ReturnType<typeof buildNoteIndex> =>
  buildNoteIndex([
    "Assets/photo.png",
    "Assets/report.pdf",
    "Handbook/Transclude Note.md",
    "Handbook/Handbook Note.md",
  ]);

const fixturesDir = fileURLToPath(new URL("./fixtures/pipeline", import.meta.url));
const wikilinkFixturesDir = fileURLToPath(new URL("./fixtures/wikilinks", import.meta.url));

describe("renderMarkdown", () => {
  it("renders a table and a task list matching the golden HTML", async () => {
    const markdown = await readFile(`${fixturesDir}/table-and-tasks.md`, "utf8");
    const expected = await readFile(`${fixturesDir}/table-and-tasks.html`, "utf8");

    const html = await renderMarkdown(markdown);

    expect(`${html}\n`).toBe(expected);
  });

  it("renders task checkboxes as disabled inputs the reader cannot change", async () => {
    const html = await renderMarkdown("- [ ] Todo\n- [x] Done\n");

    expect(html).toContain('<input type="checkbox" disabled>');
    expect(html).toContain('<input type="checkbox" checked disabled>');
  });

  it("escapes Markdown that looks like HTML instead of passing it through", async () => {
    const html = await renderMarkdown("<script>alert('x')</script>\n\nHello & welcome");

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

  it("leaves [[...]] text untouched when no wikilink context is supplied", async () => {
    const html = await renderMarkdown("See [[Some Note]] for details.");

    expect(html).toContain("[[Some Note]]");
    expect(html).not.toContain("<a ");
  });

  it("pins today's behaviour for a wikilink nested inside a Markdown link — nested anchors, unresolved for now", async () => {
    const noteIndex = buildNoteIndex(["Handbook/Wikilink Target.md"]);
    const collector = new WarningCollector();

    const html = await renderMarkdown(
      "[Some text with [[Wikilink Target]] inside](https://example.com)\n",
      { noteId: "Home.md", noteIndex, collector },
    );

    // Not the intended shape — an <a> nested inside another <a> is invalid
    // HTML — but this is what the pipeline does today, and this test exists
    // so that stays a known, observed fact rather than an untested path.
    expect(html).toBe(
      '<p><a href="https://example.com">Some text with ' +
        '<a href="/Handbook/Wikilink%20Target.html">Wikilink Target</a> inside</a></p>',
    );
  });
});

describe("renderMarkdown callouts", () => {
  it("renders each recognised callout type matching the golden HTML", async () => {
    const markdown = await readFile(`${fixturesDir}/callouts.md`, "utf8");
    const expected = await readFile(`${fixturesDir}/callouts.html`, "utf8");

    const html = await renderMarkdown(markdown);

    expect(`${html}\n`).toBe(expected);
  });

  it("carries a type-distinguishing class for each callout type", async () => {
    const markdown = await readFile(`${fixturesDir}/callouts.md`, "utf8");

    const html = await renderMarkdown(markdown);

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
    const html = await renderMarkdown("> Not a callout, just an ordinary quote.\n");

    expect(html).toBe("<blockquote>\n<p>Not a callout, just an ordinary quote.</p>\n</blockquote>");
  });

  it("falls back to a capitalised type name when no title is given", async () => {
    const html = await renderMarkdown("> [!info]\n> Some info, no title given.\n");

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

describe("renderMarkdown image embeds", () => {
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

  it("renders a published image as an <img> pointing at its published path", async () => {
    const { html } = await renderEmbeds();

    expect(html).toContain('<img src="/Assets/photo.png" alt="photo.png">');
  });

  it("uses the alias as alt text for an aliased embed", async () => {
    const { html } = await renderEmbeds();

    expect(html).toContain('<img src="/Assets/photo.png" alt="A caption">');
  });

  it("emits exactly the two <img> tags for the two published-image embeds, no more", async () => {
    const { html } = await renderEmbeds();

    expect(html.match(/<img /g)).toHaveLength(2);
  });

  it("emits no src attribute naming the unpublished image — no <img> tag mentions it at all", async () => {
    const { html } = await renderEmbeds();

    const imgTags = html.match(/<img [^>]*>/g) ?? [];
    for (const tag of imgTags) {
      expect(tag).not.toContain("Secret");
    }
  });

  it("never inlines the body of a transcluded note — only its bare name as plain text", async () => {
    const { html } = await renderEmbeds();

    expect(html).toContain("Transclude Note");
    expect(html).not.toContain("<a ");
  });

  it("emits no route for a non-image attachment", async () => {
    const { html } = await renderEmbeds();

    expect(html).not.toContain("href");
    expect(html).not.toContain('src="/Assets/report.pdf"');
  });

  it("warns once per unresolved, transcluded, or non-image embed, naming the containing note", async () => {
    const { collector } = await renderEmbeds();

    expect(collector.all()).toStrictEqual([
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
          'embed of "report.pdf" is not an image and cannot be published; it was rendered as plain text',
      },
    ]);
  });
});

describe("renderMarkdown frontmatter table", () => {
  it("matches the golden HTML for a note carrying some of the fields", async () => {
    const markdown = await readFile(`${fixturesDir}/frontmatter-table.md`, "utf8");
    const expected = await readFile(`${fixturesDir}/frontmatter-table.html`, "utf8");

    const html = await renderMarkdown(markdown, undefined, {
      type: "reference",
      area: "Handbook",
      owner: "R&D <Team>",
      tags: ["ops", "confidential & internal"],
      secret: "should never appear",
    });

    expect(`${html}\n`).toBe(expected);
  });

  it("omits a field outside the fixed set", async () => {
    const html = await renderMarkdown("Body.\n", undefined, {
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
    const html = await renderMarkdown("Body.\n", undefined, { owner: "R&D <Team>" });

    expect(html).not.toContain("<Team>");
    expect(html).toContain("&#x26;");
    expect(html).toContain("&#x3C;");
  });

  it("renders no table element for a note with no frontmatter", async () => {
    const html = await renderMarkdown("Body.\n");

    expect(html).not.toContain("<table");
  });

  it("renders no table element for a note whose frontmatter has none of the listed fields", async () => {
    const html = await renderMarkdown("Body.\n", undefined, { secret: "unlisted" });

    expect(html).not.toContain("<table");
  });
});
