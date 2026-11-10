import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { InfraError, isWindows } from './util.ts';

/**
 * The operator's `dev` shortcut: `dev <target> [verb]` is `infra connect <target> [verb]`. On Windows it is a marked
 * block in the profiles of Windows PowerShell and PowerShell 7; a re-run rewrites the block, an unmanaged `dev` is
 * never replaced. Blocks of the per-repository installers this replaces are removed.
 */
const START = '# BEGIN infra dev';
const END = '# END infra dev';
const BLOCK = `${START}\r\nfunction global:dev { infra connect @args }\r\n${END}\r\n`;
/** Managed blocks of the per-repository dev commands the CLI replaced; each ran a script that no longer exists. */
const RETIRED = [
  ['# BEGIN tomis-agents dev', '# END tomis-agents dev'],
  ['# BEGIN tradintek-tomis dev', '# END tradintek-tomis dev'],
] as const;

function blockPattern(start: string, end: string): RegExp {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escape(start)}\\r?\\n[\\s\\S]*?^${escape(end)}\\r?\\n?`, 'gm');
}

/** The profile text with the shortcut current; throws on a malformed block or an unmanaged dev. */
export function withShortcut(content: string, where: string): string {
  let text = content;
  for (const [start, end] of [...RETIRED, [START, END] as const]) {
    const found = text.match(blockPattern(start, end)) ?? [];
    if ((text.includes(start) || text.includes(end)) && found.length !== 1) throw new InfraError(`malformed managed block '${start}' in ${where}`);
  }
  for (const [start, end] of RETIRED) text = text.replace(blockPattern(start, end), '');
  // An unmarked earlier install that only ran a repository's dev.ps1.
  text = text.replace(/^function\s+global:dev\s*\{\s*&\s*'[^'\r\n]*[\\/]dev\.ps1'\s+@args\s*\}[ \t]*\r?\n?/gm, '');
  const unmanaged = text.replace(blockPattern(START, END), '');
  if (/(function\s+(global:)?dev(?![\w-])|(?:Set-Alias|New-Alias)\s+(?:-Name\s+)?dev(?![\w-]))/im.test(unmanaged)) {
    throw new InfraError(`an unmanaged dev command exists in ${where}; refusing to replace it`);
  }
  if (blockPattern(START, END).test(text)) return text.replace(blockPattern(START, END), () => BLOCK);
  const body = text.replace(/\s+$/, '');
  return body === '' ? BLOCK : `${body}\r\n${BLOCK}`;
}

/** The two PowerShell profile files: INFRA_PROFILE_DIR for tests, else the user's Documents folder. */
export function profilePaths(): string[] {
  let documents = process.env.INFRA_PROFILE_DIR;
  if (!documents) {
    try {
      // MyDocuments may be redirected (OneDrive); PowerShell resolves it the way it loads profiles.
      documents = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('MyDocuments')"], { encoding: 'utf8' }).trim();
    } catch {
      documents = join(homedir(), 'Documents');
    }
  }
  return ['WindowsPowerShell', 'PowerShell'].map((edition) => join(documents!, edition, 'profile.ps1'));
}

/** Installs or refreshes the shortcut; returns the profiles it changed. */
export function installShortcut(): string[] {
  if (!isWindows && !process.env.INFRA_PROFILE_DIR) return [];
  const changed: string[] = [];
  for (const path of profilePaths()) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new InfraError(`${path} is a symbolic link; refused`);
    const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const updated = withShortcut(content, path);
    if (updated !== content) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, updated);
      changed.push(path);
    }
  }
  return changed;
}
