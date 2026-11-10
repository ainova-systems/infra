import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { connection, IDENTITY_FILE, loadEnv } from './env.ts';
import { findHost, type ConnectTarget, type Project } from './manifest.ts';
import { InfraError, isRecord, isWindows, note, readYaml, toWindowsPath, warn } from './util.ts';

/**
 * Remote scripts of the dev-workstation actions, run by bash as the account in ~/work. Through sudo -i the
 * account's login shell re-reads the command first, so a script uses ~ and $(...) only, never $name.
 */
export const ACTIONS = ['connect', 'shell', 'files', 'git', 'agents', 'repos', 'updates', 'check', 'web', 'code'] as const;
export type Action = (typeof ACTIONS)[number];
const INTERACTIVE: Action[] = ['connect', 'shell', 'files', 'git'];

export function remoteScript(action: Exclude<Action, 'web' | 'code'>, account: string): string {
  switch (action) {
    case 'connect':
      return 'cd ~/work && exec herdr';
    case 'shell':
      return 'cd ~/work && exec bash -i';
    case 'files':
      return 'cd ~/work && exec fresh';
    case 'git':
      return 'cd ~/work && exec lazygit';
    case 'agents':
      return 'cd ~/work && exec herdr agent list';
    case 'repos':
      return "find -P ~/work -mindepth 1 -maxdepth 6 -name .git -prune -printf '%h\\n' | sort";
    case 'updates':
      // coding_agent_updates (ainova.infra) default state directory and both update timers.
      return "grep -sH '' /var/lib/coding-agent-updates/last-success /var/lib/coding-agent-updates/failed-components /var/lib/coding-agent-updates/*.tsv; systemctl list-timers coding-agent-updates.timer intelligence-cli-update.timer --no-pager";
    case 'check':
      return (
        `cd ~/work && test x$(id -un) = x${account} && test x$(printenv DOCKER_HOST) = xunix:///run/user/$(id -u)/docker.sock` +
        " && docker info --format '{{.SecurityOptions}}' | grep -q rootless" +
        ' && echo PASS identity=$(id -un) cwd=$(pwd) docker=rootless || { echo FAIL identity, workspace or private rootless Docker >&2; exit 1; }'
      );
  }
}

export function posixQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** The command ssh runs: straight in the account's login shell, or through the admin with sudo. */
export function remoteCommand(target: ConnectTarget, script: string): string {
  return target.direct
    ? `bash -lc ${posixQuote(script)}`
    : `sudo -n -iu ${target.account} -- bash -c ${posixQuote(script)}`;
}

export interface Reach {
  address: string;
  port: number;
  admin: string;
  identity: string | undefined;
}

/** The admin the env file names, else host_base_admin_user from the project's group_vars/all. */
export function resolveReach(project: Project, hostId: string): Reach {
  const host = findHost(project, hostId);
  const env = loadEnv(project);
  const reach = connection(env, host);
  if (!reach.address) throw new InfraError(`${hostId} has no address in ${project.manifest.env.file}`);
  let admin = reach.admin;
  if (!admin) {
    for (const file of ['all.yml', 'all.yaml']) {
      const path = join(project.ansibleDir, 'group_vars', file);
      const vars = existsSync(path) ? readYaml(path) : undefined;
      if (isRecord(vars) && typeof vars.host_base_admin_user === 'string') admin = vars.host_base_admin_user;
    }
  }
  if (!admin) throw new InfraError('no admin account: set INFRA_ADMIN_USER or host_base_admin_user in group_vars/all');
  const identityValue = env.values.get(IDENTITY_FILE) || undefined;
  const identity = identityValue && isWindows ? toWindowsPath(identityValue) : identityValue;
  return { address: reach.address, port: reach.port, admin, identity };
}

const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3'];

function sshBase(reach: Reach, user: string): string[] {
  return [...SSH_OPTIONS, '-o', 'ConnectTimeout=15', '-p', String(reach.port), ...(reach.identity ? ['-o', `IdentityFile=${reach.identity}`] : []), `${user}@${reach.address}`];
}

