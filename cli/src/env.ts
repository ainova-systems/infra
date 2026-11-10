import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Host, Project } from './manifest.ts';
import { InfraError, envName } from './util.ts';

/**
 * The operator env file holds where hosts are and how to reach them - addresses, ports, the admin login,
 * the admin key path - plus the extra non-secret values the manifest declares (env.values). Nothing else
 * the CLI reads: policy (firewall sources, accounts, keys) is reviewed desired state, never per operator.
 * Only INFRA_* names are read; other names in a shared file are ignored.
 */
export const PREFIX = 'INFRA_';
const SECRET_LIKE = /(TOKEN|PASSWORD|PASSWD|SECRET|PRIVATE|CREDENTIAL|COOKIE|API_?KEY|ACCESS_KEY)/;

export function hostKeys(id: string): { address: string; port: string; admin: string } {
  const base = `${PREFIX}${envName(id)}`;
  return { address: `${base}_ADDRESS`, port: `${base}_PORT`, admin: `${base}_ADMIN_USER` };
}

export const ADMIN_USER = `${PREFIX}ADMIN_USER`;
export const IDENTITY_FILE = `${PREFIX}SSH_IDENTITY_FILE`;

export function valueKey(name: string): string {
  return `${PREFIX}${name}`;
}

/** Every INFRA_* name the manifest allows, with what it is for. */
export function allowedKeys(project: Project): Map<string, string> {
  const allowed = new Map<string, string>([
    [ADMIN_USER, 'admin account every run connects as (default host_base_admin_user)'],
    [IDENTITY_FILE, 'path of the admin private key loaded into a per-run ssh-agent'],
  ]);
  for (const host of project.manifest.hosts) {
    const keys = hostKeys(host.id);
    allowed.set(keys.address, `address of ${host.id}`);
    allowed.set(keys.port, `SSH port of ${host.id} (default 22)`);
    allowed.set(keys.admin, `admin account for ${host.id} (default ${ADMIN_USER})`);
  }
  for (const name of project.manifest.env.values) allowed.set(valueKey(name), `env.values ${name}`);
  return allowed;
}

export interface EnvFile {
  path: string;
  values: Map<string, string>;
  /** Line numbers of every INFRA_* name, for problems. */
  lines: Map<string, number>;
}

/** Parses KEY=value lines: comments and blank lines skipped, one level of matching quotes removed. */
export function parseEnv(text: string, path: string): EnvFile {
  const values = new Map<string, string>();
  const lines = new Map<string, number>();
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) throw new InfraError(`${path}:${index + 1}: not a KEY=value line`);
    let value = match[2]!.trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0]!)) value = value.slice(1, -1);
    values.set(match[1]!, value);
    lines.set(match[1]!, index + 1);
  });
  return { path, values, lines };
}

export function readEnvFile(path: string): EnvFile | undefined {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8'), path) : undefined;
}

/** Contract problems of one env file (the example or the live file). */
export function envProblems(project: Project, file: EnvFile): string[] {
  const allowed = allowedKeys(project);
  const problems: string[] = [];
  for (const [key, line] of file.lines) {
    if (!key.startsWith(PREFIX)) continue;
    const where = `${file.path}:${line}`;
    if (SECRET_LIKE.test(key) && key !== IDENTITY_FILE) {
      problems.push(`${where}: ${key} looks like a secret; secrets never live in the operator env file`);
    } else if (!allowed.has(key)) {
      problems.push(`${where}: ${key} is not a name this project declares (hosts, ${ADMIN_USER}, ${IDENTITY_FILE}, env.values)`);
    }
  }
  return problems;
}

export interface Connection {
  address: string | undefined;
  port: number;
  /** undefined: the admin the project's group_vars declare. */
  admin: string | undefined;
}

export function loadEnv(project: Project): EnvFile {
  const path = join(project.root, project.manifest.env.file);
  const file = readEnvFile(path) ?? { path, values: new Map(), lines: new Map() };
  const problems = envProblems(project, file);
  if (problems.length > 0) throw new InfraError(`operator env file refused:\n  ${problems.join('\n  ')}`);
  return file;
}

export function connection(file: EnvFile, host: Host): Connection {
  const keys = hostKeys(host.id);
  const address = file.values.get(keys.address) || undefined;
  if (address !== undefined && !/^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(address)) {
    throw new InfraError(`${keys.address} is not a host name or address`);
  }
  const portText = file.values.get(keys.port) || '22';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new InfraError(`${keys.port} is not a port`);
  const admin = file.values.get(keys.admin) || file.values.get(ADMIN_USER) || undefined;
  if (admin !== undefined && !/^[a-z_][a-z0-9_-]{0,31}$/.test(admin)) throw new InfraError(`the admin account in the env file is not an account name`);
  return { address, port, admin };
}

/** Extra declared values, exposed to Ansible as infra_env.<NAME>. */
export function declaredValues(project: Project, file: EnvFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of project.manifest.env.values) {
    const value = file.values.get(valueKey(name));
    if (value !== undefined && value !== '') out[name] = value;
  }
  return out;
}
