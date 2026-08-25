# DEVLOG — publish-vault-as-private-site

The shared working channel for this change. Organised by `## N.` section, mirroring `tasks.md`.
Every post is attributed (`[architect]`, `[worker]`, `[reviewer]`, `[supervisor]`) and names the
block it concerns. Append-only; only `## NEXT` is rewritten.

**Standing constraint** (design.md, Open Questions): this repository may become public. Nothing
written here may contain a real note title, a client name, or the published hostname.

## 1. Project scaffolding and toolchain

**[architect]** Base: c756850 — this section delivers an empty but fully gated TypeScript project:
Node 24 pinned, `tsc --build` compiling, `vitest run` exiting, prettier and eslint clean, the seven
runtime dependencies installed, and `git status` clean after a build.

**[architect]** Block **1.1–1.7** — briefing the worker. Carved as a single block on the Product
Owner's call: every task edits `package.json`, and the gate set cannot go green until tsc, vitest,
prettier and eslint all exist together, so a partial block could not commit green.

Binding decisions from `design.md § 2` and `§ 6`:

- Node 24 LTS, pinned in **both** `.nvmrc` and `engines.node`. npm as package manager.
- ESM throughout — `"type": "module"`, `tsconfig.json` targeting Node 24 ESM.
- Runtime dependencies are **exactly** these seven and no more: `unified`, `remark-parse`,
  `remark-gfm`, `remark-frontmatter`, `remark-rehype`, `rehype-stringify`, `yaml`. Dependency
  surface is a stated design constraint, not an accident — adding an eighth is an Architect call.
- CLI argument parsing uses Node's built-in `util.parseArgs`. No CLI framework dependency.
- **No Vite, no bundler, no client-side JavaScript.** The standing frontend preference assumes a
  bundle and explicitly does not apply here.
- `package.json` scripts the Makefile calls: `build` → `tsc --build`, `test` → `vitest run`. The
  `run` subcommand is required — bare `vitest` watches and never exits, which cannot gate anything.
- Format and lint gates are `npx prettier --check .` and `npx eslint .` (flat config with
  `typescript-eslint`). `--check` never rewrites, so the gate never produces an unreviewed edit.

Done-gates for this block — every one must print its `LABEL_EXIT:0`:
`make build`, `make test`, `make format`, `make lint`, `make validate` (or `make gates`).

Additional acceptance beyond the gates, per the task text:

- 1.4 — prettier must exit **non-zero** on a deliberately misformatted file (verify, then revert).
- 1.5 — eslint must exit **non-zero** on a deliberate violation (verify, then revert).
- 1.6 — `npm ci` succeeds from a clean checkout (lockfile committed and consistent).
- 1.7 — `.gitignore` already exists at the repo root; extend rather than replace it, covering
  `node_modules/`, build output (`dist/`, `*.tsbuildinfo`), and any local vault checkout.
  `git status` must be clean after a build.

The Makefile already covers this stack; no Makefile change is needed for this block, and the worker
must not edit it.

**[worker]** Block 1.1–1.7 implemented, all tasks in this one block:

- 1.1 — `package.json` (`type: module`, `engines.node: ">=24 <25"`) and `.nvmrc` (`24`). Verified:
  `node --version` on this machine is `v24.13.1`, satisfies the pin.
- 1.2 — `tsconfig.json` targets Node 24 ESM (`NodeNext` module/moduleResolution, `ES2024`, `strict`,
  `composite`). `npm run build` (`tsc --build`) exits 0. Note: a truly empty `src/` makes `tsc
--build` fail with `TS18003` ("no inputs found") in composite mode, so `src/index.ts` is a single
  no-op placeholder (`export {}`) rather than an empty directory — that's what "empty source tree"
  means in practice here.
- 1.3 — vitest added. `npm test` (`vitest run`) exits 0 and returns. Chose a **genuine placeholder
  test** (`test/scaffold.test.ts`) over `passWithNoTests`: it asserts real scaffold invariants —
  `engines.node` matches `.nvmrc`'s major version, `package.json` declares exactly the seven
  design-mandated runtime deps, `type: module` is set — properties this block needs held for the
  life of the project, so the test earns its place rather than being a no-op gate-satisfier.
- 1.4 — prettier (`.prettierrc.json`) + `.prettierignore` excluding `openspec/`, `docs/`, `.claude/`,
  `CLAUDE.md`, `REQUIREMENTS.md` — out of this block's scope, and `CLAUDE.md`/`.claude/` are
  off-limits to edit, so excluded from the gate rather than reformatted. Verified `npx prettier
--check .` exits 1 on a deliberate misformat of `src/index.ts`, then reverted.
- 1.5 — eslint flat config (`eslint.config.js`), `typescript-eslint` `strictTypeChecked`, via
  `eslint/config`'s `defineConfig` (the `tseslint.config()` helper is deprecated in favour of it —
  used `defineConfig` to keep lint clean rather than accept a deprecation warning as a lint error).
  Added `tsconfig.eslint.json` (extends `tsconfig.json`, `rootDir: "."`, `allowJs`, includes
  `src`/`test`/root `*.ts`/`*.js`, `composite: false`) so type-aware linting covers
  `eslint.config.js`/`vitest.config.ts`/`test/` without pulling them into the build's tsconfig,
  which must stay `src`-only for the 1.2 "empty source tree" build check. Verified `npx eslint .`
  exits 1 on a deliberate `any` + unused-var violation, then reverted.
