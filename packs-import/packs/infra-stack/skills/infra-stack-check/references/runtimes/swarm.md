# Runtime: Docker Swarm

Orchestrated services with rolling updates. Fits staging and production classes.

| Contract item | Swarm rule |
|---|---|
| Deploy | `docker stack deploy` with images resolved to digests before a guarded update |
| Check | Every service has a health check; the update waits for tasks to be healthy |
| Rollback | `update_config.failure_action: rollback` plus `rollback_config`; the previous service spec is the rollback target |
| Secrets | Swarm secrets mounted as files; never environment variables carrying values |
| Limits | `deploy.resources.limits` on every service |
| Update order | `order: start-first`, `parallelism: 1` where a service must stay available |

## Rules

- Repeated forced updates overwrite the previous service spec the rollback needs; resolve digests and update once.
- A failed update that rolled back is a failed deploy; the pipeline fails even with healthy old tasks.
- Logs: `docker service logs --timestamps --since <UTC time> <service>` on a manager; it has no `--until`.
- Initialise test swarms only in a disposable rehearsal daemon, never on a shared host daemon.
- A stack on a host with no deploy job is a manual deployment waiting to drift; give every stack a pipeline job.
