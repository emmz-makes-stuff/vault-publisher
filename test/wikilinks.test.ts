import { describe, expect, it } from "vitest";
import {
  buildNoteIndex,
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

  it("outputPathForNote yields a decoded, filesystem-safe path with no percent-encoding", () => {
    expect(outputPathForNote("Handbook/Some Note.md")).toBe("Handbook/Some Note.html");
  });
});
