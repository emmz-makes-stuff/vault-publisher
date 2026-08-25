import { loadConfig } from "./config.ts";

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (configPath === undefined) {
    process.stderr.write("usage: vault-publisher <config-path>\n");
    process.exitCode = 1;
    return;
  }

  try {
    await loadConfig(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

await main();
