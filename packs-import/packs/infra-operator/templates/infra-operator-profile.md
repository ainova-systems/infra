---
description: Project profile keys the infra-operator pack reads, with their defaults
---

# Infrastructure profile keys: operator (schema)

> Keys infra-operator reads from `infra-project-profile.md`. A slot is one checkout in which the
> agent runtime runs phases; a slot class is the trust boundary its slots share.

- operator_manifest: none            <!-- the runtime's manifest in the repository, e.g. operator.yaml -->
- operator_host: none                <!-- host id (infra-host) or description of where the runtime and its slots run -->
- operator_service: none             <!-- how the runtime runs on that host, e.g. a user service name -->
- slot_classes: none                 <!-- class=slot ids, from: control, development, clarification, release; e.g. control=<slot-id>, development=<slot-id> <slot-id> -->
- slot_accounts: none                <!-- class=host account the class's slots run as -->
- slot_credentials: none             <!-- class=logical credential names the class may hold; release is the only class that may hold deploy credentials -->
- slot_checkout_pattern: none        <!-- path of one slot's checkout, with <slot>, e.g. ../project-<slot> -->
- slot_resource_budget: none         <!-- shared limits across slots: concurrent test suites, memory per suite, the queue that enforces it -->
