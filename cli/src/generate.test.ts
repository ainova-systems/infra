import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'yaml';
import { loadEnv } from './env.ts';
import { bundle, checkPlaybook, inventory, sitePlaybook } from './generate.ts';
import { findHost, loadProject } from './manifest.ts';
import { fixtureProject } from './test-support.ts';

const options = { linuxRoot: '/work/demo', linuxAnsibleDir: '/work/demo/ansible' };

test('inventory: classes and groups, connection values from the env file, project values', () => {
  const fixture = fixtureProject();
  try {
    const project = loadProject(fixture.root);
    const doc = parse(inventory(project, loadEnv(project), options));
    assert.deepEqual(doc.all.vars, { infra_project: 'demo', infra_project_root: '/work/demo', infra_env: { BACKUP_ENDPOINT: 'https://s3.example.invalid' } });
    assert.deepEqual(doc.all.children.dev.hosts['demo-dev-01'], {
      host_status: 'active',
      infra_class: 'dev',
      ansible_port: 2222,
      ansible_user: '{{ host_base_admin_user }}',
      infra_provider: 'proxmox',
      ansible_host: '10.0.0.5',
    });
    // No address yet: the host stays in the inventory, and the apply guard refuses it.
    assert.equal(doc.all.children.staging.hosts['demo-staging-01'].ansible_host, undefined);
    assert.deepEqual(doc.all.children.backups.hosts, { 'demo-staging-01': {} });
  } finally {
    fixture.cleanup();
  }
});

test('site playbook: status and control-node guards, hooks around roles tagged by name', () => {
  const fixture = fixtureProject();
  try {
    const project = loadProject(fixture.root);
    const plays = parse(sitePlaybook(project, findHost(project, 'demo-dev-01')));
    assert.equal(plays.length, 3);
    assert.deepEqual(plays[0].tags, ['always']);
    assert.match(plays[0].tasks[0]['ansible.builtin.assert'].that.join(' '), /infra_first_apply/);
    assert.deepEqual(plays[1].tags, ['host_base']);
    assert.match(JSON.stringify(plays[1]), /INFRA_CONTROL_MACHINE_ID/);
    const apply = plays[2];
    assert.equal(apply.hosts, 'demo-dev-01');
    assert.deepEqual(apply.roles, [
      { role: 'ainova.infra.host_base', tags: ['host_base'] },
      { role: 'ainova.infra.dev_workstation', tags: ['dev_workstation'] },
      { role: 'ainova.infra.container_engine', tags: ['container_engine'] },
      { role: 'local_gateway', tags: ['local_gateway'] },
    ]);
    assert.deepEqual(apply.pre_tasks.map((task: Record<string, unknown>) => task.tags), [['always'], ['local_gateway', 'container_engine']]);
    assert.deepEqual(apply.post_tasks[0]['ansible.builtin.include_role'], { name: 'local_gateway', tasks_from: 'postflight' });
  } finally {
    fixture.cleanup();
  }
});

test('check playbook: host health first, every role once, an optional subset', () => {
  const fixture = fixtureProject();
  try {
    const project = loadProject(fixture.root);
    const host = findHost(project, 'demo-dev-01');
    const vars = parse(checkPlaybook(project, host))[0].roles[0].vars;
    assert.deepEqual(vars.role_checks_roles, [
      'ainova.infra.host_health',
      'ainova.infra.host_base',
      'ainova.infra.dev_workstation',
      'ainova.infra.container_engine',
      'local_gateway',
    ]);
    assert.equal(vars.role_checks_only, undefined);
    assert.deepEqual(parse(checkPlaybook(project, host, ['host_base']))[0].roles[0].vars.role_checks_only, ['ainova.infra.host_base']);
  } finally {
    fixture.cleanup();
  }
});

test('bundle: ansible.cfg pins strict host keys and the project roles path', () => {
  const fixture = fixtureProject();
  try {
    const project = loadProject(fixture.root);
    const files = bundle(project, loadEnv(project), options, project.manifest.hosts).files;
    assert.deepEqual([...files.keys()].sort(), [
      'ansible.cfg',
      'check-demo-dev-01.yml',
      'check-demo-staging-01.yml',
      'inventory.yml',
      'site-demo-dev-01.yml',
      'site-demo-staging-01.yml',
    ]);
    const config = files.get('ansible.cfg')!;
    assert.match(config, /^roles_path = \/work\/demo\/ansible\/roles$/m);
    assert.match(config, /^host_key_checking = True$/m);
    assert.match(config, /StrictHostKeyChecking=yes/);
  } finally {
    fixture.cleanup();
  }
});
