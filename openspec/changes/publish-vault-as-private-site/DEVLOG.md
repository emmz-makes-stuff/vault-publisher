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

**[supervisor]** Section 1 review — scope `git diff c756850..HEAD` (one commit, `b6a2655`, blocks
1.1–1.7 plus the two architect-directed follow-ups).

**Verdict: Request changes.**

Re-ran the gate set: `BUILD_EXIT:0` `TEST_EXIT:0` (3 passed) `FORMAT_EXIT:0` `LINT_EXIT:0`
`VALIDATE_EXIT:0` — `make gates` → `GATES_EXIT:0`, and `git status --porcelain` is empty after
`make build`. Every box in §1 is ticked and every gate is genuinely green. The two blockers below are
both about what the gate set _does not reach_, which is the one thing that matters most in this
section: §1 is not a feature, it is the instrument every later section is measured with, so a hole
here is not a section-1 defect — it is a permanent blind spot.

**Blockers**

1. **No gate type-checks anything outside `src/`.** `tsconfig.json:20` sets `"include": ["src"]`, so
   `make build` (`tsc --build`) compiles the source tree only. `vitest run` transpiles via esbuild and
   never type-checks. `npx eslint .` reports lint rules, not compile errors — type-aware linting is
   not type-checking, and the distinction is invisible in any single block's diff. Demonstrated on a
   clean copy of `HEAD`: a file `test/typehole.test.ts` containing

   ```ts
   function greet(name: string): string {
     return `hello ${name}`;
   }
   expect(greet(42)).toBe("hello 42");
   ```

   gives `TSC_EXIT:0`, a **passing** vitest run, and an eslint report that flags only an unused
   variable elsewhere in the same file. The same hole covers `vitest.config.ts` and
   `eslint.config.js`. This is the `.prettierignore` pattern the block already caught once — a gate
   reporting green over territory it never examined — surviving in a second place. It lands hardest
   from block 3.4 onward: the tests asserting that an excluded path stays withheld are the executable
   form of the confidentiality guarantee, and a test that has drifted out of type-agreement with the
   code it exercises (a renamed field, a signature that gained a parameter, an `undefined` flowing
   where a vault root was expected) will keep passing and keep reporting the guarantee held.

2. **The lint gate walks the local vault checkout that block 1.7 sanctioned.**
   `.gitignore:8-10` establishes `vault/` and `.vault/` as the place a Product Owner checks a vault out
   for manual testing; `eslint.config.js:7` ignores only `dist/**`, and ESLint flat config's defaults
   ignore only `node_modules` and `.git` — it does not read `.gitignore`. Verified on the copy: with an
   Obsidian vault present at `vault/`, `npx eslint .` fails on
   `vault/.obsidian/plugins/<plugin>/main.js` (every Obsidian community plugin ships a bundled
   `main.js`) with a parsing error that **prints the vault path in the gate output** — output that gets
   quoted into this DEVLOG, which the standing constraint says may become public. The format gate is
   safe here only by luck of a Prettier 3 default (it honours `.gitignore`); the lint gate has no such
   protection. Blocks 1.5 and 1.7 are individually correct; their sum is not.

**Suggested remediation shape** (one fix block, no new `N.M`, nothing to tick)

1. Bring the non-`src` trees under a type-check. `tsconfig.eslint.json` already describes exactly the
   right set (`src`, `test`, root `*.ts`/`*.js`) and already sets `noEmit`, so the smallest fix that
   changes no gate command and needs no Makefile edit is
   `"build": "tsc --build && tsc -p tsconfig.eslint.json"` — verified on the copy: exit 0 on the tree
   as it stands, exit 2 on the `greet(42)` case above. A solution-style `tsconfig.json` with project
   references is the tidier long-form alternative; either is fine, provided `make build` goes red on a
   type error in `test/`. If it goes this way, the file is no longer eslint-only and
   `tsconfig.check.json` would name it honestly.
2. Add `vault/**` and `.vault/**` to the `ignores` entry in `eslint.config.js`, and to
   `.prettierignore` as well — belt and braces, since Prettier's `.gitignore` behaviour is a default
   rather than a guarantee and a vault checked out under any other name reopens the same door.
3. Demonstrate the negative case for the new type-check the way 1.4 and 1.5 demonstrated theirs — a
   deliberate type error in `test/` making `make build` non-zero, then reverted, quoted in the DEVLOG.
   That demonstration is the part that proves the gate covers what it claims to.

**Checks that came back clean** — recorded so they are not re-litigated:

- _ESM/NodeNext is real, not just type-clean._ Built and **ran** a throwaway `src/` module importing
  all seven runtime dependencies plus a relative `./helper.js` specifier: `tsc --build` exit 0,
  `node dist/smoke.js` exit 0, GFM table serialised, frontmatter consumed, `yaml` parsed, top-level
  await accepted. Also verified vitest resolves a NodeNext-style `../src/mod.js` specifier to the
  `.ts` source — the classic friction point for §3/§4 tests — with no config workaround. Section 3 can
  be built on this as it stands.
- _Dependency constraint holds._ `dependencies` is exactly the seven from `design.md § 2`, no eighth;
  `package-lock.json` root `dependencies`/`devDependencies` key sets and version specs match
  `package.json` exactly, `lockfileVersion` 3, `engines` mirrored into the lock. Seven dev
  dependencies, each earning its place (no bundler, no CLI framework, no test-runner plugins) — that
  is proportionate for this stack.
- _Publishability of the reformat._ Compared every file the `prettier --write` pass touched against
  `c756850` after normalising whitespace and emphasis markers: the three ADRs, `proposal.md` and all
  five spec files are byte-identical once `*em*`→`_em_` and re-wrapping are removed. `design.md`'s
  only changes are the same emphasis normalisation plus the §6 gate table being column-aligned — no
  requirement, scenario or decision text altered. `tasks.md`'s only changes are the §1 tick boxes.
  Scanning every added line for hostnames turns up `workers.dev` and nothing else; no real note title,
  client name, or published hostname anywhere in the section.
- _Format gate coverage._ With the final `.prettierignore` (`.claude/`, `CLAUDE.md`, and generated
  output only), `npx prettier --list-different .` exits 0 with `openspec/` and `docs/` genuinely
  examined — the mid-block hole is properly closed, not relocated.
- _Scaffolding._ `src/index.ts` and `test/scaffold.test.ts` are both load-bearing enough to keep.
  The `TS18003` placeholder is three lines and a comment and constrains nothing about the source
  layout. The seven-name dependency assertion is better read as a tripwire on a binding design
  constraint than as a test that will need rewriting: the day someone proposes an eighth dependency,
  that failing test _is_ the Architect gate. It should outlive the scaffold, not be deleted with it.

**Architectural notes for `## NEXT`** (not part of the fix block):

- `package.json` declares no `bin`, `main` or `exports`. ADR-0003's composite Action has to invoke a
  CLI entry point, so §5/§6 will need one — the natural move is for `src/index.ts` to _become_ that
  entry rather than for the placeholder to linger beside it.
- `tsconfig.eslint.json`'s `include` is a closed list. A future top-level source directory outside
  `src`/`test` fails loudly with a "not found in any of the provided project(s)" parse error rather
  than being silently unlinted — the right failure mode, but the Architect should expect to update
  that `include` when adding one.
- `design.md § 6` records the validate gate as `openspec validate --all --strict --no-interactive`
  while the Makefile loops per active change. Pre-existing, Architect-owned, behaviourally sound (the
  loop additionally fails on zero changes); worth reconciling the design table with the Makefile at
  some point so the two do not drift further.

→ @architect

**[worker]** Remediation block for §1 supervisor findings (blockers 1 and 2, `c756850..b6a2655`).

Blocker 1 — no gate type-checked outside `src/`:

- `package.json`'s `build` script is now `tsc --build && tsc -p tsconfig.check.json` — the second
  invocation is `noEmit`, covers `src`, `test`, and root `*.ts`/`*.js` (the file the supervisor named
  as already describing the right set), so `make build` now fails on a type error anywhere eslint's
  type-aware scope reaches, not just `src/`.
- `tsconfig.eslint.json` → `tsconfig.check.json` (it now serves both the build and lint gates, so the
  eslint-only name was wrong). Updated the one reference in `eslint.config.js`
  (`parserOptions.project`). Left the file's `include`/`compilerOptions` unchanged — the supervisor
  confirmed the set was already correct.
- **Negative-case evidence**: added a throwaway `test/typehole.test.ts` calling
  `greet(42)` against a `function greet(name: string): string`. `make build` →
  `BUILD_EXIT:2` (`error TS2345: Argument of type 'number' is not assignable to parameter of type
'string'`, reported against `test/typehole.test.ts`). Deleted the file; `make build` back to
  `BUILD_EXIT:0`.

Blocker 2 — lint gate walking a local vault checkout:

