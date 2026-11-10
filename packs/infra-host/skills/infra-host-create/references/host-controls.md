# Host controls

The controls every host manifest maps, whatever runs it. The pack names no provider: a project
answers each row once per provider it uses, in its own document at profile `host_provider_docs`,
and every host on that provider points to that answer.

| Requirement | Question the project answers |
|---|---|
| Instance boundary | What separates this host from other tenants and from other trust domains? |
| Ingress and egress control | Which controls sit outside the guest, and which only inside it? |
| Kill switch | How is the host isolated or stopped without guest cooperation? |
| Recovery console | What out-of-band access survives a remote-access, firewall, account or boot mistake? |
| Backups | Which copy is outside the guest's control, and where is the recovery source? |
| Audit | Which logs leave the guest? |
| Platform features | Which virtualization features, devices or guest agents does the workload need, and are they present? |
| Resource changes | Which changes to hardware or allocation need a full stop, and who schedules it? |

## Rules

- A row the provider cannot satisfy is an accepted risk in a decision record, never an omission.
- "Available" means verified on a host, never assumed from the provider's documentation.
- Separate accounts inside one host separate files and credentials; they are not a second trust boundary.
- Provider administrator access is bootstrap and recovery only; normal administration uses a named account.
