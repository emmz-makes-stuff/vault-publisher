import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { renderExplorer } from "../src/explorer.js";
import { buildNavigationTree } from "../src/navigation.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/explorer", import.meta.url));

const stringifier = unified().use(rehypeStringify);

function renderExplorerHtml(published: readonly string[], currentNotePath: string): string {
  const tree = buildNavigationTree(published, new Map());
  const nav = renderExplorer(tree, currentNotePath);
  return stringifier.stringify({ type: "root", children: [nav] });
}

const nestedPublished = [
  "FolderA/SubFolder/Current.md",
  "FolderA/Sibling.md",
  "FolderB/Other.md",
  "Root.md",
];

describe("renderExplorer — 5.3 nested page golden", () => {
  it("matches the golden HTML: FolderA and FolderA/SubFolder open, FolderB closed", async () => {
    const expected = await readFile(`${fixturesDir}/nested.html`, "utf8");

    const html = renderExplorerHtml(nestedPublished, "FolderA/SubFolder/Current.md");

    expect(`${html}\n`).toBe(expected);
  });

  it("opens every ancestor folder of the current page", () => {
    const html = renderExplorerHtml(nestedPublished, "FolderA/SubFolder/Current.md");

    expect(html).toContain("<details open><summary>FolderA</summary>");
    expect(html).toContain("<details open><summary>SubFolder</summary>");
  });

  it("leaves an unrelated folder closed, however deep the current page sits", () => {
    const html = renderExplorerHtml(nestedPublished, "FolderA/SubFolder/Current.md");

    expect(html).toContain("<details><summary>FolderB</summary>");
    expect(html).not.toContain("<details open><summary>FolderB</summary>");
  });
});

describe("renderExplorer — structure", () => {
  it("renders every note as a link to its published page", () => {
    const html = renderExplorerHtml(nestedPublished, "Root.md");

    expect(html).toContain('<a href="/FolderA/Sibling.html">Sibling</a>');
    expect(html).toContain('<a href="/FolderB/Other.html">Other</a>');
  });

  it("emits no script tag and no inline event handler", () => {
    const html = renderExplorerHtml(nestedPublished, "FolderA/SubFolder/Current.md");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });
});