- `eslint.config.js`'s `ignores` now includes `vault/**` and `.vault/**` alongside `dist/**`.
- `.prettierignore` gained the same two entries (belt-and-braces per the supervisor's suggested
  shape, since Prettier's `.gitignore` honouring is a default, not a guarantee).
- **Negative-case evidence**: created `vault/.obsidian/plugins/example/main.js` (invented plugin
  name, not from the real vault) containing deliberately invalid/unformatted JS — an unused `var`
  and an unclosed brace, the shape that would previously break eslint's parser and fail prettier.
  With the vault present: `make lint` → `LINT_EXIT:0`, `make format` → `FORMAT_EXIT:0`. Deleted
  `vault/` afterward; `git status --porcelain` shows no trace of it.

Full gate run after both fixes, vault checkout absent (steady state):
`BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0` `VALIDATE_EXIT:0` — `make gates` →
`GATES_EXIT:0`.

No task numbers ticked (remediation block, per CLAUDE.md §3c) — every §1 box was already `[x]`.

→ @reviewer

## 2. Access control, before any content exists

**[architect]** Base: 39cd19d — this section delivers the confidentiality guarantee itself, proven
against a placeholder page before any vault content exists. Every task in it is human-in-the-loop
Cloudflare configuration that no automated gate can settle, so per CLAUDE.md §4 this section is
handed to the Product Owner as a runbook and **nothing is ticked without their confirmation**.

**[architect]** Retrieval note: the steps below were taken from current Cloudflare documentation via
the `cloudflare` and `cloudflare-one` skills on 2026-08-25, not from recalled product knowledge.
Dashboard navigation and policy field names change; re-retrieve rather than trusting this post if it
is being read long after that date.

### ❗ Two findings from the docs that affect this section's specification

**Finding 1 — task 2.2 as written is not sufficient, and the gap is the project's stated
highest-consequence failure mode.** Task 2.2 says to disable the `workers.dev` route and verify it
serves nothing. Cloudflare's documentation carries this caution:

> If you disable your `workers.dev` route in the Cloudflare dashboard but do not update your
> Worker's Wrangler file with `workers_dev = false`, the `workers.dev` route will be re-enabled the
> next time you deploy your Worker with Wrangler.

The dashboard toggle is therefore not durable. Section 2 disables the route; section 7 adds the
`wrangler` configuration (7.3) and the deploying workflow (7.4). If `workers_dev = false` is not in
that configuration, **the first `wrangler deploy` silently re-enables a hostname serving the entire
confidential site unauthenticated** — and it is Cloudflare's domain, so it cannot carry an Access
policy. Task 8.3 would eventually catch it, but the window between 7.4 and 8.3 is a live exposure.
design.md calls this "the single highest-consequence failure mode in the project"; the task
breakdown currently addresses only half of it.

**Finding 2 — preview URLs are a second bypass hostname, and no task covers them.** The same
documentation notes that Preview URLs default to matching the `workers_dev` setting _unless
explicitly configured_, and that if they were explicitly enabled they must be disabled separately.
A preview URL is a `workers.dev` address and equally cannot carry an Access policy. Neither
`tasks.md` nor `design.md` mentions preview URLs anywhere. The `reader-access` spec requirement
"Published content has no unauthenticated route" plainly covers them; the tasks implementing it do
not.

Both are recorded here for the Product Owner's decision (see the handover below). The runbook that
follows covers both regardless, so following it is safe whichever way the specification question is
settled.

### Runbook for 2.1–2.6 — the Product Owner executes; the Architect ticks nothing until confirmed

Terminology: `<SITE_HOST>` is the published hostname, a deployment parameter deliberately not
recorded in this repository. `<WORKER_NAME>` is the Worker's name. `<READER_EMAILS>` is the reader
allow-list.

**2.1 — Create the Worker and attach the custom domain.**
Dashboard → **Workers & Pages** → **Create** → create a Worker named `<WORKER_NAME>` (the default
"Hello World" template is fine; real content comes later). Then **Settings** → **Domains & Routes**
→ **Add** → **Custom domain** → `<SITE_HOST>`. The domain must be an active zone on this Cloudflare
account.
_Verify:_ `curl -sI https://<SITE_HOST>` returns 200 and is served by the Worker. DNS may take a
minute.

**2.2 — Disable the `workers.dev` route. This is the highest-consequence step in the project.**
Same page: **Settings** → **Domains & Routes** → on the `workers.dev` entry select **Disable**, and
confirm. While there, check **Settings** → whether **Preview URLs** are explicitly enabled; if they
are, disable them too (Finding 2).
_Verify:_ `curl -sI https://<WORKER_NAME>.<YOUR_SUBDOMAIN>.workers.dev` — it must **not** serve the
site. Test it in a browser too, and note the exact address you tested; 8.3 re-runs this check once
real content exists.
_Carry forward to 7.3:_ the `wrangler.jsonc` written in section 7 **must** contain
`"workers_dev": false`, or this step is undone by the first deploy (Finding 1).

**2.3 — Create the Access application, scoped to the apex.**
Dashboard → **Zero Trust** → **Access controls** → **Applications** → **Create new application** →
**Self-hosted and private** → **Add public hostname**. In the **Domain** dropdown select
`<SITE_HOST>` and **leave the path empty** — an empty path covers every path on the hostname, which
is what the task means by "scoped to the apex". Do not enter a subpath.
_Verify:_ after 2.5 is in place, request a nested path such as
`https://<SITE_HOST>/some/nested/page` unauthenticated and confirm it is intercepted by the Access
login page rather than served.

**2.4 — One-time PIN login method, and the email allow-list policy.**
OTP is no longer added automatically for new Zero Trust organizations, so add it explicitly:
**Zero Trust** → **Settings** → **Authentication** → **Login methods** → add **One-time PIN**.
Then on the application, under **Access policies**, create a policy:

| Action | Rule type | Selector | Value             |
| ------ | --------- | -------- | ----------------- |
| Allow  | Include   | Emails   | `<READER_EMAILS>` |

Use the **Emails** selector with the addresses listed individually — not **Emails ending in**, which
would admit an entire domain. Access applications are deny-by-default, so this policy is the only
thing granting entry.
_Verify:_ re-open the policy and read back the address list; it must contain exactly the intended
addresses and nothing else. This is task 2.4's actual acceptance criterion.

**2.5 — Deploy a placeholder and prove the three cases.** Any trivial `index.html` will do — it
must contain **no vault content**.

1. _Unauthenticated:_ open `https://<SITE_HOST>` in a private window → the Access login page, not
   the placeholder.
2. _Allow-listed:_ enter an allow-listed address → a six-digit code arrives (expires after 10
   minutes) → entering it grants access.
3. _Not allow-listed:_ enter a non-allow-listed address → **no email is sent**, and the login page
   still says "A code has been emailed to you". That wording is deliberate — it stops the login page
   disclosing who the readers are. Confirm at the _inbox_, not the page, that nothing arrived, then
   confirm the code path refuses.

_If a reader sees "This One-Time PIN has already been used"_ their mail scanner consumed the code
first; **Request new code** and consider allow-listing `noreply@notify.cloudflare.com` in mail
filtering. design.md anticipates this.

**2.6 — Prove a static asset is equally refused.** Put an image next to the placeholder, deploy, and
request it directly by its address unauthenticated — `curl -sI https://<SITE_HOST>/<image>` — it must
be refused exactly as a page is. Access gates the whole hostname at the edge, so this should pass by
construction; the point of the task is to have proven it rather than assumed it, since an asset
served unauthenticated would leak images from confidential notes.

**[architect]** Correction to the 2.1 runbook step — the Cloudflare create-Worker UI changed again
(observed 2026-08-25). The screen is now titled **Ship something new** and offers: Continue with
GitHub, Connect GitLab, Start with Hello World!, Select a template, Upload your static files.

- **Use "Upload your static files"**, not the "Hello World" the original post named. It creates an
  assets-only Worker with no script, which is the shape ADR-0003 specifies and that 7.3 deploys;
  "Hello World" creates a Worker script that section 7 would then have to replace. It also carries
  2.5's placeholder in the same step — any trivial `index.html`, no vault content.
- **Do not use "Continue with GitHub"** despite its prominence. It wires a git integration and
  Cloudflare-side CI builds, which is not this project's topology: deploys come from the vault
  repository's own workflow via `wrangler`. Connecting a repository here creates a second, competing
  publish path.
- The custom-domain half of 2.1 is unchanged, re-confirmed against current docs: the Worker →
  **Settings** → **Domains & Routes** → **Add** → **Custom Domain**. Cloudflare creates the DNS
  record.
- **Expected, not a fault:** a newly created Worker comes up with its `workers.dev` subdomain
  enabled. 2.2 is the step that removes it. This is precisely why design.md orders this section
  before any content exists — there is a window in which the Worker is publicly reachable, and
  nothing but a placeholder may be on it while that is true.

This is the second UI change to hit this runbook. Treat the dashboard navigation in these posts as
perishable and re-retrieve; the verification commands and the properties being verified are the
durable part.

**[architect]** Operational finding from 2.3–2.5 verification — **first OTP login can fail silently
for several minutes after the Access policy is created, then start working with no configuration
change.** Recording it because 8.4 has each reader completing a first login, and this failure mode
is indistinguishable from a misconfiguration while you are in it.

Observed: with the Access application created, the one-time PIN provider present as the only login
method, and an `Include → Emails` policy listing the reader addresses, a login attempt from a
listed address produced the code entry screen but **no email, no authentication log entry, and
"expired" in response to any code typed**. Adding a second address to the policy produced an
immediate, working code for that address; the originally-listed address then also began working,
in a different browser, with no further change.

Why it is hard to diagnose: every layer is deliberately silent. The login page says "a code has been
emailed to you" whether or not one was sent, because it must not disclose the allow-list. Access
logs an authentication attempt only once a code is evaluated against identity, so a submission
rejected as expired leaves **no** log row — an empty log therefore does not mean "nothing reached
authentication", which is how it was misread at the time. The result is that a propagation delay, a
per-address OTP rate-limit from repeated "Resend" clicks, and a genuinely wrong allow-list all
present identically.

Cause not established. Candidates, none excluded: policy propagation lag; OTP rate-limiting after
repeated resends; stale browser session state. The policy edit, the passage of time and the browser
change all coincided.

**For 8.4 — brief the readers before they try.** A first login that produces no email is expected to
resolve on its own: wait a few minutes, then request **one** code rather than clicking Resend
repeatedly, since repeated requests both invalidate the previous code and may trigger the
rate-limit. Only escalate if a second address also receives nothing, which is the check that
distinguishes a Cloudflare-side problem from a mail-side one.

**Separately, a genuine mail-side risk worth pre-empting:** one reader's address silently filed the
codes rather than delivering them, having received mail from the same sender previously. An
accidental "report spam" on an earlier message is enough to cause it permanently. Readers should
allow-list `noreply@notify.cloudflare.com` — design.md already anticipates this under the
link-scanning risk; this is the same mitigation for a different cause. A listed address that cannot
receive is worse than an absent one, because it looks configured.

**[architect]** Verification results for 2.1, 2.3, 2.5, 2.6 — **ticked**. Evidence, from the Product
Owner running each check against the live deployment:

- **2.1** — custom domain attached on the account's own zone and serving the Worker; confirmed both
  by request and in the Worker's Domains tab.
- **2.3** — Access application created on the hostname with an empty path, so every path is covered.
  A request to a nested path while unauthenticated returned **302 to the login page**, which is the
  interception the task asks for — not merely a 404 that would prove nothing.
- **2.5** — all three cases proven. Unauthenticated request refused; an allow-listed address received
  a code and gained access; an address **not** on the policy received no email while the page still
  reported one as sent. That last part is the designed non-disclosure, not a fault.
- **2.6** — a static asset requested directly by its address while unauthenticated returned **302**,
  refused exactly as a page is. Worth having proven rather than assumed: an asset served
  unauthenticated would leak images out of confidential notes.

**On 2.2 — the check was initially reported on weak evidence, and this is worth recording as a
pattern rather than an anecdote.** The first result was "404 on the `workers.dev` address", which
reads like a pass but is also exactly what a **mistyped** hostname returns. Since a typo'd address
and a disabled route are indistinguishable by status code, a 404 alone cannot establish the
project's highest-consequence property. What actually settled it:

- the response was `content-type: text/plain`, 17 bytes, from Cloudflare's edge (`server:
cloudflare`, `cf-ray` present) — **not** the placeholder HTML a live route would have served; and
- the dashboard independently confirmed the exact address, so the 404 was known to have come from
  the right place.

The lesson generalises to the rest of this section and to 8.2–8.3: **a refusal is only evidence if
you know it came from the address you meant to test.** Confirm the address independently of the
response. The same trap caught an identifier-leak check in this very session — a `grep` over
`openspec/` and `docs/` reported clean while running in the wrong directory, so it had searched
nothing. Green over unexamined territory, for the fourth time in this change.

**Also on 2.2 — the Preview URL was found already disabled**, alongside the production
`workers.dev` route. That is the second bypass hostname added to this task by the specification
amendment earlier in this section, and it was covered without needing a return trip.

**Carry to 7.3, load-bearing:** both of those are **dashboard state**. Cloudflare's documentation is
explicit that a `wrangler deploy` without `workers_dev: false` in the configuration re-enables the
route. The amended 7.3 requires the flag and re-verifies afterwards; this is the specific mechanism
by which a verified-green 2.2 turns red silently.

**[architect]** 2.2 and 2.4 verified and **ticked** — section 2 is fully implemented.

- **2.2** — the preview wildcard was requested directly with a version prefix and returned the same
  404 as the production `workers.dev` address. Both bypass hostnames are therefore confirmed by
  request, not merely by their dashboard toggles, which is what the amended task asks for.
- **2.4** — the one-time PIN provider is the account's only login method, and the policy was edited
  down to exactly the three intended reader addresses and read back to confirm it. One address was
  deliberately changed during verification: the originally-listed address was silently filing the
  login codes rather than delivering them, and was replaced with one proven to receive.

That substitution is the one thing here that is a decision rather than a check. **An allow-listed
address that cannot receive its code is a worse failure than an absent one, because it looks
configured** — the policy reads correct, the login page reports a code as sent, and the reader is
simply stuck. Removing the address does not fix the underlying mail behaviour; it only removes it
from the path. If it is ever restored, or if a reader's provider behaves the same way, the symptom
will be identical to the one that consumed an hour of this section: no code, no log row, and
"expired" for anything typed.

Section 2 delivered what it was ordered first to deliver: the guarantee is proven — against a
placeholder, by request, on every path type — **before** any vault content exists. Sections 3 onward
now build the content pipeline behind a gate already known to hold.

**[supervisor]** Section review of `39cd19d..HEAD` (6 commits, 3 files, no code). **Request changes.**

Scope note on method: this section has no diff to read for drift, so the audit went requirement by
requirement through `specs/reader-access/spec.md` and asked, of each scenario, _what recorded
observation would be false if this scenario did not hold_. Four of the fourteen scenarios have no
such observation. Two of those are in a gap no task in any section closes.

Taking the section's own recurring lesson seriously, the checks below were run with the working
directory echoed, the tracked-file count printed (45), and the scanned byte count printed, so a clean
result is known to have come from the territory intended.

**What the section did establish, and establish well.** 2.3's nested-path 302, 2.6's asset 302 and
2.5's three cases are real evidence for the whole of "No unauthenticated access to published
content" — the first three scenarios of it outright, and they close a hazard 2.4's readback did not:
a second Access policy granting broadly (a leftover Bypass or an allow-everyone rule) would have
been visible as a served placeholder in 2.5 case 1. Deny-by-default is therefore observed, not just
asserted. The "Adding a reader" scenario of the allow-list requirement is also proven, incidentally
but genuinely, by the mid-section policy edits: an address added to the policy authenticated with no
commit to either repository and no republish. And the 2.2 escalation from "404" to "404 that is
`text/plain`, 17 bytes, from `server: cloudflare`, at an address confirmed independently in the
dashboard" is the right standard; the findings below hold the rest of the section to it.

---

### Blockers

**B1 — `reader-access` scenario "Credential is reused or has expired" is not established, and no
task in sections 2, 7 or 8 exercises it.** The requirement says the credential SHALL expire and that
a used or expired credential SHALL NOT grant access. The only observations in this section are
incidental and come from a malfunctioning state: the silent-first-login post records `"expired"` in
response to any code typed _when no code had been issued at all_, which is evidence about a failure
mode, not about credential lifetime. The 10-minute expiry is quoted from documentation. The
mail-scanner "This One-Time PIN has already been used" wording is anticipated in the runbook and in
`design.md`, but never observed. Every other property in this section was proven by request rather
than by reading Cloudflare's docs, and this one should be held to the same bar — it is a two-minute
check while a placeholder is the only thing deployed.

**B2 — `reader-access` scenario "Removing a reader" is not established, and the hazard it names is
untouched.** 2.5 case 3 tested an address that was _never_ on the policy. That is the
"Address not on the allow-list" scenario, not the removal one, and the two differ in exactly the way
that matters: a removed reader may hold a live Access session. Nothing in the section records the
Access application's **session duration**, and no task in 2, 7 or 8 mentions revocation or session
lifetime. This section did in fact remove an address (2.4, the substitution) and did not check what
that address can now do. The spec's wording ("can no longer obtain access") arguably concerns new
authentications only, but "arguably" is not the standard this section set for itself, and an
unbounded session duration would make removal effectively inoperative for the length of that
session.

**B3 — 2.2 and the amended 8.3 have no positive control, and the window to obtain one closes at
section 7.** The section's own lesson is that a 404 is only evidence if you know it came from the
address you meant to test. The dashboard cross-check establishes the address; it does not establish
that _that address would have served the site had the route been live_. The runbook's own correction
post states a new Worker comes up with `workers.dev` enabled — so the placeholder was, for a window,
reachable there, and a `curl` in that window would have made the subsequent 404 conclusive rather
than merely consistent. That control was not taken. It is weaker still for the Preview URL: the
preview wildcard was "found already disabled" and was then tested with a version prefix, and a
non-existent version prefix returns 404 whether previews are enabled or not — so the preview half of
2.2 rests on the dashboard toggle alone, which is precisely what the amended task said was
insufficient. This is recoverable **now and only now**: nothing but a placeholder is deployed, so
re-enabling `workers.dev` briefly, observing the placeholder served, and disabling it again is a
safe, decisive control. After 8.1 it is a deliberate exposure of confidential content and can never
be run again.

**B4 — the 7.3 amendment closes the 7.3 window and leaves the 7.4 one open, which is the window that
matters.** Finding 1 correctly identified that a `wrangler deploy` without `workers_dev: false`
re-enables the route. The amendment requires the flag before the first deploy and a re-request after
it. But 7.4 introduces a _second_ deploy path — the vault repository's `publish.yml`, running
`wrangler` unattended on every push to `main` — and 7.4 carries no bypass-hostname re-check. The
next check after it is 8.3. The amended 7.3 therefore narrows the exposure window by one task and
does not close it, and after 8.3 the workflow keeps deploying with no check at all. Compounding it,
7.3 does not say **which repository's** `wrangler` configuration must carry the flag. ADR-0003 puts
the deploy in the vault repository; 7.3 verifies a configuration used to upload "a fixture site".
If those are two different files, the flag is verified on one and the deploy runs with the other,
and the amendment closes nothing.

**B5 — Preview URLs were folded into the verification tasks but not into the durability
requirement.** 2.2 and 8.3 both name previews; **7.3 names only `workers_dev: false`**. That is the
exact asymmetry Finding 1 established to be dangerous — a hostname proven disabled by dashboard state
with no configuration flag holding it there. `preview_urls` follows `workers_dev` _unless explicitly
configured_, so a configuration that sets `preview_urls: true` (or a future `wrangler` default
change) re-opens it, and 7.3 as written would still pass. This is the concrete cost of folding
previews into the existing tasks rather than giving them their own: the verification half was
inherited automatically, the configuration half was not.

### Suggested remediation shape

One block, no new `N.M` numbers, nothing ticked. It is part evidence-gathering by the Product Owner
and part task amendment:

1. **Two live checks while the placeholder is still the only content** (B1, B2, B3), recorded in this
   thread with the same evidence standard 2.2 ended up using:
   - request a code, use it, then present the same code again → refused; request a fresh code →
     works. Record the application's configured **session duration** while in the policy screen.
   - remove an address from the policy, then attempt a login from it in a clean browser session →
     refused. Restore it after.
   - re-enable `workers.dev`, `curl` it and observe the **placeholder HTML** served, disable it,
     `curl` again and observe the 17-byte `text/plain` 404. Do the same for Preview URLs if that is
     possible without a deploy; if it is not, say so and record that the preview evidence is
     dashboard state plus one 404, so 8.3 knows what it is re-verifying.
2. **Amend 7.3** to name the repository whose `wrangler` configuration is being verified, and to
   require that the configuration does not set `preview_urls: true` alongside `workers_dev: false`.
3. **Amend 7.4** to carry its own bypass-hostname re-check after the first workflow-driven deploy,
   rather than deferring to 8.3.
4. **Add a task under 7.4** making the check durable: the vault repository's `publish.yml` requests
   the `workers.dev` address after `wrangler deploy` and fails the job unless it gets the refusal.
   Rationale under "Durability" below. This is the item that also closes B4 permanently rather than
   for one more section.

### Durability — the answer to "nothing here can detect it changing"

Everything section 2 proved is dashboard state on a third party, and this repository cannot see it.
That is acceptable for the properties whose control is a file (`workers_dev: false` in 7.3 makes the
route durable by configuration, which is the right shape) and **not** acceptable for the rest, which
currently degrade to a memory of a check run once in August. ADR-0001 rules out custom auth code and
`design.md` Decision 4 rules out a datastore, so a monitoring service is correctly out of scope — but
a monitor is not what is needed. The publish workflow already runs on every push to `main` and
already holds the deployment parameters; one `curl` and one exit code in it converts the project's
highest-consequence property from something verified twice into something that cannot silently stop
being true. It belongs in section 7 with 7.4, not in section 2, and not in section 8 where it would
run once.

### Notes for `## NEXT` (not blockers)

- **8.4 confirms readers "reach the site", which is weaker than the scenario it serves.** The
  "Authenticated reader" scenario says a reader may read _every_ published page with no per-reader
  restriction. Empty-path scoping makes that true by construction and 2.3 is good supporting
  evidence, but 8.4 is the only place a real reader is observed, and reaching the front page is not
  the same observation. Worth having each reader open one nested page.
- **The silent-first-login post is the most valuable thing in this section** and its diagnostic
  reasoning — an empty Access log does _not_ mean nothing reached authentication — should survive
  into the archive rather than being read only by whoever runs 8.4.
- Treat the dashboard navigation in the runbook as expired by section 7 rather than merely
  perishable; it changed twice inside one section.

### Publishability — verified independently, clean

Method, stated so it can be checked: `git log --format='%an <%ae>%n%s%n%b'` for the range concatenated
with the full `git diff 39cd19d..HEAD` (32,880 bytes) and scanned for address-shaped and
hostname-shaped tokens; then a second, wider pass over **all 45 tracked files** via `git ls-files -z`
so the result does not depend on the working directory. Both passes ran with `pwd` echoed.

- Email-shaped tokens across the whole diff and every tracked file: `noreply@anthropic.com`,
  `noreply@notify.cloudflare.com`. **None of the three reader addresses appears anywhere**, in
  content or in commit messages.
- No concrete hostname: no `*.workers.dev`, no `*.cloudflareaccess.com`, no team domain, no site
  host. Every occurrence is a `<PLACEHOLDER>`.
- No Worker name. `emmz-makes-stuff` occurs 7 times and is the publisher's own org, as the Product
  Owner found.
- No build artifacts: no `.html`, no images, no `wrangler` file tracked; working tree clean.
- One thing the Product Owner should be aware of rather than fix: the Product Owner's personal address `[redacted — see architect note below]` is the author
  and committer identity on every commit in this range, and on the two before it. It is the owner's
  own address, not a reader's, and it is not vault content — but it is in the git history and would
  become public with the repository. That is a decision for §"Whether the publisher repository is
  actually made public", not a finding against this section.

---

Verdict: **Request changes** — B1–B5. The section's execution was careful and its two mid-section
findings were genuinely good architectural catches; what it did not do is hold the four scenarios
outside its own task list to the standard it invented for 2.2, and the amendments it made to protect
`workers_dev` did not extend to the deploy that will actually run repeatedly (7.4) or to the second
hostname it added (previews, in 7.3). Three of the five are cheap live checks that are safe today and
impossible after 8.1.

**[architect]** Remediation for the supervisor's section-2 findings. Product Owner's calls: run the
B3 positive control now, and add the durability check as a new task.

**Spec amendments made (mine):**

- **7.3** — now also requires that `preview_urls` is not enabled, not merely `workers_dev: false`.
  B5 was right that this was the same asymmetry Finding 1 proved dangerous: previews follow
  `workers_dev` _only unless explicitly configured_, so a config enabling them satisfies the flag
  and re-opens the second hostname. It also now says the flags apply to **every** wrangler config
  that deploys this Worker, closing B4's "which repository's config?" gap.
- **7.4** — records that the workflow's deploy is a second, unattended path running on every push,
  and points at 7.8 rather than relying on 7.3's one-time check.
- **7.8 (new)** — the vault's publish workflow requests the bypass addresses after every
  `wrangler deploy` and **fails the job** unless both refuse. It must be verified by pointing the
  check at an address that _does_ serve and confirming the job fails: a check that cannot fail
  proves nothing, which is the same standard B3 correctly applied to 2.2.

I included the 7.3/7.4 clarifications alongside the new task the Product Owner selected, rather than
treating them as separate scope, because 7.8 cannot do its job without them — it needs to know which
configuration it is guarding and whether previews are in scope.

**Why 7.8 matters beyond this change.** Everything section 2 proved is dashboard state on a
third-party service. Nothing in this repository can observe it changing; `make gates` stays green if
the route is re-enabled next month. ADR-0001 and Decision 4 correctly refuse a monitor and a
datastore — but a monitor is not what this needs. The workflow already runs on every push and
already holds the deployment parameters, so the check costs one request and converts a one-time
verification into a standing gate. **This is the only part of `reader-access` that keeps holding
after the change ships.**

**Still open — three live checks handed to the Product Owner (B1, B2, B3).** These need real
requests against the live deployment and cannot be settled here. B3 is time-critical: it is safe
only while the placeholder is the sole content, and becomes a deliberate exposure of confidential
material once 8.1 deploys the real set.

**[architect]** Redaction note, and a real question for the Product Owner.

The supervisor's publishability finding above named the Product Owner's personal email address in
full, in the course of reporting that no reader address appears anywhere in the repository. It has
been **redacted in place** — the DEVLOG's append-only rule exists to preserve the record of how a
decision was reached, not to preserve an identifier that the standing constraint says must not be
here. Everything else in that post stands unaltered.

Worth naming the pattern, because it is now the fifth instance in this change of a check reporting
clean over something it had not examined — and the first where the _check itself_ introduced what it
was looking for. The others: a `.prettierignore` hiding files from the format gate; no gate
type-checking outside `src/`; a 404 indistinguishable from a mistyped hostname; a `grep` reporting
clean from the wrong directory.

**The substantive point the supervisor raised is real and is not a section-2 finding.** That address
is the git author and committer identity on every commit in this repository. If the repository is
made public — the standing open question in `design.md` — the address goes public with it, and no
amount of care about file contents changes that, because it lives in commit metadata rather than in
any file. It is the Product Owner's own address rather than a client's or a reader's, so this is a
preference, not a confidentiality breach. But it is a decision to take deliberately before the
repository is published, not to discover afterwards, since rewriting authorship across a project's
whole history is far more disruptive than setting it now.

**[architect]** **B3 closed.** The Product Owner ran the positive control on both bypass hostnames
while the placeholder was still the only content: each was toggled on, confirmed to **serve the
placeholder**, toggled off, and confirmed to return the 404. Both the production `workers.dev`
address and the preview address were done this way.

This is now the strongest evidence in the section, and the difference from what 2.2 originally rested
on is the whole point of the finding: a 404 alone is consistent with a mistyped hostname, a route
that never existed, or a route correctly disabled. Having watched the _same_ address serve and then
stop serving, the refusal is evidence about that address rather than about the request. The preview
half in particular was previously resting on a dashboard toggle plus a 404 from a made-up version
prefix, which 404s whether or not the wildcard is live — so it had not been tested at all.

Worth stating as a rule for 8.2–8.3, which re-run these checks against real content: **that
re-verification cannot use this method.** Toggling a bypass hostname on once the real set is
deployed exposes confidential material, deliberately, for as long as the toggle is on. The positive
control was available exactly once, in this window, which is why it was worth spending it here.
After 8.1 the only safe evidence is the negative check plus 7.8's automated post-deploy check — and
7.8 is verified by pointing it at an address that _does_ serve, which is how the positive control
survives as a repeatable test without ever exposing the site.

**[architect]** **B2 resolved as a specification defect, not an implementation one** — and it is the
most consequential finding of this section, because it is the one where the system quietly did
something other than what the spec promised.

The application's session duration is **24 hours**. Current Cloudflare documentation confirms the
mechanism: the application token is valid for that duration, and identity is only re-checked against
the policies **when the token expires**. So removing an address from the policy stops that person
starting a _new_ session immediately, but a session already in progress continues for up to a day.

The spec said, flatly, that a removed reader "can no longer obtain access". That is defensible as a
lawyer's reading — a live session is access already obtained — but it is not what an owner removing
someone under pressure would understand it to mean, and the gap between those two readings is a day
of continued access to client-confidential material. **The spec was wrong, so the spec was fixed
rather than the wording defended.** The removal scenario now states what removal actually does, and a
second scenario states explicitly that an existing session persists and must be revoked to withdraw
access immediately.

Remedy confirmed in the docs, two controls: **Applications → Configure → Revoke existing tokens**
(all sessions for the application), and **Team & Resources → Users → Action → Revoke** (per user,
across applications). Because the address has also been removed from the policy, the caveat that a
revoked user may start a new session does not apply here — the two steps compose correctly.

Product Owner's decision: **keep the 24-hour session and make removal a documented two-step
operation.** The alternative — shortening the session so removal takes effect on its own — was
rejected on the evidence this section produced: every re-authentication is another one-time-PIN round
trip through the email path that failed silently for an hour today, and two of the three readers are
non-technical. Trading a rare, deliberate operation against frequent friction on the common path is
the wrong trade.

Three tasks added, none ticked:

- **2.7** — record the session duration and prove the two-step removal end to end: sign in, remove
  from the policy, confirm the session persists, revoke, confirm access is withdrawn.
- **2.8** — B1: prove credential reuse and expiry are refused. Currently the expiry is quoted from
  documentation rather than observed, and the only reuse evidence came from a malfunctioning state.
- **2.9** — write the removal procedure down where the owner will find it. **Removal is the operation
  most likely to be carried out in a hurry and believed complete when it is not**, and a procedure
  that exists only in a DEVLOG post will not be to hand at that moment.

Section 2 is therefore **not closed**; it now has three unticked tasks and needs a second supervisor
pass once they are verified.

**[architect]** **2.7 verified and ticked**, by an unplanned natural experiment rather than a
constructed test — which makes it better evidence than the test would have been.

An address removed from the policy earlier in this section still held a live session in the browser
where it had signed in. Both halves of the amended scenario were then observed directly:

- **Persistence:** a page that browser had **never fetched** rendered for the removed address. The
  choice of an unvisited path is what makes this evidence — a previously-loaded page can render from
  cache and look identical to live access while access is already gone, so the obvious version of
  this check proves nothing. The request demonstrably reached the origin and was served.
- **Withdrawal:** after a per-user revoke, that same browser no longer had access.

So the behaviour is exactly what the corrected spec now says, and the correction was not theoretical:
an address removed from the allow-list was still being served client-confidential content
some time later, and only stopped when explicitly revoked.

**Session duration recorded: 24 hours** (the application session duration; the policy inherits it).

A draft of **2.9** is written at `docs/runbooks/removing-a-reader.md`, for the Product Owner's
review before ticking. It leads with the failure mode rather than the procedure — removing someone
does not sign them out — because that is the part that is counter-intuitive and the part that costs
something when missed. It specifies the **per-user** revoke rather than the application-level one,
since the latter ends every reader's session and turns a routine removal into an interruption for
people who were not removed. It also carries the confirmation method that this section learned the
hard way: check with a page the browser has not visited, or the cache will tell you what you want to
hear.

**2.8 remains open** — credential reuse and expiry.

**[architect]** **2.8 narrowed and ticked; expiry deferred to a new 8.6.**

**Reuse verified.** A credential that had already been used was presented again **in a different
browser** and refused. The different browser is what makes it evidence: retrying in the original one
could have been refused by client-side state rather than by Access, so the check would have passed
while testing the browser instead of the guarantee.

**Expiry deferred at the Product Owner's request** — it needs an uninterrupted wait longer than the
credential's lifetime, and there is no value in spending that now. Parked as **task 8.6** rather than
as a note in this DEVLOG, which is what was asked for, and the difference is deliberate: a note is
something someone has to remember to re-read, while a task appears in `make validate`'s scope, blocks
the change from being marked done, and sits alongside the other end-to-end human checks in section 8.
**A commitment that only a person's memory enforces is the kind this change has spent all day finding
the failures of.**

It is placed in section 8 rather than left blocking section 2 because expiry is a property of the
access provider, not of the content pipeline: nothing in sections 3–7 can affect it, so holding the
code work behind it would buy nothing. It must still be observed before the change ships — the stated
lifetime is quoted from vendor documentation, and **expiry is the half of the credential guarantee
that nothing has yet exercised**.

With that, section 2 has one task outstanding: **2.9**, the removal runbook, drafted at
`docs/runbooks/removing-a-reader.md` and awaiting the Product Owner's review.

**[architect]** **2.9 approved by the Product Owner and ticked.** All nine tasks in section 2 are
now complete, including the three added during remediation. Handing back to the supervisor for the
second review pass over the full section range.

**[supervisor]** Second pass over `39cd19d..HEAD` (12 commits, 5 files, still no product code).
**Approve.** Nothing remaining is a blocker; the items below are `## NEXT`, and two of them are
marked _before section 8_ rather than _eventually_.

Method, since the standing lesson now has five instances and one of them was mine: every command
below echoed `pwd` and printed the count of what it scanned (46 tracked files; 72,409 bytes of
commit metadata plus messages plus diff). Where a finding is about something _absent_, the check was
run over the whole tracked set via `git ls-files -z`, not over a directory I assumed I was in. This
post names no address.

### The five blockers

**B3 — closed, and closed better than asked.** The positive control was run on both hostnames: each
toggled on, observed serving the placeholder, toggled off, observed 404. That converts the refusal
into evidence about the address rather than about the request. The architect's addendum is the part
worth keeping — that 8.2–8.3 **cannot** re-run this method once real content exists, and that 7.8's
negative control (point the check at an address that does serve) is how the positive control
survives as a repeatable test without ever exposing the site. That is the correct disposition.

**B4/B5 — closed as specification.** 7.3 now forbids enabling `preview_urls`, names that the flags
bind **every** wrangler configuration deploying this Worker, and re-checks both addresses after the
first deploy; 7.4 names itself as the second unattended path; 7.8 makes the check standing and
requires that it be proven capable of failing. One residual, N1 below, in 7.8's wording.

**B1 — reuse closed, expiry deferred; the placement is sound but the stated reason is not.** The
different-browser retry is the right control and for the right reason — the original browser could
have refused from client-side state, passing the check while testing the browser. On the deferral,
see N3.

**B2 — closed, and it is the best work in this section.** A spec that promised more than the system
delivered was corrected rather than defended, and the correction was proven by an experiment whose
design was better than the constructed test would have been: a page the browser had **never
fetched** rules out cache as the source of the pass, which is the failure mode that would have made
the obvious version of this check worthless. An address removed from the allow-list was demonstrably
still being served content, and stopped only on revoke. That is a real gap between the written
guarantee and the live one, found and closed.

### Is the amended `reader-access` spec honest?

Mostly yes, and it is now more honest than it was. Assessed scenario by scenario, asking of each what
recorded observation would be false if it did not hold:

- **"Removing a reader who is currently signed in"** — describes exactly what was observed, including
  the remedy. The `persists until it expires` clause generalises a few observed minutes to a
  configured 24 hours, but the 24 hours was read off the application and the mechanism is documented,
  so the generalisation is declared rather than smuggled. Honest.
- **"Removing a reader"** — the rewritten `cannot start a new session` half is observed. The
  `can no longer authenticate` half is **not**: no fresh login attempt from the removed address is
  recorded anywhere in this section. It is well-supported by 2.5 case 3 and by deny-by-default, but
  those concern an address that was _never_ listed, and this section has already documented
  **policy propagation lag in the other direction** — an added address that could not authenticate
  for minutes after the edit. The symmetric lag on removal is plausible, unobserved, and would look
  exactly like a successful removal. The runbook's confirmation step happens to catch it, which is
  why this is a note and not a finding. See N4.
- **"Login page does not disclose who the readers are"** — the spec says _the response is the same in
  both cases_. What was observed is that the visible message is the same. Timing and any subsequent
  error path were not compared. Over-claim, small, inherent to the wording rather than to the
  verification.
- **"Credential is reused or has expired"** — reuse observed; expiry not (8.6). The clause
  `the person may request a new one` is asserted in 2.8's task text but not narrated in the post; it
  is amply evidenced elsewhere in the section, so this is a narration gap, not an evidence gap.
- Everything under **"No unauthenticated access"** and **"Published content has no unauthenticated
  route"** is now at or above the evidence bar the section set for itself.

No requirement in the spec now claims materially more than the record supports, with expiry as the
one declared, tracked exception.

### `## NEXT` — nothing here blocks section 3

**N1 — 7.8's preview check needs to name _which_ preview address, before 7.8 is implemented.**
Preview URLs are per-version, so a workflow that requests a fixed preview address will 404 forever
regardless of whether previews are enabled — green over territory it never examined, in the one task
written to prevent that. 7.8's negative control proves the _mechanism_ can fail; it does not prove
the _address chosen_ is the live one. `wrangler deploy` prints the version's preview address; the
check should use that, not a literal. One clause in 7.3/7.8, cheap now, invisible later.

**N2 — the revoke performed in 2.7 is a persistent user state, and nothing records undoing it or
whose it was.** Cloudflare's per-user revoke is a flag on the user, not an event; the architect's own
note that _"the caveat that a revoked user may start a new session does not apply here"_ is the
documentation confirming it. 2.7's task text requires restoring the policy afterwards and is ticked,
but no post narrates the restore, and **nothing in this section or the runbook mentions un-revoking
the user.** The record does not distinguish the benign reading (the experiment used the address
already substituted out at 2.4, so there is nothing to undo) from the expensive one (it used one of
the three current readers, who is now silently unable to authenticate). If it is the latter, it
surfaces at **8.4** as no email, no log row, and "expired" for anything typed — the identical
presentation to the failure that cost this section an hour. Checking the Users list for a revoked
flag takes under a minute and should happen **before section 8 opens**, not at 8.4. Correctly, no
address needs to be written down to do it.

**N3 — expiry at 8.6: right mechanism, wrong stated reason, and it inverts this section's own
ordering principle.** Making it a task rather than a note is plainly correct — a task blocks the
change and appears in tooling; a note relies on memory, which is the failure class this change keeps
finding. Two caveats. First, the justification (_"needs an uninterrupted wait"_) is, by the vendor
figure quoted in this very section, about ten minutes; it could have run in the background of any
other 2.x check and can run in the background of any section 3–7 one. Second and more substantive:
every other `reader-access` property was deliberately proven **before** confidential content
existed — that ordering is the whole argument of `design.md`'s Migration Plan and of section 2's
position in the change. Expiry at 8.6 will be first observed against a live site carrying the real
selected set. The residual risk is genuinely small, so this does not warrant reordering the change;
it warrants 8.6 carrying a line saying it **may be discharged early** and inviting whoever is idle
during 3–7 to spend the ten minutes. Also worth one clause: 8.6 should distinguish "refused as
expired" from "refused because already used", or a mis-set-up test passes for the wrong reason.

**N4 — the removal runbook is good and has four holes that matter to someone in a hurry.** Reviewed
as an operational document. What it gets right is unusual: it leads with the counter-intuitive
failure rather than the procedure, it frames the session as 24 hours _from last authentication
rather than from removal_, and its confirmation step names the cache trap. Fixes, in descending
order of how likely they are to bite:

- **Say that the order of the two steps matters, and why.** Revoke feels like the decisive action and
  is what an angry operator will reach for first. Revoking before removing leaves a window in which
  the person — still on the allow-list — authenticates again and takes a fresh 24-hour session,
  silently undoing step two. The doc numbers the steps and never says they are ordered.
- **Add how to undo step two.** The doc creates a persistent revoked state and never mentions
  reversing it, so a removal later reversed (a mistake, a reader returning) leaves someone
  re-added to the policy and still unable to log in — presenting as the section's worst-diagnosed
  failure. This is N2 as a standing hazard rather than a one-off.
- **Give the confirmation step a fallback.** As written it requires a browser holding a live session
  for the removed address, which the person doing the removal usually does not have — the removed
  reader does. Name what you check when you cannot borrow it (the user showing revoked, with no
  active session) and say plainly that this is weaker evidence.
- **Name the one case for the application-level revoke.** Per-user is the right default and the
  reasoning is sound, but _"Revoke per user, not per application"_ reads as a prohibition, and there
  is a case it forecloses: when you do not know **whose** session to end — a forwarded link, an
  address you cannot identify, a suspected compromise. With three readers the bigger hammer costs
  three logins, which against unknown scope is cheap. Keep the default; name the exception.

Two smaller ones: the doc is pure dashboard navigation with no date stamp, in a project that recorded
**two** dashboard UI changes inside one week and told its own readers to treat navigation as
perishable — add _"paths verified DD-MM-YYYY; navigation changes, the two steps do not"_. And its
closing pointer to _"the change's DEVLOG under section 2"_ breaks on archive, when the DEVLOG moves
under `openspec/changes/archive/`; either give the archive path or restate the trade in the runbook,
since the runbook is the artifact that outlives the change.

**N5 — carried, still open: 8.4 confirms readers "reach the site", which is weaker than the scenario
it serves.** No per-reader restriction means _every_ published page; empty-path scoping makes that
true by construction and 2.3 supports it, but 8.4 is the only place a real reader is observed. One
nested page each.

**N6 — cosmetic, worth one clause somewhere before 8.3.** The Access login page lives on a third
hostname (`<team>.cloudflareaccess.com`). It serves no published content and is not a bypass, but
8.3's phrase is now _"every bypass hostname"_, and someone reading it cold in section 8 should not
have to work out whether that one is in scope.

### Publishability — re-verified over the enlarged range, clean

46 tracked files (up one: `docs/runbooks/removing-a-reader.md`); 72,409 bytes of commit metadata,
commit messages and diff scanned; a second pass over the whole tracked set so the result does not
depend on the working directory.

- No reader address, site hostname, Worker name, `workers.dev` address, team domain or client name
  appears anywhere — in file contents, in the new runbook, or in any commit message. The only
  address-shaped tokens in tracked content are `noreply@anthropic.com` and
  `noreply@notify.cloudflare.com`.
- **The redaction of the previous supervisor post is confirmed effective**, and confirmed by the
  right check: no matching token in any tracked file, _and_ none introduced on any added line of the
  DEVLOG anywhere in the range — so the committed history of this section is clean, not merely the
  current worktree. The remaining occurrence is commit author metadata, which is the open question
  the architect correctly separated out. Recording the correction plainly: that post reported the
  reader addresses absent while writing a real address into the file doing the reporting. It is the
  same shape as the other four instances and it was mine.
- The runbook carries no host, address, or URL. One sentence in it states the reader count and
  characterises them; harmless, but it is a fact about real people in a repository that may become
  public, and it reads identically without the count.

Verdict: **Approve.** The section now proves what it claims, its spec says what the system does
rather than what was hoped, and the one property it has not observed is tracked as a task rather than
as a memory. N2 is the item I would act on first and it costs a minute.

**[architect]** Supervisor **Approve** — **section 2 is closed** after two remediation rounds. Its
non-blocking findings are actioned or carried, as follows.

**Actioned now:**

- **The runbook** gained the four things a hurried reader would have needed: that the two steps are
  **ordered** (revoking first leaves a window to re-authenticate and take a fresh 24-hour session,
  silently undoing the revoke); that revocation is a **persistent state** with a way to reverse it,
  and that a lingering revocation presents exactly like a mail-delivery failure; a confirmation path
  for the normal case where you **do not** hold the removed person's browser; and the exception to
  per-user revocation — when you do not know _whose_ session to end, the application-level control is
  correct. It also now carries a date stamp on its click paths and an archive-proof pointer.
- **7.8** must use the preview address the deploy actually produced rather than a fixed literal.
  Preview addresses are per-version, so a hardcoded one 404s forever whether or not previews are
  live — green over exactly the territory the task exists to examine. That would have been the sixth
  instance, inside the task written to prevent the other five.
- **8.6** may now be discharged early. The supervisor was right that the stated reason did not
  survive arithmetic — the wait is about ten minutes — and, more importantly, that deferring it
  inverts this section's own ordering principle: every other `reader-access` property was proven
  before confidential content existed, and expiry would otherwise be first observed against the real
  published set.

**Carried to `## NEXT`, honestly rather than quietly:**

- The rewritten removal scenario's **`can no longer authenticate` half is not observed.** It is
  well-supported by 2.5 case 3 — but that concerns an address that was _never_ listed, and this
  section documented policy propagation lag in the _other_ direction. The symmetric lag on removal is
  plausible, unobserved, and would look identical to success. The runbook's confirmation step happens
  to catch it. **A spec that claims more than was observed is the defect this section already fixed
  once**, so it is recorded rather than left to read as verified.
- The non-disclosure scenario says "the response is the same in both cases"; only the **visible
  message** was compared. Timing was not.

## 3. Configuration and selection

**[architect]** Base: 642719f — this section delivers the code that decides what publishes: the
`publish.config.yaml` schema and loader, selection resolution, and the exclusion floor. **This is the
first code in the change where a bug is a disclosure rather than a defect.** Sections 1 and 2 built
the toolchain and proved the gate; from here the guarantee is ours to hold.

Carved into three blocks on the Product Owner's call, so that the security-critical middle block
gets a review that is not also weighing config parsing or warning plumbing:

- **3.1–3.2** — the config schema, the loader with explicit shape validation, and the fail-closed
  behaviour on a malformed or unreadable config.
- **3.3–3.5** — selection resolution and the exclusion floor. The block that must not be wrong.
- **3.6–3.7** — unmatched configuration entries reported as warnings, and proof that `audience:`
  frontmatter does not affect selection in either direction.

**The standing brief for every block in this section.** Five times across sections 1 and 2 a check
reported green over territory it had never examined — the full list is in `## NEXT`. The section-3
equivalent is an exclusion test that passes because the fixture never contained the excluded path,
because the selection code never ran, or because the assertion could not fail. **Every exclusion and
degradation test must be shown to fail when the protection is removed.** That is the negative control
1.4, 1.5 and B3 all used, and that 7.8 is written to require. A test that cannot fail proves nothing —
and here what it would falsely prove is that confidential notes cannot be published.

**[architect]** Brief — block **3.1–3.2**: the config schema, the loader, and fail-closed on a bad
config. Scope is those two tasks only; selection resolution and the exclusion floor are the next
block and must not be started here.

**Spec** (`specs/note-selection/spec.md`): _Selection is declared in configuration_ — only notes
named, directly or by containing folder, publish; and _Selection failures do not publish more than
intended_ — "**WHEN** the configuration cannot be read or parsed **THEN** the publish fails and no
content is published". `design.md § 2` binds the file to `publish.config.yaml` in the vault root and
the parser to `yaml` (already a dependency); no new dependency is in scope for this block.

**The schema — binding, decided here so the block does not have to invent it:**

```yaml
folders:
  - Handbook
  - Meetings/2026
notes:
  - Index.md
  - Reference/Glossary.md
```

- Top level is a mapping. Both keys are optional; absent means the empty list. A config selecting
  nothing is **valid** and publishes nothing — that is the safe direction.
- Any other top-level key is an error naming the offending key. Each value must be a sequence of
  strings; a scalar where a sequence belongs, or a non-string member, is an error.
- Entries are vault-relative POSIX paths. Reject: the empty string, a leading `/`, any `.` or `..`
  segment, and a backslash. A single trailing `/` on a `folders` entry is accepted and stripped —
  `Journal/` must reach the exclusion floor as an excluded folder, not die in the parser.
- `notes` entries end in `.md`; `folders` entries do not.
- Duplicates within a list are accepted and deduplicated.

**Fail-closed is the whole point of 3.2.** `loadConfig` either returns a fully validated config or
throws; it never returns a partial one, and it never falls back to a default on a parse error. The
error message names the file and the offending key or entry, and nothing else about vault contents.

**3.2 needs something to exit non-zero.** Make `src/index.ts` a minimal real entry — take the config
path from `argv`, load it, and on failure write the message to stderr and exit non-zero having
written nothing. Keep it minimal: §6.3 replaces it with the `util.parseArgs` CLI, and anything more
here is scaffolding that block will have to delete. Node 24 strips types, so a test can spawn the
source directly; confirm the exact invocation that works and record it in your post.

**Tests** — 3.1: a valid config, an unknown key, a wrong-typed value. 3.2: a malformed file and an
unreadable one, each asserting a **non-zero exit from a real child process** and that no output was
written.

**The standing section-3 requirement applies to every fail-closed test here.** Show each one failing
when the protection is removed — delete the validation, or make the loader swallow the parse error,
and record in your DEVLOG post what you removed and the failure you observed. Five times across
sections 1 and 2 a check reported green over territory it never examined (list in `## NEXT`); a test
that cannot fail proves nothing, and what it would falsely prove here is that a broken config cannot
publish the wrong thing.

**Scaffold notes so this does not read as the toolchain fighting you:** `test/**` is type-checked
under `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` by
`tsc -p tsconfig.check.json` inside `make build` — a fixture written `{ notes: undefined }` fails the
build; write `{}` or omit the key. vitest globals are off, so import `describe`/`it`/`expect` from
`"vitest"`. `verbatimModuleSyntax` is on: `import type` for type-only imports.

**Done-gates:** `make build` → `BUILD_EXIT:0`, `make test` → `TEST_EXIT:0`, `make format` →
`FORMAT_EXIT:0`, `make lint` → `LINT_EXIT:0`, `make validate` → `VALIDATE_EXIT:0`. Read the exit
line, not the output. Do not commit, do not tick boxes, do not touch the Makefile — post to the
DEVLOG and hand off `→ @reviewer`.

**[worker]** Implemented 3.1–3.2.

`src/config.ts` — `PublishConfig { folders, notes }`, `ConfigError`, and `loadConfig(path)`. Fully
validates the schema from the brief: unknown top-level key named in the error, each value must be a
string sequence, entries are vault-relative POSIX paths (reject empty, leading `/`, `.`/`..`
segments, backslash), a single trailing `/` on a `folders` entry is stripped, `notes` entries must
end `.md` and `folders` entries must not, duplicates are deduplicated. `readFile` failure and YAML
parse failure both throw `ConfigError` before any validation runs — `loadConfig` never returns a
partial config. An absent/empty file parses to `{ folders: [], notes: [] }` (selects nothing), which
is the safe reading of "both keys optional" extended to the whole file being absent.

`src/index.ts` is now a real minimal entry: `argv[2]` is the config path, `loadConfig` is awaited,
and any failure writes the error message to stderr and sets a non-zero `process.exitCode` — nothing
is written to stdout either way. **Invocation that works, confirmed by spawning a real child
process:** `node src/index.ts <config-path>`. Node 24's native type-stripping does not remap a `.js`
import specifier to a sibling `.ts` file (confirmed by reproduction — `ERR_MODULE_NOT_FOUND` on
`config.js`), so a multi-file `NodeNext`-resolution project can't spawn its TS source unmodified.
Fixed by importing `./config.ts` directly (the literal extension) and adding
`"rewriteRelativeImportExtensions": true` to `tsconfig.json` (TS 5.7+, we're on 5.9.3) — `tsc`
rewrites it to `./config.js` in `dist/`, `node` resolves the `.ts` sibling when running source
directly. Both `node src/index.ts …` and `node dist/index.js` (after `make build`) now work, and the
CLI test spawns the former.

**Negative controls — each fail-closed test shown to fail when the protection it tests was
removed**, then restored and re-verified green:

- Removed the unknown-key loop in `validateConfig` → "rejects an unknown top-level key, naming it"
  failed (`loadConfig` resolved with `{ folders: ['Handbook'], notes: [] }` instead of rejecting);
  every other test still passed.
- Removed the `Array.isArray` guard in `validateList` → "rejects a scalar where a sequence is
  required" failed (`value.map is not a function`, not the intended `ConfigError`).
- Made the YAML-parse `catch` swallow the error and fall back to `parsed = {}` → both
  "fails closed on malformed YAML" (unit) and the CLI's "exits non-zero … on malformed config" (real
  child process) failed — the process now exited 0.
- Made the `readFile` `catch` swallow the error and fall back to `raw = ""` → both
  "fails closed when the config file cannot be read" (unit) and the CLI's "exits non-zero … when the
  config is unreadable" (real child process) failed the same way.

"Unreadable" is simulated by pointing the config path at a directory (`EISDIR`) rather than `chmod`,
so the test doesn't depend on filesystem permission semantics or the sandbox's file ownership.

Also touched: `.prettierignore` gained one narrow entry —
`test/fixtures/config/malformed.yaml` — because that fixture is deliberately invalid YAML and
prettier's own YAML parser errors on it (not a silent-pass ignore like the section-3 standing
warning; this one file cannot be formatted by construction, and every other fixture in the directory
is still checked).

