import type { Root as HastRoot } from "hast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { remarkDropBases } from "./bases.ts";
import { remarkCallouts } from "./callouts.ts";
import { remarkFrontmatterTable, selectFrontmatterTableFields } from "./frontmatter.ts";
import { remarkWikilinks, type WikilinkContext } from "./wikilinks.ts";

/**
 * Two processors, not one, so a page assembler can take a note's hast tree
 * and serialise a *whole page* exactly once, per `design.md` §2. `treeProcessor`
 * runs parse through the mdast->hast conversion and stops there —
 * `renderNoteToHast` below is its output, unstringified. `htmlProcessor` only
 * ever stringifies an already-built hast tree; `renderMarkdown` chains the
 * two so its own byte-for-byte output is unchanged from before this split,
 * but nothing here or in `page.ts` ever interpolates one stringified
 * fragment into another string — a tree is the only representation until
 * the single `rehype-stringify` call that produces a given piece of output.
 *
 * Frozen at module load and reused across notes — a `Processor` is safe to
 * call repeatedly and building one per note would just repeat this wiring
 * for no benefit. GFM task-list checkboxes come out of `mdast-util-to-hast`
 * as `disabled` `<input>` elements by construction — there is no
 * reader-facing way to toggle them. `remarkCallouts` and `remarkDropBases`
 * run after `remarkWikilinks` but the relative order among the three is
 * otherwise inert — each touches a disjoint mdast node type (text,
 * blockquote, code) — and `remarkFrontmatterTable` runs last, appending
 * rather than rewriting.
 */
const treeProcessor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkWikilinks)
  .use(remarkCallouts)
  .use(remarkDropBases)
  .use(remarkFrontmatterTable)
  .use(remarkRehype);

const htmlProcessor = unified().use(rehypeStringify);

/**
 * Renders one note's Markdown body to its hast tree — `page.ts`'s only
 * ingredient for a note's content, and the sole producer `renderMarkdown`
 * below is defined in terms of. The YAML frontmatter block is parsed
 * separately by `frontmatter.ts`; here it is only ever recognised and
 * discarded by `remark-frontmatter` so it does not leak into the body as a
 * literal `---` block.
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
export async function renderNoteToHast(
  markdown: string,
  wikilinks: WikilinkContext,
  frontmatter?: Record<string, unknown>,
): Promise<HastRoot> {
  const frontmatterFields =
    frontmatter === undefined ? undefined : selectFrontmatterTableFields(frontmatter);
  const file = { value: markdown, data: { wikilinkContext: wikilinks, frontmatterFields } };
  const mdastTree = treeProcessor.parse(file);
  return treeProcessor.run(mdastTree, file);
}

/**
 * Renders one note's Markdown body to an HTML fragment — used directly by
 * callers (and tests) that want a note's content on its own, with no page
 * around it. Stringifies `renderNoteToHast`'s tree exactly once; never
 * called again on a tree that already went through this.
 */
export async function renderMarkdown(
  markdown: string,
  wikilinks: WikilinkContext,
  frontmatter?: Record<string, unknown>,
): Promise<string> {
  const hastTree = await renderNoteToHast(markdown, wikilinks, frontmatter);
  return htmlProcessor.stringify(hastTree);
}
