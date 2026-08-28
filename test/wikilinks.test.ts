import { describe, expect, it } from "vitest";
import {
  buildNoteIndex,
  findVaultRootIndexNote,
  hrefToOutputPath,
  notePathToHref,
  outputPathForNote,
} from "../src/wikilinks.js";

describe("buildNoteIndex", () => {
  it("indexes a unique name to its single published path", () => {
    const index = buildNoteIndex(["Handbook/Onboarding.md", "Handbook/Policies.md"]);

    expect(index.get("onboarding")).toStrictEqual(["Handbook/Onboarding.md"]);
  });

  it("records every candidate for a name colliding across folders, resolving none", () => {
    const index = buildNoteIndex(["Handbook/Overview.md", "Clients/Overview.md"]);

    expect(index.get("overview")).toStrictEqual(["Handbook/Overview.md", "Clients/Overview.md"]);
  });

  it("has no entry for a name that does not exist in the published set", () => {
    const index = buildNoteIndex(["Handbook/Onboarding.md"]);

    expect(index.get("ghost")).toBeUndefined();
  });

  it("is built from the published set only — an unpublished note is not a key", () => {
    // The index is constructed from `resolveSelection`'s output, never a
    // filesystem walk, so there is no way to hand it a note that didn't
    // publish. This test documents that contract at the type level: only
    // published paths are ever passed in.
    const index = buildNoteIndex(["Handbook/Onboarding.md"]);

    expect([...index.keys()]).toStrictEqual(["onboarding"]);
  });
});

describe("notePathToHref", () => {
  it("maps a note path to its page, dropping the .md extension", () => {
    expect(notePathToHref("Handbook/Onboarding.md")).toBe("/Handbook/Onboarding.html");
  });

  it("encodes path segments containing spaces", () => {
    expect(notePathToHref("Handbook/Some Note.md")).toBe("/Handbook/Some%20Note.html");
  });
});

describe("hrefToOutputPath / outputPathForNote round trip", () => {
  it("round-trips a path with a space through notePathToHref and back", () => {
    const notePath = "Handbook/Some Note.md";

    expect(hrefToOutputPath(notePathToHref(notePath))).toBe(outputPathForNote(notePath));
  });

  it("round-trips a path with a # through notePathToHref and back", () => {
    const notePath = "Handbook/Some #1 Note.md";

    expect(hrefToOutputPath(notePathToHref(notePath))).toBe(outputPathForNote(notePath));
  });

  it("round-trips the vault-root Index.md through notePathToHref and back", () => {
    const notePath = "Index.md";

    expect(hrefToOutputPath(notePathToHref(notePath))).toBe(outputPathForNote(notePath));
  });

  it("outputPathForNote yields a decoded, filesystem-safe path with no percent-encoding", () => {
    expect(outputPathForNote("Handbook/Some Note.md")).toBe("Handbook/Some Note.html");
  });
});

describe("outputPathForNote — vault-root front page", () => {
  it("maps the vault-root Index.md to index.html, not Index.html", () => {
    expect(outputPathForNote("Index.md")).toBe("index.html");
  });

  it("leaves a subfolder's own Index.md untouched by the front-page rule", () => {
    expect(outputPathForNote("Handbook/Index.md")).toBe("Handbook/Index.html");
  });

  it("routes [[Index]] at the vault root to /index.html", () => {
    expect(notePathToHref("Index.md")).toBe("/index.html");
  });
});

describe("outputPathForNote — 8.1 case-insensitive root index match", () => {
  it("maps a lowercase root index.md to index.html", () => {
    expect(outputPathForNote("index.md")).toBe("index.html");
  });

  it("maps an all-caps root INDEX.md to index.html", () => {
    expect(outputPathForNote("INDEX.md")).toBe("index.html");
  });

  it("leaves a subfolder's own index.md (any case) untouched by the front-page rule", () => {
    expect(outputPathForNote("Handbook/index.md")).toBe("Handbook/index.html");
  });
});

describe("findVaultRootIndexNote — 8.1", () => {
  it("finds the root index note by exact name", () => {
    expect(findVaultRootIndexNote(["Handbook/Onboarding.md", "Index.md"])).toBe("Index.md");
  });

  it("finds the root index note case-insensitively", () => {
    expect(findVaultRootIndexNote(["Handbook/Onboarding.md", "index.md"])).toBe("index.md");
  });

  it("does not match a subfolder's own index note", () => {
    expect(findVaultRootIndexNote(["Handbook/Index.md"])).toBeUndefined();
  });

  it("returns undefined when the published set has no root index note", () => {
    expect(findVaultRootIndexNote(["Handbook/Onboarding.md"])).toBeUndefined();
  });

  it("cannot match a floor-excluded name — none of the exclusion floor's own entries share a name with the index note", () => {
    // Floor exclusion (`selection.ts`'s `isExcluded`) already runs before
    // `resolveSelection` returns `published`, and is itself case-
    // insensitive across every EXCLUSION_FLOOR entry, so a floor-withheld
    // path can never reach `published` regardless of its case. This test
    // covers the narrower, independent fact this function relies on: none
    // of "CLAUDE.md", ".claude", ".obsidian", "Journal" or "Private" is a
    // case variant of "Index.md", so even a (hypothetical) unfiltered list
    // could not have this function mistake one for the front page.
    const floorNames = ["CLAUDE.md", ".claude", ".obsidian", "Journal", "Private"];
    expect(findVaultRootIndexNote(floorNames)).toBeUndefined();
  });
});
