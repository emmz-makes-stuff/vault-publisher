/**
 * The explorer's navigation tree — a folder/note hierarchy built from
 * `resolveSelection`'s `published` array and nothing else, the same rule
 * `buildNoteIndex` follows (`wikilinks.ts`). No filesystem walk, no config
 * read: a folder that holds no published note simply never gets a node, so
 * "excluded" and "empty" cannot drift apart between this tree and what the
 * pipeline actually renders.
 *
 * Model only — this module produces data and labels, never HTML or a
 * `<details>`/`<summary>` string. `design.md` §2: the tree is the only
 * representation from parse to `rehype-stringify`, and that applies to the
 * explorer's own markup as much as to a note's body.
 */

export interface NavigationNoteEntry {
  readonly type: "note";
  readonly notePath: string;
  readonly label: string;
  readonly sortKey: string;
}

export interface NavigationFolderEntry {
  readonly type: "folder";
  readonly path: string;
  readonly label: string;
  readonly sortKey: string;
  readonly entries: readonly NavigationEntry[];
}

export type NavigationEntry = NavigationNoteEntry | NavigationFolderEntry;

interface MutableFolder {
  readonly path: string;
  readonly label: string;
  readonly folders: Map<string, MutableFolder>;
  readonly notes: NavigationNoteEntry[];
}

/**
 * Builds the navigation tree from the published set. `titleByNotePath` maps
 * a published note path to its frontmatter `title`, where present — the
 * caller (which already runs `parseFrontmatter`) supplies this as plain
 * data so the tree builder itself stays pure and synchronous, with no file
 * access of its own.
 */
export function buildNavigationTree(
  published: readonly string[],
  titleByNotePath: ReadonlyMap<string, string>,
): readonly NavigationEntry[] {
  const root: MutableFolder = { path: "", label: "", folders: new Map(), notes: [] };

  for (const notePath of published) {
    const segments = notePath.split("/");
    const fileName = segments.at(-1) ?? notePath;
    const folderSegments = segments.slice(0, -1);

    let current = root;
    let currentPath = "";
    for (const segment of folderSegments) {
      currentPath = currentPath === "" ? segment : `${currentPath}/${segment}`;
      let child = current.folders.get(segment);
      if (child === undefined) {
        child = { path: currentPath, label: segment, folders: new Map(), notes: [] };
        current.folders.set(segment, child);
      }
      current = child;
    }

    current.notes.push({
      type: "note",
      notePath,
      label: noteLabel(notePath, titleByNotePath),
      sortKey: fileName,
    });
  }

  return freezeFolder(root);
}

/**
 * The label for one note, wherever one is needed — an explorer entry or a
 * page's own `<title>` (`page.ts`) — so both agree on the same title without
 * either recomputing the fallback rule. Frontmatter `title` where present,
 * the filename with `.md` stripped otherwise.
 */
export function noteLabel(notePath: string, titleByNotePath: ReadonlyMap<string, string>): string {
  const existing = titleByNotePath.get(notePath);
  if (existing !== undefined) {
    return existing;
  }
  const fileName = notePath.split("/").at(-1) ?? notePath;
  return fileName.endsWith(".md") ? fileName.slice(0, -".md".length) : fileName;
}

function freezeFolder(folder: MutableFolder): readonly NavigationEntry[] {
  const folderEntries: NavigationFolderEntry[] = [...folder.folders.values()].map((child) => ({
    type: "folder",
    path: child.path,
    label: child.label,
    sortKey: child.label,
    entries: freezeFolder(child),
  }));

  const entries: NavigationEntry[] = [...folderEntries, ...folder.notes];
  entries.sort(compareBySortKey);
  return entries;
}

/**
 * Ordering is by filename — the vault-relative segment name, not the
 * displayed label — per `site-navigation`'s "Ordering does not follow the
 * label" scenario. Plain string comparison (UTF-16 code unit order), not
 * `localeCompare`: `localeCompare`'s collation is locale- and
 * ICU-version-dependent, so the same two names could sort differently on
 * two machines running this same code. Folders and notes are not sorted as
 * separate groups — the spec does not say folders-first, so this picks one
 * behaviour (interleaved by filename) and tests it, rather than leaving it
 * for the first golden file to decide by accident.
 */
function compareBySortKey(a: NavigationEntry, b: NavigationEntry): number {
  if (a.sortKey < b.sortKey) {
    return -1;
  }
  if (a.sortKey > b.sortKey) {
    return 1;
  }
  return 0;
}
