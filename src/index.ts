import path from "node:path";
import type { PublishConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { isEntryWithheldByFloor, listVaultNotes, resolveSelection } from "./selection.ts";

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (configPath === undefined) {
    process.stderr.write("usage: vault-publisher <config-path>\n");
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
  const { unmatched } = resolveSelection(config, vaultPaths);

  reportWarnings(config, unmatched, path.basename(configPath));
}

/**
 * Warnings never fail a publish: every line here goes to stderr, and nothing
 * here touches `process.exitCode` — the process stays at its default 0.
 */
function reportWarnings(
  config: PublishConfig,
  unmatched: readonly string[],
  configName: string,
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
      process.stderr.write(
        `[WARNING] ${configName}: "${entry}/" is excluded and will not publish\n`,
      );
    }
  }

  for (const entry of config.notes) {
    if (floorWithheldNotes.has(entry)) {
      process.stderr.write(
        `[WARNING] ${configName}: "${entry}" is excluded and will not publish\n`,
      );
    }
  }

  for (const entry of unmatched) {
    if (floorWithheldFolders.has(entry) || floorWithheldNotes.has(entry)) {
      continue;
    }
    process.stderr.write(`[WARNING] ${configName}: no path in the vault matches "${entry}"\n`);
  }
}

await main();