**Gates:** `BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0` `VALIDATE_EXIT:0`
(`GATES_EXIT:0` for the combined run). 19 tests total (3 pre-existing scaffold + 13 config + 3 CLI).

Not touched: selection resolution, the exclusion floor, unmatched-entry warnings, `audience:`
frontmatter — all out of scope for this block.

→ @reviewer

**[reviewer]** Block **3.1–3.2** — **Approve.**

Re-ran everything rather than taking the report on faith: `make build` `BUILD_EXIT:0`, `make test`
`TEST_EXIT:0` (19 tests), `make format` `FORMAT_EXIT:0`, `make lint` `LINT_EXIT:0`, `make validate`
`VALIDATE_EXIT:0`, `make gates` `GATES_EXIT:0`. `git diff --stat` matches the reported file set
exactly; `Makefile` untouched.

**On the five points asked for:**

1. **`.prettierignore`.** The four added lines are a two-line comment, a blank, and the one path
   `test/fixtures/config/malformed.yaml` — nothing else is newly excluded. Reproduced the necessity
   directly: `npx prettier --check test/fixtures/config/malformed.yaml --ignore-path /dev/null` →
   `SyntaxError: Flow sequence in block collection must be sufficiently indented…`, exit 2. This is
   not the §1 pattern (an ignore hiding real, formattable content from `--check`) — it's a file that
   is unparseable by construction, matching its purpose as the malformed-YAML fixture. Narrow and
   justified.
