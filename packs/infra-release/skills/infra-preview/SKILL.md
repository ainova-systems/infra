---
name: infra-preview
description: "Creates, resets, cleans up or audits per-change preview environments through the project's preview lifecycle, keeping each instance isolated, bounded by capacity and removed when its change ends. Use for any preview operation and to find orphaned previews."
argument-hint: "<create|reset|cleanup|audit> [change]"
---

# Operate preview environments

A preview instance belongs to one change and ends with it. Everything else about it comes from profile `preview_lifecycle`.

## Steps

1. **Audit first.** List running preview instances and the open changes they belong to. An instance whose change is closed, or idle past profile `preview_ttl`, is an orphan.
2. **Create** through the lifecycle's create entry: one isolated instance per change, with its own project name, networks, volumes and secrets set, within profile `preview_capacity`; a full capacity queues, never evicts a running suite.
3. **Reset** through the lifecycle's reset entry: data and state back to the seed, same instance, same change.
4. **Cleanup** through the lifecycle's cleanup entry for orphans and closed changes only. Cleanup may destroy the instance's own volumes; never another instance's or a shared one's.
5. Report instances created, reset, removed and still running, with their changes.

## Verify

- After the run, every running instance maps to an open change within TTL, and running instances do not exceed profile `preview_capacity`.

## Scope / hand-off

- Stack contract for the preview class: `infra-stack-check`. Promotion beyond preview: `infra-release-promote`.

## Constraints

- Never give a preview instance staging- or production-class credentials or data.
- Never remove an instance whose change is still open and within TTL.
- Never share a project name, network or volume between two instances.
