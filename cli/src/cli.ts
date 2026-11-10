import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { ACTIONS, adminSsh, connect, type Action } from './connect.ts';
import { connection, IDENTITY_FILE, loadEnv } from './env.ts';
import { bundle, type GenerateOptions } from './generate.ts';
import { activateHost, addHost, removeHost, retireHost } from './hosts.ts';
import { listRemote, lockProblems, parseVersion, pickTag, readLock, writeLock, type Lock } from './lock.ts';
import { DEFAULT_SOURCE, findHost, loadProject, MANIFEST, type Host, type Project } from './manifest.ts';
import { findTarget, link, readRegistry, unlink } from './registry.ts';
import { linuxPath, runRunner } from './runner.ts';
import { hostSecrets, runnerTokens } from './secrets.ts';
import { InfraError, isWindows, note, warn } from './util.ts';
import { projectPlaybooks, validateProject } from './validate.ts';

const PACKAGE = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')) as { version: string };
export const VERSION = PACKAGE.version;

const HELP = `infra ${VERSION} - every host a project owns, from its infra.yaml

Project
  infra init [--project <name>] [--ansible <dir>]   create infra.yaml, the Ansible directory and the lock
  infra validate [--ansible]          conformance of the project; --ansible adds a syntax check of every playbook
  infra status                        project, locked source and hosts
  infra update [--ref <tag|branch|commit>]   lock the newest source the range accepts, or one ref
  infra host add <id> --class <class> [--provider <p>] [--role <r>]...
  infra host retire <id> | infra host remove <id>

Hosts (one host per run)
  infra check <host> [--role <r>]...  read-only check: host health and every role's check
  infra plan <host> [--role <r>]...   the apply as a dry run with diffs
  infra apply <host> [--role <r>]... [--yes] [--first-apply]
  infra run <playbook> <host>         one of the project's own playbooks
  infra trust <host> SHA256:<fingerprint>   record a host key confirmed out of band
  infra ssh <host> [-- <command>]     the admin account
  infra render <host> --out <dir>     write the generated inventory and playbooks for inspection

Operator
  infra connect <target> [${ACTIONS.join('|')}] [<port>] [--local-port <n>]
  infra link | infra unlink [<project>]   make this project's targets reachable from any directory

Arguments after -- go to ansible-playbook (never --limit or --inventory).
Environment: INFRA_SOURCE_DIR runs a local checkout of the source instead of the lock (development).`;

interface Parsed {
  positional: string[];
  flags: Map<string, string[]>;
  passthrough: string[];
}

const BOOLEAN = new Set(['yes', 'first-apply', 'ansible', 'help', 'version']);

export function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  let passthrough: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--') {
      passthrough = argv.slice(index + 1);
      break;
    }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      let value = inline;
      if (value === undefined) {
        if (BOOLEAN.has(name)) value = 'true';
        else {
          value = argv[++index];
          if (value === undefined) throw new InfraError(`--${name} needs a value`);
        }
      }
      flags.set(name, [...(flags.get(name) ?? []), value]);
    } else if (arg === '-h') {
      flags.set('help', ['true']);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags, passthrough };
}

function flag(parsed: Parsed, name: string): string | undefined {
  return parsed.flags.get(name)?.at(-1);
}

function only(parsed: Parsed, allowed: string[]): void {
  for (const name of parsed.flags.keys()) {
    if (!allowed.includes(name)) throw new InfraError(`unknown option --${name}`);
  }
}

function positionals(parsed: Parsed, min: number, max: number, usage: string): string[] {
  if (parsed.positional.length < min || parsed.positional.length > max) throw new InfraError(`usage: ${usage}`);
  return parsed.positional;
}

function generateOptions(project: Project): GenerateOptions {
  return { linuxRoot: linuxPath(project.root), linuxAnsibleDir: linuxPath(project.ansibleDir) };
}

