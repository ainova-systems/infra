import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';

/** An expected failure: printed without a stack trace, exit code 2 unless stated. */
export class InfraError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

export const isWindows = process.platform === 'win32';

export function note(message: string): void {
  process.stderr.write(`infra: ${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`infra: warning: ${message}\n`);
}

/** Parses YAML strictly: duplicate keys and syntax errors fail with the file named. */
export function readYaml(path: string): unknown {
  const text = readFileSync(path, 'utf8');
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length > 0) {
    throw new InfraError(`${path}: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  return document.toJS({ maxAliasCount: 50 });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walks up from start to the first directory that holds the file. */
export function findUp(start: string, file: string): string | undefined {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, file))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** The environment-variable form of an id: dev-ubuntu-01 -> DEV_UBUNTU_01. */
export function envName(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/** A path as Linux under WSL sees it: D:\a\b -> /mnt/d/a/b. Linux paths pass unchanged. */
export function toLinuxPath(path: string, mountRoot = process.env.INFRA_WSL_MOUNT_ROOT ?? '/mnt'): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(path);
  if (!match) return path.replace(/\\/g, '/');
  const [, drive, rest] = match;
  return `${mountRoot.replace(/\/$/, '')}/${drive!.toLowerCase()}/${rest!.replace(/\\/g, '/')}`;
}

/** A WSL drive path as Windows sees it: /mnt/c/a -> C:\a. Anything else passes unchanged. */
export function toWindowsPath(path: string, mountRoot = process.env.INFRA_WSL_MOUNT_ROOT ?? '/mnt'): string {
  const root = mountRoot.replace(/\/$/, '');
  const match = new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([a-z])(?:/(.*))?$`).exec(path);
  if (!match) return path;
  return `${match[1]!.toUpperCase()}:\\${(match[2] ?? '').replace(/\//g, '\\')}`;
}

export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}
