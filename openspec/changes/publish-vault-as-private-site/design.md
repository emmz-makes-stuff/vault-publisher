## Context

See `proposal.md` — Why. This is a greenfield project with no existing code; every technology choice was open when design began. Requirements were gathered in a discovery session that deliberately assumed nothing about the _how_, and the technology decisions below were made against them in a separate architecture session on 2026-08-25.

Three constraints shape everything that follows:

- **`reader-access` is the condition of the project existing.** The source vault holds client-confidential material. Publishing any of it is a narrow, approved exception to the vault's own rule against external exposure, and that exception holds only while access control does. Design choices that trade confidentiality for convenience are not available.
- **Selection is a security property, not a feature.** `note-selection` is an allow-list with a floor that configuration cannot defeat, and `note-rendering` requires an unresolvable link to reveal nothing. Off-the-shelf Obsidian publishers are built on the opposite default.
- **Two repositories, one of them confidential.** The vault repository (private) and the publisher (`emmz-makes-stuff/vault-publisher`). Where the build runs decides where confidential content — including warning lines that name notes — ends up.

The foundational decisions are recorded as ADRs and summarised here:

- [ADR-0001](../../../docs/adrs/ADR-0001-access-control-via-cloudflare-access.md) — access control
- [ADR-0002](../../../docs/adrs/ADR-0002-custom-typescript-generator-on-unified.md) — generator and language
- [ADR-0003](../../../docs/adrs/ADR-0003-publisher-as-action-deployed-to-cloudflare-workers.md) — delivery and hosting

## Goals / Non-Goals

**Goals:**

- Keep the confidentiality guarantee out of code we wrote wherever possible. The safest authentication code is authentication code that does not exist.
- Own the security-critical logic outright — selection, the exclusion floor, link resolution and degradation — and keep it small enough to test directly.
- Keep vault content out of the publisher repository and out of its CI entirely, so the publisher can be public and reusable.
- Make the "no unauthenticated route" property structural: no bypass hostname, no committed build output.

**Non-Goals:**

- A general-purpose Obsidian publishing platform. This targets one vault's requirements; reusability is a by-product of the repo topology, not a design driver.
- Rendering every Obsidian feature. The vault was surveyed; features with zero usage are out (see `note-rendering`).
- Any client-side runtime. No bundle, no framework, no hydration.
- Any stored reader state.

## Decisions

### 1. Access control — Cloudflare Access (Zero Trust), one-time PIN

See [ADR-0001](../../../docs/adrs/ADR-0001-access-control-via-cloudflare-access.md).

Access gates the whole hostname at the edge, so pages and assets are covered by one policy. The allow-list is an Access policy (`Include → Emails → the reader addresses`) edited in the Cloudflare dashboard — outside the vault repository, no commit, no republish, satisfying `reader-access` directly. Free tier covers 50 users.

**No authentication code is written for this project**: no Worker script for auth, no session handling, no token signing, no nonce storage, no transactional email provider.

The emailed credential is a **six-digit single-use code with a 10-minute expiry, not a clickable link**. This is a knowing deviation from the Product Owner's stated preference for magic links, accepted because the _reason_ behind that preference — that readers should not have to manage a password — is satisfied identically. The `reader-access` spec was amended from "single-use link" to "single-use credential" so the specification describes what ships rather than drifting from it.

Cloudflare sends the login email only if the address is on the policy, while the login page reports "a code has been emailed to you" either way, so the login page does not disclose who the readers are.

**Alternatives rejected.** A custom magic-link Worker calling a transactional email provider — delivers the click-a-link experience, but moves token signing and verification, expiry, single-use nonce storage, cookie flags and scope, asset-path gating and email deliverability into our own code, where each defect is a client-confidentiality breach rather than a bug. A third-party identity provider (Auth0, Clerk) — vendor and configuration surface disproportionate to three readers, with no improvement on the guarantee. Shared-password site protection — no per-person allow-list, no individual revocation, and it reintroduces the password-handling problem. An unguessable URL — rejected in discovery; the Product Owner fixed authentication as a hard requirement, and obscurity gives no revocation and no audit.

**Deliberately left open.** A magic-link Worker can replace the gate as a later change without touching the content pipeline; the generator, selection model and deployment are all independent of how the gate authenticates.

### 2. Generator — custom TypeScript on unified / remark / rehype

See [ADR-0002](../../../docs/adrs/ADR-0002-custom-typescript-generator-on-unified.md).

Own outright: selection, the exclusion floor, wikilink resolution and degradation, warning output, and the callout transform.

