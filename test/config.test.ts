import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/config", import.meta.url));

function fixture(name: string): string {
  return path.join(fixturesDir, name);
}

describe("loadConfig", () => {
  it("loads a valid config with folders and notes", async () => {
    const config = await loadConfig(fixture("valid.yaml"));

    expect(config.folders).toStrictEqual(["Handbook", "Meetings/2026"]);
    expect(config.notes).toStrictEqual(["Index.md", "Reference/Glossary.md"]);
  });

  it("treats an empty config as selecting nothing", async () => {
    const config = await loadConfig(fixture("empty.yaml"));

    expect(config.folders).toStrictEqual([]);
    expect(config.notes).toStrictEqual([]);
  });

  it("strips a single trailing slash from a folder entry", async () => {
    const config = await loadConfig(fixture("trailing-slash.yaml"));

    expect(config.folders).toStrictEqual(["Journal"]);
  });

  it("deduplicates repeated entries", async () => {
    const config = await loadConfig(fixture("duplicates.yaml"));

    expect(config.folders).toStrictEqual(["Handbook"]);
  });

  it("rejects an unknown top-level key, naming it", async () => {
    await expect(loadConfig(fixture("unknown-key.yaml"))).rejects.toThrow(
      /unknown configuration key "sections"/,
    );
  });

  it("rejects a scalar where a sequence is required", async () => {
    await expect(loadConfig(fixture("wrong-type.yaml"))).rejects.toThrow(
      /configuration key "folders".*must be a sequence/,
    );
  });

  it("rejects a non-string entry in a list", async () => {
    await expect(loadConfig(fixture("non-string-entry.yaml"))).rejects.toThrow(
      /must contain only strings/,
    );
  });

  it("rejects an absolute path entry", async () => {
    await expect(loadConfig(fixture("absolute-path.yaml"))).rejects.toThrow(
      /contains an absolute path/,
    );
  });

  it("rejects a path with a '..' segment", async () => {
    await expect(loadConfig(fixture("dot-dot-path.yaml"))).rejects.toThrow(
      /contains a "\." or "\.\." segment/,
    );
  });

  it("rejects a notes entry that does not end in .md", async () => {
    await expect(loadConfig(fixture("note-missing-md.yaml"))).rejects.toThrow(/must end in "\.md"/);
  });

  it("rejects a folders entry that ends in .md", async () => {
    await expect(loadConfig(fixture("folder-with-md.yaml"))).rejects.toThrow(
      /must not end in "\.md"/,
    );
  });

  it("fails closed on malformed YAML", async () => {
    await expect(loadConfig(fixture("malformed.yaml"))).rejects.toThrow(ConfigError);
  });

  it("fails closed when the config file cannot be read", async () => {
    // A directory is not readable as a file — this stands in for a permissions
    // failure without depending on filesystem-specific chmod semantics.
    await expect(loadConfig(fixturesDir)).rejects.toThrow(ConfigError);
  });
});
