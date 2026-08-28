import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { PublishConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { buildNavigationTree } from "./navigation.ts";
import { renderGeneratedFrontPage, renderPage } from "./page.ts";
import { renderNoteToHast } from "./pipeline.ts";
import {
  isEntryWithheldByFloor,
  listVaultNotes,
  pathContainsFloorFolderSegment,
  resolveSelection,
  VaultRootWithheldByFloorError,
} from "./selection.ts";
import { reportWarnings, WarningCollector } from "./warnings.ts";
import { buildNoteIndex, findVaultRootIndexNote } from "./wikilinks.ts";
import { resolveRealOrNaivePath, writeSite, type RenderedPage } from "./writer.ts";

const USAGE =
  "usage: vault-publisher --vault <path> --config <path> --output <path>\n" +
  "       vault-publisher --help\n";

interface ParsedArgs {
  readonly vault: string;
  readonly config: string;
  readonly output: string;
}

/**
 * Parses argv into the three required paths, or returns `undefined` after
 * having already handled the outcome itself (printed usage and set the exit
 * code for a bad flag or a missing required option, or printed help and
 * exited 0 for `--help`) — the caller only has real work left to do when
 * this returns a value.
 */
function parseCliArgs(argv: readonly string[]): ParsedArgs | undefined {
  let values: {
    vault?: string;
    config?: string;
    output?: string;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv.slice(2),
      options: {
        vault: { type: "string" },
        config: { type: "string" },
        output: { type: "string" },
        help: { type: "boolean" },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n${USAGE}`);
    process.exitCode = 1;
    return undefined;
  }

  if (values.help === true) {
    process.stdout.write(USAGE);
    return undefined;
  }

  if (values.vault === undefined || values.config === undefined || values.output === undefined) {
    const missing: string[] = [];
    if (values.vault === undefined) missing.push("--vault");
    if (values.config === undefined) missing.push("--config");
    if (values.output === undefined) missing.push("--output");
    process.stderr.write(`missing required argument(s): ${missing.join(", ")}\n${USAGE}`);
    process.exitCode = 1;
    return undefined;
  }

  return { vault: values.vault, config: values.config, output: values.output };
}

/**
 * Refuses a `--vault` whose own resolved path has a floor-folder segment
 * (`--vault <vault>/Private`, `--vault <vault>/Journal/2026`) — the
 * exclusion floor matches path segments relative to the vault root, so
 * re-rooting past a floor folder would reclassify everything it withholds
 * as ordinary top-level notes a config could name, defeating `isExcluded`
 * without touching the config at all. Resolved with `resolveRealOrNaivePath`
 * — the same nearest-existing-ancestor/`realpath` helper
 * `assertOutputDirectoryOutsideVault` uses — so a symlinked alias cannot
 * walk around this by name. Checked unconditionally, before the config is
 * even loaded: this is a refusal, not a degraded publish.
 */
async function assertVaultRootOutsideFloor(vaultRoot: string): Promise<void> {
  const resolvedVaultRoot = await resolveRealOrNaivePath(vaultRoot);
  if (pathContainsFloorFolderSegment(resolvedVaultRoot)) {
    throw new VaultRootWithheldByFloorError(
      `refusing to publish: --vault "${vaultRoot}" resolves inside a directory the exclusion ` +
        "floor withholds; point --vault at the vault's own root, not a path beneath one of its " +
        "excluded folders",
    );
  }
}

/**
 * `argv` defaults to `process.argv` for the real CLI and is only ever
 * overridden in tests, so `publishSite`'s failure path can be exercised
 * in-process — a real `Index.md`/`index.md` output-path collision can't be
 * reproduced with two actual vault files on a case-insensitive filesystem,
 * which is what every other machine this repo runs on happens to be.
 */
export async function main(argv: readonly string[] = process.argv): Promise<void> {
  const args = parseCliArgs(argv);
  if (args === undefined) {
    return;
  }
  const { vault: vaultRoot, config: configPath, output: outputDir } = args;

  try {
    await assertVaultRootOutsideFloor(vaultRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  let config: PublishConfig;
  try {
    config = await loadConfig(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  const vaultPaths = await listVaultNotes(vaultRoot);
  const { published, unmatched } = resolveSelection(config, vaultPaths);

  const collector = new WarningCollector();
  collectSelectionWarnings(config, unmatched, path.basename(configPath), collector);
  // No warning when the root index note is absent from the published set:
  // per the `site-navigation` amendment, the site root always serves a page
  // either way — the generated front page below when there is no published
  // root index note, that note's own rendered page when there is. A vault
  // may simply have no root index note at all (an ordinary, unremarkable
  // shape), and the vault's own owner may deliberately keep a personal
  // landing page out of the published set — neither is a degraded publish
  // needing the Product Owner's attention the way an unresolved wikilink or
  // a dropped Bases block is, so this no longer earns a `[WARNING]` line.

  try {
    await publishSite(vaultRoot, published, outputDir, collector);
  } catch (error) {
    // Same convention `loadConfig`'s catch above uses: a clean message on
    // stderr and a non-zero exit code, never an unhandled rejection with a
    // Node stack trace. `reportWarnings` still runs here — a run that dies
    // partway through must not silently discard what it already found,
    // since warnings are the Product Owner's only visibility into a
    // degraded publish.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    reportWarnings(collector.all());
    return;
  }

  reportWarnings(collector.all());
}

interface LoadedNote {
  readonly notePath: string;
  readonly markdown: string;
  readonly frontmatter: Record<string, unknown>;
}

async function loadNotes(
  vaultRoot: string,
  published: readonly string[],
  collector: WarningCollector,
): Promise<readonly LoadedNote[]> {
  const notes: LoadedNote[] = [];
  for (const notePath of published) {
    const markdown = await readFile(path.join(vaultRoot, notePath), "utf8");
    const frontmatter = parseFrontmatter(markdown, notePath, collector);
    notes.push({ notePath, markdown, frontmatter });
  }
  return notes;
}

/**
 * Renders and writes every published note's page — the composition
 * `buildNavigationTree`, `renderNoteToHast`, `renderPage` and `writeSite`
 * exist for. Each note is read once; its frontmatter feeds both the
 * navigation tree's labels (built before any page renders, so every page's
 * explorer is identical regardless of render order) and its own page's
 * frontmatter table.
 *
 * `findVaultRootIndexNote(published)` decides, from the published set
 * alone, whether the vault root's own index note is one of the pages
 * already being rendered above. When it is not, `renderGeneratedFrontPage`
 * builds a fallback from `navigation` — never from any note's content, so a
 * root index note that exists in the vault but was left out of `published`
 * cannot leak through it — and `writeSite` lands it at `index.html`, so the
 * site root always serves something.
 */
async function publishSite(
  vaultRoot: string,
  published: readonly string[],
  outputDir: string,
  collector: WarningCollector,
): Promise<void> {
  const notes = await loadNotes(vaultRoot, published, collector);
  const noteIndex = buildNoteIndex(published);

  const titleByNotePath = new Map<string, string>();
  for (const note of notes) {
    const title = note.frontmatter["title"];
    if (typeof title === "string") {
      titleByNotePath.set(note.notePath, title);
    }
  }

  const navigation = buildNavigationTree(published, titleByNotePath);

  const pages: RenderedPage[] = [];
  for (const note of notes) {
    const noteHast = await renderNoteToHast(
      note.markdown,
      { noteId: note.notePath, noteIndex, collector },
      note.frontmatter,
    );
    pages.push({
      notePath: note.notePath,
      html: renderPage({
        notePath: note.notePath,
        titleByNotePath,
        navigation,
        noteContent: noteHast.children,
      }),
    });
  }

  const generatedFrontPageHtml =
    findVaultRootIndexNote(published) === undefined
      ? renderGeneratedFrontPage(navigation)
      : undefined;

  await writeSite(outputDir, vaultRoot, pages, generatedFrontPageHtml);
}

/**
 * Populates `collector` with the unmatched-entry and floor-withheld
 * warnings for one config load. Pure with respect to output — nothing here
 * writes anywhere; `reportWarnings` in `warnings.ts` is the only writer.
 */
function collectSelectionWarnings(
  config: PublishConfig,
  unmatched: readonly string[],
  configName: string,
  collector: WarningCollector,
): void {
  // The floor check runs before the unmatched guard: an excluded entry is
  // reported as excluded whether or not it currently exists in the vault.
  // An absent excluded folder (e.g. `folders: ["Private"]` with no
  // `Private/` on disk) would otherwise fall into `unmatched` and read as
  // "create it and this will work" — which it never will, since the floor
  // withholds it unconditionally.
  const floorWithheldFolders = new Set(
    config.folders.filter((entry) => isEntryWithheldByFloor(entry, "folder")),
  );
  const floorWithheldNotes = new Set(
    config.notes.filter((entry) => isEntryWithheldByFloor(entry, "note")),
  );

  for (const entry of config.folders) {
    if (floorWithheldFolders.has(entry)) {
      collector.push(configName, `"${entry}/" is excluded and will not publish`);
    }
  }

  for (const entry of config.notes) {
    if (floorWithheldNotes.has(entry)) {
      collector.push(configName, `"${entry}" is excluded and will not publish`);
    }
  }

  for (const entry of unmatched) {
    if (floorWithheldFolders.has(entry) || floorWithheldNotes.has(entry)) {
      continue;
    }
    collector.push(configName, `no path in the vault matches "${entry}"`);
  }
}
