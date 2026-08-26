import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { remarkDropBases } from "./bases.js";
import { remarkCallouts } from "./callouts.js";
import { remarkFrontmatterTable, selectFrontmatterTableFields } from "./frontmatter.js";
import { remarkWikilinks, type WikilinkContext } from "./wikilinks.js";

/**
 * The unified pipeline shared by every note. Frozen at module load and
 * reused across notes — a `Processor` is safe to call repeatedly and
 * building one per note would just repeat this wiring for no benefit.
 *
 * Output is a hast tree serialised by `rehype-stringify`; nothing in this
 * module or its callers builds HTML by string concatenation. GFM task-list
 * checkboxes come out of `mdast-util-to-hast` as `disabled` `<input>`
 * elements by construction — there is no reader-facing way to toggle them.
 * `remarkCallouts` and `remarkDropBases` run after `remarkWikilinks` but the
 * relative order among the three is otherwise inert — each touches a
 * disjoint mdast node type (text, blockquote, code) — and
 * `remarkFrontmatterTable` runs last, appending rather than rewriting.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkWikilinks)
  .use(remarkCallouts)
  .use(remarkDropBases)
  .use(remarkFrontmatterTable)
  .use(remarkRehype)
  .use(rehypeStringify);

/**
 * Renders one note's Markdown body to an HTML fragment. The YAML
 * frontmatter block is parsed separately by `frontmatter.ts`; here it is
 * only ever recognised and discarded by `remark-frontmatter` so it does not
 * leak into the body as a literal `---` block.
 *
 * `wikilinks` is required, not optional: `remarkWikilinks` and
 * `remarkDropBases` both read it, and an omitted context previously made
 * both silently no-op — including the Bases drop, so an unpublished
 * `` ```base `` block naming a confidential folder rendered verbatim with
 * no warning. A caller with nothing to resolve against still supplies a
 * real (possibly empty) `WikilinkContext`, so pass-through of unresolved
 * `[[...]]` text is a chosen, tested outcome of an empty index rather than
 * a compile-time way to skip both guarantees.
 *
 * `frontmatter` is the whole record `parseFrontmatter` returned for this
 * note — narrowed to the fixed table field set here, not by the caller, so
 * there is exactly one place deciding which fields reach a page.
 */
export async function renderMarkdown(
  markdown: string,
  wikilinks: WikilinkContext,
  frontmatter?: Record<string, unknown>,
): Promise<string> {
  const frontmatterFields =
    frontmatter === undefined ? undefined : selectFrontmatterTableFields(frontmatter);
  const file = await processor.process({
    value: markdown,
    data: { wikilinkContext: wikilinks, frontmatterFields },
  });
  return String(file);
}
