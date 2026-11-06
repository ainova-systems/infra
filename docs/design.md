# Design: layered infrastructure packs

Status: **Accepted** (2026-11-06). First implemented in v0.1.0; the decisions below replace the draft's open questions.

## Goal

Scale one infrastructure discipline (desired-state manifests, read-only checks, idempotent
setup, decision records, secret discipline) across projects. A project includes only the layers it runs and
picks its implementation where alternatives exist. The packs generate project rules, runbooks and
manifest skeletons from a profile. They never copy scripts, compose files or other dependencies
into the consumer.

## Ownership

| Owner | Holds |
|---|---|
| These packs | Models, contracts, invariants, procedures parameterised by profile keys, templates |
| Each project repository | Its own desired state: manifests, inventory, scripts, stacks, workflows, ADRs, filled profile |
| Host account stores | Secrets: native credential store or private env file readable only by that account, outside tracked source |

Desired state lives in the project that owns the environment. A repository may own only some
classes, for example development hosts, while application repositories own their own
production, staging, preview and CI/CD environments.

## Boundary test

A rule belongs in a pack when a second project needs the same rule with only values changed;
the values become profile keys. A rule that names a service, path, domain, tool version or
topology stays in the project.

## Layers and packs

Every pack depends on `infra-core` only. Including a layer never pulls in another.

| Pack | Layer | Owns | Alternatives |
|---|---|---|---|
| `@ainova-systems/infra-core` | cross-cutting | Desired vs observed state, environment classes and their invariants, secret placement, decision records, idempotency; `infra-init`, `infra-audit` | — |
| `@ainova-systems/infra-host` | L0 provider + L1 OS | Host lifecycle: `infra-host-create`, `-check`, `-install`, `-refresh`, `-upgrade` | Providers: none in the pack, one provider-neutral control contract; each project documents its own at profile `host_provider_docs`. Engines: profile `host_engine` (`ansible` or `none`) selects a page in `infra-host-install` `references/engines/` |
| `@ainova-systems/infra-platform` | L2 platform | Container engine and self-hosted CI runners: `infra-runner-change` | Engine by profile `container_engine` |
| `@ainova-systems/infra-stack` | L3 application stack | The stack contract below: `infra-stack-check`, `infra-stack-deploy` | Runtime per environment class by profile `stack_runtimes` (compose, swarm, k3s) |
| `@ainova-systems/infra-release` | L4 release | Promotion behind gates and the preview lifecycle: `infra-release-promote`, `infra-preview` | — |
| `@ainova-systems/infra-operator` | L5 agent runtime hosting | Slot classes as trust boundaries: `infra-operator-slot`, `infra-operator-check` | — |

One project often runs different runtimes per class (Compose for staging, Swarm for production), so
runtimes are references inside one stack pack selected per class, not mutually exclusive packs.

### Stack contract (L3)

Every environment exposes, from the project's own repository: a deploy entrypoint, a read-only
check entrypoint, a rollback path, a health signal and its secrets by logical name. A stack never
encodes the host it runs on. The stack pack states the contract and checks it is met; the compose
files, charts and workflows stay in the project.

### Operator (L5) versus the operator pack

The `@ainova-systems/operator` pack in `intelligence-dev-packs` defines **what** each phase does
(intake, plan, implement, review, verify, merge, clarify, later release). `infra-operator` defines
**where and with which rights** it runs. It is a layer of its own, not part of L2, because slot
classes are trust boundaries:

| Slot class | Rights |
|---|---|
| control | Runs the runtime and discovery; no implementation work |
| development | Writes code; no deploy credentials |
| clarification | Documentation pull requests only |
| release | Staging and production deploy credentials; separate account, no autonomous code changes |

Slot ids and counts are project values (profile `slot_classes`).

A release slot never shares an account, credential store or checkout with development slots.

## Environment classes

`dev`, `cicd`, `preview`, `staging`, `production`. Each class states who may deploy, the highest
autonomy tier allowed, the required checks and whether rollback must be rehearsed. A project lists
the classes it runs; a class it does not list has no generated rules.

## Secret placement

| Kind | Where | Never |
|---|---|---|
| Credentials, tokens, keys | Owning account's native credential store, or a private env file readable only by that account, outside tracked source, populated interactively | Tracked files, manifests, operator `.env`, chat |
| Addresses, admin logins, opaque provider IDs | Git-ignored operator `.env` on the operator machine | Delivered to hosts as a credential channel |
| References | Manifests and docs name secrets by logical name (`SECRET_REF`) | Values |

## Profile and selection

One schema per pack, `templates/infra-<pack>-profile.md`. A project keeps one always-on rule,
`infra-project-profile.md`, holding the keys it sets; `infra-init` creates and gap-fills it and
generates `infra-environments.md` from it (shape: infra-core `templates/infra-environments.md`).
Example keys:

```text
infra_layers: host, platform, stack, release, operator
env_classes: dev, cicd, preview, staging, production
host_provider_docs: docs/providers/<provider>.md
host_engine: ansible
stack_runtimes: preview=compose, staging=compose, production=swarm
```

`infra-init` and `infra-audit` report a profile that disagrees with the installed packs, for
example `infra_layers` naming a layer whose pack is not installed.

## Conventions

- One artifact prefix, `infra-`, for every pack. It is distinct from the `dev-`, `git-`, `spec-`
  and `operator-` prefixes in `intelligence-dev-packs`.
- Registry `index.yaml` and shared `vX.Y.Z` tags, as in `intelligence-dev-packs`.
- Pack content is project-agnostic; anything project-specific is a profile key.

## Resolved questions

| Question | Decision | Why |
|---|---|---|
| Provider knowledge in the packs? | No: one control contract in `infra-host`; provider answers live in the project | A skill must behave identically on every provider; provider facts are project values |
| Where does the release workflow live? | Phase behaviour in the dev packs' operator pack; the release slot class, its account and credentials in `infra-operator` | Same split as every other slot: what runs vs where and with which rights |
| Who owns preview environments? | Lifecycle (create, reset, cleanup, TTL, capacity) in `infra-release`; deploy mechanics per runtime in `infra-stack` | Lifecycle is runtime-independent; mechanics are not |
| One stack pack per runtime? | One pack, runtime per class | Projects mix runtimes across classes |