Dependencies are deliberately few: `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `remark-rehype`, `rehype-stringify`, `yaml`. CLI arguments use Node's built-in `util.parseArgs`.

HTML is generated as a syntax tree serialised by `rehype-stringify`, never by string concatenation, so escaping is structural rather than remembered — on a site whose entire content is confidential.

**Zero client-side JavaScript.** The collapsible explorer uses `<details>`/`<summary>`, with the current page's ancestor folders rendered already open, so collapse state is correct on arrival without script. One hand-written stylesheet, light theme only. Because there is no client bundle, there is **no Vite** — the standing frontend preference assumes a bundle and does not apply here.

Node 24 LTS, pinned in `.nvmrc` and `engines`. npm as package manager. Configuration file is `publish.config.yaml` in the vault root.

**Alternatives rejected.** Quartz — its selection model is deny-list (publish everything, minus ignores and a frontmatter flag), the inverse of the requirement; it ships search, graph view, backlinks and dark mode that are all out of scope, so much of the work would be removal; and inverting the one behaviour that must never be wrong, inside another project's codebase, means re-auditing that inversion at every upgrade. General SSGs (Astro, Eleventy, Hugo) — none understands Obsidian, so the wikilink and callout work is ours regardless; what they add is a templating and component layer for a site with no interactivity. .NET 10 with Markdig — a departure from the standing back-end default, taken because there is no Obsidian-flavoured extension ecosystem in .NET (so callouts _and_ wikilinks would both be hand-written) and because `wrangler` is Node, meaning two runtimes and two toolchains in a project that needs one; the default would stand if this were a service rather than a build-time text pipeline plus a file upload. Third-party remark callout plugins — rejected on dependency-surface grounds rather than capability: small single-maintainer packages that would process every page of a confidential site, against a transform of roughly fifty lines. Reversible at low cost.

### 3. Delivery and hosting — composite GitHub Action, Cloudflare Worker with static assets

See [ADR-0003](../../../docs/adrs/ADR-0003-publisher-as-action-deployed-to-cloudflare-workers.md).

```
vault repo (private)                    emmz-makes-stuff/vault-publisher (may be public)
  notes…                                   src/          the generator
  publish.config.yaml   ── selection        action.yml    composite action
  .github/workflows/                        tests/
    publish.yml  ──uses──────────────────▶  (no vault content, ever)
         │
         └── wrangler deploy ──▶ Cloudflare Worker (static assets)
                                        ▲
                              Cloudflare Access — three emails
