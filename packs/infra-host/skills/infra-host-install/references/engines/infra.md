# Engine: the infra CLI

Read when profile `host_engine` is `infra`: the project declares its hosts in `infra.yaml` and runs them with the
`infra` command (`@ainova-systems/infra`, Ansible underneath). Every rule below adds to the host skills, never
replaces them.

## Commands

The CLI fixes every command, so the profile names none of them:

| Skill need | Command |
|---|---|
| Read-only check (`infra-host-check`) | `infra check <id>`; a subset with `--role <role>` |
| Preview (`infra-host-install`) | `infra plan <id>`: the apply as `--check --diff` |
| Apply | `infra apply <id> --yes` after the owner approved the plan; `--role <role>` for a partial run |
| First apply of a planned host | `infra apply <id> --first-apply --yes`; the CLI sets the host active in `infra.yaml` |
| New host key | `infra trust <id> SHA256:<fingerprint>` with a fingerprint read out of band |
| New host | `infra host add <id> --class <class> --provider <provider> --role <role>...` |
| Pin move | `infra update` (the source tag in `infra.lock`); role pins are host variables |
| Conformance | `infra validate`, and `infra validate --ansible` for a syntax check of every playbook |
| Hosts and lock | `infra status` |

The profile keys these replace take their values from the manifest: the check and setup commands above, role names
as partial phases, the observed-state path per host (`observed:`, default `<ansible>/observed/<id>.md`), and the pin
locations `infra.lock` plus the host's variables.

## What the CLI guarantees

| Contract item | Rule |
|---|---|
| Target | One host per run, always limited to it; a retired host is refused |
| Preview | `infra plan` runs the same roles with `--check --diff`; its result is shown to the owner before an apply |
| Partial run | `--role` becomes Ansible tags; hooks tagged `always` run on every apply and stay idempotent |
| Check | The generated check play runs `host_health` and every role's read-only check through `role_checks`; any `changed` result in it is a defect |
| Pins | The source commit in `infra.lock`; inside it the Python toolchain, the dependency collections and the roles' own pins |
| Secrets | Declared per host in `infra.yaml`, typed without echo or taken from the run's environment; never a file, a command line or a log |
| Control node | `host_base` is never applied to the machine running Ansible |
| Policy | Variables never read the operator env file; `infra validate` refuses an environment lookup in a variable file |

## Run by the skill

The host skills run the CLI themselves; the owner states the intent ("check <id>", "install <id>") and never types
the commands. Everything a run needs is obtained without a terminal:

| Need | How the CLI gets it | Owner's part |
|---|---|---|
| Toolchain | Fetches the locked source and creates the pinned toolchain on the Linux side on first use | none |
| Admin key | An existing agent, else a per-run agent loaded from the key file the operator env names; held in memory, never copied | names the key file once |
| Host key | `infra trust` records it only when it equals a fingerprint confirmed out of band | reads the fingerprint on the console for a new host |
| Short-lived tokens | Runner tokens from the operator's authenticated forge CLI, through the run's environment only | none |
| Other secrets | The host's declared secrets; without a terminal the run stops and names them | types the secret once |
| Approval | The `infra plan` result is shown; `infra apply --yes` follows the owner's go-ahead | approves |

- Without a terminal, prompts are disabled: a missing secret fails the run with its name, never hangs.
- A step the skill cannot do without the owner is asked for as a decision or a value, never as a command to run.

## Rules

- Never accept a new host key automatically; a changed key stops the run until the owner confirms it out of band.
- A plan that cannot predict a task (it depends on an earlier change) is reported as such, never read as a pass.
- Diagnose a failed task from its own output; a fix lands in the role, the host variables or the manifest, then the
  same host and roles run again.
- A drift line from the check is resolved by `infra-host-upgrade` or the role, never by editing variables to match
  the host.
- A defect in the generated plays, the guards or the toolchain is fixed in the infra repository and released, never
  worked around with a playbook copy in the project.
