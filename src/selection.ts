import { readdir } from "node:fs/promises";
import path from "node:path";
import type { PublishConfig } from "./config.js";

/**
 * Fixed, non-configurable exclusion floor. Config cannot name its way past
 * this list — see `isExcluded`, which is applied last and unconditionally to
 * whatever `resolveSelection` would otherwise publish.
 */
export const EXCLUSION_FLOOR: readonly string[] = [
  "CLAUDE.md",
  ".claude/",
  ".obsidian/",
  "Journal/",
  "Private/",
];

export interface SelectionResult {
  readonly published: readonly string[];
  readonly unmatched: readonly string[];
}

/**
 * Decides what publishes from a validated config and the set of `.md` paths
 * present in the vault. Pure — no filesystem access, so it is testable with
 * plain data. `unmatched` is populated here but not reported; that is 3.6.
 */
export function resolveSelection(
  config: PublishConfig,
  vaultPaths: readonly string[],
): SelectionResult {
  const vaultSet = new Set(vaultPaths);
  const published = new Set<string>();
  const matchedFolders = new Set<string>();
  const matchedNotes = new Set<string>();

  for (const notePath of vaultPaths) {
    for (const folder of config.folders) {
      if (isWithinFolder(notePath, folder)) {
        published.add(notePath);
        matchedFolders.add(folder);
      }
    }
  }

  for (const note of config.notes) {
    if (vaultSet.has(note)) {
      published.add(note);
      matchedNotes.add(note);
    }
  }

  const unmatched = [
    ...config.folders.filter((folder) => !matchedFolders.has(folder)),
    ...config.notes.filter((note) => !matchedNotes.has(note)),
  ];

  return {
    published: [...published].filter((notePath) => !isExcluded(notePath)).sort(),
    unmatched,
  };
}

function isWithinFolder(notePath: string, folder: string): boolean {
  return notePath === folder || notePath.startsWith(`${folder}/`);
}

function matchesFloorFolder(segment: string): boolean {
  const lower = segment.toLowerCase();
  return EXCLUSION_FLOOR.some(
    (entry) => entry.endsWith("/") && entry.slice(0, -1).toLowerCase() === lower,
  );
}

function matchesFloorFile(basename: string): boolean {
  const lower = basename.toLowerCase();
  return EXCLUSION_FLOOR.some((entry) => !entry.endsWith("/") && entry.toLowerCase() === lower);
}

/**
 * Case-insensitive: the vault lives on a case-insensitive macOS filesystem,
 * so a case-sensitive floor would let `journal/` through while the owner
 * believes `Journal/` is excluded. A folder entry excludes any path with
 * that name as a directory segment at any depth; a file entry excludes any
 * file with that basename at any depth.
 */
function isExcluded(notePath: string): boolean {
  const segments = notePath.split("/");
  const basename = segments[segments.length - 1] ?? "";
  const dirSegments = segments.slice(0, -1);

  return dirSegments.some(matchesFloorFolder) || matchesFloorFile(basename);
}

/**
 * Whether a *configuration entry itself* — not a note somewhere beneath it —
 * names a path the exclusion floor withholds. Distinct from the filtering
 * `resolveSelection` already does: a folder entry such as `Handbook` must
 * not trip this just because it happens to contain a nested `Private/` (3.5
 * — `Handbook`'s own notes still publish); it trips only when the entry's
 * own name matches the floor, e.g. `Journal` or `CLAUDE.md` named directly.
 * `unmatched` already covers an entry naming a path absent from the vault;
 * this covers one naming a path that is present but withheld unconditionally
 * — the case 3.6 gives its own warning line so it isn't silently dropped.
 */
export function isEntryWithheldByFloor(entry: string, kind: "folder" | "note"): boolean {
  if (kind === "note") {
    return isExcluded(entry);
  }
  return entry.split("/").some(matchesFloorFolder);
}

/**
 * Walks the vault for `.md` files and returns vault-relative POSIX paths,
 * sorted. Deliberately thin: all selection logic lives in `resolveSelection`
 * above, which this just feeds.
 */
export async function listVaultNotes(vaultRoot: string): Promise<readonly string[]> {
  const entries = await readdir(vaultRoot, { withFileTypes: true, recursive: true });

  const notes = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) =>
      path.relative(vaultRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    );

  return notes.sort();
}
