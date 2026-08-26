import type { Element } from "hast";
import type { NavigationEntry } from "./navigation.ts";
import { notePathToHref } from "./wikilinks.ts";

/**
 * Renders the navigation tree as `<details>`/`<summary>` — the whole
 * collapse mechanism is native HTML, per `design.md` §2's "zero
 * client-side JavaScript": a folder's initial open/closed state is decided
 * once, here, at render time, and nothing on the page ever changes it
 * afterwards. `currentNotePath` decides that state — every folder on the
 * path from the root down to the page being rendered opens; every other
 * folder, however deep, renders closed. This module only builds hast
 * nodes; `page.ts` is the only place any of them are ever serialised.
 */
export function renderExplorer(
  entries: readonly NavigationEntry[],
  currentNotePath: string,
): Element {
  return element("nav", { className: ["explorer"] }, [renderEntryList(entries, currentNotePath)]);
}

function renderEntryList(entries: readonly NavigationEntry[], currentNotePath: string): Element {
  return element(
    "ul",
    {},
    entries.map((entry) => renderEntry(entry, currentNotePath)),
  );
}

function renderEntry(entry: NavigationEntry, currentNotePath: string): Element {
  if (entry.type === "note") {
    return element("li", {}, [
      element("a", { href: notePathToHref(entry.notePath) }, [
        { type: "text", value: entry.label },
      ]),
    ]);
  }

  const properties = isAncestorFolder(entry.path, currentNotePath) ? { open: true } : {};
  return element("li", {}, [
    element("details", properties, [
      element("summary", {}, [{ type: "text", value: entry.label }]),
      renderEntryList(entry.entries, currentNotePath),
    ]),
  ]);
}

/**
 * Whether `folderPath` sits on the path from the root down to
 * `currentNotePath` — either it *is* the note's own containing folder, or
 * an ancestor of it. A folder holding an unrelated branch of the tree
 * never matches, however close it sits to the current page.
 */
function isAncestorFolder(folderPath: string, currentNotePath: string): boolean {
  const currentFolder = currentNotePath.split("/").slice(0, -1).join("/");
  return currentFolder === folderPath || currentFolder.startsWith(`${folderPath}/`);
}

function element(
  tagName: string,
  properties: Element["properties"],
  children: Element["children"],
): Element {
  return { type: "element", tagName, properties, children };
}
