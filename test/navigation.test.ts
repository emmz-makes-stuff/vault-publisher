import { describe, expect, it } from "vitest";
import { buildNavigationTree, noteLabel, type NavigationEntry } from "../src/navigation.js";

function notes(entries: readonly NavigationEntry[]): readonly NavigationEntry[] {
  const folder = entries.find(
    (entry): entry is Extract<NavigationEntry, { type: "folder" }> => entry.type === "folder",
  );
  return folder?.entries ?? [];
}

describe("buildNavigationTree — folder appearance", () => {
  it("shows a partially published folder, listing only its published notes", () => {
    const tree = buildNavigationTree(["Handbook/Onboarding.md"], new Map());

    expect(tree).toStrictEqual([
      {
        type: "folder",
        path: "Handbook",
        label: "Handbook",
        sortKey: "Handbook",
        entries: [
          {
            type: "note",
            notePath: "Handbook/Onboarding.md",
            label: "Onboarding",
            sortKey: "Onboarding.md",
          },
        ],
      },
    ]);
  });

  it("does not create a node for a folder with no published notes", () => {
    // Only published paths are ever passed in — there is no vault walk that
    // could hand this function an unpublished note to represent, so a
    // folder holding none simply never gets created.
    const tree = buildNavigationTree(["Handbook/Onboarding.md"], new Map());

    const paths = collectFolderPaths(tree);
    expect(paths).not.toContain("Private");
    expect(paths).toStrictEqual(["Handbook"]);
  });

  it("shows a folder published only via a subfolder, as a container", () => {
    const tree = buildNavigationTree(["Handbook/Policies/Leave.md"], new Map());

    expect(tree).toStrictEqual([
      {
        type: "folder",
        path: "Handbook",
        label: "Handbook",
        sortKey: "Handbook",
        entries: [
          {
            type: "folder",
            path: "Handbook/Policies",
            label: "Policies",
            sortKey: "Policies",
            entries: [
              {
                type: "note",
                notePath: "Handbook/Policies/Leave.md",
                label: "Leave",
                sortKey: "Leave.md",
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("buildNavigationTree — labelling and ordering", () => {
  it("labels a published note with its frontmatter title when present", () => {
    const tree = buildNavigationTree(
      ["Handbook/Onboarding.md"],
      new Map([["Handbook/Onboarding.md", "Welcome Aboard"]]),
    );

    expect(notes(tree)[0]).toMatchObject({ label: "Welcome Aboard" });
  });

  it("labels a published note with its filename when no title is present", () => {
    const tree = buildNavigationTree(["Handbook/Onboarding.md"], new Map());

    expect(notes(tree)[0]).toMatchObject({ label: "Onboarding" });
  });

  it("orders entries by filename even when titles sort the other way", () => {
    const tree = buildNavigationTree(
      ["Handbook/Alpha.md", "Handbook/Beta.md"],
      new Map([
        ["Handbook/Alpha.md", "Zeta Note"],
        ["Handbook/Beta.md", "Alpha Note"],
      ]),
    );

    const labels = notes(tree).map((entry) => entry.label);
    // Filenames sort Alpha.md before Beta.md; titles sort the opposite way.
    // The order below proves filename ordering held, not label ordering.
    expect(labels).toStrictEqual(["Zeta Note", "Alpha Note"]);
  });

  it("interleaves folders and notes by filename rather than grouping folders first", () => {
    const tree = buildNavigationTree(["Handbook/Alpha/Note.md", "Handbook/Beta.md"], new Map());

    const kinds = notes(tree).map((entry) => `${entry.sortKey}:${entry.type}`);
    expect(kinds).toStrictEqual(["Alpha:folder", "Beta.md:note"]);
  });

  // Block A's reviewer flagged this: a folder entry's sortKey is its bare
  // label ("Notes"), while a note entry's carries the ".md" extension
  // ("Notes.md") — so a folder and a note that share a stem tie-break by
  // string-prefix order, not by "filename" read as a single flat namespace.
  // Pinned here so a future change to either sortKey shows up as a failing
  // test here first, not as an unexplained reorder in some later golden.
  it("pins the folder/note stem-collision tie-break: the bare folder name sorts before the file with the same stem", () => {
    const tree = buildNavigationTree(["Notes.md", "Notes/Sub.md"], new Map());

    expect(tree.map((entry) => `${entry.sortKey}:${entry.type}`)).toStrictEqual([
      "Notes:folder",
      "Notes.md:note",
    ]);
  });
});

describe("noteLabel", () => {
  it("returns the frontmatter title when present", () => {
    expect(
      noteLabel("Handbook/Onboarding.md", new Map([["Handbook/Onboarding.md", "Welcome"]])),
    ).toBe("Welcome");
  });

  it("falls back to the filename with .md stripped when no title is present", () => {
    expect(noteLabel("Handbook/Onboarding.md", new Map())).toBe("Onboarding");
  });
});

function collectFolderPaths(entries: readonly NavigationEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.type === "folder") {
      paths.push(entry.path);
      paths.push(...collectFolderPaths(entry.entries));
    }
  }
  return paths;
}
