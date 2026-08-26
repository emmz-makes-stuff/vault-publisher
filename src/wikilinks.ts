import type { Root } from "mdast";
import type { Plugin } from "unified";
import { WarningCollector } from "./warnings.js";

/**
 * Maps an Obsidian note name — the filename without its `.md` extension,
 * lowercased — to every published path carrying that name. Built from
 * `resolveSelection`'s output only, never from a filesystem walk: an
 * unpublished or absent note is simply not a key here, so "unpublished" and
 * "absent" resolve through the same lookup miss rather than two code paths
 * that could drift apart. More than one path under a key means Obsidian's
 * name-based resolution is ambiguous for that name.
 */
export type NoteIndex = ReadonlyMap<string, readonly string[]>;

export function buildNoteIndex(published: readonly string[]): NoteIndex {
  const index = new Map<string, string[]>();
  for (const notePath of published) {
    const key = noteNameKey(notePath);
    const bucket = index.get(key);
    if (bucket === undefined) {
      index.set(key, [notePath]);
    } else {
      bucket.push(notePath);
    }
  }
  return index;
}

function noteNameKey(notePath: string): string {
  const basename = notePath.split("/").at(-1) ?? notePath;
  const name = basename.endsWith(".md") ? basename.slice(0, -".md".length) : basename;
  return name.toLowerCase();
}

/**
 * The published page a note path renders to. `[[Note#Heading]]` links here
 * too — `note-rendering` requires navigating to the page, not the section,
 * so no heading id is ever synthesised or appended.
 */
export function notePathToHref(notePath: string): string {
  const withoutExtension = notePath.endsWith(".md") ? notePath.slice(0, -".md".length) : notePath;
  const encodedSegments = withoutExtension.split("/").map(encodeURIComponent);
  return `/${encodedSegments.join("/")}.html`;
}

export interface WikilinkContext {
  readonly noteId: string;
  readonly noteIndex: NoteIndex;
  readonly collector: WarningCollector;
}

/**
 * Runtime-checked, not just asserted: `file.data` is `vfile`'s
 * `Record<string, unknown>`, so anything read off `wikilinkContext` is
 * unknown until its shape is actually verified. `pipeline.ts` is the only
 * writer and always writes this exact shape or omits the key, but the
 * check — not a documented assumption — is what makes a future writer's
 * mistake fail loudly here rather than surface as a silent no-op or a
 * runtime crash three functions away.
 */
function isWikilinkContext(value: unknown): value is WikilinkContext {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof WikilinkContext, unknown>>;
  return (
    typeof candidate.noteId === "string" &&
    candidate.noteIndex instanceof Map &&
    candidate.collector instanceof WarningCollector
  );
}

/**
 * Wikilinks never reach `remark-parse` as their own node type — `[[Note]]`
 * parses as ordinary text, brackets included — so this plugin works the
 * mdast tree directly: split every text node on the wikilink pattern and
 * replace each match with either a `link` node (resolved) or another `text`
 * node (degraded), before `remark-rehype` ever runs. The tree stays the
 * only representation; nothing here touches rendered HTML.
 *
 * The target group excludes `[` as well as `]`, `|` and `#`, so a stray
 * unmatched bracket inside a malformed link can never be swallowed into the
 * target name.
 */
const WIKILINK_PATTERN = /\[\[([^\][|#]+)(#[^\]|]*)?(?:\|([^\]]*))?]]/g;

interface TreeNode {
  type: string;
  value?: string;
  url?: string;
  children?: TreeNode[];
}

export const remarkWikilinks: Plugin<[], Root> = () => {
  return (tree, file) => {
    const rawContext: unknown = file.data.wikilinkContext;
    if (!isWikilinkContext(rawContext)) {
      return;
    }
    transformNode(tree, rawContext);
  };
};

function transformNode(node: TreeNode, context: WikilinkContext): void {
  if (node.children === undefined) {
    return;
  }

  const nextChildren: TreeNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value !== undefined) {
      nextChildren.push(...splitWikilinks(child.value, context));
    } else {
      transformNode(child, context);
      nextChildren.push(child);
    }
  }
  node.children = nextChildren;
}

function splitWikilinks(value: string, context: WikilinkContext): TreeNode[] {
  const result: TreeNode[] = [];
  let lastIndex = 0;
  WIKILINK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = WIKILINK_PATTERN.exec(value)) !== null) {
    const [full, rawTarget, , rawAlias] = match;
    if (rawTarget === undefined) {
      continue;
    }

    if (match.index > lastIndex) {
      result.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    result.push(resolveWikilink(rawTarget.trim(), rawAlias?.trim(), context));
    lastIndex = match.index + full.length;
  }

  if (lastIndex < value.length) {
    result.push({ type: "text", value: value.slice(lastIndex) });
  }

  if (result.length === 0) {
    result.push({ type: "text", value });
  }

  return result;
}

/**
 * Resolves one `[[target]]`/`[[target|alias]]`/`[[target#heading]]` match
 * against the published-only index. Exactly one candidate is the only case
 * that links; zero and more-than-one both degrade to plain text, on the
 * same branch shape so ambiguity cannot be quietly narrowed into a guess.
 *
 * Degraded display text is always `alias ?? target` — never the target name
 * when an alias was written, because the target is often the confidential
 * half of the pair the author deliberately hid behind the alias.
 */
function resolveWikilink(
  target: string,
  alias: string | undefined,
  context: WikilinkContext,
): TreeNode {
  const displayText = alias ?? target;
  const candidates = context.noteIndex.get(target.toLowerCase()) ?? [];

  if (candidates.length === 0) {
    context.collector.push(
      context.noteId,
      `wikilink to "${target}" could not be resolved and was rendered as plain text`,
    );
    return { type: "text", value: displayText };
  }

  if (candidates.length > 1) {
    context.collector.push(
      context.noteId,
      `wikilink to "${target}" is ambiguous between ${candidates.join(", ")} and was rendered as plain text`,
    );
    return { type: "text", value: displayText };
  }

  const [onlyCandidate] = candidates;
  if (onlyCandidate === undefined) {
    // Unreachable: the length checks above leave exactly one element.
    return { type: "text", value: displayText };
  }

  return {
    type: "link",
    url: notePathToHref(onlyCandidate),
    children: [{ type: "text", value: displayText }],
  };
}
