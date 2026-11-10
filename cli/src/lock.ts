import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCKFILE, type Project } from './manifest.ts';
import { InfraError, isRecord, readYaml } from './util.ts';

export const LOCK_VERSION = 1;

/** What a run executes: the source repository at one commit. `version` is the tag, or a ref when pinned by hand. */
export interface Lock {
  url: string;
  version: string;
  commit: string;
}

type Semver = [number, number, number];

export function parseVersion(text: string): Semver | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

export function compareVersions(a: Semver, b: Semver): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** ^1.2.3 (same major; same minor below 1.0), ~1.2.3 (same minor), >=1.2.3, or exact 1.2.3. */
export function satisfies(version: string, range: string): boolean {
  const got = parseVersion(version);
  const match = /^(\^|~|>=)?(\d+\.\d+\.\d+)$/.exec(range);
  if (!got || !match) return false;
  const want = parseVersion(match[2]!)!;
  if (compareVersions(got, want) < 0) return false;
  switch (match[1]) {
    case '>=':
      return true;
    case '~':
      return got[0] === want[0] && got[1] === want[1];
    case '^':
      return want[0] > 0 ? got[0] === want[0] : got[0] === 0 && got[1] === want[1];
    default:
      return compareVersions(got, want) === 0;
  }
}

export function lockPath(project: Project): string {
  return join(project.root, LOCKFILE);
}

export function readLock(project: Project): Lock | undefined {
  const path = lockPath(project);
  if (!existsSync(path)) return undefined;
  const raw = readYaml(path);
  if (!isRecord(raw) || raw.lock_version !== LOCK_VERSION || !isRecord(raw.source)) {
    throw new InfraError(`${LOCKFILE}: not a lock_version ${LOCK_VERSION} lock; run 'infra update'`);
  }
  const { url, version, commit } = raw.source;
  if (typeof url !== 'string' || typeof version !== 'string' || typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new InfraError(`${LOCKFILE}: source must hold url, version and a 40-character commit; run 'infra update'`);
  }
  return { url, version, commit };
}

/** The lock must name the manifest's source and a version its range accepts (or a hand-pinned ref). */
export function lockProblems(project: Project, lock: Lock | undefined): string[] {
  if (!lock) return [`${LOCKFILE} is missing; run 'infra update'`];
  const problems: string[] = [];
  const { url, version } = project.manifest.source;
  if (lock.url !== url) problems.push(`${LOCKFILE} names ${lock.url}, ${'infra.yaml'} names ${url}; run 'infra update'`);
  if (parseVersion(lock.version) && !satisfies(lock.version, version)) {
    problems.push(`${LOCKFILE} pins ${lock.version}, outside source.version ${version}; run 'infra update'`);
  }
  return problems;
}

export function writeLock(project: Project, lock: Lock): void {
  const text = [
    '# Written by `infra update`: the exact source every run of this project executes. Do not edit.',
    `lock_version: ${LOCK_VERSION}`,
    'source:',
    `  url: ${lock.url}`,
    `  version: "${lock.version}"`,
    `  commit: "${lock.commit}"`,
    '',
  ].join('\n');
  writeFileSync(lockPath(project), text);
}

export interface RemoteRef {
  name: string;
  commit: string;
}

/** Tags and branches of the source, peeled to commits. */
export function listRemote(url: string): { tags: RemoteRef[]; heads: RemoteRef[] } {
  let output: string;
  try {
    output = execFileSync('git', ['ls-remote', '--tags', '--heads', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new InfraError(`git ls-remote ${url} failed: ${(error as Error).message.split('\n')[0]}`);
  }
  const tags = new Map<string, string>();
  const heads: RemoteRef[] = [];
  for (const line of output.split('\n')) {
    const [commit, ref] = line.trim().split(/\s+/);
    if (!commit || !ref) continue;
    if (ref.startsWith('refs/heads/')) heads.push({ name: ref.slice('refs/heads/'.length), commit });
    if (ref.startsWith('refs/tags/')) {
      const name = ref.slice('refs/tags/'.length);
      // An annotated tag lists its own object and the peeled commit (^{}); the commit wins.
      if (name.endsWith('^{}')) tags.set(name.slice(0, -3), commit);
      else if (!tags.has(name)) tags.set(name, commit);
    }
  }
  return { tags: [...tags].map(([name, commit]) => ({ name, commit })), heads };
}

/** The newest release tag the range accepts. */
export function pickTag(tags: RemoteRef[], range: string): RemoteRef | undefined {
  return tags
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag.name) && satisfies(tag.name, range))
    .sort((a, b) => compareVersions(parseVersion(b.name)!, parseVersion(a.name)!))[0];
}
