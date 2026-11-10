import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const COMMIT = 'a'.repeat(40);

export const MANIFEST_TEXT = `contract: 1
project: demo
source:
  url: https://github.com/ainova-systems/infra.git
  version: "^0.5.0"
ansible: ansible
env:
  values: [BACKUP_ENDPOINT]
classes:
  staging:
    roles: [host_base, container_engine, compose_host]
hosts:
  demo-dev-01:
    class: dev
    provider: proxmox
    status: active
    roles: [host_base, dev_workstation, container_engine, local_gateway]
    before:
      - { role: local_gateway, tasks_from: preflight }
      - { role: local_gateway, tasks_from: account, tags: [local_gateway, container_engine] }
    after:
      - { role: local_gateway, tasks_from: postflight }
  demo-staging-01:
    class: staging
    status: planned
    groups: [backups]
    secrets: [DEMO_TOKEN, { name: DEMO_BACKUP_KEY, runs: [check] }]
connect:
  demo1: { host: demo-dev-01, account: coder, direct: true }
  demo2: { host: demo-dev-01, account: other }
`;

/** A conforming project in a fresh Git repository; files overrides or adds (null removes). */
export function fixtureProject(files: Record<string, string | null> = {}): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'infra-fixture-'));
  const base: Record<string, string> = {
    'infra.yaml': MANIFEST_TEXT,
    'infra.lock': `lock_version: 1\nsource:\n  url: https://github.com/ainova-systems/infra.git\n  version: v0.5.0\n  commit: ${COMMIT}\n`,
    '.gitignore': '.env\n',
    '.env.example': 'INFRA_DEMO_DEV_01_ADDRESS=\nINFRA_DEMO_STAGING_01_ADDRESS=\nINFRA_ADMIN_USER=\nINFRA_SSH_IDENTITY_FILE=\nINFRA_BACKUP_ENDPOINT=\nOTHER_TOOL_SETTING=x\n',
    '.env': 'INFRA_DEMO_DEV_01_ADDRESS=10.0.0.5\nINFRA_DEMO_DEV_01_PORT=2222\nINFRA_BACKUP_ENDPOINT=https://s3.example.invalid\n',
    'ansible/group_vars/all.yml': 'host_base_admin_user: admin\n',
    'ansible/group_vars/staging.yml': 'compose_host_stack_dirs: []\n',
    'ansible/group_vars/backups.yml': 'endpoint: "{{ infra_env.BACKUP_ENDPOINT }}"\n',
    'ansible/host_vars/demo-dev-01.yml': 'dev_workstation_accounts:\n  - name: coder\n    authorized_keys: ["ssh-ed25519 AAAA"]\n  - name: other\n',
    'ansible/host_vars/demo-staging-01.yml': '---\n',
    'ansible/observed/demo-dev-01.md': '# demo-dev-01 - observed 2026-11-10\n',
    'ansible/roles/local_gateway/tasks/main.yml': '---\n',
    'ansible/maintenance.yml': '- hosts: dev\n  tasks: []\n',
  };
  for (const [path, content] of Object.entries({ ...base, ...files })) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  for (const [path, content] of Object.entries(files)) if (content === null) rmSync(join(root, path), { force: true });
  execFileSync('git', ['init', '-q', root]);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
