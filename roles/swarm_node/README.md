# swarm_node

Creates or joins a Docker Swarm as a manager or worker and opens the cluster ports to listed peers only.
Nothing is inferred: the node role is required, creating a swarm is a separate explicit switch, and a daemon
that already runs containers is refused unless that is declared. A node already in a swarm is asserted, never
re-created, promoted, demoted or moved. The role deploys no stack.

## Requirements

| Requirement | Source |
|---|---|
| Ubuntu 24.04, x86_64, systemd | asserted |
| Rootful Docker Engine (Swarm mode does not run rootless) | `container_engine` with `container_engine_mode: rootful`; asserted |
| Active ufw with default-deny inbound | `host_base`; asserted |
| `community.docker`, `community.general` | collection `requirements.yml` |
| Docker SDK for Python on the host | installed by the role (distribution package, pinned) |
| `become: true`, gathered facts | the calling play |

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `swarm_node_role` | `""` (required) | `manager` or `worker` |
| `swarm_node_init` | `false` | `true` creates a new swarm here; manager only, no join addresses |
| `swarm_node_advertise_addr` | `""` (required) | IP or interface other nodes reach this node on; from the project's environment |
| `swarm_node_listen_port` | `2377` | Management port; the node listens on the advertise address only |
| `swarm_node_join_addrs` | `[]` | Manager addresses to join through; required when not creating |
| `swarm_node_join_token_env` | `SWARM_NODE_JOIN_TOKEN` | Controller variable carrying the join token at run time |
| `swarm_node_token_prompt` | `true` | Hidden prompt when the token variable is empty; `false` fails instead |
| `swarm_node_cluster_id` | `""` | Expected cluster ID once known; asserted on managers when set |
| `swarm_node_peers` | `[]` | Addresses or CIDRs of the other nodes; empty opens no cluster port |
| `swarm_node_firewall` | `true` | Manage the ufw rules; `false` leaves them to another owner (check still refuses broad rules) |
| `swarm_node_overlay_encryption` | `true` | Allow ESP from peers for encrypted overlay networks |
| `swarm_node_allow_existing_workloads` | `false` | Permit creating or joining on a daemon with running containers |
| `swarm_node_python_docker_package` | `python3-docker=5.0.3*` | Docker SDK package for `docker_swarm` |

```yaml
# Single-node swarm: no peers, no cluster port opened.
swarm_node_role: manager
swarm_node_init: true
swarm_node_advertise_addr: "{{ lookup('ansible.builtin.env', 'EXAMPLE_NODE_ADDRESS') }}"
```

## Behaviour

| Local swarm state | Action |
|---|---|
| `inactive`, `swarm_node_init: true` | Refuse if containers run (unless allowed); `docker swarm init` on the advertise address |
| `inactive`, `swarm_node_init: false` | Refuse if containers run (unless allowed); join `swarm_node_join_addrs` with the run-time token (`no_log`) |
| `active` | Assert role (manager or worker), advertise address and, when set, cluster ID; change nothing |
| `pending`, `locked`, `error` | Stop; resolved by hand |

Firewall rules, all with comment `swarm_node`:

| Port | Proto | Opened on | From |
|---|---|---|---|
| `swarm_node_listen_port` (2377) | tcp | managers | `swarm_node_peers` |
| 7946 | tcp, udp | every node | `swarm_node_peers` |
| 4789 | udp | every node | `swarm_node_peers` |
| ESP (IP 50) | - | every node, when `swarm_node_overlay_encryption` | `swarm_node_peers` |

Rules this role opened to a source no longer listed are removed, as are the management-port rules on a worker
and ESP rules when encryption is off. Ports published by stacks are not this role's concern; Docker publishes
them past ufw, so keep published ports behind the provider firewall or an ingress.

Get the join token on an existing manager with `docker swarm join-token -q manager|worker` and pass it in
`SWARM_NODE_JOIN_TOKEN` for that command only, or at the prompt. Never store it in inventory or a vault file.

Leaving a swarm, promotion and demotion are deliberate manual steps (`docker swarm leave`,
`docker node promote|demote`); the role reports the mismatch and stops.

## Check

`tasks_from: check` asserts swarm membership as declared, an active firewall, no rule naming a cluster port from
a source outside `swarm_node_peers` (and none for the management port on a worker), and, when the role manages
the firewall, a rule for every peer and port (and ESP when encryption is on).
