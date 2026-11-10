import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, parseDocument, type Document } from 'yaml';
import { hostKeys } from './env.ts';
import { CLASSES, MANIFEST, findHost, type HostClass, type Project } from './manifest.ts';
import { InfraError, note } from './util.ts';

function editManifest(project: Project, change: (document: Document) => void): void {
  const path = join(project.root, MANIFEST);
  const document = parseDocument(readFileSync(path, 'utf8'));
  change(document);
  writeFileSync(path, document.toString({ lineWidth: 0 }));
}

function editExample(project: Project, change: (lines: string[]) => string[]): void {
  const path = join(project.root, project.manifest.env.example);
  const lines = existsSync(path) ? readFileSync(path, 'utf8').replace(/\n$/, '').split('\n') : [];
  writeFileSync(path, change(lines).join('\n') + '\n');
}

export interface AddOptions {
  class: string;
  provider?: string;
  roles: string[];
}

/** Declares a planned host: manifest entry, a host_vars file to fill, and its address name in the env example. */
export function addHost(project: Project, id: string, options: AddOptions): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new InfraError('host ids are lowercase kebab-case');
  if (project.manifest.hosts.some((host) => host.id === id)) throw new InfraError(`host ${id} is already declared`);
  if (!CLASSES.includes(options.class as HostClass)) throw new InfraError(`--class must be one of ${CLASSES.join(', ')}`);
  editManifest(project, (document) => {
    const entry: Record<string, unknown> = { class: options.class };
    if (options.provider) entry.provider = options.provider;
    entry.status = 'planned';
    if (options.roles.length > 0) entry.roles = options.roles;
    document.setIn(['hosts', id], document.createNode(entry));
  });
  const vars = join(project.ansibleDir, 'host_vars', `${id}.yml`);
  if (!existsSync(vars)) {
    mkdirSync(join(project.ansibleDir, 'host_vars'), { recursive: true });
    writeFileSync(vars, `---\n# Desired state of ${id}: the variables of its roles (infra.yaml lists the roles).\n`);
  }
  const key = hostKeys(id).address;
  editExample(project, (lines) => (lines.some((line) => line.startsWith(`${key}=`)) ? lines : [...lines, `${key}=`]));
  note(`declared ${id} (planned): fill ansible/host_vars/${id}.yml, set ${key} in ${project.manifest.env.file}, then 'infra trust' and 'infra apply ${id} --first-apply'`);
}

/** After a planned host's first apply succeeded: it is active from now on. */
export function activateHost(project: Project, id: string): void {
  editManifest(project, (document) => document.setIn(['hosts', id, 'status'], 'active'));
  note(`${id} is active in ${MANIFEST}; commit it with the host's observed state`);
}

/** Keeps the record of a host that no longer runs; its runs are refused from now on. */
export function retireHost(project: Project, id: string): void {
  findHost(project, id);
  editManifest(project, (document) => document.setIn(['hosts', id, 'status'], 'retired'));
  note(`${id} is retired; its observed state stays as the last record`);
}

/** Removes a host that was never built or is retired: manifest entry, host_vars and env example name. */
export function removeHost(project: Project, id: string): void {
  const host = findHost(project, id);
  if (host.status === 'active') throw new InfraError(`${id} is active; retire it first`);
  const targets = project.manifest.connect.filter((target) => target.host === id).map((target) => target.name);
  if (targets.length > 0) throw new InfraError(`connect targets ${targets.join(', ')} name ${id}; remove them first`);
  editManifest(project, (document) => {
    const hosts = document.get('hosts');
    if (isMap(hosts)) hosts.delete(id);
  });
  rmSync(join(project.ansibleDir, 'host_vars', `${id}.yml`), { force: true });
  const keys = Object.values(hostKeys(id));
  editExample(project, (lines) => lines.filter((line) => !keys.some((key) => line.startsWith(`${key}=`))));
  note(`removed ${id}`);
}
