import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { STYLESHEET } from "./styles.ts";
import { outputPathForNote } from "./wikilinks.ts";

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
 */
export async function writeSite(outputDir: string, pages: readonly RenderedPage[]): Promise<void> {
  assertNoOutputPathCollisions(pages);
  await mkdir(outputDir, { recursive: true });
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
 * broken it yet.
 */
export function resolveOutputFilePath(outputDir: string, notePath: string): string {
  const filePath = path.join(outputDir, outputPathForNote(notePath));
  const relativeToOutputDir = path.relative(outputDir, filePath);
  if (relativeToOutputDir.startsWith("..") || path.isAbsolute(relativeToOutputDir)) {
    throw new Error(`refusing to write outside the output directory for note: ${notePath}`);
  }
  return filePath;
}