function runSsh(args: string[]): Promise<number> {
  return new Promise((done, failed) => {
    const child = spawn('ssh', args, { stdio: 'inherit' });
    child.on('error', (error) => failed(new InfraError(`cannot start ssh: ${error.message}`)));
    child.on('close', (code) => done(code ?? 1));
  });
}

/**
 * ssh exits 255 on its own failure. A port that does not answer at all is almost always the host firewall,
 * which drops SSH from every network outside host_base_ssh_allow_from: say so instead of a bare timeout.
 */
export function diagnose(address: string, port: number): Promise<void> {
  return new Promise((done) => {
    const socket = createConnection({ host: address, port });
    const finish = (message?: string) => {
      socket.destroy();
      if (message) warn(message);
      done();
    };
    socket.setTimeout(5000, () =>
      finish(
        `TCP ${port} on ${address} does not answer from this workstation. The host firewall drops SSH from every network ` +
          'outside host_base_ssh_allow_from; `infra check` lists the sources it dropped. If this network is missing, add it ' +
          "there and apply host_base; a VPN can present its clients under its gateway's address.",
      ),
    );
    socket.on('connect', () => finish());
    socket.on('error', (error) => finish(`nothing accepts TCP ${port} on ${address}: ${error.message}`));
  });
}

async function ssh(reach: Reach, args: string[]): Promise<number> {
  const code = await runSsh(args);
  if (code === 255) await diagnose(reach.address, reach.port);
  return code;
}

/** Admin shell on a host, or one command. */
export async function adminSsh(project: Project, hostId: string, command: string[]): Promise<number> {
  const reach = resolveReach(project, hostId);
  const base = sshBase(reach, reach.admin);
  return ssh(reach, command.length > 0 ? ['-T', ...base, command.join(' ')] : ['-tt', ...base]);
}

export interface ConnectOptions {
  port?: number;
  localPort?: number;
}

