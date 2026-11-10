# 0004 - A Node.js CLI with a Linux runner, WSL on Windows

Date: 2026-11-10
Status: accepted

## Context

Ansible's control node is Linux, and the owner works on Windows. The project wrappers were bash run from WSL, called
from PowerShell: Windows PowerShell 5.1 drops double quotes from native arguments, an outer shell expands `$?` meant
for the inner one, and the connect commands were a second implementation in PowerShell. The Intelligence CLI and the
operator are npm packages; the owner installs tools that way.

## Decision

1. The CLI is TypeScript on Node.js 24 with one runtime dependency (`yaml`), published as `@ainova-systems/infra`.
2. It starts every process with an argument array, never through a shell. Ansible runs in `runner/runner.sh`, shipped
   in the package: directly on Linux, through `wsl.exe -e bash` on Windows.
3. Every value reaches the runner through its environment; on Windows `WSLENV` forwards exactly the names the CLI
   set. Paths are converted to their WSL form first. Secrets never appear on a command line or in a file.
4. The toolchain is a virtualenv per `collection/requirements.txt` and dependency collections per
   `collection/requirements.yml`, under `~/.cache/infra` on the Linux side; `ainova.infra` is linked from the locked
   source. Nothing is installed into a project.
5. The operator's own ssh (connect, VS Code) runs on the workstation; `infra trust` records a host key for both sides.

## Consequences

- One implementation of the operator commands for every project.
- Windows needs WSL with `python3-venv` and `git`; the CLI says so when it cannot start the runner.
- VS Code's `code` is a `.cmd` on Windows, which Node starts only through a shell: those calls carry fixed or
  validated arguments only.
