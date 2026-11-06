---
description: Project profile keys the infra-core pack reads, with their defaults
---

# Infrastructure profile keys: core (schema)

> The one definition of every profile key infra-core reads. A project writes the keys it sets to
> its infrastructure profile, `infra-project-profile.md`, an always-on rule in a project rules
> source that `infra-init` creates and gap-fills. A key left out takes the default below. Keep
> entries as plain `key: value` lines; a map is written `class=value` pairs separated by `, `.

## Scope

- infra_layers: none                 <!-- layers this project runs, from: host, platform, stack, release, operator; each needs its pack installed -->
- env_classes: none                  <!-- environment classes this project runs, from: dev, cicd, preview, staging, production; a class left out gets no generated rules -->

## Sources

- infra_rules_dir: auto              <!-- project rules source where infra-init writes the profile and generated rules; auto = the first project-owned rules source in intelligence.yaml -->
- infra_decisions_dir: auto          <!-- where decision records live; auto = the dev profile's decisions_dir, else docs/decisions -->
- infra_validate: none               <!-- repository validation command run after every infrastructure change; none = no repository gate -->

## Secrets and operator values

- operator_env: .env                 <!-- git-ignored operator env file: addresses, administrator logins, opaque provider IDs; never credentials -->
- secret_stores: none                <!-- class=store map naming where each class keeps credentials, e.g. dev=account-credential-store, cicd=forge-repository-secrets, production=runtime-secrets -->
