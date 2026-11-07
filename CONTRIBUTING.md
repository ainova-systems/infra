# Contributing

Contributions are welcome: new roles, better checks, support for another platform, sharper safety guards.

## The bar for role content

Every role must pass one test: **would a second project need the same behaviour with only values changed?** If yes, it belongs here and the values become role variables. Anything that names a host, address, organization, service or topology stays in the project's inventory.

- No project, customer, host, address, provider or person names in roles, defaults, examples or templates.
- No provider logic: what differs per provider is a project concern. Platform differences are `ansible_facts` checks against the platforms declared in `meta/main.yml`.
- Never write a secret value, token or key into role content, examples or tests, and never commit an Ansible Vault payload. Secrets reach a run through the environment or `vars_prompt`; tasks touching them are `no_log: true`.

## Conventions

- Role names are snake_case and generic; a forge-specific role carries the forge in its name (`github_actions_runner`).
- Every role ships `README.md`, `defaults/main.yml`, `tasks/main.yml`, `tasks/check.yml` and `meta/main.yml`, and is imported in both plays of `tests/all-roles.yml`.
- `tasks/main.yml` asserts inputs and platform before the first change and is idempotent. `tasks/check.yml` only reads and fails the host on any failed control.
- Every variable starts with the role name and is documented in `defaults/main.yml` and the role README; derived values use the `<role>__` prefix in `vars/main.yml`.
- Versions are pinned in defaults: no `latest`, no `state: latest`; images by tag and digest where available.
- Fully qualified module names everywhere; the production profile of `.ansible-lint` applies.
- A check reads the host with tools the platform ships, never with a file its own role installs, so it reports real state on a host the role has not applied yet.
- A block template that can render nothing is `None` on ansible-core 2.19+, not `''`: read every such accumulator through `default('', true)`.
- A probe command a check runs is exercised by `tests/local-probes.yml` when the control node can run it.

## Workflow

1. Branch from `main`.
2. Make the change; run `bash scripts/validate.sh` (natively or in the control container).
3. Update `CHANGELOG.md` under `[Unreleased]` in the same change.
4. Open a PR. Commit messages: one line, capital first letter, past tense, no `Co-Authored-By` or other generated trailers.

## Releases

Cut by the maintainer from `main`, tagged `vX.Y.Z`. Bump `version` in `galaxy.yml`, promote `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` after reconciling it against `git log <last-tag>..HEAD`, tag annotated, push, and create the release with `gh release create vX.Y.Z --verify-tag`. Pre-1.0, breaking changes (a renamed variable, a changed default with effect on hosts) bump the minor.

## Repository protection

`main` and release tags `v*` are protected by the rulesets in `.github/rulesets/`: no deletion or
force-push on `main`, and only organization administrators create, move or delete a release tag. No
status check is required. Apply or re-apply them with
`gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/<file>.json`.

## Code of conduct

Be professional and constructive. Disagreements are about content, never people.
