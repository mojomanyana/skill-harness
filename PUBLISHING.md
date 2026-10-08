# Publishing skill-harness

## Current candidate

- Source release target: `0.26.1`
- Intended stable tag: `v0.26.1`
- These fields describe the source candidate only. Verify npm dist-tags and GitHub
  releases directly before making or reporting any live registry claim.
- Release-pack toolchain: Node `v20.20.2`, npm `10.8.2`

## Public packages

Publish only these generated archives, in this dependency order:

1. `@skill-harness/core`
2. `@skill-harness/adapters`
3. `@skill-harness/cli`
4. `skill-harness`

Never publish the private monorepo root or the private
`@skill-harness/pi-extension` workspace.

## Authorization

This document does not authorize a release. Obtain explicit operator approval before:

- running paid model calls,
- publishing an npm package,
- moving an npm dist-tag,
- creating a release tag or GitHub Release.

If publication returns an ambiguous response, inspect the exact registry version and
bytes before retrying. Never blindly repeat a publish.

## Prepare the release

1. Start from a clean dedicated release branch.
2. Synchronize all public package versions, internal dependency pins, lockfile,
   `SKILL.md` version metadata, and `CHANGELOG.md`.
3. Merge only after required CI is green.
4. Record the exact release commit and tree. Pack from that clean commit, not from a
   development checkout with local files.

Do not stage or package `.pi/`, `scratch/`, local credentials, result corpora, or
release evidence.

## Verify and pack

The release-pack tests and canonical archives are authoritative only under Node
`v20.20.2` and npm `10.8.2`.

```bash
node --version   # v20.20.2
npm --version    # 10.8.2
npm run build
npm run build:ext
npm run typecheck
npm test
npm run release:pack
```

`npm run release:pack` is the sole packaging path. It creates a manifest and four
archives under `release-artifacts/` unless an explicit output directory is supplied.
Do not substitute workspace `npm pack`, raw package-directory publication, or archives
from another build.

Stop if the tree changes unexpectedly during verification.

## Inspect the canonical archives

Before publication, verify the manifest-bound archives and reject any archive that
contains:

- `.claude/`, `.pi/`, `.superpowers/`, or `scratch/`,
- credentials or local configuration,
- `docs/handoff/`, `PUBLISHING.md`, or retained `results.yaml`,
- symlinks or unexpected package inputs,
- stale committed bundles or mismatched package versions/internal pins.

Retain the release manifest, archive hashes, file counts, and verification logs.
Do not rebuild or alter archives after recording their hashes.

## Install verification

Install the exact four archives into a fresh empty prefix with scripts disabled:

```bash
npm install --prefix "$RELEASE_EVIDENCE/install" \
  --no-package-lock --ignore-scripts \
  "$RELEASE_EVIDENCE/artifacts/skill-harness-core-VERSION.tgz" \
  "$RELEASE_EVIDENCE/artifacts/skill-harness-adapters-VERSION.tgz" \
  "$RELEASE_EVIDENCE/artifacts/skill-harness-cli-VERSION.tgz" \
  "$RELEASE_EVIDENCE/artifacts/skill-harness-VERSION.tgz"
```

Verify:

- package versions and internal dependency pins,
- CLI `--version` and `--help`,
- public exports and review assets,
- byte identity of committed extension/meta-package bundles,
- Pi command registration in an isolated HOME/config without provider requests.

Do not run a paid real-model smoke solely for a metadata release. A paid smoke needs
separate authorization.

## Publish

For a prerelease, obtain explicit approval for a non-`latest` dist-tag (for example `rc`).
Do not use the default `latest` tag for a prerelease. Set `DIST_TAG` to the approved
tag before the commands below; stable promotion is a separate decision.

Immediately before each mutation, confirm that the exact version is absent from npm.
Publish only the canonical archives:

```bash
npm publish "$RELEASE_EVIDENCE/artifacts/skill-harness-core-VERSION.tgz" --access public --tag "$DIST_TAG"
npm publish "$RELEASE_EVIDENCE/artifacts/skill-harness-adapters-VERSION.tgz" --access public --tag "$DIST_TAG"
npm publish "$RELEASE_EVIDENCE/artifacts/skill-harness-cli-VERSION.tgz" --access public --tag "$DIST_TAG"
npm publish "$RELEASE_EVIDENCE/artifacts/skill-harness-VERSION.tgz" --tag "$DIST_TAG"
```

After registry propagation:

1. Verify exact versions, dist-tags, package inventories, and unpacked bytes.
2. Install the published exact version in a fresh prefix and repeat CLI/Pi checks.
3. Create immutable `vVERSION` at the verified release commit.
4. Create the GitHub Release from that tag.
5. Never force-move an immutable version tag.
