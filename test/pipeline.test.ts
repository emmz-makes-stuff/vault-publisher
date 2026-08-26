import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/pipeline.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/pipeline", import.meta.url));

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
