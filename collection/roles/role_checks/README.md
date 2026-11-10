# role_checks

Runs the read-only `check` entry point of each listed role and keeps going after a failure, so one
run reports every failed control instead of stopping at the first. It changes nothing itself; each
listed role's own check keeps its read-only contract. The final assert fails the host when any
check failed and lists each failure as `<role> / <task>: <message>`.

## Entry points

| Tasks | Effect |
|---|---|
| `main` | Runs the checks. |
| `check` | Same as `main`. |

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `role_checks_roles` | `[]` (required, non-empty) | Roles in order: a name, or `{name, tasks_from}` when the check entry point is not `check`. Collection roles by FQCN, a project's own roles by plain name. |
| `role_checks_only` | `[]` | Run only these names; empty runs all. Replaces `--tags` for a partial check. |

## Example

```yaml
- name: Check hosts
  hosts: all
  become: true
  roles:
    - role: ainova.infra.role_checks
      vars:
        role_checks_roles:
          - ainova.infra.host_base
          - ainova.infra.container_engine
          - {name: ainova.infra.host_health, tasks_from: main}
```

A partial check: `-e '{"role_checks_only": ["ainova.infra.host_health"]}'`.