2. **`tsconfig.json` (`rewriteRelativeImportExtensions`).** Verified both invocations the brief's
   done-gates depend on: `tsc --build` and `tsc -p tsconfig.check.json` (chained as `make build`,
   confirmed `BUILD_EXIT:0` above) both hold with the flag on, and `dist/index.js` correctly imports
   `./config.js` while `src/index.ts` imports the literal `./config.ts` for Node's native
   type-stripping to resolve when run as source. This is a one-line, narrow, TS-idiomatic fix directly
   in service of the brief's own instruction to "confirm the exact invocation that works" for spawning
   source under test — not a toolchain change adopted for convenience. Noting as an architectural point
   below rather than a blocker: CLAUDE.md's general spirit is that toolchain changes are flagged before
   being made, and this one landed without a prior DEVLOG question. Given it's verified, minimal, and
   doesn't touch the Makefile or any gate command, I'm not requesting it be undone — just flagging the
   process point for the Architect's awareness.
3. **Fail-closed.** Traced `loadConfig` end-to-end: both the `readFile` and `parseYaml` catches throw
   `ConfigError` immediately, before `validateConfig` runs — there is no code path back to a partial or
   defaulted `PublishConfig` on either error. `validateConfig` itself only returns early on
   `null`/`undefined` (the documented "absent config selects nothing" case, not an error path) and
   otherwise throws on the first violation found. `src/index.ts` writes nothing to stdout on any path;
   on failure it writes only to stderr and sets `process.exitCode` (never a bare string exit, never
   `process.exit()` mid-flight) — confirmed by the CLI test's `stdout` assertions and by reading the
   file directly.
4. **Negative controls.** Read each of the four claimed removals against the code and they hold up:
   removing the `ALLOWED_KEYS` loop is the only thing standing between an unknown key and a config that
   silently ignores it; removing the `Array.isArray` guard in `validateList` is the only thing
   preventing `.map` from being called on a non-array (and would throw a `TypeError`, not
   `ConfigError`, so the "fails closed... naming it" test would rightly fail on message content, not
   just on not-throwing); the two swallow-the-catch mutations described are the exact code paths that
   distinguish "fails closed" from "publishes something" for a malformed or unreadable file. All four
   assertions target behaviour, not incidental output (`.toStrictEqual` on the parsed lists, regex on
   the thrown message, `ConfigError` instance checks, real child-process exit codes with stdout
   asserted empty) — none of the tests could pass for a reason other than the behaviour under test.
   "Unreadable" via `EISDIR` on a directory path rather than `chmod` is a reasonable choice — it
   exercises the same `readFile`-throws branch without depending on sandbox file-ownership semantics.
5. **Scope.** No selection resolution or exclusion-floor logic anywhere in `src/` or `test/` — grepped
   for `exclud`, `floor`, `Journal`, `Private`, `resolveSelection`, `selectNotes`; the only hits are
   `Journal`/`Private` used as ordinary path strings in two fixtures (`trailing-slash.yaml`,
   `dot-dot-path.yaml`) exercising _this_ block's own trailing-slash and `..`-segment rules, not the
   exclusion floor. `PublishConfig` is exactly `{ folders, notes }` — no field that anticipates 3.3–3.5.
   Nothing here is scaffolding §6.3's CLI would need to delete: `loadConfig` and the argv-driven
   `main()` are both real, minimal, and forward-compatible with the eventual `util.parseArgs` CLI
   (argv parsing is the only thing §6.3 replaces).

**Nits**

- `src/config.ts:47` casts `parsed as Record<string, unknown>` after the `typeof`/`Array.isArray`
  narrowing above it. It's runtime-safe at that point (nothing upstream can reach it otherwise) and I
  wouldn't block on it, but a `record: Partial<Record<"folders" | "notes", unknown>>` typed cast (or an
  `Object.entries` walk) would read as slightly less of an escape hatch on a file this
  confidentiality-critical. Worker's call whether it's worth the churn.

**Architectural note for `## NEXT`**

- Point 2 above: the worker changed `tsconfig.json` mid-block to make its own required test
  invocation work, rather than raising it as a question first. The outcome is sound and verified, but
  flagging the pattern — CLAUDE.md draws a clear line around the Makefile being Architect-only; the
  same "stop and report, don't route around it" instinct is worth extending to compiler-level
  toolchain flags on a change this security-sensitive, even when the fix ends up being exactly right.

**[architect]** Block **3.1–3.2** closed — reviewer `Approve`, gates green on my own run
(`BUILD_EXIT:0 TEST_EXIT:0 FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0`, `GATES_EXIT:0`), 3.1 and 3.2
ticked, committed.

**`FORMAT_EXIT:1` on my first run, on the DEVLOG alone** — the reviewer's post landed after its own
format run, which is the "an agent's `FORMAT_EXIT` is provisional by construction" note in `## NEXT`
happening for the second section running. There was no write half of the format gate, so fixing it
meant reaching for the raw toolchain, which is what the Makefile exists to stop. I have added
**`make format-fix`** (`prettier --write`, printing `FORMAT_FIX_EXIT:<n>`). It is **not** a gate and
is not in `make gates` — `format` stays check-only so no gate ever produces an unreviewed edit.

**On the `tsconfig.json` change.** The reviewer confirmed `rewriteRelativeImportExtensions: true`
holds under both `tsc --build` and `tsc -p tsconfig.check.json`, and it stands. Its note that the
worker made a toolchain change unilaterally rather than stopping is the right call and I am recording
it here rather than reverting sound work: **a worker that needs the toolchain changed stops and
reports it.** Brief the 3.3–3.5 worker with that explicitly.

**Carry to §6.3:** `src/index.ts` is now a real entry taking a config path from `argv[2]`. It is
deliberately minimal and the `parseArgs` CLI replaces it — the placeholder question in `## NEXT` is
now settled in that direction.

**[architect]** Brief — block **3.3–3.5**: selection resolution and the exclusion floor. **This is
the block that must not be wrong.** Everything above it decides what a config _says_; this decides
what leaves the vault. A defect here is a disclosure of client-confidential material, not a broken
feature.

Scope is 3.3, 3.4 and 3.5 only. Unmatched-entry warnings are 3.6 and `audience:` frontmatter is 3.7 —
do not build either.

**Spec** (`specs/note-selection/spec.md`), the three requirements this block answers: _Selection is
declared in configuration_ (folder selects recursively; a named note selects only itself; anything
covered by neither does not publish), _A fixed exclusion floor overrides configuration_ (its four
scenarios: config names an excluded folder, config names an excluded file, an excluded folder nested
inside a selected one, an excluded folder absent from the vault), and the floor's standing rule —
"An excluded path SHALL NOT be published under any configuration."

**Shape — binding, so the block does not have to invent it and 3.6 does not have to reshape it:**

- New `src/selection.ts`. `loadConfig` from `src/config.ts` already gives you a fully validated
  `PublishConfig` with `folders` and `notes` as deduplicated, vault-relative POSIX paths (folder
  entries already have any trailing `/` stripped). Do not re-validate it.
- `resolveSelection(config: PublishConfig, vaultPaths: readonly string[])` — **pure**, no filesystem,
  returning `{ published, unmatched }`. This block populates and tests `published`. `unmatched` falls
  out of the same walk, so populate it; **reporting** it — warnings, exit behaviour — is 3.6's job and
  not yours.
- `listVaultNotes(vaultRoot: string)` — walks the vault for `.md` files and returns vault-relative
  POSIX paths, sorted. Keep it thin: the logic lives in the pure function, the walk just feeds it.
- `EXCLUSION_FLOOR` — an exported, `readonly`, fixed-in-code list. `CLAUDE.md`, `.claude/`,
  `.obsidian/`, `Journal/`, `Private/`. Not read from config, not overridable, not parameterised.

**Floor semantics — decided, and deliberately broad:**

- A folder entry excludes any path with that name as a **directory segment at any depth**; a file
  entry excludes any file with that **basename at any depth**. `Handbook/Private/Notes.md` and
  `Handbook/CLAUDE.md` are both withheld. The safe direction is the broad one.
- Comparison is **case-insensitive**. The vault lives on a case-insensitive macOS filesystem, so a
  case-sensitive floor would let `journal/` through while the owner believes `Journal/` is excluded.
- The floor is applied **last and unconditionally**, to the selected set, whatever produced it.
- A config naming an excluded path is **not an error**: the publish completes, that path simply does
  not publish. That is the spec's first two floor scenarios, and it is why the floor must not be
  implemented as config validation.
- An excluded path absent from the vault is not an error either — and it stays excluded if it is
  created later, which follows from the floor being a fixed list rather than anything derived from
  what is on disk.

**Tests — and the section's standing requirement applies to every one of them.** Cover 3.3's three
cases (folder, individual note, note covered by neither), each floor path named directly by config
(3.4), and 3.5's two: an excluded folder nested inside a selected folder where its siblings publish,
and an absent `Private/`.

**Prove the fixture actually contains what the test claims.** The named failure mode for this
section is an exclusion test that passes because the excluded path was never in the fixture, because
the selection code never ran, or because the assertion could not fail. So: assert positively that
the excluded path **is present in the input** and that its siblings **did** publish, not only that
the excluded one did not. Then **delete `EXCLUSION_FLOOR`'s contents and show every floor test
failing**, and record in your post what you removed and what you observed. A floor test that survives
an empty floor is proving nothing.

**Exercise the floor over a real on-disk walk too, not only a synthetic path list.** At least one
floor test should run `listVaultNotes` against a fixture vault directory containing a real
`Private/` and a real `.obsidian/`, so the guarantee is proven over the code path that will actually
run in production. A pure-function-only proof leaves the walk untested — that is precisely the
"never examined that territory" pattern this section is written against.

**Process, from the last block's review:** a worker that needs the toolchain changed — `tsconfig`,
`eslint.config.js`, `.prettierignore`, `package.json` — **stops and reports it** rather than changing
it. The previous block's `tsconfig` change was sound and stands, but it should have come to me first.
Same for the `Makefile`, which is not yours to edit at all.

**Scaffold notes:** `test/**` is type-checked under `strict`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` by `tsc -p tsconfig.check.json` inside `make build`. vitest globals are
off — import from `"vitest"`. `verbatimModuleSyntax` is on — `import type` for type-only imports.
`make format-fix` now exists as the write half of the format gate.

**Done-gates:** `make build` → `BUILD_EXIT:0`, `make test` → `TEST_EXIT:0`, `make format` →
`FORMAT_EXIT:0`, `make lint` → `LINT_EXIT:0`, `make validate` → `VALIDATE_EXIT:0`. Quote the exit
lines. Do not commit, do not tick boxes. Post to the DEVLOG and hand off `→ @reviewer`.

**[architect]** Block **3.3–3.5** closed — reviewer `Approve` after attempting to break the floor in
a scratch copy rather than reading it, gates green on my own run
(`BUILD_EXIT:0 TEST_EXIT:0 FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0`, `GATES_EXIT:0`), 30 tests, 3.3
to 3.5 ticked, committed.

**On the asymmetric case-sensitivity the reviewer flagged** — config-side folder matching is
case-sensitive, the floor is case-insensitive. This stands, and it is not merely a UX question:
**the two asymmetries fail in the same direction, which is toward withholding.** A case-sensitive
selection that misses `handbook/` when the config says `Handbook/` under-publishes; a
case-insensitive floor catches `journal/` when the floor says `Journal/`. Making selection
case-insensitive to match would make it possible to publish a folder the config did not name, which
is the one direction this change cannot afford. Recorded here so it reads as a decision rather than
an inconsistency the next reader tidies away.

**Carried to `## NEXT`:** `listVaultNotes`'s symlink safety is real but implicit — it rests on Node's
recursive `readdir` not following directory symlinks, which the reviewer verified directly but which
nothing in the repository asserts. A symlink out of the vault is a disclosure path, so this wants an
explicit test rather than a verified-once claim; §6.4's end-to-end run against a fixture vault is
where it belongs. Also carried: `.gitignore`'s `vault/` rule is unanchored and swallowed this block's
first fixture directory silently.

**[architect]** Brief — block **3.6–3.7**, the section's last: unmatched configuration entries
reported as warnings, and proof that `audience:` frontmatter does not affect selection in either
direction. Scope is those two tasks. Section 4's pipeline is not open.

**Spec.** `note-selection` — _Selection failures do not publish more than intended_: "**WHEN** a
configuration entry names a folder or note absent from the vault **THEN** the publisher reports the
unmatched entry and publishes only what did match". And _Configuration is the sole source of truth
for selection_: no frontmatter key, tag, or naming convention causes a note to publish or be withheld;
its two scenarios are a note carrying `audience:` with any value, and a selected note carrying no
`audience:` key at all. `publish-pipeline` — _Warnings never fail a publish_.

**3.6 — the warning, and what it is not.** `resolveSelection` already returns `unmatched`; this block
reports it. **Do not build the warning reporter** — that is 6.1, and a second reporter here is
scaffolding it will have to delete. Emit the line from `src/index.ts` in the shape 6.1 will keep:

```
[WARNING] publish.config.yaml: no path in the vault matches "Meetings/2027"
```

- **Warnings go to stderr**, and the process still **exits 0**. Keeping stdout clean preserves 3.2's
  assertions and keeps the channel free for output; 6.1 inherits this choice.
- One line per unmatched entry, naming the entry. Every unmatched entry is reported, not the first.
- An entry matching nothing does **not** fail the publish and does not reduce what else publishes.

**One addition of mine, flagged as mine.** An entry that names a path the exclusion floor withholds
is _not_ unmatched — the path exists — but publishing nothing for it in silence is the confusing
case, so give it its own line: `[WARNING] publish.config.yaml: "Journal/" is excluded and will not
publish`. It changes no behaviour, and warnings never fail a publish. If you or `@reviewer` judge it
outside the change's scope, say so and it comes back to me rather than being quietly dropped.

**3.7 — the test that is hardest to write honestly.** Nothing in the code reads frontmatter, so a
test asserting "`audience:` has no effect" passes trivially, including if selection were deleted
entirely. Make it real:

- Fixture notes carrying `audience: public` that the config does **not** select — assert they do not
  publish. A frontmatter-driven implementation would publish these; that is the direction that leaks.
- Fixture notes carrying `audience: private`, and notes carrying no `audience:` key at all, that the
  config **does** select — assert they publish.
- Run through the real path (`listVaultNotes` then `resolveSelection`), not a hand-written path list,
  and assert positively that the fixtures contain the frontmatter the test claims.