- 1.6 — exactly the seven runtime deps installed (`unified`, `remark-parse`, `remark-gfm`,
  `remark-frontmatter`, `remark-rehype`, `rehype-stringify`, `yaml`), no others.
  `package-lock.json` committed. Verified `npm ci` from a clean `node_modules` exits 0.
- 1.7 — extended the existing `.gitignore` (not replaced) with a "local vault checkout" section
  (`vault/`, `.vault/`) alongside the pre-existing `node_modules/`, `dist/`, `*.tsbuildinfo`.
  Confirmed `dist/`, `node_modules/`, `tsconfig.tsbuildinfo` are all git-ignored after a build;
  `git status --porcelain` shows only new source files awaiting the Architect's commit, nothing
  stray.

Aside: `npm install`/`npm ci` and the `make`/`npx` gate commands needed the sandbox bypass — this
machine's global `~/.npm` cache had root-owned files unrelated to this repo (a pre-existing npm
cache-ownership issue), not a project problem; no workaround was applied to the repo itself.

Self-test gate results (all via `make`): `BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0`
`VALIDATE_EXIT:0` — `make gates` → `GATES_EXIT:0`.

→ @reviewer

**[reviewer]** Block 1.1–1.7 — audit.

Re-ran the gates independently rather than trusting the report: `BUILD_EXIT:0`, `TEST_EXIT:0` (3
passed), `FORMAT_EXIT:0`, `LINT_EXIT:0`, `VALIDATE_EXIT:0`, `GATES_EXIT:0` via `make gates`. No
sandbox bypass was needed on this run. Confirmed `package-lock.json`'s `dependencies` /
`devDependencies` and `lockfileVersion` are consistent with `package.json`, and `npm ls --depth=0`
resolves exactly the seven runtime deps plus the expected dev toolchain — no eighth runtime
dependency. Confirmed `Makefile`, `tasks.md`, `CLAUDE.md`, `.claude/` are untouched
(`git diff HEAD` on tracked files touches only `.gitignore`, +4 lines, additive). No real note
title, client name, or hostname anywhere in the new files.

**Verdict: Approve with nits.**

No blockers. Two nits below; neither needs a re-audit round, but the first is worth a fix before
this block is committed since it weakens a gate for files this project edits every block.

**Nits:**

1. `.prettierignore` (`.prettierignore:5-9`) excludes `openspec/` and `docs/` wholesale, alongside
   the genuinely off-limits `.claude/` and `CLAUDE.md`. I checked: both directories are currently
   prettier-clean (`npx prettier --check openspec/ docs/` passes), so excluding them costs nothing
   today — but it means format drift in files this workflow actively writes every block
   (`DEVLOG.md`, `tasks.md`, the spec files) will never be caught by `make format` going forward,
   for no gate-satisfying reason (formatting them isn't blocked — only editing `CLAUDE.md`/
   `.claude/` is). Recommend narrowing `.prettierignore` to `.claude/` and `CLAUDE.md` (and
   `REQUIREMENTS.md` if that one is genuinely off-limits too), and letting `openspec/`/`docs/`
   stay under the gate.
2. `test/scaffold.test.ts`'s dependency-name assertion (`toStrictEqual` against a literal seven-name
   array) will need updating the day this project legitimately adds an eighth dependency for a later
   change — not a flaw, just noting it's a hardcoded list rather than a count, so a future worker
   touching `package.json` dependencies should expect this test to fail loudly (which is the point).

**Judgement calls — verdicts:**

1. `src/index.ts` `export {}` placeholder for the `TS18003` empty-composite-project problem — sound;
   minimal, comment explains why, no leakage risk.
2. `test/scaffold.test.ts` as a genuine placeholder test — sound. Verified its assertions
   independently: `engines.node` (`>=24 <25`) is exactly what the `.nvmrc`-derived formula in the
   test computes, and the seven-dependency assertion matches `package.json`. These are real
   invariants (Node pin tracks `.nvmrc`, dependency surface is design-fixed) that hold for the life
   of the project rather than just this block — better than `passWithNoTests`, and it won't need
   deleting in block 3 the way a pure no-op would.
3. `tsconfig.eslint.json` split — sound and idiomatic (the standard `typescript-eslint` pattern for
   type-aware linting when the build project is narrower than the lint scope). Verified
   `npx eslint .` actually reaches `eslint.config.js`, `vitest.config.ts`, and `test/` under this
   config, and `tsc --build` still only sees `src/`. No simpler single-tsconfig option satisfies
   both the 1.2 "`src`-only empty tree" build check and full-repo type-aware linting.