/** The lock a run executes; a development run with INFRA_SOURCE_DIR may go without. */
function runnableLock(project: Project): Lock | undefined {
  const lock = readLock(project);
  if (process.env.INFRA_SOURCE_DIR) return lock;
  const problems = lockProblems(project, lock);
  if (problems.length > 0) throw new InfraError(problems.join('\n'));
  const locked = parseVersion(lock!.version);
  const own = parseVersion(VERSION);
  if (locked && own && (locked[0] > own[0] || (locked[0] === own[0] && locked[1] > own[1]))) {
    warn(`the project locks ${lock!.version}, newer than this CLI ${VERSION}; upgrade the CLI (npm install -g @ainova-systems/infra)`);
  }
  return lock;
}

function refusePassthrough(args: string[]): void {
  for (const arg of args) {
    if (/^(-i|--inventory|-l|--limit)(=|$)/.test(arg) || /^-[il]./.test(arg)) throw new InfraError(`${arg}: the CLI sets the inventory and the limit`);
  }
}

function roleFlags(parsed: Parsed, host: Host): string[] {
  const roles = parsed.flags.get('role') ?? [];
  for (const role of roles) {
    if (!host.roles.includes(role)) throw new InfraError(`${host.id} has no role '${role}' (roles: ${host.roles.join(', ')})`);
  }
  return roles;
}

async function confirm(question: string): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await prompt.question(`${question} [y/N] `)).trim());
  } finally {
    prompt.close();
  }
}

async function playbookRun(kind: 'check' | 'plan' | 'apply', parsed: Parsed): Promise<number> {
  only(parsed, kind === 'apply' ? ['role', 'yes', 'first-apply'] : ['role']);
  const [hostId] = positionals(parsed, 1, 1, `infra ${kind} <host>`);
  refusePassthrough(parsed.passthrough);
  const project = loadProject();
  const host = findHost(project, hostId!);
  if (host.status === 'retired') throw new InfraError(`${host.id} is retired`);
  const env = loadEnv(project);
  if (!connection(env, host).address) throw new InfraError(`${host.id} has no address: set ${`INFRA_${host.id.toUpperCase().replace(/-/g, '_')}_ADDRESS`} in ${project.manifest.env.file}`);
  const lock = runnableLock(project);
  const roles = roleFlags(parsed, host);
  const runVars: Record<string, unknown> = {};
  const extra = new Map<string, string>();
  let playbook = `site-${host.id}.yml`;
  const args = ['--limit', host.id, '-e', '@run-vars.yml'];

  if (kind === 'check') {
    playbook = `check-${host.id}.yml`;
    if (roles.length > 0) runVars.role_checks_only = roles.map((role) => (role.includes('.') || existsSync(join(project.ansibleDir, 'roles', role)) ? role : `ainova.infra.${role}`));
  } else {
    if (roles.length > 0) args.push('--tags', roles.join(','));
    if (kind === 'plan') args.push('--check', '--diff');
    if (flag(parsed, 'first-apply')) {
      if (host.status !== 'planned') throw new InfraError(`${host.id} is ${host.status}; --first-apply is for a planned host`);
      runVars.infra_first_apply = true;
    }
  }

  const secrets = await hostSecrets(host);
  const runsRunner = host.roles.some((role) => role.split('.').at(-1) === 'github_actions_runner');
  if (kind === 'apply' && runsRunner && (roles.length === 0 || roles.includes('github_actions_runner'))) Object.assign(secrets, runnerTokens(project));
  if (runsRunner && !process.stdin.isTTY) runVars.github_actions_runner_token_prompt = false;

  if (kind === 'apply' && !flag(parsed, 'yes')) {
    if (!process.stdin.isTTY) throw new InfraError(`apply without a terminal needs --yes (run 'infra plan ${host.id}' first)`);
    const scope = roles.length > 0 ? `roles ${roles.join(', ')}` : 'every role';
    if (!(await confirm(`Apply ${scope} to ${host.id}?`))) {
      note('nothing applied');
      return 1;
    }
  }

  extra.set('run-vars.yml', stringify(runVars));
  const result = await runRunner({
    mode: 'playbook',
    ...(lock ? { lock } : {}),
    bundle: bundle(project, env, generateOptions(project), [host], extra),
    ansibleDir: project.ansibleDir,
    playbook: `bundle:${playbook}`,
    ...(env.values.get(IDENTITY_FILE) ? { identityFile: env.values.get(IDENTITY_FILE)! } : {}),
    args: [...args, ...parsed.passthrough],
    env: secrets,
  });
  if (kind === 'apply' && runVars.infra_first_apply && result.code === 0 && roles.length === 0) activateHost(project, host.id);
  return result.code;
}

