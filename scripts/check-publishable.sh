#!/usr/bin/env bash
# Publishability gate — greps the tracked tree (or explicit paths) for anything
# that would leak this repository's client-confidential vault: generic hostname
# and email patterns that need no secret list, plus literal identifiers read
# from a gitignored list. See openspec/changes/publish-vault-as-private-site/
# DEVLOG.md, "Publishability gate" (section 7) for the brief this implements.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root" || exit 1

hostname_label='[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?'
workers_dev_regex="(${hostname_label}\\.)+workers\\.dev"
cloudflareaccess_regex="(${hostname_label}\\.)+cloudflareaccess\\.com"
email_regex='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'

# Case-insensitive; these are the only addresses this pattern is allowed to see.
allowed_emails='noreply@anthropic.com
noreply@notify.cloudflare.com'

list_path="${VP_IDENTIFIERS:-$repo_root/.publishable-identifiers}"
list_optional="${PUBLISHABLE_LIST_OPTIONAL:-0}"

# --- build the scan set ---------------------------------------------------

files=()
if [ "$#" -gt 0 ]; then
  for arg in "$@"; do
    if [ -d "$arg" ]; then
      while IFS= read -r -d '' f; do
        files+=("$f")
      done < <(find "$arg" -type f -print0 2>/dev/null)
    elif [ -f "$arg" ]; then
      files+=("$arg")
    fi
  done
else
  # Tracked *and* untracked-but-not-ignored: a leak lands in a new file far
  # more often than an existing one, and `git ls-files` alone is blind to
  # anything not yet added. `--exclude-standard` still honours .gitignore,
  # so `.publishable-identifiers` and node_modules stay out of the scan.
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(git -C "$repo_root" ls-files -co --exclude-standard -z)
fi

# The identifier list names the very things being protected; never scan it.
if [ -f "$list_path" ]; then
  list_resolved="$(cd "$(dirname "$list_path")" 2>/dev/null && pwd)/$(basename "$list_path")"
  filtered=()
  if [ ${#files[@]} -gt 0 ]; then
    for f in "${files[@]}"; do
      if [ -f "$f" ]; then
        f_resolved="$(cd "$(dirname "$f")" 2>/dev/null && pwd)/$(basename "$f")"
      else
        f_resolved="$f"
      fi
      if [ "$f_resolved" != "$list_resolved" ]; then
        filtered+=("$f")
      fi
    done
  fi
  if [ ${#filtered[@]} -gt 0 ]; then
    files=("${filtered[@]}")
  else
    files=()
  fi
fi

scanned=${#files[@]}
echo "check-publishable: scanned $scanned file(s)."

if [ "$scanned" -eq 0 ]; then
  echo "ERROR: no files were scanned. An empty scan set can never report a leak," >&2
  echo "so it must never report clean either." >&2
  exit 1
fi

# --- load the literal identifier list -------------------------------------

identifiers=()
if [ -f "$list_path" ] && [ -s "$list_path" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    # trim leading/trailing whitespace
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    identifiers+=("$line")
  done < "$list_path"
fi

if [ "${#identifiers[@]}" -eq 0 ]; then
  if [ "$list_optional" = "1" ]; then
    echo "SKIPPED: no literal identifier list at '$list_path' — literal-identifier checks did NOT run." >&2
    echo "SKIPPED: only the generic hostname/email patterns were checked in this run." >&2
  else
    echo "ERROR: literal identifier list missing or empty at '$list_path'." >&2
    echo "ERROR: set PUBLISHABLE_LIST_OPTIONAL=1 to run pattern-only checks instead." >&2
    exit 1
  fi
fi

# --- scan --------------------------------------------------------------

hit=0

is_allowed_email() {
  local candidate lower
  candidate="$1"
  lower="$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]')"
  while IFS= read -r allowed; do
    [ "$lower" = "$allowed" ] && return 0
  done <<< "$allowed_emails"
  return 1
}

for f in ${files[@]+"${files[@]}"}; do
  [ -f "$f" ] || continue
  # Skip binary files the way grep itself would.
  grep -Iq . "$f" 2>/dev/null || continue

  while IFS=: read -r lineno match; do
    [ -z "${lineno:-}" ] && continue
    echo "$f:$lineno: pattern match (*.workers.dev hostname): $match"
    hit=1
  done < <(grep -noEi -- "$workers_dev_regex" "$f" 2>/dev/null)

  while IFS=: read -r lineno match; do
    [ -z "${lineno:-}" ] && continue
    echo "$f:$lineno: pattern match (*.cloudflareaccess.com hostname): $match"
    hit=1
  done < <(grep -noEi -- "$cloudflareaccess_regex" "$f" 2>/dev/null)

  while IFS=: read -r lineno match; do
    [ -z "${lineno:-}" ] && continue
    is_allowed_email "$match" && continue
    echo "$f:$lineno: pattern match (email address): $match"
    hit=1
  done < <(grep -noEi -- "$email_regex" "$f" 2>/dev/null)

  for id in ${identifiers[@]+"${identifiers[@]}"}; do
    while IFS=: read -r lineno match; do
      [ -z "${lineno:-}" ] && continue
      echo "$f:$lineno: literal identifier match ('$id'): $match"
      hit=1
    done < <(grep -noiF -- "$id" "$f" 2>/dev/null)
  done
done

if [ "$hit" -ne 0 ]; then
  exit 1
fi

exit 0