4. `.prettierignore` scope — see Nit 1 above; not sound as-is, but a nit rather than a blocker since
   nothing is currently misformatted.
5. `defineConfig` from `eslint/config` over the deprecated `tseslint.config()` — sound, verified
   `eslint.config.js` type-checks (`// @ts-check`) and the flat config lints the intended files
   cleanly.

Scope: strictly within tasks 1.1–1.7, no drive-by additions. TypeScript idiom: strict mode plus
`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`, no `any`/`as`-hiding-a-mismatch/`!`/
`@ts-ignore`/`eslint-disable` anywhere in the diff. `node:` prefixes used correctly in
`scaffold.test.ts`. ESM throughout.

Given this is Approve-with-nits, no re-audit is required — the Architect can commit as-is or ask the
worker to take nit 1 first, at their discretion.

**[worker]** Follow-up to reviewer nit 1, block 1.1–1.7. Narrowed `.prettierignore` to what's
genuinely off-limits or generated: `.claude/`, `CLAUDE.md`, `node_modules/`, `dist/`,
`package-lock.json`, `*.tsbuildinfo`. `openspec/` and `docs/` are back under the format gate.

Turns out the reviewer's "both directories are prettier-clean" check doesn't hold on a full
`--check`: `npx prettier --check openspec/ docs/` fails on 11 files — mechanical markdown-emphasis
normalization (`*word*` → `_word_`) in `docs/adrs/*.md` and every file under
`openspec/changes/publish-vault-as-private-site/` (`design.md`, `proposal.md`, the five spec files,
and this DEVLOG). Per the brief, reformatting spec/ADR content is an Architect call — risk of
fighting the OpenSpec validator — so I did not run `--write` on any of them; I only reverted a
throwaway probe write on one ADR file (`git show HEAD:<path> > <path>`, confirmed clean via
`git diff --stat`). `openspec/` and `docs/` stay excluded, with the reason recorded inline in
`.prettierignore`, pending an Architect decision on reformatting.

`REQUIREMENTS.md` is clean (`npx prettier --check REQUIREMENTS.md` exits 0) — dropped from the
ignore list per the brief.

Re-ran gates with the narrowed ignore: `BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0`
`VALIDATE_EXIT:0` — `make gates` → `GATES_EXIT:0`. `FORMAT_EXIT:0` here is green because
`openspec/`/`docs/` are genuinely clean _of anything this block wrote_ (this DEVLOG post included),
not because they're hidden — the pre-existing spec/ADR prose is what's excluded, and that's called
out above for the Architect's call, not silently swept aside.

❓ @architect — reformat `docs/adrs/*.md` and the change's `openspec/` markdown to prettier style
(mechanical, `*em*`→`_em_` only, verified on one file), or leave them excluded indefinitely? Either
way this block's own new files are clean either way.

→ @reviewer

**[worker]** Architect answered ❓ above: reformat, confirmed by the Product Owner, and confirmed
safe against the OpenSpec validator. Executed:

- `.prettierignore` reduced to the final list: `.claude/`, `CLAUDE.md`, `node_modules/`, `dist/`,
  `package-lock.json`, `*.tsbuildinfo` — the explanatory comment removed since it no longer applies.
- `npx prettier --write .` across the repo. Reformatted exactly the 11 files identified: the three
  ADRs under `docs/adrs/`, and `design.md`, `proposal.md`, and all five `specs/*/spec.md` files
  under this change, plus `openspec/changes/publish-vault-as-private-site/DEVLOG.md` itself (this
  file). Confirmed `openspec/changes/publish-vault-as-private-site/tasks.md` was reported
  `(unchanged)` by prettier — untouched, as required; did not need to stop.
- Confirmed via `git diff --stat` that `Makefile`, `CLAUDE.md`, `.claude/`, and `tasks.md` remain at
  zero diff after the `--write` pass.

Gates re-run: `BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0` `VALIDATE_EXIT:0` —
`make gates` → `GATES_EXIT:0`. `FORMAT_EXIT:0` and `VALIDATE_EXIT:0` both green with `openspec/`
and `docs/` now fully and genuinely in scope — no exclusions left standing in for coverage.

→ @reviewer

## NEXT

- Section 1 block 1.1–1.7 implemented and self-tested green; awaiting reviewer.
- Section 2 is entirely human-in-the-loop Cloudflare work (Worker, `workers.dev` route disabled,
  Access application + one-time PIN + email allow-list). Per CLAUDE.md §4 the Architect stops and
  hands the Product Owner a copy-pasteable runbook; ticks wait on their confirmation. Product Owner
  has chosen to take this on **after section 1 closes**, keeping design.md's Migration Plan ordering
  — the guarantee is proven before any content-rendering code exists.
