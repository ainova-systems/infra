# intelligence-infra-packs

Infrastructure operations for AI-first teams, packaged as portable rules, skills and templates. Declare hosts, platforms, application stacks, releases and agent runtimes as desired state in each project's own repository, and let both your team and your AI agents operate them through the same checked procedures.

Built and maintained by [Ainova Systems](https://www.ainovasystems.com). Extracted from running AI-coded enterprise systems and their agent fleets on self-hosted infrastructure.

## Quick start

The packs ship as [Intelligence Packages](https://github.com/ainova-systems/intelligence), installed with the Intelligence CLI.

```bash
npm install -g @ainova-systems/intelligence

cd your-project
intelligence registry add https://github.com/ainova-systems/intelligence-infra-packs.git
intelligence package add @ainova-systems/infra-core
intelligence package add @ainova-systems/infra-host     # add only the layers you run
```

Then run **`infra-init`**. It writes the project's `infra-project-profile.md` from what the repository already holds, asks once for what it cannot detect, and generates the `infra-environments.md` rule: every environment class, its runtime, entrypoints, who may deploy, and where its secrets live. Nothing is copied into the project except those two generated rules.

## Layers

Install only the layers a project runs. Every pack depends on `infra-core` alone.

| Pack | Layer | Skills |
|---|---|---|
| `@ainova-systems/infra-core` | Cross-cutting | `infra-init`, `infra-audit`; the always-on `infra-discipline` rule |
| `@ainova-systems/infra-host` | Provider and OS | `infra-host-create`, `-check`, `-install`, `-refresh`, `-upgrade`; provider-neutral host control contract |
| `@ainova-systems/infra-platform` | Platform | `infra-runner-change`: self-hosted runners, labels per class, limits, cleanup |
| `@ainova-systems/infra-stack` | Application stack | `infra-stack-check`, `infra-stack-deploy`; Compose, Swarm and k3s rules, runtime chosen per environment class |
| `@ainova-systems/infra-release` | Release | `infra-release-promote`, `infra-preview` |
| `@ainova-systems/infra-operator` | Agent runtime | `infra-operator-slot`, `infra-operator-check`: slot classes as trust boundaries |

Artifact catalog: [packs/README.md](packs/README.md). Design and decisions: [docs/design.md](docs/design.md).

## Design principles

1. **The project owns its state.** Packs carry models, contracts and procedures; manifests, scripts, stacks and workflows stay in the project that runs them.
2. **Generate, never vendor.** Skills write project rules from the profile. They do not copy scripts or configuration into the consumer.
3. **Secrets never travel through the repository.** Manifests name secrets by logical reference; values live in the owning account's credential store.
4. **Trust boundaries are explicit.** Environment classes and agent slot classes each state who may act and with which rights.
5. **Every step is idempotent and checkable.** A read-only check reports state before and after every change.

## Versioning

Semantic versioning on shared `vX.Y.Z` tags, history in [CHANGELOG.md](CHANGELOG.md). Pre-1.0, breaking changes bump the minor.

## Related

- **[Intelligence](https://github.com/ainova-systems/intelligence)**: the open-source CLI that versions, distributes and renders these packages into Claude Code, Cursor, GitHub Copilot, Codex, Pi and OpenCode.
- **[intelligence-dev-packs](https://github.com/ainova-systems/intelligence-dev-packs)**: the engineering discipline, git workflow and Operator phase skills these packs complement.

## License

MIT. Copyright 2026 Ainova Systems.

---

Created by **[Dmitrij Zykovic](https://www.linkedin.com/in/dmitrijz/)**, Fractional CTO at [Ainova Systems](https://www.ainovasystems.com).

[LinkedIn](https://www.linkedin.com/in/dmitrijz/) · [Advisory & Consulting](https://www.ainovasystems.com)
