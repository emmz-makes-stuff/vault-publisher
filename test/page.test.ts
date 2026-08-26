import { describe, expect, it } from "vitest";
import { renderPage } from "../src/page.js";

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
