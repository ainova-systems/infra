import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { InfraError, findUp, isRecord, readYaml } from './util.ts';

/** The manifest contract this CLI reads; a project on another contract is refused. */
export const CONTRACT = 1;
export const MANIFEST = 'infra.yaml';
export const LOCKFILE = 'infra.lock';
export const DEFAULT_SOURCE = 'https://github.com/ainova-systems/infra.git';
/** Environment classes are trust boundaries; a host belongs to exactly one. */
export const CLASSES = ['dev', 'cicd', 'preview', 'staging', 'production'] as const;
export const STATUSES = ['planned', 'active', 'retired'] as const;

export type HostClass = (typeof CLASSES)[number];
export type HostStatus = (typeof STATUSES)[number];

/** A role task file run around the roles of an apply: before (pre_tasks) or after (post_tasks). */
export interface Hook {
  role: string;
  tasksFrom: string;
  tags: string[];
}

export interface Host {
  id: string;
  class: HostClass;
  provider: string | undefined;
  status: HostStatus;
  roles: string[];
  groups: string[];
  before: Hook[];
  after: Hook[];
  secrets: string[];
  /** Observed-state file, relative to the project root. */
  observed: string;
}

export interface ConnectTarget {
  name: string;
  host: string;
  account: string;
  /** The account itself accepts the operator key; otherwise the admin connects and sudoes to it. */
  direct: boolean;
}

export interface Manifest {
  contract: number;
  project: string;
  source: { url: string; version: string };
  /** The project's Ansible directory, relative to the project root. */
  ansible: string;
  env: { file: string; example: string; values: string[] };
  hosts: Host[];
  connect: ConnectTarget[];
}

export interface Project {
  root: string;
  manifest: Manifest;
  ansibleDir: string;
}

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ROLE = /^(?:[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.)?[a-z][a-z0-9_]*$/;
const ACCOUNT = /^[a-z_][a-z0-9_-]{0,31}$/;
const ENV_VALUE = /^[A-Z][A-Z0-9_]*$/;
const RANGE = /^(?:[\^~]|>=)?\d+\.\d+\.\d+$/;

class Reader {
  readonly problems: string[] = [];

  fail(where: string, message: string): void {
    this.problems.push(`${where}: ${message}`);
  }

  keys(where: string, value: Record<string, unknown>, allowed: readonly string[]): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.fail(where, `unknown key '${key}' (allowed: ${allowed.join(', ')})`);
    }
  }

  string(where: string, value: unknown, pattern?: RegExp): string | undefined {
    if (typeof value !== 'string' || value.length === 0) {
      this.fail(where, 'must be a non-empty string');
      return undefined;
    }
    if (pattern && !pattern.test(value)) {
      this.fail(where, `'${value}' does not match ${pattern.source}`);
      return undefined;
    }
    return value;
  }

  strings(where: string, value: unknown, pattern?: RegExp): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      this.fail(where, 'must be a list');
      return [];
    }
    const out: string[] = [];
    value.forEach((item, index) => {
      const parsed = this.string(`${where}[${index}]`, item, pattern);
      if (parsed !== undefined) out.push(parsed);
    });
    if (new Set(out).size !== out.length) this.fail(where, 'lists a value twice');
    return out;
  }

  oneOf<T extends string>(where: string, value: unknown, options: readonly T[]): T | undefined {
    if (typeof value !== 'string' || !options.includes(value as T)) {
      this.fail(where, `must be one of ${options.join(', ')}`);
      return undefined;
    }
    return value as T;
  }
}

function readHooks(reader: Reader, where: string, value: unknown): Hook[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    reader.fail(where, 'must be a list');
    return [];
  }
  const hooks: Hook[] = [];
  value.forEach((item, index) => {
    const at = `${where}[${index}]`;
    if (!isRecord(item)) {
      reader.fail(at, 'must be a mapping {role, tasks_from, tags}');
      return;
    }
    reader.keys(at, item, ['role', 'tasks_from', 'tags']);
    const role = reader.string(`${at}.role`, item.role, ROLE);
    const tasksFrom = reader.string(`${at}.tasks_from`, item.tasks_from, /^[a-z][a-z0-9_]*$/);
    const tags = item.tags === undefined ? ['always'] : reader.strings(`${at}.tags`, item.tags, /^[a-z][a-z0-9_]*$/);
    if (role && tasksFrom) hooks.push({ role, tasksFrom, tags });
  });
  return hooks;
}