async function runProjectPlaybook(parsed: Parsed): Promise<number> {
  only(parsed, []);
  const [playbook, hostId] = positionals(parsed, 2, 2, 'infra run <playbook> <host>');
  refusePassthrough(parsed.passthrough);
  const project = loadProject();
  if (!projectPlaybooks(project).includes(playbook!)) {
    throw new InfraError(`no playbook ${playbook} in ${project.manifest.ansible}/ (playbooks: ${projectPlaybooks(project).join(', ') || 'none'})`);
  }
  const host = findHost(project, hostId!);
  if (host.status === 'retired') throw new InfraError(`${host.id} is retired`);
  const env = loadEnv(project);
  const lock = runnableLock(project);
  const secrets = await hostSecrets(host);
  const result = await runRunner({
    mode: 'playbook',
    ...(lock ? { lock } : {}),
    bundle: bundle(project, env, generateOptions(project), [host]),
    ansibleDir: project.ansibleDir,
    playbook: playbook!,
    ...(env.values.get(IDENTITY_FILE) ? { identityFile: env.values.get(IDENTITY_FILE)! } : {}),
    args: ['--limit', host.id, ...parsed.passthrough],
    env: secrets,
  });
  return result.code;
}

async function validate(parsed: Parsed): Promise<number> {
  only(parsed, ['ansible']);
  positionals(parsed, 0, 0, 'infra validate [--ansible]');
  const project = loadProject();
  const findings = validateProject(project);
  for (const message of findings.warnings) warn(message);
  for (const message of findings.errors) process.stderr.write(`FAIL ${message}\n`);
  if (findings.errors.length > 0) {
    process.stderr.write(`infra: ${findings.errors.length} problem(s) in ${project.manifest.project}\n`);
    return 1;
  }
  if (flag(parsed, 'ansible')) {
    const env = loadEnv(project);
    const lock = runnableLock(project);
    const extra = new Map([['project-playbooks.txt', projectPlaybooks(project).join('\n') + '\n']]);
    const result = await runRunner({
      mode: 'syntax',
      ...(lock ? { lock } : {}),
      bundle: bundle(project, env, generateOptions(project), project.manifest.hosts.filter((host) => host.status !== 'retired'), extra),
      ansibleDir: project.ansibleDir,
    });
    if (result.code !== 0) return result.code;
  }
  process.stdout.write(`OK ${project.manifest.project}: ${project.manifest.hosts.length} host(s) conform\n`);
  return 0;
}

