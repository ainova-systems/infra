# infra

One toolchain for every host a project owns: development and agent workstations, CI runners, preview, staging and
production. A project declares its hosts in `infra.yaml` and keeps their settings as Ansible variables; everything
that is the same in every project lives here, versioned together:

| Part | What it is | Docs |
|---|---|---|
| [cli/](cli/README.md) | `@ainova-systems/infra`, the `infra` command: manifest and lock, the pinned Ansible toolchain, generated inventory and playbooks, conformance checks, check and apply runs, operator connections | [cli/README.md](cli/README.md) |
| [collection/](collection/README.md) | `ainova.infra`, the Ansible roles: host baseline, container engine, CI runners, Compose and Swarm hosts, developer and coding-agent workstations, health | [collection/README.md](collection/README.md) |
| [packs/](packs/README.md) | Intelligence packs: the rules and skills an AI agent follows to operate hosts through the CLI | [packs/README.md](packs/README.md) |
| [container/](container/README.md) | The control container: the same pinned toolchain as an image | [container/README.md](container/README.md) |

Built and maintained by [Ainova Systems](https://www.ainovasystems.com).

## How a project uses it

```text
project/
|-- infra.yaml        # hosts: class, provider, status, roles; connect targets; the source version range
|-- infra.lock        # the exact source commit every run executes (infra update)
|-- .env.example      # the INFRA_* operator names: addresses, ports, admin login, key path - never a secret
`-- ansible/          # group_vars/, host_vars/, the project's own roles and playbooks - nothing generated
```

```bash
npm install -g @ainova-systems/infra
infra init && infra update                       # a new project: manifest, Ansible directory, lock
infra host add web-01 --class staging --provider hetzner --role host_base --role container_engine
infra trust web-01 SHA256:<fingerprint read on the host console>
infra check web-01                               # read-only: host health and every role's check
infra plan web-01                                # the apply as a dry run with diffs
infra apply web-01 --first-apply                 # a planned host's first apply, then plain apply
infra validate                                   # conformance of the project, the same command in CI
infra connect <target> [shell|files|git|web <port>|code]
```

The CLI owns what is the same everywhere: inventory, `ansible.cfg`, the apply and check playbooks, the toolchain
and the run guards (one host per run, a planned host only on its first apply, never `host_base` against the machine
running Ansible, strict host keys). The project owns its values, reviewed in its own repository.

## Versions

One tag `vX.Y.Z` releases all of it: the CLI on npm, the collection and the packs at the same commit. A project locks
the tag in `infra.lock` (`infra update`) and the packs in `intelligence.lock`; `infra validate` reports a lock outside
the manifest's range. History: [CHANGELOG.md](CHANGELOG.md). Decisions: [decisions/](decisions/README.md).

## Develop

```bash
bash scripts/verify.sh     # every gate: CLI typecheck, tests and pack smoke; packs; collection
```

`INFRA_SOURCE_DIR=<this checkout> infra check <host>` runs a project against a local checkout instead of its lock.
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. Copyright 2026 Ainova Systems. See [LICENSE](LICENSE).

---

Created by **[Dmitrij Zykovic](https://www.linkedin.com/in/dmitrijz/)**, Fractional CTO at [Ainova Systems](https://www.ainovasystems.com).
