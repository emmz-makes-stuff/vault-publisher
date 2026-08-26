import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/frontmatter.js";
import { WarningCollector } from "../src/warnings.js";

describe("parseFrontmatter", () => {
  it("parses a note's frontmatter into a record", () => {
    const collector = new WarningCollector();
    const markdown = "---\ntype: reference\narea: Handbook\ntags:\n  - a\n  - b\n---\n\nBody text.";

    const frontmatter = parseFrontmatter(markdown, "Handbook/Index.md", collector);

    expect(frontmatter).toStrictEqual({ type: "reference", area: "Handbook", tags: ["a", "b"] });
    expect(collector.all()).toStrictEqual([]);
  });

  it("returns an empty record for a note without frontmatter, with no warning", () => {
    const collector = new WarningCollector();

    const frontmatter = parseFrontmatter(
      "# Just a heading\n\nBody.",
      "Handbook/Plain.md",
      collector,
    );

    expect(frontmatter).toStrictEqual({});
    expect(collector.all()).toStrictEqual([]);
  });

  it("returns an empty record and a warning, not a thrown error, for malformed YAML", () => {
    const collector = new WarningCollector();
    const markdown = "---\ntype: [unterminated\n---\n\nBody.";

    const frontmatter = parseFrontmatter(markdown, "Handbook/Broken.md", collector);

    expect(frontmatter).toStrictEqual({});
    expect(collector.all()).toHaveLength(1);
    expect(collector.all()[0]?.note).toBe("Handbook/Broken.md");
  });

  it("returns an empty record and a warning for frontmatter that parses to a scalar", () => {
    const collector = new WarningCollector();
    const markdown = "---\njust a string\n---\n\nBody.";

    const frontmatter = parseFrontmatter(markdown, "Handbook/Scalar.md", collector);

    expect(frontmatter).toStrictEqual({});
    expect(collector.all()).toHaveLength(1);
    expect(collector.all()[0]?.note).toBe("Handbook/Scalar.md");
  });

  it("returns an empty record and a warning for frontmatter that parses to an array", () => {
    const collector = new WarningCollector();
    const markdown = "---\n- a\n- b\n---\n\nBody.";

    const frontmatter = parseFrontmatter(markdown, "Handbook/List.md", collector);

    expect(frontmatter).toStrictEqual({});
    expect(collector.all()).toHaveLength(1);
    expect(collector.all()[0]?.note).toBe("Handbook/List.md");
  });
});
