import { mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isPathWithinOrEqual } from "./selection.ts";
import { STYLESHEET } from "./styles.ts";
import { outputPathForNote } from "./wikilinks.ts";

/**
 * Written at the output directory's root on every successful publish, and
 * checked before a later run is allowed to clear that directory's existing
 * contents (`ensureOutputDirectoryReadyForPublish` below). Holds no
 * vault-derived content — it exists purely as evidence that this tool, not
 * something else, put what's in the directory there.
 */
export const OUTPUT_MARKER_FILENAME = ".vault-publisher-output";

export interface RenderedPage {
  readonly notePath: string;
  readonly html: string;
}

/**
 * Thrown when two or more published notes would write to the same output
 * path — a silent overwrite of one note's page by another's, which on a
 * confidential site means one URL serves the wrong note's content. Matches
 * `ConfigError`'s posture: a selection that cannot be written to distinct
 * files is malformed in the same sense a bad config is, so it fails loudly
 * rather than publishing a guess about which note "wins".
 */
export class OutputPathCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputPathCollisionError";
  }
}

/**
 * Thrown when `--output` names the vault root or a directory inside it.
 * `writeSite` clears and rewrites the output directory's contents on
 * reuse — pointing that at the vault itself would delete or overwrite
 * confidential source material, not a published copy of it. Checked
 * unconditionally, before anything else in `writeSite` touches the
 * filesystem, and regardless of what `OUTPUT_MARKER_FILENAME` says.
 */
export class OutputDirectoryWithinVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputDirectoryWithinVaultError";
  }
}

/**
 * Thrown when `--output` names a directory that already has content but no
 * `OUTPUT_MARKER_FILENAME` from a prior vault-publisher run. A tool that
 * empties directories must refuse to empty one it has no evidence it
 * created — this is the difference between clearing a stale publish and
 * destroying someone's home directory. Nothing is deleted before this
 * throws.
 */
export class UnrecognisedOutputDirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrecognisedOutputDirectoryError";
  }
}

/**
 * Checks the whole set of pages for output-path collisions before anything
 * is written, so a run either writes a complete site or writes nothing —
 * never a half-written output directory that a later `wrangler deploy`
 * could upload. Reports every colliding output path, not just the first,
 * naming both (or all) note paths that share it.
 *
 * Only exact-name collisions are caught — `outputPathForNote` preserves
 * source casing everywhere except the `Index.md` special case, so two notes
 * differing only in case (`Notes.md` beside `notes.md`) produce distinct
 * output paths here and are not detected. They cannot coexist in a vault
 * checked out on a case-insensitive filesystem, but CI and Cloudflare's
 * asset store are both case-sensitive — a known adjacent hazard, not one
 * this check covers.
 */
