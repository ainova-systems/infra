import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connection, declaredValues, envProblems, loadEnv, parseEnv } from './env.ts';
import { findHost, loadProject } from './manifest.ts';
import { fixtureProject } from './test-support.ts';

test('parses KEY=value lines with comments, export and quotes', () => {
  const file = parseEnv('# c\n\nexport A=1\nB="two words"\nC=\'x\'\n', 'f');
  assert.deepEqual([...file.values], [['A', '1'], ['B', 'two words'], ['C', 'x']]);
  assert.equal(file.lines.get('B'), 4);
  assert.throws(() => parseEnv('not a line\n', 'f'), /f:1: not a KEY=value line/);
});

test('only declared INFRA_* names pass; secret-like names never do; other tools keep theirs', () => {
  const fixture = fixtureProject();
  try {
    const project = loadProject(fixture.root);
    const file = parseEnv(
      'INFRA_DEMO_DEV_01_ADDRESS=a\nINFRA_ADMIN_SOURCE_CIDR=10.0.0.0/8\nINFRA_GITHUB_TOKEN=x\nINFRA_SSH_IDENTITY_FILE=/k\nOTHER=1\n',
      '.env',
    );
    const problems = envProblems(project, file);
    assert.equal(problems.length, 2);
    assert.match(problems[0]!, /\.env:2: INFRA_ADMIN_SOURCE_CIDR is not a name this project declares/);
    assert.match(problems[1]!, /\.env:3: INFRA_GITHUB_TOKEN looks like a secret/);
  } finally {
    fixture.cleanup();
  }
});

test('connection values: address, port, admin; extra values for infra_env', () => {
  const fixture = fixtureProject({ '.env': 'INFRA_DEMO_DEV_01_ADDRESS=10.0.0.5\nINFRA_DEMO_DEV_01_PORT=2222\nINFRA_ADMIN_USER=ops\nINFRA_BACKUP_ENDPOINT=https://e\n' });
  try {
    const project = loadProject(fixture.root);
    const env = loadEnv(project);
    assert.deepEqual(connection(env, findHost(project, 'demo-dev-01')), { address: '10.0.0.5', port: 2222, admin: 'ops' });
    assert.deepEqual(connection(env, findHost(project, 'demo-staging-01')), { address: undefined, port: 22, admin: 'ops' });
    assert.deepEqual(declaredValues(project, env), { BACKUP_ENDPOINT: 'https://e' });
  } finally {
    fixture.cleanup();
  }
});

test('a refused env file stops the run with every problem', () => {
  const fixture = fixtureProject({ '.env': 'INFRA_DEMO_DEV_01_ADDRESS=a\nINFRA_ADMIN_SOURCE_CIDR=x\n' });
  try {
    assert.throws(() => loadEnv(loadProject(fixture.root)), /operator env file refused/);
  } finally {
    fixture.cleanup();
  }
});

test('a malformed port or address is refused', () => {
  const fixture = fixtureProject({ '.env': 'INFRA_DEMO_DEV_01_ADDRESS=a b\nINFRA_DEMO_STAGING_01_PORT=70000\n' });
  try {
    const project = loadProject(fixture.root);
    const env = loadEnv(project);
    assert.throws(() => connection(env, findHost(project, 'demo-dev-01')), /not a host name/);
    assert.throws(() => connection(env, findHost(project, 'demo-staging-01')), /not a port/);
  } finally {
    fixture.cleanup();
  }
});
