import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  const contents = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(contents) as Record<string, unknown>;
}

describe("project scaffold", () => {
  it("pins engines.node to the major version recorded in .nvmrc", async () => {
    const pkg = await readJson("package.json");
    const nvmrc = (await readFile(path.join(repoRoot, ".nvmrc"), "utf8")).trim();
    const engines = pkg.engines as Record<string, string>;

    const nextMajor = String(Number(nvmrc) + 1);
    expect(engines.node).toBe(`>=${nvmrc} <${nextMajor}`);
  });

  it("declares exactly the seven design-mandated runtime dependencies", async () => {
    const pkg = await readJson("package.json");
    const dependencyNames = Object.keys(pkg.dependencies as Record<string, string>).sort();

    expect(dependencyNames).toStrictEqual(
      [
        "rehype-stringify",
        "remark-frontmatter",
        "remark-gfm",
        "remark-parse",
        "remark-rehype",
        "unified",
        "yaml",
      ].sort(),
    );
  });

  it("declares the package as an ES module", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.type).toBe("module");
  });
});
