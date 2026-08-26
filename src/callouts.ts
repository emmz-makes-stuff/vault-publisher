import type { Root } from "mdast";
import type { Plugin } from "unified";
import type { TreeNode } from "./tree.js";

/**
 * The Obsidian callout types this pipeline recognises. A blockquote opening
 * with any other `[!type]` marker — or no marker at all — is left as an
 * ordinary blockquote; `note-rendering` only names these nine.
 */
const CALLOUT_TYPES = new Set([
  "warning",
  "important",
  "danger",
  "note",
  "abstract",
  "tip",
  "quote",
  "success",
  "info",
]);

const MARKER_PATTERN = /^\[!([a-zA-Z][\w-]*)]\s?(.*)$/;

/**
 * Rewrites `> [!type] Title` blockquotes into a callout: a `blockquote`
 * carrying a type-distinguishing class, its first line split into a
 * dedicated title block and the remainder folded back into the body. Runs
 * as a tree transform, like `remarkWikilinks` — the class is attached via
 * `data.hProperties`, `mdast-util-to-hast`'s structural escape hatch, never
 * by building or inserting a string of HTML.
 */
export const remarkCallouts: Plugin<[], Root> = () => {
  return (tree) => {
    transformCallouts(tree);
  };
};

function transformCallouts(node: TreeNode): void {
  if (node.children === undefined) {
    return;
  }
  for (const child of node.children) {
    if (child.type === "blockquote") {
      tryTransformCallout(child);
    }
    transformCallouts(child);
  }
}

function tryTransformCallout(blockquote: TreeNode): void {
  const blocks = blockquote.children ?? [];
  const [firstBlock, ...restBlocks] = blocks;
  if (firstBlock === undefined || firstBlock.type !== "paragraph") {
    return;
  }

  const inline = firstBlock.children ?? [];
  const [firstInline, ...restInline] = inline;
  if (firstInline === undefined || firstInline.type !== "text" || firstInline.value === undefined) {
    return;
  }

  const newlineIndex = firstInline.value.indexOf("\n");
  const firstLine =
    newlineIndex === -1 ? firstInline.value : firstInline.value.slice(0, newlineIndex);
  const remainder = newlineIndex === -1 ? "" : firstInline.value.slice(newlineIndex + 1);

  const match = MARKER_PATTERN.exec(firstLine);
  const rawType = match?.[1];
  if (match === null || rawType === undefined) {
    return;
  }

  const type = rawType.toLowerCase();
  if (!CALLOUT_TYPES.has(type)) {
    return;
  }

  const titleText = (match[2] ?? "").trim();
  const title =
    titleText.length > 0 ? titleText : `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}`;

  const remainderChildren: TreeNode[] =
    remainder.length > 0 ? [{ type: "text", value: remainder }] : [];
  const bodyParagraphChildren = [...remainderChildren, ...restInline];

  const bodyBlocks: TreeNode[] =
    bodyParagraphChildren.length > 0
      ? [{ type: "paragraph", children: bodyParagraphChildren }, ...restBlocks]
      : restBlocks;

  blockquote.data = { hProperties: { className: ["callout", `callout-${type}`] } };
  blockquote.children = [
    {
      type: "paragraph",
      data: { hProperties: { className: ["callout-title"] } },
      children: [{ type: "text", value: title }],
    },
    ...bodyBlocks,
  ];
}
