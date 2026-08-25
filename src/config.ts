import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export interface PublishConfig {
  readonly folders: readonly string[];
  readonly notes: readonly string[];
}

/**
 * Thrown for any config problem — unreadable file, invalid YAML, or a shape
 * that does not match the schema. Never thrown partway through producing a
 * usable config: callers get a fully validated `PublishConfig` or nothing.
 */
export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
  }
}

const ALLOWED_KEYS = new Set(["folders", "notes"]);

export async function loadConfig(configPath: string): Promise<PublishConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (cause) {
    throw new ConfigError(`cannot read configuration file: ${configPath}`, { cause });
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (cause) {
    throw new ConfigError(`cannot parse configuration file as YAML: ${configPath}`, { cause });
  }

  return validateConfig(parsed, configPath);
}

function validateConfig(parsed: unknown, configPath: string): PublishConfig {
  if (parsed === null || parsed === undefined) {
    return { folders: [], notes: [] };
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(`configuration must be a mapping: ${configPath}`);
  }

  const record = parsed as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConfigError(`unknown configuration key "${key}" in ${configPath}`);
    }
  }

  return {
    folders: validateList(record["folders"], "folders", configPath, "folder"),
    notes: validateList(record["notes"], "notes", configPath, "note"),
  };
}

function validateList(
  value: unknown,
  key: string,
  configPath: string,
  kind: "folder" | "note",
): readonly string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ConfigError(`configuration key "${key}" in ${configPath} must be a sequence`);
  }

  const entries = value.map((entry) => validateEntry(entry, key, configPath, kind));
  return [...new Set(entries)];
}

function validateEntry(
  entry: unknown,
  key: string,
  configPath: string,
  kind: "folder" | "note",
): string {
  if (typeof entry !== "string") {
    throw new ConfigError(`configuration key "${key}" in ${configPath} must contain only strings`);
  }

  let normalized = entry;
  if (kind === "folder" && normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  if (normalized === "") {
    throw new ConfigError(`configuration key "${key}" in ${configPath} contains an empty path`);
  }

  if (normalized.startsWith("/")) {
    throw new ConfigError(
      `configuration key "${key}" in ${configPath} contains an absolute path: "${entry}"`,
    );
  }

  if (normalized.includes("\\")) {
    throw new ConfigError(
      `configuration key "${key}" in ${configPath} contains a backslash: "${entry}"`,
    );
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new ConfigError(
      `configuration key "${key}" in ${configPath} contains a "." or ".." segment: "${entry}"`,
    );
  }

  if (kind === "note" && !normalized.endsWith(".md")) {
    throw new ConfigError(
      `configuration key "${key}" in ${configPath} must end in ".md": "${entry}"`,
    );
  }

  if (kind === "folder" && normalized.endsWith(".md")) {
    throw new ConfigError(
      `configuration key "${key}" in ${configPath} must not end in ".md": "${entry}"`,
    );
  }

  return normalized;
}
