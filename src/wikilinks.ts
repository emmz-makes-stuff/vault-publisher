import type { Root } from "mdast";
import type { Plugin } from "unified";
import type { TreeNode } from "./tree.ts";
import { WarningCollector } from "./warnings.ts";

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
 * The vault-relative path of the vault's own index note — the one
 * `site-navigation` names as the front page. Compared case-sensitively:
 * Obsidian note names are, and a `folders`/`notes` config entry naming
 * anything else at root (`index.md`, lowercase) is a different note that
 * happens to collide on a case-insensitive filesystem, not this one.
 */
const VAULT_ROOT_INDEX_NOTE = "Index.md";

/**
 * The output file path a note path writes to, relative to the site root —
 * decoded, filesystem-safe, exactly what the output writer joins onto its
 * site root to place the rendered file on disk. `notePathToHref` below is
 * defined in terms of this so the href and the file it points at can never
 * be computed independently and drift apart: if they did, every wikilink
 * would 404 behind authentication with no test able to see it, since a
 * test asserting only the href's shape would still pass.
 *
 * The vault root's own `Index.md` is special-cased here, not in the writer
 * or the CLI, so every caller — the writer landing the file, `[[Index]]`
 * resolving through `notePathToHref`, the round-trip test — agrees on the
 * same one answer: it becomes `index.html`, the site's front page, without
 * a second write path or a second decision anywhere else. A subfolder's own
 * `Index.md` (e.g. `Handbook/Index.md`) is untouched by this rule; only the
 * vault-relative path `"Index.md"` itself matches.
 *
 * `hrefToOutputPath` stays a pure decode with no knowledge of this rule: it
 * inverts the *encoding* `notePathToHref` applies to whatever
 * `outputPathForNote` returns, and for `Index.md` that is already
 * `index.html` — so `hrefToOutputPath(notePathToHref("Index.md"))` still
 * equals `outputPathForNote("Index.md")` (`"index.html"`), even though
 * neither function can recover the original note path `"Index.md"` from
 * that href. That asymmetry is inherent to the rule (two note paths could
 * never both collapse onto the same href otherwise) and is exactly what
 * makes `/index.html` a single, unambiguous file to serve.
 */
export function outputPathForNote(notePath: string): string {
  if (notePath === VAULT_ROOT_INDEX_NOTE) {
    return "index.html";
  }
  const withoutExtension = notePath.endsWith(".md") ? notePath.slice(0, -".md".length) : notePath;
  return `${withoutExtension}.html`;
}

/**
 * The inverse of `outputPathForNote`: decodes an href produced by
 * `notePathToHref` back to the same output path, so a round-trip test can
 * assert the two functions agree without either one hard-coding the
 * other's encoding rules.
 */
export function hrefToOutputPath(href: string): string {
  const withoutLeadingSlash = href.startsWith("/") ? href.slice(1) : href;
  return withoutLeadingSlash.split("/").map(decodeURIComponent).join("/");
}

/**
 * The published page a note path renders to. `[[Note#Heading]]` links here
 * too — `note-rendering` requires navigating to the page, not the section,
 * so no heading id is ever synthesised or appended.
 */
