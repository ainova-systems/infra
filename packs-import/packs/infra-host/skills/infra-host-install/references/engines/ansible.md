# Engine: Ansible

Read when profile `host_engine` is `ansible`. Profile `host_check` and `host_setup` then name the project's
playbook wrapper; profile `host_setup_phases` are role tags. Every rule below adds to the host skills, never replaces them.

| Contract item | Ansible rule |
|---|---|
| Target | Every run carries `--limit <id>`; a run without it is refused, never widened to a group or `all` |
| Preview | `--check --diff` for the same limit and tags runs first and its diff is shown to the owner before apply |
| Partial run | `--tags <phase>` from profile `host_setup_phases`; an untagged task runs on every apply and must stay idempotent |
| Rollout | Staging- and production-class plays set `serial: 1` and `max_fail_percentage: 0`: stop on the first failed host |
| Check | The check play is read-only: assertions, file stats and commands with `changed_when: false`; any `changed` result in it is a defect |
| Pins | Collections, roles and packages pinned in the requirements file and host variables; no `latest`, no `state: latest`, no unpinned Git ref |
| Secrets | Read at run time from the environment or `vars_prompt`; every task that touches one sets `no_log: true`; never an encrypted vault in Git |
| Control node | Remote-access, account and firewall roles never apply to the host the playbook runs from; apply them from another control node |

## Run by the skill

The host skills run the wrapper themselves; the owner states the intent ("check <id>", "install <id>")
and never types the commands. Everything a run needs is therefore obtained without a terminal:

| Need | How the wrapper gets it | Owner's part |
|---|---|---|
| Toolchain | Creates the pinned engine (requirements file) and collections outside the checkout on first use | none |
| Admin key | An existing agent, else a per-run agent loaded from the key file the operator env names; held in memory, never copied | names the key file once |
| Host key | Profile `host_trust` records it only when it equals a fingerprint confirmed out of band: the provider console, or a `known_hosts` entry the owner already trusts | reads the fingerprint on the console for a new host |
| Short-lived tokens | Created at run time by a CLI the owner already authenticated (the forge CLI for runner registration), passed through the run's environment only | none |
| Other secrets | The project's hidden-input helper; the run stops and names it | types the secret once |
| Approval | The `--check --diff` result is shown; apply follows the owner's go-ahead | approves |

- Prompts are disabled when no terminal is attached: a missing secret fails the run with its name, never hangs.
- A step the skill cannot do without the owner is asked for as a decision or a value, never as a command to run.

## Rules

- Install requirements into the project's ignored collections path before every run, so the pinned versions are the ones executed.
- Never accept a new host key automatically; a changed key stops the run until the owner confirms it out of band.
- A `--check` run that cannot predict a task (it depends on an earlier change) is reported as such, never read as a pass.
- Diagnose a failed task from its own output in the log; a fix lands in the role or host variables, then the same limit and tags run again.
- A drift line from the check play is resolved by `infra-host-upgrade` or the role, never by editing variables to match the host.
