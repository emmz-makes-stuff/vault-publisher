import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hrefToOutputPath } from "../src/wikilinks.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPoint = path.join(repoRoot, "src", "index.ts");
const integrationVaultConfigPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "integration-vault",
  "publish.config.yaml",
);

/**
 * Every path under `dir`, recursive, as an absolute file path — walked by
 * hand rather than `readdir`'s `recursive: true` option: the sync and
 * async forms of Node's recursive readdir disagree on whether they
 * descend a symlinked directory, and a security-relevant scan has no
 * business resting on which one happened to be in scope.
 */
async function allFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await allFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

const SCRIPT_TAG = /<script\b/i;
const JAVASCRIPT_URL = /javascript:/i;
const INLINE_EVENT_HANDLER = /\son[a-z]+\s*=\s*["']/i;

/**
 * The violations `content` would trip, by name — empty when clean. Shared
 * by the whole-output scan below and by the synthetic-injection test that
 * proves this function can actually fail rather than vacuously passing
 * over content it never really inspects.
 */
function scanForClientJs(content: string): string[] {
  const violations: string[] = [];
  if (SCRIPT_TAG.test(content)) {
    violations.push("<script> tag");
  }
  if (JAVASCRIPT_URL.test(content)) {
    violations.push("javascript: URL");
  }
  if (INLINE_EVENT_HANDLER.test(content)) {
    violations.push("inline event handler attribute");
  }
  return violations;
}

describe("scanForClientJs — proves the scan can actually fail", () => {
  it("flags a script tag, a javascript: URL and an inline handler in synthetic content", () => {
    expect(scanForClientJs("<p>hello</p><script>alert(1)</script>")).toContain("<script> tag");
    expect(scanForClientJs('<a href="javascript:alert(1)">go</a>')).toContain("javascript: URL");
    expect(scanForClientJs('<button onclick="alert(1)">go</button>')).toContain(
      "inline event handler attribute",
    );
  });

  it("finds nothing wrong with a page that has none of these", () => {
    expect(scanForClientJs("<p>Hello &amp; welcome</p><table></table>")).toStrictEqual([]);
  });
});

/**
 * 5.6 — "verify no client-side JavaScript is emitted anywhere in the
 * output" reads the *whole rendered output*: every page and the
 * stylesheet, produced by an actual CLI run against a fixture vault, not
 * a check against source. The integration vault already exercises
 * wikilinks, callouts, tables, task lists and a dropped Bases block, so a
 * clean scan here covers everything §4 and block B render.
 */
describe("whole rendered output — 5.6 zero client-side JavaScript anywhere", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-no-js-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("contains no <script> tag, javascript: URL, or inline event handler in any emitted file", async () => {
    const result = spawnSync(
      process.execPath,
      [
        entryPoint,
        "--vault",
        path.dirname(integrationVaultConfigPath),
        "--config",
        integrationVaultConfigPath,
        "--output",
        outputDir,
      ],
      {
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);

    const files = await allFiles(outputDir);
    expect(files.length).toBeGreaterThan(1);

    const violationsByFile: Record<string, string[]> = {};
    for (const file of files) {
      const content = await readFile(file, "utf8");
      const violations = scanForClientJs(content);
      if (violations.length > 0) {
        violationsByFile[path.relative(outputDir, file)] = violations;
      }
    }

    expect(violationsByFile).toStrictEqual({});
  });
});

const ROOT_ABSOLUTE_HREF = /href="(\/[^"]*)"/g;

/**
 * Every root-absolute `href` attribute value in `html`, verbatim — still
 * percent-encoded, exactly as written to the page.
 */
function internalHrefsIn(html: string): string[] {
  return [...html.matchAll(ROOT_ABSOLUTE_HREF)]
    .map((match) => match[1])
    .filter((href): href is string => href !== undefined);
}

/**
 * §5's headline guarantee — every href resolves to a file the run actually
 * emitted — closed by construction (the writer and `notePathToHref` share
 * `outputPathForNote`) and never by observation until now: the round-trip
 * test in `wikilinks.test.ts` proves the two path functions agree with each
 * other, and `writer.test.ts` proves the writer calls the shared function,
 * but nothing walks a rendered site and checks a page's own links against
 * what was actually written to disk. Reuses this file's CLI-run-and-walk
 * pattern rather than a second one.
 */
describe("whole rendered output — every internal href resolves to an emitted file", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-link-integrity-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("has no page whose href names a file the run did not write", async () => {
    const result = spawnSync(
      process.execPath,
      [
        entryPoint,
        "--vault",
        path.dirname(integrationVaultConfigPath),
        "--config",
        integrationVaultConfigPath,
        "--output",
        outputDir,
      ],
      {
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);

    const files = await allFiles(outputDir);
    const emittedPaths = new Set(
      files.map((file) => path.relative(outputDir, file).split(path.sep).join("/")),
    );

    const htmlFiles = files.filter((file) => file.endsWith(".html"));
    expect(htmlFiles.length).toBeGreaterThan(1);

    const brokenLinksByFile: Record<string, string[]> = {};
    for (const file of htmlFiles) {
      const content = await readFile(file, "utf8");
      const broken = internalHrefsIn(content).filter(
        (href) => !emittedPaths.has(hrefToOutputPath(href)),
      );
      if (broken.length > 0) {
        brokenLinksByFile[path.relative(outputDir, file)] = broken;
      }
    }

    expect(brokenLinksByFile).toStrictEqual({});
  });
});
