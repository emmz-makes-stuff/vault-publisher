import { parse as parseYaml } from "yaml";
import { WarningCollector } from "./warnings.js";

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
