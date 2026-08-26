import type { Root } from "mdast";
import type { Plugin } from "unified";
import type { TreeNode } from "./tree.js";
import type { WarningCollector } from "./warnings.js";
import { isWikilinkContext } from "./wikilinks.js";

/**
 * Drops every ` ```base ` fenced code block from the tree — Obsidian's
 * Bases query blocks are not supported and `note-rendering` requires them
 * to leave no trace, not merely be left unstyled. Each drop is reported
 * through the same context the wikilink and image plugins use (only its
 * `noteId`/`collector` half is needed here), so warning routing stays in
 * one place per note rather than a second context object per plugin.
 */
export const remarkDropBases: Plugin<[], Root> = () => {
  return (tree, file) => {
    const context: unknown = file.data.wikilinkContext;
    if (!isWikilinkContext(context)) {
      return;
    }
    dropBasesBlocks(tree, context.noteId, context.collector);
  };
};

function dropBasesBlocks(node: TreeNode, noteId: string, collector: WarningCollector): void {
  if (node.children === undefined) {
    return;
  }

  node.children = node.children.filter((child) => {
    if (child.type === "code" && child.lang === "base") {
      collector.push(noteId, "Bases query block was dropped");
      return false;
    }
    return true;
  });

  for (const child of node.children) {
    dropBasesBlocks(child, noteId, collector);
  }
}