export function assertNoOutputPathCollisions(pages: readonly RenderedPage[]): void {
  const notePathsByOutputPath = new Map<string, string[]>();
  for (const page of pages) {
    const outputPath = outputPathForNote(page.notePath);
    const notePaths = notePathsByOutputPath.get(outputPath);
    if (notePaths) {
      notePaths.push(page.notePath);
    } else {
      notePathsByOutputPath.set(outputPath, [page.notePath]);
    }
  }

  const collisions = [...notePathsByOutputPath.entries()].filter(
    ([, notePaths]) => notePaths.length > 1,
  );
  if (collisions.length === 0) {
    return;
  }

  const message = collisions
    .map(
      ([outputPath, notePaths]) =>
        `notes "${notePaths.join('" and "')}" all resolve to output path "${outputPath}"`,
    )
    .join("; ");
  throw new OutputPathCollisionError(`output path collision: ${message}`);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Real-path for a location that may not exist yet, resolving the whole
 * chain rather than only asking whether the leaf itself exists. `realpath`
 * follows every symlink on the way, which is what a containment check needs
 * (a symlink whose *target* sits on the other side of a boundary must not
 * evade the check by comparing the alias's own path instead), but `--output`
 * is legitimately allowed to name a directory — or a chain of directories —
 * that hasn't been created on this run yet, and `realpath` on a path that
 * doesn't exist throws `ENOENT`. Resolving only the leaf and falling back to
 * a bare `path.resolve` on `ENOENT` (an earlier version of this function)
 * leaves every *ancestor* unresolved: a symlinked parent several levels up
 * a not-yet-created `--output` path would never be dereferenced, so a
 * `--output` reached through an aliased ancestor could still land inside
 * the vault undetected. Instead this walks up to the nearest ancestor that
 * does exist, `realpath`s that ancestor (following every symlink on the way,
 * including one on the vault root itself), and rejoins the non-existent
 * remainder onto the resolved result — so the whole chain is dereferenced,
 * only the trailing not-yet-created segments are ever compared as plain
 * strings.
 */
export async function resolveRealOrNaivePath(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const resolvedTarget = path.resolve(target);
  const parent = path.dirname(resolvedTarget);
  if (parent === resolvedTarget) {
    // Reached the filesystem root without finding an existing ancestor —
    // nothing left to resolve, so `path.resolve`'s own idempotent answer is
    // the naive fallback for the whole (nonexistent) chain.
    return resolvedTarget;
  }

  const resolvedParent = await resolveRealOrNaivePath(parent);
  return path.join(resolvedParent, path.basename(resolvedTarget));
}

/**
 * Refuses an `outputDir` that is the vault root or sits inside it, whatever
 * the output directory's own contents or `OUTPUT_MARKER_FILENAME` say. Both
 * paths are resolved through `resolveRealOrNaivePath` first — plain
 * `path.resolve` alone compares path strings, not locations, so a `--output`
 * that is a symlink pointing back inside the vault would pass while
 * `ensureOutputDirectoryReadyForPublish`'s `readdir`/`rm` follow the symlink
 * to the real, in-vault target regardless. This is the write-side mirror of
 * the read-side resolution `isWithinVaultBoundary` (`selection.ts`) already
 * does for candidates that exist on disk.
 */
async function assertOutputDirectoryOutsideVault(
  vaultRoot: string,
  outputDir: string,
): Promise<void> {
  const resolvedVaultRoot = await resolveRealOrNaivePath(vaultRoot);
  const resolvedOutputDir = await resolveRealOrNaivePath(outputDir);
  if (isPathWithinOrEqual(resolvedVaultRoot, resolvedOutputDir)) {
    throw new OutputDirectoryWithinVaultError(
      `refusing to publish: output directory "${outputDir}" is the vault root or a directory ` +
        `inside it ("${vaultRoot}"); point --output somewhere outside the vault`,
    );
  }
}

/**
 * Decides what a reused `outputDir` gets before `writeSite` writes a single
 * file: absent or empty, nothing to do — `mkdir` below creates it fresh.
 * Non-empty with `OUTPUT_MARKER_FILENAME` present, clear every entry so the
 * directory ends up holding exactly this run's output and nothing an
 * earlier, differently-configured run left behind (see
 * `OutputDirectoryWithinVaultError`'s sibling case above for the boundary
 * this leans on). Non-empty with no marker, throw
 * `UnrecognisedOutputDirectoryError` and delete nothing — this function's
 * only write is the clearing branch, and that branch is only reached once
 * the marker has been seen.
 */
async function ensureOutputDirectoryReadyForPublish(outputDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(outputDir);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (entries.length === 0) {
    return;
  }

  if (!entries.includes(OUTPUT_MARKER_FILENAME)) {
    throw new UnrecognisedOutputDirectoryError(
      `refusing to publish: output directory "${outputDir}" is not empty and has no ` +
        `${OUTPUT_MARKER_FILENAME} marker from a previous vault-publisher run; point --output ` +
        "at an empty or new directory, or one this tool already published to",
    );
  }

  await Promise.all(
    entries.map((entry) => rm(path.join(outputDir, entry), { recursive: true, force: true })),
  );
}

/**
 * Writes every rendered page to disk under `outputDir`, deriving each
 * file's location from `outputPathForNote` — the same function
 * `notePathToHref` builds every link from — never a second, independent
 * path computation. If the writer computed paths its own way, a link and
 * the file it points at could drift apart and 404 behind authentication
 * with every test still green, since a test asserting only what the writer
 * wrote would never see the href side of that split. Creates each page's
 * parent directory as needed; writes plain UTF-8 HTML, nothing else.
 *
 * Collisions are checked across the whole set before the first `writeFile`
 * — see `assertNoOutputPathCollisions` — so a run never leaves a partial
 * output directory behind. Also writes the site's one stylesheet
 * (`styles.css`, `styles.ts`) to the output root — every page links it
 * root-absolute (`page.ts`), and a missing file here is what turns every
 * page's link into a 404 while every other test stays green.
 *
 * Makes the output directory's contents match exactly what this run
 * produces: `assertOutputDirectoryOutsideVault` refuses a directory that
 * could be the vault itself, then `ensureOutputDirectoryReadyForPublish`
 * clears a reused, marker-bearing directory (or refuses one it cannot
 * prove it created) before anything is written, and `OUTPUT_MARKER_FILENAME`
 * is (re)written alongside the pages so a later run can recognise this one.
 * Without the clearing, a note dropped from the config on a later run would
 * keep serving its page and its full body from a stale file this run never
 * touched — a confidentiality failure, not a tidiness one.
 */
export async function writeSite(
  outputDir: string,
  vaultRoot: string,
  pages: readonly RenderedPage[],
): Promise<void> {
  assertNoOutputPathCollisions(pages);
  await assertOutputDirectoryOutsideVault(vaultRoot, outputDir);
  await ensureOutputDirectoryReadyForPublish(outputDir);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, OUTPUT_MARKER_FILENAME), "", "utf8");
  await writeFile(path.join(outputDir, "styles.css"), STYLESHEET, "utf8");
  for (const page of pages) {
    const filePath = resolveOutputFilePath(outputDir, page.notePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, page.html, "utf8");
  }
}

/**
 * The absolute file path one note's page writes to, and the boundary check
 * that keeps it inside `outputDir`. `outputPathForNote` never itself
 * produces a `..` segment for any path `resolveSelection` could hand it —
 * `config.ts` rejects `.`/`..` config entries and `listVaultNotes` only ever
 * walks real filesystem entries below the vault root — but the check is
 * asserted here rather than assumed, the same posture `isWithinVaultBoundary`
 * (`selection.ts`) takes on the read side: a boundary this load-bearing is
 * verified at the point it matters, not left to hold because nothing has
 * broken it yet. Uses `isPathWithinOrEqual` — the same containment
 * primitive `assertOutputDirectoryOutsideVault` checks the output
 * directory itself against the vault with — rather than a second,
 * independent `..`/`isAbsolute` check.
 */
export function resolveOutputFilePath(outputDir: string, notePath: string): string {
  const filePath = path.join(outputDir, outputPathForNote(notePath));
  if (!isPathWithinOrEqual(outputDir, filePath)) {
    throw new Error(`refusing to write outside the output directory for note: ${notePath}`);
  }
  return filePath;
}
