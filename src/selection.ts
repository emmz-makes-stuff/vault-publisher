import { readdir, realpath, stat } from "node:fs/promises";
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

// `matchesFloorFolder`/`matchesFloorFile` below only ever compare a single
// path segment or a basename. A multi-segment entry (`"Clients/Internal/"`)
// would read as protective while excluding nothing — fail at load time
// rather than silently no-op.
for (const floorEntry of EXCLUSION_FLOOR) {
  const segment = floorEntry.endsWith("/") ? floorEntry.slice(0, -1) : floorEntry;
  if (segment.includes("/")) {
    throw new Error(
      `EXCLUSION_FLOOR entry "${floorEntry}" has more than one path segment; ` +
        "the floor only matches a single segment or basename, so a multi-segment " +
        "entry would silently exclude nothing.",
    );
  }
}

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
 * Whether a walked candidate resolves to where the walk found it, expressed
 * as a pair of paths relative to their own roots — not an absolute-path
 * prefix check, which would misfire the moment the vault root itself sits
 * under a symlinked ancestor (macOS puts `/tmp` -> `/private/tmp`, which is
 * exactly the situation a scratch test fixture under `os.tmpdir()` runs in):
 * both `vaultRoot`/`absolutePath` and their resolved counterparts shift
 * together in that case, so the relative paths still agree and the note is
 * correctly kept. Any *other* divergence means a symlink redirected
 * somewhere along the way — inside the vault (an alias for an excluded
 * folder, invisible to the exclusion floor by name) or entirely outside it
 * — and the candidate must be dropped either way. Pure — no filesystem
 * access — so it is directly testable with plain path strings.
 */
export function isWithinVaultBoundary(
  vaultRoot: string,
  resolvedVaultRoot: string,
  absolutePath: string,
  resolvedPath: string,
): boolean {
  const naiveRelative = path.relative(vaultRoot, absolutePath);
  const resolvedRelative = path.relative(resolvedVaultRoot, resolvedPath);
  return naiveRelative === resolvedRelative;
}

/**
 * Reads each directory in the vault one level at a time and decides per
 * entry what to descend into — never `readdir(..., { recursive: true })`,
 * whose traversal of a symlinked directory is undocumented and, as
 * verified directly, differs between the sync and the promise-based APIs on
 * the same Node version. With the recursion written out here, the decision
 * is code this module owns, not a library behaviour this module happens to
 * currently benefit from.
 *
 * A symlinked directory is never descended — its real children would
 * surface under the alias's name, which the exclusion floor cannot see. A
 * symlinked *file* is not excluded here; it is collected as a candidate
 * like any other and left to `isWithinVaultBoundary` in `listVaultNotes`
 * below to resolve and judge — its own realpath can never equal its naive
 * path, so that check alone is sufficient for it.
 */
export async function collectCandidatePaths(dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      const target = await stat(absolutePath).catch(() => null);
      if (target?.isFile() && entry.name.endsWith(".md")) {
        results.push(absolutePath);
      }
      continue;
    }

    if (entry.isDirectory()) {
      await collectCandidatePaths(absolutePath, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(absolutePath);
    }
  }
}

/**
 * Walks the vault for `.md` files and returns vault-relative POSIX paths,
 * sorted. Deliberately thin: all selection logic lives in `resolveSelection`
 * above, which this just feeds.
 */
export async function listVaultNotes(vaultRoot: string): Promise<readonly string[]> {
  const resolvedRoot = await realpath(vaultRoot);
  const candidates: string[] = [];
  await collectCandidatePaths(vaultRoot, candidates);

  const notes: string[] = [];
  for (const absolutePath of candidates) {
    const resolvedPath = await realpath(absolutePath);
    if (!isWithinVaultBoundary(vaultRoot, resolvedRoot, absolutePath, resolvedPath)) {
      continue;
    }
    notes.push(path.relative(vaultRoot, absolutePath).split(path.sep).join("/"));
  }

  return notes.sort();
}
