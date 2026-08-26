import { describe, expect, it } from "vitest";
import { parseFrontmatter, selectFrontmatterTableFields } from "../src/frontmatter.js";
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

describe("selectFrontmatterTableFields", () => {
  it("keeps only fields in the fixed set, in the set's order", () => {
    const fields = selectFrontmatterTableFields({
      status: "active",
      type: "reference",
      secret: "should never appear",
    });

    expect(fields).toStrictEqual([
      { field: "type", value: "reference" },
      { field: "status", value: "active" },
    ]);
  });

  it("drops a field outside the fixed set entirely — not blanked, absent", () => {
    const fields = selectFrontmatterTableFields({ type: "reference", not_a_real_field: "leak" });

    expect(fields).toStrictEqual([{ field: "type", value: "reference" }]);
    expect(fields.some((entry) => entry.value.includes("leak"))).toBe(false);
  });

  it("omits a listed field with no value", () => {
    const fields = selectFrontmatterTableFields({
      type: "reference",
      owner: null,
      grade: undefined,
    });

    expect(fields).toStrictEqual([{ field: "type", value: "reference" }]);
  });

  it("returns an empty list for a record with none of the listed fields", () => {
    expect(selectFrontmatterTableFields({ secret: "unlisted" })).toStrictEqual([]);
  });

  it("returns an empty list for an empty record", () => {
    expect(selectFrontmatterTableFields({})).toStrictEqual([]);
  });

  it("joins an array value with a comma", () => {
    const fields = selectFrontmatterTableFields({ tags: ["ops", "internal"] });

    expect(fields).toStrictEqual([{ field: "tags", value: "ops, internal" }]);
  });

  it("formats a YAML-parsed Date value as a plain date, not a full timestamp", () => {
    const fields = selectFrontmatterTableFields({ updated: new Date("2026-08-01T00:00:00.000Z") });

    expect(fields).toStrictEqual([{ field: "updated", value: "2026-08-01" }]);
  });
});
