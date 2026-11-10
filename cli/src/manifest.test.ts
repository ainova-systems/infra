import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'yaml';
import { loadProject, parseManifest, qualifyRole } from './manifest.ts';
import { fixtureProject, MANIFEST_TEXT } from './test-support.ts';

const base = () => parse(MANIFEST_TEXT) as Record<string, unknown>;

test('reads a manifest with class defaults, groups, hooks, secrets and targets', () => {
  const manifest = parseManifest(base());
  assert.equal(manifest.project, 'demo');
  assert.equal(manifest.ansible, 'ansible');
  assert.deepEqual(manifest.env, { file: '.env', example: '.env.example', values: ['BACKUP_ENDPOINT'] });
  const staging = manifest.hosts.find((host) => host.id === 'demo-staging-01')!;
  assert.deepEqual(staging.roles, ['host_base', 'container_engine', 'compose_host']);
  assert.deepEqual(staging.groups, ['backups']);
  assert.deepEqual(staging.secrets, [
    { name: 'DEMO_TOKEN', runs: ['check', 'plan', 'apply', 'run'] },
    { name: 'DEMO_BACKUP_KEY', runs: ['check'] },
  ]);
  assert.equal(staging.observed, 'ansible/observed/demo-staging-01.md');
  const dev = manifest.hosts.find((host) => host.id === 'demo-dev-01')!;
  assert.deepEqual(dev.before[0], { role: 'local_gateway', tasksFrom: 'preflight', tags: ['always'] });
  assert.deepEqual(dev.before[1]!.tags, ['local_gateway', 'container_engine']);
  assert.deepEqual(manifest.connect, [
    { name: 'demo1', host: 'demo-dev-01', account: 'coder', direct: true },
    { name: 'demo2', host: 'demo-dev-01', account: 'other', direct: false },
  ]);
});

test('collects every problem before failing', () => {
  const raw = base();
  raw.extra = 1;
  (raw.hosts as Record<string, Record<string, unknown>>)['demo-dev-01']!.class = 'qa';
  (raw.hosts as Record<string, Record<string, unknown>>)['Bad_Id'] = { class: 'dev', status: 'active', roles: ['x'] };
  (raw.connect as Record<string, Record<string, unknown>>).demo1!.host = 'missing-01';
  assert.throws(
    () => parseManifest(raw),
    (error: Error) =>
      /unknown key 'extra'/.test(error.message) &&
      /hosts\.demo-dev-01\.class: must be one of/.test(error.message) &&
      /hosts\.Bad_Id: host ids are lowercase kebab-case/.test(error.message) &&
      /'missing-01' is not a declared host/.test(error.message),
  );
});

test('refuses another contract and names the remedy', () => {
  assert.throws(() => parseManifest({ ...base(), contract: 2 }), /upgrade the CLI/);
  assert.throws(() => parseManifest({ ...base(), contract: undefined }), /set contract: 1/);
});

test('a host without roles and without class roles is refused', () => {
  const raw = base();
  (raw.hosts as Record<string, Record<string, unknown>>)['demo-dev-01']!.roles = [];
  assert.throws(() => parseManifest(raw), /lists no role/);
});

test('a class is never also a group, and a value never listed twice', () => {
  const raw = base();
  (raw.hosts as Record<string, Record<string, unknown>>)['demo-staging-01']!.groups = ['dev'];
  (raw.hosts as Record<string, Record<string, unknown>>)['demo-dev-01']!.roles = ['host_base', 'host_base'];
  assert.throws(() => parseManifest(raw), (error: Error) => /is a class, not a group/.test(error.message) && /lists a value twice/.test(error.message));
});

test('project roles win over collection roles; qualified names pass', () => {
  const fixture = fixtureProject();
  try {
    const project = loadProject(fixture.root);
    assert.equal(qualifyRole(project, 'local_gateway'), 'local_gateway');
    assert.equal(qualifyRole(project, 'host_base'), 'ainova.infra.host_base');
    assert.equal(qualifyRole(project, 'other.coll.role'), 'other.coll.role');
  } finally {
    fixture.cleanup();
  }
});
