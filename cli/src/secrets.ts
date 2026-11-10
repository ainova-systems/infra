import { execFileSync } from 'node:child_process';
import type { Host, Project, RunKind } from './manifest.ts';
import { InfraError, note } from './util.ts';

/** Reads one line from the terminal without echoing it. */
export function promptHidden(label: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return Promise.reject(new InfraError(`${label} must be typed at a terminal`));
  return new Promise((done, failed) => {
    process.stderr.write(`${label}: `);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stderr.write('\n');
      if (error) failed(error);
      else done(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new InfraError('cancelled', 130));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

/** The host's declared run-time secrets for this run: from the environment, else typed without echo. Never printed. */
export async function hostSecrets(host: Host, kind: RunKind): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const { name } of host.secrets.filter((secret) => secret.runs.includes(kind))) {
    const value = process.env[name] || (await promptHidden(name));
    if (!value) throw new InfraError(`${name} is empty`);
    out[name] = value;
  }
  return out;
}

/** owner/name of the project's origin on GitHub, or undefined. */
export function originRepository(project: Project): string | undefined {
  try {
    const url = execFileSync('git', ['-C', project.root, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Short-lived runner registration and removal tokens for an apply of a host with github_actions_runner,
 * created by the operator's authenticated gh for the project's origin repository. They reach the run only
 * through its environment. Missing gh or rights leaves them unset; the role then prompts or fails.
 */
export function runnerTokens(project: Project): Record<string, string> {
  const repository = originRepository(project);
  if (!repository) return {};
  const out: Record<string, string> = {};
  for (const [kind, name] of [
    ['registration', 'GITHUB_ACTIONS_RUNNER_REGISTRATION_TOKEN'],
    ['remove', 'GITHUB_ACTIONS_RUNNER_REMOVAL_TOKEN'],
  ] as const) {
    if (process.env[name]) {
      out[name] = process.env[name]!;
      continue;
    }
    try {
      const token = execFileSync('gh', ['api', '-X', 'POST', `repos/${repository}/actions/runners/${kind}-token`, '--jq', '.token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (token) out[name] = token;
    } catch {
      note(`gh could not create a runner ${kind} token for ${repository}`);
    }
  }
  return out;
}
