---
name: homey-release
description: "Cut and publish a new release of the Volvo Homey app (com.volvocars). Use when the user asks to make a new release, bump the version and publish, or ship the app to the Homey App Store. Covers version bump, changelog, validation gate, git commit + tag, and the interactive `homey app publish` handoff."
---

# Homey App Release

Release procedure for `com.volvocars`. Follow the steps in order. Do NOT run
`homey app publish` automatically — prepare everything, then hand off (see step 5).

## Inputs to gather first
- **Bump**: `patch` | `minor` | `major` | explicit `X.Y.Z`.
  - `patch` = fixes / diagnostics / reliability, no new user-facing capability
  - `minor` = new capability / device / flow card
  - `major` = breaking change
- **Changelog** text in **English only** (one or two user-facing sentences) —
  `.homeychangelog.json` uses `{ "en": ... }` entries. Propose a draft from the
  commits since the last release if the user doesn't give one, and confirm it.
  Describe user-visible impact, not internal refactors.

## Step 1 — Pre-flight gate
There is no lint script, and `npm test` is not a usable gate: the mocha tests
under `test/` are integration tests that need the on-device `homey` module and
real credentials (`test/config.js`, gitignored). Don't treat their failure as a
release blocker.

Instead:
- `git status` — the working tree should contain only the changes meant for
  this release. Ask about anything unexpected.
- `node --check` each changed `.js` file to catch syntax errors.
- The real gate is `homey app validate --level publish` in step 3.

## Step 2 — Bump version + changelog
The version lives only in `.homeycompose/app.json` (source of truth).
`package.json` has **no** `version` field — don't add one. `app.json` is
**generated and gitignored**, so never edit or commit it.

**Edit by hand — do not use `homey app version`.** In this repo (CLI 4.5.3) it
rewrites both files from 4-space to 2-space indentation (whole-file diffs) and
*appends* the new changelog entry at the bottom instead of the top.

- `.homeycompose/app.json`: change only the `"version"` line.
- `.homeychangelog.json`: insert the new `"X.Y.Z": { "en": "..." },` entry as
  the first key (newest first), keeping the 4-space indentation.

Confirm with `git diff` that each file shows only those few lines.

## Step 3 — Validate for publish
```
homey app validate --level publish
```
Must end with: `validated successfully against level 'publish'`.
This also regenerates `app.json` from `.homeycompose/app.json`.

## Step 4 — Commit + tag
The default branch is **`master`**. Tags are **v-prefixed and lightweight**
(e.g. `v1.5.8`). Commit messages follow the repo's existing style:
`chore: Update version to X.Y.Z and <short summary>`.

Review `git status` first, then stage files explicitly (avoid blind
`git add -A`; do NOT stage `app.json` — it is gitignored):
```
git add .homeycompose/app.json .homeychangelog.json
# add any remaining source files that belong to this release
git commit -m "chore: Update version to <X.Y.Z> and <summary>"
git tag v<X.Y.Z>
git push origin master
git push origin v<X.Y.Z>
```
Push the tag as its own explicit ref. Do **not** use `--follow-tags`: it only
pushes *annotated* tags, so with this repo's lightweight tags it silently skips
them and still reports `Everything up-to-date`.

Then confirm the tag actually landed — a silent skip looks identical to success:
```
git ls-remote --tags origin | grep v<X.Y.Z>
```

If the release files were already committed (e.g. the version bump was folded
into a feature commit), there is nothing to commit. Skip straight to tagging and
pushing the tag.

Avoid the `homey app version ... --commit` shortcut: it commits and tags
*before* validation and uses its own commit message format.

## Step 5 — Publish (interactive; user runs this)
`homey app publish` has **no flags** to skip its prompts (CLI v4.5.x), and an
automated shell cannot answer them. Do not attempt to run it non-interactively.
Tell the user to run it in their terminal:
```
homey app publish
```
Expected prompts:
- "Update version?" → **No** (already bumped in step 2).
- Verify/confirm the changelog.
- Final confirmation to upload → **Yes**.
Requires `homey login`. Publishing submits the build for store certification —
treat it as a high-impact action and only proceed on the user's explicit go-ahead.

## Notes
- `test/`, `.github/` and `.gitignore` are excluded from the published bundle
  via `.homeyignore`.
- Tag history has gaps: the last tag is `v1.5.8`; `1.6.1`–`1.6.6` were released
  without tags. Tag every release from now on.
