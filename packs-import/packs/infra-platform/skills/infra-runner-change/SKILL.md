---
name: infra-runner-change
description: "Adds, resizes, relabels, stops or removes a self-hosted CI runner through the project's runner definitions and command, keeping labels mapped to environment classes and registration tokens out of the repository. Use for any runner change."
argument-hint: "<add|resize|relabel|stop|remove> <runner> [details]"
---

# Change a self-hosted runner

A runner label is an authority: any job that targets it runs with the credentials its class receives. Labels change with the same care as access rights.

## Steps

1. **Read the state.** Profile `runner_definitions`, `runner_labels`, `runner_limits` and the forge's runner list. Run the runner check (profile `runner_command` in check mode) and keep it as the before-state.
2. **Labels.** Every label the runner advertises appears in profile `runner_labels` with its class. A label of a higher class than the host's own (`production` on a dev host) needs a decision record and owner approval. Never advertise a retired label: the jobs that still target it get its authority.
3. **Capacity.** Sum the limits of every runner and every other workload on the host against its memory and CPU. A change that oversubscribes memory needs the owner's explicit acceptance and a record; a build that exceeded its limit is evidence for a larger limit, not for removing it.
4. **Resize safely.** Raise limits in place on a running runner only when the engine supports it; a reduction waits until the runner is idle and stopped, and is reported as deferred until then. Never recreate a runner's container or volume to resize it.
5. **Stop or remove.** Stop only after the forge reports the runner idle and no job process runs. Removal deregisters it at the forge and keeps the data volume until the owner asks for its deletion.
6. **Register.** A new runner reads its one-time token from the name in profile `runner_token_names`, streamed on standard input to the registration process; never as an argument, an environment variable in a definition, a tracked file or a log.
7. **Definitions first.** Edit the definitions and the decision record, then apply with profile `runner_command`; never configure a runner by hand on the host.
8. **Cleanup.** When the change adds a daemon, give it the scheduled cleanup in profile `engine_cleanup`: unused containers, images and builder cache past an age, never named volumes, never a running container.
9. Re-run the runner check, then `infra-host-refresh` for the host.

## Verify

- The runner check passes; the forge shows the runner with exactly the labels in profile `runner_labels`; host memory and CPU sums are reported; profile `infra_validate` passes.

## Scope / hand-off

- Host baseline, kernel modules and engine install: `infra-host-install`.
- Which workflows target which label: the project's CI files, changed through its normal review.

## Constraints

- Never give a dev or cicd host a label of a higher class without a decision record.
- Never put a registration token anywhere but the registration process's standard input.
- Never prune named volumes or stop a running job to make room.
- A runner uses the engine profile `container_engine` names; rootful engine access for a runner is a privilege grant: decision record and owner approval first.
