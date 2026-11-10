import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockProblems, pickTag, readLock, satisfies } from './lock.ts';
import { loadProject } from './manifest.ts';
import { COMMIT, fixtureProject } from './test-support.ts';

test('ranges follow npm caret, tilde, floor and exact semantics', () => {
  assert.ok(satisfies('v0.5.3', '^0.5.0'));
  assert.ok(!satisfies('v0.6.0', '^0.5.0'));
  assert.ok(satisfies('v1.9.0', '^1.2.0'));
  assert.ok(!satisfies('v2.0.0', '^1.2.0'));
  assert.ok(satisfies('v1.2.9', '~1.2.0'));
  assert.ok(!satisfies('v1.3.0', '~1.2.0'));
  assert.ok(satisfies('v3.0.0', '>=1.2.0'));
  assert.ok(satisfies('1.2.3', '1.2.3'));
  assert.ok(!satisfies('v1.2.2', '^1.2.3'));
  assert.ok(!satisfies('main', '^1.2.3'));
});

test('picks the newest release tag inside the range', () => {
  const tags = [
    { name: 'v0.4.4', commit: '1' },
    { name: 'v0.5.0', commit: '2' },
    { name: 'v0.5.2', commit: '3' },
    { name: 'v0.6.0', commit: '4' },
    { name: 'v0.5.3-rc.1', commit: '5' },
  ];
  assert.equal(pickTag(tags, '^0.5.0')?.name, 'v0.5.2');
  assert.equal(pickTag(tags, '^0.7.0'), undefined);
});

test('reads the lock and judges it against the manifest', () => {
  const fixture = fixtureProject();
  try {
    const project = loadProject(fixture.root);
    const lock = readLock(project);
    assert.deepEqual(lock, { url: 'https://github.com/ainova-systems/infra.git', version: 'v0.5.0', commit: COMMIT });
    assert.deepEqual(lockProblems(project, lock), []);
    assert.match(lockProblems(project, { ...lock!, version: 'v0.6.1' })[0]!, /outside source.version/);
    assert.match(lockProblems(project, { ...lock!, url: 'https://example.invalid/fork.git' })[0]!, /names https:\/\/example/);
    // A hand-pinned ref is accepted: it is not a release version to judge.
    assert.deepEqual(lockProblems(project, { ...lock!, version: 'main' }), []);
    assert.match(lockProblems(project, undefined)[0]!, /missing/);
  } finally {
    fixture.cleanup();
  }
});

test('a damaged lock is refused, never repaired', () => {
  const fixture = fixtureProject({ 'infra.lock': 'lock_version: 1\nsource:\n  url: x\n  version: v0.5.0\n  commit: abc\n' });
  try {
    assert.throws(() => readLock(loadProject(fixture.root)), /40-character commit/);
  } finally {
    fixture.cleanup();
  }
});
