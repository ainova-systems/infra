# Runtime: k3s (Kubernetes)

Orchestrated workloads with declarative rollout. Fits staging and production classes.

| Contract item | k3s rule |
|---|---|
| Deploy | `kubectl apply` or a Helm release from the pipeline, images pinned by digest |
| Check | Readiness and liveness probes on every workload; deploy waits on `kubectl rollout status` |
| Rollback | `kubectl rollout undo` or `helm rollback` to the recorded revision |
| Secrets | Kubernetes Secrets from an external store or sealed form; never plain values in the repository |
| Limits | `resources.requests` and `resources.limits` on every container |
| Isolation | One namespace per environment instance, with its own service account and network policy |

## Rules

- The cluster's admin kubeconfig is a production credential; pipelines use a namespace-scoped account.
- `kubectl delete namespace` is destructive; preview cleanup may use it, staging and production may not.
- Keep the revision history long enough for the rollback the class requires.
