import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadProject } from './manifest.ts';
import { fixtureProject } from './test-support.ts';
import { validateProject } from './validate.ts';

function findings(files: Record<string, string | null> = {}) {
  const fixture = fixtureProject(files);
  try {
    return validateProject(loadProject(fixture.root));
  } finally {
    fixture.cleanup();
  }
}

test('a conforming project has no findings', () => {
  assert.deepEqual(findings(), { errors: [], warnings: [] });
});

test('policy read from the operator environment is refused (the source-CIDR defect)', () => {
  const { errors } = findings({
    'ansible/group_vars/all.yml': "host_base_admin_user: admin\nhost_base_ssh_allow_from:\n  - \"{{ lookup('env', 'HOSTS_ADMIN_SOURCE_CIDR') }}\"\n",
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /group_vars\/all\.yml: reads the environment; declare the value in env\.values/);
});

test('connection values, status and playbook-relative paths belong to the CLI', () => {
  const { errors } = findings({
    'ansible/host_vars/demo-staging-01.yml': 'ansible_user: root\nhost_status: active\nroot_dir: "{{ playbook_dir }}/.."\n',
  });
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => /sets ansible_user/.test(e)));
  assert.ok(errors.some((e) => /sets host_status/.test(e)));
  assert.ok(errors.some((e) => /use infra_project_root/.test(e)));
});

test('files the CLI generates are not kept in the project', () => {
  const { errors } = findings({ 'ansible/site.yml': '[]\n', 'ansible/run.sh': '#!/bin/sh\n' });
  assert.ok(errors.some((e) => /ansible\/site\.yml: the infra CLI generates/.test(e)));
  assert.ok(errors.some((e) => /ansible\/run\.sh: the infra CLI generates/.test(e)));
});

test('every host has variables, every active host a dated observed state, and no orphan', () => {
  const { errors } = findings({
    'ansible/host_vars/demo-staging-01.yml': null,
    'ansible/host_vars/gone-01.yml': '---\n',
    'ansible/observed/demo-dev-01.md': '# no date\n',
  });
  assert.ok(errors.some((e) => /demo-staging-01: no ansible\/host_vars\/demo-staging-01\.yml/.test(e)));
  assert.ok(errors.some((e) => /host_vars\/gone-01: no host 'gone-01'/.test(e)));
  assert.ok(errors.some((e) => /observed state carries no date/.test(e)));
});

test('group_vars for a group no host is in: error, a warning for an unused class', () => {
  const result = findings({ 'ansible/group_vars/typo.yml': 'x: 1\n', 'ansible/group_vars/production.yml': 'x: 1\n' });
  assert.ok(result.errors.some((e) => /group_vars\/typo: no host is in group 'typo'/.test(e)));
  assert.ok(result.warnings.some((w) => /group_vars\/production/.test(w)));
});

test('the env example is required and checked; the live file is checked and must be ignored', () => {
  assert.ok(findings({ '.env.example': null }).errors.some((e) => /\.env\.example is missing/.test(e)));
  assert.ok(findings({ '.env': 'INFRA_DB_PASSWORD=x\n' }).errors.some((e) => /looks like a secret/.test(e)));
  assert.ok(findings({ '.gitignore': '' }).errors.some((e) => /\.env is not ignored by Git/.test(e)));
});

test('a direct connect target needs the account to accept the operator key', () => {
  const { errors } = findings({ 'ansible/host_vars/demo-dev-01.yml': 'dev_workstation_accounts:\n  - name: coder\n  - name: other\n' });
  assert.deepEqual(errors, ['connect.demo1: direct, but coder declares no authorized_keys in host_vars/demo-dev-01']);
});

test('a project playbook may not read the environment either', () => {
  const { errors } = findings({ 'ansible/maintenance.yml': "- hosts: dev\n  vars:\n    a: \"{{ lookup('ansible.builtin.env', 'X') }}\"\n" });
  assert.match(errors[0]!, /ansible\/maintenance\.yml: reads the environment/);
});
