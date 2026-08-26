import path from "node:path";
import type { PublishConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { isEntryWithheldByFloor, listVaultNotes, resolveSelection } from "./selection.ts";
import { reportWarnings, WarningCollector } from "./warnings.ts";

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

  const collector = new WarningCollector();
  collectSelectionWarnings(config, unmatched, path.basename(configPath), collector);
  reportWarnings(collector.all());
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

await main();
