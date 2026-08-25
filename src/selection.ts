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

  for (const entry of EXCLUSION_FLOOR) {
    if (entry.endsWith("/")) {
      const folderName = entry.slice(0, -1).toLowerCase();
      if (dirSegments.some((segment) => segment.toLowerCase() === folderName)) {
        return true;
      }
    } else if (basename.toLowerCase() === entry.toLowerCase()) {
      return true;
    }
  }

  return false;
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
