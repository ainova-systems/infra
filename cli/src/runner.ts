import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bundle } from './generate.ts';
import type { Lock } from './lock.ts';
import { InfraError, isWindows, toLinuxPath, warn } from './util.ts';

/** runner/runner.sh, beside dist/ in the package and beside src/ in the checkout. */
export const RUNNER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'runner', 'runner.sh');

export interface RunRequest {
  mode: 'playbook' | 'syntax' | 'trust';
  lock?: Lock;
  bundle?: Bundle;
  ansibleDir?: string;
  playbook?: string;
  identityFile?: string;
  args?: string[];
  /** Further variables for the runner, by name; secrets travel only this way. */
  env?: Record<string, string>;
  /** Capture stdout instead of streaming it (trust). */
  capture?: boolean;
}

export interface RunResult {
  code: number;
  stdout: string;
}

/** The path form the runner needs: Linux paths under WSL on Windows, unchanged on Linux. */
export function linuxPath(path: string): string {
  return isWindows ? toLinuxPath(path) : path;
}

/**
 * Starts runner.sh with every value in its environment. On Windows it runs in WSL: WSLENV forwards exactly
 * the names set here, so a value never appears on a command line, and paths are converted beforehand.
 */
export async function runRunner(request: RunRequest): Promise<RunResult> {
  const variables: Record<string, string> = { INFRA_MODE: request.mode, ...(request.env ?? {}) };
  const sourceDir = process.env.INFRA_SOURCE_DIR;
  if (request.mode !== 'trust') {
    if (sourceDir) {
      warn(`INFRA_SOURCE_DIR is set: running the local checkout ${sourceDir}, not the locked source`);
      variables.INFRA_SOURCE_DIR = linuxPath(resolve(sourceDir));
    } else if (request.lock) {
      variables.INFRA_SOURCE_URL = request.lock.url;
      variables.INFRA_SOURCE_COMMIT = request.lock.commit;
    } else {
      throw new InfraError("infra.lock is missing; run 'infra update'");
    }
  }
  if (process.env.INFRA_CACHE) variables.INFRA_CACHE = process.env.INFRA_CACHE;
  if (request.ansibleDir) variables.INFRA_ANSIBLE_DIR = linuxPath(request.ansibleDir);
  if (request.playbook) variables.INFRA_PLAYBOOK = request.playbook;
  if (request.identityFile) variables.INFRA_SSH_IDENTITY_FILE = linuxPath(request.identityFile);

  let bundleDir: string | undefined;
  if (request.bundle) {
    bundleDir = mkdtempSync(join(tmpdir(), 'infra-bundle-'));
    for (const [name, content] of request.bundle.files) writeFileSync(join(bundleDir, name), content);
    variables.INFRA_BUNDLE = linuxPath(bundleDir);
  }

  const args = request.args ?? [];
  let command: string;
  let argv: string[];
  const env: NodeJS.ProcessEnv = { ...process.env, ...variables };
  if (isWindows) {
    command = 'wsl.exe';
    const distro = process.env.INFRA_WSL_DISTRO;
    argv = [...(distro ? ['-d', distro] : []), '-e', 'bash', linuxPath(RUNNER), ...args];
    const forwarded = Object.keys(variables).map((name) => `${name}/u`);
    env.WSLENV = [process.env.WSLENV, ...forwarded].filter(Boolean).join(':');
  } else {
    command = 'bash';
    argv = [RUNNER, ...args];
  }

  try {
    return await new Promise<RunResult>((done, failed) => {
      const child = spawn(command, argv, { env, stdio: ['inherit', request.capture ? 'pipe' : 'inherit', 'inherit'] });
      let stdout = '';
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.on('error', (error) => failed(new InfraError(`cannot start ${command}: ${error.message}${isWindows ? ' (is WSL installed?)' : ''}`)));
      child.on('close', (code, signal) => done({ code: code ?? (signal ? 130 : 1), stdout }));
    });
  } finally {
    if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
  }
}