export async function connect(project: Project, target: ConnectTarget, action: Action, options: ConnectOptions): Promise<number> {
  const reach = resolveReach(project, target.host);
  if (target.account === reach.admin) throw new InfraError('the admin account is not a connect target');
  const user = target.direct ? target.account : reach.admin;

  if (action === 'web') {
    if (!options.port) throw new InfraError(`name the application port: infra connect ${target.name} web <port>`);
    const local = options.localPort ?? options.port;
    note(`HTTP tunnel 127.0.0.1:${local} -> ${target.host} loopback port ${options.port}; Ctrl+C closes it`);
    return ssh(reach, ['-N', '-T', '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${local}:127.0.0.1:${options.port}`, ...sshBase(reach, user)]);
  }
  if (options.port !== undefined || options.localPort !== undefined) throw new InfraError('port arguments belong to the web action');

  if (action === 'code') return code(project, target, reach);

  const tty = INTERACTIVE.includes(action) ? '-tt' : '-T';
  return ssh(reach, [tty, ...sshBase(reach, user), remoteCommand(target, remoteScript(action, target.account))]);
}

function refuseLink(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new InfraError(`${path} is a symbolic link; refused`);
}

/** A managed block in ~/.ssh/config for one alias, placed first so its settings win, closed by `Host *`. */
export function sshConfigBlock(existing: string, alias: string, lines: string[]): string {
  const start = `# BEGIN infra ${alias}`;
  const end = `# END infra ${alias}`;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escape(start)}\\r?\\n[\\s\\S]*?^${escape(end)}\\r?\\n?`, 'gm');
  const found = existing.match(pattern) ?? [];
  if ((existing.includes(start) || existing.includes(end)) && found.length !== 1) throw new InfraError('malformed managed block in the SSH configuration');
  const rest = existing.replace(pattern, '');
  if (new RegExp(`^\\s*Host\\s+[^\\r\\n]*\\b${escape(alias)}\\b`, 'im').test(rest)) throw new InfraError(`SSH alias ${alias} exists outside the managed block`);
  return [start, `Host ${alias}`, ...lines.map((line) => `    ${line}`), 'Host *', end].join('\n') + '\n' + rest;
}

async function code(project: Project, target: ConnectTarget, reach: Reach): Promise<number> {
  if (!target.direct) throw new InfraError(`${target.name} is not direct: VS Code needs the account itself to accept the operator key`);
  const alias = `infra-${project.manifest.project}-${target.name}`;
  const config = join(homedir(), '.ssh', 'config');
  refuseLink(dirname(config));
  refuseLink(config);
  const existing = existsSync(config) ? readFileSync(config, 'utf8') : '';
  const lines = [`HostName ${reach.address}`, `User ${target.account}`, `Port ${reach.port}`];
  if (reach.identity) {
    if (/["\r\n%]/.test(reach.identity)) throw new InfraError('invalid identity file path for the SSH configuration');
    lines.push(`IdentityFile "${reach.identity.replace(/\\/g, '/')}"`, 'IdentitiesOnly yes');
  }
  lines.push('StrictHostKeyChecking yes', 'ForwardAgent no', 'ForwardX11 no', 'ServerAliveInterval 30', 'ServerAliveCountMax 3');
  const updated = sshConfigBlock(existing, alias, lines);
  if (updated !== existing) {
    mkdirSync(dirname(config), { recursive: true });
    writeFileSync(config, updated);
  }
  const probe = spawnSync('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', alias, 'id -un'], { encoding: 'utf8' });
  if (probe.status === 255) await diagnose(reach.address, reach.port);
  if (probe.status !== 0 || probe.stdout.trim() !== target.account) throw new InfraError(`direct SSH as ${target.account} failed; VS Code was not opened`);
  setRemotePlatform(alias);
  const extensions = vscode(['--list-extensions'], true);
  if (extensions.status !== 0) throw new InfraError('cannot run VS Code (`code`)');
  if (!extensions.stdout.split(/\r?\n/).includes('ms-vscode-remote.remote-ssh')) {
    if (vscode(['--install-extension', 'ms-vscode-remote.remote-ssh']).status !== 0) throw new InfraError('Remote SSH extension installation failed');
  }
  return vscode(['--remote', `ssh-remote+${alias}`, `/home/${target.account}/work`]).status ?? 1;
}

/** code is a .cmd on Windows, which Node starts only through a shell: one command line of validated words. */
function vscode(args: string[], capture = false): { status: number | null; stdout: string } {
  for (const arg of args) if (!/^[A-Za-z0-9+._/-]+$/.test(arg)) throw new InfraError(`refused VS Code argument ${arg}`);
  const stdio = capture ? 'pipe' : 'inherit';
  const result = isWindows ? spawnSync(['code', ...args].join(' '), { encoding: 'utf8', stdio, shell: true }) : spawnSync('code', args, { encoding: 'utf8', stdio });
  return { status: result.status, stdout: result.stdout ?? '' };
}

/** Records Linux for the alias so Remote SSH does not ask; settings with comments are left untouched. */
function setRemotePlatform(alias: string): void {
  const base = isWindows ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')) : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : join(homedir(), '.config');
  const path = join(base, 'Code', 'User', 'settings.json');
  refuseLink(path);
  let settings: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!isRecord(parsed)) return;
      settings = parsed;
    } catch {
      warn('VS Code settings are JSONC; left unchanged. Select Linux if Remote SSH asks for the platform.');
      return;
    }
  }
  const mapping = isRecord(settings['remote.SSH.remotePlatform']) ? settings['remote.SSH.remotePlatform'] : {};
  if (mapping[alias] === 'linux') return;
  settings['remote.SSH.remotePlatform'] = { ...mapping, [alias]: 'linux' };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 4) + '\n');
}
