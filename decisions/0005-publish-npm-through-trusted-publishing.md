# 0005 - Publish npm through trusted publishing

Date: 2026-11-10
Status: accepted

## Context

The Intelligence CLI and the operator publish to npm from a GitHub Release through trusted publishing (GitHub
Actions OIDC), so no npm token is stored. npm configures a trusted publisher only for a package that exists.

## Decision

1. `.github/workflows/release.yml` publishes `@ainova-systems/infra` when a GitHub Release is published: `vX.Y.Z` to
   `latest`, `vX.Y.Z-rc.N` to `next`, after the typecheck, the tests and the packed-tarball smoke, with provenance.
2. The trusted publisher on npmjs.com names organisation `ainova-systems`, repository `infra`, workflow file
   `release.yml` and no environment.
3. The first version is published once by the maintainer from the tagged tree; the workflow skips a version already
   on npm, so that release's run passes.
4. After the first release through the workflow, the package's publishing access requires two-factor authentication
   and disallows tokens.

## Consequences

- No stored credential can publish the package.
- Renaming the workflow file or the repository stops publishing until the trusted publisher names the new value.
