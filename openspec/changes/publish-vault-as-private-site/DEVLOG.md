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

## NEXT

**Section 1 is closed** — supervisor `Approve` on `c756850..1b20150`, after one remediation block.
Blocks landed: `b6a2655` (1.1–1.7), `1b20150` (remediation, no ticks).

**Section 2 is next, and it is the Product Owner's to execute.** Every task in it is
human-in-the-loop Cloudflare configuration that no automated gate can settle — the Worker and its
custom domain, disabling the `workers.dev` route, the Access application, the one-time PIN login
method and the email allow-list policy. Per CLAUDE.md §4 the Architect hands over a precise,
copy-pasteable runbook and **waits for confirmation before ticking any of 2.1–2.6**. Nothing in
section 2 gets ticked on the Architect's judgement. Design ordering is deliberate: the guarantee is
proven before any content-rendering code exists, so section 3 does not start until section 2 closes.

**Carried architectural notes** (from the reviewer and supervisor, for whoever opens section 3+):

- **`eslint.config.js`'s `ignores` and `tsconfig.check.json`'s `include` must move together.** Adding
  a path to `ignores` does not merely un-lint it — it removes the only backstop that catches the path
  going untype-checked. Correct for `vault/**`; quietly wrong for any directory that is ours. The
  backstop is loud rather than silent: a file outside the `include` list passes `make build`
  untype-checked but fails `make lint` with `not found in any of the provided project(s)`, so the
  gate _set_ still stops it.
- **`test/**` is now bound by `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.**
  A fixture written `{ notes: undefined }` fails the build, and indexing a fixture array needs
  narrowing. Brief the worker on this or it reads as the scaffold fighting them.
- **vitest globals are off and `types` is `["node"]`** — tests import from `"vitest"` explicitly.
- **Any future filesystem-walking gate needs the same two vault entries** (`vault/**`, `.vault/**`).
  Nothing enforces that the eslint and prettier ignore lists stay in step; they are different tools
  with different mechanisms, so the duplication is unavoidable rather than a design flaw.
- **`package.json` still has no `bin`/`main`/`exports`.** ADR-0003's composite Action needs a CLI
  entry, so `src/index.ts` should _become_ that entry in §6 rather than the placeholder lingering.
- `src` is type-checked twice per build — immaterial now, worth remembering if builds get slow.
- **`design.md § 6` wants a sentence when it is next edited**: "the build gate also type-checks the
  tests" is not deducible from that table, and the validate row no longer matches the Makefile's
  per-change loop.

**Standing process rule — the DEVLOG stays in the format gate, and the Architect's pre-commit gate
run is the one of record.** Every agent runs its gates and _then_ writes its DEVLOG post, so any
agent's `FORMAT_EXIT:0` is provisional by construction and the last writer always leaves the tree
red. This bit once already: a `FORMAT_EXIT:0` was reported accurately and was stale by the time it
was read. Pulling the DEVLOG out of the gate would recreate, for a third time in one section, the
exact failure this section fixed twice — a gate green over territory it never examined. So: agents
write posts prettier-clean from the start (`printWidth: 100`, `_em_`, `-` bullets), and the Architect
re-runs the gates after the final post and before the commit. If that needs `--write`, run it on
`DEVLOG.md` alone and read the diff — a formatter pass over an append-only record is the one edit
that could stop being cosmetic without anyone noticing.
