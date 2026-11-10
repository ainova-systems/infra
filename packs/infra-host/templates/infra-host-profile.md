---
description: Project profile keys the infra-host pack reads, with their defaults
---

# Infrastructure profile keys: host (schema)

> Keys infra-host reads from `infra-project-profile.md`. `<id>` in a value stands for one host's
> id, which is also its manifest directory name. With `host_engine: infra` the commands and records
> below come from `infra.yaml` and the CLI; set only the keys the project still needs.

## Desired state

- host_manifests: none               <!-- glob of host manifests, e.g. hosts/*/host.yaml; the directory name equals the manifest id -->
- host_required_files: none          <!-- files every host directory must hold besides the manifest, e.g. README.md, rebuild.md -->
- host_inventory: none               <!-- inventory files the manifest cross-references, comma-separated; none = no separate inventory -->
- host_model: none                   <!-- id of the host a new one is modelled on; a map when models differ, e.g. <provider>=<host-id> -->
- host_provider_docs: none           <!-- project document per provider answering references/host-controls.md, with <provider>, e.g. docs/providers/<provider>.md -->

## Commands

- host_engine: none                  <!-- infra = the infra CLI (infra.yaml; the CLI fixes the check, setup, trust and new-host commands, see infra-host-install references/engines/infra.md), or none = the project commands below -->
- host_trust: none                   <!-- records a new host's SSH key after an out-of-band fingerprint check, with <id> and <fingerprint>; none = keys are recorded by hand -->
- host_check: none                   <!-- read-only check command for one host, with <id>; exit 0 = every mandatory control passed -->
- host_setup: none                   <!-- operator-side setup command for one host, with <id>; copies the target installer and runs it -->
- host_setup_phases: none            <!-- named partial phases the setup command accepts, e.g. Base, Accounts, Identity -->
- host_secret_setup: none            <!-- owner-run authentication helper inside the host account, with <id>; none = native logins only -->

## Records

- host_observed_state: none          <!-- dated observed-state file per host, with <id>, e.g. hosts/<id>/runtime.md -->
- host_observed_fields: none         <!-- manifest fields that record observed state, e.g. status, last_verified_check; everything else is desired state -->
- host_pin_locations: none           <!-- every file that records a version pin for one host, with <id> and <domain>; all must name the same version -->
- host_break_glass: none             <!-- provider=out-of-band console path used before remote-access, firewall, account or boot changes -->
