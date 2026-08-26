import type { Root } from "mdast";
import type { Plugin } from "unified";
import { parse as parseYaml } from "yaml";
import type { TreeNode } from "./tree.ts";
import { WarningCollector } from "./warnings.ts";

/**
 * Obsidian frontmatter: a `---` delimited YAML block at the very start of
 * the file. Anchored to the start of the string, not merely a line, so a
 * `---` thematic break inside the body is never mistaken for a second
 * frontmatter block.
 */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parses a note's frontmatter into a typed record. Not fatal: a note whose
 * frontmatter fails to parse still publishes, with an empty record and a
 * warning through `collector` naming `noteId` — fail-closed applies to
 * selection, not to a missing table on a note already selected to publish.
 * A note with no frontmatter block also yields an empty record, silently.
 *
 * Parses the whole frontmatter, not narrowed to the fixed field set
 * `note-rendering`'s page footer uses — narrowing that here would make this
 * module a second place deciding what a page shows.
 */
export function parseFrontmatter(
  markdown: string,
  noteId: string,
  collector: WarningCollector,
): Record<string, unknown> {
  const match = FRONTMATTER_PATTERN.exec(markdown);
  if (match === null) {
    return {};
  }

  const yamlBlock = match[1] ?? "";

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch {
    collector.push(noteId, "frontmatter could not be parsed as YAML; publishing without it");
    return {};
  }

  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    collector.push(noteId, "frontmatter could not be parsed as YAML; publishing without it");
    return {};
  }

  // Guarded above: not null/undefined, typeof is "object", and not an array —
  // this is a plain mapping, so the cast reflects a narrowed runtime shape
  // rather than papering over an unchecked one.
  return parsed as Record<string, unknown>;
}

/**
 * The fixed, non-configurable field set `note-rendering`'s per-page footer
 * shows — an allow-list, not a filter to widen later. A field outside this
 * set never reaches the table, however the note's own frontmatter is shaped.
 */
export const FRONTMATTER_TABLE_FIELDS = [
  "type",
  "area",
  "grade",
  "status",
  "owner",
  "tags",
  "updated",
  "starts",
  "ends",
] as const;

export interface FrontmatterTableField {
  readonly field: (typeof FRONTMATTER_TABLE_FIELDS)[number];
  readonly value: string;
}

/**
 * Narrows a parsed frontmatter record to the fixed field set, in the set's
 * own order, dropping any field with no value (`undefined`/`null`) and
 * every field the set doesn't name. An empty result means "no table" — the
 * caller renders nothing rather than an empty one.
 */
export function selectFrontmatterTableFields(
  record: Record<string, unknown>,
): readonly FrontmatterTableField[] {
  const fields: FrontmatterTableField[] = [];
  for (const field of FRONTMATTER_TABLE_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null) {
      continue;
    }
    fields.push({ field, value: formatFrontmatterValue(value) });
  }
  return fields;
}

function formatFrontmatterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatFrontmatterScalar(item)).join(", ");
  }
  return formatFrontmatterScalar(value);
}

function formatFrontmatterScalar(value: unknown): string {
  // `yaml` parses an unquoted ISO date (`updated: 2026-08-01`) into a JS
  // `Date`, not a string — formatted here rather than left to `String()`,
  // whose output (a full UTC timestamp string) is not what the frontmatter
  // author wrote.
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function isFrontmatterTableFields(value: unknown): value is readonly FrontmatterTableField[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const candidate = item as Partial<Record<keyof FrontmatterTableField, unknown>>;
      return typeof candidate.field === "string" && typeof candidate.value === "string";
    })
  );
}

/**
 * Appends the frontmatter table as the last block of the tree, built the
 * same way any other node in this pipeline is — an mdast `table` spliced
 * into the tree, converted to hast by `remark-rehype` alongside a note's
 * own tables, and serialised only by `rehype-stringify`. Every value is a
 * `text` node, so an HTML metacharacter in an author-controlled frontmatter
 * value is escaped structurally, not by an escaping call this module could
 * forget to make.
 */
export const remarkFrontmatterTable: Plugin<[], Root> = () => {
  return (tree, file) => {
    const fields: unknown = file.data.frontmatterFields;
    if (!isFrontmatterTableFields(fields) || fields.length === 0) {
      return;
    }
    appendFrontmatterTable(tree, fields);
  };
};

function appendFrontmatterTable(node: TreeNode, fields: readonly FrontmatterTableField[]): void {
  node.children = [...(node.children ?? []), buildFrontmatterTableNode(fields)];
}

function buildFrontmatterTableNode(fields: readonly FrontmatterTableField[]): TreeNode {
  const headerRow = buildTableRow("Field", "Value");
  const bodyRows = fields.map((entry) => buildTableRow(entry.field, entry.value));
  return {
    type: "table",
    align: [null, null],
    data: { hProperties: { className: ["frontmatter-table"] } },
    children: [headerRow, ...bodyRows],
  };
}

function buildTableRow(field: string, value: string): TreeNode {
  return {
    type: "tableRow",
    children: [
      { type: "tableCell", children: [{ type: "text", value: field }] },
      { type: "tableCell", children: [{ type: "text", value }] },
    ],
  };
}
