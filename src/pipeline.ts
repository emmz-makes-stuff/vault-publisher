import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
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
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkWikilinks)
  .use(remarkRehype)
  .use(rehypeStringify);

/**
 * Renders one note's Markdown body to an HTML fragment. The YAML
 * frontmatter block is parsed separately by `frontmatter.ts`; here it is
 * only ever recognised and discarded by `remark-frontmatter` so it does not
 * leak into the body as a literal `---` block.
 *
 * `wikilinks` is optional so 4.1's plain-rendering tests are unaffected —
 * with it omitted, `remarkWikilinks` is a no-op and `[[...]]` text passes
 * through untouched. Callers that render published notes always supply it.
 */
export async function renderMarkdown(
  markdown: string,
  wikilinks?: WikilinkContext,
): Promise<string> {
  const file = await processor.process({ value: markdown, data: { wikilinkContext: wikilinks } });
  return String(file);
}