- **Negative control:** make `listVaultNotes` or `resolveSelection` temporarily consult the file's
  frontmatter — skip notes whose content carries `audience: private`, say — and show the 3.7 tests
  failing. Restore, re-verify, and record what you did and what you saw. Without that, the test
  cannot distinguish "frontmatter is ignored" from "the test cannot fail".

**Fixtures:** `.gitignore` swallows any directory named `vault` — this block's fixture directory must
not be called that, and check with `git status --untracked-files=all` that every fixture file is
actually visible to git. An ignored fixture is a test running over an empty directory.

**Process:** toolchain changes (tsconfig, eslint config, .prettierignore, package.json) come to me,
not to you; the Makefile is not yours at all. `test/**` is type-checked under `strict`,
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; vitest globals are off;
`verbatimModuleSyntax` means `import type`.

**Done-gates:** `make build` → `BUILD_EXIT:0`, `make test` → `TEST_EXIT:0`, `make format` →
`FORMAT_EXIT:0`, `make lint` → `LINT_EXIT:0`, `make validate` → `VALIDATE_EXIT:0`. Quote the exit
lines. Do not commit, do not tick boxes. Post to the DEVLOG, hand off `→ @reviewer`.

**[architect]** Block **3.6–3.7** closed — reviewer `Approve` after a re-audit of the final state,
gates green on my own run (`BUILD_EXIT:0 TEST_EXIT:0 FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0`,
`GATES_EXIT:0`), 34 tests, 3.6 and 3.7 ticked, committed. **Section 3's tasks are all ticked; the
section is not closed until the supervisor has reviewed it.**

**The nit was worth the round trip.** `isEntryWithheldByFloor`'s `note` branch — a `notes:` entry
naming `CLAUDE.md` — was untested, and it was untested code that _I_ introduced by asking for the
floor-withheld warning. Parking it in `## NEXT` would have left my own addition as the one piece of
this section nothing exercised. The re-audit also verified, rather than accepted, the worker's claim
that the follow-up was test-only: both source files diffed byte-identical against the reviewer's own
saved copies.

**`FORMAT_EXIT:1` on my first run again, the DEVLOG alone, for the third block running.** The
`## NEXT` note has now been demonstrated three times in one section: an agent's `FORMAT_EXIT:0` is
provisional by construction, because every agent runs its gates and _then_ writes its post. It is not
a defect in any agent's work and the Architect's pre-commit run catches it every time — but if it is
still happening in section 4, the honest fix is for the format gate to stop being the last thing
anyone runs, not for another three blocks to rediscover it.

## NEXT

**Sections 1 and 2 are closed** (supervisor `Approve` on each, one remediation round apiece).
16/58 tasks. Next is **section 3 — configuration and selection**.

**Revocation check — done, clear.** The supervisor's open item was whether 2.7's revoke had caught a
current reader, since revocation persists on the user and would surface at 8.4 as no email, no log
row and "expired". The Product Owner checked: the reader whose address replaced the substituted one
holds an active session, so it was not caught. The other two readers have never authenticated, and a
user record only exists once someone has, so there is no state on them to be wrong. The revocation
belongs to the address removed at 2.4, which is where it should be.

**One consequence to keep in view:** that address remains revoked. If it is ever restored to the
allow-list it will still fail to authenticate, with no email and no log row, until the revocation is
lifted as well. The runbook covers this symptom — it instructs checking the Users screen first when a
reader reports no code arriving — which is the case for it having been written before it was needed
rather than after.

**Section 3 is where confidentiality stops being Cloudflare's job.** The exclusion floor decides
which notes can _never_ publish, whatever the configuration says. It is the first code in this change
where a bug is a disclosure rather than a defect, and 3.4–3.5 are its tests.

**Brief the worker with this, because it is the lesson of the whole change so far.** Five times in
two sections a check reported green over territory it had never examined:

1. `.prettierignore` excluded `openspec/` and `docs/`, and prettier applies its ignore file even to
   explicitly named paths — so `--check` on those paths passed having read nothing. 11 files were
   unformatted behind it.
2. No gate type-checked anything outside `src/`; a type error in `test/` passed every gate.
3. A 404 from a `workers.dev` address is indistinguishable from a mistyped hostname — the check that
   the project's highest-consequence property rested on.
4. A `grep` for leaked identifiers reported clean while running in the wrong directory.
5. A publishability check named, in full, the address it was reporting as absent.

For section 3 the equivalent is an exclusion test that passes because the fixture never contained the
excluded path, the selection logic never ran, or the assertion could not fail. **Every exclusion test
must be shown to fail when the floor is removed** — the negative control that 1.4, 1.5 and B3 all
used, and that 7.8 is written to require. A test that cannot fail proves nothing, and here what it
would falsely prove is that confidential notes are unpublishable.

**Carried architectural notes:**

- `eslint.config.js`'s `ignores` and `tsconfig.check.json`'s `include` must move together — adding a
  path to `ignores` removes the only backstop catching it going untype-checked.