```

The publish workflow lives **in the vault repository**, so the trigger required by `publish-pipeline` is a plain `on: push: branches: [main]` — no cross-repo token, no `repository_dispatch`. `publish.config.yaml` lives in the vault repository beside what it selects, which is what makes "configuration changed without note changes" an ordinary push. The **exclusion floor lives in the publisher's code**, where configuration structurally cannot reach it.

The Action is **composite**, not a bundled JavaScript action, so no built `dist/` is committed: its own checkout runs `npm ci` and the CLI from `$GITHUB_ACTION_PATH`. Consumed as `uses: emmz-makes-stuff/vault-publisher@v1`, versioned by tag.

Hosting is a **Cloudflare Worker with static assets** — `wrangler deploy` with `assets.directory` pointing at the build output; no Worker script is required for an assets-only site. It is served from a custom domain on a Cloudflare zone the account controls; the concrete hostname is a deployment parameter held in the vault repository's workflow configuration, not recorded here — this repository is intended to be publishable, and the hostname identifies the client. Cloudflare Pages was rejected on Cloudflare's own current guidance to start new projects on Workers, and because Pages' built-in Access toggle protects only preview deployments, not the production or `pages.dev` hostname — a confusing default for a project whose premise is that nothing is served unauthenticated.

**Required deployment condition: the `workers.dev` route must be disabled.** It is Cloudflare's domain, not a zone this account controls, so it cannot carry an Access policy; left enabled it would serve the entire confidential site unauthenticated to anyone who found it, bypassing ADR-0001 completely. This is an explicitly verified task, not an assumption.

The rendered site is never committed to any repository — `wrangler` uploads it directly from the vault's workflow. The publisher repository never contains vault content and never sees it in CI, so it may be public; the vault's Actions run in the vault's private repository, so `[WARNING]` lines naming notes stay in a private log. Note titles are themselves sensitive.

**Alternatives rejected.** The publisher pulling the vault via `repository_dispatch` — needs a cross-repo token with read access to a private repository and drags confidential content into this repository's CI, whose logs would be public if the repository is. The publisher vendored into the vault — simplest trigger, but the generator's tests and toolchain would live inside the confidential repository and the publisher would stop being reusable. Committing the built site to a repository and serving from it — would place rendered confidential HTML under version control, in a second place, permanently.

### 4. Datastore — none, deliberately

There is no database, no key-value store and no cache. Cloudflare Access removes the need for session or nonce storage, and `reader-access` forbids a password store or user database outright. This absence is recorded as a decision so that it is not filled in later by accident: any future need for stored state is a change to be argued, not an implementation detail.

### 5. Testing — vitest, pointed at the security properties

The behaviour that must never be wrong gets explicit unit coverage rather than being inferred from rendered output: the exclusion floor, allow-list selection, and wikilink degradation. Rendering is covered by golden-file tests.

### 6. Gate commands

Single stack, so targets are unprefixed. Every command runs non-interactively and exits non-zero on failure.

| Gate     | Command                                             |
| -------- | --------------------------------------------------- |
| build    | `npm run build`                                     |
| test     | `npm test`                                          |
| format   | `npx prettier --check .`                            |
| lint     | `npx eslint .`                                      |
| validate | `openspec validate --all --strict --no-interactive` |

Underlying `package.json` scripts:

- `build` → `tsc --build`
- `test` → `vitest run` — the `run` subcommand is required; bare `vitest` enters watch mode and never exits, which cannot gate anything.

`npx prettier --check .` is check mode and never rewrites files, so the gate never produces an unreviewed edit. `npx eslint .` uses flat config with `typescript-eslint`.

**There is no `publish` target.** This repository ships a tagged GitHub Action — releasing is a git tag, not a command. The actual deploy (`wrangler deploy`) runs in the vault's workflow with Cloudflare credentials that do not belong in this repository. A `publish` target here would be a gate that never runs.

## Risks / Trade-offs

**A bypass hostname serves the whole site unauthenticated** → The `workers.dev` route is disabled as an explicit, verified task, and `reader-access` carries a requirement ("Published content has no unauthenticated route") whose scenarios cover platform default hostnames, non-production deployments, and build output at rest. This is the single highest-consequence failure mode in the project.

**Access is misconfigured — application scope too narrow, or policy too broad** → The Access application is created on the apex of the published hostname so that every path is covered rather than a subpath. Verification is a task: request a page unauthenticated and confirm it is refused, and request one as a non-allow-listed address and confirm refusal.

**Email link-scanning consumes the one-time code before the reader does**, showing "This One-Time PIN has already been used" → Documented for readers; the remedy is requesting a fresh code, and allow-listing `noreply@notify.cloudflare.com` in any mail filtering. Inherent to emailed credentials; not specific to this design.

**Wikilink resolution diverges from Obsidian's own name resolution** → Obsidian resolves links by note name rather than path, with its own shortest-unique-path behaviour. Getting this wrong risks a link that should resolve degrading to text (visible, harmless) or, worse, resolving to the wrong note. Mitigated by owning the resolver, testing it directly, and treating ambiguity as a warning rather than a silent guess.

**Note titles leak through degraded links** → Accepted by the Product Owner in discovery. A wikilink to an unpublished note renders as plain text, so the _title_ of a private note can appear in a published sentence. The alternative — stripping the text — mangles the sentence. Recorded here so it stays a decision rather than becoming a surprise.

**Warning output names notes, and note titles are sensitive** → Warnings surface only in the vault repository's private Actions log. This is a reason the build runs there and not here.

**Cloudflare is a single point of dependency** for both access control and hosting → Accepted. The alternative is more moving parts, and the concentration is what removes authentication code from this project entirely. Migration would mean a new gate and a new host, but not a new generator.

**Two repositories must be kept in step** — a breaking publisher change needs a tag bump in the vault's workflow → Tag-based versioning (`@v1`) makes the coupling explicit rather than silent.

**A dropped Bases block leaves a hole in a page** → Two of the vault's most prominent pages use them, so this is visible rather than theoretical. The warning tells the owner where; rendering a static snapshot of the query result is a candidate later change.

## Migration Plan

No migration — greenfield, with no existing system, users or data. Deployment order matters, though, because the confidentiality guarantee must exist before content does:

1. Create the Cloudflare Worker and attach the custom domain.
2. **Disable the `workers.dev` route.**
3. Create the Access application on that custom domain, add the one-time PIN login method and the email allow-list policy.
4. Verify unauthenticated refusal and non-allow-listed refusal **before** any vault content is deployed.
5. Only then add the workflow to the vault repository and publish for the first time.

Rollback is deleting the Worker, which removes the site entirely. Because nothing is stored and no build output is committed, there is no residue to clean up.

## Open Questions

- **Ordering of the `Journal/` and `Private/` exclusions relative to future vault reorganisation.** The floor is a fixed list in code today. If the vault grows areas that should never publish, the list needs extending — a small code change plus a release. Whether the floor should become extensible via a mechanism the config cannot write to is deferrable and does not affect the specs or the task breakdown.
- **Whether the publisher repository is actually made public.** It is private as of 2026-08-25, and the Product Owner intends it may become public. Its artifacts are written to survive that: no vault content, no note titles, no client name, and no published hostname — the hostname is a deployment parameter held in the vault repository instead. Nothing in the design depends on the answer; the topology keeps vault content out of this repository and its CI either way.

  **This is a standing constraint on everything written here, not a one-off cleanup.** Anything added to this repository — specs, tasks, DEVLOG posts, test fixtures, commit messages — must be readable by a stranger. A real note title in a DEVLOG post or a fixture copied from the vault re-creates the leak that genericising just removed.