function status(parsed: Parsed): number {
  only(parsed, []);
  const project = loadProject();
  const lock = readLock(project);
  const env = loadEnv(project);
  const out = [
    `project  ${project.manifest.project} (${project.root})`,
    `source   ${project.manifest.source.url} ${project.manifest.source.version}`,
    `locked   ${lock ? `${lock.version} ${lock.commit.slice(0, 12)}` : 'none'}${lockProblems(project, lock).length > 0 ? '  (run infra update)' : ''}`,
    `cli      ${VERSION}`,
    '',
    'HOST'.padEnd(28) + 'CLASS'.padEnd(12) + 'STATUS'.padEnd(10) + 'ADDRESS'.padEnd(9) + 'ROLES',
  ];
  for (const host of project.manifest.hosts) {
    const address = connection(env, host).address ? 'set' : '-';
    out.push(host.id.padEnd(28) + host.class.padEnd(12) + host.status.padEnd(10) + address.padEnd(9) + host.roles.join(', '));
  }
  if (project.manifest.connect.length > 0) {
    out.push('', 'TARGET'.padEnd(16) + 'HOST'.padEnd(28) + 'ACCOUNT');
    for (const target of project.manifest.connect) out.push(target.name.padEnd(16) + target.host.padEnd(28) + target.account + (target.direct ? ' (direct)' : ''));
  }
  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

function update(parsed: Parsed): number {
  only(parsed, ['ref']);
  positionals(parsed, 0, 0, 'infra update [--ref <ref>]');
  const project = loadProject();
  const { url, version } = project.manifest.source;
  const remote = listRemote(url);
  const ref = flag(parsed, 'ref');
  let lock: Lock;
  if (ref) {
    const found = [...remote.tags, ...remote.heads].find((item) => item.name === ref);
    if (found) lock = { url, version: found.name, commit: found.commit };
    else if (/^[0-9a-f]{40}$/.test(ref)) lock = { url, version: ref.slice(0, 12), commit: ref };
    else throw new InfraError(`${url} has no tag or branch ${ref}`);
  } else {
    const tag = pickTag(remote.tags, version);
    if (!tag) throw new InfraError(`${url} has no release tag in ${version}`);
    lock = { url, version: tag.name, commit: tag.commit };
  }
  const before = readLock(project);
  writeLock(project, lock);
  note(before && before.commit === lock.commit ? `already locked to ${lock.version}` : `locked ${lock.version} (${lock.commit.slice(0, 12)})${before ? `, was ${before.version}` : ''}`);
  return 0;
}

async function trust(parsed: Parsed): Promise<number> {
  only(parsed, []);
  const [hostId, fingerprint] = positionals(parsed, 2, 2, 'infra trust <host> SHA256:<fingerprint>');
  const project = loadProject();
  const host = findHost(project, hostId!);
  const reach = connection(loadEnv(project), host);
  if (!reach.address) throw new InfraError(`${host.id} has no address in ${project.manifest.env.file}`);
  const result = await runRunner({
    mode: 'trust',
    capture: true,
    env: { INFRA_TRUST_ADDRESS: reach.address, INFRA_TRUST_PORT: String(reach.port), INFRA_TRUST_FINGERPRINT: fingerprint! },
  });
  if (result.code !== 0) return result.code;
  const line = /^INFRA_KNOWN_HOST (.+)$/m.exec(result.stdout)?.[1]?.trim();
  if (isWindows && line) {
    // The workstation's own ssh (connect, VS Code) reads the Windows known_hosts, not WSL's.
    const known = join(homedir(), '.ssh', 'known_hosts');
    const existing = existsSync(known) ? readFileSync(known, 'utf8') : '';
    const [hostField] = line.split(' ');
    if (existing.split(/\r?\n/).some((entry) => entry.split(' ')[0] === hostField)) {
      note(`${hostField} already has an entry in ${known}`);
    } else {
      mkdirSync(dirname(known), { recursive: true });
      appendFileSync(known, (existing === '' || existing.endsWith('\n') ? '' : '\n') + line + '\n');
      note(`trusted ${hostField} in ${known}`);
    }
  }
  return 0;
}

function render(parsed: Parsed): number {
  only(parsed, ['out']);
  const [hostId] = positionals(parsed, 1, 1, 'infra render <host> --out <dir>');
  const out = flag(parsed, 'out');
  if (!out) throw new InfraError('name the directory: --out <dir>');
  const project = loadProject();
  const host = findHost(project, hostId!);
  const generated = bundle(project, loadEnv(project), generateOptions(project), [host]);
  mkdirSync(out, { recursive: true });
  for (const [name, content] of generated.files) writeFileSync(join(out, name), content);
  note(`wrote ${[...generated.files.keys()].join(', ')} to ${out}`);
  return 0;
}

function init(parsed: Parsed): number {
  only(parsed, ['project', 'ansible']);
  positionals(parsed, 0, 0, 'infra init [--project <name>] [--ansible <dir>]');
  const root = process.cwd();
  const manifestPath = join(root, MANIFEST);
  if (existsSync(manifestPath)) throw new InfraError(`${MANIFEST} already exists`);
  const name = flag(parsed, 'project') ?? basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ansible = flag(parsed, 'ansible') ?? 'ansible';
  const own = parseVersion(VERSION);
  const range = own ? `^${own.join('.')}` : '^0.5.0';
  writeFileSync(
    manifestPath,
    [
      '# Every host this project owns, run by the infra CLI (https://github.com/ainova-systems/infra).',
      '# Host settings are Ansible variables in the ansible directory; addresses live in the Git-ignored env file.',
      'contract: 1',
      `project: ${name}`,
      'source:',
      `  url: ${DEFAULT_SOURCE}`,
      `  version: "${range}"`,
      `ansible: ${ansible}`,
      'hosts: {}',
      '',
    ].join('\n'),
  );
  for (const dir of ['group_vars', 'host_vars']) mkdirSync(join(root, ansible, dir), { recursive: true });
  const example = join(root, '.env.example');
  if (!existsSync(example)) {
    writeFileSync(example, '# Operator values for the infra CLI: addresses, ports, the admin login and key path. Never a secret.\nINFRA_ADMIN_USER=\nINFRA_SSH_IDENTITY_FILE=\n');
  }
  note(`created ${MANIFEST}; next: 'infra update', then 'infra host add <id> --class <class>'`);
  return 0;
}

async function connectCommand(parsed: Parsed): Promise<number> {
  only(parsed, ['local-port']);
  const [name, actionText, portText] = positionals(parsed, 1, 3, `infra connect <target> [${ACTIONS.join('|')}] [<port>]`);
  const action = (actionText ?? 'connect') as Action;
  if (!ACTIONS.includes(action)) throw new InfraError(`unknown action '${actionText}' (${ACTIONS.join(', ')})`);
  const number = (text: string | undefined, what: string) => {
    if (text === undefined) return undefined;
    const value = Number(text);
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new InfraError(`${what} must be a port`);
    return value;
  };
  const port = number(portText, 'the application port');
  const localPort = number(flag(parsed, 'local-port'), '--local-port');
  const { project, target } = findTarget(name!);
  return connect(project, target, action, { ...(port !== undefined ? { port } : {}), ...(localPort !== undefined ? { localPort } : {}) });
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP + '\n');
    return 0;
  }
  if (command === 'version' || command === '--version') {
    process.stdout.write(VERSION + '\n');
    return 0;
  }
  const parsed = parseArgs(rest);
  if (flag(parsed, 'help')) {
    process.stdout.write(HELP + '\n');
    return 0;
  }
  switch (command) {
    case 'init':
      return init(parsed);
    case 'validate':
      return validate(parsed);
    case 'status':
      return status(parsed);
    case 'update':
      return update(parsed);
    case 'check':
    case 'plan':
    case 'apply':
      return playbookRun(command, parsed);
    case 'run':
      return runProjectPlaybook(parsed);
    case 'trust':
      return trust(parsed);
    case 'render':
      return render(parsed);
    case 'ssh': {
      only(parsed, []);
      const [hostId] = positionals(parsed, 1, 1, 'infra ssh <host> [-- <command>]');
      return adminSsh(loadProject(), hostId!, parsed.passthrough);
    }
    case 'connect':
      return connectCommand(parsed);
    case 'host': {
      const [sub, id] = parsed.positional;
      const project = loadProject();
      if (sub === 'add' && id && parsed.positional.length === 2) {
        only(parsed, ['class', 'provider', 'role']);
        const hostClass = flag(parsed, 'class');
        if (!hostClass) throw new InfraError('name the class: --class <class>');
        const provider = flag(parsed, 'provider');
        addHost(project, id, { class: hostClass, ...(provider ? { provider } : {}), roles: parsed.flags.get('role') ?? [] });
        return 0;
      }
      only(parsed, []);
      if (sub === 'retire' && id && parsed.positional.length === 2) return (retireHost(project, id), 0);
      if (sub === 'remove' && id && parsed.positional.length === 2) return (removeHost(project, id), 0);
      throw new InfraError('usage: infra host add <id> --class <class> | infra host retire <id> | infra host remove <id>');
    }
    case 'link': {
      only(parsed, []);
      positionals(parsed, 0, 0, 'infra link');
      const project = loadProject();
      link(project);
      note(`linked ${project.manifest.project}: its targets (${project.manifest.connect.map((t) => t.name).join(', ') || 'none'}) work from any directory`);
      return 0;
    }
    case 'unlink': {
      only(parsed, []);
      const [name] = positionals(parsed, 0, 1, 'infra unlink [<project>]');
      const target = name ?? loadProject().manifest.project;
      note(unlink(target) ? `unlinked ${target}` : `${target} was not linked (linked: ${Object.keys(readRegistry()).join(', ') || 'none'})`);
      return 0;
    }
    default:
      throw new InfraError(`unknown command '${command}'; see 'infra help'`);
  }
}

export { main };