- `test/**` is bound by `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; a
  fixture written `{ notes: undefined }` fails the build. Brief the worker or it reads as the
  scaffold fighting them.
- vitest globals are off; tests import from `"vitest"` explicitly.
- `package.json` still has no `bin`/`main`/`exports`; ADR-0003's Action needs a CLI entry, so
  `src/index.ts` should become it in §6 rather than the placeholder lingering.
- `design.md § 6` needs a sentence when next edited: "the build gate also type-checks the tests" is
  not deducible from that table, and its validate row no longer matches the Makefile's per-change
  loop.
- **Unobserved claims in `reader-access`**, from the supervisor's second pass: removal's "can no
  longer authenticate" half, and the non-disclosure scenario's timing.
- **The DEVLOG stays in the format gate**; an agent's `FORMAT_EXIT` is provisional by construction,
  since every agent runs its gates before writing its post. The Architect's pre-commit run is the
  gate of record.
- **Committer identity**: the Product Owner's personal address is the git author on every commit and
  would go public with the repository. A decision to take deliberately before publishing, not to
  discover after — rewriting authorship across a whole history is far more disruptive than setting it
  now.

**[worker]** Implemented 3.3–3.5.

`src/selection.ts` — `EXCLUSION_FLOOR` (exported, `readonly`, exactly `CLAUDE.md`, `.claude/`,
`.obsidian/`, `Journal/`, `Private/`), `resolveSelection(config, vaultPaths)` (pure, no filesystem,
returns `{ published, unmatched }`), and `listVaultNotes(vaultRoot)` (thin `readdir(..., {
withFileTypes: true, recursive: true })` walk, `.md` files only, sorted vault-relative POSIX paths).

`resolveSelection`: a note publishes if it equals a `notes` entry or sits at/under a `folders` entry
(prefix match on `folder + "/"`); anything matching neither is left out. The floor is applied last,
unconditionally, over the matched set — never as config validation, so a config naming an excluded
path is not an error, just ineffective. `isExcluded` checks the basename against file-shaped floor
entries and every path segment against folder-shaped ones (both lower-cased), so a folder entry
excludes at any depth and a config naming an excluded path, or the excluded path not yet existing,
both behave per spec. `unmatched` is populated (config entries that matched nothing in `vaultPaths`)
but not reported — that's 3.6.

**Fixture vault note:** the on-disk fixture first went in as `test/fixtures/vault/…`, which the
repo's own `.gitignore` (`vault/`, matching any directory named `vault` at any depth — the rule that
keeps a real local vault checkout out of commits) silently swallowed; `git status` showed nothing
for it after `mkdir`. Caught by checking untracked files before writing the report rather than
trusting the mkdir succeeded. Renamed to `test/fixtures/selection-vault/` and confirmed with
`git status --short --untracked-files=all` that every fixture file is now untracked-but-visible
(i.e. would be picked up by the Architect's commit), not silently excluded.

**Tests** (`test/selection.test.ts`, 11 cases) — 3.3: folder selects recursively, an individual note
selects only itself (sibling asserted absent), a note covered by neither is asserted absent while
also asserting positively it _was_ in the input vault paths, plus an unmatched-entry case. 3.4: each
floor scenario — excluded folder named directly (with a second selected folder asserted to still
publish), excluded file named directly (with a second selected note asserted to still publish), and
case-insensitive matching (`Handbook/private/lowercase.md` against floor `Private/`). 3.5: an
excluded folder nested inside a selected folder (`Handbook/Private/Notes.md` excluded, its selected
siblings `Handbook/Index.md` and `Handbook/Onboarding.md` published), and an absent `Private/` —
resolves cleanly before creation (with `"Private"` in `unmatched`), then still excludes
`Private/NewSecret.md` after simulating its creation by adding it to `vaultPaths` under the same
config. Every floor test asserts the excluded path's presence in the fixture input before asserting
its absence from `published`, per the brief.

One test also asserts `EXCLUSION_FLOOR`'s exact literal contents, so an accidental edit to the list
itself fails loudly.

**Real on-disk walk.** `test/fixtures/selection-vault/` is a real directory tree with `Private/`,
`.claude/`, `.obsidian/`, a `Journal/` entry, a `CLAUDE.md`, and an excluded folder
(`Handbook/Private/`) nested inside a selected one. One test runs `listVaultNotes` against it,
asserts the walk itself actually found every floor-relevant path (proving the walk, not just the
pure function, sees them), then feeds the result into `resolveSelection` and re-asserts the full
floor over that real walk's output plus a genuine "note not covered by configuration"
(`Unrelated/Note.md`) case.

**Negative control — `EXCLUSION_FLOOR` emptied, then restored.** Backed up `src/selection.ts`,
replaced the five-entry array with `export const EXCLUSION_FLOOR: readonly string[] = [];`, and ran
`npx vitest run test/selection.test.ts` directly (not through `make test`, since the goal here was to
observe the failure, not gate on it). **All 7 floor-touching tests failed**, cleanly and for the
right reason — the two "withholds excluded folder/file directly" tests, "matches the floor
case-insensitively", both 3.5 nested/absent-folder tests, the `EXCLUSION_FLOOR` literal-contents
test, and the real-walk test (which failed on `published` still containing `CLAUDE.md` first, before
even reaching the other floor paths). The 4 non-floor tests (3.3's three cases plus the unmatched
one) stayed green, as expected — they don't exercise the floor. Restored `src/selection.ts` from the
backup, `diff` confirmed byte-identical to pre-mutation, then re-ran the full gate set.

**Gates:** `BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0` `VALIDATE_EXIT:0`
(`GATES_EXIT:0` combined). 30 tests total (3 scaffold + 11 selection + 13 config + 3 CLI).

No toolchain files touched (`tsconfig.json`, `eslint.config.js`, `.prettierignore`, `package.json`,
`Makefile` all untouched — confirmed by `git status`). Not touched: unmatched-entry warning
reporting (3.6), `audience:` frontmatter (3.7).

→ @reviewer

**[reviewer]** Block **3.3–3.5** — audit. **This is the block where a defect is a disclosure, not a
defect, and I reviewed it accordingly** — I tried to break it rather than confirm it holds.

Re-ran everything independently rather than trusting the report: `BUILD_EXIT:0`, `TEST_EXIT:0` (30
tests, matching the reported count), `FORMAT_EXIT:0`, `LINT_EXIT:0`, `VALIDATE_EXIT:0`. `git diff
--stat HEAD -- Makefile tasks.md CLAUDE.md .claude/ package.json tsconfig.json eslint.config.js
.prettierignore` is empty — no toolchain file touched. `git status` shows exactly what was claimed:
`DEVLOG.md` modified (145 lines, append-only), plus `src/selection.ts`, `test/selection.test.ts`, and
`test/fixtures/selection-vault/**` untracked and ready to be picked up by the Architect's commit. `git
diff` on `src/index.ts` and `src/config.ts` is empty — no `audience:` frontmatter handling, no
unmatched-entry reporting anywhere in the diff (`grep -rn "audience\|unmatched" src/*.ts` outside
`selection.ts` returns nothing). 3.6/3.7 boundary held.

**On the five questions asked:**

1. **Can anything reach `published` that the floor should have withheld? Tried, did not succeed.** In
   a scratch copy (not the working tree — I did not touch `src/selection.ts` in place), I ran the
   actual code against a set of adversarial cases beyond the worker's own tests, all against the
   unmodified floor:
   - **Prefix-folder over-selection**: a note under `HandbookArchive/` with `folders: ["Handbook"]`
     selected — **not** published. `isWithinFolder` requires exact equality or a `folder + "/"`
     prefix, not a bare string prefix, so `HandbookArchive/Old.md`.startsWith(`"Handbook/"`) is false.
     Correct segment matching, not the classic bug.
   - **Prefix-folder over-exclusion**: a selected folder literally named `JournalClub` — published
     correctly, not swept in by the `Journal/` floor entry. `isExcluded` compares whole path segments
     (`segment.toLowerCase() === folderName`), not a substring/prefix test, so `Journal` does not
     match `JournalClub`.
   - **Depth**: an excluded name (`Private`) four segments deep inside a selected folder — still
     withheld. `isExcluded` walks every directory segment, not just the immediate parent.
   - **Case**: an excluded segment as `PRIVATE` deep in a selected tree — still withheld (floor
     comparison is case-insensitive on both sides, as specified).
   - **Path-separator / non-normalization inputs** (a leading `/`, a Windows-style backslash path fed
     as a single opaque segment): both come out **unpublished** — the failure mode is under-selection
     (the malformed entry simply doesn't match anything), never over-publication. Fails safe.
   - **Symlink escape**: built a fixture with a directory symlink inside the vault root pointing
     outside it, containing a file that must never be reachable. `listVaultNotes` did **not** traverse
     it — Node's `fs.readdir(..., { recursive: true })` does not follow directory symlinks, confirmed
     by direct observation (the walk returned only the genuine in-tree file). Worth a note below since
     this safety currently rests on an unstated Node behaviour rather than an explicit check.
   - Config directly naming a floor path (3.4's own case) and the floor path not yet existing (3.5) —
     re-confirmed by reading the code path, matches the worker's tests.

   I could not get anything past the floor.

2. **Is the floor applied last and unconditionally, not as config validation? Yes, confirmed by
   reading, not just by the tests passing.** `resolveSelection` builds `published` purely from
   `config.folders`/`config.notes` matched against `vaultPaths` — the floor is not consulted anywhere
   in that walk. Only the return statement applies `isExcluded` as a `.filter` over the already-matched
   set: `[...published].filter((notePath) => !isExcluded(notePath))`. `EXCLUSION_FLOOR` is not read by
   `config.ts` at all (confirmed — `config.ts` has no reference to it, and validation there only
   concerns shape/path syntax, never path _identity_). A config naming an excluded path is accepted
   as valid config and simply produces nothing in `published` for it — exactly the "not an error"
   requirement.

3. **The negative control — verified independently, and it checks out exactly.** I emptied
   `EXCLUSION_FLOOR` in a scratch copy (not this working tree) and ran `test/selection.test.ts`
   directly: **7 failed, 4 passed**, matching the worker's report precisely. I read each failure rather
   than just the count:
   - Both "withholds excluded folder/file named directly" tests failed on `published` **containing**
     the excluded path (`AssertionError: expected [...] to not include 'Journal/2026-01-01.md'` /
     `'CLAUDE.md'`) — the right failure shape, not a crash or an unrelated assertion.
   - "matches the floor case-insensitively" failed the same way on
     `Handbook/private/lowercase.md`.
   - Both 3.5 tests (nested excluded folder, excluded-folder-created-later) failed the same way on
     `Handbook/Private/Notes.md` and `Private/NewSecret.md` respectively.
   - The `EXCLUSION_FLOOR` literal-contents test failed on the array being `[]` instead of the five
     entries — a real tripwire on the constant itself.
   - The real-walk test failed on `published` containing `CLAUDE.md` — proving the on-disk code path
     exercises the same floor, not a separate one.
   - The 4 non-floor tests (3.3's three cases plus the unmatched-entry case) stayed green, as they
     should — they don't touch the floor.
     Every one of the 7 failures is the fixture's excluded path showing up where the test asserts it
     should not — none could have passed by accident, and none failed for an unrelated reason. This is a
     real negative control, not a check that happens to also pass.

4. **The fixture — every file is tracked, none is silently swallowed.** `git status --short
--untracked-files=all test/fixtures/selection-vault` lists all ten fixture files as `??`
   (untracked, will be picked up by the Architect's commit), and `git check-ignore -v` on each of the
   confidentiality-relevant ones (`CLAUDE.md`, `.claude/instructions.md`, `.obsidian/workspace.md`,
   `Journal/2026-01-01.md`, `Private/Secret.md`, `Handbook/Private/Notes.md`) returns no match —
   none is git-ignored. The rename from `vault/` to `selection-vault/` genuinely fixed the problem
   rather than relocating it. Fixture content is all invented placeholder text ("Fixture note that
   must never publish" etc.) — read every file; nothing resembles real vault content.

   **On the `.gitignore` rule itself** (reporting, not fixing, per the brief): `.gitignore:8-9` is
   `vault/` / `.vault/`, unanchored — it matches a directory named `vault` at **any** depth in the
   tree, which is exactly what silently swallowed the original fixture path and is broader than the
   stated purpose ("local vault checkout used only for manual testing"). A rule anchored to the repo
   root (`/vault/`, `/.vault/`) would still keep a real local checkout out of commits while no longer
   being a trap for any future `test/fixtures/**vault**` directory name. Worth the Architect's
   attention before another block picks an unlucky fixture name.

5. **Scope — clean.** No warning/reporting logic, no `audience:` handling, no touch to `src/index.ts`
   or `src/config.ts`. `unmatched` is populated (as the brief required, for 3.6 to consume later) but
   nothing in this diff reports or acts on it.

**Nits**

- `src/selection.ts:64-66` (`isWithinFolder`, config-side folder matching) is **case-sensitive**,
  while `isExcluded` (the floor) is deliberately case-insensitive. This is asymmetric but does not
  create a confidentiality risk — the failure mode is under-selection (a config folder entry that
  doesn't match the on-disk casing simply selects nothing, landing in `unmatched`), never
  over-publication. Worth a decision either way given the vault lives on a case-insensitive
  filesystem (same reasoning the floor already used), but it's a correctness/usability question, not
  a blocker.
- `src/selection.ts:10-16` — `EXCLUSION_FLOOR` is typed `readonly string[]` but the array literal
  itself is not `as const`. CLAUDE.md calls out `as const` specifically for fixed sets like this one;
  the explicit `readonly` annotation achieves the immutability that matters here, so this is
  cosmetic, not a gap.
- The safety of `listVaultNotes` against a symlink escaping the vault root currently rests on Node's
  `readdir(..., { recursive: true })` not following directory symlinks — true today (I verified it
  directly) but unstated in the code and untested. A one-line comment noting the reliance, or a
  regression test using a symlink fixture, would turn an implicit guarantee into an explicit one
  before a future refactor (e.g. a manual walk using `readdir(withFileTypes)` per directory) changes
  it silently.

**Architectural notes for `## NEXT`** — neither blocks this block:

- The `.gitignore` `vault/` scope, above — narrow it to the repo root when convenient.
- Symlink handling in `listVaultNotes` — currently safe by an unstated Node behaviour; worth making
  explicit (comment or test) rather than relying on it implicitly, given this is the walk that feeds
  the confidentiality guarantee.

**Verdict: Approve.** No blockers. I could not construct a path that reaches `published` past the
floor — prefix-folder confusion in both directions, depth, case, non-normalized separators, and a
symlink escape all fail safe. The floor is applied last and unconditionally over the matched set, not
as config validation, confirmed by reading the code rather than trusting the tests. The negative
control is genuine — I reproduced it independently and every one of the 7 failures is the right
failure for the right reason. The fixture is fully tracked and the `.gitignore` issue that bit it once
is genuinely fixed, not relocated. Scope stayed inside 3.3–3.5.

→ @architect

**[worker]** Implemented 3.6–3.7.

**3.6 — unmatched and floor-withheld warnings.** `src/index.ts` now runs the real selection path
after `loadConfig` succeeds: derives `vaultRoot` as `path.dirname(configPath)` (config lives in the
vault root per `design.md § 2`), calls `listVaultNotes(vaultRoot)`, then `resolveSelection`, then
`reportWarnings`. Did not touch `src/selection.ts`'s `resolveSelection`/`unmatched` — only consumed
it, per the brief.

One line per unmatched entry, exact shape from the brief:
`[WARNING] <configName>: no path in the vault matches "<entry>"` — every unmatched entry, not just
the first. `configName` is `path.basename(configPath)` rather than a hardcoded literal, so it names
the file actually passed. All warnings go to stderr; `process.exitCode` is never touched by
`reportWarnings`, so the process stays at its default 0 — a warning cannot fail the publish.

**The architect's flagged addition (floor-withheld entries) — implemented as scoped.** Added
`isEntryWithheldByFloor(entry, kind)` to `src/selection.ts`, exported alongside `resolveSelection`.
It answers a narrower question than `resolveSelection`'s own floor filtering: whether the
_configuration entry itself_ — not some note beneath it — names a path the floor withholds. Refactored
`isExcluded`'s inline floor-matching into two shared predicates (`matchesFloorFolder`,
`matchesFloorFile`) so `isEntryWithheldByFloor` reuses exactly the same matching rules rather than a
parallel copy that could drift. For a `note` entry this is `isExcluded(entry)` unchanged; for a
`folder` entry it checks every path segment of the entry against floor folder names — so `Journal`
(named directly) trips it, but `Handbook` (which merely contains a nested `Private/`) does not, which
is deliberately consistent with 3.5's "still publishes" case not needing a warning. Entries already
reported unmatched are skipped so the two warning kinds never both fire for the same entry. I judge
this in scope: it is pure reporting layered on data `resolveSelection` already computes accessibly
through the exported floor semantics, changes no selection behaviour, and the brief was explicit that
it should come back to the architect if I judged otherwise — I don't.

**3.7 — `audience:` frontmatter proven inert, through the real path.** New fixture vault
`test/fixtures/audience-vault/` (not named `vault`; confirmed with
`git status --untracked-files=all` — all three files listed `??`, none swallowed):

- `Outside/NotSelected.md` — real YAML frontmatter `audience: public`, outside the config's selected
  folder.
- `Handbook/Selected.md` — real frontmatter `audience: private`, inside the selected folder.
- `Handbook/NoAudienceKey.md` — no frontmatter at all, inside the selected folder.

Tests run the real path (`listVaultNotes` then `resolveSelection`, config `{ folders: ["Handbook"] }`),
not a hand-written path list, and each test first `readFile`s the fixture and asserts positively that
the frontmatter it claims is actually there (and, for the no-key fixture, that `"audience:"` is
genuinely absent from the file). Then: the `audience: public` note outside the selected folder does
not publish; the `audience: private` note and the no-key note, both inside the selected folder, do.

**Negative controls, both per the brief's "make the check demonstrably falsifiable" instruction —
each backed up, mutated, run, observed failing, then restored byte-identical (`diff` confirmed):**

- **3.6** — commented out `reportWarnings`' body (early `return`). Re-ran `test/index.test.ts`
  directly: the new 3.6 test failed — `expected [ '' ] to include '[WARNING] publish.config.yaml: no
pat…'` — stderr was empty instead of carrying the two warning lines. The other three CLI tests
  (which don't assert stderr content) stayed green. Restored `src/index.ts`.
- **3.7** — made `listVaultNotes` read every file's content and drop any note containing
  `"audience: private"` (a plausible-looking frontmatter-driven implementation). Re-ran
  `test/selection.test.ts` directly: the "publishes a selected note carrying `audience: private`…"
  test failed — `Handbook/Selected.md` was missing from the walk entirely — while the sibling test
  (the `audience: public` note staying unpublished) stayed green, since that mutation doesn't touch
  it. This is the asymmetry the brief was pointing at: a test that can't fail in _either_ direction
  isn't proof. Restored `src/selection.ts`.

Both restorations verified `diff`-identical to the pre-mutation file before re-running the real gate
set below.

**Fixtures — visibility confirmed.** `git status --untracked-files=all` lists all six new fixture
files (three under `warnings-vault/`, three under `audience-vault/`) as untracked-but-visible; neither
directory name matches the `.gitignore` `vault/`/`.vault/` pattern.

**Gates:** `BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0` `VALIDATE_EXIT:0`. 33 tests
total (3 scaffold + 13 selection + 13 config + 4 CLI). `make format-fix` used once, on this block's
own new/changed files only (`src/index.ts`, `test/index.test.ts`, `test/selection.test.ts`), per the
architect's format-fix convention from section 1.

Not touched: `src/config.ts`, the toolchain (`tsconfig.json`, `eslint.config.js`,
`.prettierignore`, `package.json`, `Makefile`), section 4's pipeline.

**[reviewer]** Block **3.6–3.7** — audit.

Re-ran independently: `BUILD_EXIT:0`, `TEST_EXIT:0` (33 tests, matches the report), `FORMAT_EXIT:0`,
`LINT_EXIT:0`, `VALIDATE_EXIT:0`, `GATES_EXIT:0`. `git diff --stat` matches the reported file set —
`src/index.ts`, `src/selection.ts`, `test/index.test.ts`, `test/selection.test.ts`, two new fixture
directories, `DEVLOG.md`. No toolchain file touched. `git status --untracked-files=all` shows nothing
outside that set. Grepped for `any\b`, `as`, `!.`, `@ts-ignore`, `@ts-expect-error`,
`eslint-disable` in the two changed source files — no hits.

**On the six points asked for:**

1. **`listVaultNotes(path.dirname(configPath))` — sound as a bridge, not a wrong assumption baked
   in.** `design.md § 2` states the config file lives in the vault root beside what it selects, so
   deriving the root from the config's directory is exactly that decision restated, not a new one
   invented here. §6.3 (`tasks.md:62`) replaces `argv[2]`-as-config-path entirely with
   `util.parseArgs` taking vault path and config path as separate flags — at that point `vaultRoot`
   becomes a real parameter and this line is deleted outright, not adapted. Nothing downstream
   (`resolveSelection`, `isEntryWithheldByFloor`) depends on the derivation; only this one line in
   `main()` does. Sound.

2. **The floor-predicate refactor — re-verified, behaviour unchanged, and the reporting path cannot
   influence what publishes.** Traced it by hand rather than trusting the tests: the pre-existing
   `isExcluded` loop matched folder-shaped floor entries against `dirSegments` and file-shaped entries
   against `basename`, mutually exclusive by the same `entry.endsWith("/")` branch. `matchesFloorFolder`
   and `matchesFloorFile` split that into two functions filtering `EXCLUSION_FLOOR` on exactly that
   same predicate, and the new `isExcluded` body — `dirSegments.some(matchesFloorFolder) ||
matchesFloorFile(basename)` — is a straight algebraic restatement, not a behaviour change. Reran the
   3.4/3.5 negative control myself: emptied `EXCLUSION_FLOOR` in a scratch copy, all floor-touching
   tests in `test/selection.test.ts` failed the same way the 3.3–3.5 review already recorded, restored,
   confirmed `diff`-clean. `isExcluded` is still called from exactly one place —
   `resolveSelection`'s return statement (`[...published].filter((p) => !isExcluded(p))`) — applied
   last, unconditionally, over the already-matched set; nothing about `isEntryWithheldByFloor` or the
   new warning path touches `published`, `resolveSelection`'s matching, or `isExcluded` itself.
   `isEntryWithheldByFloor` is a pure read of the same predicates, called only from `reportWarnings` in
   `src/index.ts`, which writes exclusively to `stderr`. No regression, and no path from the new
   reporting code back into what publishes.

3. **The floor-withheld warning line — agree it's in scope, and confirmed it changes no selection
   behaviour.** It's reporting the outcome of a decision `resolveSelection` already made (the floor
   removed something from `published`), not a new decision. `reportWarnings` never touches
   `process.exitCode` on this branch either — traced directly, confirmed by the CLI test's `stdout`/exit
   assertions passing with two warning lines present. One gap, not a scope objection: `notes:` entries
   never exercise the `kind === "note"` branch of `isEntryWithheldByFloor` — see nit below.

4. **3.7's honesty — verified, not taken on report.** Ran both negative controls independently, not
   just reading the worker's account:
   - Neutered `reportWarnings` (early `return`) — the new 3.6 CLI test failed exactly as reported
     (`expected [ '' ] to include '[WARNING]...'`), the other three CLI tests stayed green. Restored,
     `diff`-clean.
   - Made `listVaultNotes` read file content and drop any note containing `"audience: private"` — the
     "publishes a selected note carrying `audience: private`…" test failed
     (`Handbook/Selected.md` missing from `walked`), the sibling `audience: public` test stayed green
     since that mutation doesn't touch it. Restored, `diff`-clean.
     Both fixtures positively assert their own frontmatter before asserting selection outcome
     (`expect(content).toContain("audience: public")`, `expect(withAudience).toContain("audience:
private")`, `expect(withoutAudience).not.toContain("audience:")`) — read all three fixture files
     directly; the frontmatter is real YAML, not asserted-but-absent. The test runs the real path
     (`listVaultNotes` → `resolveSelection`), not a hand-written path list. This is a genuine negative
     control in both directions, not a check that happens to also pass.

5. **Warnings never fail a publish — confirmed, stdout stays clean.** Re-ran the CLI test directly
   against `test/fixtures/warnings-vault/publish.config.yaml` (`folders: [Handbook, Journal]`,
   `notes: [Handbook/Missing.md]`): exit 0, `stdout` empty, exactly two stderr lines — the unmatched
   note and the excluded `Journal/` folder. `Handbook` itself (matched, not floor-withheld) earns no
   line, confirming the `unmatchedSet`/`isEntryWithheldByFloor` gating is mutually exclusive per entry,
   not additive. 3.2's stdout-empty assertions still hold on every existing CLI test.

6. **Scope — clean.** No touch to section 4 (no `pipeline`/`render`/`rehype`/`remark` files exist yet).
   `reportWarnings` lives in `src/index.ts` exactly as the brief specified so that 6.1 extends it rather
   than replacing a rival implementation — it is not a second, competing warning reporter. `src/config.ts`
   untouched; `unmatched`/`isExcluded`'s pre-existing behaviour untouched.

**Nits**

- `src/index.ts:53-58` — the `kind === "note"` branch of `isEntryWithheldByFloor` (a config `notes:`
  entry naming a directly floor-excluded file, e.g. `notes: ["CLAUDE.md"]`) is never exercised by any
  test. `test/fixtures/warnings-vault/publish.config.yaml`'s one `notes:` entry
  (`Handbook/Missing.md`) is unmatched, not floor-withheld, so only the `folder` branch gets covered
  (via `Journal/`). I traced the code and it's correct — `isEntryWithheldByFloor(entry, "note")` is
  `isExcluded(entry)` unchanged, already proven by the 3.4 tests — so I'm not blocking on it, but a
  worker's own architect-flagged addition landing with one of its two branches untested is exactly the
  section's standing "never examined that territory" pattern in miniature. Worth a one-line addition
  (a floor-excluded `notes:` entry in `warnings-vault`'s config, or a direct unit test on
  `isEntryWithheldByFloor`) before this block closes, or noted to `## NEXT` if the Architect judges it
  non-blocking.

**Verdict: Approve with nits.** No blockers — the floor refactor is a verified no-op, the new warning
line is pure reporting with a traced non-path back into `published`, both 3.7 negative controls
reproduce independently in both directions, stdout stays clean, exit stays 0, and scope held to 3.6/3.7
exactly. The one nit (untested `note`-kind branch of `isEntryWithheldByFloor`) doesn't touch
confidentiality — worst case it's a warning line that fails to print, not a selection defect — so it's
a nit, not a blocker; worker or architect's call whether to close it now or park it.

→ @architect

→ @reviewer

**[worker]** Follow-up to reviewer nit, block **3.6–3.7**. Closed the coverage gap: `isEntryWithheldByFloor`'s `note` branch was untested (only `Journal/` via `folders:` exercised the `folder` branch).

Added a `CLAUDE.md` file to `test/fixtures/warnings-vault/` (invented content) and a `notes:` entry naming it in that fixture's `publish.config.yaml`, alongside the existing `folders:`/`notes:` entries — nothing else in the fixture changed. Updated the existing 3.6 test to also assert the `"CLAUDE.md" is excluded and will not publish` line and adjusted the exact-line-count assertion from 2 to 3. Added one new test that: reads the fixture `CLAUDE.md` directly and asserts positively it contains the content the test claims, runs the real CLI against the same config, and asserts the `notes:`-entry warning line appears — the case the reviewer named.

**Negative control**, same shape as the rest of the block: short-circuited the `notes` loop in `reportWarnings` (`if (false && ...)`), ran `test/index.test.ts` directly — both the existing and the new test failed, the existing one on the line count (2 vs 3, missing the `CLAUDE.md` line) and the new one on `stderr` not containing it — while the other three CLI tests stayed green. Restored `src/index.ts`, `diff`-confirmed byte-identical to pre-mutation.

Nothing else in the block changed — `src/selection.ts`, `src/config.ts` untouched by this follow-up.

**Gates:** `BUILD_EXIT:0` `TEST_EXIT:0` `FORMAT_EXIT:0` `LINT_EXIT:0` `VALIDATE_EXIT:0`. 34 tests total (up from 33: one new).

→ @reviewer

**[reviewer]** Re-audit, block **3.6–3.7** — nit closed.

**Source-change claim verified, not taken.** Diffed the current `src/index.ts` and `src/selection.ts`
byte-for-byte against the copies I pulled _during_ my own negative-control runs (i.e. the exact state I
approved) — both identical. `git diff` against `a72bf81` still shows the same source hunks I already
reviewed; nothing new landed in either file under cover of this follow-up. The change is confined to
`test/index.test.ts` and the new `test/fixtures/warnings-vault/CLAUDE.md` +
`notes: [CLAUDE.md]` config entry, as reported.

**New coverage — exercises the real gap, through the real path.** The added test first `readFile`s
`test/fixtures/warnings-vault/CLAUDE.md` and asserts its content, so the fixture's existence is proven,
not assumed, then runs the actual CLI (`spawnSync` on `src/index.ts`) against the updated
`warnings-vault/publish.config.yaml` (now `notes: [Handbook/Missing.md, CLAUDE.md]`) and asserts the
new warning line is present, with the first test's line count moved from 2 to 3 to keep it exhaustive.
This exercises `isEntryWithheldByFloor(entry, "note")` for the first time, through `reportWarnings` in
`src/index.ts`, not a unit call — closing the gap as asked rather than adding an isolated unit test that
would leave the CLI wiring unverified.

**Reproduced the worker's negative control myself.** Replaced the `notes` loop body's iterable with `[]`
in a scratch edit (`for (const entry of []) {`), leaving the `folders` loop untouched, and ran
`test/index.test.ts` directly: both new tests failed — the line-count/line-presence assertions in the
first test, and the `stderr` containment assertion in the second — while the original three CLI tests
and the `Journal/`-folder warning stayed correctly represented in the first test's other two
`toContain`s (i.e. the failure was specific to the note branch, not a wholesale break). Restored,
`diff`-confirmed byte-identical.

**Fixture hygiene, specific to this fix.** `git check-ignore -v test/fixtures/warnings-vault/CLAUDE.md`
→ no match, exit 1: tracked, not ignored (the repo's `vault/`/`.vault/` `.gitignore` rule doesn't touch
a bare filename). `git status --untracked-files=all` lists it `??`, ready for the Architect's commit.
Content is `# Invented Root File` plus two invented sentences — diffed against the repo's own root
`CLAUDE.md`: completely different, not a copy or excerpt. Checked whether anything in tooling would
treat it as a real instructions file: it sits under `test/fixtures/`, `.prettierignore` has a
pre-existing bare `CLAUDE.md` line (untouched by this diff, confirmed by `git diff a72bf81 --
.prettierignore` being empty) which formats it out of the format gate the same way it already treats
the repo's own root file, but `prettier --check` on it directly (bypassing ignore) shows it's
well-formed Markdown regardless; no other tool in the repo reads `CLAUDE.md` as configuration or as an
agent's context outside the real root file's own path.

**Gates, re-run:** `BUILD_EXIT:0 TEST_EXIT:0 (34 tests) FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0
GATES_EXIT:0`.

**Verdict: Approve.** No blockers, no nits outstanding. Source state is exactly what I already
reviewed; the new coverage genuinely exercises the previously-untested branch through the real CLI
path with a fixture whose existence and content are asserted rather than assumed, and I reproduced its
failure independently.

→ @architect

**[supervisor]** Section review of `642719f..HEAD` (3 blocks: `f91c337`, `a72bf81`, `aad9703`; 3
source files, 4 test files, 4 fixture vaults, 34 tests). **Request changes.**

Every block was reviewed and approved, and I am not re-opening any of them. Everything below is
visible only across the three commits together, or by probing the code as shipped rather than as
diffed.

**What holds.** All four `note-selection` requirements are satisfied against the code as it stands,
including the two scenarios no task names — I ran them rather than reading for them.
`resolveSelection` publishes `Handbook/Sub/Deep/Note.md` from `folders: ["Handbook"]` (Folder
selected, "including its subfolders"), and the `audience:`-key scenarios are exercised through the
real `listVaultNotes` → `resolveSelection` path with the frontmatter positively asserted in the
fixture. Fail-closed on malformed/unreadable config is real and reaches the process exit code. The
published-set _model_ is single: `resolveSelection` at `src/selection.ts:28` is the only place that
says yes, `config.ts` only ever rejects whole configs, and `index.ts` only reads. Gate coverage is
sound — `npm run build` runs `tsc --build` **and** `tsc -p tsconfig.check.json`, which includes
`test`, and eslint parses against the same check config, so nothing this section added is
unbuilt or unlinted.

---

### B1 — The section's central guarantee rests on an unasserted third-party behaviour, and the floor does not stand behind it. (3.3–3.5, `src/selection.ts:118`)

This is the finding that made me request changes, and it is a stronger version of the concern parked
at §6.4.

`listVaultNotes` is safe only because Node's recursive `readdir` does not descend directory symlinks.
I verified that empirically on Node v24.13.1: a `Handbook/Link -> ../Private` symlink comes back
`isDirectory()=false, isSymbolicLink()=true` and is never descended; a symlinked note
`Handbook/Alias.md` comes back `isFile()=false` and is dropped. So the behaviour is correct today.

The problem is what sits behind it — nothing. I probed the floor directly:

```
resolveSelection({folders:["Handbook"]}, ["Handbook/Link/Secret.md"])
  → published: [ 'Handbook/Link/Secret.md' ]
```

`isExcluded` (`src/selection.ts:87-93`) matches floor folders by **segment name**. A path that
reaches it under an alias segment — `Link` — is published, because `Link` is not in the floor. The
exclusion floor therefore provides **no defence in depth** against a symlink escape: the entire
protection is `readdir`'s undocumented traversal semantics, verified twice by hand and asserted zero
times in the repository.

That combination is what makes parking it wrong. §6.4 is a _test_; what is missing is not only a test
but the backstop the test would protect. `listVaultNotes` filters on `entry.isFile()`, which excludes
symlinks as a side effect of the dirent's type rather than as a stated intent — a future change to
`.filter()` written to accept "files and things that resolve to files" would reopen it silently, and
no floor test would go red.

**Remediation:** make the exclusion explicit and assert it. In `listVaultNotes`, skip
`entry.isSymbolicLink()` by name rather than by implication, and add a fixture vault containing (a) a
directory symlink from a selected folder into `Private/` and (b) a file symlink to a note inside
`Private/`, asserting neither appears in `published`. Give it the section's negative control: remove
the guard, show both tests fail. This is the last section where that fix is free.

**Also record the second-order behaviour it exposes**, which is safe but silent: a symlinked note
anywhere in the vault is dropped from the walk with no warning line. Withholding is the right
direction; the silence is worth a `## NEXT` entry.

### B2 — `EXCLUSION_FLOOR`'s entry format is an unenforced convention, and the next entry added to it will silently do nothing. (3.3–3.5 as refactored by 3.6–3.7, `src/selection.ts:10-16, 68-78`)

`EXCLUSION_FLOOR` is typed `readonly string[]`. Both predicates the last block extracted —
`matchesFloorFolder` compares one entry to a single path **segment**, `matchesFloorFile` compares one
entry to a **basename** — only understand single-segment entries. Add the obvious next thing anyone
will add to this list, `Clients/Internal/`, and it appears in the constant, reads as protective, and
excludes nothing: `"clients/internal"` is never equal to any one segment, and never equal to any
basename.

The one test on the constant (`test/selection.test.ts:122-131`) asserts its literal current contents,
so an addition breaks it — but the fix is a one-line edit to the expected array, after which the
ineffective entry is green. The test catches _that the list changed_, not _that the list works_.

**Remediation:** replace the literal-contents assertion with a data-driven test over
`EXCLUSION_FLOOR` itself — for every entry, synthesise a path at the vault root and at depth and
assert `resolveSelection` withholds it under a config that selects its parent; and assert every entry
is single-segment (or change the constant's shape so a multi-segment entry cannot be expressed). That
makes every future addition self-proving, which is the property this constant needs and currently
does not have.

### B3 — The floor's negative control was run against code the last block then rewrote. (3.4–3.5 vs 3.6–3.7)

`a72bf81`'s control — empty `EXCLUSION_FLOOR`, 7 fail / 4 pass, each failure read individually — is
the best evidence in this section, and it was run against the pre-refactor implementation. `aad9703`
then extracted `matchesFloorFolder` and `matchesFloorFile` out of `isExcluded` and added a **second
floor predicate**, `isEntryWithheldByFloor` (`src/selection.ts:106-111`), whose `folder` branch has
its own matching rule (`entry.split("/").some(matchesFloorFolder)` — all segments, including the
last) distinct from `isExcluded`'s (directory segments only).

The reviewer's byte-identical diff check covered the _follow-up commit's_ test-only claim, not the
refactor. Nothing in the thread records the emptied-floor control being re-run afterwards. For the
code as shipped, the section's own standing rule — every exclusion test shown to fail when the
protection is removed — has not been demonstrated. It is a five-minute re-run, and skipping it is how
a refactor of a proven protection becomes an unproven one.

**Remediation:** re-run the emptied-`EXCLUSION_FLOOR` control on `HEAD` and record the failure count
and shapes, and separately mutate `isEntryWithheldByFloor` to return `false` and confirm the 3.6 CLI
assertions go red — that predicate has never had a control of its own.

### B4 — The floored-entry warning is suppressed in exactly the case that most needs it. (3.5 vs 3.6, `src/index.ts:47,55`)

`folders: ["Private"]` against a vault with no `Private/` directory:

```
resolveSelection → { published: [], unmatched: [ 'Private' ] }
```

`unmatched` wins, and `!unmatchedSet.has(entry)` suppresses the exclusion line. The owner is told
`[WARNING] publish.config.yaml: no path in the vault matches "Private"` — which reads as _create the
folder and this will work_. It never will. This is precisely the state `note-selection`'s "Excluded
folder does not yet exist" scenario describes, and the warning added in 3.6 to prevent silent
confusion is, in that state, actively misleading instead.

The two blocks are individually right — 3.5 built the resolution, 3.6 built the guard — and the
interaction is only visible with both in front of you.

**Remediation:** check the floor _before_ the unmatched set in `reportWarnings`; a floored entry
should always get the exclusion line, whether or not the path currently exists. One test per branch.

---

### ❓ @architect — a spec collision the section creates, which is the Product Owner's call, not a fix block's

`publish-pipeline`'s "Degraded content is reported as a warning" scopes `[WARNING]` lines to
"each wikilink it could not resolve and each Bases query block it dropped", and its **"Nothing
degraded"** scenario reads: _WHEN every link resolves and no block is dropped THEN the build output
contains no warning lines._

This section now emits `[WARNING]` lines for a class the requirement does not cover — unmatched and
floored **configuration entries** — so a publish with a stale config entry and perfectly clean
content produces warning lines while satisfying that scenario's WHEN. The unmatched line is not
optional: `note-selection` mandates it ("THEN the publisher reports the unmatched entry"). So the
defect is in the `publish-pipeline` scenario's absoluteness, not in this code.

It needs settling **before** §4, or whoever writes the "Nothing degraded" test will write it against
whichever reading they happen to hold, and one of the two specs will be quietly wrong. My
recommendation: broaden the `Degraded content` requirement to cover selection warnings, and narrow
the scenario to "no warning lines **about content**". Spec edit, Product Owner's call — I am not
carving it into the fix block.

---

### On the four decisions you asked me to second-guess

**(a) Case-sensitive selection, case-insensitive floor — right, keep it.** I tested the argument
rather than accepting it. A mis-cased folder entry publishes nothing _and_ announces itself:

```
resolveSelection({folders:["handbook"]}, ["Handbook/Index.md"])
  → { published: [], unmatched: [ 'handbook' ] }
```

So the selection half fails toward withholding **loudly**, not silently, which is the strong version
of your argument. The floor half is a pure subtraction applied last, so case-insensitivity there can
only ever remove more. There is no configuration in which the asymmetry over-publishes. The one thing
to fix is documentation: the comment at `src/selection.ts:80-86` justifies the floor's
case-insensitivity but never records that selection is deliberately the opposite, so the next reader
will read it as an oversight and "fix" it. Add one sentence.

**(b) Floor matches by segment or basename at any depth — right, and it is what makes (d) safe.** If
the inferred vault root is ever off by a level, `Journal/` still matches as a segment; a root-anchored
floor would not. Its cost is a silent false positive: a legitimate `Handbook/Journal/` or
`Handbook/Private/` is withheld with no warning at all, because the floored-entry warning inspects
_config entries_, never the notes actually dropped. Safe direction, so `## NEXT` rather than the fix
block — but the eventual answer is a summary line (`N notes withheld by the exclusion floor`) so the
owner can see the floor working rather than infer it from a missing page.

**(c) The extra warning line — in scope, keep it**, subject to B4 (it does not fire when it matters
most) and the `❓` above (it is the thing that collides with `publish-pipeline`). You were right that
silently publishing nothing for a named entry is the confusing case.

**(d) Vault root inferred from the config's directory — acceptable now, but it is an undeclared
contract.** Today it fails safe and loud: a config in the wrong directory makes every entry unmatched
and warns on each. What makes me uneasy is §6/§7, where `action.yml` must decide whether the vault
root is an **input** or derived. If it ever becomes a caller-supplied path independent of the config,
the section's "one owner" property goes with it — a caller-supplied file list or root is exactly the
shape that routes around the floor. Put it in the §6 brief explicitly: the root stays derived, or the
floor gets applied to the resolved absolute path rather than the walk-relative one.

---

### Architectural notes → `## NEXT` (not for the fix block)

1. **There is a second gate above `resolveSelection`, and it is `listVaultNotes`.** The published-set
   _model_ is single and coherent — one function says yes. But the _candidate universe_ is decided
   separately: files only, `.md` only, symlinks dropped. Every one of those is exclusionary and
   therefore safe, which is why it is a note and not a blocker — except the one inclusive case, which
   is B1. Worth stating in `selection.ts` so a later block does not treat the walk as neutral.

2. **`published` is computed and discarded.** `src/index.ts:26` destructures only `unmatched`. Nothing
   in the shipped entry point knows the published set; the only integrated assertion of it lives in
   `test/selection.test.ts:134`, calling the two functions directly. Correct for this section — but §4
   must wire `published` through, and the CLI-level assertion that the floor holds _end to end_ does
   not exist yet.

3. **`reportWarnings` is the warning reporter, and it is trapped inside the CLI entry point.**
   `src/index.ts:35-61` establishes the `[WARNING] <file>: <message>` shape as a private function in
   `main`'s module, where §4's rendering warnings cannot reach it. "One warning reporter" is on the
   binding list, and §4 is the moment it gets broken. Extract it to `src/warnings.ts` before §4 grows
   a second one — either as an opt-in extra in this fix block or as the first task of §4, your call.
   §6.3 rewrites `index.ts` anyway, so moving it now costs nothing.

4. **Import-extension drift.** `src/index.ts:2-4` imports `./config.ts` / `./selection.ts`;
   `src/selection.ts:3` and every test import `./config.js`. Both compile under
   `rewriteRelativeImportExtensions`, so this is cosmetic — but it is one module graph written two
   ways across two blocks, and §6.3 is the moment to settle on one.

5. **`.prettierignore`'s bare `CLAUDE.md` is unanchored**, so it now also excludes
   `test/fixtures/selection-vault/CLAUDE.md` and `test/fixtures/warnings-vault/CLAUDE.md` from the
   format gate. Same class as the `.gitignore` `vault/` trap the worker hit in 3.3–3.5 and reported.
   Anchor both (`/CLAUDE.md`, `/vault/`, `/.vault/`) before another fixture name gets unlucky.

---

**Suggested shape of the remediation block:** one block, source + tests, no new `N.M` numbers —
B1 (explicit symlink exclusion in `listVaultNotes` + fixture + negative control), B2 (data-driven
floor test replacing the literal-contents assertion), B4 (reorder the floor check ahead of the
unmatched guard in `reportWarnings`, one test per branch), and B3 as a verification task with its
observations recorded in the thread. B1 and B2 are the ones that matter; B4 is small and belongs in
the same commit. The `❓` on `publish-pipeline` is not part of it.

→ @architect
**[architect]** Section 3 supervisor verdict: **Request changes**, four blockers. Carving **one
remediation block** covering all four. No new `N.M` numbers and nothing to tick — every box in the
section is already ticked; this thread is the record.

**I accept all four, and B1 is the one that matters.** The supervisor did not argue that the symlink
path was risky, it ran it: `resolveSelection({folders:["Handbook"]}, ["Handbook/Link/Secret.md"])`
returns that path as published, because `isExcluded` matches floor folders by segment name and `Link`
is not in the floor. Node's `readdir` not descending directory symlinks is the only reason that path
never arises today — one library's traversal behaviour, standing alone, protecting the property this
whole change exists to hold. Parking a test at §6.4 was the wrong call: what is missing is not only
the assertion but the backstop it would have protected.

**The remediation block — four items:**

**B1 — make the vault boundary explicit and give it a backstop.** In `listVaultNotes`: skip symlinks
by stated intent rather than as a side effect of `entry.isFile()`, and add a containment check —
resolve each candidate's real path and drop anything that does not lie under the resolved vault root.
That is the backstop the floor cannot provide, because the floor matches names and this attack
supplies a name that is not in it. Cover it with a real symlink in a fixture (create it in test
setup rather than committing one), pointing both out of the vault and at an excluded folder, and
show the tests failing when the skip and the containment check are each removed.

**B2 — `EXCLUSION_FLOOR`'s single-segment format is currently an unenforced convention.** Both
predicates only understand single-segment entries, so `Clients/Internal/` would read as protective
while excluding nothing. Enforce it: assert at module load that every entry is a single segment, and
make the floor tests **data-driven from `EXCLUSION_FLOOR` itself** so that adding an entry gets
coverage automatically instead of needing someone to remember. The existing literal-contents test
catches that the list changed; it does not catch that the list works.

**B3 — re-run the floor's negative control against the code as it now stands.** The emptied-floor run
(7 fail / 4 pass) is the strongest evidence in this section, and it was run against predicates the
next block then extracted and rewrote. `isEntryWithheldByFloor` has never had a control at all. Empty
the floor against current `HEAD`, record what fails; then break `isEntryWithheldByFloor` specifically
and record that too. This item is verification, not code — its deliverable is the DEVLOG post.

**B4 — the floored-entry warning is suppressed in exactly the case that needs it.** `folders:
["Private"]` with no `Private/` in the vault reports "no path in the vault matches", which reads to
the owner as _create it and this will work_. Check the floor before the unmatched guard so an absent
excluded path is reported as excluded, and test that ordering.

**Not in this block:** the supervisor's `❓` on `publish-pipeline`'s "Nothing degraded" scenario — it
says the build output contains **no** warning lines, while `note-selection` mandates the unmatched
line. That is a spec contradiction and it is the Product Owner's call, not a thing to fix in code. It
is going to them now, before §4 writes that test.

**[worker]** Section 3 remediation block — B1, B2, B3, B4. No new `N.M` numbers, nothing ticked.

**B1 — the vault boundary.** `listVaultNotes` now does two things it didn't before: it drops any
entry where `entry.isSymbolicLink()` explicitly (stated intent, not a side effect of `isFile()`), and
it resolves every candidate's real path and compares it — as a _relative_ path, root-to-root — against
the naive path the walk produced. Any mismatch means a symlink redirected somewhere along the way, and
the candidate is dropped.

**A real finding while building the fixture, worth recording precisely.** I first tried to reproduce
the supervisor's exact PoC (`Handbook/Link → ../Private`) against the shipped `listVaultNotes` and
could not make it leak. Traced it to a genuine Node discrepancy I verified directly:
`fs.readdirSync(dir, {recursive: true})` **does** descend into a symlinked directory and returns its
real children flattened into the result; `fs.promises.readdir(dir, {recursive: true})` — what this
code has always used — **does not**. Confirmed both ways on the same Node v24.13.1, same fixture, back
to back. So the shipped `listVaultNotes → resolveSelection` pipeline was not actually exploitable via a
directory-symlink alias; the supervisor's PoC exercised `resolveSelection` directly with a synthetic
path array, which is a real defense-in-depth gap in the floor's own logic, not a live hole in the walk
as it stood. I'm recording this rather than quietly building around it, because it's exactly the
"undocumented third-party behaviour" the supervisor's finding warned against relying on — we were
already relying on it, just on the safe side of an inconsistency that could flip under a sync
implementation, a different Node version, or a future refactor of the walk.

**Fixture and its own positive assertions:** `test/selection.test.ts`, "B1 the vault boundary" —
`beforeAll` creates a scratch vault under `mkdtemp(os.tmpdir())` (never inside `test/fixtures/`, never
committed), with a real `Handbook/AliasToPrivate → ../Private` (aliases the excluded folder under a
name the floor doesn't know) and a real `Handbook/Escape → <outside dir>` (points entirely outside the
vault). A dedicated test `lstat`s both and asserts `isSymbolicLink() === true` before any exclusion
test runs. `afterAll` removes the whole scratch tree. Four tests: the fixture assertion, "not published
via the alias," "not published via the escape," and "the vault's real notes still publish."

**Negative controls, run against the fixture with the sync-`readdir` behaviour actually reproduced**
(since the async path doesn't trigger the hole today, I proved the fix against the vulnerable
_class_ of behaviour directly, not just the currently-safe instance of it):

- Fixed logic (symlink skip + naive-vs-resolved comparison) layered over `fs.readdirSync` → both
  `Handbook/AliasToPrivate/Secret.md` and `Handbook/Escape/Leaked.md` correctly absent; real notes
  present.
- **Only the naive-vs-resolved comparison, no explicit symlink skip** → same clean result — the
  comparison alone already excludes a symlink leaf, since its own realpath differs from its naive path.
- **Only the explicit symlink skip, no naive-vs-resolved comparison** → both leaks reappear
  (`Handbook/AliasToPrivate/Secret.md`, `Handbook/Escape/Leaked.md`) — the leaf-level check does nothing
  for a _descendant_ of a followed symlinked directory, since the descendant isn't itself a symlink.

**Honest conclusion, not the one I went in expecting:** the naive-vs-resolved relative-path comparison
is the single protection actually doing the work; the explicit `entry.isSymbolicLink()` skip, present
because the brief asks for it by name and because it documents intent no `isFile()` filter states on
its own, is empirically redundant given the comparison. I kept both — the skip is cheap, correct, and
insurance against a future rewrite that changes how the comparison is derived — but I'm not claiming a
negative control result that doesn't hold. This is exactly the "prove the check can fail" standard
applied to my own two checks, not just the feature.

**B2 — `EXCLUSION_FLOOR` format.** Added a module-load assertion: every entry, trailing `/` stripped,
must not contain `/`, or the module throws before anything else runs. Replaced the literal-contents
floor-effectiveness test with `describe.each(EXCLUSION_FLOOR)`, generating two tests per entry
(withheld at the vault root beside a publishing sibling; withheld nested inside a selected folder
beside a publishing sibling) — a future addition to the constant gets this coverage for free.

Negative control: added `"Clients/Internal/"` to the list.

- With the module-load assertion in place → the whole suite fails to load:
  `EXCLUSION_FLOOR entry "Clients/Internal/" has more than one path segment...` — fail-closed, as
  intended.
- With _only_ the assertion removed (bad entry still present) → "contains only single-segment
  entries" fails, and both generated `Clients/Internal/` tests fail with the entry actually present in
  `published` — exactly the "reads as protective, excludes nothing" failure mode the supervisor named.
- Reverted; 28/28 green.

**B3 — verification only, no code change beyond B1/B2/B4.** Re-ran the emptied-`EXCLUSION_FLOOR`
control against `HEAD` as it now stands (after B1/B2/B4): 10 tests failed (3.4's three, 3.5's two, the
"is fixed in code" literal-list test, the on-disk fixture-vault test, both 3.6 CLI warning tests, and
the new B4 CLI test), 14 passed — the data-driven `describe.each` block itself produces zero tests
against an empty array rather than failing, which is correct (nothing to iterate), not a false green.
Separately broke `isEntryWithheldByFloor` to `return false` unconditionally: both 3.6 CLI tests and the
new B4 test went red (the two 3.6 tests missing their "is excluded and will not publish" lines, B4
losing its only expected line entirely) — this predicate had never had a control of its own before.
Reverted both; 50/50 green.

**B4 — warning precedence.** `reportWarnings` now computes the floor-withheld sets for `folders` and
`notes` first, emits their warning lines, then emits the unmatched-entry line only for entries not
already covered by a floor line. `folders: ["Private"]` against a vault with no `Private/` now reports
only `"Private/" is excluded and will not publish` — the unmatched line never fires for it. New fixture
`test/fixtures/absent-floor-vault/` (a real `Handbook/Index.md` plus a config naming `Handbook` and
`Private`, no `Private/` on disk); `git status --untracked-files=all` confirms both fixture files
tracked-visible, not swallowed by the `vault/` `.gitignore` rule. New CLI test asserts the excluded
line is present, the unmatched line is absent, and exactly one warning line is emitted.

**Gates:** `BUILD_EXIT:0 TEST_EXIT:0 (50 tests) FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0`
(`GATES_EXIT:0` combined).

→ @reviewer

**[reviewer]** Section 3 remediation block (B1–B4, `src/selection.ts`, `src/index.ts`,
`test/selection.test.ts`, `test/index.test.ts`, `test/fixtures/absent-floor-vault/`).

**Verdict: Request changes.** One blocker, on B1's tests specifically — the containment logic itself
is right and I independently proved it; the committed suite does not prove it.

**Gates independently re-run:** `BUILD_EXIT:0 TEST_EXIT:0 (50 tests) FORMAT_EXIT:0 LINT_EXIT:0
VALIDATE_EXIT:0 GATES_EXIT:0` — confirmed via `make gates`, exit lines quoted, not inferred from log
text.

**Blocker — the B1 symlink-boundary tests pass whether or not the fix is present, so they are not the
backstop this block was supposed to give the containment check.** I built the diff's own `dist/`,
reproduced `test/selection.test.ts`'s exact fixture (a directory symlink aliasing `Private/`, a
directory symlink escaping the vault) against both the shipped `listVaultNotes`
(`src/selection.ts:151-176`) and a from-scratch reimplementation of the pre-remediation function (no
symlink skip, no naive/resolved comparison). Both produced identical output —
`['Handbook/Index.md', 'Private/Secret.md']`, no leaked path either way — because `node:fs/promises`'
`readdir(..., {recursive: true})` never descends a symlinked directory in the first place (confirmed
directly on the same Node v24.13.1: `readdirSync` returns
`Handbook/AliasToPrivate/Secret.md`, `fsp.readdir` stops at the `AliasToPrivate` entry itself and
never yields it). So the worker's Node finding is correct — I verify it, not just accept it — but its
consequence for the test suite wasn't carried through: the four "B1 the vault boundary" tests
(`test/selection.test.ts:163-243`) exercise `listVaultNotes` through the same async `readdir` that
makes the scenario unreachable regardless of the fix, so `git stash` the containment check and the
symlink skip both and this suite is still 28/28 green. That is exactly the "reads as protective,
proves nothing" shape B2 was carved to fix for `EXCLUSION_FLOOR` — it applies here too, one function
over.

The underlying fix is not in question — I isolated the naive-vs-resolved comparison
(`src/selection.ts:164-171`) and drove it directly with a hand-built `entry.parentPath` under the
alias (simulating what a sync walk, or any future walk implementation, would hand it): naive
`Handbook/AliasToPrivate/Secret.md` vs. resolved `Private/Secret.md`, correctly caught and dropped.
I also drove your item-1 case explicitly since it's the one that fails unsafe if it fails at all — a
vault root itself reached through a symlinked ancestor (`/tmp` → `/private/tmp` on this machine, which
is exactly the case since fixtures live under `os.tmpdir()`): `resolvedRoot = realpath(vaultRoot)` and
`resolvedPath = realpath(absolutePath)` both inherit the same ancestor resolution, so it cancels out
of the relative-path comparison and ordinary vault contents are **not** dropped. I confirmed this on
the real fixture (`Private/Secret.md` published) and by hand on the isolated comparison. The check
fails closed only on a genuine internal redirection, not on every file, so B1's design is sound — the
gap is entirely that the suite can't fail if someone breaks it.

**Also worth recording:** the "sync-readdir" negative controls described in the worker's report above
(fix layered over `readdirSync`; skip-only; comparison-only) were run by hand and are not in the
repository in any form — not as a committed test, not as a script under `test/fixtures/` or similar.
I reproduced them independently for this review (same three-way result: comparison alone holds, skip
alone does not), so I can confirm the claim, but as shipped there is nothing a future contributor can
re-run to get the same answer; the only record is DEVLOG prose describing a session that no longer
exists.

**Remediation:** make the descendant-of-a-followed-symlink path actually reachable in the committed
suite, deterministically, rather than depending on `readdir`'s undocumented (and, per your own finding,
inconsistent between sync and async) symlink-traversal behaviour. Two ways that would satisfy this,
either is fine:

1. Extract the per-candidate boundary check (`src/selection.ts:164-171`) into a small pure function —
   e.g. `isWithinVaultRoot(vaultRoot, resolvedRoot, absolutePath): Promise<boolean>` — so it is
   testable the same way `resolveSelection` already is: with constructed inputs, no dependence on what
   the walk happens to enumerate. Add the descendant-of-a-symlinked-directory case as one of those
   inputs, and a test that flips the comparison to always-true to confirm it goes red.
2. Or change `listVaultNotes` to walk manually (non-recursive `readdir` per directory, explicit
   recursion) instead of relying on the built-in `recursive: true` flag, so the walk's symlink
   behaviour is this code's own decision and testable directly rather than inherited from the runtime.

Either way, the four existing fixture tests are good as an integration-level sanity check and should
stay — they just aren't, on their own, evidence the containment check does anything.

**Nits:**

- `src/selection.ts:94-99` — the comment says the explicit `isSymbolicLink()` skip is "empirically
  redundant given the comparison" is the worker's own honest conclusion in the DEVLOG, but the code
  comment reads as unconditionally justifying both checks as load-bearing. Worth a one-line note in
  the code (not just the DEVLOG) that the skip is a stated-intent/insurance layer, not the thing
  proven to hold — so the next reader doesn't reach for it as the primary defense.
- B2, B3, B4 all check out: `EXCLUSION_FLOOR`'s module-load assertion runs at import (verified — the
  only production import of `selection.ts` is `src/index.ts:4`, a static top-level import, so it
  fires before `main()` on every real invocation), `describe.each(EXCLUSION_FLOOR)` asserts actual
  `resolveSelection` behavior per entry rather than list contents, B4's reordering in
  `src/index.ts:37-77` is correct and I traced both directions (a floor-withheld+unmatched entry now
  gets the exclusion line instead of the unmatched line — a substitution, not a suppression; a
  floor-withheld+matched entry is unaffected; a plain unmatched non-floor entry still gets its line
  unchanged), and the new `test/fixtures/absent-floor-vault/` files are confirmed untracked-but-visible
  (`git status --untracked-files=all`), not swallowed by `.gitignore`.
- Regression check: `src/config.ts` and `test/config.test.ts` are untouched by this block (fail-closed
  config loading unaffected); `resolveSelection`'s only floor application is still the same final
  `!isExcluded(...)` subtraction it always was; the new `listVaultNotes` boundary logic only ever
  `continue`s past a candidate, never adds one — nothing in this diff can grow the published set.
  `tasks.md` is untouched, no new `N.M` numbers, no new runtime dependency (`realpath` is an existing
  `node:fs/promises` export).

→ @worker

**[worker]** B1 follow-up — reviewer's blocker addressed. `src/selection.ts` reshaped:

**1. The walk's recursion is now explicit code, not `readdir`'s undocumented behaviour.**
`collectCandidatePaths` reads one directory at a time via plain `readdir(dir, {withFileTypes:true})`
(no `recursive: true`) and recurses itself, deciding per entry. A symlinked directory is never
descended — refused unconditionally, regardless of what it resolves to. A symlinked _file_ is not
excluded at this stage; it is collected as a candidate like any other and left to the boundary check
below, since its own realpath can never equal its naive path.

**2. The boundary check is now a pure, exported, directly-testable function** —
`isWithinVaultBoundary(vaultRoot, resolvedVaultRoot, absolutePath, resolvedPath)` — comparing the two
paths _relative to their own roots_, not an absolute-path prefix. Four unit tests, no filesystem:
allows a clean path; allows a path when the vault root itself sits under a symlinked ancestor
(constructed to match the fixtures' own situation on macOS — `os.tmpdir()` resolves through `/tmp` ->
`/private/tmp`, so a naive prefix check would have wrongly excluded every fixture note); drops an
in-vault alias; drops an outside-vault escape.

**Fixture extended to two more symlinks** — `Handbook/DirectAlias.md` (a _file_ symlink straight to
the excluded `Private/Secret.md`) and `Handbook/DirectEscape.md` (a file symlink straight outside the
vault) — alongside the original two directory symlinks. 34 tests total in `selection.test.ts` (was 28):
4 new pure-predicate tests, 2 new full-pipeline tests for the file-symlink cases, plus the existing
fixture/directory-alias/escape/real-notes tests, now checking four symlinks instead of two.

**Negative controls, redone against this shape, both run to completion, results recorded honestly:**

- **Remove containment** (`isWithinVaultBoundary`'s call site deleted from `listVaultNotes`, walk's
  directory-skip untouched) → **2 of 34 tests fail**: `Handbook/DirectAlias.md` and
  `Handbook/DirectEscape.md` both appear in `published` — the file-symlink cases leak in the _full
  pipeline_, exactly as expected, since nothing else in the walk excludes a symlinked file that isn't
  a directory. The two directory-symlink tests (`AliasToPrivate`, `Escape`) stay green — masked by the
  walk's own directory-skip, which this ablation didn't touch. Restored; 34/34.
- **Remove the walk's directory-descent skip** (per-entry type now decided uniformly by `stat()`,
  which follows symlinks, instead of refusing any `isSymbolicLink()` entry before deciding) →
  **34/34 still pass.** Said plainly, per the brief: this protection's removal does not fail the
  suite as it stands, because `isWithinVaultBoundary` (untouched by this ablation) independently
  catches every candidate the reopened directory descent produces — its realpath never equals its
  naive path either. I did not stop at the full-pipeline result; I isolated `collectCandidatePaths`
  in a throwaway script against the same fixture shape, fixed vs. ablated, and confirmed the walk's
  own raw output _does_ differ:
  `Fixed: ['Handbook/Index.md', 'Private/Secret.md']` vs.
  `Ablated: ['Handbook/AliasToPrivate/Secret.md', 'Handbook/Escape/Leaked.md', 'Handbook/Index.md', 'Private/Secret.md']`
  — the walk's own contract (never return a path reached through a followed symlink) is genuinely
  falsifiable and was shown to fail at that level; the full `listVaultNotes` result is not, because
  the boundary check is a comprehensive backstop by construction. Restored; 34/34.

**So: one check has a full-pipeline negative control (containment); the other has a walk-level one**
(the directory-descent skip) **and no full-pipeline one, because the first check's job is done
completely enough to mask the second's removal.** That is reported here as fact, not smoothed over —
per the brief, if a protection's removal doesn't fail the suite, that gets said rather than a green
report. The two checks are still both worth keeping: the skip avoids needlessly opening (and, on some
platform or future refactor, trusting the contents of) a symlinked directory at all, and it is what
stands between a weakened or removed boundary check and a live leak — exactly the layering the
original B1 finding was about. Flagging for the reviewer/architect in case a different shape is
wanted; I did not weaken either check to make a test pass.

**Also fixed:** the file-symlink candidates now correctly flow through the same `isWithinVaultBoundary`
check as everything else (previously the whole entry class was just blanket-excluded via
`isSymbolicLink()`, which happened to be safe but gave the boundary check nothing of its own to prove
itself against in the full pipeline — this is what makes control 1 above possible at all).

**Gates:** `BUILD_EXIT:0 TEST_EXIT:0 (56 tests) FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0`
(`GATES_EXIT:0` combined). `git status --untracked-files=all` shows no leftover scratch/symlink
artifacts — all symlinks live only in `mkdtemp` scratch dirs cleaned in `afterAll`.

→ @reviewer

**[reviewer]** Re-audit of the B1 fix (`src/selection.ts`, `test/selection.test.ts`).

**Verdict: Approve.** My prior blocker is resolved. I reproduced every claim independently rather than
accepting the report.

**Negative controls, reproduced from scratch, not re-derived from the worker's numbers.** I rebuilt
`collectCandidatePaths`/`listVaultNotes`/`isWithinVaultBoundary` in an out-of-repo script against a
fresh fixture with the same four symlinks (two directory, two file) and ran both ablations:

- Containment removed, descent-skip intact → leaked exactly `Handbook/DirectAlias.md` and
  `Handbook/DirectEscape.md`; `Handbook/AliasToPrivate/Secret.md` and `Handbook/Escape/Leaked.md`
  stayed absent. **2 leaks** — matches the report exactly, entry for entry.
- Descent-skip removed (symlinked directories now followed), containment intact → **zero leaks**,
  full published set unchanged from the fixed version. Matches "34/34 still pass."
  I also independently broke `isWithinVaultBoundary` itself to `return true` unconditionally and ran it
  against the four `isWithinVaultBoundary — B1 pure boundary predicate` unit tests: the two `allows`
  cases still pass (vacuously, `true` is correct for them), the two `drops` cases fail. So the predicate's
  own unit tests are behavioral, not tautological — they fail when the logic is broken, not merely when
  it is exercised.

**Plain judgement on the substantive question: B1 is genuinely fixed — the guarantee moved from
`readdir`'s undocumented traversal behaviour to this module's own code, it did not just relocate to
a different unverified spot.** Two changes make that true, not one:

1. `listVaultNotes` no longer calls `readdir(..., {recursive: true})` at all. The directory-alias/
   escape case no longer depends on _any_ runtime's recursive-traversal semantics — sync, async,
   this Node version, or the next one. The recursion is hand-written, and the only thing it still
   trusts from the runtime is `Dirent.isSymbolicLink()`/`isDirectory()` on a single, non-recursive
   `readdir` call — well-documented, stable flags, categorically different from the "does recursive
   readdir follow a symlinked directory" behaviour that turned out to be undocumented and
   version-inconsistent. That is the actual fix for the finding I raised: the property that used to
   hold by accident of a library implementation now holds by construction in this codebase.
2. The file-symlink class — previously blanket-excluded by the old `isSymbolicLink()` check with
   nothing behind it — is now routed through `isWithinVaultBoundary` with nothing else protecting it,
   which is exactly what makes it possible to prove the check can fail: I disabled containment and
   watched precisely those two paths, and only those two, leak. That is real, CI-enforced,
   load-bearing test coverage where before there was none reachable by any committed test.

The directory-alias/escape case is now protected by two independent layers, one of which (the
descent-skip) is currently provably redundant given the other — its removal alone does not fail the
suite, and the worker said so plainly rather than reporting a clean 34/34 without qualification. I
don't read that as reliance moving somewhere invisible: the invariant that actually matters — nothing
outside the config-selected, floor-filtered set reaches `published` — is fully covered by tests that
do fail when the covering logic breaks, for every symlink shape in the fixture. A redundant layer
with no test of its own is a known, named gap in coverage of that layer specifically, not a gap in
the guarantee.

**On whether the walk's own behaviour deserves a committed assertion rather than a throwaway script:**
worth adding, not blocking. The worker's `collectCandidatePaths` ablation (2 leaked paths vs. 4) is
real evidence but exists only as an out-of-repo script and DEVLOG prose — the same shape of gap I
raised last round, now one level down the stack. Recommend exporting `collectCandidatePaths` (it is
already written as a pure-enough async function taking a directory and an accumulator) and adding a
direct test asserting it never returns a path whose absolute form contains a symlinked directory
segment, using the existing fixture's `AliasToPrivate`/`Escape` symlinks. That would make the
defense-in-depth explicit and independently regression-tested rather than provable only by disabling
the other layer. Not required for this approval — the shipped guarantee does not depend on it — but
I'd take it if offered, as a `## NEXT` item or folded into this block at the Architect's discretion.

**Confirmed unaffected:** `src/config.ts`/`test/config.test.ts` untouched (fail-closed config loading
unaffected); B4's warning-precedence fix in `src/index.ts:37-77` is unchanged from what I approved
last round; the floor's `isExcluded`/`EXCLUSION_FLOOR` matching is unchanged; `collectCandidatePaths`
and `listVaultNotes` only ever omit a candidate (`continue`) or filter one out (`isWithinVaultBoundary`
returning `false`) — nothing in the diff can add to the published set. Gates independently re-run:
`BUILD_EXIT:0 TEST_EXIT:0 (56 tests) FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0 GATES_EXIT:0`. No `any`,
cast, non-null assertion, or suppression in the diff; `node:` prefix on the new `stat`/`realpath`
imports; no new dependency; `tasks.md` untouched.

→ @architect

**[worker]** B1 follow-up — reviewer's non-blocking suggestion done. `collectCandidatePaths` is now
exported from `src/selection.ts`, and `test/selection.test.ts` adds a direct test against it using the
existing scratch fixture: after walking `vaultDir`, the raw candidate list must not contain
`Handbook/AliasToPrivate/Secret.md` or `Handbook/Escape/Leaked.md` (both reached only through a
symlinked directory), and must contain `Handbook/Index.md` and `Private/Secret.md` (the vault's real
notes) — the descent-skip's own contract, asserted directly rather than only inferred from the
throwaway script in the prior post.

**Negative control, same shape as before, re-run against this exact new test:** removed the
directory-descent skip (`collectCandidatePaths` deciding type uniformly via `stat()`, which follows
symlinks, instead of refusing every `isSymbolicLink()` entry first) → the new test failed —
`Handbook/AliasToPrivate/Secret.md` present in the candidate list, exactly the leak the throwaway
script showed previously, now caught by a real test instead of a manual run. Restored; 35/35 in
`selection.test.ts`, 57/57 overall.

**Gates:** `BUILD_EXIT:0 TEST_EXIT:0 (57 tests) FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0`
(`GATES_EXIT:0` combined).

→ @reviewer

**[reviewer]** Final re-check of the `collectCandidatePaths` export/test addition.

**Verdict: Approve.** All three points confirmed by reproduction, not accepted on report:

1. **Diff is export-only.** `src/selection.ts` against the version I last approved is byte-identical
   except `async function collectCandidatePaths` → `export async function collectCandidatePaths` —
   no other line moved.
2. **The new test genuinely fails with the skip removed.** I reimplemented the ablated walk (symlinked
   directories followed instead of refused) against the same fixture shape out-of-repo:
   `Handbook/AliasToPrivate/Secret.md` appears in the raw candidate list, exactly as reported — the
   assertion the shipped test makes (`not.toContain`) would fail.
3. **Positive half present, so it can't pass by returning nothing:** the test also asserts
   `toContain("Handbook/Index.md")` and `toContain("Private/Secret.md")` — a walk that dropped
   everything would fail those two, not just vacuously satisfy the negatives.

Gates independently re-run: `BUILD_EXIT:0 TEST_EXIT:0 (57 tests) FORMAT_EXIT:0 LINT_EXIT:0
VALIDATE_EXIT:0 GATES_EXIT:0`. Both layers of the directory-alias/escape protection now have their
own committed, falsifiable evidence. Clear to commit.

→ @architect

**[architect]** Remediation block closed — reviewer `Approve` after three rounds, gates green on my
own run (`BUILD_EXIT:0 TEST_EXIT:0 FORMAT_EXIT:0 LINT_EXIT:0 VALIDATE_EXIT:0`, `GATES_EXIT:0`), 57
tests, committed as a `fix`. Nothing ticked; every box in the section was already ticked. Re-running
the supervisor on `642719f..HEAD` next — its second look, so an `Approve` closes the section and a
second `Request changes` goes to the Product Owner rather than into a third round.

**What the two review rounds inside this block were actually about, because it is the section's whole
lesson repeating a level down.** B1 shipped first as a containment check with four tests that passed
identically whether the check was present or absent — `readdir({recursive:true})` never descends a
symlinked directory, so nothing the tests did could reach the code they were pointed at. That is the
same "reads as protective, proves nothing" shape B2 was carved to fix for `EXCLUSION_FLOOR`, one
function over, and it appeared _in the block written to close that exact class of finding_. Then the
fix for it left one layer — the walk's descent skip — provable only by a script that ran once, and
that needed a third round to become a test. **Six for six now: every protection this project has
written has, on first attempt, been verified by something that could not have failed.**

**The runtime dependency is genuinely gone, not moved.** `listVaultNotes` no longer calls
`readdir(..., { recursive: true })` at all; the recursion is hand-written and the only thing it takes
from the runtime is documented `Dirent` flags on a single non-recursive read. The original problem
was that the guarantee rested on undocumented traversal behaviour that differs between the sync and
async APIs — that is what changed, and the reviewer confirmed it by rebuilding both controls out of
repo rather than reading the diff.

**From the Product Owner, for §8:** the Access one-time code's **10-minute expiry was checked and
lapsed correctly**. That is 8.6's verification, observed 2026-08-25. Not ticked — §8 is not open, and
ticking a box in an unopened section would misstate where the change stands — but §8 should treat it
as witnessed rather than re-asking. Worth recording precisely because "expired" is the message
several _other_ Access failures produce, so this is the first time that explanation has been seen
being true.
