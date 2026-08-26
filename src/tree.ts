/**
 * Minimal structural view of an mdast/hast-shaped tree node, shared by every
 * plugin in this pipeline that rewrites the parse tree directly (wikilinks
 * and image embeds, callouts, dropped Bases blocks, the frontmatter table).
 * Not the full `mdast` type — just the fields these plugins read or write —
 * so one shape is reused instead of each plugin declaring its own subset.
 * `data.hProperties` is `mdast-util-to-hast`'s tree-based escape hatch for
 * attaching HTML attributes (e.g. a class) to a node without ever building
 * or inserting a string of HTML — the tree stays the only representation
 * from parse to `rehype-stringify`.
 */
export interface TreeNode {
  type: string;
  value?: string | undefined;
  url?: string | undefined;
  alt?: string | null | undefined;
  lang?: string | null | undefined;
  align?: (string | null)[] | null | undefined;
  data?: { hProperties?: Record<string, unknown> | undefined } | undefined;
  children?: TreeNode[] | undefined;
}
