import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/pipeline.js";
import { WarningCollector } from "../src/warnings.js";
import { buildNoteIndex } from "../src/wikilinks.js";

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
