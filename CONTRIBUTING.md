# Contributing

Contributions are welcome: new layers, stack or provider packs, rule refinements, better procedures.

## The bar for pack content

Every artifact must pass one test: **would a second project need the same rule with only values changed?** If yes, it belongs in a pack and the values become profile keys. A rule that names a service, path, domain, tool version or topology stays in the project.

- No project names, hosts, addresses, stacks or business logic in pack text.
- Skills generate project rules, runbooks and manifest skeletons; they never copy scripts, compose files or other dependencies into the consumer.
- Never write a secret value, token or key into pack content, examples or templates. Name secrets by logical reference.

## Conventions

- Every rule, agent and skill name starts with the `infra-` prefix.
- Each pack holds `rules/`, `agents/`, `skills/` and optional `templates/`; a pack with profile keys ships them in `templates/infra-<pack>-profile.md`.
- Only `infra-core` ships an always-on rule; other packs keep their invariants in their skills' `Constraints` so a project pays context only for the layers it runs.
- A new pack is justified only when someone would install it without the others. Alternatives within a layer (stack runtimes) are references inside the layer's pack, selected by profile keys. Packs never name a provider, operating system or consuming project; what differs per provider is a project document the pack asks for.
- Every pack is declared in the root `index.yaml` so it is installable by name.
- References are written in backticks: the validator resolves every backticked `infra-*` name and every backticked profile key.

## Workflow

1. Branch from `main`.
2. Make the change; run `bash scripts/validate-pack.sh`.
3. Update `CHANGELOG.md` under `[Unreleased]` in the same change.
4. Open a PR. Commit messages: one line, capital first letter, past tense, no `Co-Authored-By` or other generated trailers.

## Releases

Cut by the maintainer from `main`, tagged `vX.Y.Z`. Promote `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` after reconciling it against `git log <last-tag>..HEAD`, tag annotated, push, and create the release with `gh release create vX.Y.Z --verify-tag`. Pre-1.0, breaking changes bump the minor.

## Code of conduct

Be professional and constructive. Disagreements are about content, never people.

## Repository protection

`main` and release tags `v*` are protected by the rulesets in `.github/rulesets/`: no deletion or
force-push, `validate` required on `main`, and only organization administrators create, move or
delete a release tag. Apply or re-apply them with
`gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/<file>.json`.
