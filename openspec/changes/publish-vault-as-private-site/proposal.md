## Why

A private, client-confidential Obsidian vault holds work that two non-technical stakeholders need to read. Handing them a GitHub repository is not a viable channel, and parts of the vault are the owner's alone and must never leave it. Nothing today lets the owner share _some_ of the vault, to _named_ people, with any confidence that the rest stays private.

The material is sensitive — a commissioned software audit, assessments of named individuals, infrastructure and security weaknesses, and commercial context. The vault's own governing rule forbids exposing its contents to any external service without explicit approval. This project is that approval, and it holds only for as long as access control does.

## What Changes

This is a greenfield project. Everything below is new.

- **Explicit selection.** A configuration file names the folders and individual notes that publish. It is the only source of truth. The `audience:` frontmatter key stays in the vault for the owner's own use in Obsidian and is ignored here.
- **An exclusion floor that overrides configuration.** A fixed set of paths can never publish, whatever the configuration says, so that a typo cannot leak them.
- **Obsidian-faithful rendering.** Wikilinks (including aliased and heading forms), callouts, tables and task checkboxes render as published pages. Links to unselected or nonexistent notes degrade to plain text rather than breaking. Obsidian Bases query blocks are dropped in this version. Attachments are not published, images included: the published set is Markdown notes only, so an image embed degrades to plain text with a warning like any other unpublishable target.
- **Non-fatal warnings.** Every degraded link and dropped block is reported to the build output. A degraded page still ships; warnings never fail a publish.
- **A navigable site.** A left-hand explorer mirroring the vault's folder structure, the vault's own index note as the front page, a per-page frontmatter table, one light theme, readable on a phone.
- **Publishing driven from the vault repository**, triggered by a push to its main branch.
- **Authenticated-only access** by emailed magic link, against a reader allow-list held outside the vault repository and changeable without a commit. No passwords, no user database.

## Capabilities

### New Capabilities

- `note-selection`: which notes publish, expressed as configuration, and the fixed exclusion floor that configuration cannot override.
- `note-rendering`: how Obsidian-flavoured Markdown becomes a published page — link resolution and degradation, callouts, tables, checkboxes, frontmatter presentation, and what is deliberately not rendered.
- `site-navigation`: the explorer control, the front page, page labelling and ordering, and mobile readability.
- `publish-pipeline`: what triggers a publish, and how warnings are reported without failing it.
- `reader-access`: the guarantee that no unauthenticated request reaches published content, magic-link authentication, and allow-list management.

### Modified Capabilities

None. This is the project's first change; `openspec/specs/` is empty.

## Impact

- **New repository, no existing code.** Nothing here modifies an existing system.
- **Reads a second repository.** The publisher consumes the vault repository as input. It never writes to it.
- **Confidentiality is the governing constraint.** `reader-access` is not a feature among features — the rest of this change is only permissible because it holds. Any later decision that weakens it invalidates the approval this project rests on.
- **Technology decided by the Architect** on 2026-08-25 and recorded in `design.md ## Decisions`, with the foundational calls promoted to ADRs: [ADR-0001](../../../docs/adrs/ADR-0001-access-control-via-cloudflare-access.md) (access control), [ADR-0002](../../../docs/adrs/ADR-0002-custom-typescript-generator-on-unified.md) (generator and language), [ADR-0003](../../../docs/adrs/ADR-0003-publisher-as-action-deployed-to-cloudflare-workers.md) (delivery and hosting).
