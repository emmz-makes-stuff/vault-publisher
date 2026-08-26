import { describe, expect, it } from "vitest";
import { STYLESHEET } from "../src/styles.js";

/**
 * 5.6/5.7 — `site-navigation`'s "readable on a phone" requirement has a
 * scenario where the reader's device prefers dark mode and the site must
 * still present its light theme. These assertions are what's testable
 * about that from the stylesheet's own text: no dark-scheme override
 * exists to switch colours, and the colours that matter are set
 * explicitly rather than left to a UA default a dark-mode browser would
 * otherwise supply.
 */
describe("STYLESHEET — light theme survives a dark-mode device", () => {
  it("never defines a prefers-color-scheme: dark block", () => {
    expect(STYLESHEET).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("declares color-scheme: light, so the UA does not darken its own controls", () => {
    expect(STYLESHEET).toMatch(/color-scheme:\s*light/);
  });

  it("sets an explicit background and foreground colour on body", () => {
    const bodyRule = /(?<!,\n)^body\s*\{[^}]*\}/m.exec(STYLESHEET)?.[0] ?? "";
    expect(bodyRule).toMatch(/background:\s*#/);
    expect(bodyRule).toMatch(/color:\s*#/);
  });
});

describe("STYLESHEET — 5.6 covers every callout type callouts.ts emits", () => {
  it("has a selector for each recognised callout type", () => {
    const types = [
      "warning",
      "important",
      "danger",
      "note",
      "abstract",
      "tip",
      "quote",
      "success",
      "info",
    ];
    for (const type of types) {
      expect(STYLESHEET).toContain(`.callout-${type}`);
    }
  });
});

describe("STYLESHEET — 5.7 wide content scrolls inside its own container, not the page", () => {
  it("makes table its own horizontal scroll container instead of the page body", () => {
    const tableRule = /\btable\s*\{[^}]*\}/.exec(STYLESHEET)?.[0] ?? "";
    expect(tableRule).toMatch(/overflow-x:\s*auto/);
  });

  it("hides horizontal overflow on the page body itself", () => {
    const htmlBodyRule = /html,\s*body\s*\{[^}]*\}/.exec(STYLESHEET)?.[0] ?? "";
    expect(htmlBodyRule).toMatch(/overflow-x:\s*hidden/);
  });

  it("stacks the explorer above the content below the mobile breakpoint, staying reachable with no script", () => {
    const mediaBlock = /@media[^{]*\{[\s\S]*\.layout\s*\{[^}]*flex-direction:\s*column/.exec(
      STYLESHEET,
    );
    expect(mediaBlock).not.toBeNull();
  });

  it("gives an unbreakable token in prose a wrap point, so overflow-x: hidden fits rather than clips it", () => {
    const bodyRule = /(?<!,\n)^body\s*\{[^}]*\}/m.exec(STYLESHEET)?.[0] ?? "";
    expect(bodyRule).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
