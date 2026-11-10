import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { envProblems, readEnvFile } from './env.ts';
import { lockProblems, readLock } from './lock.ts';
import { CLASSES, type Project } from './manifest.ts';
import { isRecord, readYaml } from './util.ts';

export interface Findings {
  errors: string[];
  warnings: string[];
}

/** Files a project no longer keeps: the CLI generates or replaces each of them. */
const GENERATED = ['site.yml', 'check.yml', 'inventory.yml', 'ansible.cfg', 'run.sh', 'requirements.yml', 'requirements.txt'];
/** Connection values come from the operator env file through the generated inventory, never from variables. */
const CONNECTION_KEYS = ['ansible_host', 'ansible_port', 'ansible_user', 'ansible_ssh_host', 'ansible_ssh_port', 'ansible_ssh_user'];
const ENV_LOOKUP = /\b(?:lookup|query)\(\s*['"](?:ansible\.builtin\.)?env['"]/;
const RELATIVE_ROOT = /\b(?:playbook_dir|inventory_dir)\b/;

function yamlFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return /\.ya?ml$/.test(path) ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => yamlFiles(join(path, entry.name)));
}

/** Variable files of one group_vars/host_vars entry: <name>.yml, <name>.yaml or a <name>/ directory. */
function varFiles(dir: string, name: string): string[] {
  return [join(dir, `${name}.yml`), join(dir, `${name}.yaml`), join(dir, name)].flatMap(yamlFiles);
}

function entryNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) => name.replace(/\.ya?ml$/, ''));
}

function topKeys(path: string): Record<string, unknown> {
  try {
    const parsed = readYaml(path);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function validateProject(project: Project): Findings {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { manifest, root, ansibleDir } = project;
  const rel = (path: string) => relative(root, path).replace(/\\/g, '/');

  errors.push(...lockProblems(project, readLock(project)));

  for (const name of GENERATED) {
    if (existsSync(join(ansibleDir, name))) errors.push(`${rel(join(ansibleDir, name))}: the infra CLI generates or replaces this file; remove it`);
  }

  // Host files: variables for every declared host, a dated observed state for every active one, and no orphans.
  const hostVarsDir = join(ansibleDir, 'host_vars');
  const declared = new Set(manifest.hosts.map((host) => host.id));
  for (const host of manifest.hosts) {
    if (varFiles(hostVarsDir, host.id).length === 0) errors.push(`${host.id}: no ${rel(hostVarsDir)}/${host.id}.yml`);
    const observed = join(root, host.observed);
    if (host.status === 'active') {
      if (!existsSync(observed)) errors.push(`${host.id}: active, but its observed state ${host.observed} does not exist`);
      else if (!/\b20\d\d-\d\d-\d\d\b/.test(readFileSync(observed, 'utf8'))) errors.push(`${host.observed}: observed state carries no date`);
    }
    for (const role of [...host.roles, ...host.before.map((hook) => hook.role), ...host.after.map((hook) => hook.role)]) {
      if (!role.includes('.') && existsSync(join(ansibleDir, 'roles', role)) && !existsSync(join(ansibleDir, 'roles', role, 'tasks'))) {
        errors.push(`${host.id}: project role '${role}' has no tasks/ directory`);
      }
    }
  }
  for (const name of entryNames(hostVarsDir)) {
    if (!declared.has(name)) errors.push(`${rel(hostVarsDir)}/${name}: no host '${name}' in infra.yaml`);
  }

  const groups = new Set<string>(['all', ...manifest.hosts.flatMap((host) => [host.class, ...host.groups])]);
  const groupVarsDir = join(ansibleDir, 'group_vars');
  for (const name of entryNames(groupVarsDir)) {
    if (!groups.has(name)) {
      const message = `${rel(groupVarsDir)}/${name}: no host is in group '${name}'`;
      if (CLASSES.includes(name as never)) warnings.push(message);
      else errors.push(message);
    }
  }

  // Variables: no operator env lookups, no paths relative to a playbook, no connection values, no status.
  const variableFiles = [...yamlFiles(groupVarsDir), ...yamlFiles(hostVarsDir)];
  for (const file of variableFiles) {
    const text = readFileSync(file, 'utf8');
    if (ENV_LOOKUP.test(text)) errors.push(`${rel(file)}: reads the environment; declare the value in env.values and read infra_env.<NAME>`);
    if (RELATIVE_ROOT.test(text)) errors.push(`${rel(file)}: uses playbook_dir or inventory_dir; use infra_project_root`);
    const keys = topKeys(file);
    for (const key of CONNECTION_KEYS) {
      if (key in keys) errors.push(`${rel(file)}: sets ${key}; connection values come from the operator env file`);
    }
    if ('host_status' in keys) errors.push(`${rel(file)}: sets host_status; status is declared in infra.yaml`);
  }
  // Project playbooks too; a role may still read a run-time secret from its environment.
  for (const name of projectPlaybooks(project)) {
    const file = join(ansibleDir, name);
    if (ENV_LOOKUP.test(readFileSync(file, 'utf8'))) {
      errors.push(`${rel(file)}: reads the environment; declare the value in env.values and read infra_env.<NAME>`);
    }
  }

  // The operator env contract: the example always, the live file when present, and the live file ignored by Git.
  const example = readEnvFile(join(root, manifest.env.example));
  if (!example) errors.push(`${manifest.env.example} is missing: it documents every operator env name the project uses`);
  else errors.push(...envProblems(project, example));
  const live = readEnvFile(join(root, manifest.env.file));
  if (live) errors.push(...envProblems(project, live));
  if (!gitIgnored(root, manifest.env.file)) errors.push(`${manifest.env.file} is not ignored by Git; it holds operator addresses`);
  for (const name of manifest.env.values) {
    if (/(TOKEN|PASSWORD|SECRET|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_KEY)/.test(name)) {
      errors.push(`env.values ${name} looks like a secret; secrets are host secrets, typed at run time`);
    }
  }

  // Connect targets: a direct login needs the account to accept the operator key.
  for (const target of manifest.connect) {
    if (!target.direct) continue;
    const accounts = varFiles(hostVarsDir, target.host).flatMap((file) => {
      const value = topKeys(file).dev_workstation_accounts;
      return Array.isArray(value) ? value : [];
    });
    const account = accounts.find((item) => isRecord(item) && item.name === target.account);
    if (accounts.length > 0 && !(isRecord(account) && account.authorized_keys !== undefined)) {
      errors.push(`connect.${target.name}: direct, but ${target.account} declares no authorized_keys in host_vars/${target.host}`);
    }
  }

  return { errors, warnings };
}

/** The project's own playbooks: every YAML file at the top of its Ansible directory. */
export function projectPlaybooks(project: Project): string[] {
  return readdirSync(project.ansibleDir)
    .filter((name) => /\.ya?ml$/.test(name) && !GENERATED.includes(name))
    .sort();
}

function gitIgnored(root: string, path: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', path], { stdio: 'ignore' });
    return true;
  } catch (error) {
    // Exit 1: not ignored. Anything else (no Git, not a repository): nothing to judge.
    return (error as { status?: number }).status !== 1;
  }
}
