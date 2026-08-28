import { describe, expect, it } from "vitest";
import { renderGeneratedFrontPage, renderPage } from "../src/page.js";

describe("renderPage — 5.4 a hast tree serialised once, never a string spliced in", () => {
  it("escapes an HTML metacharacter in a note title", () => {
    const html = renderPage({
      notePath: "Handbook/Weird.md",
      titleByNotePath: new Map([["Handbook/Weird.md", "<script>alert(1)</script> & Friends"]]),
      navigation: [],
      noteContent: [{ type: "text", value: "Body." }],
    });

    expect(html).toContain("<title>&#x3C;script>alert(1)&#x3C;/script> &#x26; Friends</title>");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("embeds the note's own elements structurally — a real <p>, not an escaped string of one", () => {
    // Proves `noteContent` is spliced in as hast nodes, not `renderMarkdown`'s
    // HTML string reinserted as a text node: the latter would leave real
    // markup escaped (`&#x3C;p&#x3E;`) rather than rendered.
    const html = renderPage({
      notePath: "Home.md",
      titleByNotePath: new Map(),
      navigation: [],
      noteContent: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: "A & B" }],
        },
      ],
    });

    expect(html).toContain("<p>A &#x26; B</p>");
    expect(html).not.toContain("&#x3C;p&#x3E;");
  });

  it("links the stylesheet root-absolute, correct at any nesting depth", () => {
    const html = renderPage({
      notePath: "Handbook/Policies/Leave.md",
      titleByNotePath: new Map(),
      navigation: [],
      noteContent: [],
    });

    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');
  });

  it("emits no script tag anywhere in the page", () => {
    const html = renderPage({
      notePath: "Home.md",
      titleByNotePath: new Map(),
      navigation: [],
      noteContent: [{ type: "text", value: "Body." }],
    });

    expect(html).not.toContain("<script");
  });
});

describe("renderGeneratedFrontPage — 8.2 the fallback front page", () => {
  it("takes no note content — it has nothing to derive a leak from", () => {
    // Signature-level guarantee: this function's only input is the
    // navigation tree, which is itself built from `published` alone
    // (`navigation.ts`) — there is no parameter through which an
    // unpublished note's markdown, frontmatter or title could reach this
    // function in the first place.
    expect(renderGeneratedFrontPage.length).toBe(1);
  });

  it("carries the explorer, built from the navigation tree it was given", () => {
    const html = renderGeneratedFrontPage([
      {
        type: "note",
        notePath: "Handbook/Onboarding.md",
        label: "Onboarding",
        sortKey: "Onboarding.md",
      },
    ]);

    expect(html).toContain('<nav class="explorer">');
    expect(html).toContain('<a href="/Handbook/Onboarding.html">Onboarding</a>');
  });

  it("has a fixed, generic title, not derived from any note", () => {
    const html = renderGeneratedFrontPage([]);

    expect(html).toContain("<title>Home</title>");
  });

  it("emits no script tag anywhere in the page", () => {
    const html = renderGeneratedFrontPage([]);

    expect(html).not.toContain("<script");
  });
});
