import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { fullApply, main, parseArgs, runs, UPGRADE_ARGS } from './cli.ts';
import { readRegistry } from './registry.ts';
import type { RunRequest } from './runner.ts';
import { fixtureProject, MANIFEST_TEXT } from './test-support.ts';

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

/** Runs one CLI command against a planned, addressed demo-staging-01 with a recording runner in place of Ansible. */
async function firstRun(argv: string[], code = 0): Promise<{ before: string; after: string; requests: RunRequest[]; err: string }> {
  const fixture = fixtureProject({ '.env': 'INFRA_DEMO_DEV_01_ADDRESS=10.0.0.5\nINFRA_DEMO_STAGING_01_ADDRESS=10.0.0.6\nINFRA_BACKUP_ENDPOINT=https://s3.example.invalid\n' });
  const requests: RunRequest[] = [];
  const original = runs.runner;
  runs.runner = async (request) => (requests.push(request), { code, stdout: '' });
  process.env.DEMO_TOKEN = 'not-a-secret';
  try {
    const before = readFileSync(join(fixture.root, 'infra.yaml'), 'utf8');
    const result = await inProject(fixture.root, () => capture(() => main(argv)));
    return { before, after: readFileSync(join(fixture.root, 'infra.yaml'), 'utf8'), requests, err: result.err };
  } finally {
    runs.runner = original;
    delete process.env.DEMO_TOKEN;
    fixture.cleanup();
  }
}

/** The lines that differ between two texts of the same length, as [before, after] pairs. */
function changedLines(before: string, after: string): string[][] {
  const a = before.split('\n');
  const b = after.split('\n');
  assert.equal(a.length, b.length);
  return a.flatMap((line, index) => (line === b[index] ? [] : [[line, b[index]!]]));
}

test('plan --first-apply is the dry run of a planned host and writes nothing', async () => {
  const run = await firstRun(['plan', 'demo-staging-01', '--first-apply']);
  assert.equal(run.after, run.before);
  assert.equal(run.requests.length, 1);
  assert.deepEqual(run.requests[0]!.args!.slice(-2), ['--check', '--diff']);
  assert.equal(parse(run.requests[0]!.bundle!.files.get('run-vars.yml')!).infra_first_apply, true);
  const active = await firstRun(['plan', 'demo-dev-01', '--first-apply']).catch((error: Error) => error);
  assert.match(String(active), /--first-apply is for a planned host/);
});

test('apply --first-apply in check mode, diff-only or on a subset leaves the host planned', async () => {
  for (const extra of [['--', '--check'], ['--', '-C'], ['--', '-vC'], ['--', '--diff-only'], ['--', '--tags', 'host_base'], ['--role', 'host_base']]) {
    const run = await firstRun(['apply', 'demo-staging-01', '--first-apply', '--yes', ...extra]);
    assert.equal(run.requests.length, 1, extra.join(' '));
    assert.equal(run.after, run.before, extra.join(' '));
    assert.match(run.err, /stays planned/);
  }
  const failed = await firstRun(['apply', 'demo-staging-01', '--first-apply', '--yes'], 2);
  assert.equal(failed.after, failed.before);
});

test('a full first apply sets the host active by changing its status line only', async () => {
  const run = await firstRun(['apply', 'demo-staging-01', '--first-apply', '--yes', '--', '-v', '--diff', '-e', 'x=-C']);
  assert.deepEqual(changedLines(run.before, run.after), [['    status: planned', '    status: active']]);
});

test('fullApply reads check mode, listings and subsets in the arguments for ansible-playbook', () => {
  for (const args of [[], ['-v'], ['--diff'], ['-D'], ['-e', 'a=b'], ['-eC=1'], ['--extra-vars=--check']]) assert.equal(fullApply(args), true, args.join(' '));
  for (const args of [['--check'], ['-C'], ['-DC'], ['--diff-only'], ['--syntax-check'], ['--list-tasks'], ['-t', 'x'], ['--tags=x'], ['--skip-tags', 'x'], ['--start-at-task', 'x']]) {
    assert.equal(fullApply(args), false, args.join(' '));
  }
});

test('manifest edits keep every other line byte for byte', async () => {
  const fixture = fixtureProject();
  const path = join(fixture.root, 'infra.yaml');
  const block = '  demo-cicd-01:\n    class: cicd\n    status: planned\n    roles: [host_base, container_engine]\n';
  try {
    const before = readFileSync(path, 'utf8');
    await inProject(fixture.root, () => capture(() => main(['host', 'retire', 'demo-staging-01'])));
    const retired = readFileSync(path, 'utf8');
    assert.deepEqual(changedLines(before, retired), [['    status: planned', '    status: retired']]);

    await inProject(fixture.root, () => capture(() => main(['host', 'add', 'demo-cicd-01', '--class', 'cicd', '--role', 'host_base', '--role', 'container_engine'])));
    const added = readFileSync(path, 'utf8');
    assert.ok(added.includes(`${block}connect:\n`), added);
    assert.equal(added.replace(block, ''), retired);

    await inProject(fixture.root, () => capture(() => main(['host', 'remove', 'demo-cicd-01'])));
    assert.equal(readFileSync(path, 'utf8'), retired);
    await inProject(fixture.root, () => capture(() => main(['host', 'remove', 'demo-staging-01'])));
    const removed = readFileSync(path, 'utf8');
    assert.equal(parse(removed).hosts['demo-staging-01'], undefined);
    assert.ok(removed.includes('    roles: [host_base, dev_workstation, container_engine, local_gateway]\n'));
    assert.ok(removed.includes('      - { role: local_gateway, tasks_from: postflight }\nconnect:\n'));
  } finally {
    fixture.cleanup();
  }
});

test('host add fills an empty hosts: {} and keeps CRLF line ends', async () => {
  const manifest = MANIFEST_TEXT.replace(/hosts:[\s\S]*$/, 'hosts: {}\n').replace(/\n/g, '\r\n');
  const fixture = fixtureProject({ 'infra.yaml': manifest });
  const path = join(fixture.root, 'infra.yaml');
  try {
    await inProject(fixture.root, () => capture(() => main(['host', 'add', 'demo-dev-02', '--class', 'dev'])));
    const text = readFileSync(path, 'utf8');
    assert.ok(text.endsWith('hosts:\r\n  demo-dev-02:\r\n    class: dev\r\n    status: planned\r\n'), JSON.stringify(text));
    assert.ok(text.includes('  values: [BACKUP_ENDPOINT]\r\n'));
  } finally {
    fixture.cleanup();
  }
});

test('upgrade installs the latest CLI through npm, outside any project, and passes its exit code', async () => {
  const root = mkdtempSync(join(tmpdir(), 'infra-upgrade-'));
  const calls: string[][] = [];
  const original = runs.npm;
  try {
    for (const code of [0, 3]) {
      runs.npm = (args) => (calls.push(args), code);
      const result = await inProject(root, () => capture(() => main(['upgrade'])));
      assert.equal(result.code, code);
    }
    assert.deepEqual(calls, [UPGRADE_ARGS, UPGRADE_ARGS]);
    assert.deepEqual(UPGRADE_ARGS, ['install', '-g', '@ainova-systems/infra@latest']);
    await assert.rejects(main(['upgrade', 'next']), /usage: infra upgrade/);
    await assert.rejects(main(['upgrade', '--', '--force']), /usage: infra upgrade/);
    await assert.rejects(main(['upgrade', '--yes']), /unknown option --yes/);
    assert.equal(calls.length, 2);
  } finally {
    runs.npm = original;
    rmSync(root, { recursive: true, force: true });
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