/** Validates the parsed manifest; every problem is collected before failing. */
export function parseManifest(raw: unknown, where = MANIFEST): Manifest {
  const reader = new Reader();
  if (!isRecord(raw)) throw new InfraError(`${where}: must be a mapping`);
  reader.keys(where, raw, ['contract', 'project', 'source', 'ansible', 'env', 'classes', 'hosts', 'connect']);

  if (raw.contract !== CONTRACT) {
    throw new InfraError(
      `${where}: contract ${String(raw.contract)} is not supported by this CLI (contract ${CONTRACT}); ` +
        (typeof raw.contract === 'number' && raw.contract > CONTRACT ? 'upgrade the CLI' : 'set contract: 1'),
    );
  }
  const project = reader.string('project', raw.project, ID) ?? '';

  let source = { url: DEFAULT_SOURCE, version: '' };
  if (!isRecord(raw.source)) {
    reader.fail('source', 'must be a mapping {url, version}');
  } else {
    reader.keys('source', raw.source, ['url', 'version']);
    const url = raw.source.url === undefined ? DEFAULT_SOURCE : reader.string('source.url', raw.source.url, /^https:\/\/\S+$/);
    const version = reader.string('source.version', raw.source.version, RANGE);
    source = { url: url ?? DEFAULT_SOURCE, version: version ?? '' };
  }

  const ansible = raw.ansible === undefined ? 'ansible' : (reader.string('ansible', raw.ansible, /^[^\s]+$/) ?? 'ansible');

  let env = { file: '.env', example: '.env.example', values: [] as string[] };
  if (raw.env !== undefined) {
    if (!isRecord(raw.env)) {
      reader.fail('env', 'must be a mapping {file, example, values}');
    } else {
      reader.keys('env', raw.env, ['file', 'example', 'values']);
      const file = raw.env.file === undefined ? '.env' : (reader.string('env.file', raw.env.file) ?? '.env');
      const example =
        raw.env.example === undefined ? `${file}.example` : (reader.string('env.example', raw.env.example) ?? `${file}.example`);
      env = { file, example, values: reader.strings('env.values', raw.env.values, ENV_VALUE) };
    }
  }

  const classRoles = new Map<string, { roles: string[]; groups: string[] }>();
  if (raw.classes !== undefined) {
    if (!isRecord(raw.classes)) {
      reader.fail('classes', 'must be a mapping of class -> {roles, groups}');
    } else {
      for (const [name, spec] of Object.entries(raw.classes)) {
        const at = `classes.${name}`;
        if (!CLASSES.includes(name as HostClass)) reader.fail(at, `unknown class (classes: ${CLASSES.join(', ')})`);
        if (!isRecord(spec)) {
          reader.fail(at, 'must be a mapping {roles, groups}');
          continue;
        }
        reader.keys(at, spec, ['roles', 'groups']);
        classRoles.set(name, {
          roles: reader.strings(`${at}.roles`, spec.roles, ROLE),
          groups: reader.strings(`${at}.groups`, spec.groups, ID),
        });
      }
    }
  }

  const hosts: Host[] = [];
  if (raw.hosts !== undefined && raw.hosts !== null && !isRecord(raw.hosts)) {
    reader.fail('hosts', 'must map host ids to their declarations');
  } else if (isRecord(raw.hosts)) {
    for (const [id, spec] of Object.entries(raw.hosts)) {
      const at = `hosts.${id}`;
      if (!ID.test(id)) reader.fail(at, 'host ids are lowercase kebab-case');
      if (!isRecord(spec)) {
        reader.fail(at, 'must be a mapping');
        continue;
      }
      reader.keys(at, spec, ['class', 'provider', 'status', 'roles', 'groups', 'before', 'after', 'secrets', 'observed']);
      const hostClass = reader.oneOf(`${at}.class`, spec.class, CLASSES);
      const status = reader.oneOf(`${at}.status`, spec.status, STATUSES);
      const provider = spec.provider === undefined ? undefined : reader.string(`${at}.provider`, spec.provider, ID);
      const defaults = hostClass ? classRoles.get(hostClass) : undefined;
      const roles = spec.roles === undefined ? (defaults?.roles ?? []) : reader.strings(`${at}.roles`, spec.roles, ROLE);
      if (roles.length === 0) reader.fail(`${at}.roles`, 'lists no role, and its class declares none');
      const groups = [...(defaults?.groups ?? []), ...reader.strings(`${at}.groups`, spec.groups, ID)];
      for (const group of groups) {
        if (CLASSES.includes(group as HostClass)) reader.fail(`${at}.groups`, `'${group}' is a class, not a group`);
      }
      const observed =
        spec.observed === undefined ? `${ansible}/observed/${id}.md` : (reader.string(`${at}.observed`, spec.observed) ?? '');
      if (hostClass && status) {
        hosts.push({
          id,
          class: hostClass,
          provider,
          status,
          roles,
          groups,
          before: readHooks(reader, `${at}.before`, spec.before),
          after: readHooks(reader, `${at}.after`, spec.after),
          secrets: reader.strings(`${at}.secrets`, spec.secrets, ENV_VALUE),
          observed,
        });
      }
    }
  }

  const connect: ConnectTarget[] = [];
  if (raw.connect !== undefined) {
    if (!isRecord(raw.connect)) {
      reader.fail('connect', 'must map target names to {host, account, direct}');
    } else {
      for (const [name, spec] of Object.entries(raw.connect)) {
        const at = `connect.${name}`;
        if (!ID.test(name)) reader.fail(at, 'target names are lowercase kebab-case');
        if (!isRecord(spec)) {
          reader.fail(at, 'must be a mapping {host, account, direct}');
          continue;
        }
        reader.keys(at, spec, ['host', 'account', 'direct']);
        const host = reader.string(`${at}.host`, spec.host, ID);
        const account = reader.string(`${at}.account`, spec.account, ACCOUNT);
        if (spec.direct !== undefined && typeof spec.direct !== 'boolean') reader.fail(`${at}.direct`, 'must be true or false');
        if (host && !(isRecord(raw.hosts) && host in raw.hosts)) {
          reader.fail(`${at}.host`, `'${host}' is not a declared host`);
        }
        if (host && account) connect.push({ name, host, account, direct: spec.direct === true });
      }
    }
  }

  if (reader.problems.length > 0) {
    throw new InfraError(`${where} is invalid:\n  ${reader.problems.join('\n  ')}`);
  }
  return { contract: CONTRACT, project, source, ansible, env, hosts, connect };
}

/** Finds the project from a directory (or its parents) and reads its manifest. */
export function loadProject(start: string = process.cwd()): Project {
  const root = findUp(start, MANIFEST);
  if (!root) throw new InfraError(`no ${MANIFEST} in ${start} or its parents; run 'infra init' in the project root`);
  const manifest = parseManifest(readYaml(join(root, MANIFEST)), join(root, MANIFEST));
  const ansibleDir = join(root, manifest.ansible);
  if (!existsSync(ansibleDir)) throw new InfraError(`${MANIFEST}: ansible directory '${manifest.ansible}' does not exist`);
  return { root, manifest, ansibleDir };
}

export function findHost(project: Project, id: string): Host {
  const host = project.manifest.hosts.find((item) => item.id === id);
  if (!host) {
    throw new InfraError(`unknown host '${id}'; declared: ${project.manifest.hosts.map((item) => item.id).join(', ')}`);
  }
  return host;
}

/** A role name as Ansible resolves it: the project's own role, else the collection's. */
export function qualifyRole(project: Project, role: string): string {
  if (role.includes('.')) return role;
  if (existsSync(join(project.ansibleDir, 'roles', role))) return role;
  return `ainova.infra.${role}`;
}
