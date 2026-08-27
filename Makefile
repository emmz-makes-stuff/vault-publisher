# dmons-scaffold: 0.5.1
# vault-publisher — gate targets.
#
# Every gate prints its own exit code as `LABEL_EXIT:<n>` and exits with it, so a
# report can quote the code rather than an agent's reading of the output. This is
# not cosmetic: a tool can exit non-zero while printing output that reads exactly
# like a clean run. `npx prettier --check .` exits 1 while printing nothing but a
# short list of `[warn] src/…` filenames, which reads like ordinary progress output.
#
# `gates` runs every gate in its set WITHOUT stopping at the first failure, so one
# invocation reports the whole picture instead of hiding the rest behind gate one.
#
# The active OpenSpec changes are discovered, not hardcoded, so the command string
# stays stable as changes come and go.

SHELL := /bin/bash

CHANGES := $(notdir $(patsubst %/,%,$(filter-out %/archive/,$(wildcard openspec/changes/*/))))

.PHONY: build test format format-fix lint validate changes publishable gates clean

# --- TypeScript ----------------------------------------------------------------

build:
	@npm run build; code=$$?; echo "BUILD_EXIT:$$code"; exit $$code

test:
	@npm test; code=$$?; echo "TEST_EXIT:$$code"; exit $$code

format:
	@npx prettier --check .; code=$$?; echo "FORMAT_EXIT:$$code"; exit $$code

# Not a gate — the write half of `format`, for reformatting a DEVLOG post or a
# fixture. `format` stays check-only so no gate ever produces an unreviewed edit.
format-fix:
	@npx prettier --write .; code=$$?; echo "FORMAT_FIX_EXIT:$$code"; exit $$code

lint:
	@npx eslint .; code=$$?; echo "LINT_EXIT:$$code"; exit $$code

# --- spec ----------------------------------------------------------------------

# Validates every active change (archive excluded). No active change is a failure,
# not a silent pass — an empty run would otherwise report VALIDATE_EXIT:0 while
# having validated nothing.
validate:
	@fail=0; \
	if [ -z "$(CHANGES)" ]; then \
		echo "no active change found under openspec/changes/"; fail=1; \
	else \
		for c in $(CHANGES); do openspec validate $$c --strict || fail=1; done; \
	fi; \
	echo "VALIDATE_EXIT:$$fail"; exit $$fail

changes:
	@echo "$(CHANGES)"

# --- publishability ------------------------------------------------------------

# This repository is public and the vault it publishes is client-confidential, so
# a client identifier reaching a commit here is a disclosure. No other gate can
# see it: build, test, format, lint and validate would all pass over a leaked
# hostname or vault name forever. One reached `main` on 2026-08-27.
#
# Two rule sets, deliberately. Generic patterns need no secrets and run anywhere,
# including CI — they catch shapes (`*.workers.dev`, a bare email address). The
# literal list catches names that match no shape, and it NAMES the things being
# protected, so it cannot live in this repository: it is read from $$VP_IDENTIFIERS
# or a gitignored `.publishable-identifiers`, with the canonical copy in the vault.
#
# A missing or empty list is an ERROR, never a pass. A gate that greps for nothing
# reports clean, and reporting clean over territory it never examined is the exact
# failure this target exists to prevent — see `validate` above for the same rule.
# CI genuinely cannot hold the list, so it sets PUBLISHABLE_LIST_OPTIONAL=1 and the
# script prints the skip loudly rather than passing in silence.
publishable:
	@scripts/check-publishable.sh; code=$$?; echo "PUBLISHABLE_EXIT:$$code"; exit $$code

# --- gate sets -----------------------------------------------------------------

gates:
	@$(MAKE) --no-print-directory -k build test format lint validate publishable; code=$$?; \
	echo "GATES_EXIT:$$code"; exit $$code

# --- release & housekeeping ----------------------------------------------------

clean:
	@rm -rf dist *.tsbuildinfo; code=$$?; echo "CLEAN_EXIT:$$code"; exit $$code
