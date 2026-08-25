## 1. Project scaffolding and toolchain

- [x] 1.1 Initialise the npm package with `type: module`, `engines.node` pinned to Node 24, and a `.nvmrc` holding the same version; verify `node --version` inside the repo matches the pin
- [x] 1.2 Add TypeScript with a `tsconfig.json` targeting Node 24 ESM and verify `npm run build` (`tsc --build`) exits 0 on an empty source tree
- [x] 1.3 Add vitest and verify `npm test` (`vitest run`) exits 0 and returns to the shell without watching
- [x] 1.4 Add prettier with a config and verify `npx prettier --check .` exits 0 on a formatted tree and non-zero on a deliberately misformatted file
- [x] 1.5 Add eslint flat config with `typescript-eslint` and verify `npx eslint .` exits 0 clean and non-zero on a deliberate violation
- [x] 1.6 Add the runtime dependencies — `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `remark-rehype`, `rehype-stringify`, `yaml` — and verify `npm ci` succeeds from a clean checkout
- [x] 1.7 Add a `.gitignore` covering `node_modules/`, build output, and any local vault checkout, and verify `git status` is clean after a build

## 2. Access control, before any content exists

These come first deliberately: the guarantee must be in place and proven before confidential content is ever deployed. See design.md — Migration Plan.

- [x] 2.1 Create the Cloudflare Worker and attach the custom domain (the concrete hostname is a deployment parameter, held in the vault repository rather than here); verify the hostname resolves and serves the Worker
- [x] 2.2 Disable every bypass hostname for the Worker — the `workers.dev` route and, if explicitly enabled, Preview URLs — and verify by requesting each address directly that it does not serve content; this is the highest-consequence check in the project. Disabling in the dashboard is not durable on its own: `workers_dev: false` must also be set in the `wrangler` configuration (7.3), because a dashboard-only toggle is re-enabled by the next `wrangler deploy`. Preview URLs follow the `workers_dev` setting unless they were explicitly configured, in which case they are disabled separately
- [x] 2.3 Create the Cloudflare Access application on that custom domain, scoped to the apex so every path is covered rather than a subpath, and verify a request to a nested path is intercepted
- [x] 2.4 Add the one-time PIN login method and an Access policy of `Include → Emails → the reader addresses`; verify the policy lists exactly the intended addresses
- [x] 2.5 Deploy a placeholder page and verify an unauthenticated request is refused, an allow-listed address receives a code and gains access, and a non-allow-listed address is refused and receives no email
- [x] 2.6 Verify that a static asset (an image) placed alongside the placeholder is equally refused when requested directly by its address while unauthenticated
- [x] 2.7 Record the application's session duration, and verify the two-step removal the spec now describes: sign in as an address, remove it from the policy, and confirm the live session persists; then revoke the existing session and confirm access is withdrawn. Restore the policy to exactly the intended addresses afterwards
- [x] 2.8 Verify credential reuse: a credential that has already been used is refused, and a new one can be obtained. (Expiry is verified in 8.6 — it needs a wait longer than the credential's lifetime and does not gate the content pipeline)
- [ ] 2.9 Write the removal procedure down where the owner will find it when removing a reader — both steps, and the consequence of doing only the first. Removal is the operation most likely to be performed under time pressure and believed complete when it is not

## 3. Configuration and selection

- [ ] 3.1 Define the `publish.config.yaml` schema and implement the loader with explicit shape validation; verify unit tests cover a valid config, an unknown key, and a wrong-typed value
- [ ] 3.2 Make a malformed or unreadable config fail the publish and publish nothing; verify a test asserts a non-zero exit and no output written
- [ ] 3.3 Implement selection resolution — named folders publish recursively, named notes publish individually, everything else does not; verify unit tests cover folder selection, individual-note selection, and a note covered by neither
- [ ] 3.4 Implement the exclusion floor as a fixed list in code covering `CLAUDE.md`, `.claude/`, `.obsidian/`, `Journal/`, `Private/`; verify tests assert each is withheld even when the config names it directly
- [ ] 3.5 Verify by test that an excluded folder nested inside a selected folder is withheld while its siblings publish, and that an absent excluded path (`Private/`) does not error
- [ ] 3.6 Report configuration entries that match no path in the vault as warnings and publish what did match; verify a test asserts the warning and a successful exit
- [ ] 3.7 Verify by test that a note's `audience:` frontmatter value has no effect on selection in either direction

## 4. Markdown pipeline

- [ ] 4.1 Assemble the unified pipeline — `remark-parse`, `remark-frontmatter`, `remark-gfm`, `remark-rehype`, `rehype-stringify` — and verify a golden-file test renders a plain note with a table and a task list
- [ ] 4.2 Parse frontmatter with `yaml` into a typed record per note; verify tests cover a note with frontmatter, one without, and one with malformed YAML
- [ ] 4.3 Build the note index that maps Obsidian note names to published pages, mirroring Obsidian's name-based resolution; verify tests cover a unique name, a name colliding across folders, and a name that does not exist
- [ ] 4.4 Implement wikilink resolution for published targets, including the aliased `[[Note|text]]` and heading `[[Note#Section]]` forms; verify golden-file tests render a working link, an alias-labelled link, and a heading link resolving to the page
- [ ] 4.5 Implement degradation to plain text for wikilinks whose target is unpublished or absent, emitting no link and no route to the note; verify tests cover an unselected target, an absent target, and an aliased unresolvable link rendering only its alias text
- [ ] 4.6 Treat an ambiguous wikilink target as a warning rather than a silent guess; verify a test asserts the warning and the chosen behaviour
- [ ] 4.7 Implement the callout transform for blockquotes opening `> [!type] Title`, covering `warning`, `important`, `danger`, `note`, `abstract`, `tip`, `quote`, `success`, `info`; verify a golden-file test renders each type with its title, body, and type-distinguishing markup
- [ ] 4.8 Drop ` ```base ` blocks entirely, emitting nothing to the page; verify a golden-file test asserts the block's absence and that surrounding content renders
- [ ] 4.9 Render images referenced by published notes and verify a golden-file test; verify non-image attachments produce no page and no download
- [ ] 4.10 Render the per-page frontmatter table at the foot of every page over the fixed field set `type, area, grade, status, owner, tags, updated, starts, ends`; verify tests cover a note with some fields, a note with none (no table rendered), and a note carrying fields outside the set (omitted)

## 5. Site assembly

- [ ] 5.1 Build the navigation tree from the published set — a folder appears when any note within it, at any depth, is published; verify tests cover a partially published folder, a folder with no published notes, and a folder published only via a subfolder
- [ ] 5.2 Label entries by frontmatter `title` where present and filename otherwise, ordering by filename; verify a test asserts ordering is unaffected when titles sort differently from filenames
- [ ] 5.3 Render the explorer with `<details>`/`<summary>`, emitting the current page's ancestor folders already open; verify a golden-file test on a nested page shows its ancestors open and unrelated folders closed
- [ ] 5.4 Render the page layout as a hast tree serialised by `rehype-stringify`, never string concatenation; verify a test asserts that a note title containing HTML metacharacters is escaped
- [ ] 5.5 Render the vault root `Index.md` as the site front page under the same rules as any other page; verify a golden-file test including a degraded link in the index
- [ ] 5.6 Write the single light-theme stylesheet covering typography, callout types, tables, task marks, and the explorer; verify no client-side JavaScript is emitted anywhere in the output
- [ ] 5.7 Make pages readable at mobile widths, with wide tables handled without breaking layout; verify by inspecting the rendered output at a narrow viewport

## 6. Warnings and CLI

- [ ] 6.1 Implement the warning reporter emitting `[WARNING]` lines that name the containing note and the specific problem; verify tests cover an unresolved link and a dropped Bases block
- [ ] 6.2 Ensure warnings never fail a publish — the degraded page ships and the process exits 0; verify a test runs a vault producing many warnings and asserts a zero exit with all warnings reported
- [ ] 6.3 Implement the CLI with `util.parseArgs` taking the vault path, config path and output directory; verify `--help` exits 0 and a missing required argument exits non-zero
- [ ] 6.4 Verify end to end against a fixture vault that the output directory contains exactly the expected pages and nothing else

## 7. Distribution and deployment

- [ ] 7.1 Write `action.yml` as a composite action running `npm ci` and the CLI from `$GITHUB_ACTION_PATH`, with no committed `dist/`; verify a workflow in this repo consumes the action against a fixture vault and produces output
- [ ] 7.2 Tag the first release as `v1` and verify `uses: emmz-makes-stuff/vault-publisher@v1` resolves from another repository
- [ ] 7.3 Add the `wrangler` configuration with `assets.directory` pointing at the build output and no Worker script; verify `wrangler deploy` uploads a fixture site to the Worker. The configuration MUST carry `workers_dev: false` **and** must not enable `preview_urls` — preview URLs follow the `workers_dev` setting only unless explicitly configured, so a config enabling them re-opens the second bypass hostname while satisfying the first flag. Verify both _before_ the first deploy, and re-request the `workers.dev` address **and** a preview address afterwards to confirm the deploy did not re-enable the routes 2.2 disabled. This applies to **every** wrangler configuration that deploys this Worker — if the fixture deploy here and the vault workflow's deploy use different config files, both carry the flags
- [ ] 7.4 Add `.github/workflows/publish.yml` to the vault repository, triggered `on: push: branches: [main]`, running the action and deploying with `wrangler`; verify a push to main publishes and a push to another branch does not. The workflow's own deploy is a second, unattended path that runs on every push, so it re-checks the bypass hostnames itself rather than relying on 7.3's one-time check — see 7.8
- [ ] 7.5 Store the Cloudflare deploy token as a secret in the vault repository and verify the workflow authenticates without it appearing in logs
- [ ] 7.6 Verify a push changing only `publish.config.yaml` rebuilds the site, and that a note removed from the config no longer has a published page
- [ ] 7.7 Verify the built site is not committed to either repository — `git status` is clean in both after a publish
- [ ] 7.8 Make the vault's publish workflow verify the guarantee on every run: after `wrangler deploy`, request the `workers.dev` address and a preview address and **fail the job** unless both refuse to serve the site. Verify by temporarily pointing the check at an address that does serve and confirming the job fails — a check that cannot fail proves nothing. This is the only part of `reader-access` that keeps holding after this change ships: everything else proven in section 2 is dashboard state on a third-party service that no gate in this repository can see change

## 8. Final verification

- [ ] 8.1 Publish the real selected set and verify the site contains exactly those notes, with the explorer showing no trace of excluded ones
- [ ] 8.2 Re-verify unauthenticated refusal on the live site — a page, a nested path, and a static asset — after real content is deployed
- [ ] 8.3 Re-verify every bypass hostname serves nothing now that real content exists — the `workers.dev` address and any Preview URL — since the deploys in section 7 ran between this check and 2.2
- [ ] 8.4 Have each reader complete a login end to end and confirm they reach the site
- [ ] 8.5 Review the publish log's `[WARNING]` lines with the Product Owner and confirm each degraded link is expected
- [ ] 8.6 Verify credential expiry against the live site: request a credential, leave it unused past its stated lifetime, and confirm it is refused and a new one can be obtained. Deferred from 2.8 because it requires an uninterrupted wait; the stated lifetime is currently quoted from vendor documentation rather than observed, and expiry is the half of the credential guarantee that nothing has yet exercised
