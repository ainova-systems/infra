import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { posixQuote, remoteCommand, remoteScript, resolveReach, sshConfigBlock } from './connect.ts';
import { loadProject } from './manifest.ts';
import { fixtureProject } from './test-support.ts';

const direct = { name: 'demo1', host: 'demo-dev-01', account: 'coder', direct: true };
const viaAdmin = { name: 'demo2', host: 'demo-dev-01', account: 'other', direct: false };

test('a direct target runs in the account login shell; another goes through the admin with sudo', () => {
  assert.equal(remoteCommand(direct, 'cd ~/work && exec herdr'), "bash -lc 'cd ~/work && exec herdr'");
  assert.equal(remoteCommand(viaAdmin, 'cd ~/work && exec herdr'), "sudo -n -iu other -- bash -c 'cd ~/work && exec herdr'");
});

test('remote scripts carry no $name a login shell would expand first', () => {
  for (const action of ['connect', 'shell', 'files', 'git', 'agents', 'repos', 'updates', 'check'] as const) {
    assert.doesNotMatch(remoteScript(action, 'coder'), /\$[A-Za-z_]/, action);
  }
});

const bash = spawnSync('bash', ['-c', 'true']).status === 0;

test('quoting survives a real POSIX shell', { skip: !bash && 'no bash' }, () => {
  for (const text of ["it's", "a 'b' c", '$(id) `x` "q"', "find -printf '%h\\n'"]) {
    const result = spawnSync('bash', ['-c', `printf %s ${posixQuote(text)}`], { encoding: 'utf8' });
    assert.equal(result.stdout, text);
  }
  const repos = spawnSync('bash', ['-n', '-c', remoteScript('repos', 'coder')]);
  assert.equal(repos.status, 0);
  const check = spawnSync('bash', ['-n', '-c', remoteScript('check', 'coder')]);
  assert.equal(check.status, 0);
});

test('the managed SSH block is placed first, replaced in place and never duplicates a foreign alias', () => {
  const first = sshConfigBlock('Host other\n    User x\n', 'infra-demo-demo1', ['HostName 10.0.0.5', 'User coder']);
  assert.ok(first.startsWith('# BEGIN infra infra-demo-demo1\nHost infra-demo-demo1\n    HostName 10.0.0.5\n'));
  assert.ok(first.includes('Host *\n# END infra infra-demo-demo1\nHost other'));
  const second = sshConfigBlock(first, 'infra-demo-demo1', ['HostName 10.0.0.6', 'User coder']);
  assert.equal(second.match(/# BEGIN infra/g)?.length, 1);
  assert.ok(second.includes('HostName 10.0.0.6') && !second.includes('HostName 10.0.0.5'));
  assert.throws(() => sshConfigBlock('Host infra-demo-demo1\n', 'infra-demo-demo1', []), /outside the managed block/);
  assert.throws(() => sshConfigBlock('# BEGIN infra infra-demo-demo1\n', 'infra-demo-demo1', []), /malformed/);
});

test('reach: address and port from the env file, the admin from group_vars when the env names none', () => {
  const fixture = fixtureProject({ '.env': 'INFRA_DEMO_DEV_01_ADDRESS=10.0.0.5\nINFRA_SSH_IDENTITY_FILE=/home/op/.ssh/id\n' });
  try {
    const reach = resolveReach(loadProject(fixture.root), 'demo-dev-01');
    assert.equal(reach.address, '10.0.0.5');
    assert.equal(reach.port, 22);
    assert.equal(reach.admin, 'admin');
    assert.ok(reach.identity?.endsWith('id'));
    assert.throws(() => resolveReach(loadProject(fixture.root), 'demo-staging-01'), /has no address/);
  } finally {
    fixture.cleanup();
  }
});
