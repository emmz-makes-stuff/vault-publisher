import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertNoOutputPathCollisions,
  OutputPathCollisionError,
  resolveOutputFilePath,
  writeSite,
} from "../src/writer.js";
import { STYLESHEET } from "../src/styles.js";

// None of the tests below exercise the vault-boundary refusal (see
// `end-to-end-output.test.ts`) — this is just an unrelated path so
// `writeSite`'s required `vaultRoot` argument has something to check
// containment against.
const unrelatedVaultRoot = path.join(tmpdir(), "vault-publisher-writer-unrelated-vault");

describe("resolveOutputFilePath — derives from outputPathForNote, not its own path logic", () => {
  it("joins the note's outputPathForNote path onto the output directory", () => {
    expect(resolveOutputFilePath("/site", "Handbook/Onboarding.md")).toBe(
      path.join("/site", "Handbook/Onboarding.html"),
    );
  });

  it("maps the vault-root Index.md to the site's index.html, agreeing with outputPathForNote", () => {
    expect(resolveOutputFilePath("/site", "Index.md")).toBe(path.join("/site", "index.html"));
  });
});

describe("resolveOutputFilePath — stays inside the output directory", () => {
  it("refuses a note path that would resolve outside the output directory", () => {
    expect(() => resolveOutputFilePath("/site", "../../etc/evil.md")).toThrow();
  });
});

describe("assertNoOutputPathCollisions — Index.md colliding with a literal index.md", () => {
  it("throws an OutputPathCollisionError naming both note paths and the shared output path", () => {
    expect(() => {
      assertNoOutputPathCollisions([
        { notePath: "Index.md", html: "<p>Home</p>" },
        { notePath: "index.md", html: "<p>Unrelated</p>" },
      ]);
    }).toThrow(OutputPathCollisionError);

    try {
      assertNoOutputPathCollisions([
        { notePath: "Index.md", html: "<p>Home</p>" },
        { notePath: "index.md", html: "<p>Unrelated</p>" },
      ]);
      throw new Error("expected assertNoOutputPathCollisions to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OutputPathCollisionError);
      expect((error as Error).message).toContain("Index.md");
      expect((error as Error).message).toContain("index.md");
      expect((error as Error).message).toContain("index.html");
    }
  });

  it("reports every colliding output path, not just the first", () => {
    try {
      assertNoOutputPathCollisions([
        { notePath: "Index.md", html: "" },
        { notePath: "index.md", html: "" },
        { notePath: "Handbook/Notes.md", html: "" },
        { notePath: "Handbook/Notes.md", html: "" },
      ]);
      throw new Error("expected assertNoOutputPathCollisions to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("index.html");
      expect(message).toContain("Handbook/Notes.html");
    }
  });

  it("does not throw when every note maps to a distinct output path", () => {
    expect(() => {
      assertNoOutputPathCollisions([
        { notePath: "Index.md", html: "" },
        { notePath: "Handbook/Onboarding.md", html: "" },
      ]);
    }).not.toThrow();
  });
});

describe("writeSite — refuses a collision before writing anything", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-writer-collision-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("rejects with OutputPathCollisionError when Index.md and index.md are both published", async () => {
    await expect(
      writeSite(outputDir, unrelatedVaultRoot, [
        { notePath: "Index.md", html: "<p>Home</p>" },
        { notePath: "index.md", html: "<p>Unrelated</p>" },
      ]),
    ).rejects.toThrow(OutputPathCollisionError);
  });

  it("writes no file at all when a collision is present, even for the notes that don't collide", async () => {
    await expect(
      writeSite(outputDir, unrelatedVaultRoot, [
        { notePath: "Handbook/Onboarding.md", html: "<p>Hi</p>" },
        { notePath: "Index.md", html: "<p>Home</p>" },
        { notePath: "index.md", html: "<p>Unrelated</p>" },
      ]),
    ).rejects.toThrow();

    await expect(readdir(outputDir)).resolves.toStrictEqual([]);
  });
});

describe("writeSite", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-writer-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("writes each page to the path outputPathForNote names, creating parent directories", async () => {
    await writeSite(outputDir, unrelatedVaultRoot, [
      { notePath: "Handbook/Onboarding.md", html: "<p>Hi</p>" },
      { notePath: "Index.md", html: "<p>Home</p>" },
    ]);

    expect(await readFile(path.join(outputDir, "Handbook/Onboarding.html"), "utf8")).toBe(
      "<p>Hi</p>",
    );
    expect(await readFile(path.join(outputDir, "index.html"), "utf8")).toBe("<p>Home</p>");
  });

  it("refuses to write a page whose note path would escape the output directory", async () => {
    await expect(
      writeSite(outputDir, unrelatedVaultRoot, [{ notePath: "../escape.md", html: "<p>Nope</p>" }]),
    ).rejects.toThrow();
  });
});

describe("writeSite — 5.6 the stylesheet actually lands in the output directory", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-writer-styles-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("writes styles.css at the output root, matching STYLESHEET byte for byte", async () => {
    await writeSite(outputDir, unrelatedVaultRoot, [{ notePath: "Index.md", html: "<p>Home</p>" }]);

    const written = await readFile(path.join(outputDir, "styles.css"), "utf8");
    expect(written).toBe(STYLESHEET);
  });

  it("writes styles.css even when no page is published", async () => {
    await writeSite(outputDir, unrelatedVaultRoot, []);

    await expect(readFile(path.join(outputDir, "styles.css"), "utf8")).resolves.toBe(STYLESHEET);
  });
});

describe("writeSite — 8.2 the generated front page", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), "vault-publisher-writer-generated-front-page-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("writes the given generated front page to index.html alongside the other pages", async () => {
    await writeSite(
      outputDir,
      unrelatedVaultRoot,
      [{ notePath: "Handbook/Onboarding.md", html: "<p>Onboarding</p>" }],
      "<p>Generated</p>",
    );

    const frontPage = await readFile(path.join(outputDir, "index.html"), "utf8");
    expect(frontPage).toBe("<p>Generated</p>");
    const onboarding = await readFile(path.join(outputDir, "Handbook", "Onboarding.html"), "utf8");
    expect(onboarding).toBe("<p>Onboarding</p>");
  });

  it("writes no index.html when no generated front page is given and no page names it", async () => {
    await writeSite(outputDir, unrelatedVaultRoot, [
      { notePath: "Handbook/Onboarding.md", html: "<p>Onboarding</p>" },
    ]);

    await expect(readFile(path.join(outputDir, "index.html"), "utf8")).rejects.toThrow();
  });
});