export function notePathToHref(notePath: string): string {
  const encodedSegments = outputPathForNote(notePath).split("/").map(encodeURIComponent);
  return `/${encodedSegments.join("/")}`;
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
export function isWikilinkContext(value: unknown): value is WikilinkContext {
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
 * target name. A leading `!` marks an embed (`![[image.png]]`) rather than a
 * link — Obsidian's own distinction between "navigate to" and "show here".
 */
const WIKILINK_PATTERN = /(!)?\[\[([^\][|#]+)(#[^\]|]*)?(?:\|([^\]]*))?]]/g;

export const remarkWikilinks: Plugin<[], Root> = () => {
  return (tree, file) => {
    const rawContext: unknown = file.data.wikilinkContext;
    if (!isWikilinkContext(rawContext)) {
      return;
    }
    transformNode(tree, rawContext);
  };
};

function transformNode(node: TreeNode, context: WikilinkContext, insideLink = false): void {
  if (node.children === undefined) {
    return;
  }

  const childInsideLink = insideLink || node.type === "link";
  const nextChildren: TreeNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value !== undefined) {
      nextChildren.push(...splitWikilinks(child.value, context, childInsideLink));
    } else {
      transformNode(child, context, childInsideLink);
      nextChildren.push(child);
    }
  }
  node.children = nextChildren;
}

function splitWikilinks(value: string, context: WikilinkContext, insideLink: boolean): TreeNode[] {
  const result: TreeNode[] = [];
  let lastIndex = 0;
  WIKILINK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = WIKILINK_PATTERN.exec(value)) !== null) {
    const [full, bang, rawTarget, , rawAlias] = match;
    if (rawTarget === undefined) {
      continue;
    }

    if (match.index > lastIndex) {
      result.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    result.push(
      resolveWikilink(rawTarget.trim(), rawAlias?.trim(), bang === "!", context, insideLink),
    );
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
 * Resolves one `[[target]]`/`[[target|alias]]`/`[[target#heading]]` or
 * `![[target]]` embed match against the published-only index — the single
 * resolver both links and embeds share, so "is this published" is answered
 * in exactly one place regardless of which syntax asked. Exactly one
 * candidate is the only case that can ever produce a route (a `link` node);
 * zero and more-than-one both degrade to plain text, on the same branch
 * shape so ambiguity cannot be quietly narrowed into a guess.
 *
 * Degraded display text is always `alias ?? target` — never the target name
 * when an alias was written, because the target is often the confidential
 * half of the pair the author deliberately hid behind the alias.
 *
 * An embed never produces a route at all, per `note-rendering`'s
 * "attachments are not published" rule: the published set is Markdown notes
 * only, so a single candidate is either a note (Obsidian's transclusion —
 * inlining it would republish content on a page never selected to carry
 * it) or a non-note attachment (an image included — there is no publishable
 * asset kind). Both degrade to plain text with a warning; no `<img>`,
 * `src`, or path to the file ever appears on the page.
 *
 * `insideLink` degrades an otherwise-resolvable link to plain text, with a
 * warning like any other degradation: nesting an `<a>` inside a Markdown
 * link's `<a>` is invalid HTML, and a browser repairs it by closing the
 * outer anchor early, silently breaking the author's link. An embed never
 * produces a route at all, so nesting never applies to it — only the
 * non-embed link branch checks this.
 */
function resolveWikilink(
  target: string,
  alias: string | undefined,
  isEmbed: boolean,
  context: WikilinkContext,
  insideLink: boolean,
): TreeNode {
  const displayText = alias ?? target;
  const candidates = context.noteIndex.get(target.toLowerCase()) ?? [];
  const reference = isEmbed ? `embed of "${target}"` : `wikilink to "${target}"`;

  if (candidates.length === 0) {
    context.collector.push(
      context.noteId,
      `${reference} could not be resolved and was rendered as plain text`,
    );
    return { type: "text", value: displayText };
  }

  if (candidates.length > 1) {
    context.collector.push(
      context.noteId,
      `${reference} is ambiguous between ${candidates.join(", ")} and was rendered as plain text`,
    );
    return { type: "text", value: displayText };
  }

  const [onlyCandidate] = candidates;
  if (onlyCandidate === undefined) {
    // Unreachable: the length checks above leave exactly one element.
    return { type: "text", value: displayText };
  }

  if (!isEmbed) {
    if (insideLink) {
      context.collector.push(
        context.noteId,
        `${reference} is nested inside another link and was rendered as plain text`,
      );
      return { type: "text", value: displayText };
    }
    return {
      type: "link",
      url: notePathToHref(onlyCandidate),
      children: [{ type: "text", value: displayText }],
    };
  }

  if (onlyCandidate.toLowerCase().endsWith(".md")) {
    context.collector.push(
      context.noteId,
      `embed of "${target}" is a note; transclusion is not supported and it was rendered as plain text`,
    );
    return { type: "text", value: displayText };
  }

  context.collector.push(
    context.noteId,
    `embed of "${target}" is an attachment and cannot be published; it was rendered as plain text`,
  );
  return { type: "text", value: displayText };
}
