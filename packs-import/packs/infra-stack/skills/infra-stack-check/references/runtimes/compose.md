# Runtime: Docker Compose

Single-host, no orchestrated rollout. Fits dev, cicd, preview and staging classes.

| Contract item | Compose rule |
|---|---|
| Deploy | `docker compose -p <project> up -d` with pinned images, from the pipeline or the entrypoint script |
| Check | Every long-running service has `healthcheck`; the check waits for `healthy`, not `running` |
| Rollback | Re-deploy the recorded previous image tags; there is no built-in rollback |
| Secrets | Env file outside tracked source readable only by the deploying account, or Compose `secrets:` from files outside source |
| Limits | `deploy.resources.limits` or `mem_limit` on every service on a shared host |
| Isolation | A unique project name per environment instance (one per preview), its own networks and volumes |

## Rules

- Never share a project name between two environment instances; `down -v` on the wrong name deletes the other's data.
- `down -v` is destructive for named volumes; preview cleanup may use it, staging may not.
- Compose does not rehearse an orchestrated rollout; a green Compose class says nothing about a class on another runtime.
