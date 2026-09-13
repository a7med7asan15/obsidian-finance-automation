#!/usr/bin/env bash
#
# Cut a release BRAT can see.
#
# BRAT compares the installed manifest.json version against the newest GitHub
# release tag, so an update only reaches the iPhone once a tag exists, the tag
# matches manifest.json, and the release carries main.js, manifest.json and
# styles.css as individual assets. This script owns the first half — the version
# files, the release commit and the tag — and pushing the tag hands the second
# half to .github/workflows/release.yml, which builds and publishes the assets.
#
#   scripts/release.sh patch "stops a needs_review note rewriting itself"
#   scripts/release.sh 3.2.0 "edits accounts and categories in place"
#   scripts/release.sh minor --dry-run
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

die() { printf 'release: %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

usage() {
  cat <<'USAGE'
usage: scripts/release.sh <major|minor|patch|X.Y.Z> [summary] [--dry-run]

  major|minor|patch   bump the current manifest.json version
  X.Y.Z               use this exact version
  summary             the rest of the release commit subject, after "release: X.Y.Z"
  --dry-run           run the checks, print the plan, and stop before
                      the tests, the build, the commit and the push

The tag is pushed to origin; GitHub Actions builds and publishes the release.
USAGE
}

dry_run=false
target=""
summary=""

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) dry_run=true ;;
    -*) die "unknown option $1" ;;
    *)
      if [ -z "$target" ]; then target="$1"
      elif [ -z "$summary" ]; then summary="$1"
      else die "unexpected argument $1"
      fi
      ;;
  esac
  shift
done

[ -n "$target" ] || { usage >&2; exit 2; }

current="$(node -p "require('./manifest.json').version")"
min_app="$(node -p "require('./manifest.json').minAppVersion")"

case "$target" in
  major|minor|patch)
    version="$(node -e '
      const [cur, kind] = process.argv.slice(1);
      const p = cur.split(".").map(Number);
      if (p.length !== 3 || p.some(Number.isNaN)) throw new Error(`manifest.json version ${cur} is not X.Y.Z`);
      let [major, minor, patch] = p;
      if (kind === "major") { major++; minor = 0; patch = 0; }
      else if (kind === "minor") { minor++; patch = 0; }
      else { patch++; }
      process.stdout.write(`${major}.${minor}.${patch}`);
    ' "$current" "$target")"
    ;;
  *)
    [[ "$target" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "$target is neither a bump keyword nor an X.Y.Z version"
    version="$target"
    ;;
esac

# The workflow only fires on tags shaped X.Y.Z, and a version that does not move
# forward leaves BRAT showing no update at all, so both are worth catching here
# rather than after a push.
node -e '
  const [cur, next] = process.argv.slice(1);
  const cmp = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  if (cmp(next, cur) <= 0) {
    console.error(`release: ${next} is not newer than the current ${cur}`);
    process.exit(1);
  }
' "$current" "$version"

step "releasing $current -> $version (minAppVersion $min_app)"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || die "on branch $branch; releases are cut from main"

[ -z "$(git status --porcelain)" ] || die "working tree is dirty; commit or stash first
$(git status --short)"

git tag --list "$version" | grep -qx "$version" && die "tag $version already exists locally"

step "fetching origin"
git fetch --tags origin

git ls-remote --exit-code --tags origin "refs/tags/$version" >/dev/null 2>&1 &&
  die "tag $version already exists on origin"

behind="$(git rev-list --count "HEAD..origin/$branch")"
[ "$behind" = "0" ] || die "main is $behind commit(s) behind origin; pull first"

subject="release: $version"
if [ -n "$summary" ]; then subject="$subject $summary"; fi

if [ "$dry_run" = true ]; then
  step "dry run — the tests and the build are skipped, and nothing is written, committed, tagged or pushed"
  cat <<PLAN
  manifest.json  version -> $version
  package.json   version -> $version
  versions.json  + "$version": "$min_app"
  commit         $subject
  tag            $version
  push           origin $branch and tag $version
PLAN
  exit 0
fi

step "npm test"
npm test

step "npm run build"
npm run build

# manifest.json is what BRAT reads to decide an update is available; versions.json
# maps each release to the Obsidian it needs; package.json is kept in step so the
# three never disagree about what the current version is.
write_versions() {
  node -e '
    const fs = require("node:fs");
    const version = process.argv[1];
    const bump = (file, edit) => {
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      edit(json);
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
    };
    bump("manifest.json", (m) => { m.version = version; });
    bump("package.json", (p) => { p.version = version; });
    bump("versions.json", (v) => { v[version] = JSON.parse(fs.readFileSync("manifest.json", "utf8")).minAppVersion; });
  ' "$version"
}

step "writing manifest.json, package.json, versions.json"
write_versions

# The built main.js and styles.css ship in the repo as well as in the release, so
# a clone is installable by hand at the version its manifest claims.
git add manifest.json package.json versions.json main.js styles.css
git commit -m "$subject"
git tag -a "$version" -m "$subject"

step "pushing $branch and tag $version"
git push origin "$branch"
git push origin "$version"

step "done"
printf 'Release %s is tagged and pushed. GitHub Actions builds and publishes it.\n\n' "$version"

remote_url="$(git remote get-url origin)"
case "$remote_url" in
  https://github.com/*|git@github.com:*)
    slug="$(printf '%s' "$remote_url" | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##')" ;;
  *) slug="" ;;
esac
if [ -n "$slug" ]; then
  printf '  https://github.com/%s/actions\n' "$slug"
  printf '  https://github.com/%s/releases/tag/%s\n\n' "$slug" "$version"
fi

cat <<'DONE'
Once the run is green the release carries main.js, manifest.json and styles.css as
separate assets, which is what BRAT downloads. BRAT offers the update on its next
check — "BRAT: Check for updates to all beta plugins" — or on the next Obsidian start.
DONE
