import type { Element, ElementContent, Root as HastRoot, RootContent } from "hast";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { renderExplorer } from "./explorer.ts";
import { noteLabel, type NavigationEntry } from "./navigation.ts";

/**
 * Serialises a whole page's hast tree, once, per `design.md` §2 — the same
 * rule `pipeline.ts` follows for a note fragment. Never reused to stringify
 * a note in isolation and splice the result in here: `renderPage` below
 * takes a note's hast tree straight from `renderNoteToHast` and only ever
 * calls this after the whole document — explorer included — is one tree.
 */
const documentStringifier = unified().use(rehypeStringify);

export interface PageInput {
  /** The vault-relative path of the note this page renders. */
  readonly notePath: string;
  /** Every published note's title, for this page's own `<title>` and the explorer's labels. */
  readonly titleByNotePath: ReadonlyMap<string, string>;
  /** The full navigation tree — the explorer renders unchanged regardless of which page it sits on. */
  readonly navigation: readonly NavigationEntry[];
  /** The note's own rendered content — `renderNoteToHast(...).children`, never a pre-stringified fragment. */
  readonly noteContent: readonly RootContent[];
}

/**
 * Assembles one page — explorer, title, stylesheet link, and the note's own
 * content — as a single hast document, then serialises it exactly once.
 * `noteContent` is a tree, not a string: splicing `renderMarkdown`'s output
 * in here instead would either double-escape it (wrapped as a text node) or
 * require `rehype-raw` to re-parse it, both of which this module refuses,
 * per the block B brief.
 */
export function renderPage(input: PageInput): string {
  const title = noteLabel(input.notePath, input.titleByNotePath);
  const document = buildDocument(title, input.navigation, input.notePath, input.noteContent);
  return documentStringifier.stringify(document);
}

/**
 * The fallback front page `index.ts` writes at the site root when no index
 * note from the vault root is in the published set (`site-navigation`'s
 * "The site root always serves a page"). Built from `navigation` alone —
 * the same tree every other page's explorer renders from `published`, and
 * nothing else — so this function has no way to read, and therefore no way
 * to leak, the content, title or existence of any unpublished note,
 * including a vault-root index note the configuration deliberately
 * excluded. Its own title and body text are fixed strings, not derived
 * from anything vault-supplied.
 *
 * `currentNotePath` is `""`, not a real note path — no folder in the
 * explorer is the "current" one, so `renderExplorer` opens none of them by
 * default, matching there being no single page this represents.
 */
export function renderGeneratedFrontPage(navigation: readonly NavigationEntry[]): string {
  const document = buildDocument("Home", navigation, "", [
    element("p", {}, [{ type: "text", value: "Select a page from the navigation." }]),
  ]);
  return documentStringifier.stringify(document);
}

function buildDocument(
  title: string,
  navigation: readonly NavigationEntry[],
  currentNotePath: string,
  noteContent: readonly RootContent[],
): HastRoot {
  return {
    type: "root",
    children: [
      { type: "doctype" },
      element("html", { lang: "en" }, [
        element("head", {}, [
          element("meta", { charSet: "utf-8" }, []),
          element("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }, []),
          element("title", {}, [{ type: "text", value: title }]),
          element("link", { rel: ["stylesheet"], href: "/styles.css" }, []),
        ]),
        element("body", {}, [
          element("div", { className: ["layout"] }, [
            renderExplorer(navigation, currentNotePath),
            element("main", { className: ["content"] }, toElementContent(noteContent)),
          ]),
        ]),
      ]),
    ],
  };
}

/**
 * `renderNoteToHast`'s tree is typed as a hast `Root`, whose children admit
 * a `doctype` node in principle even though `remark-rehype` never emits one
 * in practice — `<main>`'s own children type excludes it. A runtime filter,
 * not a cast: the type narrows honestly from what a note's tree could
 * contain, rather than asserting away a case this module never actually
 * expects to see.
 */
function toElementContent(nodes: readonly RootContent[]): ElementContent[] {
  return nodes.filter((node): node is ElementContent => node.type !== "doctype");
}

function element(
  tagName: string,
  properties: Element["properties"],
  children: Element["children"],
): Element {
  return { type: "element", tagName, properties, children };
}
