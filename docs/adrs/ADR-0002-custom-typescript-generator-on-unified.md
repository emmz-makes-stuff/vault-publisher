# ADR-0002: A custom TypeScript generator on unified, not an existing Obsidian SSG

- **Status**: Accepted
- **Date**: 2026-08-25
- **Deciders**: Product Owner (final call), Architect (recommendation)

## Context

The publisher turns selected notes from an Obsidian vault into a static site. Mature options exist: Quartz is purpose-built for publishing Obsidian vaults, and general static site generators (Astro, Eleventy, Hugo) are well established.

The discriminating requirement is not Obsidian syntax support. It is that **selection and link degradation are security properties**:

- `note-selection` is an allow-list. Nothing publishes unless configuration names it, and a fixed exclusion floor overrides configuration so a typo cannot leak a folder.
- `note-rendering` requires a wikilink to an unpublished or nonexistent note to degrade to plain text, revealing no link and giving no route to the note.

Existing Obsidian publishers are built on the opposite default: publish the vault, minus an ignore list.

## Decision

Write a **custom generator in TypeScript** on the `unified` / `remark` / `rehype` toolchain.

- Own the security-relevant logic outright: selection, the exclusion floor, wikilink resolution and degradation, and warning output.
- Own the callout transform too — the syntax is a blockquote whose first line matches `> [!type] Title`, and the alternatives are small single-maintainer packages that would process every page of a confidential site.
- Take from the ecosystem only what is core and stable: `remark-parse`, `remark-gfm`, `remark-frontmatter`, `remark-rehype`, `rehype-stringify`, `yaml`. CLI arguments via Node's built-in `util.parseArgs`.
- Generate HTML as a syntax tree serialised by `rehype-stringify`, never by string concatenation, so escaping is structural rather than remembered.
- **Ship no client-side JavaScript.** The collapsible explorer uses `<details>`/`<summary>`, with the current page's ancestor folders rendered already open. One hand-written stylesheet, light theme only.
- Node 24 LTS, pinned in `.nvmrc` and `engines`.

## Consequences

- The behaviour that must never be wrong is ours, is small, and is directly testable. The exclusion floor, allow-list selection and link degradation get explicit test coverage rather than being inferred from output.
- No framework upgrade can silently change what publishes.
- A small dependency surface on a pipeline that processes confidential material.
- The site works with scripts disabled, has no bundle, and has nothing client-side that could mishandle content. There is no client bundle, so **no Vite** — the Product Owner's standing frontend preference assumes one and does not apply here.
- We carry work an off-the-shelf tool would have given us: explorer rendering, callout styling, page layout.
- Wikilink resolution must be built with Obsidian's own name-resolution behaviour in mind (links are by note name, not path), which is a correctness risk we now own.

## Alternatives considered

**Quartz.** Rejected. It provides wikilinks, callouts, an explorer and folder structure immediately, but its selection model is deny-list — publish everything, minus `ignorePatterns` and a frontmatter flag — which is the inverse of the requirement. Much of the remaining work would be *removing* features that are explicitly out of scope: search, graph view, backlinks, dark mode. Inverting the one behaviour that must never be wrong, inside another project's codebase, means re-auditing that inversion at every upgrade.

**A general SSG (Astro, Eleventy, Hugo).** Rejected. None understands Obsidian, so the wikilink and callout work is ours regardless; what they add is a templating and component layer for a site with no interactivity.

**.NET 10 with Markdig.** Rejected, and noted as a departure from the Product Owner's stated back-end default. Markdig is a capable, extensible parser, but there is no Obsidian-flavoured extension ecosystem in .NET, so callouts *and* wikilinks would both be hand-written; and the Cloudflare deploy tool (`wrangler`) is Node, so a .NET generator means two runtimes and two toolchains in a project that needs one. The default would stand if this were a service; it is a build-time text pipeline plus a file upload.

**Third-party Obsidian remark plugins for callouts.** Rejected on dependency-surface grounds, not capability. Reversible at low cost if maintaining the transform proves tedious.
