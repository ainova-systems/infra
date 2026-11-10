# Contributing

Contributions are welcome: new roles, better checks, sharper guards, new CLI commands, pack refinements.

## What belongs here

Every change passes one test: **would a second project need the same behaviour with only values changed?** If yes,
it belongs here and the values become role variables, manifest keys or profile keys. Anything that names a host,
address, organization, service, provider or topology stays in the project.

- No project, customer, host, address, provider or person names in roles, the CLI, packs, examples or tests.
- Never write a secret value, token or key into any content, example or test, and never commit an Ansible Vault
  payload. Secrets reach a run through its environment or a prompt; tasks touching them are `no_log: true`.

## The collection (`collection/`)

- Role names are snake_case and generic; a forge-specific role carries the forge in its name (`github_actions_runner`).
- Every role ships `README.md`, `defaults/main.yml`, `tasks/main.yml`, `tasks/check.yml` and `meta/main.yml`, and is
  imported in both plays of `collection/tests/all-roles.yml`.
- `tasks/main.yml` asserts inputs and platform before the first change and is idempotent. `tasks/check.yml` only
  reads and fails the host on any failed control; a finding that is information, not a failure, is reported.
- Every variable starts with the role name and is documented in `defaults/main.yml` and the role README; derived
  values use the `<role>__` prefix in `vars/main.yml`.
- Versions are pinned in defaults: no `latest`, no `state: latest`; images by tag and digest where available. The
  Python toolchain is pinned in `collection/requirements.txt` and `requirements-lint.txt`, dependency collections in
  `collection/requirements.yml`.
- Fully qualified module names everywhere; the production profile of `.ansible-lint` applies.
- A check reads the host with tools the platform ships, never with a file its own role installs, so it reports real
  state on a host the role has not applied yet.
- A block template that can render nothing is `None` on ansible-core 2.19+, not `''`: read every such accumulator
  through `default('', true)`.
- A probe command a check runs is exercised by `collection/tests/local-probes.yml` when the control node can run it.
- A string escape (`'\n'`, `'\t'`) is decoded inside a `{% %}` statement but stays literal in a bare `{{ }}`
  expression or a condition on ansible-core 2.21: build such a character in a statement, never inline.
- A `command` whose `argv` carries shell text (`$1`, `$name`) sets `expand_argument_vars: false`.

## The CLI (`cli/`)

- TypeScript on Node.js 24, one runtime dependency (`yaml`). Every process starts with an argument array; a shell
  only where Windows requires one, with fixed or validated arguments.
- What every project shares is generated (inventory, `ansible.cfg`, apply and check playbooks, guards); a project
  value never moves into the CLI, and a value Ansible can hold never moves into `infra.yaml`.
- Values reach the runner through its environment, never a command line; a secret never reaches a file or a log.
- A manifest key, command or guard changes `cli/README.md` and the tests in the same change. A contract change of
  `infra.yaml` raises `contract` and refuses the old one with its remedy.

## The packs (`packs/`)

- Every rule, agent and skill name starts with the `infra-` prefix; each pack holds `rules/`, `agents/`, `skills/`
  and optional `templates/`, and is declared in the root `index.yaml`.
- Skills run the CLI; they never copy scripts or other dependencies into the consumer. A skill that names a CLI
  command changes with it in the same change.
- Only `infra-core` ships an always-on rule; other packs keep their invariants in their skills' `Constraints`.
- References are written in backticks: the validator resolves every backticked `infra-*` name and profile key.
  Design notes: [docs/packs-design.md](docs/packs-design.md).

## Workflow

1. Branch from `main`.
2. Make the change; run `bash scripts/verify.sh` (or the parts it touches: `cli`, `packs`, `collection`).
3. Update `CHANGELOG.md` under `[Unreleased]` in the same change.
4. Open a PR. Commit messages: one line, capital first letter, past tense, no `Co-Authored-By` or other generated
   trailers.

## Releases

Cut by the maintainer from `main`, one tag `vX.Y.Z` for the CLI, the collection and the packs
([decision 0001](decisions/0001-one-repository-one-version.md)). Set the version in `cli/package.json` and
`collection/galaxy.yml`, promote `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` after reconciling it against
`git log <last-tag>..HEAD`, tag annotated, push, and create the release with `gh release create vX.Y.Z --verify-tag`.
Publishing the release publishes the CLI to npm ([decision 0005](decisions/0005-publish-npm-through-trusted-publishing.md)).
Pre-1.0, breaking changes (a renamed variable, a changed default with effect on hosts, a manifest change) bump the minor.

## Repository protection

`main` and release tags `v*` are protected by the rulesets in `.github/rulesets/`: no deletion or force-push on
`main`, and only organization administrators create, move or delete a release tag. Apply or re-apply them with
`gh api -X POST repos/<owner>/<repo>/rulesets --input .github/rulesets/<file>.json`.

## Code of conduct

Be professional and constructive. Disagreements are about content, never people.
