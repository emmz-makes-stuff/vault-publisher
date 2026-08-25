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
  for (const entry of unmatched) {
    process.stderr.write(`[WARNING] ${configName}: no path in the vault matches "${entry}"\n`);
  }

  const unmatchedSet = new Set(unmatched);

  for (const entry of config.folders) {
    if (!unmatchedSet.has(entry) && isEntryWithheldByFloor(entry, "folder")) {
      process.stderr.write(
        `[WARNING] ${configName}: "${entry}/" is excluded and will not publish\n`,
      );
    }
  }

  for (const entry of config.notes) {
    if (!unmatchedSet.has(entry) && isEntryWithheldByFloor(entry, "note")) {
      process.stderr.write(
        `[WARNING] ${configName}: "${entry}" is excluded and will not publish\n`,
      );
    }
  }
}

await main();
