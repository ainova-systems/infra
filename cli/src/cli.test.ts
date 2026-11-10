import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { main, parseArgs } from './cli.ts';
import { readRegistry } from './registry.ts';
import { fixtureProject } from './test-support.ts';

async function inProject<T>(root: string, run: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

async function capture(run: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const stdout = process.stdout.write.bind(process.stdout);
  const stderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string) => (out.push(String(chunk)), true)) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => (err.push(String(chunk)), true)) as typeof process.stderr.write;
  try {
    return { code: await run(), out: out.join(''), err: err.join('') };
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

test('arguments: repeated flags, inline values, booleans and passthrough', () => {
  const parsed = parseArgs(['h1', '--role', 'a', '--role=b', '--yes', '--', '-v', '--diff']);
  assert.deepEqual(parsed.positional, ['h1']);
  assert.deepEqual(parsed.flags.get('role'), ['a', 'b']);
  assert.deepEqual(parsed.flags.get('yes'), ['true']);
  assert.deepEqual(parsed.passthrough, ['-v', '--diff']);
  assert.throws(() => parseArgs(['--role']), /--role needs a value/);
});

test('validate passes a conforming project and fails a broken one', async () => {
  const good = fixtureProject();
  const bad = fixtureProject({ 'ansible/site.yml': '[]\n' });
  try {
    const ok = await inProject(good.root, () => capture(() => main(['validate'])));
    assert.equal(ok.code, 0, ok.err);
    assert.match(ok.out, /OK demo: 2 host\(s\) conform/);
    const failed = await inProject(bad.root, () => capture(() => main(['validate'])));
    assert.equal(failed.code, 1);
    assert.match(failed.err, /FAIL ansible\/site\.yml/);
  } finally {
    good.cleanup();
    bad.cleanup();
  }
});

test('status lists the lock, hosts and targets without printing addresses', async () => {
  const fixture = fixtureProject();
  try {
    const result = await inProject(fixture.root, () => capture(() => main(['status'])));
    assert.equal(result.code, 0);
    assert.match(result.out, /locked\s+v0\.5\.0 aaaaaaaaaaaa/);
    assert.match(result.out, /demo-dev-01\s+dev\s+active\s+set/);
    assert.match(result.out, /demo1\s+demo-dev-01\s+coder \(direct\)/);
    assert.doesNotMatch(result.out, /10\.0\.0\.5/);
  } finally {
    fixture.cleanup();
  }
});

test('render writes the generated files of one host', async () => {
  const fixture = fixtureProject();
  const out = mkdtempSync(join(tmpdir(), 'infra-render-'));
  try {
    const result = await inProject(fixture.root, () => capture(() => main(['render', 'demo-dev-01', '--out', out])));
    assert.equal(result.code, 0, result.err);
    for (const name of ['ansible.cfg', 'inventory.yml', 'site-demo-dev-01.yml', 'check-demo-dev-01.yml']) assert.ok(existsSync(join(out, name)), name);
  } finally {
    fixture.cleanup();
    rmSync(out, { recursive: true, force: true });
  }
});

test('host add declares a planned host; remove takes it back out', async () => {
  const fixture = fixtureProject();
  try {
    await inProject(fixture.root, () => capture(() => main(['host', 'add', 'demo-cicd-01', '--class', 'cicd', '--provider', 'proxmox', '--role', 'host_base', '--role', 'container_engine'])));
    const manifest = parse(readFileSync(join(fixture.root, 'infra.yaml'), 'utf8'));
    assert.deepEqual(manifest.hosts['demo-cicd-01'], { class: 'cicd', provider: 'proxmox', status: 'planned', roles: ['host_base', 'container_engine'] });
    assert.ok(existsSync(join(fixture.root, 'ansible/host_vars/demo-cicd-01.yml')));
    assert.match(readFileSync(join(fixture.root, '.env.example'), 'utf8'), /^INFRA_DEMO_CICD_01_ADDRESS=$/m);
    const valid = await inProject(fixture.root, () => capture(() => main(['validate'])));
    assert.equal(valid.code, 0, valid.err);

    await inProject(fixture.root, () => capture(() => main(['host', 'remove', 'demo-cicd-01'])));
    assert.equal(parse(readFileSync(join(fixture.root, 'infra.yaml'), 'utf8')).hosts['demo-cicd-01'], undefined);
    assert.doesNotMatch(readFileSync(join(fixture.root, '.env.example'), 'utf8'), /DEMO_CICD_01/);
    // Comments in the manifest survive an edit.
    assert.equal(readFileSync(join(fixture.root, 'infra.yaml'), 'utf8').includes('connect:'), true);
  } finally {
    fixture.cleanup();
  }
});

test('an active host is retired before it can be removed', async () => {
  const fixture = fixtureProject();
  try {
    await assert.rejects(inProject(fixture.root, () => main(['host', 'remove', 'demo-dev-01'])), /is active; retire it first/);
    await inProject(fixture.root, () => capture(() => main(['host', 'retire', 'demo-staging-01'])));
    assert.equal(parse(readFileSync(join(fixture.root, 'infra.yaml'), 'utf8')).hosts['demo-staging-01'].status, 'retired');
    await assert.rejects(inProject(fixture.root, () => main(['check', 'demo-staging-01'])), /is retired/);
  } finally {
    fixture.cleanup();
  }
});

test('runs refuse what the CLI owns, unknown roles, and a host without an address', async () => {
  const fixture = fixtureProject();
  try {
    await assert.rejects(inProject(fixture.root, () => main(['check', 'demo-dev-01', '--', '--limit', 'all'])), /the CLI sets the inventory and the limit/);
    await assert.rejects(inProject(fixture.root, () => main(['plan', 'demo-dev-01', '--role', 'swarm_node'])), /has no role 'swarm_node'/);
    await assert.rejects(inProject(fixture.root, () => main(['apply', 'demo-staging-01', '--yes'])), /has no address/);
    await assert.rejects(inProject(fixture.root, () => main(['apply', 'demo-dev-01', '--first-apply', '--yes'])), /--first-apply is for a planned host/);
  } finally {
    fixture.cleanup();
  }
});

test('link makes targets reachable from anywhere; unlink removes the project', async () => {
  const fixture = fixtureProject();
  const config = mkdtempSync(join(tmpdir(), 'infra-config-'));
  process.env.INFRA_CONFIG_DIR = config;
  try {
    await inProject(fixture.root, () => capture(() => main(['link'])));
    assert.equal(readRegistry().demo, fixture.root);
    await capture(() => main(['unlink', 'demo']));
    assert.deepEqual(readRegistry(), {});
  } finally {
    delete process.env.INFRA_CONFIG_DIR;
    fixture.cleanup();
    rmSync(config, { recursive: true, force: true });
  }
});

test('init creates a manifest a fresh project validates against once locked', async () => {
  const root = mkdtempSync(join(tmpdir(), 'infra-init-'));
  try {
    const result = await inProject(root, () => capture(() => main(['init', '--project', 'fresh'])));
    assert.equal(result.code, 0);
    const manifest = parse(readFileSync(join(root, 'infra.yaml'), 'utf8'));
    assert.equal(manifest.project, 'fresh');
    assert.equal(manifest.contract, 1);
    await assert.rejects(inProject(root, () => main(['init'])), /already exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
