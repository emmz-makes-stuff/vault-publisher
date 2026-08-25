# ADR-0003: Publisher is a reusable GitHub Action; the site is a Cloudflare Worker with static assets

- **Status**: Accepted
- **Date**: 2026-08-25
- **Deciders**: Product Owner (final call), Architect (recommendation)

## Context

Two repositories are involved: the vault repository (private, client-confidential) and the publisher (`emmz-makes-stuff/vault-publisher`). `publish-pipeline` requires a publish on every push to the vault's main branch, including pushes that change only the selection configuration.

Where the build runs determines where confidential content ends up. The publisher's `[WARNING]` output names notes, and note titles are themselves sensitive.

## Decision

**Topology — the publisher is a reusable composite GitHub Action, called by the vault.**

```
vault repo (private)                    emmz-makes-stuff/vault-publisher (may be public)
  notes…                                   src/          the generator
  publish.config.yaml   ── selection        action.yml    composite action
  .github/workflows/                        tests/
    publish.yml  ──uses──────────────────▶  (no vault content, ever)
         │
         └── wrangler deploy ──▶ Cloudflare Worker (static assets)
                                        ▲
                              Cloudflare Access — see ADR-0001
```

- The publish workflow lives **in the vault repository**, so the trigger is an ordinary `on: push: branches: [main]` — no cross-repo token, no `repository_dispatch`.
- `publish.config.yaml` lives **in the vault repository**, beside what it selects and versioned with it. This is what makes the "configuration changed without note changes" scenario a plain push.
- The **exclusion floor lives in the publisher's code**, where configuration structurally cannot reach it.
- The Action is **composite**, not a bundled JavaScript action, so no built `dist/` is committed. Its own checkout runs `npm ci` and the CLI from `$GITHUB_ACTION_PATH`. Consumed as `uses: emmz-makes-stuff/vault-publisher@v1`, versioned by tag.

**Hosting — a Cloudflare Worker with static assets, on a custom domain.**

- `wrangler deploy` with `assets.directory` pointing at the build output. No Worker script is required for an assets-only site.
- Cloudflare Pages was the obvious choice and was rejected: Cloudflare's own documentation now advises *"Start new projects with Workers"*, stating that Workers supports most Pages use cases with a broader feature set.
- Deploy is a direct upload from the vault's workflow. **The rendered site is never committed to any repository.**

**Required deployment condition — the `workers.dev` route must be disabled.**

A Worker is reachable by default at `<name>.<subdomain>.workers.dev`. That hostname is Cloudflare's domain, not a zone the account controls, so it cannot carry an Access policy. Left enabled, it serves the entire confidential site unauthenticated to anyone who finds it, bypassing ADR-0001 completely. It is disabled, and its being disabled is verified as an explicit task rather than assumed.

## Consequences

- **The publisher repository never contains vault content and never sees it in CI.** It can be public and reused for other vaults.
- The vault's Actions run in the vault's own private repository, so warning lines naming notes stay in a private log.
- No cross-repository credential is needed. The only secret is a Cloudflare deploy token, held in the vault repository.
- The trigger requirement is met by the platform rather than by plumbing.
- Two repositories must be coordinated: a breaking change to the publisher requires a tag bump in the vault's workflow. Tag-based versioning makes that explicit rather than silent.
- Binds deployment to Cloudflare, consistent with ADR-0001 already binding access control there.

## Alternatives considered

**The publisher pulls the vault**, triggered by `repository_dispatch` from the vault. Rejected. It requires a cross-repo token with read access to a private repository, and it draws vault content into the publisher's CI — where, if that repository is ever public, the Actions logs and their warning lines naming notes would be public too.

**The publisher vendored into the vault** (submodule or copied source). Rejected. Simplest possible trigger, but the generator's tests and toolchain would live inside the confidential repository, and the publisher would stop being reusable.

**Cloudflare Pages.** Rejected on Cloudflare's own guidance to start new projects on Workers. Also relevant: Pages' built-in Access toggle protects only preview deployments, not the production or `pages.dev` hostname, which is a confusing default for a project whose entire premise is that nothing is served unauthenticated.

**Committing the built site to a repository and serving from it.** Rejected. It would place rendered confidential HTML under version control, in a second place, permanently.
