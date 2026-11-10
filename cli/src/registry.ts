import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadProject, MANIFEST, type ConnectTarget, type Project } from './manifest.ts';
import { InfraError, findUp, isWindows } from './util.ts';

/**
 * The operator's linked projects, so `infra connect <target>` works from any directory. Per workstation,
 * outside every repository: project name -> project root.
 */
export function registryPath(): string {
  if (process.env.INFRA_CONFIG_DIR) return join(process.env.INFRA_CONFIG_DIR, 'projects.json');
  const base = isWindows ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')) : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'));
  return join(base, 'infra', 'projects.json');
}

export function readRegistry(): Record<string, string> {
  const path = registryPath();
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new InfraError(`${path} is not a JSON object`);
  return parsed as Record<string, string>;
}

function writeRegistry(entries: Record<string, string>): void {
  const path = registryPath();
  mkdirSync(dirname(path), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n');
}

export function link(project: Project): void {
  const entries = readRegistry();
  const existing = entries[project.manifest.project];
  if (existing && resolve(existing) !== resolve(project.root) && existsSync(join(existing, MANIFEST))) {
    throw new InfraError(`project ${project.manifest.project} is already linked to ${existing}; unlink it there first`);
  }
  entries[project.manifest.project] = project.root;
  writeRegistry(entries);
}

export function unlink(name: string): boolean {
  const entries = readRegistry();
  if (!(name in entries)) return false;
  delete entries[name];
  writeRegistry(entries);
  return true;
}

/** The current project's target of that name, else the one linked project that declares it. */
export function findTarget(name: string, cwd = process.cwd()): { project: Project; target: ConnectTarget } {
  if (findUp(cwd, MANIFEST)) {
    const project = loadProject(cwd);
    const target = project.manifest.connect.find((item) => item.name === name);
    if (target) return { project, target };
  }
  const matches: { project: Project; target: ConnectTarget }[] = [];
  for (const [linked, root] of Object.entries(readRegistry())) {
    if (!existsSync(join(root, MANIFEST))) continue;
    const project = loadProject(root);
    if (project.manifest.project !== linked) continue;
    const target = project.manifest.connect.find((item) => item.name === name);
    if (target) matches.push({ project, target });
  }
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new InfraError(`target ${name} exists in ${matches.map((m) => m.project.manifest.project).join(' and ')}; run it from the project`);
  throw new InfraError(`no connect target '${name}' in this project or a linked one ('infra link' in a project links it)`);
}
