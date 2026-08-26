import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PublishConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { buildNavigationTree } from "./navigation.ts";
import { renderPage } from "./page.ts";
import { renderNoteToHast } from "./pipeline.ts";
import { isEntryWithheldByFloor, listVaultNotes, resolveSelection } from "./selection.ts";
import { reportWarnings, WarningCollector } from "./warnings.ts";
import { buildNoteIndex, VAULT_ROOT_INDEX_NOTE } from "./wikilinks.ts";
import { writeSite, type RenderedPage } from "./writer.ts";

/**
 * `argv` defaults to `process.argv` for the real CLI and is only ever
 * overridden in tests, so `publishSite`'s failure path can be exercised
 * in-process — a real `Index.md`/`index.md` output-path collision can't be
 * reproduced with two actual vault files on a case-insensitive filesystem,
 * which is what every other machine this repo runs on happens to be.
 */
export async function main(argv: readonly string[] = process.argv): Promise<void> {
  const configPath = argv[2];
  const outputDir = argv[3];
  if (configPath === undefined) {
    process.stderr.write("usage: vault-publisher <config-path> [output-dir]\n");
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

  const vaultRoot = path.dirname(configPath);
  const vaultPaths = await listVaultNotes(vaultRoot);
  const { published, unmatched } = resolveSelection(config, vaultPaths);

  const collector = new WarningCollector();
  collectSelectionWarnings(config, unmatched, path.basename(configPath), collector);
  if (!published.includes(VAULT_ROOT_INDEX_NOTE)) {
    collector.push(
      VAULT_ROOT_INDEX_NOTE,
      'is not in the published set; the site has no front page and "/" will serve nothing',
    );
  }

  // `output-dir` is a stopgap positional argument, not the CLI surface —
  // `6.3` owns `util.parseArgs`, flags, and `--help`. Its only job here is
  // to stop `published` from being computed and thrown away: every existing
  // caller of this entry point passes two arguments and sees unchanged
  // behaviour, since site generation is skipped entirely when a third is
  // absent.
  if (outputDir !== undefined) {
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

  await writeSite(outputDir, pages);
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

// Runs only when this file is the process entry point — `node src/index.ts
// …`, exactly what every existing spawnSync-based test already does — and
// not merely when a test imports `main` for in-process invocation.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
